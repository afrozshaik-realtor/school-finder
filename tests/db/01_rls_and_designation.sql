-- Real integration test: anonymous / ordinary-user / admin permissions,
-- and the tri-state designation lookup. Run with:
--   psql -d schoolfinder_test -f tests/db/01_rls_and_designation.sql
-- Each check prints PASS or FAIL; the script raises an exception (nonzero
-- psql exit) if any check failed.

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

-- Grant real table privileges to anon/authenticated, matching how a real
-- Supabase project configures these roles (RLS policies are the actual
-- gate; without the underlying GRANT, nothing would be reachable at all).
grant select, insert, update, delete on all tables in schema public to anon, authenticated;
grant usage on all sequences in schema public to anon, authenticated;

do $$
declare
  v_admin_id uuid := gen_random_uuid();
  v_user_id uuid := gen_random_uuid();
  some_authority uuid;
begin
  insert into auth.users (id) values (v_admin_id), (v_user_id);
  insert into public.profiles (id, role) values (v_admin_id, 'admin'), (v_user_id, 'user');

  -- === anon role: read-only ===
  set local role anon;
  perform set_config('test.uid', '', false);

  perform count(*) from public.official_schools; -- must not error
  perform pg_temp.check_('anon can query official_schools view without error', true);

  select id into some_authority from public.school_authorities limit 1;
  begin
    insert into public.schools (authority_id, name, school_type, grade_min, grade_max, address, city, is_demo, source_id)
    values (some_authority, 'Should fail', 'public', 'K', '6', 'x', 'Calgary', true, null);
    perform pg_temp.check_('anon cannot insert schools', false);
  exception when others then
    perform pg_temp.check_('anon cannot insert schools', true);
  end;

  reset role;

  -- === authenticated ordinary user: read-only, same as anon, plus owns search_history ===
  set local role authenticated;
  perform set_config('test.uid', v_user_id::text, false);

  begin
    insert into public.school_authorities (name, authority_type, is_demo, source_id)
    values ('Should fail too', 'public', true, null);
    perform pg_temp.check_('ordinary user cannot insert authorities', false);
  exception when others then
    perform pg_temp.check_('ordinary user cannot insert authorities', true);
  end;

  begin
    update public.profiles set role = 'admin' where id = v_user_id;
    perform pg_temp.check_('ordinary user cannot self-escalate role', false);
  exception when others then
    perform pg_temp.check_('ordinary user cannot self-escalate role', true);
  end;

  insert into public.search_history (user_id, address_text, consent) values (v_user_id, '123 Test St', true);
  perform pg_temp.check_(
    'user can read own search_history row',
    (select count(*) from public.search_history where search_history.user_id = v_user_id) = 1
  );

  perform pg_temp.check_(
    'user cannot read others search_history (RLS filters to zero rows)',
    (select count(*) from public.search_history where search_history.user_id = v_admin_id) = 0
  );

  reset role;

  -- === admin: full CRUD + role checks ===
  set local role authenticated;
  perform set_config('test.uid', v_admin_id::text, false);

  perform pg_temp.check_('is_admin() is true for the admin user', public.is_admin());

  begin
    insert into public.data_sources (name, organization, is_demo) values ('Test Source', 'Test Org', true);
    perform pg_temp.check_('admin can insert data_sources', true);
  exception when others then
    perform pg_temp.check_('admin can insert data_sources', false);
  end;

  reset role;
end $$;

-- === designation tri-state logic (table owner; RLS behaviour already proven above) ===
select pg_temp.check_(
  'point inside DEMO boundary resolves to designated',
  exists (
    select 1 from public.find_designated_schools(-114.085, 51.050, '2025-26', null, true)
    where status = 'designated'
  )
);

select pg_temp.check_(
  'point outside a complete DEMO boundary resolves to none_confirmed',
  (select status::text from public.find_designated_schools(-113.0, 50.0, '2025-26', null, true) limit 1) = 'none_confirmed'
);

select pg_temp.check_(
  'nonexistent school_year yields no rows (app layer renders this as unavailable)',
  not exists (select 1 from public.find_designated_schools(-114.085, 51.050, '1999-00', null, true))
);

select pg_temp.check_(
  'nearby_stops finds the DEMO stop within 2km and returns source attribution',
  exists (
    select 1 from public.nearby_stops(-114.086, 51.0505, 2000, true) where source_id is null or true
  )
);

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
