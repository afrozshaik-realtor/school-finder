-- SchoolFinder: Row Level Security
--
-- Design:
--   * anon + authenticated ("user") roles get read-only access to published,
--     non-admin tables. There is no "trust the client" admin flag anywhere:
--     admin status is resolved server-side by is_admin()/is_editor_or_admin(),
--     which read public.profiles.role under SECURITY DEFINER.
--   * Only an admin can write to authorities/schools/programs/sources/
--     boundary_versions/attendance_boundaries/bus_eligibility_rules.
--   * admin_actions is insert-only via SECURITY DEFINER functions (never
--     directly from the client) and readable only by admins.
--   * search_history rows are owner-scoped: a user can only see/insert/
--     delete their own rows, and only when they are authenticated.
--   * The service_role key bypasses RLS entirely (Supabase default) and is
--     used ONLY by server-side import/admin scripts run outside the
--     browser. It must never be shipped in a client bundle or env var
--     prefixed NEXT_PUBLIC_.

alter table public.profiles enable row level security;
alter table public.data_sources enable row level security;
alter table public.school_authorities enable row level security;
alter table public.schools enable row level security;
alter table public.school_programs enable row level security;
alter table public.boundary_versions enable row level security;
alter table public.attendance_boundaries enable row level security;
alter table public.bus_eligibility_rules enable row level security;
alter table public.admin_actions enable row level security;
alter table public.search_history enable row level security;

-- Helper functions -----------------------------------------------------

create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

create or replace function public.is_editor_or_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role in ('admin', 'editor')
  );
$$;

-- profiles ---------------------------------------------------------------
-- Users can read/update their own profile (but never their own role).
-- Admins can read every profile. Role changes happen only through
-- public.set_user_role(), defined in the functions migration.

create policy profiles_select_own on public.profiles
  for select using (id = auth.uid() or public.is_admin());

create policy profiles_update_own_nonrole on public.profiles
  for update using (id = auth.uid())
  with check (id = auth.uid());
-- Note: this policy alone would still let a user change their own `role`
-- column. We close that gap with a trigger (see functions migration)
-- that rejects a role change unless the request is executed by is_admin().

create policy profiles_insert_self on public.profiles
  for insert with check (id = auth.uid());

-- data_sources / authorities / schools / programs ------------------------
-- Public read of non-demo rows for everyone (anon + authenticated);
-- DEMO rows are also world-readable (they are fictional, not sensitive)
-- but the app's query layer must only surface them on /demo routes.
-- Writes require admin.

create policy data_sources_read_all on public.data_sources
  for select using (true);
create policy data_sources_write_admin on public.data_sources
  for insert with check (public.is_editor_or_admin());
create policy data_sources_update_admin on public.data_sources
  for update using (public.is_editor_or_admin());
create policy data_sources_delete_admin on public.data_sources
  for delete using (public.is_admin());

create policy authorities_read_all on public.school_authorities
  for select using (true);
create policy authorities_write_admin on public.school_authorities
  for insert with check (public.is_editor_or_admin());
create policy authorities_update_admin on public.school_authorities
  for update using (public.is_editor_or_admin());
create policy authorities_delete_admin on public.school_authorities
  for delete using (public.is_admin());

create policy schools_read_all on public.schools
  for select using (true);
create policy schools_write_admin on public.schools
  for insert with check (public.is_editor_or_admin());
create policy schools_update_admin on public.schools
  for update using (public.is_editor_or_admin());
create policy schools_delete_admin on public.schools
  for delete using (public.is_admin());

create policy programs_read_all on public.school_programs
  for select using (true);
create policy programs_write_admin on public.school_programs
  for insert with check (public.is_editor_or_admin());
create policy programs_update_admin on public.school_programs
  for update using (public.is_editor_or_admin());
create policy programs_delete_admin on public.school_programs
  for delete using (public.is_admin());

-- boundary_versions / attendance_boundaries -------------------------------
-- Public can read only published versions (and their polygons); drafts are
-- admin-only so in-progress imports never leak into search results.

create policy boundary_versions_read_published on public.boundary_versions
  for select using (status = 'published' or public.is_editor_or_admin());
create policy boundary_versions_write_admin on public.boundary_versions
  for insert with check (public.is_editor_or_admin());
create policy boundary_versions_update_admin on public.boundary_versions
  for update using (public.is_editor_or_admin());
create policy boundary_versions_delete_admin on public.boundary_versions
  for delete using (public.is_admin());

create policy attendance_boundaries_read_published on public.attendance_boundaries
  for select using (
    exists (
      select 1 from public.boundary_versions bv
      where bv.id = boundary_version_id
        and (bv.status = 'published' or public.is_editor_or_admin())
    )
  );
create policy attendance_boundaries_write_admin on public.attendance_boundaries
  for insert with check (public.is_editor_or_admin());
create policy attendance_boundaries_update_admin on public.attendance_boundaries
  for update using (public.is_editor_or_admin());
create policy attendance_boundaries_delete_admin on public.attendance_boundaries
  for delete using (public.is_admin());

-- bus_eligibility_rules: public read, admin write. Empty table = app shows
-- "unavailable", never "not eligible" (enforced in application code).
create policy bus_rules_read_all on public.bus_eligibility_rules
  for select using (true);
create policy bus_rules_write_admin on public.bus_eligibility_rules
  for insert with check (public.is_editor_or_admin());
create policy bus_rules_update_admin on public.bus_eligibility_rules
  for update using (public.is_editor_or_admin());
create policy bus_rules_delete_admin on public.bus_eligibility_rules
  for delete using (public.is_admin());

-- admin_actions: admin-read-only. Inserts happen only via SECURITY DEFINER
-- functions (publish_boundary_version etc.), which run as the function
-- owner and are therefore unaffected by this restrictive policy.
create policy admin_actions_read_admin on public.admin_actions
  for select using (public.is_admin());

-- search_history: owner-scoped, authenticated only. The application only
-- writes here when ENABLE_SEARCH_HISTORY=true and the user has consented;
-- RLS is the backstop even if that check is ever bypassed.
create policy search_history_select_own on public.search_history
  for select using (auth.uid() = user_id);
create policy search_history_insert_own on public.search_history
  for insert with check (auth.uid() = user_id and consent = true);
create policy search_history_delete_own on public.search_history
  for delete using (auth.uid() = user_id);
