"use client";

import { useState } from "react";
import type {
  CaloriesWeightData,
  MacroBreakdownData,
  NutrientsRdiData,
} from "@/lib/domain/charts/prepare";
import CaloriesWeightChart from "./CaloriesWeightChart";
import MacroBreakdownChart from "./MacroBreakdownChart";
import NutrientsRdiChart from "./NutrientsRdiChart";

const TABS = [
  "Calories & Weight",
  "Macronutrient Breakdown",
  "Nutrients vs RDI",
] as const;

export default function DashboardTabs({
  caloriesWeight,
  macroBreakdown,
  nutrientsRdi,
}: {
  caloriesWeight: CaloriesWeightData;
  macroBreakdown: MacroBreakdownData;
  nutrientsRdi: NutrientsRdiData;
}) {
  const [active, setActive] = useState(0);

  return (
    <div>
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
      <div className="graph-wrapper">
        {active === 0 && <CaloriesWeightChart data={caloriesWeight} />}
        {active === 1 && <MacroBreakdownChart data={macroBreakdown} />}
        {active === 2 && <NutrientsRdiChart data={nutrientsRdi} />}
      </div>
    </div>
  );
}
