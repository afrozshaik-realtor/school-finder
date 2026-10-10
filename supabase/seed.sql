-- SchoolFinder DEMO seed data
--
-- EVERYTHING in this file is FICTIONAL: invented schools, invented
-- addresses, an invented boundary polygon, and an invented transit stop.
-- Every row sets is_demo = true, which structurally excludes it from the
-- official_* views and from find_designated_schools()/nearby_stops() calls
-- made with p_include_demo = false (the application's default).
--
-- Run this ONLY against a local/dev database:
--   supabase db reset        (applies migrations, then this file)
-- Never run this against a production project.

insert into public.data_sources (id, name, organization, source_url, license, coverage_description, authorization_notes, last_verified_at, is_demo)
values (
  '00000000-0000-0000-0000-00000000d001',
  'DEMO fictional dataset',
  'SchoolFinder (fictional, for demonstration only)',
  null,
  'N/A - not a real license, fictional data',
  'Covers an invented neighbourhood for UI demonstration purposes only.',
  'No authorization needed: entirely fictional, not derived from any real dataset.',
  null,
  true
);

insert into public.school_authorities (id, name, authority_type, website, source_id, is_demo)
values (
  '00000000-0000-0000-0000-00000000a001',
  'Example Fictional School Authority (DEMO)',
  'public',
  null,
  '00000000-0000-0000-0000-00000000d001',
  true
);

insert into public.schools (id, authority_id, name, school_type, grade_min, grade_max, address, city, location, source_id, is_demo)
values (
  '00000000-0000-0000-0000-00000000c001',
  '00000000-0000-0000-0000-00000000a001',
  'Example Elementary School (DEMO - FICTIONAL)',
  'public',
  'K',
  '6',
  '123 Example Street NW (fictional address)',
  'Calgary',
  ST_SetSRID(ST_MakePoint(-114.08529, 51.05011), 4326)::geography,
  '00000000-0000-0000-0000-00000000d001',
  true
);

insert into public.school_programs (school_id, program_name, program_code, grade_min, grade_max, source_id, is_demo)
values (
  '00000000-0000-0000-0000-00000000c001',
  'TLC (Traditional Learning Centre) (DEMO)',
  'TLC',
  'K',
  '6',
  '00000000-0000-0000-0000-00000000d001',
  true
);

insert into public.boundary_versions (id, authority_id, school_year, program_scope, status, is_current, coverage_complete, source_id, is_demo, published_at)
values (
  '00000000-0000-0000-0000-00000000b001',
  '00000000-0000-0000-0000-00000000a001',
  '2025-26',
  null,
  'published',
  true,
  true,
  '00000000-0000-0000-0000-00000000d001',
  true,
  now()
);

-- A simple invented square polygon around the demo school's coordinates.
insert into public.attendance_boundaries (boundary_version_id, school_id, geom)
values (
  '00000000-0000-0000-0000-00000000b001',
  '00000000-0000-0000-0000-00000000c001',
  ST_SetSRID(ST_GeomFromText(
    'MULTIPOLYGON(((-114.095 51.045, -114.075 51.045, -114.075 51.055, -114.095 51.055, -114.095 51.045)))'
  ), 4326)::geography
);

insert into public.gtfs_feeds (id, name, agency_name, source_url, license, is_demo)
values (
  '00000000-0000-0000-0000-00000000f001',
  'DEMO Fictional Transit Feed',
  'Fictional Transit Agency (DEMO)',
  null,
  'N/A - fictional, for demonstration only',
  true
);

insert into public.gtfs_stops (feed_id, stop_id, stop_name, location)
values (
  '00000000-0000-0000-0000-00000000f001',
  'DEMO-STOP-1',
  'Example & Fictional (DEMO stop)',
  ST_SetSRID(ST_MakePoint(-114.0860, 51.0505), 4326)::geography
);
