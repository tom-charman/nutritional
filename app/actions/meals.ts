"use server";

/**
 * Meal template actions — port of pages/meal_planner.py callbacks.
 * Ingredient nutrients are recomputed server-side from the food database.
 */
import { revalidatePath } from "next/cache";
import { randomUUID } from "node:crypto";
import { db } from "@/lib/db/client";
import { deleteMeal, getFoodItem, saveMeal } from "@/lib/data/storage";
import { calculateNutrients } from "@/lib/domain/nutrients";
import type { Meal, MealIngredient } from "@/lib/domain/types";

export interface ActionResult {
  ok: boolean;
  message: string;
}

export interface MealIngredientInput {
  food_id: string;
  weight_g: number | null;
  quantity: number | null;
}

export async function saveMealAction(
  mealId: string | null,
  name: string,
  ingredients: MealIngredientInput[],
): Promise<ActionResult> {
  const trimmed = name?.trim();
  if (!trimmed) return { ok: false, message: "Please enter a meal name" };
  if (ingredients.length === 0) {
    return { ok: false, message: "Add at least one ingredient" };
  }

  const resolved: MealIngredient[] = [];
  for (const ing of ingredients) {
    const food = await getFoodItem(db, ing.food_id);
    if (!food) return { ok: false, message: "Food item not found" };
    const amount = ing.weight_g ?? ing.quantity;
    if (amount === null || !Number.isFinite(amount) || amount <= 0) {
      return { ok: false, message: "Ingredient amounts must be greater than zero" };
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
    ingredients: resolved,
  };

  try {
    await saveMeal(db, meal);
  } catch (e) {
    return {
      ok: false,
      message:
        e instanceof Error && /unique|duplicate/i.test(e.message)
          ? `A meal named '${trimmed}' already exists`
          : "Failed to save meal",
    };
  }
  revalidatePath("/meals");
  revalidatePath("/entry");
  return { ok: true, message: `Meal '${trimmed}' saved` };
}

export async function deleteMealAction(mealId: string): Promise<ActionResult> {
  const deleted = await deleteMeal(db, mealId);
  if (!deleted) return { ok: false, message: "Meal not found" };
  revalidatePath("/meals");
  revalidatePath("/entry");
  return { ok: true, message: "Meal deleted" };
}
