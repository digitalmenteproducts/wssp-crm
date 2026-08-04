-- WhatsCRM AI — Sprint 2: contactos, conversaciones y mensajes

create table if not exists public.contacts (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  phone text not null,
  name text,
  status text not null default 'nuevo'
    check (status in ('nuevo', 'interesado', 'no_compro', 'cliente', 'no_contactar')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, phone)
);

create index if not exists contacts_business_id_idx
  on public.contacts (business_id);

create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references public.contacts (id) on delete cascade,
  business_id uuid not null references public.businesses (id) on delete cascade,
  last_message_at timestamptz,
  ai_status text not null default 'nuevo'
    check (ai_status in ('nuevo', 'procesando', 'analizado', 'error')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (contact_id)
);

create index if not exists conversations_business_id_idx
  on public.conversations (business_id);

create index if not exists conversations_ai_status_idx
  on public.conversations (ai_status);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  business_id uuid not null references public.businesses (id) on delete cascade,
  wa_message_id text,
  direction text not null check (direction in ('inbound', 'outbound')),
  type text not null default 'text',
  body text,
  raw_payload jsonb,
  created_at timestamptz not null default now(),
  unique (business_id, wa_message_id)
);

create index if not exists messages_conversation_id_idx
  on public.messages (conversation_id);

create index if not exists messages_business_id_created_at_idx
  on public.messages (business_id, created_at desc);

drop trigger if exists contacts_set_updated_at on public.contacts;
create trigger contacts_set_updated_at
  before update on public.contacts
  for each row execute function public.set_updated_at();

drop trigger if exists conversations_set_updated_at on public.conversations;
create trigger conversations_set_updated_at
  before update on public.conversations
  for each row execute function public.set_updated_at();

-- Indexes for webhook lookups on settings
create index if not exists business_settings_phone_number_id_idx
  on public.business_settings (whatsapp_phone_number_id)
  where whatsapp_phone_number_id is not null;

create index if not exists business_settings_verify_token_idx
  on public.business_settings (whatsapp_verify_token)
  where whatsapp_verify_token is not null;

alter table public.contacts enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;

drop policy if exists "contacts_select_member" on public.contacts;
create policy "contacts_select_member"
  on public.contacts for select
  to authenticated
  using (public.is_business_member(business_id));

drop policy if exists "contacts_update_member" on public.contacts;
create policy "contacts_update_member"
  on public.contacts for update
  to authenticated
  using (public.is_business_member(business_id))
  with check (public.is_business_member(business_id));

drop policy if exists "conversations_select_member" on public.conversations;
create policy "conversations_select_member"
  on public.conversations for select
  to authenticated
  using (public.is_business_member(business_id));

drop policy if exists "messages_select_member" on public.messages;
create policy "messages_select_member"
  on public.messages for select
  to authenticated
  using (public.is_business_member(business_id));

-- Inserts del webhook usan service role (bypass RLS).
-- Usuarios autenticados solo leen por ahora.
