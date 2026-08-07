-- Unique WhatsApp phone_number_id per tenant (NULL allowed = not configured yet)

do $$
begin
  if exists (
    select 1
    from public.business_settings
    where whatsapp_phone_number_id is not null
    group by whatsapp_phone_number_id
    having count(*) > 1
  ) then
    raise exception
      'No se puede crear UNIQUE en whatsapp_phone_number_id: hay duplicados.';
  end if;
end $$;

drop index if exists public.business_settings_phone_number_id_idx;

create unique index if not exists business_settings_phone_number_id_uidx
  on public.business_settings (whatsapp_phone_number_id)
  where whatsapp_phone_number_id is not null;
