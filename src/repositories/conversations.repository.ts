import { createClient } from "@/lib/supabase/server";
import type { MessageDirection } from "@/types";

type ContactEmbed = { name: string | null; phone: string | null };

export type ConversationListRow = {
  id: string;
  last_message_at: string | null;
  contact: ContactEmbed | ContactEmbed[] | null;
  last_message:
    | {
        body: string | null;
        type: string;
        direction: MessageDirection;
        created_at: string;
      }[]
    | null;
};

export type ConversationHeaderRow = {
  id: string;
  contact: ContactEmbed | ContactEmbed[] | null;
};

export type ConversationMessageRow = {
  id: string;
  direction: MessageDirection;
  type: string;
  body: string | null;
  created_at: string;
  harness: unknown;
};

/** Solo lectura con cliente de sesión: RLS (is_business_member) aplica además del filtro por negocio. */
export async function listRecentConversations(businessId: string, limit: number) {
  const supabase = await createClient();

  return supabase
    .from("conversations")
    .select(
      `
      id,
      last_message_at,
      contact:contacts ( name, phone ),
      last_message:messages ( body, type, direction, created_at )
    `,
    )
    .eq("business_id", businessId)
    .order("last_message_at", { ascending: false, nullsFirst: false })
    .order("created_at", { referencedTable: "last_message", ascending: false })
    .limit(1, { referencedTable: "last_message" })
    .limit(limit)
    .returns<ConversationListRow[]>();
}

export async function findConversationForBusiness(input: {
  businessId: string;
  conversationId: string;
}) {
  const supabase = await createClient();

  return supabase
    .from("conversations")
    .select("id, contact:contacts ( name, phone )")
    .eq("business_id", input.businessId)
    .eq("id", input.conversationId)
    .maybeSingle<ConversationHeaderRow>();
}

/** Últimos `limit` mensajes (más recientes primero). raw_payload no se expone: solo la marca harness. */
export async function listRecentConversationMessages(input: {
  businessId: string;
  conversationId: string;
  limit: number;
}) {
  const supabase = await createClient();

  return supabase
    .from("messages")
    .select("id, direction, type, body, created_at, harness:raw_payload->harness")
    .eq("business_id", input.businessId)
    .eq("conversation_id", input.conversationId)
    .order("created_at", { ascending: false })
    .limit(input.limit)
    .returns<ConversationMessageRow[]>();
}
