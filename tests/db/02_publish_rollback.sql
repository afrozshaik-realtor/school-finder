-- Integration test: boundary version publish / rollback / audit trail.
-- Run with: psql -d schoolfinder_test -f tests/db/02_publish_rollback.sql
-- Requires 00_supabase_stubs.sql + migrations + seed already applied.

create temporary table if not exists _test_results2 (label text, passed boolean);
create or replace function pg_temp.check2_(label text, condition boolean) returns void
language plpgsql security definer as $$
begin
  insert into _test_results2 values (label, condition);
  if condition then raise notice 'PASS: %', label; else raise warning 'FAIL: %', label; end if;
end; $$;

do $$
declare
  v_admin_id uuid := gen_random_uuid();
  v_authority uuid;
  v_school uuid;
  v_source uuid;
  v_version_a uuid;
  v_version_b uuid;
begin
  insert into auth.users (id) values (v_admin_id);
  insert into public.profiles (id, role) values (v_admin_id, 'admin');

  insert into public.data_sources (name, organization, is_demo) values ('Rollback test source', 'Test', true)
    returning id into v_source;
  insert into public.school_authorities (name, authority_type, source_id, is_demo)
    values ('Rollback Test Authority', 'public', v_source, true) returning id into v_authority;
  insert into public.schools (authority_id, name, school_type, grade_min, grade_max, address, city, source_id, is_demo)
    values (v_authority, 'Rollback Test School', 'public', 'K', '6', '1 Test Ave', 'Calgary', v_source, true)
    returning id into v_school;

  -- Version A: published first.
  insert into public.boundary_versions (authority_id, school_year, status, is_current, coverage_complete, source_id, is_demo)
    values (v_authority, '2024-25', 'draft', false, true, v_source, true) returning id into v_version_a;
  insert into public.attendance_boundaries (boundary_version_id, school_id, geom)
    values (v_version_a, v_school, ST_SetSRID(ST_GeomFromText(
      'MULTIPOLYGON(((-114.10 51.04, -114.06 51.04, -114.06 51.06, -114.10 51.06, -114.10 51.04)))'), 4326)::geography);

  set local role authenticated;
  perform set_config('test.uid', v_admin_id::text, false);

  perform public.publish_boundary_version(v_version_a);
  perform pg_temp.check2_(
    'version A is current+published after first publish',
    (select status = 'published' and is_current from public.boundary_versions where id = v_version_a)
  );

  reset role;

  -- Version B: a corrected re-draw for the same authority/year, published later.
  insert into public.boundary_versions (authority_id, school_year, status, is_current, coverage_complete, source_id, is_demo)
    values (v_authority, '2024-25', 'draft', false, true, v_source, true) returning id into v_version_b;
  insert into public.attendance_boundaries (boundary_version_id, school_id, geom)
    values (v_version_b, v_school, ST_SetSRID(ST_GeomFromText(
      'MULTIPOLYGON(((-114.12 51.03, -114.04 51.03, -114.04 51.07, -114.12 51.07, -114.12 51.03)))'), 4326)::geography);

  set local role authenticated;
  perform set_config('test.uid', v_admin_id::text, false);
  perform public.publish_boundary_version(v_version_b);

  perform pg_temp.check2_(
    'publishing version B archives version A (never deletes it)',
    (select status = 'archived' and not is_current from public.boundary_versions where id = v_version_a)
  );
  perform pg_temp.check2_(
    'version B is now current+published',
    (select status = 'published' and is_current from public.boundary_versions where id = v_version_b)
  );
  perform pg_temp.check2_(
    'exactly one current version exists for this authority/year',
    (select count(*) from public.boundary_versions
       where authority_id = v_authority and school_year = '2024-25' and is_current) = 1
  );

  -- Roll back to version A (still present, just archived).
  perform public.rollback_boundary_version(v_version_a);

  perform pg_temp.check2_(
    'rollback makes version A current again',
    (select status = 'published' and is_current from public.boundary_versions where id = v_version_a)
  );
  perform pg_temp.check2_(
    'rollback archives version B instead of deleting it',
    (select status = 'archived' and not is_current from public.boundary_versions where id = v_version_b)
  );
  perform pg_temp.check2_(
    'both versions still exist in full (nothing deleted by publish/rollback)',
    (select count(*) from public.boundary_versions where id in (v_version_a, v_version_b)) = 2
  );
  perform pg_temp.check2_(
    'admin_actions has an auditable trail of at least 3 actions (2 publishes + 1 rollback)',
    (select count(*) from public.admin_actions
       where action_type in ('publish_boundary_version', 'rollback_boundary_version')
         and target_id in (v_version_a, v_version_b)) >= 3
  );

  -- Non-admin cannot roll back.
  reset role;
  declare
    v_plain_user uuid := gen_random_uuid();
  begin
    insert into auth.users (id) values (v_plain_user);
    insert into public.profiles (id, role) values (v_plain_user, 'user');
    set local role authenticated;
    perform set_config('test.uid', v_plain_user::text, false);
    begin
      perform public.rollback_boundary_version(v_version_b);
      perform pg_temp.check2_('ordinary user cannot roll back a boundary version', false);
    exception when others then
      perform pg_temp.check2_('ordinary user cannot roll back a boundary version', true);
    end;
    reset role;
  end;
end $$;

do $$
declare fail_count int;
begin
  select count(*) into fail_count from _test_results2 where not passed;
  if fail_count > 0 then
    raise exception '% check(s) FAILED -- see warnings above', fail_count;
  else
    raise notice 'ALL % CHECKS PASSED', (select count(*) from _test_results2);
  end if;
end $$;
