// Import/upsert public.school_authorities. Requires the referenced
// data_sources row to already exist (run import-sources.ts first).
//
// CSV columns:
//   name, authority_type (public|catholic|private|charter), website,
//   phone, source_name, source_organization
// `source_name` + `source_organization` must exactly match a row already
// imported by import-sources.ts -- this script does not create sources
// implicitly, so provenance is never accidentally skipped.
//
// Usage:
//   npx tsx scripts/import-authorities.ts path/to/authorities.csv [--dry-run]
import { z } from "zod";
import { readCsv } from "./lib/csv";
import { withClient, printReport, type ImportReport } from "./lib/db";

const rowSchema = z.object({
  name: z.string().min(1),
  authority_type: z.enum(["public", "catholic", "private", "charter"]),
  website: z.string().url().optional().or(z.literal("")),
  phone: z.string().optional(),
  source_name: z.string().min(1),
  source_organization: z.string().min(1),
});

async function main() {
  const [csvPath, ...flags] = process.argv.slice(2);
  const dryRun = flags.includes("--dry-run");
  if (!csvPath) {
    console.error("Usage: npx tsx scripts/import-authorities.ts <authorities.csv> [--dry-run]");
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

        const sourceId = source.rows[0].id;
        const existing = await client.query(
          "select id from public.school_authorities where name = $1 and authority_type = $2",
          [d.name, d.authority_type]
        );
        if (existing.rows.length > 0) {
          await client.query(
            `update public.school_authorities set website=$1, phone=$2, source_id=$3 where id=$4`,
            [d.website || null, d.phone || null, sourceId, existing.rows[0].id]
          );
        } else {
          await client.query(
            `insert into public.school_authorities
             (name, authority_type, website, phone, source_id, is_demo)
             values ($1,$2,$3,$4,$5,false)`,
            [d.name, d.authority_type, d.website || null, d.phone || null, sourceId]
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

  printReport(dryRun ? "school_authorities import (DRY RUN)" : "school_authorities import", report);
  if (report.rejected.length > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error("Import failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
