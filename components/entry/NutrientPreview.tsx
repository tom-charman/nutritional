"use client";

import {
  NUTRIENT_BANDS,
  NUTRIENT_CSS_CLASS,
  NUTRIENT_INK,
  NUTRIENT_KEYS,
  NUTRIENT_SHORT_NAMES,
  NUTRIENT_UNITS,
  type Nutrients,
} from "@/lib/constants";
import { getNutrientMode, limitOverPct, macroIndicator } from "@/lib/domain/targets";
import type { DailyTargets } from "@/lib/domain/types";

function fmt(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

/**
 * Live nutrient preview. With `targets` (the daily-entry page), each row
 * carries a slim pigment channel showing how much of the day's target this
 * entry would fill — the same visual language as the daily channels it will
 * pour into on submit. Without targets (meal composer), rows show ink dots.
 *
 * When `dayTotals` (the day's already-committed totals) is also supplied, a
 * limit nutrient whose *projected* day total (committed + this entry) would
 * breach its cap raises a warning here — before the entry is committed — so a
 * salt/sugar/sat-fat cap is never crossed silently. The threshold logic and
 * the ⚠ verdict are the same `macroIndicator` the committed macro bars use.
 */
export default function NutrientPreview({
  nutrients,
  targets,
  dayTotals,
}: {
  nutrients: Nutrients;
  targets?: DailyTargets;
  dayTotals?: Nutrients;
}) {
  return (
    <div className="nutrient-preview-card">
      {NUTRIENT_KEYS.map((key) => {
        const value = nutrients[key];
        const target = targets?.values[key];
        const pct =
          target && target > 0 ? Math.min((value / target) * 100, 100) : null;

        // Limit alert: only when we know the day's running total AND a target.
        let alert: { state: "warning" | "exceeded"; over: number } | null = null;
        if (targets && dayTotals && target && target > 0) {
          const projected = dayTotals[key] + value;
          const indicator = macroIndicator(
            projected,
            target,
            getNutrientMode(targets, key),
            NUTRIENT_BANDS[key],
          );
          if (indicator === "warning" || indicator === "exceeded") {
            alert = { state: indicator, over: limitOverPct(projected, target) };
          }
        }

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
            {alert && (
              <p
                className={`preview-limit-alert ${alert.state === "exceeded" ? "target-exceeded" : "target-warning"}`}
                role="alert"
              >
                <span className="preview-limit-alert-mark" aria-hidden="true">
                  ⚠
                </span>{" "}
                Would put you {alert.over}% over your{" "}
                {NUTRIENT_SHORT_NAMES[key].toLowerCase()} limit.
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}
