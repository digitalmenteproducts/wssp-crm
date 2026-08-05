import { createClient } from "@/lib/supabase/server";
import type { Template, TemplateStatus } from "@/types/templates";

function mapRow(row: Record<string, unknown>): Template {
  const segmentRaw = row.segment;
  let segment: Template["segment"] = null;
  if (segmentRaw && typeof segmentRaw === "object" && !Array.isArray(segmentRaw)) {
    const s = segmentRaw as { id?: string; name?: string };
    if (s.id && s.name) {
      segment = { id: s.id, name: s.name };
    }
  }

  const variables = Array.isArray(row.variables)
    ? row.variables.filter((item): item is string => typeof item === "string")
    : [];

  return {
    id: String(row.id),
    business_id: String(row.business_id),
    meta_template_id:
      row.meta_template_id == null ? null : String(row.meta_template_id),
    name: String(row.name),
    category: String(row.category),
    language: String(row.language),
    content: String(row.content ?? ""),
    variables,
    segment_id: row.segment_id == null ? null : String(row.segment_id),
    status: row.status as TemplateStatus,
    meta_raw:
      row.meta_raw && typeof row.meta_raw === "object"
        ? (row.meta_raw as Record<string, unknown>)
        : {},
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
    segment,
  };
}

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
      mapRow(row as unknown as Record<string, unknown>),
    ),
    error: null,
  };
}

export async function createTemplate(input: {
  businessId: string;
  name: string;
  category: string;
  language: string;
  content: string;
  variables: string[];
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
      category: input.category,
      language: input.language,
      content: input.content,
      variables: input.variables,
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

  return { data: mapRow(result.data as Record<string, unknown>), error: null };
}

export async function updateTemplate(input: {
  businessId: string;
  id: string;
  patch: {
    name?: string;
    category?: string;
    language?: string;
    content?: string;
    variables?: string[];
    segment_id?: string | null;
    status?: TemplateStatus;
    meta_template_id?: string | null;
    meta_raw?: Record<string, unknown>;
  };
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

  return { data: mapRow(result.data as Record<string, unknown>), error: null };
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
  category: string;
  language: string;
  content: string;
  variables: string[];
  status: TemplateStatus;
  metaTemplateId: string;
  metaRaw: Record<string, unknown>;
}) {
  const supabase = await createClient();

  const existing = await supabase
    .from("templates")
    .select("id, segment_id")
    .eq("business_id", input.businessId)
    .eq("name", input.name)
    .eq("language", input.language)
    .maybeSingle<{ id: string; segment_id: string | null }>();

  if (existing.error) {
    return existing;
  }

  if (existing.data) {
    const updated = await supabase
      .from("templates")
      .update({
        category: input.category,
        content: input.content,
        variables: input.variables,
        status: input.status,
        meta_template_id: input.metaTemplateId,
        meta_raw: input.metaRaw,
      })
      .eq("id", existing.data.id)
      .select("*")
      .single();

    if (updated.error) {
      return updated;
    }

    return {
      data: mapRow(updated.data as Record<string, unknown>),
      error: null,
      created: false as const,
    };
  }

  const inserted = await supabase
    .from("templates")
    .insert({
      business_id: input.businessId,
      name: input.name,
      category: input.category,
      language: input.language,
      content: input.content,
      variables: input.variables,
      status: input.status,
      meta_template_id: input.metaTemplateId,
      meta_raw: input.metaRaw,
    })
    .select("*")
    .single();

  if (inserted.error) {
    return inserted;
  }

  return {
    data: mapRow(inserted.data as Record<string, unknown>),
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
