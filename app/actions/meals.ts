"use server";

/**
 * Meal template actions — port of pages/meal_planner.py callbacks.
 * Ingredient nutrients are recomputed server-side from the food database.
 */
import { revalidatePath } from "next/cache";
import { randomUUID } from "node:crypto";
import { db } from "@/lib/db/client";
import { deleteMeal, getFoodItem, getMeal, mealHasPlanItems, saveMeal } from "@/lib/data/storage";
import { requireUserId } from "@/lib/data/user";
import { calculateNutrients } from "@/lib/domain/nutrients";
import type { MealYieldMode } from "@/lib/constants";
import type { Meal, MealIngredient } from "@/lib/domain/types";

export interface ActionResult {
  ok: boolean;
  message: string;
}

/** Upper bound on any stored amount/weight/count (DECIMAL(8,2) column range). */
const MAX_AMOUNT = 100_000;

export interface MealIngredientInput {
  food_id: string;
  weight_g: number | null;
  quantity: number | null;
}

export interface MealYieldInput {
  yield_mode: MealYieldMode;
  yield_weight_g: number | null;
  yield_count: number | null;
}

/**
 * Validate + normalise the yield fields for the chosen mode. Returns the cleaned
 * triple (irrelevant columns forced to null) or an error message.
 */
function resolveYield(
  input: MealYieldInput,
): { ok: true; value: MealYieldInput } | { ok: false; message: string } {
  if (input.yield_mode === "by_weight") {
    const w = input.yield_weight_g;
    if (w === null || !Number.isFinite(w) || w <= 0) {
      return { ok: false, message: "Enter the finished weight (g)" };
    }
    if (w > MAX_AMOUNT) {
      return { ok: false, message: "Finished weight is too large — check the value" };
    }
    return { ok: true, value: { yield_mode: "by_weight", yield_weight_g: w, yield_count: null } };
  }
  if (input.yield_mode === "by_count") {
    const c = input.yield_count;
    if (c === null || !Number.isFinite(c) || c <= 0) {
      return { ok: false, message: "Enter how many items the batch makes" };
    }
    if (c > MAX_AMOUNT) {
      return { ok: false, message: "That's too many items — check the value" };
    }
    return { ok: true, value: { yield_mode: "by_count", yield_weight_g: null, yield_count: c } };
  }
  return { ok: true, value: { yield_mode: "whole", yield_weight_g: null, yield_count: null } };
}

export async function saveMealAction(
  mealId: string | null,
  name: string,
  ingredients: MealIngredientInput[],
  yield_: MealYieldInput = { yield_mode: "whole", yield_weight_g: null, yield_count: null },
): Promise<ActionResult> {
  const trimmed = name?.trim();
  if (!trimmed) return { ok: false, message: "Please enter a recipe name" };
  if (ingredients.length === 0) {
    return { ok: false, message: "Add at least one ingredient" };
  }
  const resolvedYield = resolveYield(yield_);
  if (!resolvedYield.ok) return resolvedYield;

  const userId = await requireUserId();

  // Guard: changing how an existing recipe is measured while it sits in a plan
  // would mis-read the planned amount (stored in the column matching the OLD mode).
  if (mealId) {
    const existing = await getMeal(db, userId, mealId);
    if (
      existing &&
      existing.yield_mode !== resolvedYield.value.yield_mode &&
      (await mealHasPlanItems(db, userId, mealId))
    ) {
      return {
        ok: false,
        message: "Remove this recipe from your weekly plan before changing how it's measured",
      };
    }
  }

  const resolved: MealIngredient[] = [];
  for (const ing of ingredients) {
    const food = await getFoodItem(db, userId, ing.food_id);
    if (!food) return { ok: false, message: "Food item not found" };
    const amount = ing.weight_g ?? ing.quantity;
    if (amount === null || !Number.isFinite(amount) || amount <= 0) {
      return { ok: false, message: "Ingredient amounts must be greater than zero" };
    }
    if (amount > MAX_AMOUNT) {
      return { ok: false, message: "An ingredient amount is too large — check the value" };
    }
    resolved.push({
      food_id: food.id,
      food_name: food.name,
      weight_g: ing.weight_g,
      quantity: ing.quantity,
      nutrients: calculateNutrients(food, {
        weight_g: ing.weight_g,
        quantity: ing.quantity,
      }),
    });
  }

  const meal: Meal = {
    id: mealId || randomUUID(),
    name: trimmed,
    yield_mode: resolvedYield.value.yield_mode,
    yield_weight_g: resolvedYield.value.yield_weight_g,
    yield_count: resolvedYield.value.yield_count,
    ingredients: resolved,
  };

  try {
    await saveMeal(db, userId, meal);
  } catch (e) {
    // drizzle wraps DB errors — check the cause chain
    let isDuplicate = false;
    let isOverflow = false;
    let current: unknown = e;
    for (let depth = 0; depth < 5 && current instanceof Error; depth++) {
      if (/unique|duplicate/i.test(current.message)) isDuplicate = true;
      if (/overflow|out of range|numeric field/i.test(current.message)) isOverflow = true;
      if (isDuplicate || isOverflow) break;
      current = current.cause;
    }
    return {
      ok: false,
      message: isDuplicate
        ? `A recipe named '${trimmed}' already exists`
        : isOverflow
          ? "A value is too large to save — check the amounts"
          : "Failed to save recipe",
    };
  }
  revalidatePath("/meals");
  revalidatePath("/entry");
  return { ok: true, message: `Recipe '${trimmed}' saved` };
}

export async function deleteMealAction(mealId: string): Promise<ActionResult> {
  const userId = await requireUserId();
  const deleted = await deleteMeal(db, userId, mealId);
  if (!deleted) return { ok: false, message: "Recipe not found" };
  revalidatePath("/meals");
  revalidatePath("/entry");
  return { ok: true, message: "Recipe deleted" };
}
