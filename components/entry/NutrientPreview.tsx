"use client";

import {
  NUTRIENT_COLORS,
  NUTRIENT_KEYS,
  NUTRIENT_UNITS,
  type Nutrients,
} from "@/lib/constants";

const SHORT_LABELS: Record<string, string> = {
  energy_kcal: "Energy",
  fat_g: "Fat",
  saturated_fat_g: "Sat Fat",
  carbohydrates_g: "Carbs",
  sugar_g: "Sugar",
  protein_g: "Protein",
  fibre_g: "Fibre",
  salt_g: "Salt",
  calcium_mg: "Calcium",
};

function fmt(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

/** Live nutrient preview — port of components.py create_nutrient_preview. */
export default function NutrientPreview({ nutrients }: { nutrients: Nutrients }) {
  return (
    <div className="nutrient-preview-card">
      {NUTRIENT_KEYS.map((key) => (
        <div key={key} className="nutrient-preview-item">
          <span className="nutrient-dot" style={{ background: NUTRIENT_COLORS[key] }} />
          <span className="nutrient-label">{SHORT_LABELS[key]}:&nbsp;</span>
          <span className="nutrient-value">
            {fmt(nutrients[key])} {NUTRIENT_UNITS[key]}
          </span>
        </div>
      ))}
    </div>
  );
}
