-- Real integration test for the RLS policies backing the admin CRUD UI
-- (src/app/admin/{sources,authorities,schools,programs}, src/app/api/
-- admin/*) and the draft-boundary visibility rule. 01_rls_and_designation.sql
-- already proves anon/ordinary-user writes are rejected and admin writes
-- succeed; this file fills in what that one doesn't cover:
--   - the EDITOR role specifically (distinct from admin) can create
--     records but cannot delete them (editor is in is_editor_or_admin()
--     but delete policies require is_admin() specifically)
--   - a draft boundary_version is invisible to anon/ordinary users but
--     visible to editor/admin (so an in-progress import never leaks into
--     public search results before being published)
-- Run with: psql -d schoolfinder_test -f tests/db/03_admin_crud_rls.sql

create extension if not exists pgcrypto;

create temporary table if not exists _test_results (label text, passed boolean);

create or replace function pg_temp.check_(label text, condition boolean) returns void
language plpgsql
security definer
as $$
begin
  insert into _test_results values (label, condition);
  if condition then
    raise notice 'PASS: %', label;
  else
    raise warning 'FAIL: %', label;
  end if;
end;
$$;

grant select, insert, update, delete on all tables in schema public to anon, authenticated;
grant usage on all sequences in schema public to anon, authenticated;

do $$
declare
  v_admin_id uuid := gen_random_uuid();
  v_editor_id uuid := gen_random_uuid();
  v_user_id uuid := gen_random_uuid();
  v_source_id uuid;
  v_authority_id uuid;
  v_school_id uuid;
  v_draft_version_id uuid;
begin
  insert into auth.users (id) values (v_admin_id), (v_editor_id), (v_user_id);
  insert into public.profiles (id, role)
    values (v_admin_id, 'admin'), (v_editor_id, 'editor'), (v_user_id, 'user');

  -- === editor: can create the full chain (source -> authority -> school
  -- -> program), matching exactly what the admin UI's POST routes do ===
  set local role authenticated;
  perform set_config('test.uid', v_editor_id::text, false);

  perform pg_temp.check_('is_editor_or_admin() is true for the editor user', public.is_editor_or_admin());
  perform pg_temp.check_('is_admin() is FALSE for the editor user (editor != admin)', not public.is_admin());

  begin
    insert into public.data_sources (name, organization, is_demo)
    values ('RLS Test Source', 'RLS Test Org', false)
    returning id into v_source_id;
    perform pg_temp.check_('editor can insert data_sources', true);
  exception when others then
    perform pg_temp.check_('editor can insert data_sources', false);
  end;

  begin
    insert into public.school_authorities (name, authority_type, source_id, is_demo)
    values ('RLS Test Authority', 'public', v_source_id, false)
    returning id into v_authority_id;
    perform pg_temp.check_('editor can insert school_authorities', true);
  exception when others then
    perform pg_temp.check_('editor can insert school_authorities', false);
  end;

  begin
    insert into public.schools
      (authority_id, name, school_type, grade_min, grade_max, address, city, source_id, is_demo)
    values (v_authority_id, 'RLS Test School', 'public', 'K', '6', '1 Test St', 'Calgary', v_source_id, false)
    returning id into v_school_id;
    perform pg_temp.check_('editor can insert schools', true);
  exception when others then
    perform pg_temp.check_('editor can insert schools', false);
  end;

  begin
    insert into public.school_programs (school_id, program_name, source_id, is_demo)
    values (v_school_id, 'RLS Test Program', v_source_id, false);
    perform pg_temp.check_('editor can insert school_programs', true);
  exception when others then
    perform pg_temp.check_('editor can insert school_programs', false);
  end;

  -- Editor can also create a draft boundary_version (what
  -- scripts/import-boundaries.ts does)...
  begin
    insert into public.boundary_versions (authority_id, school_year, status, source_id, is_demo)
    values (v_authority_id, '2025-26', 'draft', v_source_id, false)
    returning id into v_draft_version_id;
    perform pg_temp.check_('editor can insert a draft boundary_version', true);
  exception when others then
    perform pg_temp.check_('editor can insert a draft boundary_version', false);
  end;

  -- ...and can read it back (drafts are visible to editor/admin)...
  perform pg_temp.check_(
    'editor can read a draft boundary_version',
    exists (select 1 from public.boundary_versions where id = v_draft_version_id)
  );

  -- ...but cannot DELETE any of what they just created -- delete policies
  -- require is_admin() specifically, not is_editor_or_admin(). IMPORTANT:
  -- a DELETE blocked by RLS's USING clause does NOT raise an exception
  -- (unlike INSERT's WITH CHECK clause) -- it just matches/deletes zero
  -- rows silently. The check must confirm the row is still there, not
  -- expect an exception; an earlier version of this test wrongly expected
  -- an exception and reported a false "FAIL" even though the policy was
  -- correctly blocking the delete all along.
  delete from public.school_programs where school_id = v_school_id;
  perform pg_temp.check_(
    'editor cannot delete school_programs (row still exists)',
    exists (select 1 from public.school_programs where school_id = v_school_id)
  );

  delete from public.schools where id = v_school_id;
  perform pg_temp.check_(
    'editor cannot delete schools (row still exists)',
    exists (select 1 from public.schools where id = v_school_id)
  );

  delete from public.data_sources where id = v_source_id;
  perform pg_temp.check_(
    'editor cannot delete data_sources (row still exists)',
    exists (select 1 from public.data_sources where id = v_source_id)
  );

  reset role;

  -- === anon / ordinary user: the draft boundary_version created above
  -- must stay invisible -- this is the structural guarantee that an
  -- in-progress import never leaks into a real search before publish ===
  set local role anon;
  perform set_config('test.uid', '', false);
  perform pg_temp.check_(
    'anon cannot see the draft boundary_version',
    not exists (select 1 from public.boundary_versions where id = v_draft_version_id)
  );
  reset role;

  set local role authenticated;
  perform set_config('test.uid', v_user_id::text, false);
  perform pg_temp.check_(
    'ordinary user cannot see the draft boundary_version',
    not exists (select 1 from public.boundary_versions where id = v_draft_version_id)
  );
  reset role;

  -- === admin: CAN delete what the editor created (cleanup also proves
  -- the admin-only delete policies work, not just that editor is blocked) ===
  set local role authenticated;
  perform set_config('test.uid', v_admin_id::text, false);

  delete from public.school_programs where school_id = v_school_id;
  delete from public.schools where id = v_school_id;
  delete from public.boundary_versions where id = v_draft_version_id;
  delete from public.school_authorities where id = v_authority_id;
  delete from public.data_sources where id = v_source_id;
  perform pg_temp.check_(
    'admin can actually delete the full chain created above (rows gone, not just no exception)',
    not exists (select 1 from public.schools where id = v_school_id)
      and not exists (select 1 from public.school_authorities where id = v_authority_id)
      and not exists (select 1 from public.data_sources where id = v_source_id)
  );

  reset role;
end $$;

do $$
declare
  fail_count int;
begin
  select count(*) into fail_count from _test_results where not passed;
  if fail_count > 0 then
    raise exception '% check(s) FAILED -- see warnings above', fail_count;
  else
    raise notice 'ALL % CHECKS PASSED', (select count(*) from _test_results);
  end if;
end $$;
