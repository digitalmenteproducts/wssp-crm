-- Multi-industry base + Clinic Agenda MVP
-- Non-destructive. Reuses businesses.timezone. Adds businesses.industry.

-- ---------------------------------------------------------------------------
-- Extension for exclusion constraints (uuid + range)
-- ---------------------------------------------------------------------------
create extension if not exists btree_gist;

-- ---------------------------------------------------------------------------
-- businesses.industry (multi-nicho; solo clinic tiene features por ahora)
-- ---------------------------------------------------------------------------
alter table public.businesses
  add column if not exists industry text not null default 'other';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'businesses_industry_check'
  ) then
    alter table public.businesses
      add constraint businesses_industry_check
      check (industry in (
        'clinic',
        'restaurant',
        'ecommerce',
        'real_estate',
        'legal',
        'tourism',
        'services',
        'other'
      ));
  end if;
end $$;

create index if not exists businesses_industry_idx
  on public.businesses (industry);

-- CLINICA PASTORE: industry=clinic + timezone Tucumán (agenda-aware)
update public.businesses
set
  industry = 'clinic',
  timezone = 'America/Argentina/Tucuman'
where id = 'ee05dfbd-839b-4f52-be6f-327080995e56'
  and slug = 'clinica-pastore';

-- ---------------------------------------------------------------------------
-- clinic_calendar_resources (profesionales / recursos)
-- ---------------------------------------------------------------------------
create table if not exists public.clinic_calendar_resources (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint clinic_calendar_resources_name_len check (char_length(trim(name)) between 1 and 120)
);

create index if not exists clinic_calendar_resources_business_id_idx
  on public.clinic_calendar_resources (business_id);

create index if not exists clinic_calendar_resources_business_active_idx
  on public.clinic_calendar_resources (business_id, active);

drop trigger if exists clinic_calendar_resources_set_updated_at on public.clinic_calendar_resources;
create trigger clinic_calendar_resources_set_updated_at
  before update on public.clinic_calendar_resources
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- clinic_availability (bloques semanales)
-- day_of_week: 0=Sunday … 6=Saturday (ISO-ish JS getDay)
-- ---------------------------------------------------------------------------
create table if not exists public.clinic_availability (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  resource_id uuid not null references public.clinic_calendar_resources (id) on delete cascade,
  day_of_week smallint not null
    check (day_of_week between 0 and 6),
  start_time time not null,
  end_time time not null,
  slot_duration_minutes integer not null default 30
    check (slot_duration_minutes in (15, 20, 30, 45, 60, 90, 120)),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint clinic_availability_time_order check (end_time > start_time)
);

create index if not exists clinic_availability_business_id_idx
  on public.clinic_availability (business_id);

create index if not exists clinic_availability_resource_day_idx
  on public.clinic_availability (resource_id, day_of_week)
  where active = true;

drop trigger if exists clinic_availability_set_updated_at on public.clinic_availability;
create trigger clinic_availability_set_updated_at
  before update on public.clinic_availability
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- clinic_schedule_blocks (vacaciones / feriados / bloqueos)
-- ---------------------------------------------------------------------------
create table if not exists public.clinic_schedule_blocks (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  resource_id uuid not null references public.clinic_calendar_resources (id) on delete cascade,
  start_at timestamptz not null,
  end_at timestamptz not null,
  reason text not null default '',
  created_at timestamptz not null default now(),
  constraint clinic_schedule_blocks_time_order check (end_at > start_at),
  constraint clinic_schedule_blocks_reason_len check (char_length(reason) <= 500)
);

create index if not exists clinic_schedule_blocks_business_id_idx
  on public.clinic_schedule_blocks (business_id);

create index if not exists clinic_schedule_blocks_resource_range_idx
  on public.clinic_schedule_blocks (resource_id, start_at, end_at);

-- ---------------------------------------------------------------------------
-- clinic_appointments
-- ---------------------------------------------------------------------------
create table if not exists public.clinic_appointments (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  contact_id uuid not null references public.contacts (id) on delete restrict,
  resource_id uuid not null references public.clinic_calendar_resources (id) on delete restrict,
  title text not null default '',
  service_name text not null default '',
  start_at timestamptz not null,
  end_at timestamptz not null,
  status text not null default 'confirmed'
    check (status in ('pending', 'confirmed', 'completed', 'cancelled', 'no_show')),
  source text not null default 'manual'
    check (source in ('whatsapp_ai', 'whatsapp_human', 'manual', 'web')),
  administrative_notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint clinic_appointments_time_order check (end_at > start_at),
  constraint clinic_appointments_title_len check (char_length(title) <= 200),
  constraint clinic_appointments_service_len check (char_length(service_name) <= 200),
  constraint clinic_appointments_notes_len check (char_length(administrative_notes) <= 4000)
);

create index if not exists clinic_appointments_business_id_idx
  on public.clinic_appointments (business_id);

create index if not exists clinic_appointments_resource_start_idx
  on public.clinic_appointments (resource_id, start_at)
  where status <> 'cancelled';

create index if not exists clinic_appointments_contact_id_idx
  on public.clinic_appointments (contact_id);

drop trigger if exists clinic_appointments_set_updated_at on public.clinic_appointments;
create trigger clinic_appointments_set_updated_at
  before update on public.clinic_appointments
  for each row execute function public.set_updated_at();

-- Prevent overlapping active appointments for the same resource (race-safe).
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'clinic_appointments_no_overlap'
  ) then
    alter table public.clinic_appointments
      add constraint clinic_appointments_no_overlap
      exclude using gist (
        resource_id with =,
        tstzrange(start_at, end_at, '[)') with &&
      )
      where (status <> 'cancelled');
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.clinic_calendar_resources enable row level security;
alter table public.clinic_availability enable row level security;
alter table public.clinic_schedule_blocks enable row level security;
alter table public.clinic_appointments enable row level security;

-- resources
drop policy if exists "clinic_resources_select_member" on public.clinic_calendar_resources;
create policy "clinic_resources_select_member"
  on public.clinic_calendar_resources for select
  to authenticated
  using (public.is_business_member(business_id));

drop policy if exists "clinic_resources_insert_admin" on public.clinic_calendar_resources;
create policy "clinic_resources_insert_admin"
  on public.clinic_calendar_resources for insert
  to authenticated
  with check (public.is_business_admin(business_id));

drop policy if exists "clinic_resources_update_admin" on public.clinic_calendar_resources;
create policy "clinic_resources_update_admin"
  on public.clinic_calendar_resources for update
  to authenticated
  using (public.is_business_admin(business_id))
  with check (public.is_business_admin(business_id));

drop policy if exists "clinic_resources_delete_admin" on public.clinic_calendar_resources;
create policy "clinic_resources_delete_admin"
  on public.clinic_calendar_resources for delete
  to authenticated
  using (public.is_business_admin(business_id));

-- availability
drop policy if exists "clinic_availability_select_member" on public.clinic_availability;
create policy "clinic_availability_select_member"
  on public.clinic_availability for select
  to authenticated
  using (public.is_business_member(business_id));

drop policy if exists "clinic_availability_insert_admin" on public.clinic_availability;
create policy "clinic_availability_insert_admin"
  on public.clinic_availability for insert
  to authenticated
  with check (public.is_business_admin(business_id));

drop policy if exists "clinic_availability_update_admin" on public.clinic_availability;
create policy "clinic_availability_update_admin"
  on public.clinic_availability for update
  to authenticated
  using (public.is_business_admin(business_id))
  with check (public.is_business_admin(business_id));

drop policy if exists "clinic_availability_delete_admin" on public.clinic_availability;
create policy "clinic_availability_delete_admin"
  on public.clinic_availability for delete
  to authenticated
  using (public.is_business_admin(business_id));

-- blocks
drop policy if exists "clinic_blocks_select_member" on public.clinic_schedule_blocks;
create policy "clinic_blocks_select_member"
  on public.clinic_schedule_blocks for select
  to authenticated
  using (public.is_business_member(business_id));

drop policy if exists "clinic_blocks_insert_admin" on public.clinic_schedule_blocks;
create policy "clinic_blocks_insert_admin"
  on public.clinic_schedule_blocks for insert
  to authenticated
  with check (public.is_business_admin(business_id));

drop policy if exists "clinic_blocks_update_admin" on public.clinic_schedule_blocks;
create policy "clinic_blocks_update_admin"
  on public.clinic_schedule_blocks for update
  to authenticated
  using (public.is_business_admin(business_id))
  with check (public.is_business_admin(business_id));

drop policy if exists "clinic_blocks_delete_admin" on public.clinic_schedule_blocks;
create policy "clinic_blocks_delete_admin"
  on public.clinic_schedule_blocks for delete
  to authenticated
  using (public.is_business_admin(business_id));

-- appointments
drop policy if exists "clinic_appointments_select_member" on public.clinic_appointments;
create policy "clinic_appointments_select_member"
  on public.clinic_appointments for select
  to authenticated
  using (public.is_business_member(business_id));

drop policy if exists "clinic_appointments_insert_admin" on public.clinic_appointments;
create policy "clinic_appointments_insert_admin"
  on public.clinic_appointments for insert
  to authenticated
  with check (public.is_business_admin(business_id));

drop policy if exists "clinic_appointments_update_admin" on public.clinic_appointments;
create policy "clinic_appointments_update_admin"
  on public.clinic_appointments for update
  to authenticated
  using (public.is_business_admin(business_id))
  with check (public.is_business_admin(business_id));

drop policy if exists "clinic_appointments_delete_admin" on public.clinic_appointments;
create policy "clinic_appointments_delete_admin"
  on public.clinic_appointments for delete
  to authenticated
  using (public.is_business_admin(business_id));
