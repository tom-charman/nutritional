import { expect, test } from "@playwright/test";
import { FoodsPage } from "./pages/foods";
import { MealsPage } from "./pages/meals";
import { expectToast, shot } from "./pages/helpers";

test.describe("meal planner (template CRUD)", () => {
  test("fixture foods", async ({ page }) => {
    const foods = new FoodsPage(page);
    await foods.goto();
    await foods.createFood({
      name: "E2E Planner Oats",
      nutrients: { "Calories (kcal)": 400, "Carbs (g)": 60, "Protein (g)": 15 },
    });
    await expect(foods.alert).toContainText("saved successfully");
    await foods.createFood({
      name: "E2E Planner Egg",
      perItem: { servingSizeG: 60 },
      nutrients: { "Calories (kcal)": 78, "Protein (g)": 6 },
    });
    await expect(foods.alert).toContainText("saved successfully");
  });

  test("compose and save a meal; totals shown live", async ({ page }) => {
    const meals = new MealsPage(page);
    await meals.goto();
    await shot(page, "meal-planner", "01-empty-composer");

    await meals.nameInput.fill("E2E Power Breakfast");
    await meals.addIngredient("E2E Planner Oats", 50);
    // composer shows the ingredient + running totals (400*0.5 = 200)
    await expect(meals.composerIngredient("E2E Planner Oats")).toContainText("200 kcal");
    await meals.addIngredient("E2E Planner Egg", 2);
    await expect(meals.composerIngredient("E2E Planner Egg")).toContainText("156 kcal");
    await expect(page.locator(".nutrient-preview-card")).toContainText("356 kcal");
    await shot(page, "meal-planner", "02-composed");

    await meals.saveButton.click();
    await expectToast(page, "Meal 'E2E Power Breakfast' saved");
    await expect(meals.mealCard("E2E Power Breakfast")).toContainText("2 ingredients");
    await expect(meals.mealCard("E2E Power Breakfast")).toContainText("356 kcal");
    // composer cleared after save
    await expect(meals.nameInput).toHaveValue("");
    await shot(page, "meal-planner", "03-saved");
  });

  test("mistake: wrong amount → remove ingredient and re-add", async ({ page }) => {
    const meals = new MealsPage(page);
    await meals.goto();
    await meals.nameInput.fill("E2E Mistake Meal");
    await meals.addIngredient("E2E Planner Oats", 500); // typo
    await expect(meals.composerIngredient("E2E Planner Oats")).toContainText("2000 kcal");
    // remove and redo
    await meals.composerIngredient("E2E Planner Oats").locator(".delete-icon").click();
    await expect(meals.composerIngredients).toHaveCount(0);
    await meals.addIngredient("E2E Planner Oats", 50);
    await expect(meals.composerIngredient("E2E Planner Oats")).toContainText("200 kcal");
    await meals.saveButton.click();
    await expectToast(page, "saved");
  });

  test("edit an existing meal (load → modify → update)", async ({ page }) => {
    const meals = new MealsPage(page);
    await meals.goto();
    await meals.mealCard("E2E Power Breakfast").locator(".meal-card-header").click();
    await expect(meals.nameInput).toHaveValue("E2E Power Breakfast");
    await expect(meals.composerIngredient("E2E Planner Oats")).toBeVisible();
    await shot(page, "meal-planner", "04-editing");

    // drop the egg, rename
    await meals.composerIngredient("E2E Planner Egg").locator(".delete-icon").click();
    await meals.nameInput.fill("E2E Power Breakfast Lite");
    await meals.saveButton.click();
    await expectToast(page, "Meal 'E2E Power Breakfast Lite' saved");
    await expect(meals.mealCard("E2E Power Breakfast Lite")).toContainText("1 ingredient");
    await expect(meals.mealCard("E2E Power Breakfast Lite")).toContainText("200 kcal");
  });

  test("validation: no name / no ingredients", async ({ page }) => {
    const meals = new MealsPage(page);
    await meals.goto();
    await meals.saveButton.click();
    await expectToast(page, "Please enter a meal name");
    await meals.nameInput.fill("E2E No Ingredients");
    await meals.saveButton.click();
    await expectToast(page, "Add at least one ingredient");
  });

  test("saved meal appears in the entry-page selector", async ({ page }) => {
    await page.goto("/entry");
    const search = page.getByTestId("food-search");
    await search.click();
    await search.fill("E2E Power Breakfast Lite");
    await expect(
      page.locator(".combobox-option").filter({ hasText: "E2E Power Breakfast Lite (meal)" }),
    ).toBeVisible();
  });

  test("delete a meal", async ({ page }) => {
    const meals = new MealsPage(page);
    await meals.goto();
    await meals.mealCard("E2E Mistake Meal").locator(".meal-action-delete").click();
    await expectToast(page, "Meal deleted");
    await expect(meals.mealCard("E2E Mistake Meal")).toHaveCount(0);
  });
});
