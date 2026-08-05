-- Sprint 6: campañas y envíos de plantillas

create table if not exists public.campaigns (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  name text not null,
  template_id uuid not null references public.templates (id) on delete restrict,
  segment_id uuid not null references public.segments (id) on delete restrict,
  status text not null default 'draft'
    check (status in ('draft', 'sending', 'completed', 'failed', 'partial')),
  total_recipients integer not null default 0,
  sent_count integer not null default 0,
  failed_count integer not null default 0,
  created_by uuid references auth.users (id) on delete set null,
  error text,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz
);

create index if not exists campaigns_business_id_idx
  on public.campaigns (business_id);

create index if not exists campaigns_created_at_idx
  on public.campaigns (business_id, created_at desc);

create table if not exists public.campaign_sends (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns (id) on delete cascade,
  business_id uuid not null references public.businesses (id) on delete cascade,
  contact_id uuid not null references public.contacts (id) on delete cascade,
  phone text not null,
  status text not null default 'pending'
    check (status in ('pending', 'sent', 'failed', 'skipped')),
  wa_message_id text,
  error text,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists campaign_sends_campaign_id_idx
  on public.campaign_sends (campaign_id);

create index if not exists campaign_sends_business_id_idx
  on public.campaign_sends (business_id);

alter table public.campaigns enable row level security;
alter table public.campaign_sends enable row level security;

drop policy if exists "campaigns_select_member" on public.campaigns;
create policy "campaigns_select_member"
  on public.campaigns for select
  to authenticated
  using (public.is_business_member(business_id));

drop policy if exists "campaigns_insert_admin" on public.campaigns;
create policy "campaigns_insert_admin"
  on public.campaigns for insert
  to authenticated
  with check (public.is_business_admin(business_id));

drop policy if exists "campaigns_update_admin" on public.campaigns;
create policy "campaigns_update_admin"
  on public.campaigns for update
  to authenticated
  using (public.is_business_admin(business_id))
  with check (public.is_business_admin(business_id));

drop policy if exists "campaign_sends_select_member" on public.campaign_sends;
create policy "campaign_sends_select_member"
  on public.campaign_sends for select
  to authenticated
  using (public.is_business_member(business_id));

drop policy if exists "campaign_sends_insert_admin" on public.campaign_sends;
create policy "campaign_sends_insert_admin"
  on public.campaign_sends for insert
  to authenticated
  with check (public.is_business_admin(business_id));

drop policy if exists "campaign_sends_update_admin" on public.campaign_sends;
create policy "campaign_sends_update_admin"
  on public.campaign_sends for update
  to authenticated
  using (public.is_business_admin(business_id))
  with check (public.is_business_admin(business_id));
