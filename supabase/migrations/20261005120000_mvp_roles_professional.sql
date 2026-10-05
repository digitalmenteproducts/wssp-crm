-- Roles MVP: professional (Profesional).
-- Aditiva: no modifica memberships existentes; member se conserva como legacy.

-- 1. Permitir el rol professional
alter table public.business_users
  drop constraint if exists business_users_role_check;
alter table public.business_users
  add constraint business_users_role_check
  check (role in ('owner', 'admin', 'professional', 'member'));

-- 2. Membership de cualquier rol (solo para leer la ficha del negocio y su configuración pública)
create or replace function public.has_business_membership(p_business_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.business_users bu
    where bu.business_id = p_business_id
      and bu.user_id = auth.uid()
  );
$$;

revoke all on function public.has_business_membership(uuid) from public;
revoke all on function public.has_business_membership(uuid) from anon;
grant execute on function public.has_business_membership(uuid) to authenticated;

-- 3. professional no hereda la lectura operativa/clínica de todo el negocio
--    hasta que exista la vinculación usuario ↔ recurso de agenda.
--    Para owner/admin/member el resultado no cambia.
create or replace function public.is_business_member(p_business_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.business_users bu
    where bu.business_id = p_business_id
      and bu.user_id = auth.uid()
      and bu.role <> 'professional'
  );
$$;

-- 4. Ficha del negocio y configuración pública: cualquier membership (igual que antes para roles existentes)
drop policy if exists "businesses_select_member" on public.businesses;
create policy "businesses_select_member"
  on public.businesses for select
  to authenticated
  using (public.has_business_membership(id));

drop policy if exists "business_settings_select_member" on public.business_settings;
create policy "business_settings_select_member"
  on public.business_settings for select
  to authenticated
  using (public.has_business_membership(business_id));

-- 5. Equipo: orden estable con professional (misma validación owner/admin)
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
    case bu.role
      when 'owner' then 0
      when 'admin' then 1
      when 'professional' then 2
      else 3
    end,
    bu.created_at asc,
    bu.user_id asc;
end;
$$;

revoke all on function public.list_business_members(uuid) from public;
revoke all on function public.list_business_members(uuid) from anon;
grant execute on function public.list_business_members(uuid) to authenticated;
