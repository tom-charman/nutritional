"use client";

import {
  NUTRIENT_CSS_CLASS,
  NUTRIENT_INK,
  NUTRIENT_KEYS,
  NUTRIENT_SHORT_NAMES,
  NUTRIENT_UNITS,
  type Nutrients,
} from "@/lib/constants";
import type { DailyTargets } from "@/lib/domain/types";

function fmt(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

/**
 * Live nutrient preview. With `targets` (the daily-entry page), each row
 * carries a slim pigment channel showing how much of the day's target this
 * entry would fill — the same visual language as the daily channels it will
 * pour into on submit. Without targets (meal composer), rows show ink dots.
 */
export default function NutrientPreview({
  nutrients,
  targets,
}: {
  nutrients: Nutrients;
  targets?: DailyTargets;
}) {
  return (
    <div className="nutrient-preview-card">
      {NUTRIENT_KEYS.map((key) => {
        const value = nutrients[key];
        const target = targets?.values[key];
        const pct =
          target && target > 0 ? Math.min((value / target) * 100, 100) : null;
        return (
          <div key={key} className="nutrient-preview-item">
            <div className="nutrient-preview-row">
              {pct === null && (
                <span className="nutrient-dot" style={{ background: NUTRIENT_INK[key] }} />
              )}
              <span className="nutrient-label">{NUTRIENT_SHORT_NAMES[key]}</span>
              <span className="nutrient-value">
                {fmt(value)} {NUTRIENT_UNITS[key]}
              </span>
            </div>
            {pct !== null && (
              <div className={`progress preview-channel ${NUTRIENT_CSS_CLASS[key]}`}>
                <div className="progress-bar" style={{ width: `${pct}%` }} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
