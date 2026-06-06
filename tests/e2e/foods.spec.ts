import { expect, test } from "@playwright/test";
import { FoodsPage } from "./pages/foods";
import { EntryPage } from "./pages/entry";
import { E2E_DATES, expectToast, shot } from "./pages/helpers";

test.describe("food database", () => {
  test("create a per-100g food", async ({ page }) => {
    const foods = new FoodsPage(page);
    await foods.goto();
    await shot(page, "foods", "01-list");
    await foods.createFood({
      name: "E2E Yoghurt",
      nutrients: { "Calories (kcal)": 59, "Protein (g)": 10, "Sugar (g)": 3.2 },
    });
    await expect(foods.alert).toContainText("'E2E Yoghurt' saved successfully");
    await foods.searchInput.fill("E2E Yoghurt");
    await expect(foods.listItem("E2E Yoghurt")).toBeVisible();
  });

  test("per-item requires serving size", async ({ page }) => {
    const foods = new FoodsPage(page);
    await foods.goto();
    await foods.newFoodButton.click();
    await foods.nameInput.fill("E2E Egg");
    await foods.unitRadio("Per Item").check();
    // serving size left empty
    await foods.saveButton.click();
    await expect(foods.alert).toContainText("Serving size is required");
    await shot(page, "foods", "02-validation-error");
    // fix it
    await foods.servingSizeInput.fill("60");
    await foods.nutrientInput("Calories (kcal)").fill("78");
    await foods.saveButton.click();
    await expect(foods.alert).toContainText("saved successfully");
  });

  test("name is required", async ({ page }) => {
    const foods = new FoodsPage(page);
    await foods.goto();
    await foods.newFoodButton.click();
    await foods.saveButton.click();
    await expect(foods.alert).toContainText("Please enter a food name");
  });

  test("edit an existing food", async ({ page }) => {
    const foods = new FoodsPage(page);
    await foods.goto();
    await foods.searchInput.fill("E2E Yoghurt");
    await foods.listItem("E2E Yoghurt").click();
    await expect(foods.nameInput).toHaveValue("E2E Yoghurt");
    await foods.nutrientInput("Calories (kcal)").fill("61");
    await foods.saveButton.click();
    await expect(foods.alert).toContainText("saved successfully");
    // re-open and verify persisted
    await foods.searchInput.fill("E2E Yoghurt");
    await foods.listItem("E2E Yoghurt").click();
    await expect(foods.nutrientInput("Calories (kcal)")).toHaveValue("61");
  });

  test("live search filters the list", async ({ page }) => {
    const foods = new FoodsPage(page);
    await foods.goto();
    await foods.searchInput.fill("E2E Egg");
    await expect(foods.listItem("E2E Egg")).toBeVisible();
    await expect(foods.page.locator(".master-list-item")).toHaveCount(1);
    await foods.searchInput.fill("zzz-no-such-food");
    await expect(foods.page.locator(".master-list-item")).toHaveCount(0);
    await expect(
      foods.page.locator(".master-list .empty-state-message"),
    ).toBeVisible();
  });

  test("delete an unused food", async ({ page }) => {
    const foods = new FoodsPage(page);
    await foods.goto();
    await foods.searchInput.fill("E2E Egg");
    await foods.listItem("E2E Egg").locator(".delete-icon").click();
    await expectDeleted(foods, "E2E Egg");
  });

  test("deleting a referenced food shows a friendly error", async ({ page }) => {
    // reference E2E Yoghurt from a day entry first
    const entry = new EntryPage(page);
    await entry.goto(E2E_DATES.spare);
    await entry.addFood("E2E Yoghurt", 150);
    await expectToast(page, "Added E2E Yoghurt");

    const foods = new FoodsPage(page);
    await foods.goto();
    await foods.searchInput.fill("E2E Yoghurt");
    await foods.listItem("E2E Yoghurt").locator(".delete-icon").click();
    await expect(foods.alert).toContainText("Cannot delete");
    await shot(page, "foods", "03-referenced-delete-error");
    // food still there
    await expect(foods.listItem("E2E Yoghurt")).toBeVisible();
  });
});

async function expectDeleted(foods: FoodsPage, name: string) {
  await expect(foods.alert).toContainText("Food deleted");
  await expect(foods.page.locator(".master-list-item").filter({ hasText: name })).toHaveCount(0);
}
