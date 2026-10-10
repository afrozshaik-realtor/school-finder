// Deletes search_history rows older than SEARCH_HISTORY_RETENTION_DAYS.
// Intended to run on a schedule (cron / Supabase scheduled function) in
// any deployment that has ENABLE_SEARCH_HISTORY=true -- the feature is
// off by default (see src/lib/env.ts), and even when on, no row is kept
// indefinitely.
//
// Usage: npx tsx scripts/purge-search-history.ts [--dry-run]
import { withClient } from "./lib/db";

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const retentionDays = Number(process.env.SEARCH_HISTORY_RETENTION_DAYS || "90");
  if (!Number.isFinite(retentionDays) || retentionDays <= 0) {
    console.error("SEARCH_HISTORY_RETENTION_DAYS must be a positive number.");
    process.exit(1);
  }

  await withClient(async (client) => {
    // retentionDays is a validated positive finite number at this point
    // (not attacker-controlled -- it comes from a server env var), so
    // string-building the interval was never actually exploitable here.
    // Still, parameterizing it properly (multiplying a parameterized
    // '1 day'::interval rather than interpolating into the SQL text) is
    // the safer pattern and costs nothing, in case this script is ever
    // changed to take the value from somewhere less trusted.
    const cutoff = await client.query("select now() - ($1::double precision * interval '1 day') as cutoff", [
      retentionDays,
    ]);
    const cutoffTs = cutoff.rows[0].cutoff;

    if (dryRun) {
      const count = await client.query("select count(*) from public.search_history where searched_at < $1", [cutoffTs]);
      console.log(`DRY RUN -- would delete ${count.rows[0].count} search_history row(s) older than ${cutoffTs}.`);
      return;
    }

    const result = await client.query("delete from public.search_history where searched_at < $1", [cutoffTs]);
    console.log(`Deleted ${result.rowCount} search_history row(s) older than ${cutoffTs}.`);
  });
}

main().catch((err) => {
  console.error("Purge failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
