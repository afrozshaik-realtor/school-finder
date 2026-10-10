// Import/upsert public.schools. Requires the referenced authority and
// data source to already exist.
//
// CSV columns:
//   authority_name, authority_type, name, school_type, grade_min,
//   grade_max, address, city, postal_code, phone, website, latitude,
//   longitude, status, source_name, source_organization
// `latitude`/`longitude` are OPTIONAL -- leave blank if the source
// dataset doesn't publish a site coordinate. This script never
// geocodes an address to fill them in: a school's map pin location and
// an address-search geocode are different concerns, and conflating them
// would let a guess silently stand in for a published coordinate.
// `city` must be one of Calgary, Airdrie, Chestermere, Cochrane.
//
// Usage:
//   npx tsx scripts/import-schools.ts path/to/schools.csv [--dry-run]
import { z } from "zod";
import { readCsv } from "./lib/csv";
import { withClient, printReport, type ImportReport } from "./lib/db";

const CITIES = ["Calgary", "Airdrie", "Chestermere", "Cochrane"] as const;

// IMPORTANT: `Number("")` is `0` in JavaScript, so z.coerce.number() alone
// would silently turn a blank CSV cell into the coordinate 0,0 (the Gulf
// of Guinea) instead of "no coordinate supplied" -- exactly the kind of
// invented-data bug this app's rules forbid. Blank out empty strings to
// `undefined` BEFORE coercion so a blank cell reliably becomes "absent".
const optionalLatLon = (min: number, max: number) =>
  z.preprocess((v) => (v === "" || v === undefined ? undefined : v), z.coerce.number().min(min).max(max).optional());

const rowSchema = z.object({
  authority_name: z.string().min(1),
  authority_type: z.enum(["public", "catholic", "private", "charter"]),
  name: z.string().min(1),
  school_type: z.enum(["public", "catholic", "private", "charter"]),
  grade_min: z.string().min(1),
  grade_max: z.string().min(1),
  address: z.string().min(1),
  city: z.enum(CITIES),
  postal_code: z.string().optional(),
  phone: z.string().optional(),
  website: z.string().url().optional().or(z.literal("")),
  latitude: optionalLatLon(-90, 90),
  longitude: optionalLatLon(-180, 180),
  status: z.enum(["active", "closed", "planned"]).optional().or(z.literal("")),
  source_name: z.string().min(1),
  source_organization: z.string().min(1),
});

async function main() {
  const [csvPath, ...flags] = process.argv.slice(2);
  const dryRun = flags.includes("--dry-run");
  if (!csvPath) {
    console.error("Usage: npx tsx scripts/import-schools.ts <schools.csv> [--dry-run]");
    process.exit(1);
  }

  const rows = readCsv(csvPath);
  const report: ImportReport = { accepted: 0, rejected: [] };

  await withClient(async (client) => {
    if (!dryRun) await client.query("begin");
    try {
      for (let i = 0; i < rows.length; i++) {
        const rowNum = i + 2;
        const parsed = rowSchema.safeParse(rows[i]);
        if (!parsed.success) {
          report.rejected.push({ row: rowNum, reason: parsed.error.issues.map((e) => e.message).join("; ") });
          continue;
        }
        const d = parsed.data;

        const authority = await client.query(
          "select id from public.school_authorities where name = $1 and authority_type = $2",
          [d.authority_name, d.authority_type]
        );
        if (authority.rows.length === 0) {
          report.rejected.push({
            row: rowNum,
            reason: `No school_authorities row for name="${d.authority_name}" type="${d.authority_type}". Run import-authorities.ts first.`,
          });
          continue;
        }
        const source = await client.query(
          "select id from public.data_sources where name = $1 and organization = $2 and is_demo = false",
          [d.source_name, d.source_organization]
        );
        if (source.rows.length === 0) {
          report.rejected.push({
            row: rowNum,
            reason: `No data_sources row for name="${d.source_name}" organization="${d.source_organization}". Run import-sources.ts first.`,
          });
          continue;
        }

        if (dryRun) {
          report.accepted++;
          continue;
        }

        const authorityId = authority.rows[0].id;
        const sourceId = source.rows[0].id;
        const lat = d.latitude === undefined ? null : d.latitude;
        const lon = d.longitude === undefined ? null : d.longitude;
        const status = d.status || "active";

        const existing = await client.query(
          "select id from public.schools where name = $1 and authority_id = $2 and city = $3",
          [d.name, authorityId, d.city]
        );

        // lon/lat are always passed as params (possibly null) and the
        // geometry is built with a CASE expression inside SQL. This keeps
        // every placeholder index fixed regardless of whether a
        // coordinate was supplied, which a conditionally-assembled SQL
        // string (shifting $N numbers per branch) is too easy to get
        // wrong -- this file previously had exactly that off-by-one bug.
        const params = [
          authorityId, // $1
          d.name, // $2
          d.school_type, // $3
          d.grade_min, // $4
          d.grade_max, // $5
          d.address, // $6
          d.city, // $7
          d.postal_code || null, // $8
          d.phone || null, // $9
          d.website || null, // $10
          status, // $11
          sourceId, // $12
          lon, // $13
          lat, // $14
        ];
        const locationCase =
          "case when $13::double precision is not null and $14::double precision is not null " +
          "then ST_SetSRID(ST_MakePoint($13,$14),4326)::geography else null end";

        if (existing.rows.length > 0) {
          await client.query(
            `update public.schools set
               school_type=$3, grade_min=$4, grade_max=$5, address=$6, city=$7,
               postal_code=$8, phone=$9, website=$10, status=$11, source_id=$12,
               location=${locationCase}
             where id = $15`,
            [...params, existing.rows[0].id]
          );
        } else {
          await client.query(
            `insert into public.schools
             (authority_id, name, school_type, grade_min, grade_max, address, city,
              postal_code, phone, website, status, source_id, is_demo, location)
             values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,false,${locationCase})`,
            params
          );
        }
        report.accepted++;
      }
      if (!dryRun) await client.query("commit");
    } catch (err) {
      if (!dryRun) await client.query("rollback");
      throw err;
    }
  });

  printReport(dryRun ? "schools import (DRY RUN)" : "schools import", report);
  if (report.rejected.length > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error("Import failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
