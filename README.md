# SchoolFinder

A school-designation and transportation research tool for families in Calgary and Airdrie, Alberta. Given an address, it reports which school authority/school(s) the address falls within an attendance boundary for (when that data is available), nearby transit stops, and lets the result be exported as a PDF with full source provenance.

**Current status:** Phase 1 implementation, local working tree. No real Supabase project, geocoding key, or official school/boundary data is connected yet -- see `docs/DEPLOYMENT.md` for exactly what's needed before this can run against real data, and `docs/DATA_SOURCES.md` for what data is and isn't available at all. Every designation the app returns is explicitly one of `designated` / `none_confirmed` / `unavailable` -- it never guesses or fabricates a match.

## Documentation

- **`docs/ARCHITECTURE.md`** -- how the app is put together: request flow, auth/authorization layering, data model, directory layout, testing strategy.
- **`docs/DATA_SOURCES.md`** -- verified research on every data source this app uses or would need: geocoding, school/authority data, attendance boundaries, GTFS transit data -- including what's confirmed available, what's confirmed unavailable, and the licensing/pricing for each.
- **`docs/SECURITY.md`** -- the security model (RLS as the authority, rate limiting, input validation, npm audit findings and decisions) and what this review does *not* cover.
- **`docs/DEPLOYMENT.md`** -- environment variables, how to apply migrations, the pre-launch checklist, and exactly what the operator needs to do that this codebase can't do on its own (supply a Supabase project, a geocoding API key, and real data).
- **`scripts/README.md`** -- the import pipeline (sources -> authorities -> schools -> programs -> boundaries -> GTFS) and CSV format rules.

## Local development

```bash
npm install
cp .env.example .env.local   # see docs/DEPLOYMENT.md for what to fill in
npm run dev
```

Open http://localhost:3000. The public `/demo` page renders without external configuration, but its address-search flow still requires Supabase and a configured geocoder; it is not an offline working search demo. the main search flow and admin UI require a real Supabase project (`docs/DEPLOYMENT.md`) and, for geocoding, a Geocodio API key.

## Testing

```bash
npm run lint          # ESLint
npx tsc --noEmit      # TypeScript
npm run test:unit     # Vitest -- pure-logic unit tests
npm run test:e2e      # Playwright -- real browser, real Next server
npm run test:db       # Raw SQL tests against a real scratch Postgres+PostGIS instance
```

`test:db` and `test:e2e` spin up real local infrastructure (a scratch Postgres database, and a real Next.js server respectively) rather than mocking either -- see `docs/ARCHITECTURE.md#testing-strategy` for why.

## Importing real data

Data never gets into this app without going through `scripts/import-*.ts`, which require real source data and enforce documented provenance for everything that isn't explicitly demo data. See `scripts/README.md` for the required order and CSV formats, and `docs/DATA_SOURCES.md` for where to actually obtain Calgary/Airdrie school and transit data.

## Admin UI

`/admin/*` (sources, authorities, schools, programs, boundary-versions) is for `editor`/`admin`-role accounts, authenticated via Supabase Auth. Row Level Security on the database is the actual authorization boundary -- see `docs/SECURITY.md`.

## Imported handoff validation

The original implementation is preserved separately before importing this handoff. Browser tests currently cover public page rendering, input validation and unauthenticated admin redirects; they do not verify successful address search, a connected Supabase project or an authorized admin session. Configure and test those integrations before launch. For browser tests on this cloud image, run `BROWSER_EXECUTABLE=/usr/bin/chromium npm run test:e2e`. On other machines, omit that variable after installing Playwright's browsers. Source research notes are imported claims, not independently verified dataset availability.
