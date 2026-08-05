-- Segmentos de inactividad / "no respondió más"

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
      'No respondió más (7 días)',
      'Sin mensajes en los últimos 7 días. Útil para reactivar conversaciones frías.',
      '{"operator":"and","conditions":[{"field":"last_message_within_days","op":"gte","value":7}]}',
      'system:silent:7d'
    ),
    (
      'No respondió más (15 días)',
      'Sin mensajes en los últimos 15 días.',
      '{"operator":"and","conditions":[{"field":"last_message_within_days","op":"gte","value":15}]}',
      'system:silent:15d'
    ),
    (
      'Interesados sin respuesta (7 días)',
      'Estado Interesado y sin actividad reciente.',
      '{"operator":"and","conditions":[{"field":"contact_status","op":"eq","value":"interesado"},{"field":"last_message_within_days","op":"gte","value":7}]}',
      'system:silent:interesado:7d'
    ),
    (
      'No compraron sin respuesta (7 días)',
      'Estado No compró y sin actividad reciente. Buen candidato de recuperación.',
      '{"operator":"and","conditions":[{"field":"contact_status","op":"eq","value":"no_compro"},{"field":"last_message_within_days","op":"gte","value":7}]}',
      'system:silent:no_compro:7d'
    )
) as s(name, description, rules_json, source_key)
where not exists (
  select 1
  from public.segments existing
  where existing.business_id = b.id
    and existing.source_key = s.source_key
);
