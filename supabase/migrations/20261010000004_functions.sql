-- SchoolFinder: admin + designation functions
-- These are the only privileged write paths. Each one checks is_admin()/
-- is_editor_or_admin() internally, so RLS policies above only need to let
-- the function's owner through; the function itself re-checks the caller.

-- 1. Prevent a user from escalating their own role via profiles_update_own.
create or replace function public.prevent_self_role_escalation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.role is distinct from old.role and not public.is_admin() then
    raise exception 'Only an admin can change a user role';
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_block_role_escalation on public.profiles;
create trigger profiles_block_role_escalation
  before update on public.profiles
  for each row execute function public.prevent_self_role_escalation();

-- 2. Server-managed role assignment. Callable only by an existing admin.
create or replace function public.set_user_role(target_user uuid, new_role text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Only an admin can assign roles';
  end if;
  if new_role not in ('user', 'editor', 'admin') then
    raise exception 'Invalid role %', new_role;
  end if;
  update public.profiles set role = new_role where id = target_user;
  insert into public.admin_actions (admin_id, action_type, target_table, target_id, after)
  values (auth.uid(), 'set_user_role', 'profiles', target_user, jsonb_build_object('role', new_role));
end;
$$;

-- 3. Publish a boundary version: archives the previous current version for
--    the same (authority, school_year, program_scope) and makes this one
--    current. Nothing is ever deleted -- history stays queryable forever.
create or replace function public.publish_boundary_version(version_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v public.boundary_versions;
begin
  if not public.is_editor_or_admin() then
    raise exception 'Only an editor or admin can publish a boundary version';
  end if;

  select * into v from public.boundary_versions where id = version_id;
  if v.id is null then
    raise exception 'Boundary version % not found', version_id;
  end if;

  update public.boundary_versions
    set status = 'archived', is_current = false, updated_at = now()
    where authority_id = v.authority_id
      and school_year = v.school_year
      and coalesce(program_scope, '') = coalesce(v.program_scope, '')
      and is_current = true
      and id <> v.id;

  update public.boundary_versions
    set status = 'published', is_current = true, published_at = now(),
        published_by = auth.uid(), updated_at = now()
    where id = version_id;

  insert into public.admin_actions (admin_id, action_type, target_table, target_id, after)
  values (auth.uid(), 'publish_boundary_version', 'boundary_versions', version_id,
          jsonb_build_object('school_year', v.school_year, 'authority_id', v.authority_id));
end;
$$;

-- 4. Roll back to a specific prior (now-archived) version: makes it current
--    again and archives whatever was current. Fully auditable; the rolled-
--    back-from version remains in the table with status='archived'.
create or replace function public.rollback_boundary_version(version_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v public.boundary_versions;
  previous_current uuid;
begin
  if not public.is_admin() then
    raise exception 'Only an admin can roll back a boundary version';
  end if;

  select * into v from public.boundary_versions where id = version_id;
  if v.id is null then
    raise exception 'Boundary version % not found', version_id;
  end if;
  if v.status <> 'archived' then
    raise exception 'Can only roll back to an archived version (got %)', v.status;
  end if;

  select id into previous_current from public.boundary_versions
    where authority_id = v.authority_id
      and school_year = v.school_year
      and coalesce(program_scope, '') = coalesce(v.program_scope, '')
      and is_current = true;

  if previous_current is not null then
    update public.boundary_versions
      set status = 'archived', is_current = false, updated_at = now()
      where id = previous_current;
  end if;

  update public.boundary_versions
    set status = 'published', is_current = true, published_at = now(),
        published_by = auth.uid(), updated_at = now()
    where id = version_id;

  insert into public.admin_actions (admin_id, action_type, target_table, target_id, before, after)
  values (auth.uid(), 'rollback_boundary_version', 'boundary_versions', version_id,
          jsonb_build_object('rolled_back_from', previous_current),
          jsonb_build_object('rolled_back_to', version_id));
end;
$$;

-- 5. Designation lookup. Returns a tri-state result per matching authority:
--      'designated'   -> point falls inside a published polygon
--      'none_confirmed' -> a published, coverage-complete version exists for
--                          this authority/year/program and the point falls
--                          outside every polygon in it
--      'unavailable'   -> no published boundary version exists for this
--                          authority/year/program combination at all, OR one
--                          exists but is not marked coverage_complete
--    Distance is informational only and never participates in this result.
create type public.designation_status as enum ('designated', 'none_confirmed', 'unavailable');

create or replace function public.find_designated_schools(
  p_lon double precision,
  p_lat double precision,
  p_school_year text,
  p_program_scope text default null,
  p_include_demo boolean default false
)
returns table (
  authority_id uuid,
  school_id uuid,
  status public.designation_status,
  boundary_version_id uuid,
  source_id uuid
)
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  pt geography;
begin
  pt := ST_SetSRID(ST_MakePoint(p_lon, p_lat), 4326)::geography;

  return query
  with candidate_versions as (
    select bv.* from public.boundary_versions bv
    where bv.status = 'published'
      and bv.school_year = p_school_year
      and coalesce(bv.program_scope, '') = coalesce(p_program_scope, '')
      and bv.is_demo = p_include_demo
  ),
  matches as (
    select cv.authority_id, ab.school_id, cv.id as boundary_version_id, cv.source_id
    from candidate_versions cv
    join public.attendance_boundaries ab on ab.boundary_version_id = cv.id
    where ST_Covers(ab.geom, pt)
  )
  select
    cv.authority_id,
    m.school_id,
    case
      when m.school_id is not null then 'designated'::public.designation_status
      when cv.coverage_complete then 'none_confirmed'::public.designation_status
      else 'unavailable'::public.designation_status
    end as status,
    cv.id as boundary_version_id,
    cv.source_id
  from candidate_versions cv
  left join matches m on m.authority_id = cv.authority_id and m.boundary_version_id = cv.id;
end;
$$;

comment on function public.find_designated_schools is
  'Tri-state designation lookup: distinguishes an actual match from a '
  'confirmed non-match (complete, published boundary data says no) from '
  'unavailable evidence (no complete published boundary data to check '
  'against). Callers must render all three states distinctly and must '
  'never use informational distance as a substitute for this result.';
