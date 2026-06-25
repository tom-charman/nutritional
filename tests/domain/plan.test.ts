import { describe, expect, it } from "vitest";
import { ZERO_NUTRIENTS, type Nutrients } from "@/lib/constants";
import { getDefaultTargets } from "@/lib/domain/targets";
import { aggregateWeek, planDayTotals } from "@/lib/domain/plan/aggregate";
import { planDayVerdict } from "@/lib/domain/plan/verdict";
import { weekDates } from "@/lib/domain/plan/week";
import type { PlanItem, WeekPlan } from "@/lib/domain/types";

const WEEK = "2024-06-03"; // Monday
const [MON, TUE, WED] = weekDates(WEEK);

function n(partial: Partial<Nutrients>): Nutrients {
  return { ...ZERO_NUTRIENTS, ...partial };
}

function item(date: string, nutrients: Nutrients, id = `${date}-${Math.round(nutrients.energy_kcal)}`): PlanItem {
  return {
    id,
    plan_date: date,
    slot: "lunch",
    position: 0,
    ref: { kind: "food", food_id: "f", food_name: "F", weight_g: 100, quantity: null },
    nutrients,
    applied: false,
  };
}

describe("aggregateWeek", () => {
  it("uses honest denominators and marks unplanned days null", () => {
    const week: WeekPlan = {
      week_start: WEEK,
      items: [
        item(MON, n({ energy_kcal: 2000, protein_g: 100 })),
        item(TUE, n({ energy_kcal: 1000, protein_g: 50 })),
        item(TUE, n({ energy_kcal: 1000, protein_g: 50 })), // second item same day
      ],
    };
    const agg = aggregateWeek(week);

    expect(agg.daysPlanned).toBe(2); // Mon + Tue
    expect(agg.total.energy_kcal).toBe(4000);
    expect(agg.total.protein_g).toBe(200);
    // ÷ planned days (2) vs ÷ 7 calendar days — both exposed, neither silent.
    expect(agg.avgPerPlannedDay!.energy_kcal).toBe(2000);
    expect(agg.avgPerCalendarDay.energy_kcal).toBeCloseTo(4000 / 7, 5);
    // Unplanned day is null, never 0.
    expect(agg.byDay[WED]).toBeNull();
    expect(agg.byDay[MON]!.energy_kcal).toBe(2000);
    expect(agg.byDay[TUE]!.energy_kcal).toBe(2000); // two items summed
  });

  it("is all-zero total and null average when nothing is planned", () => {
    const agg = aggregateWeek({ week_start: WEEK, items: [] });
    expect(agg.daysPlanned).toBe(0);
    expect(agg.total.energy_kcal).toBe(0);
    expect(agg.avgPerPlannedDay).toBeNull();
    expect(agg.byDay[MON]).toBeNull();
  });

  it("planDayTotals returns null for an empty day", () => {
    expect(planDayTotals([])).toBeNull();
    expect(planDayTotals([item(MON, n({ energy_kcal: 5 }))])!.energy_kcal).toBe(5);
  });
});

describe("planDayVerdict", () => {
  const targets = getDefaultTargets(MON); // protein/energy/... target; sugar/satfat/salt limit

  // A day that hits every target floor and breaches no cap.
  const metDay = n({
    energy_kcal: 2000,
    protein_g: 150,
    carbohydrates_g: 225,
    fat_g: 67,
    fibre_g: 30,
    calcium_mg: 700,
    vitamin_c_mg: 200,
  });

  it("unknown for an unplanned day (not a pass, not 0)", () => {
    expect(planDayVerdict(null, targets).state).toBe("unknown");
  });

  it("met when floors are hit and no cap breached", () => {
    expect(planDayVerdict(metDay, targets).state).toBe("met");
  });

  it("over (with specific reason) when a limit is breached — and it dominates", () => {
    const v = planDayVerdict({ ...metDay, salt_g: 7, protein_g: 100 }, targets);
    expect(v.state).toBe("over"); // breach wins over the protein floor miss
    expect(v.reason).toMatch(/Salt \+1 g over/);
  });

  it("under when a target floor is missed", () => {
    const v = planDayVerdict({ ...metDay, protein_g: 100 }, targets);
    expect(v.state).toBe("under");
    expect(v.reason).toMatch(/Protein 50 g short/);
  });

  it("over when calories blow past their band (energy is a window, not a floor)", () => {
    // energy band = 0.04 → exceeded beyond 2160; 2400 is a real overage.
    const v = planDayVerdict({ ...metDay, energy_kcal: 2400 }, targets);
    expect(v.state).toBe("over");
    expect(v.reason).toMatch(/Calories \+400 kcal over/);
  });
});

import { comparePlanVsActual, summaryToNutrients } from "@/lib/domain/plan/compare";
import type { DailySummary } from "@/lib/domain/types";

function summary(date: string, partial: Partial<Nutrients>): DailySummary {
  const z = { ...ZERO_NUTRIENTS, ...partial };
  return {
    date,
    energy_kcal: z.energy_kcal,
    fat_g: z.fat_g,
    saturated_fat_g: z.saturated_fat_g,
    carbohydrates_g: z.carbohydrates_g,
    sugar_g: z.sugar_g,
    protein_g: z.protein_g,
    fibre_g: z.fibre_g,
    salt_g: z.salt_g,
    calcium_mg: z.calcium_mg,
    vitamin_c_mg: z.vitamin_c_mg,
    morning_weight_kg: null,
    evening_weight_kg: null,
  };
}

describe("comparePlanVsActual", () => {
  it("signed delta where both sides exist; null when either is missing", () => {
    const dates = [MON, TUE, WED];
    const plannedByDay = {
      [MON]: n({ energy_kcal: 2000, protein_g: 150 }),
      [TUE]: n({ energy_kcal: 1800, protein_g: 120 }), // planned but not logged
      [WED]: null, // not planned
    };
    const summaries: Record<string, DailySummary> = {
      [MON]: summary(MON, { energy_kcal: 2100, protein_g: 140 }), // logged, +100/-10
      [WED]: summary(WED, { energy_kcal: 500, protein_g: 30 }), // logged but unplanned
    };
    const cmp = comparePlanVsActual(plannedByDay, summaries, dates);

    expect(cmp.anyLogged).toBe(true);
    // Mon: both present → signed deltas
    const mon = cmp.byDay[0].byNutrient;
    expect(mon.energy_kcal.delta).toBe(100);
    expect(mon.protein_g.delta).toBe(-10);
    // Tue: planned, not logged → unknown delta
    expect(cmp.byDay[1].logged).toBe(false);
    expect(cmp.byDay[1].byNutrient.energy_kcal.delta).toBeNull();
    expect(cmp.byDay[1].byNutrient.energy_kcal.planned).toBe(1800);
    // Wed: logged, not planned → unknown delta
    expect(cmp.byDay[2].planned).toBe(false);
    expect(cmp.byDay[2].byNutrient.energy_kcal.delta).toBeNull();
    expect(cmp.byDay[2].byNutrient.energy_kcal.actual).toBe(500);

    // Week totals are over the COMPARABLE basis only (days both planned & logged):
    // only Mon qualifies (Tue not logged, Wed not planned).
    expect(cmp.comparableDays).toBe(1);
    expect(cmp.week.energy_kcal.planned).toBe(2000);
    expect(cmp.week.energy_kcal.actual).toBe(2100);
    expect(cmp.week.energy_kcal.delta).toBe(100);
  });

  it("anyLogged false + null deltas when nothing is logged", () => {
    const cmp = comparePlanVsActual({ [MON]: n({ energy_kcal: 2000 }) }, {}, [MON]);
    expect(cmp.anyLogged).toBe(false);
    expect(cmp.week.energy_kcal.actual).toBeNull();
    expect(cmp.week.energy_kcal.delta).toBeNull();
  });

  it("summaryToNutrients is null for an empty/weight-only day", () => {
    expect(summaryToNutrients(undefined)).toBeNull();
    expect(summaryToNutrients(summary(MON, {}))).not.toBeNull(); // energy 0 is still "logged"
    const weightOnly = { ...summary(MON, {}), energy_kcal: null } as DailySummary;
    expect(summaryToNutrients(weightOnly)).toBeNull();
  });
});
