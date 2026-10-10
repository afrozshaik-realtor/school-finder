# Data sources: research findings and provenance

> Imported research notes from Claude's handoff. The source availability, pricing and licence claims below have not been independently verified in this environment. Failed or blocked requests do not establish that datasets do not exist, and a tracker failure does not establish that a transit service has no usable feed. Confirm these claims directly with the providers before importing data or relying on them for launch.

This document records what was actually checked for Calgary/Airdrie school
designation and transportation data, when it was checked, and what the
result was. It exists so that "unavailable" states in the app are
traceable to a real finding, not a guess, and so a future import never
has to re-derive this from scratch. Every source below was verified via
live web research on **2026-10-10** (dates given with each finding) --
re-verify before relying on anything here after a few months, since
government/transit data portals change.

**Hard rule this file exists to enforce:** nothing is imported into the
`official_*` tables without a `data_sources` row recording this kind of
provenance (URL, license, coverage, verification date) -- see the
`*_source_required_unless_demo` CHECK constraints in
`supabase/migrations/20261010000002_core_schema.sql`.

## Geocoding provider: Geocodio

Chosen over Google Maps/HERE/Mapbox/TomTom for this app. Verified
2026-10-10 against [Geocodio's pricing page](https://geocod.io/pricing):

- **Free tier:** 2,500 lookups/day at no cost (pay-as-you-go and Flex
  plans), no card required to start.
- **Paid tier:** $1 USD per 1,000 lookups pay-as-you-go beyond the free
  tier (~$0.001/lookup) -- appropriate for this app's low initial volume.
  Flex plans (from $325/mo for 350k credits/mo) and Unlimited plans (from
  $1,350/mo) exist for higher volume; not needed at launch.
- **Canada coverage:** Pay-as-you-go explicitly covers US, Canada, and
  Mexico.
- **Storage/caching rights:** Geocodio's pricing page states its Terms of
  Use "allow you to store results long-term" -- this is why
  `src/lib/geocoding/geocodio.ts` sets a 30-day Next.js fetch-cache
  `revalidate` on results: a fixed address's geocode doesn't change, and
  re-billing an identical lookup isn't necessary under these terms. (Read
  Geocodio's actual Terms of Use before shipping, not just the pricing
  page summary, in case terms differ by plan.)
- **Accuracy/ambiguity handling:** implemented in
  `src/lib/geocoding/geocodio.ts` -- see `isAmbiguous()` for the documented
  heuristic (no single top result, or top two results too close in
  confidence) used to surface "ambiguous" instead of guessing.

An API key is required and is **not** included in this repository --
see `docs/DEPLOYMENT.md` for where to set `GEOCODIO_API_KEY`.

## School authorities serving Calgary and Airdrie

| Authority | Type | Serves | Verified |
|---|---|---|---|
| Calgary Board of Education (CBE) | Public | Calgary | 2026-10-10 |
| Calgary Catholic School District (CCSD; legal name "Roman Catholic Separate School District No. 1") | Catholic | Calgary, and at least one Airdrie school (St. Martin de Porres High School) | 2026-10-10 |
| Rocky View Schools (RVS) | Public | Airdrie and surrounding Rocky View County | 2026-10-10 |
| Christ the Redeemer Catholic Schools | Catholic | Okotoks, Strathmore, Canmore, High River, Oyen areas -- their own attendance-boundary page does **not** list Airdrie | 2026-10-10 |

The CCSD/Airdrie finding corrects an easy wrong assumption (that Airdrie's
Catholic schools fall under Christ the Redeemer because it's the
geographically closer "small-city" Catholic division): Alberta separate
school district jurisdiction doesn't follow municipal boundaries, and at
least one CCSD high school is physically located in Airdrie. This needs
confirming directly with CCSD before being treated as authoritative for
every Airdrie address -- it is recorded here as a lead, not as confirmed
full coverage.

Private and charter schools serving these cities have not yet been
researched (no search was run for them in this pass) -- treat that as
unresearched, not as "none exist."

## Attendance-boundary (designation) data: NOT machine-available

This is the central finding: **no authority above publishes individual
school attendance-boundary polygons as a public download or API.** Every
one of them gates the actual designated-school answer behind an
interactive, address-by-address tool with no documented backing API:

- **CBE "Find a School"** (https://cbe.ab.ca/schools/find-a-school/Pages/default.aspx):
  address search returns a designated school and shows attendance-area/
  walk-zone map layers, but the page documents no public API or
  downloadable boundary file.
- **CCSD:** no locator/boundary tool was found at all in this pass
  (cssd.ab.ca's boundary-related page returned a fetch error; a broader
  site search found no attendance-boundary tool). Needs a follow-up
  search directly on cssd.ab.ca, or a direct inquiry to the district.
- **Rocky View Schools:** the attendance-areas page
  (https://www.rockyview.ab.ca/schools/schools-attendance-areas) states
  boundaries are shown per-school, "indicative only," and that the
  attendance area is only confirmed during registration -- no file or API.
- **Christ the Redeemer:** boundaries are shown only as embedded,
  interactive Google My Maps per region
  (https://www.redeemer.ab.ca/attendance-boundaries) with a note that the
  information is "indicative only"; not downloadable, and doesn't cover
  Airdrie regardless.

**Consequence for this app:** `boundary_versions` / `attendance_boundaries`
currently hold only the fictional DEMO rows from `supabase/seed.sql`.
Every real Calgary/Airdrie address will correctly show `unavailable` for
designation (never `none_confirmed`, which would wrongly imply a boundary
was checked and missed) until one of the following happens:

1. A district provides boundary data directly (the most reliable path --
   contact CBE via https://www.cbe.ab.ca/contact-us, Rocky View Schools at
   enquiries@rockyview.ab.ca / 403-945-4000, or the equivalent CCSD
   contact, and ask specifically for a GIS export of attendance-area
   polygons), or
2. A FOIP/open-records request is filed for the same data, or
3. Someone manually digitizes boundaries from the published interactive
   maps -- labor-intensive and only as accurate as the source map, so this
   should be a last resort and must still go through `data_sources` with
   `authorization_notes` describing exactly how it was derived.

Once any of these produces real polygon data in GeoJSON (school-to-polygon
pairs in WGS84), `scripts/import-boundaries.ts` (written in this session)
imports it as a draft `boundary_version` ready for admin review/publish --
no further coding should be needed.

### A related but different official dataset: Alberta's jurisdiction boundaries

The Government of Alberta publishes **school-authority jurisdiction**
boundaries (which authority has legal jurisdiction over an area -- not
which individual school a student is designated to) via its open
geospatial REST service, verified 2026-10-10:

- Service root: `https://geospatial.alberta.ca/titan/rest/services/education/`
- Layers of interest: `edu_public_schl_auth_bound_2022_group_public` and
  `edu_separate_schl_auth_bound_2022_group_public`
- The separate (Catholic) layer's "By Name Area Outline" sub-layer
  (`MapServer/2`) has `name`/`code` fields identifying each authority
  (e.g. "Calgary Roman Catholic") and supports GeoJSON query output
  (`supportedQueryFormats` includes `geoJSON`).

This is real, official, and genuinely downloadable -- but it answers "which
board serves this area," not "which school." It does not fit the current
`attendance_boundaries` schema (which always ties a polygon to one
`school_id`). Treat this as a candidate future enhancement (e.g. a
coarser "which authority" result shown when no school-level boundary
exists yet) rather than something already wired into the app -- it is not
imported anywhere in this codebase today.

## Transit (GTFS)

- **Calgary Transit -- ACTIVE, verified 2026-10-10.** Published on Calgary's
  open data portal via the GTFS validator/registry at
  [mobilitydatabase.org/feeds/gtfs/mdb-712](https://mobilitydatabase.org/feeds/gtfs/mdb-712):
  feed marked Active, service date range confirmed current
  (Sep 29 2026 -- Dec 20 2026 at time of check), with a working download
  link. Producer URL:
  `https://data.calgary.ca/download/npk7-z3bj/application%2Fzip`. License
  reference: `https://data.calgary.ca/stories/s/u45n-7awa/` (Calgary's
  Open Data Terms of Use -- read the actual terms before import, this is
  the pointer found, not a substitute for reading it). The validator
  reported 2 data-quality warnings on the current feed version; review
  them before/after import, they don't block it.
- **Airdrie Transit -- UNAVAILABLE, verified 2026-10-10.** Tracked by
  MobilityData as [feed tld-4819](https://mobilitydatabase.org/feeds/gtfs/tld-4819).
  The tracker reports "Unable to download this feed" and an empty
  download history; the producer URL on file
  (`https://www.airdrie.ca/gettransitgtfs.cfm`) is not currently serving a
  usable feed. This matches the earlier finding in this project that
  Airdrie Transit's feed is effectively dead. Re-check periodically, or
  contact the City of Airdrie directly, before assuming this is permanent.

### Why this session couldn't actually import the Calgary Transit feed

This sandboxed environment's outbound network is restricted to package
registries (npm, pip, etc.) and a short allowlist -- `data.calgary.ca`,
`services1.arcgis.com`, `geospatial.alberta.ca`, and
`mobilitydatabase.org` are all blocked for direct download from here
(confirmed via the sandbox's egress-proxy status endpoint, which logs
each as `connect_rejected`/403 at the time of this research). The
WebFetch/WebSearch tools used for the research above go through a
different path that can read and summarize pages, but cannot stream a
binary ZIP file into this filesystem.

**Required action (the precise external step, since this is blocked
here):** from a machine with normal internet access, download
`https://data.calgary.ca/download/npk7-z3bj/application%2Fzip`, unzip it,
then run (with `SUPABASE_DB_URL` pointed at the real project -- see
`docs/DEPLOYMENT.md`):

```bash
npm run import:sources -- path/to/sources.csv   # one row citing data.calgary.ca + the terms-of-use link above
npm run import:gtfs -- --dir path/to/unzipped-feed \
  --feed-name "Calgary Transit" --agency-name "Calgary Transit" \
  --source-name "<name used in sources.csv>" --source-organization "<organization used in sources.csv>"
```

`scripts/import-gtfs.ts` validates every required GTFS file is present,
rejects rows with missing/invalid coordinates or sequence numbers
(rather than silently defaulting them to 0), and reports exactly what was
accepted vs. rejected -- see `scripts/README.md`.
