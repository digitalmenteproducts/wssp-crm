-- Manual contact creation (CORE) + optional email
-- Non-destructive. Enables authenticated members to insert contacts for their business.

alter table public.contacts
  add column if not exists email text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'contacts_email_len'
  ) then
    alter table public.contacts
      add constraint contacts_email_len
      check (email is null or char_length(email) <= 320);
  end if;
end $$;

-- Authenticated members can create contacts in their tenant.
-- WhatsApp webhook continues to use service role (unchanged).
drop policy if exists "contacts_insert_member" on public.contacts;
create policy "contacts_insert_member"
  on public.contacts for insert
  to authenticated
  with check (public.is_business_member(business_id));
