-- Fix: evitar recursión infinita en RLS de business_users

drop policy if exists "business_users_select_same_business" on public.business_users;
drop policy if exists "business_users_select_own" on public.business_users;

create policy "business_users_select_own"
  on public.business_users for select
  to authenticated
  using (user_id = auth.uid());

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
  );
$$;

create or replace function public.is_business_admin(p_business_id uuid)
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
      and bu.role in ('owner', 'admin')
  );
$$;

revoke all on function public.is_business_member(uuid) from public;
revoke all on function public.is_business_admin(uuid) from public;
grant execute on function public.is_business_member(uuid) to authenticated;
grant execute on function public.is_business_admin(uuid) to authenticated;

drop policy if exists "businesses_select_member" on public.businesses;
create policy "businesses_select_member"
  on public.businesses for select
  to authenticated
  using (public.is_business_member(id));

drop policy if exists "businesses_update_owner_admin" on public.businesses;
create policy "businesses_update_owner_admin"
  on public.businesses for update
  to authenticated
  using (public.is_business_admin(id))
  with check (public.is_business_admin(id));

drop policy if exists "business_settings_select_member" on public.business_settings;
create policy "business_settings_select_member"
  on public.business_settings for select
  to authenticated
  using (public.is_business_member(business_id));

drop policy if exists "business_settings_update_owner_admin" on public.business_settings;
create policy "business_settings_update_owner_admin"
  on public.business_settings for update
  to authenticated
  using (public.is_business_admin(business_id))
  with check (public.is_business_admin(business_id));
