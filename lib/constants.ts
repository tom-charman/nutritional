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

/** Artisan/Nihonga nutrient palette — settings.py COLOR_PALETTE + components.py */
export const NUTRIENT_COLORS: Record<NutrientKey, string> = {
  energy_kcal: "#2B2B2B", // Sumi Iron
  fat_g: "#BF6B59", // Baked Clay
  saturated_fat_g: "#E09F91", // Dusty Salmon
  carbohydrates_g: "#C8963E", // Antique Gold
  sugar_g: "#EBC374", // Pale Amber
  protein_g: "#2C4C5B", // Iron Blue
  fibre_g: "#4F6D46", // Aged Pine
  salt_g: "#7C6A88", // Oxidized Ube
  calcium_mg: "#6B7F82", // Stone Grey
};

/** Weight series color (Wakatake Bamboo) and band fill. */
export const WEIGHT_COLOR = "#789440";
export const WEIGHT_BAND_FILL = "rgba(120, 148, 64, 0.08)";

/**
 * Multi-line chart palette — the Nihonga DATA palette from the brand doc
 * ("selected for high contrast against each other"). The muted nutrient
 * pigments (NUTRIENT_COLORS) are for badges/bars/dots where adjacency and
 * background tints carry the distinction; overlapping 1.5px lines need
 * contrast. (The old app used the muted pigments here and its RDI lines
 * were nearly indistinguishable.)
 */
export const RDI_CHART_COLORS: Partial<Record<NutrientKey, string>> = {
  saturated_fat_g: "#E87722", // Persimmon
  sugar_g: "#B8A900", // Mustard
  fibre_g: "#3D5941", // Pine
  salt_g: "#7B5FB8", // Wisteria
  calcium_mg: "#4A9B8E", // Teal/Verdigris
};

export type TargetMode = "target" | "limit";

export type UnitType = "per_100g" | "per_item";
