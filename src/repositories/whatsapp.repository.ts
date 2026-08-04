import { createAdminClient } from "@/lib/supabase/admin";
import type { Contact, Conversation, Message } from "@/types/whatsapp";

export async function findBusinessIdByVerifyToken(verifyToken: string) {
  const supabase = createAdminClient();

  return supabase
    .from("business_settings")
    .select("business_id")
    .eq("whatsapp_verify_token", verifyToken)
    .maybeSingle<{ business_id: string }>();
}

export async function findBusinessIdByPhoneNumberId(phoneNumberId: string) {
  const supabase = createAdminClient();

  return supabase
    .from("business_settings")
    .select("business_id")
    .eq("whatsapp_phone_number_id", phoneNumberId)
    .maybeSingle<{ business_id: string }>();
}

export async function findContactByPhone(businessId: string, phone: string) {
  const supabase = createAdminClient();

  return supabase
    .from("contacts")
    .select("*")
    .eq("business_id", businessId)
    .eq("phone", phone)
    .maybeSingle<Contact>();
}

export async function createContact(input: {
  businessId: string;
  phone: string;
  name: string | null;
}) {
  const supabase = createAdminClient();

  return supabase
    .from("contacts")
    .insert({
      business_id: input.businessId,
      phone: input.phone,
      name: input.name,
      status: "nuevo",
    })
    .select("*")
    .single<Contact>();
}

export async function updateContactName(contactId: string, name: string) {
  const supabase = createAdminClient();

  return supabase
    .from("contacts")
    .update({ name })
    .eq("id", contactId)
    .select("*")
    .single<Contact>();
}

export async function findConversationByContactId(contactId: string) {
  const supabase = createAdminClient();

  return supabase
    .from("conversations")
    .select("*")
    .eq("contact_id", contactId)
    .maybeSingle<Conversation>();
}

export async function createConversation(input: {
  businessId: string;
  contactId: string;
  lastMessageAt: string;
}) {
  const supabase = createAdminClient();

  return supabase
    .from("conversations")
    .insert({
      business_id: input.businessId,
      contact_id: input.contactId,
      last_message_at: input.lastMessageAt,
      ai_status: "nuevo",
    })
    .select("*")
    .single<Conversation>();
}

export async function touchConversation(input: {
  conversationId: string;
  lastMessageAt: string;
  resetAiStatus: boolean;
}) {
  const supabase = createAdminClient();

  return supabase
    .from("conversations")
    .update({
      last_message_at: input.lastMessageAt,
      ...(input.resetAiStatus ? { ai_status: "nuevo" } : {}),
    })
    .eq("id", input.conversationId)
    .select("*")
    .single<Conversation>();
}

export async function findMessageByWaId(businessId: string, waMessageId: string) {
  const supabase = createAdminClient();

  return supabase
    .from("messages")
    .select("id")
    .eq("business_id", businessId)
    .eq("wa_message_id", waMessageId)
    .maybeSingle<{ id: string }>();
}

export async function createMessage(input: {
  businessId: string;
  conversationId: string;
  waMessageId: string;
  direction: "inbound" | "outbound";
  type: string;
  body: string | null;
  rawPayload: Record<string, unknown>;
  createdAt: string;
}) {
  const supabase = createAdminClient();

  return supabase
    .from("messages")
    .insert({
      business_id: input.businessId,
      conversation_id: input.conversationId,
      wa_message_id: input.waMessageId,
      direction: input.direction,
      type: input.type,
      body: input.body,
      raw_payload: input.rawPayload,
      created_at: input.createdAt,
    })
    .select("*")
    .single<Message>();
}
