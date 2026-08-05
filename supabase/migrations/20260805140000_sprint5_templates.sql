-- Sprint 5: plantillas de WhatsApp

create table if not exists public.templates (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  meta_template_id text,
  name text not null,
  category text not null default 'UTILITY',
  language text not null default 'es',
  content text not null default '',
  variables jsonb not null default '[]'::jsonb,
  segment_id uuid references public.segments (id) on delete set null,
  status text not null default 'draft'
    check (status in ('draft', 'pending', 'approved', 'rejected', 'paused', 'disabled')),
  meta_raw jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, name, language)
);

create index if not exists templates_business_id_idx
  on public.templates (business_id);

create index if not exists templates_segment_id_idx
  on public.templates (segment_id);

drop trigger if exists templates_set_updated_at on public.templates;
create trigger templates_set_updated_at
  before update on public.templates
  for each row execute function public.set_updated_at();

alter table public.templates enable row level security;

drop policy if exists "templates_select_member" on public.templates;
create policy "templates_select_member"
  on public.templates for select
  to authenticated
  using (public.is_business_member(business_id));

drop policy if exists "templates_insert_admin" on public.templates;
create policy "templates_insert_admin"
  on public.templates for insert
  to authenticated
  with check (public.is_business_admin(business_id));

drop policy if exists "templates_update_admin" on public.templates;
create policy "templates_update_admin"
  on public.templates for update
  to authenticated
  using (public.is_business_admin(business_id))
  with check (public.is_business_admin(business_id));

drop policy if exists "templates_delete_admin" on public.templates;
create policy "templates_delete_admin"
  on public.templates for delete
  to authenticated
  using (public.is_business_admin(business_id));
