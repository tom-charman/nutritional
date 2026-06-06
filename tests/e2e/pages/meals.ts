import { expect, type Locator, type Page } from "@playwright/test";

/** Page object for /meals — the meal composer + saved meals list. */
export class MealsPage {
  constructor(public readonly page: Page) {}

  async goto() {
    await this.page.goto("/meals");
    await expect(this.nameInput).toBeVisible();
  }

  get nameInput(): Locator {
    return this.page.getByTestId("meal-name");
  }
  get foodSearch(): Locator {
    return this.page.getByTestId("meal-food-search");
  }
  get amountInput(): Locator {
    return this.page.getByTestId("ingredient-amount");
  }
  get addIngredientButton(): Locator {
    return this.page.getByTestId("add-ingredient");
  }
  get saveButton(): Locator {
    return this.page.getByTestId("save-meal");
  }
  get composerIngredients(): Locator {
    return this.page.getByTestId("composer-ingredients");
  }
  composerIngredient(foodName: string): Locator {
    return this.composerIngredients.locator(".ingredient-item").filter({ hasText: foodName });
  }
  mealCard(name: string): Locator {
    return this.page.locator(".meal-card").filter({ hasText: name }).first();
  }
  comboOption(text: string | RegExp): Locator {
    return this.page.locator(".combobox-option").filter({ hasText: text }).first();
  }

  async addIngredient(foodQuery: string, amount: number, optionText?: string | RegExp) {
    await this.foodSearch.click();
    await this.foodSearch.fill(foodQuery);
    await this.comboOption(optionText ?? foodQuery).click();
    await this.amountInput.fill(String(amount));
    await this.addIngredientButton.click();
  }

  /** Create (or update) a meal end-to-end through the composer UI. */
  async composeMeal(
    name: string,
    ingredients: { foodQuery: string; amount: number }[],
  ) {
    await this.nameInput.fill(name);
    for (const ing of ingredients) {
      await this.addIngredient(ing.foodQuery, ing.amount);
    }
    await this.saveButton.click();
  }
}
