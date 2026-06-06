"use client";

import {
  NUTRIENT_INK,
  NUTRIENT_KEYS,
  NUTRIENT_SHORT_NAMES,
  NUTRIENT_UNITS,
  type Nutrients,
} from "@/lib/constants";

function fmt(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

/** Live nutrient preview — port of components.py create_nutrient_preview. */
export default function NutrientPreview({ nutrients }: { nutrients: Nutrients }) {
  return (
    <div className="nutrient-preview-card">
      {NUTRIENT_KEYS.map((key) => (
        <div key={key} className="nutrient-preview-item">
          <span className="nutrient-dot" style={{ background: NUTRIENT_INK[key] }} />
          <span className="nutrient-label">{NUTRIENT_SHORT_NAMES[key]}:&nbsp;</span>
          <span className="nutrient-value">
            {fmt(nutrients[key])} {NUTRIENT_UNITS[key]}
          </span>
        </div>
      ))}
    </div>
  );
}
