/**
 * Tipos compartidos del dominio WhatsCRM AI.
 * Los tipos generados desde Supabase se añadirán en sprints posteriores.
 */

export type ContactBoardStatus =
  | "nuevo"
  | "interesado"
  | "no_compro"
  | "cliente"
  | "no_contactar";

export type ConversationAiStatus =
  | "nuevo"
  | "procesando"
  | "analizado"
  | "error";

export type MessageDirection = "inbound" | "outbound";

export type {
  Contact,
  Conversation,
  InboundWhatsAppMessage,
  Message,
} from "@/types/whatsapp";

export type {
  AiAnalysisRecord,
  ContactSegmentMatch,
  Segment,
  SegmentRuleCondition,
  SegmentRules,
} from "@/types/ai";

export type {
  ContactBoard,
  ContactBoardCard,
  ContactBoardColumn,
} from "@/types/contacts";

export {
  CONTACT_BOARD_LABELS,
  CONTACT_BOARD_STATUSES,
} from "@/types/contacts";

export type { Template, TemplateStatus } from "@/types/templates";

export type {
  Business,
  BusinessRole,
  BusinessSettings,
  BusinessSettingsPublic,
  BusinessUser,
  BusinessWorkspace,
} from "@/types/business";
