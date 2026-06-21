import { expect, test, type Page } from "@playwright/test";
import { FoodsPage } from "./pages/foods";
import { MealsPage } from "./pages/meals";
import { expectToast, shot } from "./pages/helpers";

/**
 * Weekly Planner. A plan is intent, separate from the log. Key things to prove:
 *  - compose (Stamp mode): load a meal, stamp it across the week in one gesture,
 *  - the planner NEVER logs — no apply/“Log” controls live here,
 *  - planned items reach the log only as ghost suggestions on the ENTRY screen,
 *    added with one click.
 *
 * Planner CRUD runs on a deterministic FUTURE week (no log writes). The ghost
 * flow runs on the current week → today (reset-db cleans planner + log residue by
 * E2E food/meal reference, so the today writes don't linger).
 */
const FUTURE_MONDAY = "2027-01-04"; // a fixed far-future Monday

function todayMondayIso(): string {
  const iso = new Date().toISOString().slice(0, 10);
  const day = new Date(`${iso}T00:00:00Z`).getUTCDay();
  const back = (day + 6) % 7;
  return new Date(Date.parse(`${iso}T00:00:00Z`) - back * 86_400_000).toISOString().slice(0, 10);
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

  test("compose (Stamp mode) stamps a meal across the whole week's slot", async ({ page }) => {
    await gotoPlanner(page, FUTURE_MONDAY);

    await page.getByTestId("compose-toggle").click();
    await expect(page.getByTestId("stamp-chit")).toBeVisible();

    // Load the stamp, then stamp the whole week's Lunch in one press.
    await page.getByTestId("stamp-meal").click();
    await page.getByText("E2E Plan Lunch", { exact: true }).click();
    await page.getByTestId("stamp-allweek-lunch").click();
    await expectToast(page, /Stamped on 7 days/);

    for (const i of [0, 1, 2, 3, 4, 5, 6]) {
      const lunch = page.getByTestId(`planner-day-${i}`).locator('.planner-slot[data-slot="lunch"]');
      await expect(lunch.getByTestId("plan-item")).toContainText("E2E Plan Lunch");
    }

    // Brand: weekly readout carries the nutrient pigment system; meals read as portions.
    await page.getByTestId("compose-toggle").click(); // Done composing
    await expect(page.locator(".planner-week-summary .planner-nutrient-dot").first()).toBeVisible();
    await expect(
      page.getByTestId("planner-day-0").locator('.planner-slot[data-slot="lunch"]').getByTestId("plan-item").first(),
    ).toContainText(/portion/);
    await shot(page, "planner", "01-stamped-week");
  });

  test("edit amount; copy + clear a day via the day kebab (no button footer)", async ({ page }) => {
    await gotoPlanner(page, FUTURE_MONDAY);
    const tue = page.getByTestId("planner-day-1");

    // Inline-edit Tuesday's lunch portions.
    await tue.locator('.planner-slot[data-slot="lunch"] .ingredient-weight.editable').first().click();
    await page.locator(".inline-edit-input").fill("2");
    await page.locator(".inline-edit-input").press("Enter");
    await expectToast(page, "Updated");

    // Clear Tuesday via its kebab (actions live in a menu, not a footer of buttons).
    await tue.getByTestId("day-menu-1").click();
    await page.getByRole("menuitem", { name: "Clear day" }).click();
    await expectToast(page, /Cleared/);
    await expect(tue.locator('.planner-slot[data-slot="lunch"]').getByTestId("plan-item")).toHaveCount(0);

    // Copy Monday back onto Tuesday via the kebab.
    await tue.getByTestId("day-menu-1").click();
    await page.getByRole("menuitem", { name: /Copy from Mon/ }).click();
    await expectToast(page, /Copied/);
    await expect(tue.locator('.planner-slot[data-slot="lunch"]').getByTestId("plan-item")).toHaveCount(1);
  });

  test("planner never logs; entry shows a ghost suggestion added in one click", async ({ page }) => {
    const week = todayMondayIso();
    await gotoPlanner(page, week);

    // No apply/“Log” affordance exists anywhere on the planner.
    await expect(page.getByTestId("apply-day")).toHaveCount(0);
    await expect(page.locator(".planner-slot-apply")).toHaveCount(0);

    // Plan a meal onto TODAY's lunch via the cell's own picker.
    const today = page.locator(".planner-day.today");
    await expect(today).toHaveCount(1);
    const todayLunch = today.locator('.planner-slot[data-slot="lunch"]');
    await todayLunch.getByText("+ add").click();
    await page.getByText("E2E Plan Lunch", { exact: true }).click();
    await expectToast(page, "Added to plan");

    // On the entry screen the plan surfaces as a ghost suggestion.
    await page.goto("/entry");
    const ghost = page.locator(".ghost-row").filter({ hasText: "E2E Plan Lunch" });
    await expect(ghost).toBeVisible();
    await shot(page, "planner", "02-entry-ghost");

    // One click inks it into the log; the ghost is gone (now logged) and a toast confirms.
    await ghost.locator(".ghost-add").click();
    await expectToast(page, /Added E2E Plan Lunch/);
    await expect(page.locator(".ghost-row").filter({ hasText: "E2E Plan Lunch" })).toHaveCount(0);
    await expect(page.getByText("E2E Plan Lunch").first()).toBeVisible();
  });
});
