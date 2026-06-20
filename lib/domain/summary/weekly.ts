/**
 * Weekly trend & goal projection — the Cutter card's readout.
 *
 * Surfaces, at the latest point, the responsive EWMA trend already computed in
 * `prepareCaloriesWeight`, plus a rate, an implied energy balance, and (when a goal
 * is set) a projection. Everything here is a DELIBERATELY shorter horizon than the
 * 30-day maintenance/TDEE estimate: a cutter needs this fortnight's signal.
 *
 * Consistency: rate and deficit both derive from the SAME trend change, so
 * `implied_deficit_kcal_per_day === -rate_kg_per_week × (KCAL_PER_KG / 7)` by
 * construction — the weight trend is treated as the calorimeter (it absorbs
 * adaptive-metabolism drift automatically), and intake is shown only as context.
 */
import {
  KCAL_PER_KG,
  MAINTENANCE_BAND_KG,
  MAX_WEIGHT_SLOPE_KG_PER_DAY,
  RATE_TOLERANCE_KG_PER_WEEK,
  RATE_WINDOW_DAYS,
} from "@/lib/constants";
import type { CaloriesWeightData } from "@/lib/domain/charts/prepare";
import type { DailySummary, UserSettings } from "@/lib/domain/types";

export type InsufficientReason = "no_weight_data" | "insufficient_points";

export type TrackStatus = "on_track" | "too_slow" | "too_fast" | "wrong_direction";

export interface Projection {
  /** kg still to move toward the goal (signed: >0 = must lose, <0 = must gain). */
  kg_to_go: number;
  /** 0..100 progress from the start weight (or current trend) toward the goal. */
  pct_to_goal: number;
  /** Whole weeks until the goal at the current rate; null if not converging. */
  weeks_to_goal: number | null;
  /** ISO date the goal is reached at the current rate; null if not converging. */
  projected_date: string | null;
  /** Verdict vs the user's declared target rate; null when no target is set. */
  on_track: TrackStatus | null;
  /** True when |trend − goal| ≤ MAINTENANCE_BAND_KG (maintenance phase). */
  at_goal: boolean;
}

export interface WeeklyReadout {
  /** Latest EWMA trend weight (kg); null when there is no weight data at all. */
  trend_weight_kg: number | null;
  /** Signed weekly rate (kg/week); negative = losing. Null if < RATE_WINDOW_DAYS history. */
  rate_kg_per_week: number | null;
  /** Recent 7-day mean intake (kcal); context only, never an input to the deficit. */
  avg_intake_kcal: number | null;
  /** Signed daily energy balance: positive = a deficit, negative = a surplus. */
  implied_deficit_kcal_per_day: number | null;
  /** Goal projection; null when no goal is set or no trend weight is available. */
  projection: Projection | null;
  /** Why the trend numbers are null, when they are. */
  reason: InsufficientReason | null;
}

/** Mean of the last `n` calendar days' non-null intake, up to and including asOf. */
function recentIntake(summaries: DailySummary[], asOfIso: string, n: number): number | null {
  const upTo = summaries.filter((s) => s.date <= asOfIso);
  const window = upTo.slice(-n);
  const vals = window
    .map((s) => s.energy_kcal)
    .filter((v): v is number => v !== null && Number.isFinite(v));
  if (vals.length === 0) return null;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

/** Add `days` to an ISO date (UTC), returning YYYY-MM-DD. */
function addDays(iso: string, days: number): string {
  const ms = Date.parse(`${iso}T00:00:00Z`) + days * 86_400_000;
  return new Date(ms).toISOString().slice(0, 10);
}

function trackVsTarget(
  rate: number,
  target: number | null,
): TrackStatus | null {
  if (target === null) return null; // no declared intent → no verdict (brand rule)
  const tol = RATE_TOLERANCE_KG_PER_WEEK;
  // Opposite directions (and target is meaningfully non-zero) → moving the wrong way.
  if (Math.abs(target) > tol && Math.sign(rate) !== Math.sign(target) && rate !== 0) {
    return "wrong_direction";
  }
  const a = Math.abs(rate);
  const t = Math.abs(target);
  if (a < t - tol) return "too_slow";
  if (a > t + tol) return "too_fast";
  return "on_track";
}

function buildProjection(
  trend: number,
  rateKgPerWeek: number | null,
  settings: UserSettings,
): Projection | null {
  const goal = settings.goal_weight_kg;
  if (goal === null) return null;

  const kgToGo = trend - goal; // >0 must lose, <0 must gain
  const at_goal = Math.abs(kgToGo) <= MAINTENANCE_BAND_KG;

  // Progress measured from the start weight when known, else relative to current.
  const start = settings.start_weight_kg;
  let pct_to_goal = at_goal ? 100 : 0;
  if (start !== null && Math.abs(start - goal) > 1e-6) {
    pct_to_goal = ((start - trend) / (start - goal)) * 100;
  }
  pct_to_goal = Math.max(0, Math.min(100, pct_to_goal));

  const on_track = rateKgPerWeek === null ? null : trackVsTarget(rateKgPerWeek, settings.weekly_rate_target_kg);

  if (at_goal) {
    return { kg_to_go: kgToGo, pct_to_goal: 100, weeks_to_goal: 0, projected_date: null, on_track, at_goal: true };
  }

  // Converging only if the rate moves toward the goal (opposite sign to kg_to_go).
  let weeks_to_goal: number | null = null;
  let projected_date: string | null = null;
  if (rateKgPerWeek !== null && rateKgPerWeek !== 0 && Math.sign(kgToGo) === -Math.sign(rateKgPerWeek)) {
    weeks_to_goal = kgToGo / -rateKgPerWeek; // both signs cancel → positive
  }

  return { kg_to_go: kgToGo, pct_to_goal, weeks_to_goal, projected_date, on_track, at_goal: false };
}

/**
 * Compute the weekly readout from the already-prepared calories/weight data plus
 * the raw summaries (for recent intake) and the user's settings.
 *
 * @param data    output of `prepareCaloriesWeight` — supplies the EWMA `weight_trend`.
 * @param summaries the same summaries fed to `prepareCaloriesWeight` (for 7-day intake).
 * @param settings  cross-day user settings (goal, target rate).
 * @param asOfIso   the "as of" date for intake window + projection arithmetic.
 */
export function computeWeeklyReadout(
  data: CaloriesWeightData,
  summaries: DailySummary[],
  settings: UserSettings,
  asOfIso: string,
): WeeklyReadout {
  const trend = data.weight_trend;
  const avg_intake_kcal = recentIntake(summaries, asOfIso, 7);

  const lastIdx = trend.length - 1;
  const trendLast = lastIdx >= 0 ? trend[lastIdx] : null;

  // No weight data at all.
  if (trendLast === null) {
    return {
      trend_weight_kg: null,
      rate_kg_per_week: null,
      avg_intake_kcal,
      implied_deficit_kcal_per_day: null,
      projection: null,
      reason: "no_weight_data",
    };
  }

  // Rate: change in the trend over the last RATE_WINDOW_DAYS, annualised to /week.
  const priorIdx = lastIdx - RATE_WINDOW_DAYS;
  const trendPrior = priorIdx >= 0 ? trend[priorIdx] : null;

  if (trendPrior === null) {
    // Trend weight is known, but there isn't enough history for a trustworthy rate.
    return {
      trend_weight_kg: trendLast,
      rate_kg_per_week: null,
      avg_intake_kcal,
      implied_deficit_kcal_per_day: null,
      projection: buildProjection(trendLast, null, settings),
      reason: "insufficient_points",
    };
  }

  const ratePerDayRaw = (trendLast - trendPrior) / RATE_WINDOW_DAYS;
  const ratePerDay = Math.max(
    -MAX_WEIGHT_SLOPE_KG_PER_DAY,
    Math.min(MAX_WEIGHT_SLOPE_KG_PER_DAY, ratePerDayRaw),
  );
  const rate_kg_per_week = ratePerDay * 7;
  const implied_deficit_kcal_per_day = -ratePerDay * KCAL_PER_KG;

  const projection = buildProjection(trendLast, rate_kg_per_week, settings);
  // Fill the projected date now that we have a concrete rate + asOf.
  if (projection && projection.weeks_to_goal !== null && !projection.at_goal) {
    projection.projected_date = addDays(asOfIso, Math.round(projection.weeks_to_goal * 7));
  }

  return {
    trend_weight_kg: trendLast,
    rate_kg_per_week,
    avg_intake_kcal,
    implied_deficit_kcal_per_day,
    projection,
    reason: null,
  };
}
