import {
  assignTemplateSegmentSchema,
  createTemplateSchema,
  deleteTemplateSchema,
  duplicateTemplateSchema,
  submitTemplateSchema,
  updateTemplateSchema,
  type CreateTemplateInput,
  type UpdateTemplateInput,
} from "@/schemas/templates";
import * as businessRepository from "@/repositories/business.repository";
import * as templatesRepository from "@/repositories/templates.repository";
import * as aiRepository from "@/repositories/ai.repository";
import * as businessService from "@/services/business/business.service";
import {
  createMetaMessageTemplate,
  extractButtons,
  extractFooterText,
  extractHeaderText,
  extractTemplateContent,
  fetchMetaMessageTemplates,
  mapMetaStatus,
} from "@/services/whatsapp/meta-templates.service";
import { extractTemplateVariables } from "@/lib/templates/preview";
import {
  slugifyTemplateName,
  validateConsecutivePositionalVariables,
} from "@/lib/templates/slug";
import type { Template } from "@/types/templates";

function formatZodIssues(error: { issues: { message: string }[] }): string {
  return error.issues.map((issue) => issue.message).join(" ");
}

export { previewTemplateContent } from "@/lib/templates/preview";
export { slugifyTemplateName } from "@/lib/templates/slug";

function orderedExamples(
  variables: string[],
  examples: Record<string, string>,
): string[] {
  return variables.map((key) => examples[key]?.trim() || `ejemplo_${key}`);
}

export async function listTemplatesForCurrentBusiness(): Promise<
  | { ok: true; templates: Template[] }
  | { ok: false; error: string }
> {
  const workspace = await businessService.getCurrentWorkspace();
  if (!workspace.ok || !workspace.workspace) {
    return { ok: false, error: workspace.ok ? "Sin empresa." : workspace.error };
  }

  const { data, error } = await templatesRepository.listTemplatesByBusiness(
    workspace.workspace.business.id,
  );

  if (error) {
    return { ok: false, error: error.message };
  }

  return { ok: true, templates: data ?? [] };
}

export async function createTemplateForCurrentBusiness(
  input: CreateTemplateInput,
): Promise<{ ok: true; template: Template } | { ok: false; error: string }> {
  const parsed = createTemplateSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: formatZodIssues(parsed.error) };
  }

  const workspace = await businessService.getCurrentWorkspace();
  if (!workspace.ok || !workspace.workspace) {
    return { ok: false, error: workspace.ok ? "Sin empresa." : workspace.error };
  }

  const varsCheck = validateConsecutivePositionalVariables(parsed.data.content);
  if (!varsCheck.ok) {
    return { ok: false, error: varsCheck.error };
  }

  const { data, error } = await templatesRepository.createTemplate({
    businessId: workspace.workspace.business.id,
    name: parsed.data.name,
    displayName: parsed.data.display_name,
    category: parsed.data.category,
    language: parsed.data.language,
    content: parsed.data.content,
    headerText: parsed.data.header_text ?? null,
    footerText: parsed.data.footer_text ?? null,
    buttons: parsed.data.buttons ?? [],
    variables: varsCheck.variables,
    variableExamples: parsed.data.variable_examples ?? {},
    segmentId: parsed.data.segment_id ?? null,
    status: "draft",
  });

  if (error || !data) {
    return {
      ok: false,
      error: error?.message ?? "No se pudo crear la plantilla.",
    };
  }

  return { ok: true, template: data };
}

export async function updateTemplateForCurrentBusiness(
  input: UpdateTemplateInput,
): Promise<{ ok: true; template: Template } | { ok: false; error: string }> {
  const parsed = updateTemplateSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: formatZodIssues(parsed.error) };
  }

  const workspace = await businessService.getCurrentWorkspace();
  if (!workspace.ok || !workspace.workspace) {
    return { ok: false, error: workspace.ok ? "Sin empresa." : workspace.error };
  }

  const businessId = workspace.workspace.business.id;
  const existing = await templatesRepository.getTemplateById({
    businessId,
    id: parsed.data.id,
  });

  if (existing.error) {
    return { ok: false, error: existing.error.message };
  }
  if (!existing.data) {
    return { ok: false, error: "Plantilla no encontrada." };
  }

  if (
    existing.data.status !== "draft" &&
    existing.data.status !== "rejected" &&
    existing.data.status !== "error"
  ) {
    return {
      ok: false,
      error: "Solo puedes editar plantillas en borrador, rechazadas o con error.",
    };
  }

  const mergedContent = parsed.data.content ?? existing.data.content;
  const varsCheck = validateConsecutivePositionalVariables(mergedContent);
  if (!varsCheck.ok) {
    return { ok: false, error: varsCheck.error };
  }

  const patch: templatesRepository.TemplatePatch = {};
  if (parsed.data.display_name !== undefined) {
    patch.display_name = parsed.data.display_name;
  }
  if (parsed.data.name !== undefined) patch.name = parsed.data.name;
  if (parsed.data.category !== undefined) patch.category = parsed.data.category;
  if (parsed.data.language !== undefined) patch.language = parsed.data.language;
  if (parsed.data.header_text !== undefined) {
    patch.header_text = parsed.data.header_text ?? null;
  }
  if (parsed.data.footer_text !== undefined) {
    patch.footer_text = parsed.data.footer_text ?? null;
  }
  if (parsed.data.buttons !== undefined) patch.buttons = parsed.data.buttons;
  if (parsed.data.segment_id !== undefined) {
    patch.segment_id = parsed.data.segment_id;
  }
  if (parsed.data.content !== undefined) {
    patch.content = parsed.data.content;
    patch.variables = varsCheck.variables;
  }
  if (parsed.data.variable_examples !== undefined) {
    patch.variable_examples = parsed.data.variable_examples;
  }

  // Al corregir una rechazada, vuelve a borrador.
  if (existing.data.status === "rejected" || existing.data.status === "error") {
    patch.status = "draft";
    patch.rejection_reason = null;
  }

  const { data, error } = await templatesRepository.updateTemplate({
    businessId,
    id: parsed.data.id,
    patch,
  });

  if (error || !data) {
    return {
      ok: false,
      error: error?.message ?? "No se pudo actualizar la plantilla.",
    };
  }

  return { ok: true, template: data };
}

export async function deleteTemplateForCurrentBusiness(
  id: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = deleteTemplateSchema.safeParse({ id });
  if (!parsed.success) {
    return { ok: false, error: formatZodIssues(parsed.error) };
  }

  const workspace = await businessService.getCurrentWorkspace();
  if (!workspace.ok || !workspace.workspace) {
    return { ok: false, error: workspace.ok ? "Sin empresa." : workspace.error };
  }

  const existing = await templatesRepository.getTemplateById({
    businessId: workspace.workspace.business.id,
    id: parsed.data.id,
  });
  if (existing.error) {
    return { ok: false, error: existing.error.message };
  }
  if (!existing.data) {
    return { ok: false, error: "Plantilla no encontrada." };
  }
  if (existing.data.status === "pending" || existing.data.status === "submitting") {
    return {
      ok: false,
      error: "No puedes eliminar una plantilla en revisión.",
    };
  }

  const { error } = await templatesRepository.deleteTemplate({
    businessId: workspace.workspace.business.id,
    id: parsed.data.id,
  });

  if (error) {
    return { ok: false, error: error.message };
  }

  return { ok: true };
}

export async function assignTemplateSegmentForCurrentBusiness(input: {
  id: string;
  segment_id: string | null;
}): Promise<{ ok: true; template: Template } | { ok: false; error: string }> {
  const parsed = assignTemplateSegmentSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: formatZodIssues(parsed.error) };
  }

  const workspace = await businessService.getCurrentWorkspace();
  if (!workspace.ok || !workspace.workspace) {
    return { ok: false, error: workspace.ok ? "Sin empresa." : workspace.error };
  }

  if (parsed.data.segment_id) {
    const { data: segments, error } = await aiRepository.listSegmentsByBusiness(
      workspace.workspace.business.id,
    );
    if (error) {
      return { ok: false, error: error.message };
    }
    const exists = (segments ?? []).some((s) => s.id === parsed.data.segment_id);
    if (!exists) {
      return { ok: false, error: "Segmento no encontrado." };
    }
  }

  const { data, error } = await templatesRepository.updateTemplate({
    businessId: workspace.workspace.business.id,
    id: parsed.data.id,
    patch: { segment_id: parsed.data.segment_id },
  });

  if (error || !data) {
    return {
      ok: false,
      error: error?.message ?? "No se pudo asignar el segmento.",
    };
  }

  return { ok: true, template: data };
}

export async function submitTemplateForReview(
  id: string,
): Promise<{ ok: true; template: Template } | { ok: false; error: string }> {
  const parsed = submitTemplateSchema.safeParse({ id });
  if (!parsed.success) {
    return { ok: false, error: formatZodIssues(parsed.error) };
  }

  const workspace = await businessService.getCurrentWorkspace();
  if (!workspace.ok || !workspace.workspace) {
    return { ok: false, error: workspace.ok ? "Sin empresa." : workspace.error };
  }

  const businessId = workspace.workspace.business.id;
  const existing = await templatesRepository.getTemplateById({
    businessId,
    id: parsed.data.id,
  });

  if (existing.error) {
    return { ok: false, error: existing.error.message };
  }
  if (!existing.data) {
    return { ok: false, error: "Plantilla no encontrada." };
  }

  if (
    existing.data.status !== "draft" &&
    existing.data.status !== "rejected" &&
    existing.data.status !== "error"
  ) {
    return {
      ok: false,
      error: "Solo se pueden enviar a revisión borradores o plantillas rechazadas.",
    };
  }

  const varsCheck = validateConsecutivePositionalVariables(existing.data.content);
  if (!varsCheck.ok) {
    return { ok: false, error: varsCheck.error };
  }

  for (const key of varsCheck.variables) {
    if (!existing.data.variable_examples[key]?.trim()) {
      return { ok: false, error: `Falta el ejemplo para {{${key}}}.` };
    }
  }

  const { data: settings, error: settingsError } =
    await businessRepository.findSettingsByBusinessId(businessId);

  if (settingsError) {
    return { ok: false, error: settingsError.message };
  }

  const token = settings?.whatsapp_access_token;
  const wabaId = settings?.whatsapp_business_account_id;

  if (!token || !wabaId) {
    return {
      ok: false,
      error:
        "Configura Access Token y WABA ID en Configuración → Integraciones.",
    };
  }

  const category =
    existing.data.category === "MARKETING" || existing.data.category === "UTILITY"
      ? existing.data.category
      : "UTILITY";

  await templatesRepository.updateTemplate({
    businessId,
    id: existing.data.id,
    patch: {
      status: "submitting",
      rejection_reason: null,
    },
  });

  const submittedAt = new Date().toISOString();
  const remote = await createMetaMessageTemplate({
    accessToken: token,
    wabaId,
    name: existing.data.name,
    language: existing.data.language,
    category,
    headerText: existing.data.header_text,
    bodyText: existing.data.content,
    footerText: existing.data.footer_text,
    buttons: existing.data.buttons,
    bodyExamples: orderedExamples(
      varsCheck.variables,
      existing.data.variable_examples,
    ),
  });

  if (!remote.ok) {
    await templatesRepository.updateTemplate({
      businessId,
      id: existing.data.id,
      patch: {
        status: "error",
        rejection_reason: remote.error,
        meta_raw: remote.raw ?? {},
      },
    });

    return { ok: false, error: remote.error };
  }

  const localStatus = mapMetaStatus(remote.status);
  const { data, error } = await templatesRepository.updateTemplate({
    businessId,
    id: existing.data.id,
    patch: {
      status: localStatus === "draft" ? "pending" : localStatus,
      meta_template_id: remote.id,
      meta_status: remote.status,
      meta_raw: remote.raw,
      category: remote.category || category,
      submitted_at: submittedAt,
      last_synced_at: submittedAt,
      rejection_reason: null,
    },
  });

  if (error || !data) {
    return {
      ok: false,
      error: error?.message ?? "Se envió a Meta pero no se pudo guardar el estado.",
    };
  }

  return { ok: true, template: data };
}

export async function duplicateTemplateForCurrentBusiness(
  id: string,
): Promise<{ ok: true; template: Template } | { ok: false; error: string }> {
  const parsed = duplicateTemplateSchema.safeParse({ id });
  if (!parsed.success) {
    return { ok: false, error: formatZodIssues(parsed.error) };
  }

  const workspace = await businessService.getCurrentWorkspace();
  if (!workspace.ok || !workspace.workspace) {
    return { ok: false, error: workspace.ok ? "Sin empresa." : workspace.error };
  }

  const businessId = workspace.workspace.business.id;
  const existing = await templatesRepository.getTemplateById({
    businessId,
    id: parsed.data.id,
  });

  if (existing.error) {
    return { ok: false, error: existing.error.message };
  }
  if (!existing.data) {
    return { ok: false, error: "Plantilla no encontrada." };
  }

  const suffix = `_v${Date.now().toString().slice(-6)}`;
  const newName = `${existing.data.name}${suffix}`.slice(0, 512);

  const { data, error } = await templatesRepository.createTemplate({
    businessId,
    name: newName,
    displayName: `${existing.data.display_name} (copia)`,
    category: existing.data.category,
    language: existing.data.language,
    content: existing.data.content,
    headerText: existing.data.header_text,
    footerText: existing.data.footer_text,
    buttons: existing.data.buttons,
    variables: existing.data.variables,
    variableExamples: existing.data.variable_examples,
    segmentId: existing.data.segment_id,
    status: "draft",
  });

  if (error || !data) {
    return {
      ok: false,
      error: error?.message ?? "No se pudo duplicar la plantilla.",
    };
  }

  return { ok: true, template: data };
}

export async function syncTemplatesFromMetaForCurrentBusiness(): Promise<
  | { ok: true; created: number; updated: number; total: number }
  | { ok: false; error: string }
> {
  const workspace = await businessService.getCurrentWorkspace();
  if (!workspace.ok || !workspace.workspace) {
    return { ok: false, error: workspace.ok ? "Sin empresa." : workspace.error };
  }

  const businessId = workspace.workspace.business.id;
  const { data: settings, error: settingsError } =
    await businessRepository.findSettingsByBusinessId(businessId);

  if (settingsError) {
    return { ok: false, error: settingsError.message };
  }

  const token = settings?.whatsapp_access_token;
  const wabaId = settings?.whatsapp_business_account_id;

  if (!token || !wabaId) {
    return {
      ok: false,
      error:
        "Configura el Access Token y el WABA ID en Configuración → Integraciones.",
    };
  }

  const remote = await fetchMetaMessageTemplates({
    accessToken: token,
    wabaId,
  });

  if (!remote.ok) {
    return remote;
  }

  let created = 0;
  let updated = 0;

  for (const item of remote.templates) {
    const content = extractTemplateContent(item.components);
    const variables = extractTemplateVariables(content);
    const result = await templatesRepository.upsertTemplateFromMeta({
      businessId,
      name: item.name,
      displayName: item.name,
      category: item.category || "UTILITY",
      language: item.language || "es",
      content: content || `(Sin cuerpo) ${item.name}`,
      headerText: extractHeaderText(item.components),
      footerText: extractFooterText(item.components),
      buttons: extractButtons(item.components),
      variables,
      status: mapMetaStatus(item.status),
      metaTemplateId: item.id,
      metaStatus: item.status,
      rejectionReason: item.rejected_reason ?? null,
      metaRaw: item as unknown as Record<string, unknown>,
    });

    if ("error" in result && result.error) {
      return {
        ok: false,
        error:
          typeof result.error === "object" &&
          result.error &&
          "message" in result.error
            ? String((result.error as { message: string }).message)
            : "Error al guardar plantilla de Meta.",
      };
    }

    if ("created" in result && result.created) {
      created += 1;
    } else {
      updated += 1;
    }
  }

  return {
    ok: true,
    created,
    updated,
    total: remote.templates.length,
  };
}
