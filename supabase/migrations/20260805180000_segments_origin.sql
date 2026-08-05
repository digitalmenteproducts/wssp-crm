-- Segment UX: origen (ai|system|manual) + clave de deduplicación

alter table public.segments
  add column if not exists origin text not null default 'manual';

alter table public.segments
  drop constraint if exists segments_origin_check;

alter table public.segments
  add constraint segments_origin_check
  check (origin in ('ai', 'system', 'manual'));

alter table public.segments
  add column if not exists source_key text;

create unique index if not exists segments_business_source_key_uidx
  on public.segments (business_id, source_key)
  where source_key is not null;

-- Marcar semillas existentes como system
update public.segments
set
  origin = 'system',
  source_key = case name
    when 'Pizza' then 'system:product:pizza'
    when 'No compradores' then 'system:status:no_compro'
    when 'Clientes VIP' then 'system:status:cliente'
    when 'Objeción de precio' then 'system:reason:precio'
    when 'Activos 15 días' then 'system:active:15d'
    else source_key
  end
where name in (
  'Pizza',
  'No compradores',
  'Clientes VIP',
  'Objeción de precio',
  'Activos 15 días'
);

-- Sembrar embudo comercial solo si falta el source_key
insert into public.segments (
  business_id, name, description, rules_json, origin, source_key
)
select
  b.id,
  s.name,
  s.description,
  s.rules_json::jsonb,
  'system',
  s.source_key
from public.businesses b
cross join (
  values
    (
      'Nuevos leads',
      'Contactos en estado Nuevo del embudo comercial',
      '{"operator":"and","conditions":[{"field":"contact_status","op":"eq","value":"nuevo"}]}',
      'system:status:nuevo'
    ),
    (
      'Interesados',
      'Contactos en estado Interesado',
      '{"operator":"and","conditions":[{"field":"contact_status","op":"eq","value":"interesado"}]}',
      'system:status:interesado'
    ),
    (
      'No compraron',
      'Contactos que mostraron interés pero no compraron',
      '{"operator":"and","conditions":[{"field":"contact_status","op":"eq","value":"no_compro"}]}',
      'system:status:no_compro'
    ),
    (
      'Clientes',
      'Contactos convertidos en clientes',
      '{"operator":"and","conditions":[{"field":"contact_status","op":"eq","value":"cliente"}]}',
      'system:status:cliente'
    ),
    (
      'No contactar',
      'Contactos marcados para no volver a contactar',
      '{"operator":"and","conditions":[{"field":"contact_status","op":"eq","value":"no_contactar"}]}',
      'system:status:no_contactar'
    ),
    (
      'Activos últimos 30 días',
      'Último mensaje en los últimos 30 días',
      '{"operator":"and","conditions":[{"field":"last_message_within_days","op":"lte","value":30}]}',
      'system:active:30d'
    )
) as s(name, description, rules_json, source_key)
where not exists (
  select 1
  from public.segments existing
  where existing.business_id = b.id
    and existing.source_key = s.source_key
);
