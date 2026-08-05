import { createClient } from "@/lib/supabase/server";
import type {
  Campaign,
  CampaignSend,
  CampaignSendStatus,
  CampaignStatus,
} from "@/types/campaigns";

function mapCampaign(row: Record<string, unknown>): Campaign {
  const templateRaw = row.template;
  const segmentRaw = row.segment;

  let template: Campaign["template"] = null;
  if (
    templateRaw &&
    typeof templateRaw === "object" &&
    !Array.isArray(templateRaw)
  ) {
    const t = templateRaw as { id?: string; name?: string };
    if (t.id && t.name) template = { id: t.id, name: t.name };
  }

  let segment: Campaign["segment"] = null;
  if (
    segmentRaw &&
    typeof segmentRaw === "object" &&
    !Array.isArray(segmentRaw)
  ) {
    const s = segmentRaw as { id?: string; name?: string };
    if (s.id && s.name) segment = { id: s.id, name: s.name };
  }

  return {
    id: String(row.id),
    business_id: String(row.business_id),
    name: String(row.name),
    template_id: String(row.template_id),
    segment_id: String(row.segment_id),
    status: row.status as CampaignStatus,
    total_recipients: Number(row.total_recipients ?? 0),
    sent_count: Number(row.sent_count ?? 0),
    failed_count: Number(row.failed_count ?? 0),
    created_by: row.created_by == null ? null : String(row.created_by),
    error: row.error == null ? null : String(row.error),
    created_at: String(row.created_at),
    started_at: row.started_at == null ? null : String(row.started_at),
    finished_at: row.finished_at == null ? null : String(row.finished_at),
    template,
    segment,
  };
}

export async function listCampaignsByBusiness(businessId: string) {
  const supabase = await createClient();

  const result = await supabase
    .from("campaigns")
    .select(
      `
      *,
      template:templates ( id, name ),
      segment:segments ( id, name )
    `,
    )
    .eq("business_id", businessId)
    .order("created_at", { ascending: false })
    .limit(50);

  if (result.error) {
    return result;
  }

  return {
    data: (result.data ?? []).map((row) =>
      mapCampaign(row as unknown as Record<string, unknown>),
    ),
    error: null,
  };
}

export async function createCampaign(input: {
  businessId: string;
  name: string;
  templateId: string;
  segmentId: string;
  createdBy: string | null;
}) {
  const supabase = await createClient();

  const result = await supabase
    .from("campaigns")
    .insert({
      business_id: input.businessId,
      name: input.name,
      template_id: input.templateId,
      segment_id: input.segmentId,
      status: "draft",
      created_by: input.createdBy,
    })
    .select("*")
    .single();

  if (result.error) {
    return result;
  }

  return {
    data: mapCampaign(result.data as Record<string, unknown>),
    error: null,
  };
}

export async function updateCampaign(input: {
  businessId: string;
  id: string;
  patch: Partial<{
    status: CampaignStatus;
    total_recipients: number;
    sent_count: number;
    failed_count: number;
    error: string | null;
    started_at: string | null;
    finished_at: string | null;
  }>;
}) {
  const supabase = await createClient();

  const result = await supabase
    .from("campaigns")
    .update(input.patch)
    .eq("id", input.id)
    .eq("business_id", input.businessId)
    .select("*")
    .maybeSingle();

  if (result.error) {
    return result;
  }
  if (!result.data) {
    return { data: null, error: { message: "Campaña no encontrada." } };
  }

  return {
    data: mapCampaign(result.data as Record<string, unknown>),
    error: null,
  };
}

export async function insertCampaignSend(input: {
  campaignId: string;
  businessId: string;
  contactId: string;
  phone: string;
  status: CampaignSendStatus;
  waMessageId?: string | null;
  error?: string | null;
  sentAt?: string | null;
}) {
  const supabase = await createClient();

  const result = await supabase
    .from("campaign_sends")
    .insert({
      campaign_id: input.campaignId,
      business_id: input.businessId,
      contact_id: input.contactId,
      phone: input.phone,
      status: input.status,
      wa_message_id: input.waMessageId ?? null,
      error: input.error ?? null,
      sent_at: input.sentAt ?? null,
    })
    .select("*")
    .single();

  if (result.error) {
    return result;
  }

  const row = result.data as Record<string, unknown>;
  const send: CampaignSend = {
    id: String(row.id),
    campaign_id: String(row.campaign_id),
    business_id: String(row.business_id),
    contact_id: String(row.contact_id),
    phone: String(row.phone),
    status: row.status as CampaignSendStatus,
    wa_message_id:
      row.wa_message_id == null ? null : String(row.wa_message_id),
    error: row.error == null ? null : String(row.error),
    sent_at: row.sent_at == null ? null : String(row.sent_at),
    created_at: String(row.created_at),
  };

  return { data: send, error: null };
}

export async function getTemplateForCampaign(input: {
  businessId: string;
  templateId: string;
}) {
  const supabase = await createClient();

  return supabase
    .from("templates")
    .select("*")
    .eq("business_id", input.businessId)
    .eq("id", input.templateId)
    .maybeSingle();
}
