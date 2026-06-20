/**
 * Clinician-ready daily-totals CSV shape. Unlike the "Nutrients vs RDI" export
 * (% of a *generic* RDI), this gives one row per day with each nutrient in
 * ABSOLUTE units, that day's personalised target, and a hit/miss flag — what a
 * clinician working in grams against a personalised cap actually needs.
 *
 * Pure (no DB/IO) so it can be unit-tested directly; the server action only
 * gathers the summaries + per-day targets and hands them here.
 */
import { NUTRIENT_KEYS, type NutrientKey } from "@/lib/constants";
import { getNutrientMode } from "@/lib/domain/targets";
import type { DailySummary, DailyTargets } from "@/lib/domain/types";
import { round2, type CsvValue } from "./csv";

/** "hit" if the day met its goal for this nutrient, "miss" otherwise. */
export function nutrientStatus(
  actual: number | null,
  target: number,
  mode: "target" | "limit",
): "hit" | "miss" | "" {
  if (actual === null) return ""; // no data logged that day
  if (mode === "limit") return actual <= target ? "hit" : "miss";
  return actual >= target ? "hit" : "miss";
}

/** Columns: date, then per nutrient an {actual, target, status} triple. */
export const DAILY_TOTALS_HEADERS: string[] = [
  "date",
  ...NUTRIENT_KEYS.flatMap((k) => [`${k}_actual`, `${k}_target`, `${k}_status`]),
];

/**
 * One row per day (ascending), plus a trailing SUMMARY row: mean actual and
 * mean target per nutrient over days with data, and a "hits/days" hit-rate in
 * each status column.
 */
export function buildDailyTotalsRows(
  summaries: DailySummary[],
  targetsByDate: Record<string, DailyTargets>,
): { headers: string[]; rows: CsvValue[][] } {
  const ordered = [...summaries].sort((a, b) => a.date.localeCompare(b.date));
  const rows: CsvValue[][] = [];

  // Accumulators for the summary row, per nutrient.
  const acc: Record<NutrientKey, { actualSum: number; actualN: number; targetSum: number; hits: number; days: number }> =
    Object.fromEntries(
      NUTRIENT_KEYS.map((k) => [k, { actualSum: 0, actualN: 0, targetSum: 0, hits: 0, days: 0 }]),
    ) as typeof acc;

  for (const s of ordered) {
    const targets = targetsByDate[s.date];
    const cells: CsvValue[] = [s.date];
    for (const k of NUTRIENT_KEYS) {
      const actual = s[k];
      const target = targets.values[k];
      const status = nutrientStatus(actual, target, getNutrientMode(targets, k));
      cells.push(round2(actual), round2(target), status);

      const a = acc[k];
      a.targetSum += target;
      if (actual !== null) {
        a.actualSum += actual;
        a.actualN += 1;
        a.days += 1;
        if (status === "hit") a.hits += 1;
      }
    }
    rows.push(cells);
  }

  if (ordered.length) {
    const summary: CsvValue[] = ["SUMMARY"];
    for (const k of NUTRIENT_KEYS) {
      const a = acc[k];
      const meanActual = a.actualN ? round2(a.actualSum / a.actualN) : "";
      const meanTarget = round2(a.targetSum / ordered.length);
      const hitRate = a.days ? `${a.hits}/${a.days}` : "";
      summary.push(meanActual, meanTarget, hitRate);
    }
    rows.push(summary);
  }

  return { headers: DAILY_TOTALS_HEADERS, rows };
}
