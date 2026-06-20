import { describe, expect, it } from "vitest";
import { getDefaultTargets } from "@/lib/domain/targets";
import type { DailySummary, DailyTargets } from "@/lib/domain/types";
import {
  DAILY_TOTALS_HEADERS,
  buildDailyTotalsRows,
  nutrientStatus,
} from "@/lib/export/dailyTotals";

function summary(date: string, over: Partial<DailySummary> = {}): DailySummary {
  return {
    date,
    energy_kcal: 0,
    fat_g: 0,
    saturated_fat_g: 0,
    carbohydrates_g: 0,
    sugar_g: 0,
    protein_g: 0,
    fibre_g: 0,
    salt_g: 0,
    calcium_mg: 0,
    morning_weight_kg: null,
    evening_weight_kg: null,
    ...over,
  };
}

describe("nutrientStatus", () => {
  it("limit mode: at or under cap is a hit, over is a miss", () => {
    expect(nutrientStatus(6, 6, "limit")).toBe("hit");
    expect(nutrientStatus(7, 6, "limit")).toBe("miss");
  });

  it("target mode: at or over goal is a hit, under is a miss", () => {
    expect(nutrientStatus(150, 150, "target")).toBe("hit");
    expect(nutrientStatus(120, 150, "target")).toBe("miss");
  });

  it("null actual (no data logged) is blank", () => {
    expect(nutrientStatus(null, 6, "limit")).toBe("");
  });
});

describe("buildDailyTotalsRows", () => {
  const targets: DailyTargets = getDefaultTargets("2024-06-01");
  const targetsByDate = {
    "2024-06-01": { ...targets, date: "2024-06-01" },
    "2024-06-02": { ...targets, date: "2024-06-02" },
  };

  it("emits absolute actual/target/status triples per nutrient, plus a summary row", () => {
    const summaries = [
      summary("2024-06-01", { salt_g: 8, protein_g: 160 }), // salt over (miss), protein met (hit)
      summary("2024-06-02", { salt_g: 4, protein_g: 100 }), // salt under (hit), protein under (miss)
    ];
    const { headers, rows } = buildDailyTotalsRows(summaries, targetsByDate);

    expect(headers).toBe(DAILY_TOTALS_HEADERS);
    expect(headers[0]).toBe("date");
    expect(headers).toContain("salt_g_actual");
    expect(headers).toContain("salt_g_target");
    expect(headers).toContain("salt_g_status");

    const saltActual = headers.indexOf("salt_g_actual");
    const saltTarget = headers.indexOf("salt_g_target");
    const saltStatus = headers.indexOf("salt_g_status");

    // Day 1: 8g salt vs 6g cap → miss
    expect(rows[0][0]).toBe("2024-06-01");
    expect(rows[0][saltActual]).toBe(8);
    expect(rows[0][saltTarget]).toBe(6);
    expect(rows[0][saltStatus]).toBe("miss");

    // Day 2: 4g salt vs 6g cap → hit
    expect(rows[1][saltStatus]).toBe("hit");

    // Summary row: mean actual + hit-rate
    const summaryRow = rows[2];
    expect(summaryRow[0]).toBe("SUMMARY");
    expect(summaryRow[saltActual]).toBe(6); // (8 + 4) / 2
    expect(summaryRow[saltStatus]).toBe("1/2"); // hit on day 2 only
  });

  it("renders a null day's actual and status as blank but keeps the target", () => {
    const summaries = [summary("2024-06-01", { salt_g: null })];
    const { headers, rows } = buildDailyTotalsRows(summaries, {
      "2024-06-01": { ...targets, date: "2024-06-01" },
    });
    const saltActual = headers.indexOf("salt_g_actual");
    const saltStatus = headers.indexOf("salt_g_status");
    const saltTarget = headers.indexOf("salt_g_target");
    expect(rows[0][saltActual]).toBeNull();
    expect(rows[0][saltStatus]).toBe("");
    expect(rows[0][saltTarget]).toBe(6);
  });

  it("returns no rows for an empty range", () => {
    expect(buildDailyTotalsRows([], {}).rows).toEqual([]);
  });
});
