export const BUSINESS_INDUSTRIES = [
  "clinic",
  "restaurant",
  "ecommerce",
  "real_estate",
  "legal",
  "tourism",
  "services",
  "other",
] as const;

export type BusinessIndustry = (typeof BUSINESS_INDUSTRIES)[number];

export const BUSINESS_ROLES = ["owner", "admin", "professional", "member"] as const;

/** `member` es legacy: se conserva por retrocompatibilidad y no se ofrece para nuevas altas. */
export type BusinessRole = (typeof BUSINESS_ROLES)[number];

export type Business = {
  id: string;
  name: string;
  slug: string;
  support_email: string | null;
  timezone: string;
  industry: BusinessIndustry;
  created_at: string;
  updated_at: string;
};

/** Fila de list_business_members: solo los campos de la pantalla Equipo. */
export type BusinessMember = {
  user_id: string;
  name: string | null;
  email: string | null;
  role: BusinessRole;
  joined_at: string;
  is_current_user: boolean;
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

/** Columnas operativas de business_settings. Los secretos viven en business_secrets. */
export type BusinessSettings = {
  business_id: string;
  whatsapp_phone_number_id: string | null;
  whatsapp_business_account_id: string | null;
  whatsapp_token_expires_at: string | null;
  whatsapp_connection_status: WhatsAppConnectionStatus;
  whatsapp_connected_at: string | null;
  whatsapp_display_phone: string | null;
  whatsapp_coexistence: boolean;
  classification_prompt: string | null;
  classification_inactivity_hours: number;
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
