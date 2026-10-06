-- Alta de usuarios del equipo (Paso 5): membership creada por owner/admin.
-- El auth user lo crea el servidor con Supabase Admin; aquí solo se valida y se inserta la membership.
-- Sin tablas nuevas: la contraseña temporal solo la guarda Supabase Auth.

create or replace function public.add_business_member(
  p_business_id uuid,
  p_user_id uuid,
  p_role text
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_id uuid;
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
    raise exception 'Sin permiso para gestionar el equipo' using errcode = '42501';
  end if;

  if p_role is null or p_role not in ('admin', 'professional') then
    raise exception 'invalid_role' using errcode = '22023';
  end if;

  if p_user_id is null or not exists (select 1 from auth.users u where u.id = p_user_id) then
    raise exception 'user_not_found' using errcode = '22023';
  end if;

  insert into public.business_users (business_id, user_id, role)
  values (p_business_id, p_user_id, p_role)
  on conflict on constraint business_users_business_id_user_id_key do nothing
  returning id into v_id;

  if v_id is null then
    raise exception 'already_member' using errcode = '23505';
  end if;

  return v_id;
end;
$$;

revoke all on function public.add_business_member(uuid, uuid, text) from public;
revoke all on function public.add_business_member(uuid, uuid, text) from anon;
grant execute on function public.add_business_member(uuid, uuid, text) to authenticated;
