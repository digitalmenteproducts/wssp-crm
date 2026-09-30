-- Fase 1: secretos de integraciones fuera de business_settings.
-- business_secrets solo es accesible con service role (sin grants ni policies
-- para anon/authenticated). Las columnas legacy de business_settings se
-- conservan hasta desplegar el código nuevo; se retiran en la fase 2
-- (supabase/pending-migrations/20260930130000_business_settings_drop_legacy_secrets.sql).

create table if not exists public.business_secrets (
  business_id uuid primary key references public.businesses (id) on delete cascade,
  openai_api_key text,
  whatsapp_access_token text,
  whatsapp_verify_token text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists business_secrets_verify_token_idx
  on public.business_secrets (whatsapp_verify_token)
  where whatsapp_verify_token is not null;

drop trigger if exists business_secrets_set_updated_at on public.business_secrets;
create trigger business_secrets_set_updated_at
  before update on public.business_secrets
  for each row execute function public.set_updated_at();

alter table public.business_secrets enable row level security;

revoke all on table public.business_secrets from public;
revoke all on table public.business_secrets from anon;
revoke all on table public.business_secrets from authenticated;
grant select, insert, update, delete on table public.business_secrets to service_role;

-- Copia inicial. Solo rellena valores que falten en business_secrets para no
-- pisar secretos escritos por el código nuevo si la migración se reejecuta.
insert into public.business_secrets (
  business_id,
  openai_api_key,
  whatsapp_access_token,
  whatsapp_verify_token
)
select
  bs.business_id,
  bs.openai_api_key,
  bs.whatsapp_access_token,
  bs.whatsapp_verify_token
from public.business_settings bs
where bs.openai_api_key is not null
   or bs.whatsapp_access_token is not null
   or bs.whatsapp_verify_token is not null
on conflict (business_id) do update set
  openai_api_key = coalesce(public.business_secrets.openai_api_key, excluded.openai_api_key),
  whatsapp_access_token = coalesce(public.business_secrets.whatsapp_access_token, excluded.whatsapp_access_token),
  whatsapp_verify_token = coalesce(public.business_secrets.whatsapp_verify_token, excluded.whatsapp_verify_token);

do $$
declare
  v_missing integer;
begin
  select count(*) into v_missing
  from public.business_settings bs
  left join public.business_secrets s on s.business_id = bs.business_id
  where (bs.openai_api_key is not null and s.openai_api_key is null)
     or (bs.whatsapp_access_token is not null and s.whatsapp_access_token is null)
     or (bs.whatsapp_verify_token is not null and s.whatsapp_verify_token is null);

  if v_missing > 0 then
    raise exception 'business_secrets: % negocio(s) sin copiar', v_missing;
  end if;
end $$;

-- Transición: mientras exista código desplegado que escriba las columnas legacy
-- (OAuth, Integraciones), replica esos cambios en business_secrets.
-- security definer porque authenticated no tiene privilegios sobre business_secrets.
create or replace function public.sync_legacy_business_secrets()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if new.openai_api_key is null
       and new.whatsapp_access_token is null
       and new.whatsapp_verify_token is null then
      return new;
    end if;
  elsif new.openai_api_key is not distinct from old.openai_api_key
    and new.whatsapp_access_token is not distinct from old.whatsapp_access_token
    and new.whatsapp_verify_token is not distinct from old.whatsapp_verify_token then
    return new;
  end if;

  insert into public.business_secrets (
    business_id,
    openai_api_key,
    whatsapp_access_token,
    whatsapp_verify_token
  )
  values (
    new.business_id,
    new.openai_api_key,
    new.whatsapp_access_token,
    new.whatsapp_verify_token
  )
  on conflict (business_id) do update set
    openai_api_key = excluded.openai_api_key,
    whatsapp_access_token = excluded.whatsapp_access_token,
    whatsapp_verify_token = excluded.whatsapp_verify_token;

  return new;
end;
$$;

revoke all on function public.sync_legacy_business_secrets() from public, anon, authenticated;

drop trigger if exists business_settings_sync_legacy_secrets on public.business_settings;
create trigger business_settings_sync_legacy_secrets
  after insert or update of openai_api_key, whatsapp_access_token, whatsapp_verify_token
  on public.business_settings
  for each row execute function public.sync_legacy_business_secrets();
