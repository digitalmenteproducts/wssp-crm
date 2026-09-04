-- Agente IA multiempresa: settings, knowledge, usage + handoff en conversations

-- ---------------------------------------------------------------------------
-- conversations: handoff / pause agent (orthogonal to ai_status classification)
-- ---------------------------------------------------------------------------
alter table public.conversations
  add column if not exists agent_paused boolean not null default false;

alter table public.conversations
  add column if not exists human_handoff_at timestamptz;

alter table public.conversations
  add column if not exists human_handoff_reason text;

alter table public.conversations
  add column if not exists agent_failed_attempts integer not null default 0;

-- ---------------------------------------------------------------------------
-- ai_agent_settings (1:1 por business; enabled=false por defecto)
-- ---------------------------------------------------------------------------
create table if not exists public.ai_agent_settings (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null unique references public.businesses (id) on delete cascade,
  enabled boolean not null default false,
  agent_name text not null default 'Asistente',
  business_name text not null default '',
  business_description text not null default '',
  system_instructions text not null default '',
  tone text not null default 'profesional'
    check (tone in ('profesional', 'amigable', 'comercial', 'directo', 'personalizado')),
  custom_tone_instructions text not null default '',
  language text not null default 'auto'
    check (language in ('auto', 'es', 'en')),
  response_length text not null default 'breve'
    check (response_length in ('breve', 'normal', 'detallada')),
  human_handoff_enabled boolean not null default true,
  human_handoff_instructions text not null default '',
  max_failed_attempts integer not null default 2
    check (max_failed_attempts >= 1 and max_failed_attempts <= 10),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ai_agent_settings_business_id_idx
  on public.ai_agent_settings (business_id);

drop trigger if exists ai_agent_settings_set_updated_at on public.ai_agent_settings;
create trigger ai_agent_settings_set_updated_at
  before update on public.ai_agent_settings
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- ai_knowledge_entries
-- ---------------------------------------------------------------------------
create table if not exists public.ai_knowledge_entries (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  title text not null,
  content text not null,
  category text not null default 'otro'
    check (category in (
      'faq',
      'negocio',
      'productos',
      'politicas',
      'envios',
      'pagos',
      'otro'
    )),
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ai_knowledge_entries_business_id_idx
  on public.ai_knowledge_entries (business_id);

create index if not exists ai_knowledge_entries_business_enabled_idx
  on public.ai_knowledge_entries (business_id, enabled);

drop trigger if exists ai_knowledge_entries_set_updated_at on public.ai_knowledge_entries;
create trigger ai_knowledge_entries_set_updated_at
  before update on public.ai_knowledge_entries
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- ai_usage (consumo por empresa; sin facturación)
-- ---------------------------------------------------------------------------
create table if not exists public.ai_usage (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  conversation_id uuid references public.conversations (id) on delete set null,
  message_id uuid references public.messages (id) on delete set null,
  source_message_id uuid references public.messages (id) on delete set null,
  provider text not null default 'openai',
  model text not null default '',
  input_tokens integer,
  output_tokens integer,
  total_tokens integer,
  estimated_cost numeric(12, 6),
  should_handoff boolean not null default false,
  confidence text,
  created_at timestamptz not null default now()
);

create index if not exists ai_usage_business_id_created_at_idx
  on public.ai_usage (business_id, created_at desc);

-- Dedup: una respuesta de agente por mensaje inbound (cuando hay source)
create unique index if not exists ai_usage_source_message_uidx
  on public.ai_usage (source_message_id)
  where source_message_id is not null;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.ai_agent_settings enable row level security;
alter table public.ai_knowledge_entries enable row level security;
alter table public.ai_usage enable row level security;

drop policy if exists "ai_agent_settings_select_member" on public.ai_agent_settings;
create policy "ai_agent_settings_select_member"
  on public.ai_agent_settings for select
  to authenticated
  using (public.is_business_member(business_id));

drop policy if exists "ai_agent_settings_upsert_admin" on public.ai_agent_settings;
create policy "ai_agent_settings_insert_admin"
  on public.ai_agent_settings for insert
  to authenticated
  with check (public.is_business_admin(business_id));

drop policy if exists "ai_agent_settings_update_admin" on public.ai_agent_settings;
create policy "ai_agent_settings_update_admin"
  on public.ai_agent_settings for update
  to authenticated
  using (public.is_business_admin(business_id))
  with check (public.is_business_admin(business_id));

drop policy if exists "ai_knowledge_select_member" on public.ai_knowledge_entries;
create policy "ai_knowledge_select_member"
  on public.ai_knowledge_entries for select
  to authenticated
  using (public.is_business_member(business_id));

drop policy if exists "ai_knowledge_insert_admin" on public.ai_knowledge_entries;
create policy "ai_knowledge_insert_admin"
  on public.ai_knowledge_entries for insert
  to authenticated
  with check (public.is_business_admin(business_id));

drop policy if exists "ai_knowledge_update_admin" on public.ai_knowledge_entries;
create policy "ai_knowledge_update_admin"
  on public.ai_knowledge_entries for update
  to authenticated
  using (public.is_business_admin(business_id))
  with check (public.is_business_admin(business_id));

drop policy if exists "ai_knowledge_delete_admin" on public.ai_knowledge_entries;
create policy "ai_knowledge_delete_admin"
  on public.ai_knowledge_entries for delete
  to authenticated
  using (public.is_business_admin(business_id));

drop policy if exists "ai_usage_select_member" on public.ai_usage;
create policy "ai_usage_select_member"
  on public.ai_usage for select
  to authenticated
  using (public.is_business_member(business_id));

-- Inserts de usage van por service role (webhook / server); no policy insert authenticated
