-- Plantillas: creación manual + envío a revisión Meta

alter table public.templates
  add column if not exists display_name text,
  add column if not exists header_text text,
  add column if not exists footer_text text,
  add column if not exists buttons jsonb not null default '[]'::jsonb,
  add column if not exists variable_examples jsonb not null default '{}'::jsonb,
  add column if not exists meta_status text,
  add column if not exists rejection_reason text,
  add column if not exists submitted_at timestamptz,
  add column if not exists approved_at timestamptz,
  add column if not exists rejected_at timestamptz,
  add column if not exists last_synced_at timestamptz;

update public.templates
set display_name = coalesce(nullif(display_name, ''), name)
where display_name is null or display_name = '';

alter table public.templates
  drop constraint if exists templates_status_check;

alter table public.templates
  add constraint templates_status_check
  check (status in (
    'draft',
    'submitting',
    'pending',
    'approved',
    'rejected',
    'paused',
    'disabled',
    'error'
  ));

create index if not exists templates_meta_template_id_idx
  on public.templates (business_id, meta_template_id)
  where meta_template_id is not null;
