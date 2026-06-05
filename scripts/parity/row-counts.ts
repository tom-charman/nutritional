/**
 * Snapshot row counts of all 6 tables — run before and after a test session
 * (and before/after cutover) to prove no data was lost.
 *
 *   DATABASE_URL=... npx tsx scripts/parity/row-counts.ts
 */
import { sql } from "@/lib/db/client";

const TABLES = [
  "food_items",
  "food_entries",
  "daily_summaries",
  "daily_targets",
  "meals",
  "meal_ingredients",
];

async function main() {
  for (const table of TABLES) {
    const rows = await sql.unsafe(`SELECT count(*)::int AS n FROM ${table}`);
    console.log(`${table.padEnd(18)} ${rows[0].n}`);
  }
  await sql.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
