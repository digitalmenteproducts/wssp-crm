-- OAuth / Embedded Signup: estado de conexión WhatsApp por empresa

alter table public.business_settings
  add column if not exists whatsapp_token_expires_at timestamptz;

alter table public.business_settings
  add column if not exists whatsapp_connection_status text not null default 'disconnected';

alter table public.business_settings
  drop constraint if exists business_settings_whatsapp_connection_status_check;

alter table public.business_settings
  add constraint business_settings_whatsapp_connection_status_check
  check (
    whatsapp_connection_status in (
      'disconnected',
      'pending',
      'connected',
      'error'
    )
  );

alter table public.business_settings
  add column if not exists whatsapp_connected_at timestamptz;
