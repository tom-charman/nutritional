/**
 * Parity check 1: for every date, recompute daily totals from food_entries
 * using the new domain code and compare against the stored daily_summaries
 * row (tolerance for DECIMAL(8,2) rounding). Asserts the NULL-on-empty rule.
 *
 * Run against a RESTORED COPY of the prod dump, never prod itself:
 *   DATABASE_URL=postgresql://nutritional_user:dev_password@127.0.0.1:5432/nutritional_db \
 *     npx tsx scripts/parity/daily-summary.ts
 */
import { db, sql } from "@/lib/db/client";
import { getAllDates, loadAllSummaries, loadDailyEntry } from "@/lib/data/storage";
import { dailyTotals } from "@/lib/domain/nutrients";
import { NUTRIENT_KEYS } from "@/lib/constants";

const TOLERANCE = 0.011; // DECIMAL(8,2) rounding per entry can stack slightly

async function main() {
  const summaries = await loadAllSummaries(db);
  const summaryByDate = new Map(summaries.map((s) => [s.date, s]));
  const dates = await getAllDates(db);

  let checked = 0;
  let failures = 0;

  for (const date of dates) {
    const day = await loadDailyEntry(db, date);
    const summary = summaryByDate.get(date);
    if (!summary) {
      console.error(`✗ ${date}: entries exist but no daily_summaries row`);
      failures++;
      continue;
    }
    const totals = dailyTotals(day?.entries ?? []);
    if (totals === null) {
      // empty day → summary nutrients must be NULL, never 0
      if (summary.energy_kcal !== null) {
        console.error(`✗ ${date}: empty day but summary energy=${summary.energy_kcal}`);
        failures++;
      }
      checked++;
      continue;
    }
    const entryCount = day?.entries.length ?? 0;
    for (const key of NUTRIENT_KEYS) {
      const expected = totals[key];
      const stored = summary[key];
      if (stored === null) {
        console.error(`✗ ${date}: ${key} stored NULL but computed ${expected.toFixed(2)}`);
        failures++;
        continue;
      }
      // each stored entry row was rounded to 2dp, so tolerance scales with entry count
      const tol = Math.max(TOLERANCE, entryCount * 0.006);
      if (Math.abs(stored - expected) > tol) {
        console.error(
          `✗ ${date}: ${key} stored=${stored} computed=${expected.toFixed(2)} (tol ${tol.toFixed(3)})`,
        );
        failures++;
      }
    }
    checked++;
  }

  // weights-only rows: must have no entries and that's fine
  const weightsOnly = summaries.filter(
    (s) => s.energy_kcal === null && (s.morning_weight_kg !== null || s.evening_weight_kg !== null),
  );

  console.log(`\nChecked ${checked} dates with entries; ${weightsOnly.length} weights-only rows.`);
  if (failures > 0) {
    console.error(`FAILED: ${failures} mismatches`);
    process.exit(1);
  }
  console.log("PARITY OK: all daily summaries match recomputed totals.");
  await sql.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
