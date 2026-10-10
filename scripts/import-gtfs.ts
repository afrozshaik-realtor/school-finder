// Import a GTFS static feed (already unzipped to a directory) into the
// gtfs_* tables, scoped to one new gtfs_feeds row.
//
// Required files in --dir: agency.txt, routes.txt, stops.txt, trips.txt,
// stop_times.txt, and at least one of calendar.txt / calendar_dates.txt.
// shapes.txt is optional. A feed distributed as a .zip must be extracted
// first (`unzip feed.zip -d feed/`) -- this script does not extract
// archives, so an untrusted/unexamined zip is never opened implicitly.
//
// This script only ever creates is_demo=false rows and requires an
// existing data_sources row (run import-sources.ts first) -- there is no
// path for fabricated transit data to enter the official tables.
//
// Usage:
//   npx tsx scripts/import-gtfs.ts --dir path/to/extracted-feed \
//     --feed-name "Calgary Transit" --agency-name "Calgary Transit" \
//     --source-name "..." --source-organization "..." \
//     [--license "..."] [--feed-version "..."] [--dry-run]
import { existsSync } from "node:fs";
import { join } from "node:path";
import { readCsv } from "./lib/csv";
import { withClient, printReport, type ImportReport } from "./lib/db";
import { toFiniteNumber } from "./lib/num";

function parseFlags(argv: string[]) {
  const get = (name: string) => {
    const idx = argv.indexOf(`--${name}`);
    return idx >= 0 ? argv[idx + 1] : undefined;
  };
  const dir = get("dir");
  const feedName = get("feed-name");
  const agencyName = get("agency-name");
  const sourceName = get("source-name");
  const sourceOrganization = get("source-organization");
  if (!dir || !feedName || !agencyName || !sourceName || !sourceOrganization) {
    console.error(
      "Usage: npx tsx scripts/import-gtfs.ts --dir <extracted-feed-dir> --feed-name <name> " +
        "--agency-name <name> --source-name <name> --source-organization <org> " +
        "[--license <text>] [--feed-version <text>] [--dry-run]"
    );
    process.exit(1);
  }
  return {
    dir,
    feedName,
    agencyName,
    sourceName,
    sourceOrganization,
    license: get("license") ?? null,
    feedVersion: get("feed-version") ?? null,
    dryRun: argv.includes("--dry-run"),
  };
}

function gtfsDateToIso(d: string | undefined): string | null {
  if (!d || !/^\d{8}$/.test(d)) return null;
  return `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;
}

async function main() {
  const flags = parseFlags(process.argv.slice(2));

  const required = ["agency.txt", "routes.txt", "stops.txt", "trips.txt", "stop_times.txt"];
  const missing = required.filter((f) => !existsSync(join(flags.dir, f)));
  if (missing.length > 0) {
    console.error(`Missing required GTFS file(s) in ${flags.dir}: ${missing.join(", ")}`);
    process.exit(1);
  }
  const hasCalendar = existsSync(join(flags.dir, "calendar.txt"));
  const hasCalendarDates = existsSync(join(flags.dir, "calendar_dates.txt"));
  if (!hasCalendar && !hasCalendarDates) {
    console.error(`Neither calendar.txt nor calendar_dates.txt found in ${flags.dir} -- a GTFS feed needs at least one.`);
    process.exit(1);
  }
  const hasShapes = existsSync(join(flags.dir, "shapes.txt"));

  const routes = readCsv(join(flags.dir, "routes.txt"));
  const stops = readCsv(join(flags.dir, "stops.txt"));
  const trips = readCsv(join(flags.dir, "trips.txt"));
  const stopTimes = readCsv(join(flags.dir, "stop_times.txt"));
  const calendar = hasCalendar ? readCsv(join(flags.dir, "calendar.txt")) : [];
  const calendarDates = hasCalendarDates ? readCsv(join(flags.dir, "calendar_dates.txt")) : [];
  const shapeRows = hasShapes ? readCsv(join(flags.dir, "shapes.txt")) : [];

  let feedInfoVersion: string | null = flags.feedVersion;
  const feedInfoPath = join(flags.dir, "feed_info.txt");
  if (!feedInfoVersion && existsSync(feedInfoPath)) {
    const info = readCsv(feedInfoPath);
    feedInfoVersion = info[0]?.feed_version ?? null;
  }

  const serviceDates = [
    ...calendar.map((c) => c.start_date),
    ...calendar.map((c) => c.end_date),
    ...calendarDates.map((c) => c.date),
  ]
    .filter((d): d is string => !!d && /^\d{8}$/.test(d))
    .sort();
  const serviceStart = serviceDates.length > 0 ? gtfsDateToIso(serviceDates[0]) : null;
  const serviceEnd = serviceDates.length > 0 ? gtfsDateToIso(serviceDates[serviceDates.length - 1]) : null;

  const report: ImportReport = { accepted: 0, rejected: [] };

  if (flags.dryRun) {
    console.log(
      `DRY RUN -- would import: ${routes.length} routes, ${stops.length} stops, ${trips.length} trips, ` +
        `${stopTimes.length} stop_times, ${calendar.length} calendar rows, ${calendarDates.length} calendar_dates rows, ` +
        `${shapeRows.length > 0 ? new Set(shapeRows.map((r) => r.shape_id)).size : 0} shapes. ` +
        `Service date range: ${serviceStart ?? "unknown"} to ${serviceEnd ?? "unknown"}.`
    );
    return;
  }

  await withClient(async (client) => {
    const source = await client.query(
      "select id from public.data_sources where name = $1 and organization = $2 and is_demo = false",
      [flags.sourceName, flags.sourceOrganization]
    );
    if (source.rows.length === 0) {
      console.error(
        `No data_sources row for name="${flags.sourceName}" organization="${flags.sourceOrganization}". Run import-sources.ts first.`
      );
      process.exit(1);
    }
    const sourceId = source.rows[0].id;

    await client.query("begin");
    try {
      const feed = await client.query(
        `insert into public.gtfs_feeds
         (name, agency_name, source_url, license, feed_version, service_start_date, service_end_date,
          last_imported_at, source_id, is_demo)
         values ($1,$2,(select source_url from public.data_sources where id=$3),$4,$5,$6,$7,now(),$3,false)
         returning id`,
        [flags.feedName, flags.agencyName, sourceId, flags.license, feedInfoVersion, serviceStart, serviceEnd]
      );
      const feedId = feed.rows[0].id;

      for (let i = 0; i < routes.length; i++) {
        const r = routes[i];
        if (!r.route_id) {
          report.rejected.push({ row: `routes.txt:${i + 2}`, reason: "missing route_id" });
          continue;
        }
        await client.query(
          `insert into public.gtfs_routes (feed_id, route_id, route_short_name, route_long_name, route_type, route_color)
           values ($1,$2,$3,$4,$5,$6)`,
          [
            feedId,
            r.route_id,
            r.route_short_name || null,
            r.route_long_name || null,
            r.route_type ? Number(r.route_type) : null,
            r.route_color || null,
          ]
        );
        report.accepted++;
      }

      for (let i = 0; i < stops.length; i++) {
        const s = stops[i];
        const lat = toFiniteNumber(s.stop_lat);
        const lon = toFiniteNumber(s.stop_lon);
        if (!s.stop_id || !s.stop_name || !Number.isFinite(lat) || !Number.isFinite(lon)) {
          report.rejected.push({
            row: `stops.txt:${i + 2}`,
            reason: "missing stop_id/stop_name or invalid stop_lat/stop_lon",
          });
          continue;
        }
        await client.query(
          `insert into public.gtfs_stops (feed_id, stop_id, stop_name, stop_code, location, wheelchair_boarding)
           values ($1,$2,$3,$4,ST_SetSRID(ST_MakePoint($5,$6),4326)::geography,$7)`,
          [feedId, s.stop_id, s.stop_name, s.stop_code || null, lon, lat, s.wheelchair_boarding ? Number(s.wheelchair_boarding) : null]
        );
        report.accepted++;
      }

      for (let i = 0; i < calendar.length; i++) {
        const c = calendar[i];
        const startIso = gtfsDateToIso(c.start_date);
        const endIso = gtfsDateToIso(c.end_date);
        if (!c.service_id || !startIso || !endIso) {
          report.rejected.push({ row: `calendar.txt:${i + 2}`, reason: "missing service_id or invalid start_date/end_date" });
          continue;
        }
        await client.query(
          `insert into public.gtfs_calendar
           (feed_id, service_id, monday, tuesday, wednesday, thursday, friday, saturday, sunday, start_date, end_date)
           values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
          [
            feedId,
            c.service_id,
            c.monday === "1",
            c.tuesday === "1",
            c.wednesday === "1",
            c.thursday === "1",
            c.friday === "1",
            c.saturday === "1",
            c.sunday === "1",
            startIso,
            endIso,
          ]
        );
        report.accepted++;
      }

      for (let i = 0; i < calendarDates.length; i++) {
        const c = calendarDates[i];
        const dateIso = gtfsDateToIso(c.date);
        const exceptionType = Number(c.exception_type);
        if (!c.service_id || !dateIso || ![1, 2].includes(exceptionType)) {
          report.rejected.push({
            row: `calendar_dates.txt:${i + 2}`,
            reason: "missing service_id, invalid date, or exception_type not 1/2",
          });
          continue;
        }
        await client.query(
          `insert into public.gtfs_calendar_dates (feed_id, service_id, date, exception_type) values ($1,$2,$3,$4)`,
          [feedId, c.service_id, dateIso, exceptionType]
        );
        report.accepted++;
      }

      if (hasShapes) {
        const byShape = new Map<string, { seq: number; lat: number; lon: number }[]>();
        for (const row of shapeRows) {
          if (!row.shape_id) continue;
          const lat = toFiniteNumber(row.shape_pt_lat);
          const lon = toFiniteNumber(row.shape_pt_lon);
          const seq = toFiniteNumber(row.shape_pt_sequence);
          if (!Number.isFinite(lat) || !Number.isFinite(lon) || !Number.isFinite(seq)) continue;
          const list = byShape.get(row.shape_id) ?? [];
          list.push({ seq, lat, lon });
          byShape.set(row.shape_id, list);
        }
        for (const [shapeId, points] of byShape) {
          points.sort((a, b) => a.seq - b.seq);
          if (points.length < 2) {
            report.rejected.push({ row: `shapes.txt:${shapeId}`, reason: "fewer than 2 points -- cannot form a line" });
            continue;
          }
          const geojson = JSON.stringify({ type: "LineString", coordinates: points.map((p) => [p.lon, p.lat]) });
          await client.query(
            `insert into public.gtfs_shapes (feed_id, shape_id, geom)
             values ($1,$2,ST_SetSRID(ST_GeomFromGeoJSON($3),4326)::geography)`,
            [feedId, shapeId, geojson]
          );
          report.accepted++;
        }
      }

      for (let i = 0; i < trips.length; i++) {
        const t = trips[i];
        if (!t.trip_id || !t.route_id || !t.service_id) {
          report.rejected.push({ row: `trips.txt:${i + 2}`, reason: "missing trip_id/route_id/service_id" });
          continue;
        }
        await client.query(
          `insert into public.gtfs_trips (feed_id, trip_id, route_id, service_id, shape_id, trip_headsign, direction_id)
           values ($1,$2,$3,$4,$5,$6,$7)`,
          [
            feedId,
            t.trip_id,
            t.route_id,
            t.service_id,
            t.shape_id || null,
            t.trip_headsign || null,
            t.direction_id ? Number(t.direction_id) : null,
          ]
        );
        report.accepted++;
      }

      for (let i = 0; i < stopTimes.length; i++) {
        const st = stopTimes[i];
        const seq = toFiniteNumber(st.stop_sequence);
        if (!st.trip_id || !st.stop_id || !Number.isFinite(seq)) {
          report.rejected.push({ row: `stop_times.txt:${i + 2}`, reason: "missing trip_id/stop_id or invalid stop_sequence" });
          continue;
        }
        await client.query(
          `insert into public.gtfs_stop_times (feed_id, trip_id, stop_id, stop_sequence, arrival_time, departure_time)
           values ($1,$2,$3,$4,$5,$6)`,
          [feedId, st.trip_id, st.stop_id, seq, st.arrival_time || null, st.departure_time || null]
        );
        report.accepted++;
      }

      await client.query("commit");
      console.log(`\nImported GTFS feed "${flags.feedName}" as gtfs_feeds.id = ${feedId}.`);
    } catch (err) {
      await client.query("rollback");
      throw err;
    }
  });

  printReport("GTFS import", report);
  if (report.rejected.length > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error("Import failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
