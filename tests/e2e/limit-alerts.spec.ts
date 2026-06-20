import { expect, test } from "@playwright/test";
import { EntryPage } from "./pages/entry";
import { FoodsPage } from "./pages/foods";
import { MealsPage } from "./pages/meals";
import { E2E_DATES, shot } from "./pages/helpers";

const DATE = E2E_DATES.spare2;

/**
 * Feature #3 — the live preview must warn BEFORE committing when an entry
 * would push the day over a limit (salt/sugar/sat-fat), so a cap is never
 * crossed silently. Salt's default cap is 6g.
 */
test.describe("real-time limit alerts in the entry preview", () => {
  test.beforeEach(async ({ page }) => {
    const foods = new FoodsPage(page);
    await foods.goto();
    // 10g salt per 100g → 100g alone (10g) blows past the 6g cap.
    await foods.createFood({
      name: "E2E Salt Bomb",
      nutrients: { "Calories (kcal)": 50, "Salt (g)": 10 },
    });
    // Shared test DB: the food survives across tests/runs — tolerate reuse.
    await expect(foods.alert).toContainText(/saved successfully|already exists/);
  });

  test("breaching amount raises a quantified warning before adding", async ({ page }) => {
    const entry = new EntryPage(page);
    await entry.goto(DATE);
    await entry.selectFood("E2E Salt Bomb");
    await entry.amountInput.fill("100"); // 10g salt vs 6g cap → exceeded

    const alert = entry.nutrientPreview.locator(".preview-limit-alert");
    await expect(alert).toBeVisible();
    await expect(alert).toHaveClass(/target-exceeded/);
    await expect(alert).toContainText(/over your salt limit/i);
    await expect(alert).toContainText("67%"); // (10/6 - 1) → 67%
    await shot(page, "limit-alerts", "01-exceeded-before-add");
  });

  test("alert clears once the amount is back within the limit", async ({ page }) => {
    const entry = new EntryPage(page);
    await entry.goto(DATE);
    await entry.selectFood("E2E Salt Bomb");

    await entry.amountInput.fill("100"); // 10g salt → alert shown
    await expect(entry.nutrientPreview.locator(".preview-limit-alert")).toBeVisible();

    await entry.amountInput.fill("30"); // 3g salt < 6g cap → no alert
    await expect(entry.nutrientPreview.locator(".preview-limit-alert")).toHaveCount(0);
  });

  test("no daily-limit alert in the meal composer (templates aren't a day)", async ({
    page,
  }) => {
    const meals = new MealsPage(page);
    await meals.goto();
    await meals.foodSearch.click();
    await meals.foodSearch.fill("E2E Salt Bomb");
    await meals.comboOption("E2E Salt Bomb").click();
    await meals.amountInput.fill("200"); // 20g salt — would breach a day, but this is a template
    await expect(page.locator(".nutrient-preview-card .preview-limit-alert")).toHaveCount(0);
  });
});
