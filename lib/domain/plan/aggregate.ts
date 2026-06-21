/**
 * Weekly plan aggregation. Honest about partial weeks: a day with no plan is
 * `null` (not 0), and BOTH denominators are surfaced (÷7 calendar vs ÷days
 * planned) rather than silently choosing — averaging a 5-day plan over 7 days
 * understates it, so the UI lets the user see which divisor is in play.
 */
import { NUTRIENT_KEYS, ZERO_NUTRIENTS, type Nutrients } from "@/lib/constants";
import { sumNutrients } from "@/lib/domain/nutrients";
import type { PlanItem, WeekPlan } from "@/lib/domain/types";
import { weekDates } from "./week";

/** Sum a single day's planned items. `null` for an empty day (honesty, not 0). */
export function planDayTotals(items: PlanItem[]): Nutrients | null {
  if (items.length === 0) return null;
  return sumNutrients(items.map((i) => i.nutrients));
}

export interface WeeklyPlanAggregate {
  /** Sum across all planned days (all-zero when nothing is planned). */
  total: Nutrients;
  /** Days in the week with at least one planned item. */
  daysPlanned: number;
  /** total ÷ daysPlanned — null when nothing is planned. */
  avgPerPlannedDay: Nutrients | null;
  /** total ÷ 7 — the honest calendar-week average. */
  avgPerCalendarDay: Nutrients;
  /** Per-date totals; `null` marks an unplanned day (never 0). */
  byDay: Record<string, Nutrients | null>;
}

function scaleNutrients(n: Nutrients, by: number): Nutrients {
  const out = { ...ZERO_NUTRIENTS };
  for (const k of NUTRIENT_KEYS) out[k] = n[k] / by;
  return out;
}

export function aggregateWeek(week: WeekPlan): WeeklyPlanAggregate {
  const itemsByDate = new Map<string, PlanItem[]>();
  for (const it of week.items) {
    const arr = itemsByDate.get(it.plan_date) ?? [];
    arr.push(it);
    itemsByDate.set(it.plan_date, arr);
  }

  const byDay: Record<string, Nutrients | null> = {};
  const plannedTotals: Nutrients[] = [];
  for (const d of weekDates(week.week_start)) {
    const t = planDayTotals(itemsByDate.get(d) ?? []);
    byDay[d] = t;
    if (t) plannedTotals.push(t);
  }

  const daysPlanned = plannedTotals.length;
  const total = daysPlanned ? sumNutrients(plannedTotals) : { ...ZERO_NUTRIENTS };
  return {
    total,
    daysPlanned,
    avgPerPlannedDay: daysPlanned ? scaleNutrients(total, daysPlanned) : null,
    avgPerCalendarDay: scaleNutrients(total, 7),
    byDay,
  };
}
