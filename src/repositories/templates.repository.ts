import { createClient } from "@/lib/supabase/server";
import type {
  Template,
  TemplateButton,
  TemplateStatus,
} from "@/types/templates";

function asButtons(value: unknown): TemplateButton[] {
  if (!Array.isArray(value)) return [];
  const buttons: TemplateButton[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const type = String(row.type ?? "");
    const text = String(row.text ?? "").trim();
    if (!text) continue;
    if (type === "QUICK_REPLY") {
      buttons.push({ type: "QUICK_REPLY", text });
    } else if (type === "URL") {
      buttons.push({
        type: "URL",
        text,
        url: row.url ? String(row.url) : undefined,
      });
    } else if (type === "PHONE_NUMBER") {
      buttons.push({
        type: "PHONE_NUMBER",
        text,
        phone_number: row.phone_number
          ? String(row.phone_number)
          : undefined,
      });
    }
  }
  return buttons;
}

function asExamples(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out: Record<string, string> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (typeof item === "string" && item.trim()) {
      out[key] = item;
    }
  }
  return out;
}

export function mapTemplateRow(row: Record<string, unknown>): Template {
  const segmentRaw = row.segment;
  let segment: Template["segment"] = null;
  if (
    segmentRaw &&
    typeof segmentRaw === "object" &&
    !Array.isArray(segmentRaw)
  ) {
    const s = segmentRaw as { id?: string; name?: string };
    if (s.id && s.name) {
      segment = { id: s.id, name: s.name };
    }
  }

  const variables = Array.isArray(row.variables)
    ? row.variables.filter((item): item is string => typeof item === "string")
    : [];

  const name = String(row.name);
  const displayName =
    row.display_name == null || String(row.display_name).trim() === ""
      ? name
      : String(row.display_name);

  return {
    id: String(row.id),
    business_id: String(row.business_id),
    meta_template_id:
      row.meta_template_id == null ? null : String(row.meta_template_id),
    name,
    display_name: displayName,
    category: String(row.category),
    language: String(row.language),
    content: String(row.content ?? ""),
    header_text: row.header_text == null ? null : String(row.header_text),
    footer_text: row.footer_text == null ? null : String(row.footer_text),
    buttons: asButtons(row.buttons),
    variables,
    variable_examples: asExamples(row.variable_examples),
    segment_id: row.segment_id == null ? null : String(row.segment_id),
    status: row.status as TemplateStatus,
    meta_status: row.meta_status == null ? null : String(row.meta_status),
    rejection_reason:
      row.rejection_reason == null ? null : String(row.rejection_reason),
    meta_raw:
      row.meta_raw && typeof row.meta_raw === "object"
        ? (row.meta_raw as Record<string, unknown>)
        : {},
    submitted_at: row.submitted_at == null ? null : String(row.submitted_at),
    approved_at: row.approved_at == null ? null : String(row.approved_at),
    rejected_at: row.rejected_at == null ? null : String(row.rejected_at),
    last_synced_at:
      row.last_synced_at == null ? null : String(row.last_synced_at),
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
    segment,
  };
}

export type TemplatePatch = Partial<{
  name: string;
  display_name: string;
  category: string;
  language: string;
  content: string;
  header_text: string | null;
  footer_text: string | null;
  buttons: TemplateButton[];
  variables: string[];
  variable_examples: Record<string, string>;
  segment_id: string | null;
  status: TemplateStatus;
  meta_template_id: string | null;
  meta_status: string | null;
  rejection_reason: string | null;
  meta_raw: Record<string, unknown>;
  submitted_at: string | null;
  approved_at: string | null;
  rejected_at: string | null;
  last_synced_at: string | null;
}>;

export async function listTemplatesByBusiness(businessId: string) {
  const supabase = await createClient();

  const result = await supabase
    .from("templates")
    .select(
      `
      *,
      segment:segments ( id, name )
    `,
    )
    .eq("business_id", businessId)
    .order("updated_at", { ascending: false });

  if (result.error) {
    return result;
  }

  return {
    data: (result.data ?? []).map((row) =>
      mapTemplateRow(row as unknown as Record<string, unknown>),
    ),
    error: null,
  };
}

export async function getTemplateById(input: {
  businessId: string;
  id: string;
}) {
  const supabase = await createClient();

  const result = await supabase
    .from("templates")
    .select("*")
    .eq("business_id", input.businessId)
    .eq("id", input.id)
    .maybeSingle();

  if (result.error) {
    return result;
  }
  if (!result.data) {
    return { data: null, error: null };
  }

  return {
    data: mapTemplateRow(result.data as Record<string, unknown>),
    error: null,
  };
}

export async function createTemplate(input: {
  businessId: string;
  name: string;
  displayName: string;
  category: string;
  language: string;
  content: string;
  headerText?: string | null;
  footerText?: string | null;
  buttons?: TemplateButton[];
  variables: string[];
  variableExamples?: Record<string, string>;
  segmentId?: string | null;
  status?: TemplateStatus;
  metaTemplateId?: string | null;
  metaRaw?: Record<string, unknown>;
}) {
  const supabase = await createClient();

  const result = await supabase
    .from("templates")
    .insert({
      business_id: input.businessId,
      name: input.name,
      display_name: input.displayName,
      category: input.category,
      language: input.language,
      content: input.content,
      header_text: input.headerText ?? null,
      footer_text: input.footerText ?? null,
      buttons: input.buttons ?? [],
      variables: input.variables,
      variable_examples: input.variableExamples ?? {},
      segment_id: input.segmentId ?? null,
      status: input.status ?? "draft",
      meta_template_id: input.metaTemplateId ?? null,
      meta_raw: input.metaRaw ?? {},
    })
    .select("*")
    .single();

  if (result.error) {
    return result;
  }

  return {
    data: mapTemplateRow(result.data as Record<string, unknown>),
    error: null,
  };
}

export async function updateTemplate(input: {
  businessId: string;
  id: string;
  patch: TemplatePatch;
}) {
  const supabase = await createClient();

  const result = await supabase
    .from("templates")
    .update(input.patch)
    .eq("id", input.id)
    .eq("business_id", input.businessId)
    .select("*")
    .maybeSingle();

  if (result.error) {
    return result;
  }
  if (!result.data) {
    return { data: null, error: { message: "Plantilla no encontrada." } };
  }

  return {
    data: mapTemplateRow(result.data as Record<string, unknown>),
    error: null,
  };
}

export async function deleteTemplate(input: {
  businessId: string;
  id: string;
}) {
  const supabase = await createClient();

  return supabase
    .from("templates")
    .delete()
    .eq("id", input.id)
    .eq("business_id", input.businessId);
}

export async function upsertTemplateFromMeta(input: {
  businessId: string;
  name: string;
  displayName?: string;
  category: string;
  language: string;
  content: string;
  headerText?: string | null;
  footerText?: string | null;
  buttons?: TemplateButton[];
  variables: string[];
  status: TemplateStatus;
  metaTemplateId: string;
  metaStatus: string;
  rejectionReason?: string | null;
  metaRaw: Record<string, unknown>;
}) {
  const supabase = await createClient();
  const now = new Date().toISOString();

  const byMetaId = await supabase
    .from("templates")
    .select("id, segment_id, display_name")
    .eq("business_id", input.businessId)
    .eq("meta_template_id", input.metaTemplateId)
    .maybeSingle<{
      id: string;
      segment_id: string | null;
      display_name: string | null;
    }>();

  if (byMetaId.error) {
    return byMetaId;
  }

  let existingId = byMetaId.data?.id ?? null;
  let existingDisplay = byMetaId.data?.display_name ?? null;

  if (!existingId) {
    const byName = await supabase
      .from("templates")
      .select("id, segment_id, display_name")
      .eq("business_id", input.businessId)
      .eq("name", input.name)
      .eq("language", input.language)
      .maybeSingle<{
        id: string;
        segment_id: string | null;
        display_name: string | null;
      }>();

    if (byName.error) {
      return byName;
    }

    existingId = byName.data?.id ?? null;
    existingDisplay = byName.data?.display_name ?? null;
  }

  const statusPatch: Record<string, unknown> = {
    category: input.category,
    content: input.content,
    header_text: input.headerText ?? null,
    footer_text: input.footerText ?? null,
    buttons: input.buttons ?? [],
    variables: input.variables,
    status: input.status,
    meta_template_id: input.metaTemplateId,
    meta_status: input.metaStatus,
    rejection_reason: input.rejectionReason ?? null,
    meta_raw: input.metaRaw,
    last_synced_at: now,
  };

  if (input.status === "approved") {
    statusPatch.approved_at = now;
  }
  if (input.status === "rejected") {
    statusPatch.rejected_at = now;
  }

  if (existingId) {
    if (!existingDisplay) {
      statusPatch.display_name = input.displayName ?? input.name;
    }

    const updated = await supabase
      .from("templates")
      .update(statusPatch)
      .eq("id", existingId)
      .select("*")
      .single();

    if (updated.error) {
      return updated;
    }

    return {
      data: mapTemplateRow(updated.data as Record<string, unknown>),
      error: null,
      created: false as const,
    };
  }

  const inserted = await supabase
    .from("templates")
    .insert({
      business_id: input.businessId,
      name: input.name,
      display_name: input.displayName ?? input.name,
      language: input.language,
      ...statusPatch,
    })
    .select("*")
    .single();

  if (inserted.error) {
    return inserted;
  }

  return {
    data: mapTemplateRow(inserted.data as Record<string, unknown>),
    error: null,
    created: true as const,
  };
}

export async function countTemplatesByBusiness(businessId: string) {
  const supabase = await createClient();

  return supabase
    .from("templates")
    .select("id", { count: "exact", head: true })
    .eq("business_id", businessId);
}
