import type { Nutrients, TargetMode, UnitType } from "@/lib/constants";

/** Mirrors data_entry/models.py FoodItem. */
export interface FoodItem extends Nutrients {
  id: string;
  name: string;
  unit_type: UnitType;
  serving_size_g: number | null;
}

/** Mirrors models.py FoodEntry — exactly one of weight_g/quantity is set. */
export interface FoodEntry {
  entry_id: string;
  /** ISO datetime string (JSON-serializable across server/client). */
  timestamp: string;
  food_id: string;
  food_name: string;
  weight_g: number | null;
  quantity: number | null;
  nutrients: Nutrients;
}

/** Mirrors models.py MealEntry — ingredients pre-scaled for portions. */
export interface MealEntry {
  meal_id: string;
  meal_name: string;
  portions: number;
  ingredients: FoodEntry[];
}

export type DayEntry =
  | { kind: "food"; entry: FoodEntry }
  | { kind: "meal"; entry: MealEntry };

export interface Measurements {
  morning_weight_kg: number | null;
  evening_weight_kg: number | null;
}

/** Mirrors models.py DailyData. */
export interface DailyData {
  /** ISO date (YYYY-MM-DD) */
  date: string;
  entries: DayEntry[];
  measurements: Measurements;
}

/** Mirrors models.py MealIngredient (template ingredient, nutrients pre-calculated). */
export interface MealIngredient {
  food_id: string;
  food_name: string;
  weight_g: number | null;
  quantity: number | null;
  nutrients: Nutrients;
}

/** Mirrors models.py Meal (template). */
export interface Meal {
  id: string;
  name: string;
  ingredients: MealIngredient[];
}

/** Mirrors models.py DailyTargets. */
export interface DailyTargets {
  /** ISO date (YYYY-MM-DD) */
  date: string;
  mode: TargetMode;
  values: Nutrients;
  /** Per-nutrient mode overrides; null = use default mode. */
  modes: Record<keyof Nutrients, TargetMode | null>;
}

/** One daily_summaries row, coerced. */
export interface DailySummary {
  /** ISO date (YYYY-MM-DD) */
  date: string;
  energy_kcal: number | null;
  fat_g: number | null;
  saturated_fat_g: number | null;
  carbohydrates_g: number | null;
  sugar_g: number | null;
  protein_g: number | null;
  fibre_g: number | null;
  salt_g: number | null;
  calcium_mg: number | null;
  morning_weight_kg: number | null;
  evening_weight_kg: number | null;
}
