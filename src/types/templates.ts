export type TemplateStatus =
  | "draft"
  | "submitting"
  | "pending"
  | "approved"
  | "rejected"
  | "paused"
  | "disabled"
  | "error";

export type TemplateButtonType = "QUICK_REPLY" | "URL" | "PHONE_NUMBER";

export type TemplateButton = {
  type: TemplateButtonType;
  text: string;
  url?: string;
  phone_number?: string;
};

export type Template = {
  id: string;
  business_id: string;
  meta_template_id: string | null;
  name: string;
  display_name: string;
  category: string;
  language: string;
  content: string;
  header_text: string | null;
  footer_text: string | null;
  buttons: TemplateButton[];
  variables: string[];
  variable_examples: Record<string, string>;
  segment_id: string | null;
  status: TemplateStatus;
  meta_status: string | null;
  rejection_reason: string | null;
  meta_raw: Record<string, unknown>;
  submitted_at: string | null;
  approved_at: string | null;
  rejected_at: string | null;
  last_synced_at: string | null;
  created_at: string;
  updated_at: string;
  segment?: { id: string; name: string } | null;
};

export type TemplateListItem = Template;
