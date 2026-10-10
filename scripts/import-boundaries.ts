// Import attendance-boundary polygons as a new DRAFT boundary_version.
//
// This script NEVER publishes anything. It creates a boundary_versions
// row with status='draft', is_current=false, coverage_complete=false --
// an admin must review the imported polygons (e.g. by checking the
// feature count and spot-checking coverage against the authority's
// published map) and then either:
//   - set coverage_complete via the admin UI/SQL once satisfied it covers
//     the whole authority area, and
//   - publish it from /admin/boundary-versions (or by calling
//     public.publish_boundary_version(version_id) as an admin),
// which atomically archives whatever was previously current for that
// (authority, school_year, program_scope) and is itself rollback-able.
// Nothing here is destructive: old versions are never deleted.
//
// Input: a GeoJSON FeatureCollection. Each Feature must have a
// `properties.school_name` that matches an existing public.schools.name
// under the given --authority, and a Polygon or MultiPolygon geometry in
// WGS84 (EPSG:4326) -- this script does not reproject.
//
// Usage:
//   npx tsx scripts/import-boundaries.ts path/to/boundaries.geojson \
//     --authority "Calgary Catholic School District" \
//     --school-year "2025-26" \
//     --source-name "..." --source-organization "..." \
//     [--program-scope "TLC"] [--notes "..."] [--dry-run]
import { readFileSync } from "node:fs";
import { withClient, printReport, type ImportReport } from "./lib/db";

interface Flags {
  authority: string;
  schoolYear: string;
  sourceName: string;
  sourceOrganization: string;
  programScope: string | null;
  notes: string | null;
  dryRun: boolean;
}

function parseFlags(argv: string[]): { path: string; flags: Flags } {
  const path = argv[0];
  const get = (name: string) => {
    const idx = argv.indexOf(`--${name}`);
    return idx >= 0 ? argv[idx + 1] : undefined;
  };
  const authority = get("authority");
  const schoolYear = get("school-year");
  const sourceName = get("source-name");
  const sourceOrganization = get("source-organization");
  if (!path || !authority || !schoolYear || !sourceName || !sourceOrganization) {
    console.error(
      "Usage: npx tsx scripts/import-boundaries.ts <boundaries.geojson> --authority <name> " +
        "--school-year <YYYY-YY> --source-name <name> --source-organization <org> " +
        "[--program-scope <code>] [--notes <text>] [--dry-run]"
    );
    process.exit(1);
  }
  return {
    path,
    flags: {
      authority,
      schoolYear,
      sourceName,
      sourceOrganization,
      programScope: get("program-scope") ?? null,
      notes: get("notes") ?? null,
      dryRun: argv.includes("--dry-run"),
    },
  };
}

type GeoJsonGeometry = { type: string; coordinates: unknown };
interface GeoJsonFeature {
  type: "Feature";
  properties: Record<string, unknown> | null;
  geometry: GeoJsonGeometry;
}
interface GeoJsonFeatureCollection {
  type: "FeatureCollection";
  features: GeoJsonFeature[];
}

async function main() {
  const { path, flags } = parseFlags(process.argv.slice(2));
  const fc = JSON.parse(readFileSync(path, "utf-8")) as GeoJsonFeatureCollection;
  if (fc.type !== "FeatureCollection" || !Array.isArray(fc.features)) {
    console.error("Input file is not a GeoJSON FeatureCollection.");
    process.exit(1);
  }

  const report: ImportReport = { accepted: 0, rejected: [] };

  await withClient(async (client) => {
    const authority = await client.query(
      "select id from public.school_authorities where name = $1",
      [flags.authority]
    );
    if (authority.rows.length === 0) {
      console.error(`No school_authorities row named "${flags.authority}". Run import-authorities.ts first.`);
      process.exit(1);
    }
    if (authority.rows.length > 1) {
      console.error(`Ambiguous: multiple authorities named "${flags.authority}" (different types?).`);
      process.exit(1);
    }
    const authorityId = authority.rows[0].id;

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

    if (flags.dryRun) {
      for (let i = 0; i < fc.features.length; i++) {
        const f = fc.features[i];
        const schoolName = f.properties?.school_name;
        if (typeof schoolName !== "string" || !schoolName) {
          report.rejected.push({ row: i, reason: "Feature is missing properties.school_name" });
          continue;
        }
        if (!["Polygon", "MultiPolygon"].includes(f.geometry?.type)) {
          report.rejected.push({ row: i, reason: `Unsupported geometry type: ${f.geometry?.type}` });
          continue;
        }
        const school = await client.query(
          "select id from public.schools where name = $1 and authority_id = $2",
          [schoolName, authorityId]
        );
        if (school.rows.length !== 1) {
          report.rejected.push({
            row: i,
            reason:
              school.rows.length === 0
                ? `No school named "${schoolName}" under this authority. Run import-schools.ts first.`
                : `Ambiguous: multiple schools named "${schoolName}" under this authority.`,
          });
          continue;
        }
        report.accepted++;
      }
      printReport("boundary import (DRY RUN -- no boundary_version created)", report);
      if (report.rejected.length > 0) process.exitCode = 1;
      return;
    }

    await client.query("begin");
    try {
      const version = await client.query(
        `insert into public.boundary_versions
         (authority_id, school_year, program_scope, status, is_current, coverage_complete, source_id, notes, is_demo)
         values ($1,$2,$3,'draft',false,false,$4,$5,false)
         returning id`,
        [authorityId, flags.schoolYear, flags.programScope, sourceId, flags.notes]
      );
      const versionId = version.rows[0].id;

      for (let i = 0; i < fc.features.length; i++) {
        const f = fc.features[i];
        const schoolName = f.properties?.school_name;
        if (typeof schoolName !== "string" || !schoolName) {
          report.rejected.push({ row: i, reason: "Feature is missing properties.school_name" });
          continue;
        }
        if (!["Polygon", "MultiPolygon"].includes(f.geometry?.type)) {
          report.rejected.push({ row: i, reason: `Unsupported geometry type: ${f.geometry?.type}` });
          continue;
        }
        const school = await client.query(
          "select id from public.schools where name = $1 and authority_id = $2",
          [schoolName, authorityId]
        );
        if (school.rows.length !== 1) {
          report.rejected.push({
            row: i,
            reason:
              school.rows.length === 0
                ? `No school named "${schoolName}" under this authority. Run import-schools.ts first.`
                : `Ambiguous: multiple schools named "${schoolName}" under this authority.`,
          });
          continue;
        }
        const schoolId = school.rows[0].id;
        const geomJson = JSON.stringify(f.geometry);
        // ST_Multi normalizes a bare Polygon to MultiPolygon so every row
        // matches the attendance_boundaries.geom column type.
        await client.query(
          `insert into public.attendance_boundaries (boundary_version_id, school_id, geom)
           values ($1, $2, ST_SetSRID(ST_Multi(ST_GeomFromGeoJSON($3)), 4326)::geography)`,
          [versionId, schoolId, geomJson]
        );
        report.accepted++;
      }

      if (report.accepted === 0) {
        throw new Error("No features were importable -- rolling back (no boundary_version left behind).");
      }

      await client.query("commit");
      printReport("boundary import", report);
      console.log(
        `\nCreated DRAFT boundary_version ${versionId} for "${flags.authority}" / ${flags.schoolYear}` +
          (flags.programScope ? ` / ${flags.programScope}` : "") +
          `.\nThis is NOT published yet. Review it (coverage_complete, polygon sanity) at ` +
          `/admin/boundary-versions, then publish when ready.`
      );
    } catch (err) {
      await client.query("rollback");
      throw err;
    }
  });

  if (report.rejected.length > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error("Import failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
