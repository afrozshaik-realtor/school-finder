-- SchoolFinder: core extensions
-- PostGIS for spatial boundary matching and distance calculations.
create extension if not exists postgis;
create extension if not exists pg_trgm; -- trigram search for school/community name lookup
create extension if not exists pgcrypto; -- gen_random_uuid()
