// Direct Postgres connection for admin import/maintenance scripts.
//
// WHY A DIRECT CONNECTION INSTEAD OF supabase-js HERE:
// supabase-js talks to Supabase through PostgREST, which has no built-in
// text/JSON -> `geography` cast. Importing attendance-boundary polygons
// and GTFS shapes needs real PostGIS geometry construction
// (ST_GeomFromGeoJSON, ST_Multi, ST_SetSRID...), which is far more
// reliably done in a single parameterized SQL statement over a direct
// connection than by round-tripping through an RPC wrapper per row.
//
// This module is imported ONLY by scripts/*.ts (run with `npx tsx
// scripts/<name>.ts` from a developer or CI machine, never by the Next.js
// app). It reads SUPABASE_DB_URL directly from process.env and is never
// imported by anything under src/, so it can never reach a browser
// bundle. SUPABASE_DB_URL contains the database password -- treat it
// exactly like the service-role key: set it only in your local shell
// environment or CI secret store, never commit it, never paste it in
// chat.
import "dotenv/config";
import { Client } from "pg";

export function requireDbUrl(): string {
  const url = process.env.SUPABASE_DB_URL;
  if (!url) {
    throw new Error(
      "SUPABASE_DB_URL is not set. In the Supabase dashboard: Project Settings -> " +
        "Database -> Connection string ('URI' tab, use the non-pooling / session " +
        "connection on port 5432 for DDL-safe scripts). Export it in your shell " +
        "(e.g. `export SUPABASE_DB_URL=postgres://...`) or put it in a local, " +
        "git-ignored `.env.local` -- never commit it or paste it into chat."
    );
  }
  return url;
}

export async function withClient<T>(fn: (client: Client) => Promise<T>): Promise<T> {
  const client = new Client({ connectionString: requireDbUrl() });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

export interface ImportReport {
  accepted: number;
  rejected: { row: number | string; reason: string }[];
}

export function printReport(label: string, report: ImportReport) {
  console.log(`\n=== ${label} ===`);
  console.log(`Accepted: ${report.accepted}`);
  console.log(`Rejected: ${report.rejected.length}`);
  if (report.rejected.length > 0) {
    console.log("Rejected rows (fix the source data and re-run; nothing invented to fill gaps):");
    for (const r of report.rejected.slice(0, 50)) {
      console.log(`  - row ${r.row}: ${r.reason}`);
    }
    if (report.rejected.length > 50) {
      console.log(`  ... and ${report.rejected.length - 50} more`);
    }
  }
}
