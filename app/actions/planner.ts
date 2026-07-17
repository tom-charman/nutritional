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
  clearPlanWeek,
  copyPlanDay,
  deletePlanItem,
  dismissPlanItem,
  getFoodItem,
  getMeal,
  getPlanItem,
  loadWeekPlan,
  savePlanItem,
  updatePlanItemAmount,
} from "@/lib/data/storage";
import { requireUserId } from "@/lib/data/user";
import { mondayOf } from "@/lib/domain/plan/week";
import { FLAT_SLOT } from "@/lib/domain/types";
import { addFoodEntryAction, addMealEntryAction, type ActionResult } from "@/app/actions/entry";

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Upper bound on a planned amount (portions/grams/count) — a fat-fingered
 *  quantity shouldn't silently skew the whole week's averages. */
const MAX_PLAN_AMOUNT = 100_000;

function revalidatePlanner(): void {
  revalidatePath("/planner");
}

// ============= Plan CRUD (no log side-effects) =============

/**
 * Add one meal or food to a plan across one or more days — the single add path
 * behind the planner's add panel (it replaced the old per-cell adds and the
 * Stamp gesture). `optionKey` is the combobox value: "meal:<id>" or "food:<id>".
 * `amount` is portions/grams/item-count for a meal (per its yield mode), or
 * grams/item-count for a food.
 */
export async function addPlanItemsAcrossDaysAction(
  weekStart: string,
  dates: string[],
  optionKey: string,
  amount: number,
): Promise<ActionResult> {
  if (!dates.length) return { ok: false, message: "Pick at least one day" };
  if (!(amount > 0)) return { ok: false, message: "Please enter an amount" };
  if (amount > MAX_PLAN_AMOUNT) {
    return { ok: false, message: "That amount looks too large — check the value" };
  }
  const userId = await requireUserId();

  if (optionKey.startsWith("meal:")) {
    const mealId = optionKey.slice(5);
    const meal = await getMeal(db, userId, mealId);
    if (!meal) return { ok: false, message: "Recipe not found" };
    // Store the amount in the column matching the meal's yield mode (portions /
    // weight_g / quantity) — the read side derives the scaling factor from it.
    const amountCols = {
      portions: meal.yield_mode === "whole" ? amount : null,
      weightG: meal.yield_mode === "by_weight" ? amount : null,
      quantity: meal.yield_mode === "by_count" ? amount : null,
    };
    for (const planDate of dates) {
      await savePlanItem(db, userId, { weekStart, planDate, slot: FLAT_SLOT, mealId, ...amountCols });
    }
  } else if (optionKey.startsWith("food:")) {
    const foodId = optionKey.slice(5);
    const food = await getFoodItem(db, userId, foodId);
    if (!food) return { ok: false, message: "Food item not found" };
    const isPerItem = food.unit_type === "per_item";
    for (const planDate of dates) {
      await savePlanItem(db, userId, {
        weekStart,
        planDate,
        slot: FLAT_SLOT,
        foodId,
        weightG: isPerItem ? null : amount,
        quantity: isPerItem ? amount : null,
      });
    }
  } else {
    return { ok: false, message: "Unknown item" };
  }

  revalidatePlanner();
  const n = dates.length;
  return { ok: true, message: `Added to ${n} day${n === 1 ? "" : "s"}` };
}

/** Edit a planned item's amount (portions for a meal, grams/count for a food). */
export async function editPlanItemAmountAction(
  itemId: string,
  newAmount: number,
): Promise<ActionResult> {
  if (!(newAmount > 0)) return { ok: false, message: "Please enter a valid amount" };
  if (newAmount > MAX_PLAN_AMOUNT) {
    return { ok: false, message: "That amount looks too large — check the value" };
  }
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

/**
 * Dismiss a planned item's entry-page "ghost" suggestion — persisted, so it
 * stays hidden on that day across reloads and other devices (the plan itself is
 * unchanged). The one-click suggestion is the only bridge from plan to log.
 */
export async function dismissPlanSuggestionAction(itemId: string): Promise<ActionResult> {
  const userId = await requireUserId();
  const ok = await dismissPlanItem(db, userId, itemId);
  if (!ok) return { ok: false, message: "Planned item not found" };
  revalidatePath("/entry");
  revalidatePlanner();
  return { ok: true, message: "Suggestion dismissed" };
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
  return n === 0
    ? { ok: true, tone: "info", message: "Nothing to copy" }
    : { ok: true, message: `Copied ${n} item${n === 1 ? "" : "s"}` };
}

/** Clear all planned items from a day. */
export async function clearPlanDayAction(planDate: string): Promise<ActionResult> {
  const userId = await requireUserId();
  const n = await clearPlanDay(db, userId, planDate);
  revalidatePlanner();
  return n === 0
    ? { ok: true, tone: "info", message: "Day already empty" }
    : { ok: true, message: `Cleared ${n} item${n === 1 ? "" : "s"}` };
}

/** Clear every planned item across a week. */
export async function clearPlanWeekAction(weekStart: string): Promise<ActionResult> {
  const userId = await requireUserId();
  const n = await clearPlanWeek(db, userId, weekStart);
  revalidatePlanner();
  return n === 0
    ? { ok: true, tone: "info", message: "Week already empty" }
    : { ok: true, message: `Cleared ${n} item${n === 1 ? "" : "s"}` };
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
export async function applyPlanDayAction(slot?: string): Promise<ApplyResult> {
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
        ? await addMealEntryAction(today, item.ref.meal_id, item.ref.consumed_amount, provenance)
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

/**
 * Materialise ONE planned item into the log — the daily-entry "ghost suggestion"
 * one-click add. Logs to the item's own plan_date (which the entry page only ever
 * shows for today-or-past), guarded so a future day can't be logged. Idempotent:
 * an already-applied item is a no-op.
 */
export async function applyPlanItemAction(itemId: string): Promise<ActionResult> {
  const userId = await requireUserId();
  const item = await getPlanItem(db, userId, itemId);
  if (!item) return { ok: false, message: "Planned item not found" };
  if (item.applied) return { ok: true, message: "Already logged" };
  if (item.plan_date > todayIso()) {
    return { ok: false, message: "You can only log a planned day once it arrives" };
  }
  const provenance = { source: "plan" as const, planItemId: item.id };
  const name = item.ref.kind === "meal" ? item.ref.meal_name : item.ref.food_name;
  const res =
    item.ref.kind === "meal"
      ? await addMealEntryAction(item.plan_date, item.ref.meal_id, item.ref.consumed_amount, provenance)
      : await addFoodEntryAction(
          item.plan_date,
          item.ref.food_id,
          (item.ref.weight_g ?? item.ref.quantity) as number,
          provenance,
        );
  if (!res.ok) return res;
  revalidatePath("/planner");
  return { ok: true, message: `Added ${name}` };
}
