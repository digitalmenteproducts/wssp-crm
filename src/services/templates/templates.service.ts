import {
  assignTemplateSegmentSchema,
  createTemplateSchema,
  deleteTemplateSchema,
  updateTemplateSchema,
  type CreateTemplateInput,
  type UpdateTemplateInput,
} from "@/schemas/templates";
import * as businessRepository from "@/repositories/business.repository";
import * as templatesRepository from "@/repositories/templates.repository";
import * as aiRepository from "@/repositories/ai.repository";
import * as businessService from "@/services/business/business.service";
import {
  extractTemplateContent,
  fetchMetaMessageTemplates,
  mapMetaStatus,
} from "@/services/whatsapp/meta-templates.service";
import { extractTemplateVariables } from "@/lib/templates/preview";
import type { Template } from "@/types/templates";

function formatZodIssues(error: { issues: { message: string }[] }): string {
  return error.issues.map((issue) => issue.message).join(" ");
}

export { previewTemplateContent } from "@/lib/templates/preview";

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

  const variables = extractTemplateVariables(parsed.data.content);
  const { data, error } = await templatesRepository.createTemplate({
    businessId: workspace.workspace.business.id,
    name: parsed.data.name,
    category: parsed.data.category,
    language: parsed.data.language ?? "es",
    content: parsed.data.content,
    variables,
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

  const patch: Parameters<typeof templatesRepository.updateTemplate>[0]["patch"] =
    {};

  if (parsed.data.name !== undefined) patch.name = parsed.data.name;
  if (parsed.data.category !== undefined) patch.category = parsed.data.category;
  if (parsed.data.language !== undefined) patch.language = parsed.data.language;
  if (parsed.data.segment_id !== undefined) {
    patch.segment_id = parsed.data.segment_id;
  }
  if (parsed.data.status !== undefined) patch.status = parsed.data.status;
  if (parsed.data.content !== undefined) {
    patch.content = parsed.data.content;
    patch.variables = extractTemplateVariables(parsed.data.content);
  }

  const { data, error } = await templatesRepository.updateTemplate({
    businessId: workspace.workspace.business.id,
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
    const { data: segments, error } =
      await aiRepository.listSegmentsByBusiness(
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
      category: item.category || "UTILITY",
      language: item.language || "es",
      content: content || `(Sin cuerpo) ${item.name}`,
      variables,
      status: mapMetaStatus(item.status),
      metaTemplateId: item.id,
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
