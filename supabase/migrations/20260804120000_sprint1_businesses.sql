-- WhatsCRM AI — Sprint 1: empresas, miembros y configuración
-- Ejecutar en Supabase → SQL Editor → Run

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- businesses
-- ---------------------------------------------------------------------------
create table if not exists public.businesses (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  support_email text,
  timezone text not null default 'America/Caracas',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- business_users
-- ---------------------------------------------------------------------------
create table if not exists public.business_users (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null default 'owner'
    check (role in ('owner', 'admin', 'member')),
  created_at timestamptz not null default now(),
  unique (business_id, user_id)
);

create index if not exists business_users_user_id_idx
  on public.business_users (user_id);

-- ---------------------------------------------------------------------------
-- business_settings (secretos solo server-side; no exponer al cliente)
-- ---------------------------------------------------------------------------
create table if not exists public.business_settings (
  business_id uuid primary key references public.businesses (id) on delete cascade,
  openai_api_key text,
  whatsapp_access_token text,
  whatsapp_phone_number_id text,
  whatsapp_business_account_id text,
  whatsapp_verify_token text,
  classification_prompt text,
  ai_engine_enabled boolean not null default true,
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- updated_at helper
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists businesses_set_updated_at on public.businesses;
create trigger businesses_set_updated_at
  before update on public.businesses
  for each row execute function public.set_updated_at();

drop trigger if exists business_settings_set_updated_at on public.business_settings;
create trigger business_settings_set_updated_at
  before update on public.business_settings
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Atomic onboarding: crea empresa + membership + settings
-- ---------------------------------------------------------------------------
create or replace function public.create_business_for_current_user(
  p_name text,
  p_slug text,
  p_support_email text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_business_id uuid;
begin
  if v_uid is null then
    raise exception 'No autenticado';
  end if;

  if exists (
    select 1 from public.business_users where user_id = v_uid
  ) then
    select business_id into v_business_id
    from public.business_users
    where user_id = v_uid
    order by created_at asc
    limit 1;
    return v_business_id;
  end if;

  insert into public.businesses (name, slug, support_email)
  values (p_name, p_slug, p_support_email)
  returning id into v_business_id;

  insert into public.business_users (business_id, user_id, role)
  values (v_business_id, v_uid, 'owner');

  insert into public.business_settings (business_id, classification_prompt)
  values (
    v_business_id,
    'Analiza la conversación de WhatsApp y extrae en JSON: producto principal, producto específico, resumen, estado comercial, motivo de no compra, intención y atributos comerciales relevantes para un restaurante.'
  );

  return v_business_id;
end;
$$;

revoke all on function public.create_business_for_current_user(text, text, text) from public;
grant execute on function public.create_business_for_current_user(text, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.businesses enable row level security;
alter table public.business_users enable row level security;
alter table public.business_settings enable row level security;

-- businesses
drop policy if exists "businesses_select_member" on public.businesses;
create policy "businesses_select_member"
  on public.businesses for select
  to authenticated
  using (
    exists (
      select 1 from public.business_users bu
      where bu.business_id = businesses.id and bu.user_id = auth.uid()
    )
  );

drop policy if exists "businesses_update_owner_admin" on public.businesses;
create policy "businesses_update_owner_admin"
  on public.businesses for update
  to authenticated
  using (
    exists (
      select 1 from public.business_users bu
      where bu.business_id = businesses.id
        and bu.user_id = auth.uid()
        and bu.role in ('owner', 'admin')
    )
  )
  with check (
    exists (
      select 1 from public.business_users bu
      where bu.business_id = businesses.id
        and bu.user_id = auth.uid()
        and bu.role in ('owner', 'admin')
    )
  );

-- business_users
drop policy if exists "business_users_select_same_business" on public.business_users;
create policy "business_users_select_same_business"
  on public.business_users for select
  to authenticated
  using (
    user_id = auth.uid()
    or exists (
      select 1 from public.business_users me
      where me.business_id = business_users.business_id
        and me.user_id = auth.uid()
    )
  );

-- business_settings
drop policy if exists "business_settings_select_member" on public.business_settings;
create policy "business_settings_select_member"
  on public.business_settings for select
  to authenticated
  using (
    exists (
      select 1 from public.business_users bu
      where bu.business_id = business_settings.business_id
        and bu.user_id = auth.uid()
    )
  );

drop policy if exists "business_settings_update_owner_admin" on public.business_settings;
create policy "business_settings_update_owner_admin"
  on public.business_settings for update
  to authenticated
  using (
    exists (
      select 1 from public.business_users bu
      where bu.business_id = business_settings.business_id
        and bu.user_id = auth.uid()
        and bu.role in ('owner', 'admin')
    )
  )
  with check (
    exists (
      select 1 from public.business_users bu
      where bu.business_id = business_settings.business_id
        and bu.user_id = auth.uid()
        and bu.role in ('owner', 'admin')
    )
  );
