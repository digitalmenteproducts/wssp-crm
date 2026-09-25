import fs from "node:fs";
import pg from "pg";

const password = process.env.SUPABASE_DB_PASSWORD;
if (!password) {
  console.error("FAIL=missing password");
  process.exit(1);
}

const client = new pg.Client({
  host: "aws-0-us-east-2.pooler.supabase.com",
  port: 6543,
  user: "postgres.prmanzxthcznfnawhymt",
  password,
  database: "postgres",
  ssl: { rejectUnauthorized: false },
});

const fixSql = `
-- Evitar recursión infinita en RLS de business_users
drop policy if exists "business_users_select_same_business" on public.business_users;
drop policy if exists "business_users_select_own" on public.business_users;

create policy "business_users_select_own"
  on public.business_users for select
  to authenticated
  using (user_id = auth.uid());

-- Helper security definer para comprobar membresía sin recursión
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

-- businesses
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

-- business_settings
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
`;

try {
  await client.connect();
  await client.query(fixSql);

  const policies = await client.query(`
    select tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and tablename in ('businesses', 'business_users', 'business_settings')
    order by tablename, policyname
  `);

  console.log("OK_POLICIES=");
  for (const row of policies.rows) {
    console.log(`- ${row.tablename}.${row.policyname}`);
  }

  const counts = await client.query(`
    select
      (select count(*)::int from businesses) as businesses,
      (select count(*)::int from business_users) as business_users,
      (select count(*)::int from business_settings) as business_settings
  `);
  console.log("OK_COUNTS=" + JSON.stringify(counts.rows[0]));
} catch (error) {
  console.error("FAIL=" + (error instanceof Error ? error.message : String(error)));
  process.exitCode = 1;
} finally {
  await client.end().catch(() => undefined);
}
