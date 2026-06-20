/**
 * Weekly trend & goal projection — the Cutter card's readout.
 *
 * The projection is driven by ENERGY BALANCE, not by extrapolating the (noisy,
 * lagging) short-term scale trend or a hand-set rate:
 *
 *   deficit_kcal/day      = est_maintenance − recent_intake   (positive = a deficit)
 *   predicted_rate_kg/wk  = −deficit × 7 / KCAL_PER_KG         (negative = losing)
 *   weeks_to_goal         = |trend − goal| / |predicted_rate_kg/wk|
 *
 * `est_maintenance` is the adaptive 30-day TDEE already computed for the chart
 * (itself weight-derived), and `recent_intake` is the trailing 7-day average. This
 * is responsive — a recent intake change predicts the loss *before* the scale catches
 * up — and it generalises the scale-trend model: when intake has been steady,
 * `maintenance − intake` equals the weight-trend deficit anyway.
 *
 * When the deficit is within the noise floor we report an honest "holding" state and
 * NO projected date, rather than a spurious far-future ETA.
 */
import {
  KCAL_PER_KG,
  MAINTENANCE_BAND_KG,
  MIN_MEANINGFUL_DEFICIT_KCAL,
} from "@/lib/constants";
import type { CaloriesWeightData } from "@/lib/domain/charts/prepare";
import type { DailySummary, UserSettings } from "@/lib/domain/types";

export type InsufficientReason = "no_weight_data" | "insufficient_points";

/** Forward energy state implied by intake vs maintenance. */
export type EnergyStatus = "losing" | "holding" | "gaining" | "at_goal";

export interface Projection {
  /** kg still to move toward the goal (signed: >0 = must lose, <0 = must gain). */
  kg_to_go: number;
  /** 0..100 progress from the start weight toward the goal (null until there's a baseline). */
  pct_to_goal: number | null;
  /** Whole weeks until the goal at the predicted rate; null when not converging / holding. */
  weeks_to_goal: number | null;
  /** ISO date the goal is reached at the predicted rate; null when not projecting. */
  projected_date: string | null;
  /** Forward state from the energy balance. */
  status: EnergyStatus;
}

export interface WeeklyReadout {
  /** Latest EWMA trend weight (kg) — current smoothed weight; null with no weight data. */
  trend_weight_kg: number | null;
  /** Trailing 7-day mean intake (kcal). */
  avg_intake_kcal: number | null;
  /** Adaptive 30-day maintenance/TDEE estimate (kcal); null until enough weight data. */
  est_maintenance_kcal: number | null;
  /** Daily energy balance: maintenance − intake. Positive = a deficit, negative = surplus. */
  deficit_kcal_per_day: number | null;
  /** Predicted weekly rate from the deficit (kg/wk); negative = losing. */
  predicted_rate_kg_per_week: number | null;
  /** Goal projection; null when no goal is set. */
  projection: Projection | null;
  /** Why the energy numbers are null, when they are. */
  reason: InsufficientReason | null;
}

/** Last non-null value of a series. */
function lastValue(series: (number | null)[]): number | null {
  for (let i = series.length - 1; i >= 0; i--) {
    if (series[i] !== null) return series[i];
  }
  return null;
}

/** Mean of the last `n` calendar days' non-null intake, up to and including asOf. */
function recentIntake(summaries: DailySummary[], asOfIso: string, n: number): number | null {
  const window = summaries.filter((s) => s.date <= asOfIso).slice(-n);
  const vals = window
    .map((s) => s.energy_kcal)
    .filter((v): v is number => v !== null && Number.isFinite(v));
  if (vals.length === 0) return null;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

/** Add `days` to an ISO date (UTC), returning YYYY-MM-DD. */
function addDays(iso: string, days: number): string {
  return new Date(Date.parse(`${iso}T00:00:00Z`) + days * 86_400_000)
    .toISOString()
    .slice(0, 10);
}

function buildProjection(
  trend: number,
  predictedRateKgWeek: number | null,
  deficitKcal: number | null,
  settings: UserSettings,
  asOfIso: string,
): Projection | null {
  const goal = settings.goal_weight_kg;
  if (goal === null) return null;

  const kgToGo = trend - goal; // >0 must lose, <0 must gain
  const atGoal = Math.abs(kgToGo) <= MAINTENANCE_BAND_KG;

  // Progress from the captured start weight (null until both baseline and movement exist).
  const start = settings.start_weight_kg;
  let pct: number | null = null;
  if (atGoal) {
    pct = 100;
  } else if (start !== null && Math.abs(start - goal) > 1e-6) {
    pct = Math.max(0, Math.min(100, ((start - trend) / (start - goal)) * 100));
  }

  if (atGoal) {
    return { kg_to_go: kgToGo, pct_to_goal: 100, weeks_to_goal: null, projected_date: null, status: "at_goal" };
  }

  // Forward state from the energy balance.
  let status: EnergyStatus = "holding";
  if (deficitKcal !== null) {
    if (deficitKcal > MIN_MEANINGFUL_DEFICIT_KCAL) status = "losing";
    else if (deficitKcal < -MIN_MEANINGFUL_DEFICIT_KCAL) status = "gaining";
  }

  // Project an ETA only when there's a meaningful rate moving TOWARD the goal.
  let weeks: number | null = null;
  let date: string | null = null;
  if (
    predictedRateKgWeek !== null &&
    status !== "holding" &&
    Math.sign(kgToGo) === -Math.sign(predictedRateKgWeek)
  ) {
    weeks = Math.abs(kgToGo) / Math.abs(predictedRateKgWeek);
    date = addDays(asOfIso, Math.round(weeks * 7));
  }

  return { kg_to_go: kgToGo, pct_to_goal: pct, weeks_to_goal: weeks, projected_date: date, status };
}

/**
 * Compute the weekly readout from the prepared calories/weight data, the raw
 * summaries (for recent intake), and the user's settings.
 *
 * @param data      output of `prepareCaloriesWeight` — supplies the EWMA `weight_trend`
 *                  and the adaptive `maintenance` series.
 * @param summaries the same summaries fed to `prepareCaloriesWeight` (for 7-day intake).
 * @param settings  cross-day user settings (goal weight).
 * @param asOfIso   the "as of" date for the intake window + projection arithmetic.
 */
export function computeWeeklyReadout(
  data: CaloriesWeightData,
  summaries: DailySummary[],
  settings: UserSettings,
  asOfIso: string,
): WeeklyReadout {
  const trend_weight_kg = lastValue(data.weight_trend);
  const avg_intake_kcal = recentIntake(summaries, asOfIso, 7);
  const est_maintenance_kcal = lastValue(data.maintenance);

  // No weigh-ins at all → nothing to anchor on.
  if (trend_weight_kg === null) {
    return {
      trend_weight_kg: null,
      avg_intake_kcal,
      est_maintenance_kcal: null,
      deficit_kcal_per_day: null,
      predicted_rate_kg_per_week: null,
      projection: null,
      reason: "no_weight_data",
    };
  }

  // Maintenance needs ≥ MAINTENANCE_MIN_POINTS weigh-ins; without it (or without
  // intake) we can't predict a rate, but we still report the current trend weight.
  const canPredict = est_maintenance_kcal !== null && avg_intake_kcal !== null;
  const deficit_kcal_per_day = canPredict ? est_maintenance_kcal! - avg_intake_kcal! : null;
  const predicted_rate_kg_per_week =
    deficit_kcal_per_day === null ? null : (-deficit_kcal_per_day * 7) / KCAL_PER_KG;

  return {
    trend_weight_kg,
    avg_intake_kcal,
    est_maintenance_kcal,
    deficit_kcal_per_day,
    predicted_rate_kg_per_week,
    projection: buildProjection(
      trend_weight_kg,
      predicted_rate_kg_per_week,
      deficit_kcal_per_day,
      settings,
      asOfIso,
    ),
    reason: canPredict ? null : "insufficient_points",
  };
}
