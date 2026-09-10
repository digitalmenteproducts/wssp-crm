export type BusinessRole = "owner" | "admin" | "member";

export type Business = {
  id: string;
  name: string;
  slug: string;
  support_email: string | null;
  timezone: string;
  created_at: string;
  updated_at: string;
};

export type BusinessUser = {
  id: string;
  business_id: string;
  user_id: string;
  role: BusinessRole;
  created_at: string;
};

export type WhatsAppConnectionStatus =
  | "disconnected"
  | "pending"
  | "connected"
  | "error";

export type BusinessSettings = {
  business_id: string;
  openai_api_key: string | null;
  whatsapp_access_token: string | null;
  whatsapp_phone_number_id: string | null;
  whatsapp_business_account_id: string | null;
  whatsapp_verify_token: string | null;
  whatsapp_token_expires_at: string | null;
  whatsapp_connection_status: WhatsAppConnectionStatus;
  whatsapp_connected_at: string | null;
  whatsapp_display_phone: string | null;
  whatsapp_coexistence: boolean;
  classification_prompt: string | null;
  ai_engine_enabled: boolean;
  updated_at: string;
};

/** Vista segura para UI: secretos enmascarados, nunca el valor completo. */
export type BusinessSettingsPublic = {
  business_id: string;
  openai_api_key_set: boolean;
  openai_api_key_hint: string | null;
  whatsapp_access_token_set: boolean;
  whatsapp_access_token_hint: string | null;
  whatsapp_phone_number_id: string | null;
  whatsapp_business_account_id: string | null;
  whatsapp_verify_token_set: boolean;
  whatsapp_verify_token_hint: string | null;
  whatsapp_token_expires_at: string | null;
  whatsapp_connection_status: WhatsAppConnectionStatus;
  whatsapp_connected_at: string | null;
  whatsapp_display_phone: string | null;
  whatsapp_coexistence: boolean;
  classification_prompt: string | null;
  ai_engine_enabled: boolean;
  whatsapp_connected: boolean;
  updated_at: string;
};

export type BusinessWorkspace = {
  business: Business;
  membership: BusinessUser;
  settings: BusinessSettingsPublic;
};
