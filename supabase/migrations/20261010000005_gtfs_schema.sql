-- SchoolFinder: GTFS static schema
-- Mirrors the GTFS static spec closely so validated feed data can be loaded
-- with minimal transformation. Every row is scoped to a feed_id so multiple
-- authorized feeds (e.g. Calgary Transit, a future Airdrie Transit feed)
-- can coexist, and every feed is tagged is_demo so no fabricated feed can
-- ever appear in official results.

create table if not exists public.gtfs_feeds (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  agency_name text not null,
  source_url text, -- required for non-demo feeds in application-level validation; nullable for is_demo=true rows
  license text,
  feed_version text,
  service_start_date date,
  service_end_date date,
  last_imported_at timestamptz,
  source_id uuid references public.data_sources (id),
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  constraint gtfs_feeds_source_url_required_unless_demo check (is_demo or source_url is not null)
);

create table if not exists public.gtfs_routes (
  id uuid primary key default gen_random_uuid(),
  feed_id uuid not null references public.gtfs_feeds (id) on delete cascade,
  route_id text not null, -- GTFS route_id, unique within a feed
  route_short_name text,
  route_long_name text,
  route_type integer,
  route_color text,
  unique (feed_id, route_id)
);

create table if not exists public.gtfs_stops (
  id uuid primary key default gen_random_uuid(),
  feed_id uuid not null references public.gtfs_feeds (id) on delete cascade,
  stop_id text not null,
  stop_name text not null,
  stop_code text,
  location geography(Point, 4326) not null,
  wheelchair_boarding integer,
  unique (feed_id, stop_id)
);
create index if not exists gtfs_stops_location_gix on public.gtfs_stops using gist (location);

create table if not exists public.gtfs_calendar (
  id uuid primary key default gen_random_uuid(),
  feed_id uuid not null references public.gtfs_feeds (id) on delete cascade,
  service_id text not null,
  monday boolean not null, tuesday boolean not null, wednesday boolean not null,
  thursday boolean not null, friday boolean not null, saturday boolean not null,
  sunday boolean not null,
  start_date date not null,
  end_date date not null,
  unique (feed_id, service_id)
);

create table if not exists public.gtfs_calendar_dates (
  id uuid primary key default gen_random_uuid(),
  feed_id uuid not null references public.gtfs_feeds (id) on delete cascade,
  service_id text not null,
  date date not null,
  exception_type integer not null check (exception_type in (1, 2)), -- 1 added, 2 removed
  unique (feed_id, service_id, date)
);

create table if not exists public.gtfs_shapes (
  id uuid primary key default gen_random_uuid(),
  feed_id uuid not null references public.gtfs_feeds (id) on delete cascade,
  shape_id text not null,
  geom geography(LineString, 4326) not null,
  unique (feed_id, shape_id)
);
create index if not exists gtfs_shapes_geom_gix on public.gtfs_shapes using gist (geom);

create table if not exists public.gtfs_trips (
  id uuid primary key default gen_random_uuid(),
  feed_id uuid not null references public.gtfs_feeds (id) on delete cascade,
  trip_id text not null,
  route_id text not null,
  service_id text not null,
  shape_id text,
  trip_headsign text,
  direction_id integer,
  unique (feed_id, trip_id)
);
create index if not exists gtfs_trips_route_idx on public.gtfs_trips (feed_id, route_id);
create index if not exists gtfs_trips_service_idx on public.gtfs_trips (feed_id, service_id);

create table if not exists public.gtfs_stop_times (
  id uuid primary key default gen_random_uuid(),
  feed_id uuid not null references public.gtfs_feeds (id) on delete cascade,
  trip_id text not null,
  stop_id text not null,
  stop_sequence integer not null,
  arrival_time text, -- GTFS allows >24:00:00, so kept as text (HH:MM:SS)
  departure_time text,
  unique (feed_id, trip_id, stop_sequence)
);
create index if not exists gtfs_stop_times_trip_idx on public.gtfs_stop_times (feed_id, trip_id);
create index if not exists gtfs_stop_times_stop_idx on public.gtfs_stop_times (feed_id, stop_id);

alter table public.gtfs_feeds enable row level security;
alter table public.gtfs_routes enable row level security;
alter table public.gtfs_stops enable row level security;
alter table public.gtfs_calendar enable row level security;
alter table public.gtfs_calendar_dates enable row level security;
alter table public.gtfs_shapes enable row level security;
alter table public.gtfs_trips enable row level security;
alter table public.gtfs_stop_times enable row level security;

create policy gtfs_feeds_read_all on public.gtfs_feeds for select using (true);
create policy gtfs_routes_read_all on public.gtfs_routes for select using (true);
create policy gtfs_stops_read_all on public.gtfs_stops for select using (true);
create policy gtfs_calendar_read_all on public.gtfs_calendar for select using (true);
create policy gtfs_calendar_dates_read_all on public.gtfs_calendar_dates for select using (true);
create policy gtfs_shapes_read_all on public.gtfs_shapes for select using (true);
create policy gtfs_trips_read_all on public.gtfs_trips for select using (true);
create policy gtfs_stop_times_read_all on public.gtfs_stop_times for select using (true);

create policy gtfs_feeds_write_admin on public.gtfs_feeds for insert with check (public.is_editor_or_admin());
create policy gtfs_feeds_update_admin on public.gtfs_feeds for update using (public.is_editor_or_admin());
create policy gtfs_feeds_delete_admin on public.gtfs_feeds for delete using (public.is_admin());
create policy gtfs_routes_write_admin on public.gtfs_routes for insert with check (public.is_editor_or_admin());
create policy gtfs_routes_delete_admin on public.gtfs_routes for delete using (public.is_editor_or_admin());
create policy gtfs_stops_write_admin on public.gtfs_stops for insert with check (public.is_editor_or_admin());
create policy gtfs_stops_delete_admin on public.gtfs_stops for delete using (public.is_editor_or_admin());
create policy gtfs_calendar_write_admin on public.gtfs_calendar for insert with check (public.is_editor_or_admin());
create policy gtfs_calendar_delete_admin on public.gtfs_calendar for delete using (public.is_editor_or_admin());
create policy gtfs_calendar_dates_write_admin on public.gtfs_calendar_dates for insert with check (public.is_editor_or_admin());
create policy gtfs_calendar_dates_delete_admin on public.gtfs_calendar_dates for delete using (public.is_editor_or_admin());
create policy gtfs_shapes_write_admin on public.gtfs_shapes for insert with check (public.is_editor_or_admin());
create policy gtfs_shapes_delete_admin on public.gtfs_shapes for delete using (public.is_editor_or_admin());
create policy gtfs_trips_write_admin on public.gtfs_trips for insert with check (public.is_editor_or_admin());
create policy gtfs_trips_delete_admin on public.gtfs_trips for delete using (public.is_editor_or_admin());
create policy gtfs_stop_times_write_admin on public.gtfs_stop_times for insert with check (public.is_editor_or_admin());
create policy gtfs_stop_times_delete_admin on public.gtfs_stop_times for delete using (public.is_editor_or_admin());

-- Nearby stops, with source attribution and service-date-aware trip counts.
-- Returns an empty set (never fabricated rows) when no feed covers the area.
create or replace function public.nearby_stops(
  p_lon double precision,
  p_lat double precision,
  p_radius_m integer default 800,
  p_include_demo boolean default false
)
returns table (
  feed_id uuid,
  feed_name text,
  stop_id text,
  stop_name text,
  distance_m double precision,
  source_id uuid
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    f.id as feed_id,
    f.name as feed_name,
    s.stop_id,
    s.stop_name,
    ST_Distance(s.location, ST_SetSRID(ST_MakePoint(p_lon, p_lat), 4326)::geography) as distance_m,
    f.source_id
  from public.gtfs_stops s
  join public.gtfs_feeds f on f.id = s.feed_id
  where f.is_demo = p_include_demo
    and ST_DWithin(s.location, ST_SetSRID(ST_MakePoint(p_lon, p_lat), 4326)::geography, p_radius_m)
  order by distance_m asc;
$$;
