"use server";

/**
 * CSV export server actions. Each returns a ready-to-download CSV payload
 * (filename + content) for one export option; the client triggers the actual
 * browser download. Dashboard exports reuse the chart-prep functions so the
 * CSV contains the exact PLOTTED (processed) values — rolling averages,
 * interpolated gaps, macro-calorie splits, % of RDI. Meals ignore the date
 * range (templates are undated).
 */
import { ROLLING_WINDOW_DAYS, NUTRIENT_KEYS } from "@/lib/constants";
import { db } from "@/lib/db/client";
import {
  getOrCreateDailyTargets,
  loadAllSummaries,
  loadDailyEntry,
  loadMeals,
} from "@/lib/data/storage";
import { requireUserId } from "@/lib/data/user";
import { collectAllUserData } from "@/lib/data/gdpr";
import {
  prepareCaloriesWeight,
  prepareMacroBreakdown,
  prepareNutrientsRdi,
} from "@/lib/domain/charts/prepare";
import type { DailyTargets } from "@/lib/domain/types";
import type { CsvValue } from "@/lib/export/csv";
import { round2, toCsv } from "@/lib/export/csv";
import { buildDailyTotalsRows } from "@/lib/export/dailyTotals";

export interface CsvPayload {
  ok: true;
  filename: string;
  csv: string;
}
export interface CsvError {
  ok: false;
  message: string;
}
export type ExportResult = CsvPayload | CsvError;

export interface JsonPayload {
  ok: true;
  filename: string;
  json: string;
}
export type JsonExportResult = JsonPayload | CsvError;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function validateRange(from: string, to: string): CsvError | null {
  if (!ISO_DATE.test(from) || !ISO_DATE.test(to)) {
    return { ok: false, message: "Invalid date range" };
  }
  if (from > to) {
    return { ok: false, message: "Start date must be on or before end date" };
  }
  return null;
}

/** Yesterday (ISO) — dashboard charts exclude the usually-incomplete today. */
function yesterdayIso(): string {
  return new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
}

/** Indices of `dates` falling within [from, to] inclusive. */
function rangeIndices(dates: string[], from: string, to: string): number[] {
  const out: number[] = [];
  for (let i = 0; i < dates.length; i++) {
    if (dates[i] >= from && dates[i] <= to) out.push(i);
  }
  return out;
}

async function summariesUpToYesterday(userId: string) {
  const all = await loadAllSummaries(db, userId);
  const yesterday = yesterdayIso();
  return all.filter((s) => s.date <= yesterday);
}

/** Calories & Weight chart — one column per plotted series. */
export async function exportCaloriesWeightCsv(
  from: string,
  to: string,
): Promise<ExportResult> {
  const invalid = validateRange(from, to);
  if (invalid) return invalid;

  const userId = await requireUserId();
  const data = prepareCaloriesWeight(await summariesUpToYesterday(userId), ROLLING_WINDOW_DAYS);
  const headers = [
    "date",
    "calories_avg_kcal",
    "weight_morning_kg",
    "weight_evening_kg",
  ];
  const rows: CsvValue[][] = rangeIndices(data.dates, from, to).map((i) => [
    data.dates[i],
    round2(data.calories_avg[i]),
    round2(data.weight_morning[i]),
    round2(data.weight_evening[i]),
  ]);
  return { ok: true, filename: `calories-weight_${from}_${to}.csv`, csv: toCsv(headers, rows) };
}

/** Macro breakdown chart — one column per stacked calorie series. */
export async function exportMacroBreakdownCsv(
  from: string,
  to: string,
): Promise<ExportResult> {
  const invalid = validateRange(from, to);
  if (invalid) return invalid;

  const userId = await requireUserId();
  const data = prepareMacroBreakdown(await summariesUpToYesterday(userId), ROLLING_WINDOW_DAYS);
  const headers = [
    "date",
    "protein_cal",
    "other_carbs_cal",
    "sugar_cal",
    "other_fat_cal",
    "saturated_fat_cal",
  ];
  const rows: CsvValue[][] = rangeIndices(data.dates, from, to).map((i) => [
    data.dates[i],
    round2(data.protein_cal[i]),
    round2(data.other_carbs_cal[i]),
    round2(data.sugar_cal[i]),
    round2(data.other_fat_cal[i]),
    round2(data.saturated_fat_cal[i]),
  ]);
  return { ok: true, filename: `macro-breakdown_${from}_${to}.csv`, csv: toCsv(headers, rows) };
}

/** Nutrients vs RDI chart — one "% of RDI" column per nutrient series. */
export async function exportNutrientsRdiCsv(
  from: string,
  to: string,
): Promise<ExportResult> {
  const invalid = validateRange(from, to);
  if (invalid) return invalid;

  const userId = await requireUserId();
  const data = prepareNutrientsRdi(await summariesUpToYesterday(userId), ROLLING_WINDOW_DAYS);
  const keys = Object.keys(data.series);
  const headers = ["date", ...keys.map((k) => `${k}_pct_rdi`)];
  const rows: CsvValue[][] = rangeIndices(data.dates, from, to).map((i) => [
    data.dates[i],
    ...keys.map((k) => round2(data.series[k][i])),
  ]);
  return { ok: true, filename: `nutrients-rdi_${from}_${to}.csv`, csv: toCsv(headers, rows) };
}

/**
 * Clinician daily totals — one row per day in range: each nutrient's absolute
 * total, that day's personalised target, and a hit/miss flag, plus a trailing
 * SUMMARY row. `getOrCreateDailyTargets` is read-only (it never persists), so
 * resolving per-day targets here has no side effects.
 */
export async function exportDailyTotalsCsv(
  from: string,
  to: string,
): Promise<ExportResult> {
  const invalid = validateRange(from, to);
  if (invalid) return invalid;

  const userId = await requireUserId();
  const summaries = (await summariesUpToYesterday(userId)).filter(
    (s) => s.date >= from && s.date <= to,
  );
  const targetsByDate: Record<string, DailyTargets> = {};
  for (const s of summaries) {
    targetsByDate[s.date] = await getOrCreateDailyTargets(db, userId, s.date);
  }

  const { headers, rows } = buildDailyTotalsRows(summaries, targetsByDate);
  return { ok: true, filename: `daily-totals_${from}_${to}.csv`, csv: toCsv(headers, rows) };
}

/** Daily entries — one row per logged food item across the date range. */
export async function exportDailyEntriesCsv(
  from: string,
  to: string,
): Promise<ExportResult> {
  const invalid = validateRange(from, to);
  if (invalid) return invalid;

  const userId = await requireUserId();
  const headers = [
    "date",
    "timestamp",
    "source",
    "meal_name",
    "food_name",
    "weight_g",
    "quantity",
    ...NUTRIENT_KEYS,
  ];
  const rows: CsvValue[][] = [];

  for (
    let t = Date.parse(`${from}T00:00:00Z`);
    t <= Date.parse(`${to}T00:00:00Z`);
    t += 86_400_000
  ) {
    const date = new Date(t).toISOString().slice(0, 10);
    const day = await loadDailyEntry(db, userId, date);
    if (!day) continue;
    for (const e of day.entries) {
      if (e.kind === "food") {
        const fe = e.entry;
        rows.push([
          date,
          fe.timestamp,
          "food",
          "",
          fe.food_name,
          round2(fe.weight_g),
          round2(fe.quantity),
          ...NUTRIENT_KEYS.map((k) => round2(fe.nutrients[k])),
        ]);
      } else {
        for (const fe of e.entry.ingredients) {
          rows.push([
            date,
            fe.timestamp,
            "meal",
            e.entry.meal_name,
            fe.food_name,
            round2(fe.weight_g),
            round2(fe.quantity),
            ...NUTRIENT_KEYS.map((k) => round2(fe.nutrients[k])),
          ]);
        }
      }
    }
  }
  return { ok: true, filename: `daily-entries_${from}_${to}.csv`, csv: toCsv(headers, rows) };
}

/**
 * GDPR data portability — the user's COMPLETE personal dataset as JSON: account,
 * settings, food logs, summaries, targets, meals + ingredients, plans, and the
 * user's OWN food items (shared canonical foods are app data, excluded). Raw
 * rows, ignores the date range.
 */
export async function exportAllDataJson(): Promise<JsonExportResult> {
  const userId = await requireUserId();
  const data = await collectAllUserData(db, userId);
  const today = new Date().toISOString().slice(0, 10);
  return {
    ok: true,
    filename: `nutritional-data_${today}.json`,
    json: JSON.stringify(data, null, 2),
  };
}

/** Meal templates — one row per ingredient. Ignores the date range. */
export async function exportMealsCsv(): Promise<ExportResult> {
  const userId = await requireUserId();
  const meals = await loadMeals(db, userId);
  const headers = [
    "meal_name",
    "food_name",
    "weight_g",
    "quantity",
    ...NUTRIENT_KEYS,
  ];
  const rows: CsvValue[][] = [];
  for (const meal of meals) {
    for (const ing of meal.ingredients) {
      rows.push([
        meal.name,
        ing.food_name,
        round2(ing.weight_g),
        round2(ing.quantity),
        ...NUTRIENT_KEYS.map((k) => round2(ing.nutrients[k])),
      ]);
    }
  }
  return { ok: true, filename: `meals.csv`, csv: toCsv(headers, rows) };
}
