import type { ContactBoardStatus } from "@/types";

export type AiAnalysisRecord = {
  id: string;
  conversation_id: string;
  business_id: string;
  contact_id: string;
  summary: string | null;
  product: string | null;
  subcategory: string | null;
  intent: string | null;
  status: string | null;
  reason: string | null;
  segment: string | null;
  confidence: number | null;
  attributes: Record<string, unknown>;
  raw_json: Record<string, unknown>;
  created_at: string;
};

export type SegmentRuleOperator = "and" | "or";

export type SegmentRuleCondition = {
  field:
    | "product"
    | "subcategory"
    | "intent"
    | "contact_status"
    | "reason"
    | "segment"
    | "last_message_within_days";
  op: "eq" | "contains" | "lte" | "gte";
  value: string | number | boolean;
};

export type SegmentRules = {
  operator: SegmentRuleOperator;
  conditions: SegmentRuleCondition[];
};

export type Segment = {
  id: string;
  business_id: string;
  name: string;
  description: string | null;
  rules_json: SegmentRules;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type ContactSegmentMatch = {
  contactId: string;
  phone: string;
  name: string | null;
  status: ContactBoardStatus;
  product: string | null;
  summary: string | null;
  lastMessageAt: string | null;
};
