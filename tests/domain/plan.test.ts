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
});
