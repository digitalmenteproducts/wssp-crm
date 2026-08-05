export type TemplateStatus =
  | "draft"
  | "pending"
  | "approved"
  | "rejected"
  | "paused"
  | "disabled";

export type Template = {
  id: string;
  business_id: string;
  meta_template_id: string | null;
  name: string;
  category: string;
  language: string;
  content: string;
  variables: string[];
  segment_id: string | null;
  status: TemplateStatus;
  meta_raw: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  segment?: { id: string; name: string } | null;
};

export type TemplateListItem = Template;
