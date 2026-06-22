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
import { getNutrientMode, macroIndicator } from "@/lib/domain/targets";
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
];

const INDICATOR: Record<string, { symbol: string; cls: string; title: string }> = {
  met: { symbol: "✓", cls: "target-met", title: "Target met" },
  warning: { symbol: "⚠", cls: "target-warning", title: "Near limit" },
  exceeded: { symbol: "⚠", cls: "target-exceeded", title: "Limit exceeded" },
};

/** Value formats per python create_macro_bar: g→"12.3g/67g", mg→"800mg/700mg", kcal→"2463 / 3000". */
function formatPair(value: number, target: number, unit: "g" | "mg" | "kcal") {
  if (unit === "kcal") return `${value.toFixed(0)} / ${target.toFixed(0)}`;
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
  return (
    <div className="macros-visualization">
      <div className="macros-bars">
        {BARS.map(({ key, cssClass, unit }) => {
          const label = NUTRIENT_SHORT_NAMES[key];
          const value = consumed[key];
          const target = targets.values[key];
          const mode = getNutrientMode(targets, key);
          const indicator = macroIndicator(value, target, mode, NUTRIENT_BANDS[key]);
          const pct = target > 0 ? Math.min((value / target) * 100, 100) : 0;
          const ind = indicator ? INDICATOR[indicator] : null;
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
