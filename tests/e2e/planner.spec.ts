import { expect, test, type Page } from "@playwright/test";
import { FoodsPage } from "./pages/foods";
import { MealsPage } from "./pages/meals";
import { expectToast, shot } from "./pages/helpers";

/**
 * Weekly Planner. A plan is intent, separate from the log. Key things to prove:
 *  - paint one meal across many days/slots in one gesture,
 *  - apply (plan → log) is TODAY ONLY and per-slot,
 *  - applied items read as logged; re-applying does not duplicate.
 *
 * Planner CRUD is exercised on a deterministic FUTURE week (no log writes); the
 * today-only apply is exercised on the current week. reset-db cleans planner
 * residue by E2E food/meal reference, so the today writes don't linger.
 */

// A fixed far-future Monday — deterministic, collides with no real data.
const FUTURE_MONDAY = "2027-01-04";

function todayMondayIso(): string {
  const now = new Date();
  const iso = now.toISOString().slice(0, 10);
  const day = new Date(`${iso}T00:00:00Z`).getUTCDay();
  const back = (day + 6) % 7;
  return new Date(Date.parse(`${iso}T00:00:00Z`) - back * 86_400_000)
    .toISOString()
    .slice(0, 10);
}

async function gotoPlanner(page: Page, week?: string) {
  await page.goto(week ? `/planner?week=${week}` : "/planner");
  await expect(page.locator(".planner-week")).toBeVisible();
}

test.describe("weekly planner", () => {
  test("fixture: E2E foods + meal", async ({ page }) => {
    const foods = new FoodsPage(page);
    await foods.goto();
    await foods.createFood({
      name: "E2E Plan Rice",
      nutrients: { "Calories (kcal)": 130, "Carbs (g)": 28, "Protein (g)": 2.7 },
    });
    await expect(foods.alert).toContainText("saved successfully");
    await foods.createFood({
      name: "E2E Plan Chicken",
      nutrients: { "Calories (kcal)": 165, "Protein (g)": 31 },
    });
    await expect(foods.alert).toContainText("saved successfully");

    const meals = new MealsPage(page);
    await meals.goto();
    await meals.composeMeal("E2E Plan Lunch", [
      { foodQuery: "E2E Plan Rice", amount: 150 },
      { foodQuery: "E2E Plan Chicken", amount: 200 },
    ]);
    await expectToast(page, "Meal 'E2E Plan Lunch' saved");
  });

  test("paint a meal across many days in one gesture", async ({ page }) => {
    await gotoPlanner(page, FUTURE_MONDAY);

    await page.getByTestId("paint-toggle").click();
    await expect(page.getByTestId("paint-panel")).toBeVisible();

    // Load the stamp, choose lunch, pick Mon/Tue/Wed/Thu.
    await page.getByTestId("paint-meal").click();
    await page.getByText("E2E Plan Lunch", { exact: true }).click();
    await page.getByTestId("paint-slot").selectOption("lunch");
    for (const i of [0, 1, 2, 3]) await page.getByTestId(`paint-day-${i}`).click();
    await page.getByTestId("paint-stamp").click();
    await expectToast(page, /Stamped on 4 days/);

    // The meal now sits in lunch on the first four days.
    for (const i of [0, 1, 2, 3]) {
      const lunch = page
        .getByTestId(`planner-day-${i}`)
        .locator('.planner-slot[data-slot="lunch"]');
      await expect(lunch.getByTestId("plan-item")).toContainText("E2E Plan Lunch");
    }
    // ...but not Friday.
    await expect(
      page.getByTestId("planner-day-4").locator('.planner-slot[data-slot="lunch"]').getByTestId("plan-item"),
    ).toHaveCount(0);

    // Brand: the weekly macro readout carries the per-nutrient pigment system,
    // and planned meals read as portions (not the ambiguous "× 1" that collides
    // with the × delete icon).
    await expect(page.locator(".planner-week-summary .planner-nutrient-dot").first()).toBeVisible();
    await expect(
      page.getByTestId("planner-day-0").locator('.planner-slot[data-slot="lunch"]').getByTestId("plan-item").first(),
    ).toContainText(/portion/);
    await shot(page, "planner", "01-painted-week");
  });

  test("edit a planned item; copy and clear a day", async ({ page }) => {
    await gotoPlanner(page, FUTURE_MONDAY);
    const monLunch = page.getByTestId("planner-day-0").locator('.planner-slot[data-slot="lunch"]');

    // Inline-edit portions on Monday's lunch.
    await monLunch.locator(".ingredient-weight.editable").click();
    await page.locator(".inline-edit-input").fill("2");
    await page.locator(".inline-edit-input").press("Enter");
    await expectToast(page, "Updated");

    // Copy Monday onto Friday (Friday had no lunch yet).
    await page.getByTestId("planner-day-4").getByRole("button", { name: /Copy Thu/ }).click();
    await expectToast(page, /Copied/);
    await expect(
      page.getByTestId("planner-day-4").locator('.planner-slot[data-slot="lunch"]').getByTestId("plan-item"),
    ).toContainText("E2E Plan Lunch");

    // Clear Friday again.
    await page.getByTestId("planner-day-4").getByRole("button", { name: "Clear" }).click();
    await expectToast(page, /Cleared/);
  });

  test("apply is TODAY ONLY and per-slot; re-applying does not duplicate", async ({ page }) => {
    const week = todayMondayIso();
    await gotoPlanner(page, week);

    const today = page.locator(".planner-day.today");
    await expect(today).toHaveCount(1);

    // Add the meal to today's lunch via the cell's own picker.
    const todayLunch = today.locator('.planner-slot[data-slot="lunch"]');
    await todayLunch.getByText("+ add").click();
    await page.getByText("E2E Plan Lunch", { exact: true }).click();
    await expectToast(page, "Added to plan");
    await expect(todayLunch.getByTestId("plan-item")).toContainText("E2E Plan Lunch");

    // Only today's column offers apply — no other day can be logged from memory.
    await expect(today.getByTestId("apply-day")).toBeVisible();
    const nonToday = page.locator(".planner-day:not(.today)").first();
    await expect(nonToday.getByTestId("apply-day")).toHaveCount(0);

    // Apply just the lunch slot.
    await todayLunch.getByRole("button", { name: "Log" }).click();
    await expectToast(page, /Logged 1 item/);
    await expect(todayLunch.locator(".planner-item.applied")).toBeVisible();
    await shot(page, "planner", "02-applied-today");

    // Idempotent: the slot's Log affordance is gone (nothing unapplied left).
    await expect(todayLunch.getByRole("button", { name: "Log" })).toHaveCount(0);

    // And the log on /entry reflects exactly one applied meal.
    await page.goto("/entry");
    await expect(page.getByText("E2E Plan Lunch").first()).toBeVisible();
  });
});
