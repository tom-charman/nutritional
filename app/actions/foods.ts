"use server";

import { revalidatePath } from "next/cache";
import { randomUUID } from "node:crypto";
import { db } from "@/lib/db/client";
import { deleteFoodItem, saveFoodItem } from "@/lib/data/storage";
import { requireUserId } from "@/lib/data/user";
import type { FoodItem } from "@/lib/domain/types";
import { NUTRIENT_KEYS, type Nutrients, type UnitType } from "@/lib/constants";

export interface FoodFormInput {
  id?: string | null;
  name: string;
  unit_type: UnitType;
  serving_size_g: number | null;
  nutrients: Partial<Nutrients>;
}

export interface ActionResult {
  ok: boolean;
  message: string;
}

/** Save (create or update) a food item — validation per pages/foods.py. */
export async function saveFoodAction(input: FoodFormInput): Promise<ActionResult> {
  const name = input.name?.trim();
  if (!name) {
    return { ok: false, message: "Please enter a food name" };
  }
  if (input.unit_type === "per_item" && (input.serving_size_g === null || input.serving_size_g === undefined)) {
    return { ok: false, message: "Serving size is required for per-item foods" };
  }

  const food: FoodItem = {
    id: input.id || randomUUID(),
    name,
    unit_type: input.unit_type,
    serving_size_g: input.unit_type === "per_item" ? input.serving_size_g : null,
    // empty/None nutrient inputs → 0.0 (foods.py save behavior)
    energy_kcal: input.nutrients.energy_kcal ?? 0,
    fat_g: input.nutrients.fat_g ?? 0,
    saturated_fat_g: input.nutrients.saturated_fat_g ?? 0,
    carbohydrates_g: input.nutrients.carbohydrates_g ?? 0,
    sugar_g: input.nutrients.sugar_g ?? 0,
    protein_g: input.nutrients.protein_g ?? 0,
    fibre_g: input.nutrients.fibre_g ?? 0,
    salt_g: input.nutrients.salt_g ?? 0,
    calcium_mg: input.nutrients.calcium_mg ?? 0,
  };

  // Reject negative values (model ge=0 validation)
  for (const key of NUTRIENT_KEYS) {
    if (food[key] < 0) {
      return { ok: false, message: "Nutrient values must be zero or greater" };
    }
  }

  try {
    const userId = await requireUserId();
    await saveFoodItem(db, userId, food);
  } catch (e) {
    if (errorChainMatches(e, /unique|duplicate/i)) {
      return { ok: false, message: `A food named '${name}' already exists` };
    }
    return { ok: false, message: e instanceof Error ? e.message : "Failed to save food" };
  }
  revalidatePath("/foods");
  revalidatePath("/entry");
  return { ok: true, message: `Food item '${name}' saved successfully!` };
}

/** Match a pattern anywhere in an error's message → cause chain (drizzle wraps DB errors). */
function errorChainMatches(e: unknown, pattern: RegExp): boolean {
  let current: unknown = e;
  for (let depth = 0; depth < 5 && current instanceof Error; depth++) {
    if (pattern.test(current.message)) return true;
    current = current.cause;
  }
  return false;
}

export async function deleteFoodAction(foodId: string): Promise<ActionResult> {
  try {
    const userId = await requireUserId();
    const deleted = await deleteFoodItem(db, userId, foodId);
    if (!deleted) return { ok: false, message: "Food item not found" };
  } catch (e) {
    return {
      ok: false,
      message: errorChainMatches(e, /foreign key|violates/i)
        ? "Cannot delete: this food is used by existing entries or meals"
        : "Failed to delete food",
    };
  }
  revalidatePath("/foods");
  revalidatePath("/entry");
  return { ok: true, message: "Food deleted" };
}
