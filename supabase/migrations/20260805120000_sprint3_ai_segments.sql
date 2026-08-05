-- Sprint 3: análisis de IA y segmentos dinámicos

alter table public.business_settings
  add column if not exists classification_inactivity_hours numeric not null default 1;

create table if not exists public.ai_analysis (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  business_id uuid not null references public.businesses (id) on delete cascade,
  contact_id uuid not null references public.contacts (id) on delete cascade,
  summary text,
  product text,
  subcategory text,
  intent text,
  status text,
  reason text,
  segment text,
  confidence numeric,
  attributes jsonb not null default '{}'::jsonb,
  raw_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists ai_analysis_business_id_idx
  on public.ai_analysis (business_id);

create index if not exists ai_analysis_conversation_id_idx
  on public.ai_analysis (conversation_id);

create index if not exists ai_analysis_contact_id_idx
  on public.ai_analysis (contact_id);

create table if not exists public.segments (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  name text not null,
  description text,
  rules_json jsonb not null default '{"operator":"and","conditions":[]}'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, name)
);

create index if not exists segments_business_id_idx
  on public.segments (business_id);

drop trigger if exists segments_set_updated_at on public.segments;
create trigger segments_set_updated_at
  before update on public.segments
  for each row execute function public.set_updated_at();

alter table public.ai_analysis enable row level security;
alter table public.segments enable row level security;

drop policy if exists "ai_analysis_select_member" on public.ai_analysis;
create policy "ai_analysis_select_member"
  on public.ai_analysis for select
  to authenticated
  using (public.is_business_member(business_id));

drop policy if exists "segments_select_member" on public.segments;
create policy "segments_select_member"
  on public.segments for select
  to authenticated
  using (public.is_business_member(business_id));

drop policy if exists "segments_insert_admin" on public.segments;
create policy "segments_insert_admin"
  on public.segments for insert
  to authenticated
  with check (public.is_business_admin(business_id));

drop policy if exists "segments_update_admin" on public.segments;
create policy "segments_update_admin"
  on public.segments for update
  to authenticated
  using (public.is_business_admin(business_id))
  with check (public.is_business_admin(business_id));

drop policy if exists "segments_delete_admin" on public.segments;
create policy "segments_delete_admin"
  on public.segments for delete
  to authenticated
  using (public.is_business_admin(business_id));

-- Semillas de segmentos de ejemplo (por empresa existente)
insert into public.segments (business_id, name, description, rules_json)
select
  b.id,
  s.name,
  s.description,
  s.rules_json::jsonb
from public.businesses b
cross join (
  values
    (
      'Pizza',
      'Contactos interesados en pizza',
      '{"operator":"and","conditions":[{"field":"product","op":"contains","value":"pizza"}]}'
    ),
    (
      'No compradores',
      'Mostraron interés pero no compraron',
      '{"operator":"and","conditions":[{"field":"contact_status","op":"eq","value":"no_compro"}]}'
    ),
    (
      'Clientes VIP',
      'Clientes convertidos',
      '{"operator":"and","conditions":[{"field":"contact_status","op":"eq","value":"cliente"}]}'
    ),
    (
      'Objeción de precio',
      'No compraron por precio',
      '{"operator":"or","conditions":[{"field":"reason","op":"contains","value":"precio"},{"field":"reason","op":"contains","value":"dinero"},{"field":"reason","op":"contains","value":"plata"},{"field":"reason","op":"contains","value":"presupuesto"},{"field":"tag","op":"contains","value":"precio"},{"field":"tag","op":"contains","value":"dinero"}]}'
    ),
    (
      'Activos 15 días',
      'Último mensaje en los últimos 15 días',
      '{"operator":"and","conditions":[{"field":"last_message_within_days","op":"lte","value":15}]}'
    )
) as s(name, description, rules_json)
on conflict (business_id, name) do nothing;
