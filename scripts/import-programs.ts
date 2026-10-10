// Import/upsert public.school_programs (e.g. TLC, French Immersion, IB).
// Requires the referenced school and data source to already exist.
//
// CSV columns:
//   school_name, authority_name, program_name, program_code, grade_min,
//   grade_max, notes, source_name, source_organization
//
// Usage:
//   npx tsx scripts/import-programs.ts path/to/programs.csv [--dry-run]
import { z } from "zod";
import { readCsv } from "./lib/csv";
import { withClient, printReport, type ImportReport } from "./lib/db";

const rowSchema = z.object({
  school_name: z.string().min(1),
  authority_name: z.string().min(1),
  program_name: z.string().min(1),
  program_code: z.string().optional(),
  grade_min: z.string().optional(),
  grade_max: z.string().optional(),
  notes: z.string().optional(),
  source_name: z.string().min(1),
  source_organization: z.string().min(1),
});

async function main() {
  const [csvPath, ...flags] = process.argv.slice(2);
  const dryRun = flags.includes("--dry-run");
  if (!csvPath) {
    console.error("Usage: npx tsx scripts/import-programs.ts <programs.csv> [--dry-run]");
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

        const school = await client.query(
          `select s.id from public.schools s
           join public.school_authorities a on a.id = s.authority_id
           where s.name = $1 and a.name = $2`,
          [d.school_name, d.authority_name]
        );
        if (school.rows.length === 0) {
          report.rejected.push({
            row: rowNum,
            reason: `No school named "${d.school_name}" under authority "${d.authority_name}". Run import-schools.ts first.`,
          });
          continue;
        }
        if (school.rows.length > 1) {
          report.rejected.push({
            row: rowNum,
            reason: `Ambiguous: multiple schools named "${d.school_name}" under authority "${d.authority_name}".`,
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
            reason: `No data_sources row for name="${d.source_name}" organization="${d.source_organization}".`,
          });
          continue;
        }

        if (dryRun) {
          report.accepted++;
          continue;
        }

        const schoolId = school.rows[0].id;
        const sourceId = source.rows[0].id;
        const existing = await client.query(
          "select id from public.school_programs where school_id = $1 and program_name = $2",
          [schoolId, d.program_name]
        );
        if (existing.rows.length > 0) {
          await client.query(
            `update public.school_programs set program_code=$1, grade_min=$2, grade_max=$3, notes=$4, source_id=$5
             where id = $6`,
            [d.program_code || null, d.grade_min || null, d.grade_max || null, d.notes || null, sourceId, existing.rows[0].id]
          );
        } else {
          await client.query(
            `insert into public.school_programs
             (school_id, program_name, program_code, grade_min, grade_max, notes, source_id, is_demo)
             values ($1,$2,$3,$4,$5,$6,$7,false)`,
            [schoolId, d.program_name, d.program_code || null, d.grade_min || null, d.grade_max || null, d.notes || null, sourceId]
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

  printReport(dryRun ? "school_programs import (DRY RUN)" : "school_programs import", report);
  if (report.rejected.length > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error("Import failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
