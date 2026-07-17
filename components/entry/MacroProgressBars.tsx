"use client";

/**
 * Daily pigment channels — each nutrient's day rendered as its own pigment
 * filling a washed channel (area tone on wash track: the soft dilutions,
 * carried by the channel's thickness). Energy leads; ✓/⚠ verdicts stamp in.
 */
import {
  NUTRIENT_BANDS,
  NUTRIENT_SHORT_NAMES,
  type NutrientKey,
  type Nutrients,
} from "@/lib/constants";
import { getNutrientMode, nutrientIndicator } from "@/lib/domain/targets";
import { formatKcal } from "@/lib/format";
import type { DailyTargets } from "@/lib/domain/types";

const BARS: { key: NutrientKey; cssClass: string; unit: "g" | "mg" | "kcal" }[] = [
  { key: "energy_kcal", cssClass: "progress-calories", unit: "kcal" },
  { key: "fat_g", cssClass: "progress-fat", unit: "g" },
  { key: "saturated_fat_g", cssClass: "progress-saturated-fat", unit: "g" },
  { key: "carbohydrates_g", cssClass: "progress-carbs", unit: "g" },
  { key: "sugar_g", cssClass: "progress-sugar", unit: "g" },
  { key: "protein_g", cssClass: "progress-protein", unit: "g" },
  { key: "fibre_g", cssClass: "progress-fibre", unit: "g" },
  { key: "salt_g", cssClass: "progress-salt", unit: "g" },
  { key: "calcium_mg", cssClass: "progress-calcium", unit: "mg" },
  { key: "vitamin_c_mg", cssClass: "progress-vitamin-c", unit: "mg" },
];

const INDICATOR: Record<string, { symbol: string; cls: string; title: string }> = {
  met: { symbol: "✓", cls: "target-met", title: "Target met" },
  warning: { symbol: "⚠", cls: "target-warning", title: "Near limit" },
  exceeded: { symbol: "⚠", cls: "target-exceeded", title: "Limit exceeded" },
};

/** Value formats per python create_macro_bar: g→"12.3g/67g", mg→"800mg/700mg", kcal→"2463 / 3000". */
function formatPair(value: number, target: number, unit: "g" | "mg" | "kcal") {
  if (unit === "kcal") return `${formatKcal(value)} / ${formatKcal(target)}`;
  if (unit === "mg") return `${value.toFixed(0)}mg / ${target.toFixed(0)}mg`;
  return `${value.toFixed(1)}g / ${target.toFixed(0)}g`;
}

export default function MacroProgressBars({
  consumed,
  targets,
}: {
  consumed: Nutrients;
  targets: DailyTargets;
}) {
  // An empty day still renders the channels at zero — the targets ARE the
  // useful content of an empty day ("here's what today expects of me").
  // But a verdict ✓/⚠ means "after eating", so suppress it on an empty day:
  // otherwise a limit nutrient shows "met ✓" ("stayed under") before any food.
  const dayEmpty = consumed.energy_kcal <= 0;
  return (
    <div className="macros-visualization">
      <div className="macros-bars">
        {BARS.map(({ key, cssClass, unit }) => {
          const label = NUTRIENT_SHORT_NAMES[key];
          const value = consumed[key];
          const target = targets.values[key];
          const mode = getNutrientMode(targets, key);
          const indicator = nutrientIndicator(key, value, target, mode, NUTRIENT_BANDS[key]);
          const pct = target > 0 ? Math.min((value / target) * 100, 100) : 0;
          const ind = indicator && !dayEmpty ? INDICATOR[indicator] : null;
          return (
            <div key={key} className="macro-bar-item">
              <div className="macro-bar-header">
                <span className="macro-bar-label">{label}</span>
                <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <span className="macro-bar-value">{formatPair(value, target, unit)}</span>
                  {ind && (
                    <span className={`macro-bar-indicator ${ind.cls}`} title={ind.title}>
                      {ind.symbol}
                    </span>
                  )}
                </span>
              </div>
              <div className={`progress ${cssClass}`}>
                <div className="progress-bar" style={{ width: `${pct}%` }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
