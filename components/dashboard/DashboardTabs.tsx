"use client";

import { useMemo, useState } from "react";
import type { TargetMode } from "@/lib/constants";
import {
  windowCaloriesWeight,
  windowMacroBreakdown,
  windowNutrientsRdi,
  type CaloriesWeightData,
  type MacroBreakdownData,
  type NutrientsRdiData,
} from "@/lib/domain/charts/prepare";
import CaloriesWeightChart from "./CaloriesWeightChart";
import MacroBreakdownChart from "./MacroBreakdownChart";
import NutrientsRdiChart from "./NutrientsRdiChart";

const TABS = [
  "Calories & Weight",
  "Macronutrient Breakdown",
  "Nutrients vs RDI",
] as const;

const RANGES = [
  { label: "1M", months: 1 },
  { label: "3M", months: 3 },
  { label: "6M", months: 6 },
  { label: "1Y", months: 12 },
  { label: "ALL", months: null },
] as const;

type RangeLabel = (typeof RANGES)[number]["label"];

/** Cutoff anchored to the LAST data date, not today (data is capped to yesterday). */
function cutoffFor(dates: string[], months: number | null): string | null {
  if (months === null || dates.length === 0) return null;
  const last = new Date(`${dates[dates.length - 1]}T00:00:00Z`);
  last.setUTCMonth(last.getUTCMonth() - months);
  return last.toISOString().slice(0, 10);
}

export default function DashboardTabs({
  caloriesWeight,
  macroBreakdown,
  nutrientsRdi,
  rdiModes,
}: {
  caloriesWeight: CaloriesWeightData;
  macroBreakdown: MacroBreakdownData;
  nutrientsRdi: NutrientsRdiData;
  rdiModes: Record<string, TargetMode>;
}) {
  const [active, setActive] = useState(0);
  // Default 3M: the daily question is "how am I trending lately?" —
  // the full history is one tap away.
  const [range, setRange] = useState<RangeLabel>("3M");

  const months = RANGES.find((r) => r.label === range)!.months;

  const windowed = useMemo(() => {
    const cutoff = cutoffFor(caloriesWeight.dates, months);
    return {
      caloriesWeight: windowCaloriesWeight(caloriesWeight, cutoff),
      macroBreakdown: windowMacroBreakdown(macroBreakdown, cutoff),
      nutrientsRdi: windowNutrientsRdi(nutrientsRdi, cutoff),
    };
  }, [caloriesWeight, macroBreakdown, nutrientsRdi, months]);

  return (
    <div>
      <div className="chart-controls">
        <div className="nav-tabs" role="tablist">
          {TABS.map((tab, i) => (
            <button
              key={tab}
              role="tab"
              aria-selected={active === i}
              className={`tab-link${active === i ? " active" : ""}`}
              onClick={() => setActive(i)}
            >
              {tab}
            </button>
          ))}
        </div>
        <div
          className="range-toggle"
          role="radiogroup"
          aria-label="Date range"
          onKeyDown={(e) => {
            const idx = RANGES.findIndex((r) => r.label === range);
            if (e.key === "ArrowRight" && idx < RANGES.length - 1) {
              setRange(RANGES[idx + 1].label);
            } else if (e.key === "ArrowLeft" && idx > 0) {
              setRange(RANGES[idx - 1].label);
            }
          }}
        >
          {RANGES.map((r) => (
            <button
              key={r.label}
              type="button"
              role="radio"
              aria-checked={range === r.label}
              className={`mode-toggle-option${range === r.label ? " active" : ""}`}
              onClick={() => setRange(r.label)}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>
      {/* keyed by view: range/tab changes settle the new reading into place */}
      <div className="graph-wrapper" key={`${active}-${range}`}>
        {active === 0 && <CaloriesWeightChart data={windowed.caloriesWeight} />}
        {active === 1 && <MacroBreakdownChart data={windowed.macroBreakdown} />}
        {active === 2 && <NutrientsRdiChart data={windowed.nutrientsRdi} modes={rdiModes} />}
      </div>
    </div>
  );
}
