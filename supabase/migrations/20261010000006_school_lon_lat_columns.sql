-- Expose plain numeric longitude/latitude alongside the `location`
-- geography column. PostgREST would otherwise hand the client a GeoJSON/
-- WKB value that needs server-side parsing just to plot a marker; these
-- generated columns make the common "put a pin on the map" case a normal
-- numeric field with no client-side geometry parsing required.
alter table public.schools
  add column if not exists longitude double precision
    generated always as (ST_X(location::geometry)) stored,
  add column if not exists latitude double precision
    generated always as (ST_Y(location::geometry)) stored;

alter table public.gtfs_stops
  add column if not exists longitude double precision
    generated always as (ST_X(location::geometry)) stored,
  add column if not exists latitude double precision
    generated always as (ST_Y(location::geometry)) stored;

-- Views need to be recreated to pick up the new columns (a plain `select *`
-- view does not automatically expose columns added after it was created).
create or replace view public.official_schools as
  select * from public.schools where is_demo = false;
create or replace view public.demo_schools as
  select * from public.schools where is_demo = true;
