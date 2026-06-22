/**
 * Per-day plan verdicts — does a planned day hit its target floors and stay
 * under its limit caps? Reuses the daily-entry macro-bar semantics
 * (`macroIndicator` + `getNutrientMode`) so the planner judges a day exactly as
 * the entry page would once it's logged.
 *
 * Honesty rules (the brand's "never lie / never alarmist"):
 *  - an unplanned day is `unknown`, NOT a pass and NOT 0;
 *  - over/under is stated as a neutral fact with the specific nutrient + amount;
 *  - a limit breach can never hide behind a green-looking day (it wins the state).
 */
import {
  NUTRIENT_BANDS,
  NUTRIENT_KEYS,
  NUTRIENT_LABELS,
  NUTRIENT_UNITS,
  type NutrientKey,
  type Nutrients,
  type TargetMode,
} from "@/lib/constants";
import { getNutrientMode, macroIndicator, type IndicatorState } from "@/lib/domain/targets";
import type { DailyTargets } from "@/lib/domain/types";

/** met = every floor hit + no cap breached; over = a limit breach; under = a floor miss. */
export type DayVerdictState = "met" | "under" | "over" | "unknown";

export interface NutrientVerdict {
  nutrient: NutrientKey;
  mode: TargetMode;
  planned: number;
  target: number;
  indicator: IndicatorState;
}

export interface DayVerdict {
  state: DayVerdictState;
  /** A short, specific line for the worst issue, e.g. "Salt +1.2 g over". */
  reason: string | null;
  perNutrient: NutrientVerdict[];
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function fmt(n: number, unit: string): string {
  // kcal/mg read as whole numbers; grams to one decimal.
  return unit === "g" ? String(round1(n)) : String(Math.round(n));
}

const UNKNOWN: DayVerdict = { state: "unknown", reason: null, perNutrient: [] };

export function planDayVerdict(
  planned: Nutrients | null,
  targets: DailyTargets,
): DayVerdict {
  if (planned === null) return UNKNOWN;

  const perNutrient: NutrientVerdict[] = NUTRIENT_KEYS.map((k) => {
    const mode = getNutrientMode(targets, k);
    const target = targets.values[k];
    return { nutrient: k, mode, planned: planned[k], target, indicator: macroIndicator(planned[k], target, mode, NUTRIENT_BANDS[k]) };
  });

  // A breach of any limit cap dominates (Patient: it must never hide).
  const breaches = perNutrient.filter(
    (v) => v.mode === "limit" && (v.indicator === "warning" || v.indicator === "exceeded"),
  );
  if (breaches.length > 0) {
    // Worst = largest relative overage.
    const worst = breaches.reduce((a, b) =>
      b.planned / b.target > a.planned / a.target ? b : a,
    );
    const over = fmt(worst.planned - worst.target, NUTRIENT_UNITS[worst.nutrient]);
    return {
      state: "over",
      reason: `${NUTRIENT_LABELS[worst.nutrient].replace(/ \(.*\)$/, "")} +${over} ${NUTRIENT_UNITS[worst.nutrient]} over`,
      perNutrient,
    };
  }

  // Otherwise, a missed target floor.
  const misses = perNutrient.filter(
    (v) => v.mode === "target" && v.planned < v.target * (1 - NUTRIENT_BANDS[v.nutrient]),
  );
  if (misses.length > 0) {
    // Worst = largest relative shortfall.
    const worst = misses.reduce((a, b) =>
      1 - b.planned / b.target > 1 - a.planned / a.target ? b : a,
    );
    const short = fmt(worst.target - worst.planned, NUTRIENT_UNITS[worst.nutrient]);
    return {
      state: "under",
      reason: `${NUTRIENT_LABELS[worst.nutrient].replace(/ \(.*\)$/, "")} ${short} ${NUTRIENT_UNITS[worst.nutrient]} short`,
      perNutrient,
    };
  }

  return { state: "met", reason: null, perNutrient };
}
