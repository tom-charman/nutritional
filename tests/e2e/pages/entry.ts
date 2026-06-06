import { expect, type Locator, type Page } from "@playwright/test";

/**
 * Page object for /entry — all selectors for the daily-entry page live here
 * so UI restyling during the UX loop touches one file.
 */
export class EntryPage {
  constructor(public readonly page: Page) {}

  async goto(date: string) {
    await this.page.goto(`/entry?date=${date}`);
    await expect(this.searchInput).toBeVisible();
  }

  // --- selectors ---
  get searchInput(): Locator {
    return this.page.getByTestId("food-search");
  }
  get amountInput(): Locator {
    return this.page.getByTestId("amount-input");
  }
  get addButton(): Locator {
    return this.page.getByTestId("add-button");
  }
  get datePicker(): Locator {
    return this.page.getByTestId("date-picker");
  }
  get morningWeight(): Locator {
    return this.page.getByTestId("weight-morning");
  }
  get eveningWeight(): Locator {
    return this.page.getByTestId("weight-evening");
  }
  get nutrientPreview(): Locator {
    return this.page.locator(".nutrient-preview-card");
  }
  get caloriesRemaining(): Locator {
    return this.page.locator(".calories-remaining-number");
  }
  get headerSummary(): Locator {
    return this.page.locator(".daily-summary-bar");
  }
  get entriesList(): Locator {
    return this.page.locator(".ingredients-list");
  }
  /** Top-level food entry rows (not meal ingredients). */
  entryRow(foodName: string): Locator {
    return this.page
      .locator(".ingredients-list > .ingredient-item")
      .filter({ hasText: foodName });
  }
  mealRow(mealName: string): Locator {
    return this.page
      .locator(".ingredients-list > .ingredient-item")
      .filter({ hasText: mealName });
  }
  mealIngredientRow(mealName: string, foodName: string): Locator {
    return this.mealRow(mealName)
      .locator(".meal-entry-ingredients .ingredient-item")
      .filter({ hasText: foodName });
  }
  comboOption(text: string | RegExp): Locator {
    return this.page.locator(".combobox-option").filter({ hasText: text }).first();
  }
  macroBar(label: string): Locator {
    return this.page
      .locator(".macro-bar-item")
      .filter({ has: this.page.locator(".macro-bar-label", { hasText: label }) });
  }

  // --- actions ---
  async selectFood(query: string, optionText?: string | RegExp) {
    await this.searchInput.click();
    await this.searchInput.fill(query);
    await this.comboOption(optionText ?? query).click();
  }

  async addFood(query: string, amount: number, optionText?: string | RegExp) {
    await this.selectFood(query, optionText);
    await this.amountInput.fill(String(amount));
    await this.addButton.click();
  }

  /** Click an entry's amount to enter inline edit, type, then commit. */
  async editEntryAmount(
    row: Locator,
    newAmount: number,
    commit: "blur" | "enter" | "escape" = "enter",
  ) {
    await row.locator(".ingredient-weight.editable").click();
    const input = row.locator(".inline-edit-input");
    await input.fill(String(newAmount));
    if (commit === "enter") await input.press("Enter");
    else if (commit === "escape") await input.press("Escape");
    else await input.blur();
  }

  async removeEntry(row: Locator) {
    await row.locator(".delete-icon").first().click();
  }

  async setWeight(which: "morning" | "evening", value: string) {
    const input = which === "morning" ? this.morningWeight : this.eveningWeight;
    await input.fill(value);
    await input.blur();
  }

  async openTargetsModal() {
    await this.page.getByRole("button", { name: "Edit Targets" }).click();
    await expect(this.page.locator(".modal")).toBeVisible();
  }
}
