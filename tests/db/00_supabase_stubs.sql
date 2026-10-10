-- Minimal stand-ins for the parts of a real Supabase project that our
-- migrations assume exist (the auth schema, roles, and auth.uid()).
-- This lets us run the actual migration files against plain PostgreSQL +
-- PostGIS for fast, real integration testing of schema/RLS/functions,
-- without needing the full hosted GoTrue/PostgREST stack.
--
-- NOT a substitute for testing against a real local/hosted Supabase
-- project before production use -- see docs/DEPLOYMENT.md.

create extension if not exists pgcrypto;

create schema if not exists auth;
create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text
);

-- Supabase's auth.uid() reads the JWT subject claim that PostgREST sets
-- per-request via `set_config('request.jwt.claims', ..., true)`. We stub
-- it to read a simple session GUC instead, set directly by test scripts.
create or replace function auth.uid() returns uuid
language sql stable
as $$
  select nullif(current_setting('test.uid', true), '')::uuid;
$$;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin bypassrls;
  end if;
end $$;

grant usage on schema public to anon, authenticated;
grant usage on schema auth to anon, authenticated;
