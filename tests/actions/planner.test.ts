import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { createTestDb } from "../data/harness";
import type { DB } from "@/lib/data/storage";
import { loadDailyEntry, loadWeekPlan, savePlanItem, saveFoodItem } from "@/lib/data/storage";
import { mondayOf, weekDates } from "@/lib/domain/plan/week";
import type { FoodItem } from "@/lib/domain/types";

// See tests/actions/entry.test.ts for the rationale behind this mock stack.
vi.hoisted(() => {
  process.env.AUTH_DISABLED = "true";
  process.env.TEST_USER_EMAIL = "test@example.com";
  process.env.AUTHORIZED_EMAILS = "test@example.com";
});
const h = vi.hoisted(() => ({ db: undefined as unknown as DB }));
vi.mock("@/lib/db/client", () => ({
  get db() {
    return h.db;
  },
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth", () => {
  const parseAllowlist = (raw: string | undefined): Set<string> =>
    new Set(
      (raw ?? "")
        .split(",")
        .map((e) => e.trim().toLowerCase())
        .filter((e) => e.length > 0 && !e.startsWith("#")),
    );
  return {
    parseAllowlist,
    isAuthorizedEmail: (email: string | null | undefined) =>
      !!email && parseAllowlist(process.env.AUTHORIZED_EMAILS).has(email.trim().toLowerCase()),
    auth: async () => null,
  };
});

import { addFoodEntryAction } from "@/app/actions/entry";
import { applyPlanDayAction, applyPlanItemAction } from "@/app/actions/planner";

let close: () => Promise<void>;
let userId: string;

const TODAY = new Date().toISOString().slice(0, 10);
const WEEK = mondayOf(TODAY);
const OTHER_DAY = weekDates(WEEK).find((d) => d !== TODAY)!;

beforeAll(async () => {
  const t = await createTestDb();
  h.db = t.db;
  userId = t.userId;
  close = t.close;
});
afterAll(async () => {
  await close();
});

function makeFood(partial: Partial<FoodItem> = {}): FoodItem {
  return {
    id: randomUUID(),
    name: `Food-${randomUUID().slice(0, 8)}`,
    unit_type: "per_100g",
    serving_size_g: null,
    energy_kcal: 100,
    fat_g: 5,
    saturated_fat_g: 1,
    carbohydrates_g: 10,
    sugar_g: 2,
    protein_g: 8,
    fibre_g: 3,
    salt_g: 0.5,
    calcium_mg: 50,
    ...partial,
  };
}

describe("applyPlanDayAction — today only, idempotent, non-destructive", () => {
  it("applies today's items and never a different day (the philosophy guard)", async () => {
    const food = makeFood();
    await saveFoodItem(h.db, userId, food);
    await savePlanItem(h.db, userId, {
      weekStart: WEEK,
      planDate: TODAY,
      slot: "breakfast",
      foodId: food.id,
      weightG: 100,
    });
    await savePlanItem(h.db, userId, {
      weekStart: WEEK,
      planDate: OTHER_DAY,
      slot: "breakfast",
      foodId: food.id,
      weightG: 100,
    });

    const res = await applyPlanDayAction();
    expect(res.ok).toBe(true);
    expect(res.applied).toBe(1); // only today's item

    const plan = await loadWeekPlan(h.db, userId, WEEK);
    expect(plan.items.find((i) => i.plan_date === TODAY)!.applied).toBe(true);
    expect(plan.items.find((i) => i.plan_date === OTHER_DAY)!.applied).toBe(false);
    // The other day's log is untouched.
    expect(await loadDailyEntry(h.db, userId, OTHER_DAY)).toBeNull();
  });

  it("is idempotent — re-applying logs nothing new and does not duplicate", async () => {
    const before = (await loadDailyEntry(h.db, userId, TODAY))!.entries.length;
    const res = await applyPlanDayAction();
    expect(res.applied).toBe(0);
    const after = (await loadDailyEntry(h.db, userId, TODAY))!.entries.length;
    expect(after).toBe(before);
  });

  it("only applies the requested slot", async () => {
    const food = makeFood();
    await saveFoodItem(h.db, userId, food);
    await savePlanItem(h.db, userId, {
      weekStart: WEEK,
      planDate: TODAY,
      slot: "lunch",
      foodId: food.id,
      weightG: 100,
    });
    await savePlanItem(h.db, userId, {
      weekStart: WEEK,
      planDate: TODAY,
      slot: "dinner",
      foodId: food.id,
      weightG: 100,
    });

    const res = await applyPlanDayAction("lunch");
    expect(res.applied).toBe(1);

    const plan = await loadWeekPlan(h.db, userId, WEEK);
    expect(plan.items.find((i) => i.plan_date === TODAY && i.slot === "lunch")!.applied).toBe(true);
    expect(plan.items.find((i) => i.plan_date === TODAY && i.slot === "dinner")!.applied).toBe(false);
  });

  it("never touches manually-logged food", async () => {
    const manualFood = makeFood({ name: "Manual snack" });
    await saveFoodItem(h.db, userId, manualFood);
    await addFoodEntryAction(TODAY, manualFood.id, 100); // manual, no provenance

    const dayBefore = (await loadDailyEntry(h.db, userId, TODAY))!;
    const manualCount = dayBefore.entries.filter(
      (e) => e.kind === "food" && e.entry.source !== "plan",
    ).length;
    expect(manualCount).toBeGreaterThan(0);

    await applyPlanDayAction(); // apply remaining (dinner)

    const dayAfter = (await loadDailyEntry(h.db, userId, TODAY))!;
    const manualAfter = dayAfter.entries.filter(
      (e) => e.kind === "food" && e.entry.source !== "plan",
    ).length;
    expect(manualAfter).toBe(manualCount); // manual rows preserved
  });
});

describe("applyPlanItemAction — the ghost one-click add", () => {
  it("logs a single planned item to its day, idempotently", async () => {
    const food = makeFood();
    await saveFoodItem(h.db, userId, food);
    const itemId = await savePlanItem(h.db, userId, {
      weekStart: WEEK,
      planDate: TODAY,
      slot: "snack",
      foodId: food.id,
      weightG: 100,
    });

    const res = await applyPlanItemAction(itemId);
    expect(res.ok).toBe(true);
    const plan = await loadWeekPlan(h.db, userId, WEEK);
    expect(plan.items.find((i) => i.id === itemId)!.applied).toBe(true);

    // Idempotent: applying again is a no-op (no duplicate row).
    const day1 = (await loadDailyEntry(h.db, userId, TODAY))!.entries.length;
    const again = await applyPlanItemAction(itemId);
    expect(again.ok).toBe(true);
    const day2 = (await loadDailyEntry(h.db, userId, TODAY))!.entries.length;
    expect(day2).toBe(day1);
  });

  it("refuses to log a future planned day", async () => {
    const food = makeFood();
    await saveFoodItem(h.db, userId, food);
    const future = weekDates(mondayOf(TODAY)).find((d) => d > TODAY);
    if (!future) return; // today is Sunday — no future day this week; skip
    const itemId = await savePlanItem(h.db, userId, {
      weekStart: WEEK,
      planDate: future,
      slot: "lunch",
      foodId: food.id,
      weightG: 100,
    });
    const res = await applyPlanItemAction(itemId);
    expect(res.ok).toBe(false);
    expect(await loadDailyEntry(h.db, userId, future)).toBeNull();
  });
});
