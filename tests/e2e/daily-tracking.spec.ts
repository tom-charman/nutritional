import { expect, test } from "@playwright/test";
import { EntryPage } from "./pages/entry";
import { FoodsPage } from "./pages/foods";
import { E2E_DATES, expectToast, shot } from "./pages/helpers";

const DATE = E2E_DATES.tracking;

test.describe("daily tracking happy path", () => {
  test("create fixture foods", async ({ page }) => {
    const foods = new FoodsPage(page);
    await foods.goto();
    await foods.createFood({
      name: "E2E Oats",
      nutrients: { "Calories (kcal)": 389, "Fat (g)": 6.9, "Carbs (g)": 66.3, "Protein (g)": 16.9, "Fibre (g)": 10.6 },
    });
    await expect(foods.alert).toContainText("saved successfully");
    await foods.createFood({
      name: "E2E Banana",
      perItem: { servingSizeG: 118 },
      nutrients: { "Calories (kcal)": 105, "Carbs (g)": 27, "Sugar (g)": 14.4, "Protein (g)": 1.3 },
    });
    await expect(foods.alert).toContainText("saved successfully");
  });

  test("add per-100g food with live preview", async ({ page }) => {
    const entry = new EntryPage(page);
    await entry.goto(DATE);
    await shot(page, "daily-tracking", "01-empty-day");

    await entry.selectFood("E2E Oats", /E2E Oats \(per 100g\)/);
    await entry.amountInput.fill("60");
    // live nutrient preview shows scaled values: 389 * 0.6 = 233.4
    await expect(entry.nutrientPreview).toBeVisible();
    await expect(entry.nutrientPreview).toContainText("233.4 kcal");
    await shot(page, "daily-tracking", "02-preview");

    await entry.addButton.click();
    await expectToast(page, "Added E2E Oats");
    await expect(entry.entryRow("E2E Oats")).toBeVisible();
    await expect(entry.entryRow("E2E Oats")).toContainText("233 kcal");
    // focus returns to the search for the next item
    await expect(entry.searchInput).toBeFocused();
    await shot(page, "daily-tracking", "03-first-entry");
  });

  test("add per-item food and verify summary math", async ({ page }) => {
    const entry = new EntryPage(page);
    await entry.goto(DATE);

    await entry.selectFood("E2E Banana", /E2E Banana \(per item/);
    await entry.amountInput.fill("1.5");
    await expect(entry.nutrientPreview).toContainText("157.5 kcal");
    await entry.addButton.click();
    await expectToast(page, "Added E2E Banana");

    // totals: 233.4 + 157.5 = 390.9 → header shows rounded 391
    await expect(entry.headerSummary).toContainText("391 / 2000 kcal");
    // calories remaining: 2000 - 390.9 = 1609.1 → 1609
    await expect(entry.caloriesRemaining).toHaveText("1609");
    // macro bar fat: 60g oats = 4.1g fat
    await expect(entry.macroBar("Fat").locator(".macro-bar-value")).toContainText("4.1g");
    await shot(page, "daily-tracking", "04-two-entries");
  });

  test("entries persist across reload", async ({ page }) => {
    const entry = new EntryPage(page);
    await entry.goto(DATE);
    await expect(entry.entryRow("E2E Oats")).toBeVisible();
    await expect(entry.entryRow("E2E Banana")).toBeVisible();
    await expect(entry.caloriesRemaining).toHaveText("1609");
  });
});
