export type CampaignStatus =
  | "draft"
  | "sending"
  | "completed"
  | "failed"
  | "partial";

export type CampaignSendStatus =
  | "pending"
  | "sent"
  | "failed"
  | "skipped";

export type Campaign = {
  id: string;
  business_id: string;
  name: string;
  template_id: string;
  segment_id: string;
  status: CampaignStatus;
  total_recipients: number;
  sent_count: number;
  failed_count: number;
  created_by: string | null;
  error: string | null;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
  template?: { id: string; name: string } | null;
  segment?: { id: string; name: string } | null;
};

export type CampaignSend = {
  id: string;
  campaign_id: string;
  business_id: string;
  contact_id: string;
  phone: string;
  status: CampaignSendStatus;
  wa_message_id: string | null;
  error: string | null;
  sent_at: string | null;
  created_at: string;
};
