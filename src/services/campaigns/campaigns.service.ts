import {
  launchCampaignSchema,
  type LaunchCampaignInput,
} from "@/schemas/campaigns";
import { getCurrentUser } from "@/repositories/auth.repository";
import * as businessRepository from "@/repositories/business.repository";
import * as campaignsRepository from "@/repositories/campaigns.repository";
import * as whatsappRepository from "@/repositories/whatsapp.repository";
import { mapTemplateRow } from "@/repositories/templates.repository";
import * as businessService from "@/services/business/business.service";
import { evaluateSegmentMembership } from "@/services/segmentation/segments.service";
import { previewTemplateContent } from "@/lib/templates/preview";
import { sendWhatsAppTemplateMessage } from "@/services/whatsapp/send-template.service";
import type { Campaign } from "@/types/campaigns";
import type { Template } from "@/types/templates";

const MAX_RECIPIENTS = 50;

function formatZodIssues(error: { issues: { message: string }[] }): string {
  return error.issues.map((issue) => issue.message).join(" ");
}

function buildBodyParameters(
  template: Template,
  contact: { name: string | null; phone: string; product: string | null },
): string[] {
  if (!template.variables.length) {
    return [];
  }

  const sample: Record<string, string> = {
    "1": contact.name?.trim() || "cliente",
    "2": contact.product?.trim() || "tu pedido",
    "3": "10%",
    name: contact.name?.trim() || "cliente",
    product: contact.product?.trim() || "tu pedido",
    ...template.variable_examples,
  };

  return template.variables.map((variable) => sample[variable] ?? "cliente");
}

async function ensureConversation(input: {
  businessId: string;
  contactId: string;
  at: string;
}) {
  const existing = await whatsappRepository.findConversationByContactId(
    input.contactId,
  );
  if (existing.data) {
    await whatsappRepository.touchConversation({
      conversationId: existing.data.id,
      lastMessageAt: input.at,
      resetAiStatus: false,
    });
    return existing.data;
  }

  const created = await whatsappRepository.createConversation({
    businessId: input.businessId,
    contactId: input.contactId,
    lastMessageAt: input.at,
  });

  if (created.error || !created.data) {
    throw new Error(
      created.error?.message ?? "No se pudo crear conversación.",
    );
  }

  return created.data;
}

export async function listCampaignsForCurrentBusiness(): Promise<
  | { ok: true; campaigns: Campaign[] }
  | { ok: false; error: string }
> {
  const workspace = await businessService.getCurrentWorkspace();
  if (!workspace.ok || !workspace.workspace) {
    return { ok: false, error: workspace.ok ? "Sin empresa." : workspace.error };
  }

  const { data, error } = await campaignsRepository.listCampaignsByBusiness(
    workspace.workspace.business.id,
  );

  if (error) {
    return { ok: false, error: error.message };
  }

  return { ok: true, campaigns: data ?? [] };
}

export async function launchCampaignForCurrentBusiness(
  input: LaunchCampaignInput,
): Promise<
  | {
      ok: true;
      campaign: Campaign;
      sent: number;
      failed: number;
      total: number;
    }
  | { ok: false; error: string }
> {
  const parsed = launchCampaignSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: formatZodIssues(parsed.error) };
  }

  const workspace = await businessService.getCurrentWorkspace();
  if (!workspace.ok || !workspace.workspace) {
    return { ok: false, error: workspace.ok ? "Sin empresa." : workspace.error };
  }

  const businessId = workspace.workspace.business.id;
  const { data: authData } = await getCurrentUser();

  const { data: templateRow, error: templateError } =
    await campaignsRepository.getTemplateForCampaign({
      businessId,
      templateId: parsed.data.template_id,
    });

  if (templateError) {
    return { ok: false, error: templateError.message };
  }
  if (!templateRow) {
    return { ok: false, error: "Plantilla no encontrada." };
  }

  const template = mapTemplateRow(templateRow as Record<string, unknown>);
  if (template.status !== "approved") {
    return {
      ok: false,
      error:
        "Solo se pueden enviar plantillas con estado “aprobada”. Sincroniza desde Meta o espera aprobación.",
    };
  }

  const membership = await evaluateSegmentMembership(parsed.data.segment_id);
  if (!membership.ok) {
    return { ok: false, error: membership.error };
  }

  const recipients = membership.matches.slice(0, MAX_RECIPIENTS);
  if (recipients.length === 0) {
    return {
      ok: false,
      error: "El segmento no tiene contactos. Ajusta las reglas o clasifica leads.",
    };
  }

  const { data: settings, error: settingsError } =
    await businessRepository.findSettingsByBusinessId(businessId);

  if (settingsError) {
    return { ok: false, error: settingsError.message };
  }

  const token = settings?.whatsapp_access_token;
  const phoneNumberId = settings?.whatsapp_phone_number_id;

  if (!token || !phoneNumberId) {
    return {
      ok: false,
      error:
        "Configura Access Token y Phone Number ID en Configuración → Integraciones.",
    };
  }

  const { data: campaign, error: createError } =
    await campaignsRepository.createCampaign({
      businessId,
      name: parsed.data.name,
      templateId: parsed.data.template_id,
      segmentId: parsed.data.segment_id,
      createdBy: authData.user?.id ?? null,
    });

  if (createError || !campaign) {
    return {
      ok: false,
      error: createError?.message ?? "No se pudo crear la campaña.",
    };
  }

  await campaignsRepository.updateCampaign({
    businessId,
    id: campaign.id,
    patch: {
      status: "sending",
      total_recipients: recipients.length,
      started_at: new Date().toISOString(),
    },
  });

  let sent = 0;
  let failed = 0;

  for (const recipient of recipients) {
    const bodyParameters = buildBodyParameters(template, {
      name: recipient.name,
      phone: recipient.phone,
      product: recipient.product,
    });

    const sendResult = await sendWhatsAppTemplateMessage({
      accessToken: token,
      phoneNumberId,
      to: recipient.phone,
      templateName: template.name,
      languageCode: template.language,
      bodyParameters,
    });

    if (!sendResult.ok) {
      failed += 1;
      await campaignsRepository.insertCampaignSend({
        campaignId: campaign.id,
        businessId,
        contactId: recipient.contactId,
        phone: recipient.phone,
        status: "failed",
        error: sendResult.error,
      });
      continue;
    }

    sent += 1;
    const sentAt = new Date().toISOString();

    await campaignsRepository.insertCampaignSend({
      campaignId: campaign.id,
      businessId,
      contactId: recipient.contactId,
      phone: recipient.phone,
      status: "sent",
      waMessageId: sendResult.waMessageId,
      sentAt,
    });

    try {
      const conversation = await ensureConversation({
        businessId,
        contactId: recipient.contactId,
        at: sentAt,
      });

      await whatsappRepository.createMessage({
        businessId,
        conversationId: conversation.id,
        waMessageId: sendResult.waMessageId,
        direction: "outbound",
        type: "template",
        body: previewTemplateContent(template.content, {
          "1": recipient.name?.trim() || "cliente",
          "2": recipient.product?.trim() || "tu pedido",
          name: recipient.name?.trim() || "cliente",
          product: recipient.product?.trim() || "tu pedido",
        }),
        rawPayload: sendResult.raw,
        createdAt: sentAt,
      });
    } catch {
      // El envío a Meta ya ocurrió; no revertimos por fallo de persistencia local.
    }
  }

  const finalStatus =
    failed === 0 ? "completed" : sent === 0 ? "failed" : "partial";

  const { data: updated } = await campaignsRepository.updateCampaign({
    businessId,
    id: campaign.id,
    patch: {
      status: finalStatus,
      sent_count: sent,
      failed_count: failed,
      finished_at: new Date().toISOString(),
      error:
        failed > 0
          ? `${failed} envío(s) fallaron. Revisa token, plantilla aprobada y números de prueba.`
          : null,
    },
  });

  return {
    ok: true,
    campaign: updated ?? campaign,
    sent,
    failed,
    total: recipients.length,
  };
}
