-- SchoolFinder: core schema
-- Authorities, schools, programs, data sources, boundary versions and
-- attendance boundaries. Every table carries `is_demo` so fictional DEMO
-- content can never be structurally confused with official data: the
-- `official_*` / `demo_*` views below are the only supported read path for
-- application code.

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  role text not null default 'user' check (role in ('user', 'editor', 'admin')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.profiles is
  'One row per authenticated user. role is server-managed: it is never set '
  'from client input. Only an existing admin (via the admin API, which runs '
  'under RLS as an authenticated admin) or a service-role operation can '
  'promote a user to editor/admin.';

create table if not exists public.data_sources (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  organization text not null,
  source_url text,
  license text,
  license_url text,
  coverage_description text,
  authorization_notes text,
  last_verified_at date,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.data_sources is
  'Provenance registry: every official dataset imported into the app must '
  'reference a row here (url, license, coverage, verification date). DEMO '
  'sources are flagged is_demo=true and must never back official results.';

create table if not exists public.school_authorities (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  authority_type text not null check (authority_type in ('public', 'catholic', 'private', 'charter')),
  website text,
  phone text,
  source_id uuid references public.data_sources (id),
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint school_authorities_source_required_unless_demo check (is_demo or source_id is not null)
);

create table if not exists public.schools (
  id uuid primary key default gen_random_uuid(),
  authority_id uuid not null references public.school_authorities (id) on delete restrict,
  name text not null,
  school_type text not null check (school_type in ('public', 'catholic', 'private', 'charter')),
  grade_min text not null, -- 'K'..'12' stored as text to allow 'K'
  grade_max text not null,
  address text not null,
  city text not null check (city in ('Calgary', 'Airdrie', 'Chestermere', 'Cochrane')),
  postal_code text,
  phone text,
  website text,
  location geography(Point, 4326), -- school site coordinates (not a designation input)
  status text not null default 'active' check (status in ('active', 'closed', 'planned')),
  source_id uuid references public.data_sources (id),
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint schools_source_required_unless_demo check (is_demo or source_id is not null)
);
create index if not exists schools_location_gix on public.schools using gist (location);
create index if not exists schools_authority_idx on public.schools (authority_id);
create index if not exists schools_name_trgm_idx on public.schools using gin (name gin_trgm_ops);

create table if not exists public.school_programs (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id) on delete cascade,
  program_name text not null, -- e.g. 'TLC', 'French Immersion', 'IB', 'Spanish Bilingual'
  program_code text, -- short code used to key program-specific boundaries
  grade_min text,
  grade_max text,
  notes text,
  source_id uuid references public.data_sources (id),
  is_demo boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists school_programs_school_idx on public.school_programs (school_id);

-- Boundary versions: one row per (authority, school year, program scope).
-- Historical versions are NEVER deleted; publishing a new version archives
-- the previous one. This is the auditable publish/rollback unit.
create table if not exists public.boundary_versions (
  id uuid primary key default gen_random_uuid(),
  authority_id uuid not null references public.school_authorities (id) on delete restrict,
  school_year text not null, -- e.g. '2025-26'
  program_scope text, -- null = general/base boundary; otherwise matches school_programs.program_code
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  is_current boolean not null default false,
  coverage_complete boolean not null default false, -- admin attests the polygons cover the full authority area
  source_id uuid references public.data_sources (id),
  notes text,
  is_demo boolean not null default false,
  published_at timestamptz,
  published_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint boundary_versions_source_required_unless_demo check (is_demo or source_id is not null)
);
create index if not exists boundary_versions_authority_idx
  on public.boundary_versions (authority_id, school_year, program_scope);
create unique index if not exists boundary_versions_one_current
  on public.boundary_versions (authority_id, school_year, coalesce(program_scope, ''))
  where is_current;

create table if not exists public.attendance_boundaries (
  id uuid primary key default gen_random_uuid(),
  boundary_version_id uuid not null references public.boundary_versions (id) on delete cascade,
  school_id uuid not null references public.schools (id) on delete restrict,
  geom geography(MultiPolygon, 4326) not null,
  created_at timestamptz not null default now()
);
create index if not exists attendance_boundaries_geom_gix on public.attendance_boundaries using gist (geom);
create index if not exists attendance_boundaries_version_idx on public.attendance_boundaries (boundary_version_id);
create index if not exists attendance_boundaries_school_idx on public.attendance_boundaries (school_id);

-- Explicitly-authorized school-bus eligibility rules. This table stays
-- empty unless a source_id-backed, documented rule set exists; the app
-- must treat an empty result as "unavailable", never as "not eligible".
create table if not exists public.bus_eligibility_rules (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id) on delete cascade,
  boundary_version_id uuid references public.boundary_versions (id),
  rule_description text not null,
  min_distance_km numeric,
  geom geography(MultiPolygon, 4326),
  source_id uuid not null references public.data_sources (id),
  is_demo boolean not null default false,
  created_at timestamptz not null default now()
);

-- Server-side audit log for every admin publish/rollback/import action.
-- Populated only by SECURITY DEFINER functions below, never by direct
-- client inserts.
create table if not exists public.admin_actions (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid references public.profiles (id),
  action_type text not null,
  target_table text not null,
  target_id uuid,
  before jsonb,
  after jsonb,
  created_at timestamptz not null default now()
);

-- Optional, off-by-default search history. No row is ever written unless
-- the ENABLE_SEARCH_HISTORY feature flag is on server-side, and every row
-- is owner-scoped (see RLS) with an explicit retention/delete job
-- (scripts/purge-search-history.ts).
create table if not exists public.search_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles (id) on delete cascade,
  address_text text not null,
  searched_at timestamptz not null default now(),
  consent boolean not null default false
);
create index if not exists search_history_user_idx on public.search_history (user_id);

-- Convenience views: the ONLY tables/views application read code should
-- query. They make the official/DEMO split structural rather than a
-- matter of remembering a WHERE clause.
create or replace view public.official_schools as
  select * from public.schools where is_demo = false;
create or replace view public.demo_schools as
  select * from public.schools where is_demo = true;
create or replace view public.official_school_authorities as
  select * from public.school_authorities where is_demo = false;
create or replace view public.demo_school_authorities as
  select * from public.school_authorities where is_demo = true;
create or replace view public.official_attendance_boundaries as
  select ab.* from public.attendance_boundaries ab
  join public.boundary_versions bv on bv.id = ab.boundary_version_id
  where bv.is_demo = false and bv.status = 'published';
create or replace view public.demo_attendance_boundaries as
  select ab.* from public.attendance_boundaries ab
  join public.boundary_versions bv on bv.id = ab.boundary_version_id
  where bv.is_demo = true;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();
create trigger schools_set_updated_at before update on public.schools
  for each row execute function public.set_updated_at();
create trigger authorities_set_updated_at before update on public.school_authorities
  for each row execute function public.set_updated_at();
create trigger boundary_versions_set_updated_at before update on public.boundary_versions
  for each row execute function public.set_updated_at();
create trigger data_sources_set_updated_at before update on public.data_sources
  for each row execute function public.set_updated_at();
