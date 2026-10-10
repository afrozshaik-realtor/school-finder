# Security notes

This document records the security-relevant decisions made in this codebase, the reasoning behind them, and the known limitations. It is not a certification that the app is production-ready — see `DEPLOYMENT.md` for the outstanding setup steps required before any real deployment.

## Authorization model

- **RLS is the authority, not the API routes.** Every admin-facing API route (`/api/admin/*`) does an app-level role check (`getCurrentUserWithRole()`) before touching the database. This exists only to return a fast, friendly 403 instead of a confusing database error — it is defense-in-depth, never the real gate. The real gate is PostgreSQL Row Level Security on each table, using `is_admin()` / `is_editor_or_admin()` `SECURITY DEFINER` helper functions. A bug in a route's app-level check can at worst produce a wrong error message; it cannot bypass RLS, because the Supabase client used in these routes (`createClient()` from `@/lib/supabase/server`) runs as the authenticated user's own session, not as the service role.
- **The service-role key is never read by application code.** `grep`-verified: no file under `src/` or `scripts/` reads `SUPABASE_SERVICE_ROLE_KEY` or an equivalent. Admin import scripts (`scripts/import-*.ts`) connect directly to Postgres via `SUPABASE_DB_URL` (a direct connection string, not a Supabase client), which is intentional — see `scripts/README.md` — but that connection string is itself a secret and must only ever live in server-side environment configuration (see `DEPLOYMENT.md`), never in client code or committed files.
- **Boundary publish/rollback is audited.** `publish_boundary_version` and `rollback_boundary_version` are `SECURITY DEFINER` RPCs that re-check `is_editor_or_admin()` themselves (the API route's own check is, again, just a fast-fail) and write a row to `admin_actions` for every call, so every boundary change has an auditable actor and timestamp.

## Rate limiting

All write-capable endpoints are rate-limited via `src/lib/rateLimit.ts` (`checkRateLimit`), an in-memory sliding-window limiter (`RATE_LIMIT_REQUESTS_PER_MINUTE` per minute, configurable via env):

- **Anonymous/public routes** (`/api/search`, `/api/pdf`, `/api/schools`) are keyed by client IP (`clientKeyFromHeaders`, reading `x-forwarded-for`).
- **Admin write routes** — `/api/admin/sources`, `/api/admin/authorities`, `/api/admin/schools`, `/api/admin/programs`, `/api/admin/boundary-versions/publish`, `/api/admin/boundary-versions/rollback` — are keyed by authenticated user ID (`adminWriteKey(user.id)`), not IP. This is deliberate: several admins can legitimately share an office or VPN egress IP, so IP-keying would let one admin's activity throttle another's; keying by user ID instead bounds each individual session (including a compromised or scripted one) regardless of which network it calls from.

**Known limitation (documented in `rateLimit.ts` itself):** the limiter's state is an in-memory `Map` inside a single server process. On a traditional long-running Node server (one container) this is an accurate global limit. On a serverless/edge platform that runs multiple concurrent instances (e.g. Vercel), each instance holds its own counters, so the effective limit becomes `RATE_LIMIT_REQUESTS_PER_MINUTE × (number of warm instances)` rather than a hard global ceiling. If the production deployment target is serverless/multi-instance, replace the `Map` with a shared store (Upstash Redis, Vercel KV, etc.) behind the same `checkRateLimit(key)` signature before launch — no call site needs to change.

## Input validation

All admin write routes and the import scripts validate input through Zod schemas (`src/lib/validation/admin.ts` for the API, per-script schemas under `scripts/`) before anything touches the database. Two correctness bugs were found and fixed during this project specifically because of this validation layer:

- `Number("")` evaluates to `0` in JavaScript, so a blank CSV cell for latitude/longitude or a GTFS numeric field would silently become a real-looking `0` coordinate instead of being rejected. Fixed via a `z.preprocess()` step that blanks empty strings to `undefined` before `z.coerce.number()` runs (`import-schools.ts`), and via a shared `toFiniteNumber()` helper that returns `NaN` for blank/undefined input so malformed GTFS rows are explicitly rejected rather than defaulted (`scripts/lib/num.ts`, used throughout `import-gtfs.ts`). Both were verified against a real database, not just unit-tested in isolation — a deliberately blank-coordinate test row produces `NULL`, not `0, 0`.
- A SQL parameter-indexing bug in `import-schools.ts`'s conditional location-update query could, under certain combinations of which fields were present, bind a value to the wrong placeholder. Fixed by always passing lat/lon as fixed-position parameters and using a SQL `CASE WHEN ... IS NOT NULL THEN ... ELSE null END` expression instead of conditionally renumbering placeholders across code branches.

## SQL construction

Every database access in the app and scripts uses parameterized queries (`pg`'s `$1`/`$2` placeholders, or the Supabase/PostgREST query builder) — none of it builds SQL by string-interpolating external input. One borderline case was found and hardened anyway: `scripts/purge-search-history.ts` originally built its retention cutoff by interpolating a number into the query text. That number was never attacker-controlled (it's read from a server-side environment variable and validated as a positive finite number before use), so this was not actually exploitable, but it was rewritten to a fully parameterized form (`now() - ($1::double precision * interval '1 day')`) as defense-in-depth, in case the script is ever changed to source that value from somewhere less trusted. Re-verified working via a real dry-run against the test database after the change.

## PDF export trust boundary

`/api/pdf` does not accept pre-computed search results from the client. It calls the same `runSearch()` function that `/api/search` uses (`src/lib/search/runSearch.ts`), re-running the real query server-side from the submitted address/coordinates, then renders the PDF from that server-computed result. A client cannot submit arbitrary designation/transportation data and have it rendered into an official-looking PDF — the only way to get a given result into a PDF is for the server to have actually computed it from real data.

## Manual code-pattern sweep

Grepped the full `src/` and `scripts/` trees for common unsafe patterns:

- `dangerouslySetInnerHTML`: not used anywhere.
- `eval(`, `new Function(`, `child_process.exec`/`execSync`: not used anywhere.
- Secret values (service-role key, `SUPABASE_DB_URL`, API keys) logged or returned in any response or `console.log`: none found. Error responses return `error.message` from Supabase/Postgres errors, which describe constraint/validation failures, not secret values.

## npm audit

`npm audit` currently reports 5 high-severity findings, all from a single root cause: `braces@3.0.3` (GHSA-vfj7-8cjw-p6xm), pulled in transitively through `eslint-config-next@16.4.0`'s own dependency chain.

- `braces@3.0.3` is the latest version npm has available; there is no newer upstream release that fixes this yet.
- The only remediation `npm audit fix --force` offers is downgrading `eslint-config-next` to `14.2.35`, which would mismatch Next.js 16.4.0's actual lint rules for a tool that never ships in the production bundle.
- The vulnerable code path processes developer-authored glob patterns at lint/dev time, not end-user input, and `eslint-config-next` is a `devDependency` — it is not part of the deployed application.

**Decision: do not force the downgrade.** This is a disclosed, low-real-risk, dev-only, currently-unpatchable-upstream transitive dependency issue. Re-run `npm audit` periodically (and before each deployment) to pick up an upstream fix once one exists.

## What this document does not cover

This is a code-level review, not a penetration test, and it does not substitute for:

- Reviewing Supabase project-level settings (email confirmation requirements, auth rate limits, JWT expiry) once a real project is connected.
- Configuring the production `RATE_LIMIT_REQUESTS_PER_MINUTE` value and, if deploying to a multi-instance serverless platform, replacing the in-memory limiter as described above.
- Setting up TLS/HTTPS termination, security headers (CSP, HSTS, etc.) at the hosting/CDN layer, and CORS policy for the deployed domain — none of this is configured by the application code itself.
- A third-party security review before handling real user data at scale.

See `DEPLOYMENT.md` for the concrete pre-launch checklist.
