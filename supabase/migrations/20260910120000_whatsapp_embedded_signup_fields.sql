-- Display phone + flag coexistence for Embedded Signup

alter table public.business_settings
  add column if not exists whatsapp_display_phone text;

alter table public.business_settings
  add column if not exists whatsapp_coexistence boolean not null default false;
