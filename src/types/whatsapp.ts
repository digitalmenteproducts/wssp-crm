import type {
  ContactBoardStatus,
  ConversationAiStatus,
  MessageDirection,
} from "@/types";

export type Contact = {
  id: string;
  business_id: string;
  phone: string;
  name: string | null;
  status: ContactBoardStatus;
  created_at: string;
  updated_at: string;
};

export type Conversation = {
  id: string;
  contact_id: string;
  business_id: string;
  last_message_at: string | null;
  ai_status: ConversationAiStatus;
  created_at: string;
  updated_at: string;
};

export type Message = {
  id: string;
  conversation_id: string;
  business_id: string;
  wa_message_id: string | null;
  direction: MessageDirection;
  type: string;
  body: string | null;
  raw_payload: Record<string, unknown> | null;
  created_at: string;
};

export type InboundWhatsAppMessage = {
  businessId: string;
  phoneNumberId: string;
  fromPhone: string;
  contactName: string | null;
  waMessageId: string;
  type: string;
  body: string | null;
  timestamp: string;
  raw: Record<string, unknown>;
};
