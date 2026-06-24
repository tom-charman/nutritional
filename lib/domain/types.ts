import type { MealYieldMode, Nutrients, TargetMode, UnitType } from "@/lib/constants";

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
  /**
   * Provenance (Weekly Planner). undefined/'manual' = hand-logged; 'plan' = this
   * row was materialised by applying a plan item. MUST round-trip through
   * saveDailyEntry's delete+reinsert or a later edit silently wipes it.
   */
  source?: "manual" | "plan";
  /** The plan item this row was applied from (idempotency + plan-vs-actual link). */
  plan_item_id?: string | null;
}

/** Mirrors models.py MealEntry — ingredients pre-scaled for portions. */
export interface MealEntry {
  meal_id: string;
  /** Per-log instance id — distinguishes the same meal logged more than once a day. */
  meal_log_id: string;
  meal_name: string;
  /**
   * The scaling FACTOR applied to the recipe's ingredients. For 'whole' meals
   * this equals the portions eaten (legacy meaning preserved). For 'by_weight' /
   * 'by_count' it is the consumed fraction of the batch (consumed_amount ÷ yield).
   */
  portions: number;
  /**
   * How the meal was measured when logged, plus the literal amount the user
   * entered (portions / grams / item count). Drives the edit control + display.
   * Optional for backward-compat with rows logged before yield modes existed
   * ('whole' + consumed_amount === portions when absent).
   */
  yield_mode?: MealYieldMode;
  consumed_amount?: number;
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
  /** How the recipe converts to a logged amount (see MealYieldMode). */
  yield_mode: MealYieldMode;
  /** Finished cooked weight (g) — set iff yield_mode === 'by_weight'. */
  yield_weight_g: number | null;
  /** Number of items the batch yields — set iff yield_mode === 'by_count'. */
  yield_count: number | null;
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

/**
 * Cross-day user settings (user_settings, single row), coerced.
 * All fields nullable — no goal / no rate target is a valid first-run state.
 */
export interface UserSettings {
  /** Target body weight (kg), or null if no goal is set. */
  goal_weight_kg: number | null;
  /** Signed weekly rate target (kg/week): negative = cut, positive = lean bulk. */
  weekly_rate_target_kg: number | null;
  /** Optional baseline weight for progress framing. */
  start_weight_kg: number | null;
  /** Optional baseline date (ISO YYYY-MM-DD). */
  start_date: string | null;
  /** User dismissed the Weekly Trend panel (e.g. while maintaining). */
  hide_weekly_panel: boolean;
}

/**
 * Slots (breakfast/lunch/dinner/snack) were removed — a planned day is now a
 * single flat list, so the `slot` column is vestigial. We keep writing a fixed
 * value into it (the column is `NOT NULL` and a legacy CHECK still restricts it
 * to the four slot names) purely to avoid a prod DB migration: deploys are
 * code-only, so changing the column or constraint would be a manual, risky step.
 * The value is arbitrary among the allowed set — "breakfast" — and nothing reads
 * it for grouping. Old rows keep their original slot and merge into the same list.
 */
export const FLAT_SLOT = "breakfast";

/**
 * One planned item on a day. References EITHER a meal template OR a single food.
 * `nutrients` is computed server-side (never persisted); `applied` is true when a
 * logged food_entries row already references this item.
 */
export interface PlanItem {
  id: string;
  /** ISO date (YYYY-MM-DD) */
  plan_date: string;
  /** Retained for storage compatibility; not used for grouping (see FLAT_SLOT). */
  slot: string;
  position: number;
  ref:
    | {
        kind: "meal";
        meal_id: string;
        meal_name: string;
        /** Scaling factor (consumed_amount ÷ yield; === portions for 'whole'). */
        portions: number;
        yield_mode: MealYieldMode;
        /** The literal planned amount: portions / grams / item count. */
        consumed_amount: number;
      }
    | {
        kind: "food";
        food_id: string;
        food_name: string;
        weight_g: number | null;
        quantity: number | null;
      };
  /** Planned nutrients for this item (meal = scaled ingredients summed). */
  nutrients: Nutrients;
  /** A logged food_entries row with this plan_item_id exists on plan_date. */
  applied: boolean;
}

/** A week's plan: all items keyed by the Monday it starts. */
export interface WeekPlan {
  /** ISO date (YYYY-MM-DD) of the Monday this week starts. */
  week_start: string;
  items: PlanItem[];
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
