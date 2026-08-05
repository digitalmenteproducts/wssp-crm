-- Ampliar "Objeción de precio" a sinónimos de objeción económica

update public.segments
set
  description = 'No compraron por precio, dinero u otra objeción económica',
  rules_json = '{
    "operator":"or",
    "conditions":[
      {"field":"reason","op":"contains","value":"precio"},
      {"field":"reason","op":"contains","value":"dinero"},
      {"field":"reason","op":"contains","value":"plata"},
      {"field":"reason","op":"contains","value":"presupuesto"},
      {"field":"reason","op":"contains","value":"caro"},
      {"field":"reason","op":"contains","value":"costoso"},
      {"field":"tag","op":"contains","value":"precio"},
      {"field":"tag","op":"contains","value":"dinero"},
      {"field":"tag","op":"contains","value":"plata"},
      {"field":"tag","op":"contains","value":"presupuesto"}
    ]
  }'::jsonb,
  updated_at = now()
where source_key = 'system:reason:precio'
   or name = 'Objeción de precio';
