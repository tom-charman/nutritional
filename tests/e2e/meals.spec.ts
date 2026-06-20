import { expect, test } from "@playwright/test";
import { EntryPage } from "./pages/entry";
import { FoodsPage } from "./pages/foods";
import { MealsPage } from "./pages/meals";
import { E2E_DATES, expectToast, shot } from "./pages/helpers";

const DATE = E2E_DATES.meals;

test.describe("meal entries", () => {
  test("fixture: foods + meal template (via the composer UI)", async ({ page }) => {
    const foods = new FoodsPage(page);
    await foods.goto();
    await foods.createFood({
      name: "E2E Meal Oats",
      nutrients: { "Calories (kcal)": 400, "Carbs (g)": 60, "Protein (g)": 15 },
    });
    await expect(foods.alert).toContainText("saved successfully");
    await foods.createFood({
      name: "E2E Meal Milk",
      nutrients: { "Calories (kcal)": 60, "Fat (g)": 3.5, "Sugar (g)": 4.7 },
    });
    await expect(foods.alert).toContainText("saved successfully");

    const meals = new MealsPage(page);
    await meals.goto();
    await meals.composeMeal("E2E Breakfast", [
      { foodQuery: "E2E Meal Oats", amount: 50 },
      { foodQuery: "E2E Meal Milk", amount: 200 },
    ]);
    await expectToast(page, "Meal 'E2E Breakfast' saved");
  });

  test("add a meal with 1 portion; ingredients hidden until expanded", async ({ page }) => {
    const entry = new EntryPage(page);
    await entry.goto(DATE);
    await entry.selectFood("E2E Breakfast", /E2E Breakfast \(meal\)/);
    // portions input defaults context
    await entry.amountInput.fill("1");
    // preview: 400*0.5 + 60*2 = 200 + 120 = 320 kcal
    await expect(entry.nutrientPreview).toContainText("320 kcal");
    await entry.addButton.click();
    await expectToast(page, /Added E2E Breakfast \(1 portion\)/);

    const meal = entry.mealRow("E2E Breakfast");
    await expect(meal).toBeVisible();
    await expect(meal).toContainText("320 kcal");
    await expect(meal).toContainText("2 ingredients");
    // collapsed: ingredient rows not visible
    await expect(entry.mealIngredientRow("E2E Breakfast", "E2E Meal Oats")).toHaveCount(0);
    await shot(page, "meals", "01-meal-collapsed");
  });

  test("expand meal and edit an ingredient amount", async ({ page }) => {
    const entry = new EntryPage(page);
    await entry.goto(DATE);
    const meal = entry.mealRow("E2E Breakfast");
    await meal.locator(".meal-entry-header").click();
    const oats = entry.mealIngredientRow("E2E Breakfast", "E2E Meal Oats");
    await expect(oats).toBeVisible();
    await expect(oats).toContainText("200 kcal");
    await shot(page, "meals", "02-meal-expanded");

    // oops — only had 30g of oats, not 50
    await entry.editEntryAmount(oats, 30, "enter");
    await expectToast(page, "Updated E2E Meal Oats");
    await expect(oats).toContainText("120 kcal");
    // meal total: 120 + 120 = 240 (meal stays expanded or reload collapses — assert via reload)
    await entry.goto(DATE);
    await expect(entry.mealRow("E2E Breakfast")).toContainText("240 kcal");
    await shot(page, "meals", "03-after-ingredient-edit");
  });

  test("remove one ingredient from the meal", async ({ page }) => {
    const entry = new EntryPage(page);
    await entry.goto(DATE);
    const meal = entry.mealRow("E2E Breakfast");
    await meal.locator(".meal-entry-header").click();
    const milk = entry.mealIngredientRow("E2E Breakfast", "E2E Meal Milk");
    await entry.removeEntry(milk);
    await expectToast(page, "Entry removed");
    await entry.goto(DATE);
    await expect(entry.mealRow("E2E Breakfast")).toContainText("1 ingredient");
    await expect(entry.mealRow("E2E Breakfast")).toContainText("120 kcal");
  });

  test("delete the whole meal, then re-add with 2 portions", async ({ page }) => {
    const entry = new EntryPage(page);
    await entry.goto(DATE);
    await entry.removeEntry(entry.mealRow("E2E Breakfast"));
    await expectToast(page, "Entry removed");
    await expect(entry.mealRow("E2E Breakfast")).toHaveCount(0);

    await entry.selectFood("E2E Breakfast", /E2E Breakfast \(meal\)/);
    await entry.amountInput.fill("2");
    await expect(entry.nutrientPreview).toContainText("640 kcal");
    await entry.addButton.click();
    await expectToast(page, /Added E2E Breakfast \(2 portions\)/);
    await expect(entry.mealRow("E2E Breakfast")).toContainText("640 kcal");
    await shot(page, "meals", "04-readded-two-portions");
  });
});
