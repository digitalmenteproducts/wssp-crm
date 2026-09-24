-- Clinic Services module: structured treatments for booking
-- Non-destructive. Keeps clinic_appointments.service_name for legacy.

-- ---------------------------------------------------------------------------
-- clinic_services
-- ---------------------------------------------------------------------------
create table if not exists public.clinic_services (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  name text not null,
  duration_minutes integer not null default 30
    check (duration_minutes in (15, 20, 30, 45, 60, 90, 120)),
  requires_initial_consultation boolean not null default false,
  initial_consultation_service_id uuid null
    references public.clinic_services (id) on delete set null,
  use_specific_availability boolean not null default false,
  active boolean not null default true,
  admin_notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint clinic_services_name_len check (char_length(trim(name)) between 1 and 120),
  constraint clinic_services_notes_len check (char_length(admin_notes) <= 2000)
);

create unique index if not exists clinic_services_business_name_uidx
  on public.clinic_services (business_id, lower(trim(name)));

create index if not exists clinic_services_business_active_idx
  on public.clinic_services (business_id, active);

drop trigger if exists clinic_services_set_updated_at on public.clinic_services;
create trigger clinic_services_set_updated_at
  before update on public.clinic_services
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- clinic_service_resources (M2M service ↔ professional)
-- ---------------------------------------------------------------------------
create table if not exists public.clinic_service_resources (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  service_id uuid not null references public.clinic_services (id) on delete cascade,
  resource_id uuid not null references public.clinic_calendar_resources (id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint clinic_service_resources_unique unique (service_id, resource_id)
);

create index if not exists clinic_service_resources_business_idx
  on public.clinic_service_resources (business_id);

create index if not exists clinic_service_resources_resource_idx
  on public.clinic_service_resources (resource_id);

create index if not exists clinic_service_resources_service_idx
  on public.clinic_service_resources (service_id);

-- Same-business integrity for M2M
create or replace function public.clinic_service_resource_same_business()
returns trigger
language plpgsql
as $$
declare
  svc_biz uuid;
  res_biz uuid;
begin
  select business_id into svc_biz from public.clinic_services where id = new.service_id;
  select business_id into res_biz from public.clinic_calendar_resources where id = new.resource_id;
  if svc_biz is null or res_biz is null or svc_biz <> res_biz or svc_biz <> new.business_id then
    raise exception 'clinic_service_resources: service/resource/business mismatch';
  end if;
  return new;
end;
$$;

drop trigger if exists clinic_service_resources_biz_check on public.clinic_service_resources;
create trigger clinic_service_resources_biz_check
  before insert or update on public.clinic_service_resources
  for each row execute function public.clinic_service_resource_same_business();

-- ---------------------------------------------------------------------------
-- clinic_service_availability (optional weekly windows per service)
-- ---------------------------------------------------------------------------
create table if not exists public.clinic_service_availability (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  service_id uuid not null references public.clinic_services (id) on delete cascade,
  day_of_week smallint not null check (day_of_week between 0 and 6),
  start_time time not null,
  end_time time not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint clinic_service_availability_time_order check (end_time > start_time)
);

create index if not exists clinic_service_availability_service_day_idx
  on public.clinic_service_availability (service_id, day_of_week)
  where active = true;

drop trigger if exists clinic_service_availability_set_updated_at
  on public.clinic_service_availability;
create trigger clinic_service_availability_set_updated_at
  before update on public.clinic_service_availability
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- clinic_appointments.service_id (nullable, legacy-safe)
-- ---------------------------------------------------------------------------
alter table public.clinic_appointments
  add column if not exists service_id uuid null
    references public.clinic_services (id) on delete set null;

create index if not exists clinic_appointments_service_id_idx
  on public.clinic_appointments (service_id);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.clinic_services enable row level security;
alter table public.clinic_service_resources enable row level security;
alter table public.clinic_service_availability enable row level security;

drop policy if exists "clinic_services_select_member" on public.clinic_services;
create policy "clinic_services_select_member"
  on public.clinic_services for select
  using (public.is_business_member(business_id));

drop policy if exists "clinic_services_write_admin" on public.clinic_services;
create policy "clinic_services_write_admin"
  on public.clinic_services for all
  using (public.is_business_admin(business_id))
  with check (public.is_business_admin(business_id));

drop policy if exists "clinic_service_resources_select_member" on public.clinic_service_resources;
create policy "clinic_service_resources_select_member"
  on public.clinic_service_resources for select
  using (public.is_business_member(business_id));

drop policy if exists "clinic_service_resources_write_admin" on public.clinic_service_resources;
create policy "clinic_service_resources_write_admin"
  on public.clinic_service_resources for all
  using (public.is_business_admin(business_id))
  with check (public.is_business_admin(business_id));

drop policy if exists "clinic_service_availability_select_member" on public.clinic_service_availability;
create policy "clinic_service_availability_select_member"
  on public.clinic_service_availability for select
  using (public.is_business_member(business_id));

drop policy if exists "clinic_service_availability_write_admin" on public.clinic_service_availability;
create policy "clinic_service_availability_write_admin"
  on public.clinic_service_availability for all
  using (public.is_business_admin(business_id))
  with check (public.is_business_admin(business_id));

comment on table public.clinic_services is
  'Structured clinic treatments for booking. Knowledge remains descriptive; this table is the source of truth for reservable services.';
comment on column public.clinic_appointments.service_id is
  'Optional FK to clinic_services. Legacy rows may be null and keep service_name snapshot.';
