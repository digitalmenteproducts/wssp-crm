-- Equipo: listado de miembros para owner/admin sin abrir la RLS de business_users
-- (sigue siendo user_id = auth.uid()) ni exponer auth.users.
-- Devuelve solo los campos que necesita la pantalla Equipo.

create or replace function public.list_business_members(p_business_id uuid)
returns table (
  user_id uuid,
  name text,
  email text,
  role text,
  joined_at timestamptz,
  is_current_user boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'No autenticado' using errcode = '42501';
  end if;

  if p_business_id is null or not exists (
    select 1
    from public.business_users bu
    where bu.business_id = p_business_id
      and bu.user_id = v_uid
      and bu.role in ('owner', 'admin')
  ) then
    raise exception 'Sin permiso para ver el equipo' using errcode = '42501';
  end if;

  return query
  select
    bu.user_id,
    nullif(btrim(u.raw_user_meta_data ->> 'name'), '')::text as name,
    u.email::text as email,
    bu.role,
    bu.created_at as joined_at,
    (bu.user_id = v_uid) as is_current_user
  from public.business_users bu
  join auth.users u on u.id = bu.user_id
  where bu.business_id = p_business_id
  order by
    case bu.role when 'owner' then 0 when 'admin' then 1 else 2 end,
    bu.created_at asc,
    bu.user_id asc;
end;
$$;

revoke all on function public.list_business_members(uuid) from public;
revoke all on function public.list_business_members(uuid) from anon;
grant execute on function public.list_business_members(uuid) to authenticated;
