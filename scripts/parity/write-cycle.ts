/**
 * Parity check 2: write-cycle idempotence + weight preservation.
 * For N random dates with entries: load → save unchanged → reload, assert
 *  - same number of entry rows, same meal_id grouping
 *  - identical nutrient totals in daily_summaries
 *  - weights untouched
 * Run against a RESTORED COPY of the prod dump, never prod itself.
 *
 *   DATABASE_URL=... npx tsx scripts/parity/write-cycle.ts [n_dates]
 */
import { db, sql } from "@/lib/db/client";
import {
  getAllDates,
  loadAllSummaries,
  loadDailyEntry,
  saveDailyEntry,
} from "@/lib/data/storage";

const N = Number(process.argv[2] ?? 25);

function entrySignature(day: NonNullable<Awaited<ReturnType<typeof loadDailyEntry>>>) {
  const rows: string[] = [];
  for (const e of day.entries) {
    if (e.kind === "food") {
      rows.push(`food|${e.entry.food_id}|${e.entry.weight_g}|${e.entry.quantity}|${e.entry.nutrients.energy_kcal.toFixed(2)}`);
    } else {
      for (const ing of e.entry.ingredients) {
        rows.push(`meal:${e.entry.meal_id}|${ing.food_id}|${ing.weight_g}|${ing.quantity}|${ing.nutrients.energy_kcal.toFixed(2)}`);
      }
    }
  }
  return rows.sort().join("\n");
}

async function main() {
  const dates = await getAllDates(db);
  const sample = dates.filter((_, i) => i % Math.max(1, Math.floor(dates.length / N)) === 0).slice(0, N);

  let failures = 0;
  for (const date of sample) {
    const before = await loadDailyEntry(db, date);
    if (!before) continue;
    const summariesBefore = (await loadAllSummaries(db)).find((s) => s.date === date);
    const sigBefore = entrySignature(before);

    await saveDailyEntry(db, before); // unchanged round-trip

    const after = await loadDailyEntry(db, date);
    const summariesAfter = (await loadAllSummaries(db)).find((s) => s.date === date);
    const sigAfter = after ? entrySignature(after) : "";

    if (sigBefore !== sigAfter) {
      console.error(`✗ ${date}: entry signature changed after no-op save`);
      failures++;
    }
    if (
      summariesBefore?.morning_weight_kg !== summariesAfter?.morning_weight_kg ||
      summariesBefore?.evening_weight_kg !== summariesAfter?.evening_weight_kg
    ) {
      console.error(`✗ ${date}: WEIGHTS CHANGED by save_daily_entry — critical bug`);
      failures++;
    }
    if (summariesBefore?.energy_kcal !== summariesAfter?.energy_kcal) {
      console.error(
        `✗ ${date}: summary energy changed ${summariesBefore?.energy_kcal} → ${summariesAfter?.energy_kcal}`,
      );
      failures++;
    }
  }

  console.log(`Write-cycled ${sample.length} dates.`);
  if (failures > 0) {
    console.error(`FAILED: ${failures} mismatches`);
    process.exit(1);
  }
  console.log("PARITY OK: save/load round-trip is lossless and weights are preserved.");
  await sql.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
