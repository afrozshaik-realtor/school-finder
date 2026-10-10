// Import/upsert provenance records into public.data_sources.
//
// This is deliberately the FIRST import script in the pipeline: every
// other importer (authorities, schools, programs, boundaries, GTFS)
// requires an existing data_sources row and refuses to import anything
// is_demo=false without one (enforced both by this script and by the
// `*_source_required_unless_demo` CHECK constraints in the schema).
//
// CSV columns (header row required):
//   name, organization, source_url, license, license_url,
//   coverage_description, authorization_notes, last_verified_at
// `last_verified_at` must be YYYY-MM-DD -- the date a human actually
// checked the source still matches what was imported, not today's date
// and not the date the source was published.
//
// Usage:
//   npx tsx scripts/import-sources.ts path/to/sources.csv [--dry-run]
import { z } from "zod";
import { readCsv } from "./lib/csv";
import { withClient, printReport, type ImportReport } from "./lib/db";

const rowSchema = z.object({
  name: z.string().min(1),
  organization: z.string().min(1),
  source_url: z.string().url().optional().or(z.literal("")),
  license: z.string().optional(),
  license_url: z.string().url().optional().or(z.literal("")),
  coverage_description: z.string().optional(),
  authorization_notes: z.string().optional(),
  last_verified_at: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "last_verified_at must be YYYY-MM-DD")
    .optional()
    .or(z.literal("")),
});

async function main() {
  const [csvPath, ...flags] = process.argv.slice(2);
  const dryRun = flags.includes("--dry-run");
  if (!csvPath) {
    console.error("Usage: npx tsx scripts/import-sources.ts <sources.csv> [--dry-run]");
    process.exit(1);
  }

  const rows = readCsv(csvPath);
  const report: ImportReport = { accepted: 0, rejected: [] };

  await withClient(async (client) => {
    if (!dryRun) await client.query("begin");
    try {
      for (let i = 0; i < rows.length; i++) {
        const rowNum = i + 2; // header is row 1
        const parsed = rowSchema.safeParse(rows[i]);
        if (!parsed.success) {
          report.rejected.push({ row: rowNum, reason: parsed.error.issues.map((e) => e.message).join("; ") });
          continue;
        }
        const d = parsed.data;
        if (dryRun) {
          report.accepted++;
          continue;
        }
        const existing = await client.query(
          "select id from public.data_sources where name = $1 and organization = $2",
          [d.name, d.organization]
        );
        const values = [
          d.name,
          d.organization,
          d.source_url || null,
          d.license || null,
          d.license_url || null,
          d.coverage_description || null,
          d.authorization_notes || null,
          d.last_verified_at || null,
        ];
        if (existing.rows.length > 0) {
          await client.query(
            `update public.data_sources set source_url=$3, license=$4, license_url=$5,
             coverage_description=$6, authorization_notes=$7, last_verified_at=$8
             where id = $9`,
            [...values, existing.rows[0].id]
          );
        } else {
          await client.query(
            `insert into public.data_sources
             (name, organization, source_url, license, license_url, coverage_description,
              authorization_notes, last_verified_at, is_demo)
             values ($1,$2,$3,$4,$5,$6,$7,$8,false)`,
            values
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

  printReport(dryRun ? "data_sources import (DRY RUN -- nothing written)" : "data_sources import", report);
  if (report.rejected.length > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error("Import failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
