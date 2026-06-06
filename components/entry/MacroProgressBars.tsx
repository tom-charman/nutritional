"use client";

/**
 * Macro progress bars vs daily targets — port of entry.py create_macro_bar.
 * 8 nutrients (all but energy), capped at 100%, with ✓/⚠ per mode.
 * Value formats match production: g → "12.3g / 67g", mg → "800mg / 700mg".
 */
import { type NutrientKey, type Nutrients } from "@/lib/constants";
import { getNutrientMode, macroIndicator } from "@/lib/domain/targets";
import type { DailyTargets } from "@/lib/domain/types";

const BARS: { key: NutrientKey; label: string; cssClass: string; unit: "g" | "mg" }[] = [
  { key: "fat_g", label: "Fat", cssClass: "progress-fat", unit: "g" },
  { key: "saturated_fat_g", label: "Saturated Fat", cssClass: "progress-saturated-fat", unit: "g" },
  { key: "carbohydrates_g", label: "Carbohydrates", cssClass: "progress-carbs", unit: "g" },
  { key: "sugar_g", label: "Sugar", cssClass: "progress-sugar", unit: "g" },
  { key: "protein_g", label: "Protein", cssClass: "progress-protein", unit: "g" },
  { key: "fibre_g", label: "Fibre", cssClass: "progress-fibre", unit: "g" },
  { key: "salt_g", label: "Salt", cssClass: "progress-salt", unit: "g" },
  { key: "calcium_mg", label: "Calcium", cssClass: "progress-calcium", unit: "mg" },
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
        {BARS.map(({ key, label, cssClass, unit }) => {
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
