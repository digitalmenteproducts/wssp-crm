-- Allow flexible clinic service durations (e.g. Armonía labial = 40 min).
-- Prefer range 5–240 over a closed preset list.

alter table public.clinic_services
  drop constraint if exists clinic_services_duration_minutes_check;

alter table public.clinic_services
  add constraint clinic_services_duration_minutes_check
  check (duration_minutes >= 5 and duration_minutes <= 240);

comment on column public.clinic_services.duration_minutes is
  'Service booking duration in minutes (5–240). Not limited to preset slot sizes.';
