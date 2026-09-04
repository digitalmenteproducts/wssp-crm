import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type {
  AiAgentSettings,
  AiKnowledgeEntry,
  AiUsageRow,
} from "@/types/ai-agent";

const SETTINGS_SELECT = "*";

export async function getAiAgentSettings(businessId: string) {
  const supabase = await createClient();
  return supabase
    .from("ai_agent_settings")
    .select(SETTINGS_SELECT)
    .eq("business_id", businessId)
    .maybeSingle<AiAgentSettings>();
}

export async function getAiAgentSettingsAdmin(businessId: string) {
  const supabase = createAdminClient();
  return supabase
    .from("ai_agent_settings")
    .select(SETTINGS_SELECT)
    .eq("business_id", businessId)
    .maybeSingle<AiAgentSettings>();
}

export async function upsertAiAgentSettings(
  businessId: string,
  patch: Omit<
    AiAgentSettings,
    "id" | "business_id" | "created_at" | "updated_at"
  >,
) {
  const supabase = await createClient();
  return supabase
    .from("ai_agent_settings")
    .upsert(
      {
        business_id: businessId,
        ...patch,
      },
      { onConflict: "business_id" },
    )
    .select(SETTINGS_SELECT)
    .single<AiAgentSettings>();
}

export async function listKnowledgeEntries(
  businessId: string,
  options?: { query?: string; enabledOnly?: boolean },
) {
  const supabase = await createClient();
  let q = supabase
    .from("ai_knowledge_entries")
    .select("*")
    .eq("business_id", businessId)
    .order("updated_at", { ascending: false });

  if (options?.enabledOnly) {
    q = q.eq("enabled", true);
  }

  const query = options?.query?.trim();
  if (query) {
    q = q.or(`title.ilike.%${query}%,content.ilike.%${query}%`);
  }

  return q.returns<AiKnowledgeEntry[]>();
}

export async function listKnowledgeEntriesAdmin(
  businessId: string,
  options?: { enabledOnly?: boolean; limit?: number },
) {
  const supabase = createAdminClient();
  let q = supabase
    .from("ai_knowledge_entries")
    .select("*")
    .eq("business_id", businessId)
    .order("updated_at", { ascending: false });

  if (options?.enabledOnly) {
    q = q.eq("enabled", true);
  }
  if (options?.limit) {
    q = q.limit(options.limit);
  }

  return q.returns<AiKnowledgeEntry[]>();
}

export async function upsertKnowledgeEntry(
  businessId: string,
  input: {
    id?: string;
    title: string;
    content: string;
    category: AiKnowledgeEntry["category"];
    enabled: boolean;
  },
) {
  const supabase = await createClient();

  if (input.id) {
    return supabase
      .from("ai_knowledge_entries")
      .update({
        title: input.title,
        content: input.content,
        category: input.category,
        enabled: input.enabled,
      })
      .eq("id", input.id)
      .eq("business_id", businessId)
      .select("*")
      .single<AiKnowledgeEntry>();
  }

  return supabase
    .from("ai_knowledge_entries")
    .insert({
      business_id: businessId,
      title: input.title,
      content: input.content,
      category: input.category,
      enabled: input.enabled,
    })
    .select("*")
    .single<AiKnowledgeEntry>();
}

export async function deleteKnowledgeEntry(businessId: string, id: string) {
  const supabase = await createClient();
  return supabase
    .from("ai_knowledge_entries")
    .delete()
    .eq("id", id)
    .eq("business_id", businessId);
}

export async function insertAiUsage(input: {
  businessId: string;
  conversationId?: string | null;
  messageId?: string | null;
  sourceMessageId?: string | null;
  provider?: string;
  model: string;
  inputTokens?: number | null;
  outputTokens?: number | null;
  totalTokens?: number | null;
  estimatedCost?: number | null;
  shouldHandoff?: boolean;
  confidence?: string | null;
}) {
  const supabase = createAdminClient();
  return supabase
    .from("ai_usage")
    .insert({
      business_id: input.businessId,
      conversation_id: input.conversationId ?? null,
      message_id: input.messageId ?? null,
      source_message_id: input.sourceMessageId ?? null,
      provider: input.provider ?? "openai",
      model: input.model,
      input_tokens: input.inputTokens ?? null,
      output_tokens: input.outputTokens ?? null,
      total_tokens: input.totalTokens ?? null,
      estimated_cost: input.estimatedCost ?? null,
      should_handoff: input.shouldHandoff ?? false,
      confidence: input.confidence ?? null,
    })
    .select("*")
    .single<AiUsageRow>();
}

export async function findUsageBySourceMessage(sourceMessageId: string) {
  const supabase = createAdminClient();
  return supabase
    .from("ai_usage")
    .select("id")
    .eq("source_message_id", sourceMessageId)
    .maybeSingle<{ id: string }>();
}

export async function listRecentMessagesAdmin(
  conversationId: string,
  businessId: string,
  limit = 20,
) {
  const supabase = createAdminClient();
  return supabase
    .from("messages")
    .select("id, direction, type, body, created_at")
    .eq("conversation_id", conversationId)
    .eq("business_id", businessId)
    .order("created_at", { ascending: false })
    .limit(limit)
    .returns<
      Array<{
        id: string;
        direction: "inbound" | "outbound";
        type: string;
        body: string | null;
        created_at: string;
      }>
    >();
}

export async function updateConversationAgentState(input: {
  conversationId: string;
  businessId: string;
  agentPaused?: boolean;
  humanHandoffAt?: string | null;
  humanHandoffReason?: string | null;
  agentFailedAttempts?: number;
}) {
  const supabase = createAdminClient();
  const patch: Record<string, unknown> = {};
  if (input.agentPaused !== undefined) patch.agent_paused = input.agentPaused;
  if (input.humanHandoffAt !== undefined) {
    patch.human_handoff_at = input.humanHandoffAt;
  }
  if (input.humanHandoffReason !== undefined) {
    patch.human_handoff_reason = input.humanHandoffReason;
  }
  if (input.agentFailedAttempts !== undefined) {
    patch.agent_failed_attempts = input.agentFailedAttempts;
  }

  return supabase
    .from("conversations")
    .update(patch)
    .eq("id", input.conversationId)
    .eq("business_id", input.businessId)
    .select(
      "id, agent_paused, human_handoff_at, human_handoff_reason, agent_failed_attempts",
    )
    .single();
}

export async function getConversationAgentStateAdmin(
  conversationId: string,
  businessId: string,
) {
  const supabase = createAdminClient();
  return supabase
    .from("conversations")
    .select(
      "id, agent_paused, human_handoff_at, human_handoff_reason, agent_failed_attempts, contact_id",
    )
    .eq("id", conversationId)
    .eq("business_id", businessId)
    .maybeSingle<{
      id: string;
      agent_paused: boolean;
      human_handoff_at: string | null;
      human_handoff_reason: string | null;
      agent_failed_attempts: number;
      contact_id: string;
    }>();
}
