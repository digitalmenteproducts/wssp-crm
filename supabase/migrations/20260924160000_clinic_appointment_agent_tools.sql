-- Clinic appointment tools for AI agent (feature-flagged, off by default)
-- Non-destructive.

alter table public.ai_agent_settings
  add column if not exists clinic_appointment_tools_enabled boolean not null default false;

comment on column public.ai_agent_settings.clinic_appointment_tools_enabled is
  'When true AND business.industry=clinic, agent may use AppointmentService tools. Independent of enabled.';

alter table public.conversations
  add column if not exists agent_metadata jsonb not null default '{}'::jsonb;

comment on column public.conversations.agent_metadata is
  'Ephemeral agent state (e.g. appointment_intent). Not for secrets.';
