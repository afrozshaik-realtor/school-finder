# Deployment

This document covers environment configuration, applying the database schema, and the checklist to work through before any real (non-local, non-demo) deployment. Nothing in this document has been exercised against a real hosted Supabase project in this session -- see "What has and hasn't been verified" at the end.

## 1. Environment variables

Copy `.env.example` to `.env.local` (local dev) or set these in your hosting platform's environment configuration (production). Never commit real values; never paste real secret values into chat with an AI assistant, including this one.

| Variable | Secret? | Where it comes from |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | No | Supabase dashboard -> Project Settings -> API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | No* | Supabase dashboard -> Project Settings -> API |
| `NEXT_PUBLIC_MAPTILE_STYLE_URL` | No | Optional; your map tile provider |
| `GEOCODING_PROVIDER` | No | `geocodio` or `none` |
| `GEOCODIO_API_KEY` | **Yes** | Geocodio account dashboard -- see `docs/DATA_SOURCES.md` for pricing/signup |
| `ENABLE_SEARCH_HISTORY` | No | `true`/`false`, default `false` |
| `SEARCH_HISTORY_RETENTION_DAYS` | No | default `90` |
| `RATE_LIMIT_REQUESTS_PER_MINUTE` | No | default `30`; see the serverless caveat in `docs/SECURITY.md` |
| `SUPABASE_DB_URL` | **Yes** | Supabase dashboard -> Project Settings -> Database -> Connection string (URI tab, direct/port 5432). Used only by `scripts/*.ts`, never by the deployed app itself. |

\* The anon key is designed by Supabase to be public; it's safe in browser bundles. It grants access only within what RLS allows for the current session's role -- see `docs/SECURITY.md`.

Set `GEOCODIO_API_KEY` and `SUPABASE_DB_URL` only as server-side environment variables on your hosting platform (e.g. Vercel's "Environment Variables" with no "expose to browser" option checked) -- never as `NEXT_PUBLIC_*`, and never in a file that gets committed.

**What this project needs from you, specifically:** your Supabase project's `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` can be shared in chat (they're non-secret by design) so configuration can be double-checked; `SUPABASE_DB_URL` and `GEOCODIO_API_KEY` must only ever be set directly in your `.env.local` or hosting platform's secret configuration -- not pasted into any chat, including this one.

## 2. Applying the database schema

The six migrations under `supabase/migrations/` must be applied, in order, to your Supabase project's Postgres database:

```
20261010000001_extensions.sql       -- PostGIS and other extensions
20261010000002_core_schema.sql      -- data_sources, school_authorities, schools, school_programs, profiles, boundary tables
20261010000003_rls_policies.sql     -- Row Level Security policies + is_admin()/is_editor_or_admin()
20261010000004_functions.sql        -- nearby_stops(), publish_boundary_version(), rollback_boundary_version(), etc.
20261010000005_gtfs_schema.sql      -- GTFS static tables
20261010000006_school_lon_lat_columns.sql
```

Apply them with the Supabase CLI (recommended -- handles ordering and tracks what's applied):

```bash
npx supabase link --project-ref <your-project-ref>
npx supabase db push
```

or by running each file in order through the Supabase dashboard's SQL editor, or via `psql "$SUPABASE_DB_URL" -f supabase/migrations/<file>.sql` for each file in the listed order.

`supabase/seed.sql` inserts only `is_demo = true` rows (used by the public `/demo` route and by `tests/db/`) -- it contains no real school/boundary/transit data and is safe to run against any environment, including production, if you want the demo route to work there too.

## 3. Creating the first admin user

Migrations create the `profiles` table and roles (`user` / `editor` / `admin`) but cannot create a Supabase Auth user for you. After applying migrations:

1. Create a user via Supabase Auth (dashboard -> Authentication -> Users -> Add user, or have them sign up through your deployed app if you build a public auth flow).
2. Promote that user to `admin` by updating their `profiles` row:
   ```sql
   update public.profiles set role = 'admin' where id = '<their auth.users id>';
   ```
   Run this directly against the database (dashboard SQL editor or `psql "$SUPABASE_DB_URL"`) -- there is no admin UI for the very first promotion, since the admin UI itself requires an existing admin.

## 4. Importing real data

No official school, authority, boundary, or transit data ships with this repo or gets imported automatically. See `scripts/README.md` for the required order and `docs/DATA_SOURCES.md` for where to obtain each dataset and what's actually available today for Calgary/Airdrie (short version: Calgary Transit's GTFS feed is confirmed available; per-school attendance boundaries for CBE/CCSD/RVS are not currently available as machine-readable downloads -- see that document for the precise state of each source and what to do about `unavailable` designations in the meantime).

```bash
export SUPABASE_DB_URL="..."   # from step 1, never commit this
npm run import:sources -- path/to/sources.csv
npm run import:authorities -- path/to/authorities.csv
npm run import:schools -- path/to/schools.csv
npm run import:programs -- path/to/programs.csv        # optional
npm run import:boundaries -- path/to/boundaries.geojson # optional, creates a draft -- publish via /admin/boundary-versions
npm run import:gtfs -- path/to/unzipped-gtfs-folder
```

Add `-- --dry-run` to any of these to validate without writing.

## 5. Pre-launch checklist

- [ ] All six migrations applied to the production Supabase project (step 2).
- [ ] At least one `admin`-role user exists (step 3).
- [ ] `GEOCODIO_API_KEY` set server-side only; `GEOCODING_PROVIDER=geocodio`. Confirm Geocodio's pricing tier matches expected request volume (`docs/DATA_SOURCES.md`).
- [ ] `SUPABASE_DB_URL` set server-side only, in whatever secret store your CI/import tooling runs with -- never in a file checked into git, never as a `NEXT_PUBLIC_*` variable.
- [ ] Real school/authority/boundary/transit data imported for the areas you intend to serve, with every row traceable to a `data_sources` entry (the import scripts enforce this already; this is just confirming you ran them against real data, not only the DEMO seed).
- [ ] `RATE_LIMIT_REQUESTS_PER_MINUTE` set to a sensible value for your expected traffic. If deploying to a multi-instance serverless platform (Vercel, etc.), read the in-memory-limiter caveat in `docs/SECURITY.md` and consider swapping in a shared store (Upstash Redis / Vercel KV) first.
- [ ] `npm run build`, `npm run lint`, `npx tsc --noEmit`, `npm run test:unit`, and `npm run test:e2e` all pass against the target Node version in CI.
- [ ] `npm run test:db` passes against a scratch Postgres+PostGIS instance in CI (or you've otherwise re-verified the RLS policies against your actual production schema after applying migrations).
- [ ] HTTPS/TLS termination, security headers (CSP/HSTS/etc.), and CORS are configured at your hosting/CDN layer -- none of this is configured by the application code itself.
- [ ] `npm audit` re-run close to launch to confirm the disclosed `braces`/`eslint-config-next` finding (see `docs/SECURITY.md`) hasn't been joined by anything new that *does* need action.
- [ ] If turning on `ENABLE_SEARCH_HISTORY`, a scheduled job (cron, Supabase scheduled function, etc.) is wired up to run `npm run purge:search-history` on the cadence your `SEARCH_HISTORY_RETENTION_DAYS` implies.
- [ ] A decision made about `unavailable`-designation messaging in the production UI/PDF for authorities where boundary data genuinely isn't obtainable yet (currently all of CBE/CCSD/RVS/Christ the Redeemer per `docs/DATA_SOURCES.md`) -- the app will not fabricate a match, but what to tell a user in that state is a product decision, not a technical one.

## What has and hasn't been verified

Verified in this session, against real infrastructure:
- The SQL migrations, RLS policies, and database functions (`tests/db/`) against a real scratch PostgreSQL+PostGIS instance.
- The import scripts (`scripts/import-*.ts`) end-to-end against that same real database, including deliberately malformed input.
- The full application build, typecheck, lint, unit tests, and Playwright E2E tests against a real running Next.js server.
- The PDF export path through Next's actual server runtime (not just a standalone Node script -- see `docs/ARCHITECTURE.md`/commit history for why that distinction mattered).

**Not verified in this session**, because no real Supabase project, Geocodio key, or production hosting target was connected:
- Applying these migrations to an actual hosted Supabase project (only a local scratch Postgres stand-in was used, per `tests/db/00_supabase_stubs.sql`'s own comments -- it emulates Supabase's auth/role primitives well enough to test the migration SQL itself, but it is not a substitute for applying the real migrations to a real Supabase project at least once before relying on them).
- A real Geocodio API call (the integration code and its ambiguity-handling logic are unit-tested against mocked responses, not a live key).
- Any deployment platform's specific configuration (Vercel, Netlify, a container host, etc.) -- this document gives the generic steps; platform-specific quirks (build settings, environment variable UI, etc.) aren't covered.
