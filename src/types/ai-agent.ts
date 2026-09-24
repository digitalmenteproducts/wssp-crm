export type AiAgentTone =
  | "profesional"
  | "amigable"
  | "comercial"
  | "directo"
  | "personalizado";

export type AiAgentLanguage = "auto" | "es" | "en";

export type AiAgentResponseLength = "breve" | "normal" | "detallada";

export type AiKnowledgeCategory =
  | "faq"
  | "negocio"
  | "productos"
  | "politicas"
  | "envios"
  | "pagos"
  | "otro";

export type AiAgentConfidence = "high" | "medium" | "low";

export type AiAgentSettings = {
  id: string;
  business_id: string;
  enabled: boolean;
  agent_name: string;
  business_name: string;
  business_description: string;
  system_instructions: string;
  tone: AiAgentTone;
  custom_tone_instructions: string;
  language: AiAgentLanguage;
  response_length: AiAgentResponseLength;
  human_handoff_enabled: boolean;
  human_handoff_instructions: string;
  max_failed_attempts: number;
  /** Independent of `enabled`. Requires industry=clinic to take effect. */
  clinic_appointment_tools_enabled: boolean;
  created_at: string;
  updated_at: string;
};

export type AiKnowledgeEntry = {
  id: string;
  business_id: string;
  title: string;
  content: string;
  category: AiKnowledgeCategory;
  enabled: boolean;
  created_at: string;
  updated_at: string;
};

export type AiUsageRow = {
  id: string;
  business_id: string;
  conversation_id: string | null;
  message_id: string | null;
  source_message_id: string | null;
  provider: string;
  model: string;
  input_tokens: number | null;
  output_tokens: number | null;
  total_tokens: number | null;
  estimated_cost: number | null;
  should_handoff: boolean;
  confidence: string | null;
  created_at: string;
};

export type AiAgentReplyResult = {
  reply: string;
  should_handoff: boolean;
  handoff_reason: string | null;
  confidence: AiAgentConfidence;
};

/** Abstracción de tools del Agente IA. */
export type AiAgentToolName =
  | "searchProducts"
  | "checkInventory"
  | "getProductDetails"
  | "createOrder"
  | "createReservation"
  | "sendPaymentLink"
  | "clinic_list_resources"
  | "clinic_get_availability"
  | "clinic_list_my_appointments"
  | "clinic_create_appointment"
  | "clinic_reschedule_appointment"
  | "clinic_cancel_appointment";

export type AiAgentToolDescriptor = {
  name: AiAgentToolName;
  description: string;
};
