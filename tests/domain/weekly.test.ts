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

describe("weekly readout — rate, deficit, consistency", () => {
  const summaries = genSummaries({
    start: "2026-01-01",
    n: 40,
    startWeight: 85,
    kgPerWeek: -0.5,
    intake: 2000,
  });
  const asOf = summaries[summaries.length - 1].date;

  it("recovers ~ the true weekly rate", () => {
    const r = readoutFor(summaries, NO_GOAL, asOf);
    expect(r.reason).toBeNull();
    expect(r.rate_kg_per_week!).toBeCloseTo(-0.5, 1);
    expect(r.trend_weight_kg).not.toBeNull();
  });

  it("keeps deficit consistent with rate (deficit = -(rate/7)*7700)", () => {
    const r = readoutFor(summaries, NO_GOAL, asOf);
    const expected = -(r.rate_kg_per_week! / 7) * 7700;
    expect(r.implied_deficit_kcal_per_day!).toBeCloseTo(expected, 5);
    // Losing weight ⇒ a positive (energy) deficit.
    expect(r.implied_deficit_kcal_per_day!).toBeGreaterThan(0);
  });

  it("reports a recent 7-day intake as context", () => {
    const r = readoutFor(summaries, NO_GOAL, asOf);
    expect(r.avg_intake_kcal).toBeCloseTo(2000, 5);
  });
});

describe("weekly readout — projection", () => {
  const summaries = genSummaries({
    start: "2026-01-01",
    n: 40,
    startWeight: 85,
    kgPerWeek: -0.5,
    intake: 2000,
  });
  const asOf = summaries[summaries.length - 1].date;

  it("projects weeks-to-goal and a date when converging toward the goal", () => {
    const r = readoutFor(
      summaries,
      { ...NO_GOAL, goal_weight_kg: 80, weekly_rate_target_kg: -0.5 },
      asOf,
    );
    expect(r.projection).not.toBeNull();
    expect(r.projection!.at_goal).toBe(false);
    expect(r.projection!.kg_to_go).toBeGreaterThan(0); // still must lose
    expect(r.projection!.weeks_to_goal!).toBeGreaterThan(0);
    expect(r.projection!.projected_date).toBeTruthy();
    expect(r.projection!.on_track).toBe("on_track");
  });

  it("flags 'at goal' within the maintenance band", () => {
    const r = readoutFor(summaries, { ...NO_GOAL, goal_weight_kg: 999 }, asOf);
    // goal far above current → not at goal; use a goal near the trend instead:
    const trend = r.trend_weight_kg!;
    const r2 = readoutFor(summaries, { ...NO_GOAL, goal_weight_kg: trend }, asOf);
    expect(r2.projection!.at_goal).toBe(true);
    expect(r2.projection!.weeks_to_goal).toBe(0);
  });

  it("does not project when moving away from the goal", () => {
    // Gaining weight, but goal is below current ⇒ wrong direction.
    const gaining = genSummaries({
      start: "2026-01-01",
      n: 40,
      startWeight: 80,
      kgPerWeek: +0.4,
      intake: 2600,
    });
    const asOfG = gaining[gaining.length - 1].date;
    const r = readoutFor(gaining, { ...NO_GOAL, goal_weight_kg: 75, weekly_rate_target_kg: -0.5 }, asOfG);
    expect(r.projection!.weeks_to_goal).toBeNull();
    expect(r.projection!.projected_date).toBeNull();
    expect(r.projection!.on_track).toBe("wrong_direction");
  });

  it("omits projection entirely when no goal is set", () => {
    const r = readoutFor(summaries, NO_GOAL, asOf);
    expect(r.projection).toBeNull();
  });
});

describe("weekly readout — insufficient data", () => {
  it("reports no_weight_data when there are no weigh-ins", () => {
    const s = genSummaries({ start: "2026-01-01", n: 30, startWeight: null, kgPerWeek: 0, intake: 2100 });
    const r = readoutFor(s, NO_GOAL, s[s.length - 1].date);
    expect(r.reason).toBe("no_weight_data");
    expect(r.trend_weight_kg).toBeNull();
    expect(r.rate_kg_per_week).toBeNull();
    // intake is still reported.
    expect(r.avg_intake_kcal).toBeCloseTo(2100, 5);
  });

  it("reports insufficient_points with <14 days of history but still shows trend weight", () => {
    const s = genSummaries({ start: "2026-01-01", n: 10, startWeight: 85, kgPerWeek: -0.5, intake: 2000 });
    const r = readoutFor(s, NO_GOAL, s[s.length - 1].date);
    expect(r.reason).toBe("insufficient_points");
    expect(r.rate_kg_per_week).toBeNull();
    expect(r.implied_deficit_kcal_per_day).toBeNull();
    expect(r.trend_weight_kg).not.toBeNull();
  });
});
