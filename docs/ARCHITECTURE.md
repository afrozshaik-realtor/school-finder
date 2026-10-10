# Architecture

SchoolFinder is a Next.js 16 (App Router) application backed by Supabase (PostgreSQL + PostGIS + Auth). This document describes how the pieces fit together; see `docs/DATA_SOURCES.md` for where the underlying data comes from, `docs/SECURITY.md` for the security model, and `DEPLOYMENT.md` for how to stand this up for real.

## Stack

- **Next.js 16** (App Router, Turbopack), TypeScript, Tailwind CSS.
- **Supabase**: PostgreSQL with PostGIS for geometry, Supabase Auth for admin/editor accounts, Row Level Security for every authorization decision.
- **MapLibre** for the map view.
- **Geocodio** as the geocoding provider (see `docs/DATA_SOURCES.md` for why).
- **`@react-pdf/renderer`** for PDF export (pure-JS, no headless browser dependency).
- **Vitest** (unit), **Playwright** (E2E), **raw `psql`** (database/RLS tests) for verification.

## Request flow

```
Browser
  |
  |-- GET /                      -> src/app/page.tsx (search UI)
  |-- POST /api/search           -> runSearch() -> Supabase (RPC + tables)
  |-- POST /api/pdf               -> runSearch() again, server-side only -> @react-pdf/renderer -> PDF bytes
  |-- GET  /api/schools           -> school list for the map
  |-- /admin/*                    -> gated by src/proxy.ts (optimistic) + RLS (authoritative)
  |-- POST /api/admin/*           -> role check -> rate limit -> Zod validation -> Supabase insert (RLS-enforced)
```

### Why `/api/pdf` re-runs the search instead of taking the client's result

A client could, in principle, submit any JSON it wants to an endpoint that "just formats a PDF from what you send it." To make that impossible, `/api/pdf` does not accept computed results at all -- it accepts the same input `/api/search` does (an address or coordinates) and calls the exact same `runSearch()` function (`src/lib/search/runSearch.ts`) to compute the result itself, server-side, from the live database. The PDF is then rendered from that server-computed result. This means the only way a value ever appears in an exported PDF is if the server actually derived it from real data -- never from client-supplied JSON.

### Auth and authorization layering

Three layers, in order of actual authority (highest last):

1. **`src/proxy.ts`** (Next's middleware mechanism, renamed `proxy.ts` in Next 16) -- refreshes the Supabase session cookie on every navigation and does an *optimistic* redirect-to-login for `/admin/*` routes when there's no session. This is a UX nicety, not a security boundary -- it runs at the edge and has no concept of roles, only "is there a logged-in user at all."
2. **API route role checks** (`getCurrentUserWithRole()` in each `/api/admin/*` route) -- a fast, friendly 403 if the caller isn't an editor/admin. This re-validates the session against the Auth server (`auth.getUser()`, not the unverified `getSession()`) so a stale/tampered cookie can't grant access. Still not the real gate.
3. **PostgreSQL Row Level Security**, via `is_admin()` / `is_editor_or_admin()` `SECURITY DEFINER` helper functions (`supabase/migrations/20261010000003_rls_policies.sql`). This is the actual authority: every table's policies are enforced by Postgres itself regardless of what the application code does or doesn't check. The Supabase client used server-side (`src/lib/supabase/server.ts`) always runs as the requesting user's own authenticated session (via the anon key + their session cookie) -- never as the service role -- so RLS is never bypassed from within the app.

The service-role key (or an equivalent direct-DB credential) is read only by the standalone import scripts under `scripts/`, which connect directly to Postgres and are never imported by any browser-facing code path. See `docs/SECURITY.md` for the verification of this claim.

## Data model (high level)

- `data_sources` -- provenance record for every piece of imported data: organization, source URL, license, last-verified date. Every row in the tables below must cite one, by foreign key, except rows explicitly marked `is_demo = true`.
- `school_authorities` -- school boards/authorities (CBE, CCSD, RVS, etc.).
- `schools` -- individual schools, each belonging to an authority, with an optional geocoded point.
- `school_programs` -- optional programs within a school (French Immersion, TLC, etc.).
- `boundary_versions` / attendance boundary geometry -- versioned polygon sets, with a draft/published/rolled-back lifecycle (`publish_boundary_version` / `rollback_boundary_version` RPCs), so a boundary update is never silently live and is always revertible with an audit trail (`admin_actions`).
- `gtfs_feeds` and the standard GTFS static tables (routes/stops/trips/stop_times/calendar/shapes) -- transit data, scoped per feed so Calgary Transit and any future feed don't collide.
- `search_history` -- optional (off by default, `ENABLE_SEARCH_HISTORY`), purged on a retention schedule by `scripts/purge-search-history.ts`.
- `profiles` -- app-level role (`user` / `editor` / `admin`) per Supabase Auth user.

Every designation returned to a user is one of three explicit states -- `designated`, `none_confirmed`, or `unavailable` -- never a boolean. This is deliberate: a school genuinely has no confirmed boundary data for many Alberta authorities right now (see `docs/DATA_SOURCES.md`), and collapsing "we checked and there's no match" into the same value as "we don't have data for this area" would misrepresent what the app actually knows. `unavailable` must always be distinguishable from `none_confirmed` in both the API response and the UI/PDF.

## Directory layout

```
src/
  app/                  Next.js App Router pages and API routes
    admin/              Admin UI (login, sources, authorities, schools, programs, boundary-versions)
    api/                Route handlers (search, pdf, schools, admin/*)
    demo/               Public demo mode (is_demo = true data only)
  components/           React components (incl. components/admin/* for admin forms)
  lib/
    supabase/           Browser + server Supabase client factories
    search/             runSearch() -- the single source of truth for a search result
    geocoding/           Geocodio integration + ambiguity heuristic
    gtfs/                 GTFS query helpers (nearby stops, etc.)
    pdf/                  React-PDF document definition
    designation/          Tri-state designation logic
    validation/            Zod schemas (admin writes)
    env.ts                 Validated, centrally-defined env access (public vs. server-only)
    rateLimit.ts            In-memory sliding-window limiter
  types/database.ts         Generated-style Supabase/Postgres types
  proxy.ts                   Edge session refresh + optimistic /admin gate
scripts/                 Standalone import/maintenance tooling (direct Postgres connection)
supabase/migrations/     SQL migrations (schema, RLS, functions, GTFS tables)
supabase/seed.sql        Demo-only seed data
tests/
  db/                    Raw SQL test files run against a real Postgres+PostGIS instance
  unit/                  Vitest unit tests
  e2e/                   Playwright end-to-end tests
docs/                    This file, DATA_SOURCES.md, SECURITY.md
```

## Testing strategy

Three independent layers, none of them mocking the database:

1. **`tests/db/*.sql`**, run via `npm run test:db` (`tests/db/run.sh`) against a real local Postgres with PostGIS -- verifies RLS policies, the designation logic, and the boundary publish/rollback audit trail by actually attempting blocked and allowed operations as different roles.
2. **`tests/unit/*`**, run via `npm run test:unit` (Vitest) -- pure-logic tests (rate limiting, geocoding ambiguity heuristic, numeric coercion, validation schemas, a React component).
3. **`tests/e2e/*`**, run via `npm run test:e2e` (Playwright) -- drives a real running Next.js server in a real browser, including a regression test for the `/admin/login` redirect-loop bug found and fixed during development.

See `docs/SECURITY.md` for what was found and fixed via these tests, and `DEPLOYMENT.md` for how to run them in CI.
