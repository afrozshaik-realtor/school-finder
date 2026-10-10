# Import & maintenance scripts

Node/TypeScript scripts run with `tsx` (or the `npm run import:*` /
`npm run purge:search-history` shortcuts in `package.json`). Every script
is server-side only: it connects straight to Postgres with the
`SUPABASE_DB_URL` connection string (see below), never through the
browser-facing anon key, and never through `src/`.

## Setup

```bash
export SUPABASE_DB_URL="postgres://postgres:<password>@<host>:5432/<db>"
```

Get this from the Supabase dashboard: Project Settings -> Database ->
Connection string ("URI" tab). Use the direct (non-pooling, port 5432)
connection for these scripts, not the pooled/transaction-mode one --
DDL-adjacent operations (this is plain DML, but keeping one consistent
connection style avoids surprises) behave more predictably on it. Treat
this string exactly like the service-role key: put it in your shell
environment or an untracked `.env.local` (there's a `dotenv/config`
import at the top of `scripts/lib/db.ts` so a local `.env.local` is
picked up automatically), never commit it, never paste it into chat.

Every script accepts `--dry-run` to validate input and report what would
happen without writing anything.

## Required order

Each script enforces its own prerequisites (missing a prerequisite rejects
the row with a clear reason rather than guessing), but the natural order
is:

1. **`import-sources.ts`** -- register provenance (`data_sources`) for
   every dataset you're about to import. Required by every later step.
2. **`import-authorities.ts`** -- school boards/authorities
   (`school_authorities`), each citing a source from step 1.
3. **`import-schools.ts`** -- individual schools (`schools`), each citing
   an authority from step 2 and a source from step 1.
4. **`import-programs.ts`** -- optional programs per school
   (`school_programs`, e.g. TLC, French Immersion).
5. **`import-boundaries.ts`** -- attendance-boundary polygons as a new
   **draft** `boundary_version` (never auto-published -- review and
   publish from `/admin/boundary-versions`).
6. **`import-gtfs.ts`** -- a GTFS static feed (already unzipped) into a
   new `gtfs_feeds` row and its routes/stops/trips/etc.

`purge-search-history.ts` is unrelated to imports: it deletes
`search_history` rows past `SEARCH_HISTORY_RETENTION_DAYS`, for scheduled
use if `ENABLE_SEARCH_HISTORY=true`.

## CSV format reference

Each script's header comment documents its exact expected columns. A
few rules apply everywhere:

- Every official (non-DEMO) row must resolve to an existing
  `data_sources` row by exact `(name, organization)` match -- these
  scripts never invent a source.
- A blank cell means "no value," never a guessed default. In particular,
  blank `latitude`/`longitude` (schools) or `stop_lat`/`stop_lon` (GTFS
  stops) are stored as `null`, not `0, 0` -- `Number("")` is `0` in
  JavaScript, which is exactly the kind of silent wrong-coordinate bug
  these scripts explicitly guard against (see `scripts/lib/num.ts` and
  the preprocessing in `import-schools.ts`). Verified by a real
  Postgres+PostGIS integration run during development: a row with blank
  coordinates landed as `NULL`, not `(0,0)`.
- Every script reports accepted vs. rejected counts and the reason for
  every rejected row; nothing is silently dropped.
- Imports run inside a transaction and roll back entirely on an
  unexpected error (as opposed to a per-row validation rejection, which
  just skips that row and continues).

## Verified against a real database, not just type-checked

These scripts were run end-to-end against a real PostgreSQL+PostGIS
instance (the same one `tests/db/run.sh` builds) with small synthetic
fixtures covering sources -> authorities -> schools (including a
deliberately blank-coordinate row) -> programs -> a boundary GeoJSON ->
a GTFS feed (including deliberately malformed rows), and the results
were queried back out and spot-checked, including through the app's own
`nearby_stops()` RPC. See `docs/DATA_SOURCES.md` for why no real official
dataset could be imported from inside this project's sandbox (network
egress is restricted here) and what the precise next external step is.
