import { expect, type Locator, type Page } from "@playwright/test";

/** Page object for /foods master-detail. */
export class FoodsPage {
  constructor(public readonly page: Page) {}

  async goto() {
    await this.page.goto("/foods");
    await expect(this.searchInput).toBeVisible();
  }

  get searchInput(): Locator {
    return this.page.getByPlaceholder("Search foods...");
  }
  get newFoodButton(): Locator {
    return this.page.getByRole("button", { name: "+ New Food" });
  }
  get nameInput(): Locator {
    return this.page.getByPlaceholder("e.g. Porridge Oats");
  }
  get servingSizeInput(): Locator {
    return this.page.getByPlaceholder("Required for per-item");
  }
  get saveButton(): Locator {
    return this.page.getByRole("button", { name: /Save Food|Saving/ });
  }
  get alert(): Locator {
    return this.page.locator(".alert");
  }
  listItem(name: string): Locator {
    return this.page.locator(".master-list-item").filter({ hasText: name }).first();
  }
  unitRadio(label: "Per 100g" | "Per Item"): Locator {
    return this.page.locator(".radio-label").filter({ hasText: label }).locator("input");
  }
  /** Nutrient input in the editor grid by its label. */
  nutrientInput(label: string): Locator {
    return this.page
      .locator(".editor-grid .compact-input")
      .filter({ has: this.page.locator("label", { hasText: label }) })
      .locator("input");
  }

  async createFood(opts: {
    name: string;
    perItem?: { servingSizeG: number };
    nutrients?: Record<string, number>;
  }) {
    await this.newFoodButton.click();
    await this.nameInput.fill(opts.name);
    if (opts.perItem) {
      await this.unitRadio("Per Item").check();
      await this.servingSizeInput.fill(String(opts.perItem.servingSizeG));
    }
    for (const [label, value] of Object.entries(opts.nutrients ?? {})) {
      await this.nutrientInput(label).fill(String(value));
    }
    await this.saveButton.click();
  }
}
