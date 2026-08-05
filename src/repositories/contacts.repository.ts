import { createClient } from "@/lib/supabase/server";
import type { ContactBoardStatus } from "@/types";

type ContactBoardRow = {
  id: string;
  phone: string;
  name: string | null;
  status: string;
  created_at: string;
  conversations:
    | {
        id: string;
        last_message_at: string | null;
        ai_status: string;
      }
    | {
        id: string;
        last_message_at: string | null;
        ai_status: string;
      }[]
    | null;
};

type AnalysisBoardRow = {
  contact_id: string;
  summary: string | null;
  product: string | null;
  segment: string | null;
  confidence: number | null;
  attributes: Record<string, unknown> | null;
  created_at: string;
};

type MessageBoardRow = {
  conversation_id: string;
  body: string | null;
  created_at: string;
};

export async function listBoardContactRows(businessId: string) {
  const supabase = await createClient();

  const [contacts, analyses, messages, messagesCount, analyzedCount] =
    await Promise.all([
      supabase
        .from("contacts")
        .select(
          `
          id,
          phone,
          name,
          status,
          created_at,
          conversations (
            id,
            last_message_at,
            ai_status
          )
        `,
        )
        .eq("business_id", businessId)
        .order("created_at", { ascending: false })
        .returns<ContactBoardRow[]>(),
      supabase
        .from("ai_analysis")
        .select(
          "contact_id, summary, product, segment, confidence, attributes, created_at",
        )
        .eq("business_id", businessId)
        .order("created_at", { ascending: false })
        .returns<AnalysisBoardRow[]>(),
      supabase
        .from("messages")
        .select("conversation_id, body, created_at")
        .eq("business_id", businessId)
        .order("created_at", { ascending: false })
        .limit(500)
        .returns<MessageBoardRow[]>(),
      supabase
        .from("messages")
        .select("id", { count: "exact", head: true })
        .eq("business_id", businessId),
      supabase
        .from("conversations")
        .select("id", { count: "exact", head: true })
        .eq("business_id", businessId)
        .eq("ai_status", "analizado"),
    ]);

  return {
    contacts,
    analyses,
    messages,
    messagesCount: messagesCount.count ?? 0,
    analyzedCount: analyzedCount.count ?? 0,
  };
}

export async function updateContactStatusForMember(input: {
  businessId: string;
  contactId: string;
  status: ContactBoardStatus;
}) {
  const supabase = await createClient();

  return supabase
    .from("contacts")
    .update({ status: input.status })
    .eq("id", input.contactId)
    .eq("business_id", input.businessId)
    .select("id, status")
    .maybeSingle<{ id: string; status: string }>();
}

export async function getContactConversationId(input: {
  businessId: string;
  contactId: string;
}) {
  const supabase = await createClient();

  return supabase
    .from("conversations")
    .select("id")
    .eq("business_id", input.businessId)
    .eq("contact_id", input.contactId)
    .maybeSingle<{ id: string }>();
}
