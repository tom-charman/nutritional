import { expect, test } from "@playwright/test";
import { EntryPage } from "./pages/entry";
import { FoodsPage } from "./pages/foods";
import { E2E_DATES, expectToast, shot } from "./pages/helpers";

const DATE = E2E_DATES.mistakes;

test.describe("mistakes and rectification", () => {
  test("fixture", async ({ page }) => {
    const foods = new FoodsPage(page);
    await foods.goto();
    await foods.createFood({
      name: "E2E Rice",
      nutrients: { "Calories (kcal)": 130, "Carbs (g)": 28, "Protein (g)": 2.7 },
    });
    await expect(foods.alert).toContainText("saved successfully");
  });

  test("added the wrong food → delete it", async ({ page }) => {
    const entry = new EntryPage(page);
    await entry.goto(DATE);
    await entry.addFood("E2E Rice", 100);
    await expectToast(page, "Added E2E Rice");
    await expect(entry.entryRow("E2E Rice")).toBeVisible();

    await entry.removeEntry(entry.entryRow("E2E Rice"));
    await expectToast(page, "Entry removed");
    await expect(entry.entryRow("E2E Rice")).toHaveCount(0);
    await shot(page, "mistakes", "01-after-delete");
  });

  test("typo'd amount → inline edit via Enter", async ({ page }) => {
    const entry = new EntryPage(page);
    await entry.goto(DATE);
    await entry.addFood("E2E Rice", 400); // oops, meant 40
    await expectToast(page, "Added E2E Rice");
    await expect(entry.entryRow("E2E Rice")).toContainText("520 kcal");

    await entry.editEntryAmount(entry.entryRow("E2E Rice"), 40, "enter");
    await expectToast(page, "Updated E2E Rice");
    await expect(entry.entryRow("E2E Rice")).toContainText("52 kcal");
    await expect(entry.entryRow("E2E Rice")).toContainText("40 g");
    await shot(page, "mistakes", "02-after-edit");
  });

  test("inline edit commits on blur too", async ({ page }) => {
    const entry = new EntryPage(page);
    await entry.goto(DATE);
    await entry.editEntryAmount(entry.entryRow("E2E Rice"), 80, "blur");
    await expectToast(page, "Updated E2E Rice");
    await expect(entry.entryRow("E2E Rice")).toContainText("104 kcal");
  });

  test("Escape cancels an inline edit", async ({ page }) => {
    const entry = new EntryPage(page);
    await entry.goto(DATE);
    await entry.editEntryAmount(entry.entryRow("E2E Rice"), 999, "escape");
    // value unchanged
    await expect(entry.entryRow("E2E Rice")).toContainText("80 g");
    await expect(entry.entryRow("E2E Rice")).toContainText("104 kcal");
  });

  test("rapid double-click Add produces exactly one entry", async ({ page }) => {
    const entry = new EntryPage(page);
    await entry.goto(DATE);
    await entry.selectFood("E2E Rice");
    await entry.amountInput.fill("55");
    // two clicks as fast as playwright can issue them
    await entry.addButton.click();
    await entry.addButton.click({ force: true }).catch(() => {});
    await expectToast(page, "Added E2E Rice");
    await entry.goto(DATE); // hard reload — count persisted rows
    await expect(
      entry.entriesList.locator(".ingredient-item").filter({ hasText: "55 g" }),
    ).toHaveCount(1);
  });
});
