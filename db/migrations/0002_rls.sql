-- Row-level security. Goroada's server talks to Postgres with a privileged role and enforces authorisation
-- in its service layer. RLS is enabled on every table as defence in depth so that, on Supabase, the
-- public `anon` / `authenticated` roles (PostgREST) cannot read or write anything that is not explicitly
-- granted below. On plain Postgres / PGlite the role checks are skipped.

do $$
declare t text;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    -- Public reference data (no personal information).
    execute 'create policy "public read" on countries for select to anon, authenticated using (true)';
    execute 'create policy "public read" on regions for select to anon, authenticated using (true)';
    execute 'create policy "public read" on cities for select to anon, authenticated using (true)';
    execute 'create policy "public read" on terminals for select to anon, authenticated using (true)';
    execute 'create policy "verified operators" on operators for select to anon, authenticated using (status = ''verified'')';
    execute 'create policy "public read" on routes for select to anon, authenticated using (status = ''active'')';
    execute 'create policy "public read" on trips for select to anon, authenticated using (status <> ''cancelled'')';
    execute 'create policy "public read" on vehicle_layouts for select to anon, authenticated using (true)';
    execute 'create policy "active promos" on promotions for select to anon, authenticated using (active and now() between starts_at and ends_at)';
    -- Personal data: a signed-in user can read only their own rows.
    execute 'create policy "own profile" on user_profiles for select to authenticated using (user_id = auth.uid())';
    execute 'create policy "own bookings" on bookings for select to authenticated using (user_id = auth.uid())';
    execute 'create policy "own notifications" on notifications for select to authenticated using (user_id = auth.uid())';
    execute 'create policy "own passengers" on saved_passengers for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid())';
  end if;
end $$;
