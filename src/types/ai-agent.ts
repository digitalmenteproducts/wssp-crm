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

/** Abstracción futura para tools (inventario, pedidos, etc.). Sin implementación. */
export type AiAgentToolName =
  | "searchProducts"
  | "checkInventory"
  | "getProductDetails"
  | "createOrder"
  | "createReservation"
  | "sendPaymentLink";

export type AiAgentToolDescriptor = {
  name: AiAgentToolName;
  description: string;
};
