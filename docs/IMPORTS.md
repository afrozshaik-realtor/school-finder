# Importing data

This is the short, operator-facing version. The full details -- exact CSV columns, validation rules, transaction behavior -- live in `scripts/README.md`, which each script's own header comment also restates. Where to actually obtain Calgary/Airdrie school, authority, boundary, and transit data -- what's confirmed available today versus confirmed unavailable, with licensing and pricing -- is in `docs/DATA_SOURCES.md`. This document just ties the two together into "what do I run, in what order, and where does the input come from."

## Prerequisite

```bash
export SUPABASE_DB_URL="postgres://postgres:<password>@<host>:5432/<db>"
```

Get this from Supabase dashboard -> Project Settings -> Database -> Connection string (URI tab, direct/non-pooling connection, port 5432). Treat it exactly like a password: shell environment or an untracked `.env.local`, never committed, never pasted into chat. See `docs/DEPLOYMENT.md` and `scripts/README.md` for more on this.

Every script below accepts `-- --dry-run` to validate input and print what would happen without writing anything -- always do this first against new input.

## Required order

| # | Command | Input | Depends on | Data source |
|---|---|---|---|---|
| 1 | `npm run import:sources -- <file>.csv` | Provenance records | nothing | You compile this -- see `docs/DATA_SOURCES.md` for the organizations/licenses to cite |
| 2 | `npm run import:authorities -- <file>.csv` | School boards | step 1 | CBE / CCSD / RVS / Christ the Redeemer public info |
| 3 | `npm run import:schools -- <file>.csv` | Individual schools | steps 1-2 | Each authority's own school directory |
| 4 | `npm run import:programs -- <file>.csv` | Optional programs (French Immersion, TLC, etc.) | steps 1-3 | Each school's own program listing |
| 5 | `npm run import:boundaries -- <file>.geojson` | Attendance boundary polygons | steps 1-3 | **Currently unavailable as a machine-readable download for CBE/CCSD/RVS/Christ the Redeemer** -- see `docs/DATA_SOURCES.md` for the exact state and what to request from each authority. `geospatial.alberta.ca`'s jurisdiction-boundary service is real but coarser than per-school attendance zones. Creates a **draft** boundary version -- never auto-published; review and publish from `/admin/boundary-versions`. |
| 6 | `npm run import:gtfs -- <unzipped-folder>` | GTFS static feed | nothing | **Calgary Transit: confirmed active** -- see `docs/DATA_SOURCES.md` for the exact producer URL. Airdrie Transit's GTFS feed is confirmed dead as of the 2026-10-10 research in that document. |

`npm run purge:search-history` is unrelated to importing -- it deletes old `search_history` rows on a schedule, only relevant if `ENABLE_SEARCH_HISTORY=true`.

## What the scripts refuse to do

- **Never invent a source.** Every non-demo row must resolve to an existing `data_sources` row by exact name/organization match, or it's rejected with that reason.
- **Never guess a coordinate.** A blank lat/lon (schools) or stop_lat/stop_lon (GTFS stops) is stored as `NULL`, never `0, 0` -- verified against a real database during development (see `docs/SECURITY.md` for the bug this guards against).
- **Never silently drop a row.** Every run reports accepted vs. rejected counts and the specific reason for every rejection.
- **Never partially commit on an unexpected error.** Each import runs inside a transaction; a per-row validation failure just skips that row, but an unexpected error rolls back the entire run.

## Why no real official data has been imported yet

This repository was built in a sandboxed environment whose network egress is restricted to package registries -- `data.calgary.ca`, `services1.arcgis.com`, `geospatial.alberta.ca`, and `mobilitydatabase.org` were all confirmed blocked for direct download from that sandbox (confirmed via the proxy's own connection logs, not assumed). The import scripts themselves are fully built and verified end-to-end against a real database using synthetic fixtures; what's missing is simply downloading the real files from outside that sandbox and running the commands above against them. `docs/DATA_SOURCES.md` has the exact URLs and the precise action required for each dataset.
