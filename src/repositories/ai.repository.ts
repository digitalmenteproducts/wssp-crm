import { createAdminClient } from "@/lib/supabase/admin";
import type { AiAnalysisRecord, Segment } from "@/types/ai";
import type { Conversation } from "@/types/whatsapp";

export type ConversationForClassification = Conversation & {
  contact: {
    id: string;
    phone: string;
    name: string | null;
    status: string;
  } | null;
  messages: Array<{
    direction: string;
    type: string;
    body: string | null;
    created_at: string;
  }> | null;
};

export async function listDueConversations(input: {
  inactivityHours: number;
  limit?: number;
}) {
  const supabase = createAdminClient();
  const cutoff = new Date(
    Date.now() - input.inactivityHours * 60 * 60 * 1000,
  ).toISOString();

  return supabase
    .from("conversations")
    .select(
      `
      *,
      contact:contacts ( id, phone, name, status ),
      messages ( direction, type, body, created_at )
    `,
    )
    .in("ai_status", ["nuevo", "error"])
    .lte("last_message_at", cutoff)
    .order("last_message_at", { ascending: true })
    .limit(input.limit ?? 20)
    .returns<ConversationForClassification[]>();
}

export async function listDueConversationsForBusiness(input: {
  businessId: string;
  inactivityHours: number;
  limit?: number;
}) {
  const supabase = createAdminClient();
  const cutoff = new Date(
    Date.now() - input.inactivityHours * 60 * 60 * 1000,
  ).toISOString();

  return supabase
    .from("conversations")
    .select(
      `
      *,
      contact:contacts ( id, phone, name, status ),
      messages ( direction, type, body, created_at )
    `,
    )
    .eq("business_id", input.businessId)
    .in("ai_status", ["nuevo", "error"])
    .lte("last_message_at", cutoff)
    .order("last_message_at", { ascending: true })
    .limit(input.limit ?? 20)
    .returns<ConversationForClassification[]>();
}

export async function getConversationForClassification(conversationId: string) {
  const supabase = createAdminClient();

  return supabase
    .from("conversations")
    .select(
      `
      *,
      contact:contacts ( id, phone, name, status ),
      messages ( direction, type, body, created_at )
    `,
    )
    .eq("id", conversationId)
    .maybeSingle<ConversationForClassification>();
}

export async function setConversationAiStatus(
  conversationId: string,
  aiStatus: "nuevo" | "procesando" | "analizado" | "error",
) {
  const supabase = createAdminClient();

  return supabase
    .from("conversations")
    .update({ ai_status: aiStatus })
    .eq("id", conversationId);
}

export async function updateContactStatus(
  contactId: string,
  status: string,
) {
  const supabase = createAdminClient();

  return supabase.from("contacts").update({ status }).eq("id", contactId);
}

export async function insertAiAnalysis(input: {
  conversationId: string;
  businessId: string;
  contactId: string;
  summary: string;
  product: string | null;
  subcategory: string | null;
  intent: string | null;
  status: string;
  reason: string | null;
  segment: string | null;
  confidence: number;
  attributes: Record<string, unknown>;
  rawJson: Record<string, unknown>;
}) {
  const supabase = createAdminClient();

  return supabase
    .from("ai_analysis")
    .insert({
      conversation_id: input.conversationId,
      business_id: input.businessId,
      contact_id: input.contactId,
      summary: input.summary,
      product: input.product,
      subcategory: input.subcategory,
      intent: input.intent,
      status: input.status,
      reason: input.reason,
      segment: input.segment,
      confidence: input.confidence,
      attributes: input.attributes,
      raw_json: input.rawJson,
    })
    .select("*")
    .single<AiAnalysisRecord>();
}

export async function getBusinessSettingsForAi(businessId: string) {
  const supabase = createAdminClient();

  return supabase
    .from("business_settings")
    .select(
      "openai_api_key, classification_prompt, ai_engine_enabled, classification_inactivity_hours",
    )
    .eq("business_id", businessId)
    .maybeSingle<{
      openai_api_key: string | null;
      classification_prompt: string | null;
      ai_engine_enabled: boolean;
      classification_inactivity_hours: number;
    }>();
}

export async function listSegmentsByBusiness(businessId: string) {
  const supabase = createAdminClient();

  const result = await supabase
    .from("segments")
    .select("*")
    .eq("business_id", businessId)
    .eq("is_active", true)
    .order("name", { ascending: true });

  if (result.error) {
    return result;
  }

  const segments = (result.data ?? []).map((row) => ({
    ...row,
    rules_json: row.rules_json as Segment["rules_json"],
  })) as Segment[];

  return { data: segments, error: null };
}

export async function createSegment(input: {
  businessId: string;
  name: string;
  description?: string | null;
  rulesJson: Segment["rules_json"];
}) {
  const supabase = createAdminClient();

  return supabase
    .from("segments")
    .insert({
      business_id: input.businessId,
      name: input.name,
      description: input.description ?? null,
      rules_json: input.rulesJson,
    })
    .select("*")
    .single<Segment>();
}

export async function listContactsWithLatestAnalysis(businessId: string) {
  const supabase = createAdminClient();

  const contacts = await supabase
    .from("contacts")
    .select(
      `
      id,
      phone,
      name,
      status,
      conversations (
        id,
        last_message_at,
        ai_status
      )
    `,
    )
    .eq("business_id", businessId)
    .order("created_at", { ascending: false });

  const analyses = await supabase
    .from("ai_analysis")
    .select(
      "contact_id, summary, product, subcategory, intent, status, reason, segment, confidence, created_at",
    )
    .eq("business_id", businessId)
    .order("created_at", { ascending: false });

  return { contacts, analyses };
}
