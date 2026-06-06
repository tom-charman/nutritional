"use client";

/**
 * Macro progress bars vs daily targets — port of entry.py create_macro_bar.
 * 8 nutrients (all but energy), capped at 100%, with ✓/⚠ per mode.
 * Value formats match production: g → "12.3g / 67g", mg → "800mg / 700mg".
 */
import { NUTRIENT_SHORT_NAMES, type NutrientKey, type Nutrients } from "@/lib/constants";
import { getNutrientMode, macroIndicator } from "@/lib/domain/targets";
import type { DailyTargets } from "@/lib/domain/types";

/** Labels come from the one canonical short-name set (NUTRIENT_SHORT_NAMES). */
const BARS: { key: NutrientKey; cssClass: string; unit: "g" | "mg" }[] = [
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

export default function MacroProgressBars({
  consumed,
  targets,
}: {
  consumed: Nutrients;
  targets: DailyTargets;
}) {
  // An empty day still renders the bars at zero — the targets ARE the
  // useful content of an empty day ("here's what today expects of me").
  return (
    <div className="macros-visualization">
      <div className="macros-bars">
        {BARS.map(({ key, cssClass, unit }) => {
          const label = NUTRIENT_SHORT_NAMES[key];
          const value = consumed[key];
          const target = targets.values[key];
          const mode = getNutrientMode(targets, key);
          const indicator = macroIndicator(value, target, mode);
          const pct = target > 0 ? Math.min((value / target) * 100, 100) : 0;
          const ind = indicator ? INDICATOR[indicator] : null;
          const valueStr =
            unit === "mg" ? `${value.toFixed(0)}mg` : `${value.toFixed(1)}g`;
          const targetStr =
            unit === "mg" ? `${target.toFixed(0)}mg` : `${target.toFixed(0)}g`;
          return (
            <div key={key} className="macro-bar-item">
              <div className="macro-bar-header">
                <span className="macro-bar-label">{label}</span>
                <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <span className="macro-bar-value">
                    {valueStr} / {targetStr}
                  </span>
                  {ind && (
                    <span className={`macro-bar-indicator ${ind.cls}`} title={ind.title}>
                      {ind.symbol}
                    </span>
                  )}
                </span>
              </div>
              <div className={`progress ${cssClass}`} style={{ height: 5 }}>
                <div className="progress-bar" style={{ width: `${pct}%` }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
