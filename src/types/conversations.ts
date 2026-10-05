import type { MessageDirection } from "@/types";

export type ConversationListItem = {
  id: string;
  contact_name: string | null;
  contact_phone: string | null;
  last_message_at: string | null;
  last_message_body: string | null;
  last_message_type: string | null;
  last_message_direction: MessageDirection | null;
};

export type ConversationMessageView = {
  id: string;
  direction: MessageDirection;
  type: string;
  body: string | null;
  created_at: string;
  is_ai: boolean;
  is_simulation: boolean;
};

export type SelectedConversation = {
  id: string;
  contact_name: string | null;
  contact_phone: string | null;
  messages: ConversationMessageView[];
};
