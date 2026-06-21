"use server";

/**
 * Weekly Planner server actions.
 *
 * A plan is intent, SEPARATE from the logged food_entries. Plan CRUD never
 * touches the log. `applyPlanDayAction` is the ONLY bridge to the log, and it is
 * deliberately constrained by the app's philosophy: we log what we actually ate,
 * so apply targets TODAY ONLY (computed server-side, never passed in) — never a
 * past day from memory, never a future day we haven't lived.
 */
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db/client";
import {
  clearPlanDay,
  copyPlanDay,
  deletePlanItem,
  getFoodItem,
  loadWeekPlan,
  paintMealAcrossDays,
  savePlanItem,
  updatePlanItemAmount,
} from "@/lib/data/storage";
import { requireUserId } from "@/lib/data/user";
import { mondayOf } from "@/lib/domain/plan/week";
import type { PlanSlot } from "@/lib/domain/types";
import { addFoodEntryAction, addMealEntryAction, type ActionResult } from "@/app/actions/entry";

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function revalidatePlanner(): void {
  revalidatePath("/planner");
}

// ============= Plan CRUD (no log side-effects) =============

/** Add a meal template to a (day, slot) cell. */
export async function addPlanMealAction(
  weekStart: string,
  planDate: string,
  slot: PlanSlot,
  mealId: string,
  portions: number,
): Promise<ActionResult> {
  if (!(portions > 0)) return { ok: false, message: "Please enter valid portions" };
  const userId = await requireUserId();
  await savePlanItem(db, userId, { weekStart, planDate, slot, mealId, portions });
  revalidatePlanner();
  return { ok: true, message: "Added to plan" };
}

/** Add a single food to a (day, slot) cell (amount = grams or item count). */
export async function addPlanFoodAction(
  weekStart: string,
  planDate: string,
  slot: PlanSlot,
  foodId: string,
  amount: number,
): Promise<ActionResult> {
  if (!(amount > 0)) return { ok: false, message: "Please enter an amount" };
  const userId = await requireUserId();
  const food = await getFoodItem(db, userId, foodId);
  if (!food) return { ok: false, message: "Food item not found" };
  const isPerItem = food.unit_type === "per_item";
  await savePlanItem(db, userId, {
    weekStart,
    planDate,
    slot,
    foodId,
    weightG: isPerItem ? null : amount,
    quantity: isPerItem ? amount : null,
  });
  revalidatePlanner();
  return { ok: true, message: "Added to plan" };
}

/** Edit a planned item's amount (portions for a meal, grams/count for a food). */
export async function editPlanItemAmountAction(
  itemId: string,
  newAmount: number,
): Promise<ActionResult> {
  if (!(newAmount > 0)) return { ok: false, message: "Please enter a valid amount" };
  const userId = await requireUserId();
  const ok = await updatePlanItemAmount(db, userId, itemId, newAmount);
  if (!ok) return { ok: false, message: "Plan item not found" };
  revalidatePlanner();
  return { ok: true, message: "Updated" };
}

/** Remove a planned item. Any already-applied log rows survive (FK SET NULL). */
export async function removePlanItemAction(itemId: string): Promise<ActionResult> {
  const userId = await requireUserId();
  const ok = await deletePlanItem(db, userId, itemId);
  if (!ok) return { ok: false, message: "Plan item not found" };
  revalidatePlanner();
  return { ok: true, message: "Removed from plan" };
}

/** Copy a whole planned day onto another day in the same week. */
export async function copyPlanDayAction(
  weekStart: string,
  fromDate: string,
  toDate: string,
): Promise<ActionResult> {
  const userId = await requireUserId();
  const n = await copyPlanDay(db, userId, weekStart, fromDate, toDate);
  revalidatePlanner();
  return { ok: true, message: n === 0 ? "Nothing to copy" : `Copied ${n} item${n === 1 ? "" : "s"}` };
}

/** Stamp one meal into `slot` across many days (the keystone "paint" gesture). */
export async function paintMealAcrossDaysAction(
  weekStart: string,
  mealId: string,
  portions: number,
  slot: PlanSlot,
  dates: string[],
): Promise<ActionResult> {
  if (!(portions > 0)) return { ok: false, message: "Please enter valid portions" };
  if (!dates.length) return { ok: false, message: "Pick at least one day" };
  const userId = await requireUserId();
  const n = await paintMealAcrossDays(db, userId, weekStart, mealId, portions, slot, dates);
  revalidatePlanner();
  return { ok: true, message: `Stamped on ${n} day${n === 1 ? "" : "s"}` };
}

/** Clear all planned items from a day. */
export async function clearPlanDayAction(planDate: string): Promise<ActionResult> {
  const userId = await requireUserId();
  const n = await clearPlanDay(db, userId, planDate);
  revalidatePlanner();
  return { ok: true, message: n === 0 ? "Day already empty" : `Cleared ${n} item${n === 1 ? "" : "s"}` };
}

// ============= Apply (plan → log) — TODAY ONLY =============

export interface ApplyResult extends ActionResult {
  applied: number;
  skipped: number;
}

/**
 * Materialise today's planned items into the daily log. Optionally limited to a
 * single slot. The date is ALWAYS the server's today — you can only apply what
 * you've actually eaten, never a past day from memory or an unlived future day.
 *
 * Idempotent: items already applied (a food_entries row references them) are
 * skipped. Non-destructive: manually-logged food is never considered or touched,
 * because each item is materialised through the normal add*EntryAction path
 * (load day → push → saveDailyEntry), which preserves existing rows.
 */
export async function applyPlanDayAction(slot?: PlanSlot): Promise<ApplyResult> {
  const userId = await requireUserId();
  const today = todayIso();
  const weekStart = mondayOf(today);
  const plan = await loadWeekPlan(db, userId, weekStart);

  const due = plan.items.filter(
    (it) => it.plan_date === today && !it.applied && (!slot || it.slot === slot),
  );

  let applied = 0;
  let skipped = 0;
  for (const item of due) {
    const provenance = { source: "plan" as const, planItemId: item.id };
    const res =
      item.ref.kind === "meal"
        ? await addMealEntryAction(today, item.ref.meal_id, item.ref.portions, provenance)
        : await addFoodEntryAction(
            today,
            item.ref.food_id,
            (item.ref.weight_g ?? item.ref.quantity) as number,
            provenance,
          );
    if (res.ok) applied++;
    else skipped++;
  }

  revalidatePath("/planner");
  const total = due.length;
  return {
    ok: true,
    applied,
    skipped,
    message:
      total === 0
        ? "Nothing new to log for today"
        : `Logged ${applied} item${applied === 1 ? "" : "s"} for today`,
  };
}
