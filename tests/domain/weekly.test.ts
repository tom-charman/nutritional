import { describe, expect, it } from "vitest";
import { ROLLING_WINDOW_DAYS } from "@/lib/constants";
import { ewma, rollingAverage } from "@/lib/domain/charts/series";
import { prepareCaloriesWeight } from "@/lib/domain/charts/prepare";
import { computeWeeklyReadout } from "@/lib/domain/summary/weekly";
import type { DailySummary, UserSettings } from "@/lib/domain/types";

const NO_GOAL: UserSettings = {
  goal_weight_kg: null,
  weekly_rate_target_kg: null,
  start_weight_kg: null,
  start_date: null,
  hide_weekly_panel: false,
};

function addDays(iso: string, days: number): string {
  return new Date(Date.parse(`${iso}T00:00:00Z`) + days * 86_400_000)
    .toISOString()
    .slice(0, 10);
}

/**
 * Build `n` consecutive daily summaries starting at `start`, with morning weight
 * declining `kgPerWeek` (negative = losing) from `startWeight`, and a flat intake.
 */
function genSummaries(opts: {
  start: string;
  n: number;
  startWeight: number | null;
  kgPerWeek: number;
  intake: number | null;
}): DailySummary[] {
  const { start, n, startWeight, kgPerWeek, intake } = opts;
  const perDay = kgPerWeek / 7;
  return Array.from({ length: n }, (_, i) => ({
    date: addDays(start, i),
    energy_kcal: intake,
    fat_g: null,
    saturated_fat_g: null,
    carbohydrates_g: null,
    sugar_g: null,
    protein_g: null,
    fibre_g: null,
    salt_g: null,
    calcium_mg: null,
    morning_weight_kg: startWeight === null ? null : startWeight + perDay * i,
    evening_weight_kg: null,
  }));
}

function readoutFor(summaries: DailySummary[], settings: UserSettings, asOf: string) {
  const cw = prepareCaloriesWeight(summaries, ROLLING_WINDOW_DAYS, settings.goal_weight_kg);
  return computeWeeklyReadout(cw, summaries, settings, asOf);
}

describe("ewma responsiveness", () => {
  it("tracks a recent drop faster than a full-length mean", () => {
    // 20 days flat at 80, then 5 days at 78.
    const series = [...Array(20).fill(80), ...Array(5).fill(78)];
    const trend = ewma(series, 0.3);
    const mean = rollingAverage(series, series.length); // whole-history mean
    const last = series.length - 1;
    // The EWMA has moved meaningfully toward the recent value...
    expect(trend[last]!).toBeLessThan(79.4);
    expect(trend[last]!).toBeGreaterThan(78);
    // ...and is closer to "now" than a flat average of everything.
    expect(trend[last]!).toBeLessThan(mean[last]!);
  });

  it("carries the last value forward across trailing nulls", () => {
    const trend = ewma([80, 79.5, null, null], 0.5);
    expect(trend[3]).toBe(trend[1]); // unchanged over the gap
  });
});

describe("energy balance — deficit & predicted rate", () => {
  // Steady decline + steady intake: maintenance is weight-derived, so
  // deficit = slope×7700 and predicted rate recovers the true −0.5 kg/wk.
  const summaries = genSummaries({
    start: "2026-01-01",
    n: 40,
    startWeight: 85,
    kgPerWeek: -0.5,
    intake: 2000,
  });
  const asOf = summaries[summaries.length - 1].date;

  it("derives deficit from maintenance − intake and predicts the right rate", () => {
    const r = readoutFor(summaries, NO_GOAL, asOf);
    expect(r.reason).toBeNull();
    expect(r.avg_intake_kcal).toBeCloseTo(2000, 5);
    // maintenance ≈ intake + 550 (0.5 kg/wk worth of energy), deficit ≈ 550.
    expect(r.est_maintenance_kcal!).toBeCloseTo(2550, 0);
    expect(r.deficit_kcal_per_day!).toBeCloseTo(550, 0);
    expect(r.predicted_rate_kg_per_week!).toBeCloseTo(-0.5, 1);
  });

  it("keeps predicted rate consistent with the deficit", () => {
    const r = readoutFor(summaries, NO_GOAL, asOf);
    const expected = (-r.deficit_kcal_per_day! * 7) / 7700;
    expect(r.predicted_rate_kg_per_week!).toBeCloseTo(expected, 6);
  });
});

describe("weekly readout — projection", () => {
  const losing = genSummaries({
    start: "2026-01-01",
    n: 40,
    startWeight: 85,
    kgPerWeek: -0.5,
    intake: 2000,
  });
  const asOf = losing[losing.length - 1].date;

  it("projects a date when a real deficit moves toward the goal", () => {
    const r = readoutFor(losing, { ...NO_GOAL, goal_weight_kg: 80 }, asOf);
    expect(r.projection!.status).toBe("losing");
    expect(r.projection!.kg_to_go).toBeGreaterThan(0);
    expect(r.projection!.weeks_to_goal!).toBeGreaterThan(0);
    expect(r.projection!.projected_date).toBeTruthy();
  });

  it("flags 'at goal' within the maintenance band (no ETA)", () => {
    const trend = readoutFor(losing, NO_GOAL, asOf).trend_weight_kg!;
    const r = readoutFor(losing, { ...NO_GOAL, goal_weight_kg: trend }, asOf);
    expect(r.projection!.status).toBe("at_goal");
    expect(r.projection!.weeks_to_goal).toBeNull();
  });

  it("says 'holding' with no ETA when eating near maintenance", () => {
    // Flat weight + steady intake ⇒ deficit ≈ 0 ⇒ holding.
    const flat = genSummaries({ start: "2026-01-01", n: 40, startWeight: 85, kgPerWeek: 0, intake: 2000 });
    const r = readoutFor(flat, { ...NO_GOAL, goal_weight_kg: 80 }, flat[flat.length - 1].date);
    expect(r.projection!.status).toBe("holding");
    expect(r.projection!.weeks_to_goal).toBeNull();
    expect(r.projection!.projected_date).toBeNull();
  });

  it("does not project when gaining while the goal is below", () => {
    const gaining = genSummaries({ start: "2026-01-01", n: 40, startWeight: 80, kgPerWeek: +0.4, intake: 2600 });
    const r = readoutFor(gaining, { ...NO_GOAL, goal_weight_kg: 75 }, gaining[gaining.length - 1].date);
    expect(r.projection!.status).toBe("gaining");
    expect(r.projection!.weeks_to_goal).toBeNull();
    expect(r.projection!.projected_date).toBeNull();
  });

  it("omits projection entirely when no goal is set", () => {
    expect(readoutFor(losing, NO_GOAL, asOf).projection).toBeNull();
  });
});

describe("weekly readout — insufficient data", () => {
  it("reports no_weight_data when there are no weigh-ins", () => {
    const s = genSummaries({ start: "2026-01-01", n: 30, startWeight: null, kgPerWeek: 0, intake: 2100 });
    const r = readoutFor(s, NO_GOAL, s[s.length - 1].date);
    expect(r.reason).toBe("no_weight_data");
    expect(r.trend_weight_kg).toBeNull();
    expect(r.deficit_kcal_per_day).toBeNull();
    expect(r.predicted_rate_kg_per_week).toBeNull();
    expect(r.avg_intake_kcal).toBeCloseTo(2100, 5); // intake still reported
  });

  it("reports insufficient_points with <14 days but still shows trend weight", () => {
    const s = genSummaries({ start: "2026-01-01", n: 10, startWeight: 85, kgPerWeek: -0.5, intake: 2000 });
    const r = readoutFor(s, NO_GOAL, s[s.length - 1].date);
    expect(r.reason).toBe("insufficient_points");
    expect(r.deficit_kcal_per_day).toBeNull();
    expect(r.predicted_rate_kg_per_week).toBeNull();
    expect(r.trend_weight_kg).not.toBeNull();
  });
});
