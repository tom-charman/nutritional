import { expect, test } from "@playwright/test";
import { EntryPage } from "./pages/entry";
import { FoodsPage } from "./pages/foods";
import { E2E_DATES, expectToast, shot } from "./pages/helpers";

// Fast repeat-logging cluster: recents in the selector, copy-yesterday, swap-food.
const SRC = E2E_DATES.spare; // 2024-01-18 — "yesterday"
const DST = E2E_DATES.spare2; // 2024-01-19 — copy target (default source = SRC)

test.describe("fast repeat-logging", () => {
  test("create fixture foods", async ({ page }) => {
    const foods = new FoodsPage(page);
    await foods.goto();
    await foods.createFood({
      name: "E2E Lentils",
      nutrients: { "Calories (kcal)": 116, "Protein (g)": 9, "Carbs (g)": 20, "Fibre (g)": 8 },
    });
    await expect(foods.alert).toContainText("saved successfully");
    await foods.createFood({
      name: "E2E Quinoa",
      nutrients: { "Calories (kcal)": 120, "Protein (g)": 4.4, "Carbs (g)": 21, "Fibre (g)": 2.8 },
    });
    await expect(foods.alert).toContainText("saved successfully");
  });

  test("recents pin a just-logged food atop the selector", async ({ page }) => {
    const entry = new EntryPage(page);
    await entry.goto(SRC);
    await entry.addFood("E2E Lentils", 100, /E2E Lentils \(per 100g\)/);
    await expectToast(page, "Added E2E Lentils");

    // reopen the selector: the food we just logged now appears under "Recent"
    await entry.goto(SRC);
    await entry.searchInput.click();
    await expect(entry.comboSectionHeader("Recent")).toBeVisible();
    await shot(page, "fast-logging", "01-recents-section");
  });

  test("copy yesterday clones the source day into an empty day", async ({ page }) => {
    const entry = new EntryPage(page);
    // SRC already has E2E Lentils from the previous test; add a second item.
    await entry.goto(SRC);
    await entry.addFood("E2E Quinoa", 150, /E2E Quinoa \(per 100g\)/);
    await expectToast(page, "Added E2E Quinoa");

    await entry.goto(DST);
    await expect(entry.entryRow("E2E Lentils")).toHaveCount(0);
    await entry.copyYesterdayButton.click();
    await expectToast(page, /Copied 2 entries from 2024-01-18/);
    await expect(entry.entryRow("E2E Lentils")).toBeVisible();
    await expect(entry.entryRow("E2E Quinoa")).toBeVisible();
    await shot(page, "fast-logging", "02-copied-day");

    // independence: deleting a copied row must not touch the source day
    await entry.removeEntry(entry.entryRow("E2E Lentils"));
    await expectToast(page, "Entry removed");
    await entry.goto(SRC);
    await expect(entry.entryRow("E2E Lentils")).toBeVisible();
  });

  test("swap a logged food in place, recomputing calories", async ({ page }) => {
    const entry = new EntryPage(page);
    await entry.goto(DST); // has E2E Quinoa (150g → 180 kcal) after the copy test
    const row = entry.entryRow("E2E Quinoa");
    await expect(row).toBeVisible();

    await entry.swapFood(row, "E2E Lentils", /E2E Lentils \(per 100g\)/);
    await expectToast(page, "Swapped to E2E Lentils");

    // amount (150g) preserved, nutrients recomputed: 116 × 1.5 = 174 kcal
    const swapped = entry.entryRow("E2E Lentils");
    await expect(swapped).toBeVisible();
    await expect(swapped).toContainText("174 kcal");
    await expect(entry.entryRow("E2E Quinoa")).toHaveCount(0);
    await shot(page, "fast-logging", "03-swapped");
  });
});
