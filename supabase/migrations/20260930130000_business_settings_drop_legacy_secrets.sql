-- Fase 2: retirar los secretos legacy de business_settings.
-- business_secrets (20260930120000) queda como única fuente de
-- openai_api_key, whatsapp_access_token y whatsapp_verify_token.
-- Idempotente: si las columnas ya no existen, solo limpia trigger/función.

do $$
declare
  v_missing integer;
begin
  if to_regclass('public.business_secrets') is null then
    raise exception 'Falta public.business_secrets (aplica 20260930120000 primero)';
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'business_settings'
      and column_name in ('openai_api_key', 'whatsapp_access_token', 'whatsapp_verify_token')
    group by table_name
    having count(*) = 3
  ) then
    execute $q$
      select count(*)
      from public.business_settings bs
      left join public.business_secrets s on s.business_id = bs.business_id
      where (bs.openai_api_key is not null and s.openai_api_key is null)
         or (bs.whatsapp_access_token is not null and s.whatsapp_access_token is null)
         or (bs.whatsapp_verify_token is not null and s.whatsapp_verify_token is null)
    $q$ into v_missing;

    if v_missing > 0 then
      raise exception 'business_secrets: % negocio(s) sin copiar; no se retiran columnas', v_missing;
    end if;
  end if;
end $$;

drop trigger if exists business_settings_sync_legacy_secrets on public.business_settings;
drop function if exists public.sync_legacy_business_secrets();

drop index if exists public.business_settings_verify_token_idx;

alter table public.business_settings drop column if exists openai_api_key;
alter table public.business_settings drop column if exists whatsapp_access_token;
alter table public.business_settings drop column if exists whatsapp_verify_token;
