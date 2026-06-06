/**
 * Domain constants ported from the Python app.
 * Sources: nutritional/settings.py, nutritional/data_entry/models.py,
 * nutritional/components.py, docs/brand-guidelines.md.
 */

/** Dashboard rolling-average window (callbacks.py hardcoded 30). */
export const ROLLING_WINDOW_DAYS = 30;

/** Caloric conversion factors (kcal/g) — settings.py */
export const CAL_PROT = 4;
export const CAL_CARB = 4;
export const CAL_FAT = 9;

/** The 9 tracked nutrients, canonical input/display order (models.py NUTRIENT_INPUT_ORDER). */
export const NUTRIENT_KEYS = [
  "energy_kcal",
  "fat_g",
  "saturated_fat_g",
  "carbohydrates_g",
  "sugar_g",
  "protein_g",
  "fibre_g",
  "salt_g",
  "calcium_mg",
] as const;

export type NutrientKey = (typeof NUTRIENT_KEYS)[number];

export type Nutrients = Record<NutrientKey, number>;

export const ZERO_NUTRIENTS: Nutrients = {
  energy_kcal: 0,
  fat_g: 0,
  saturated_fat_g: 0,
  carbohydrates_g: 0,
  sugar_g: 0,
  protein_g: 0,
  fibre_g: 0,
  salt_g: 0,
  calcium_mg: 0,
};

/** Labels per models.py NUTRIENT_FIELD_INFO. */
export const NUTRIENT_LABELS: Record<NutrientKey, string> = {
  energy_kcal: "Calories (kcal)",
  fat_g: "Fat (g)",
  saturated_fat_g: "Sat Fat (g)",
  carbohydrates_g: "Carbs (g)",
  sugar_g: "Sugar (g)",
  protein_g: "Protein (g)",
  fibre_g: "Fibre (g)",
  salt_g: "Salt (g)",
  calcium_mg: "Calcium (mg)",
};

export const NUTRIENT_UNITS: Record<NutrientKey, string> = {
  energy_kcal: "kcal",
  fat_g: "g",
  saturated_fat_g: "g",
  carbohydrates_g: "g",
  sugar_g: "g",
  protein_g: "g",
  fibre_g: "g",
  salt_g: "g",
  calcium_mg: "mg",
};

/**
 * RDI guidelines used ONLY by the Nutrients-vs-RDI dashboard chart.
 * Exact production values from settings.py:42-48 (NOT the daily-target defaults).
 */
export const RDI_GUIDELINES: Partial<Record<NutrientKey, number>> = {
  saturated_fat_g: 30,
  sugar_g: 90,
  fibre_g: 30,
  salt_g: 6,
  calcium_mg: 1000,
};

/**
 * THE canonical per-nutrient palette — one color per nutrient, used
 * EVERYWHERE that nutrient appears (preview dots, progress bars, both
 * dashboard charts). Every color must survive being a 1.5px line on the
 * Kaolin background, so the five nutrients that appear in the RDI chart
 * use the high-contrast Nihonga data pigments (brand doc §B); the rest
 * keep their original artisan pigments.
 */
export const NUTRIENT_COLORS: Record<NutrientKey, string> = {
  energy_kcal: "#2B2B2B", // Sumi Iron
  fat_g: "#BF6B59", // Baked Clay
  saturated_fat_g: "#E87722", // Persimmon
  carbohydrates_g: "#C8963E", // Antique Gold
  sugar_g: "#B8A900", // Mustard
  protein_g: "#2C4C5B", // Iron Blue
  fibre_g: "#4F6D46", // Aged Pine
  salt_g: "#7B5FB8", // Wisteria
  calcium_mg: "#4A9B8E", // Teal/Verdigris
};

/** Short display names — the one label set used wherever nutrients are listed. */
export const NUTRIENT_SHORT_NAMES: Record<NutrientKey, string> = {
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

/** Weight series color (Wakatake Bamboo) and band fill. */
export const WEIGHT_COLOR = "#789440";
export const WEIGHT_BAND_FILL = "rgba(120, 148, 64, 0.08)";


export type TargetMode = "target" | "limit";

export type UnitType = "per_100g" | "per_item";
