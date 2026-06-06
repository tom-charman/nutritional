import { expect, test } from "@playwright/test";
import { EntryPage } from "./pages/entry";
import { FoodsPage } from "./pages/foods";
import { E2E_DATES, expectToast, shot } from "./pages/helpers";

const DATE = E2E_DATES.targets;

function modal(page: import("@playwright/test").Page) {
  return page.locator(".modal");
}

function targetInput(page: import("@playwright/test").Page, label: string) {
  return modal(page)
    .locator(".compact-input")
    .filter({ has: page.locator("label", { hasText: label }) })
    .locator("input");
}

test.describe("daily targets", () => {
  test("edit calories target → calories card and header react", async ({ page }) => {
    const entry = new EntryPage(page);
    await entry.goto(DATE);
    await expect(entry.energyValue).toContainText("/ 2000");

    await entry.openTargetsModal();
    await shot(page, "targets", "01-modal-open");
    await targetInput(page, "Calories (kcal)").fill("2400");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expectToast(page, "Targets saved");
    await expect(entry.energyValue).toContainText("/ 2400");
    await expect(entry.caloriesRemaining).toHaveText("2400");
  });

  test("Cancel discards changes", async ({ page }) => {
    const entry = new EntryPage(page);
    await entry.goto(DATE);
    await entry.openTargetsModal();
    await targetInput(page, "Calories (kcal)").fill("9999");
    await page.getByRole("button", { name: "Cancel" }).click();
    await expect(modal(page)).toHaveCount(0);
    await expect(entry.energyValue).toContainText("/ 2400");
  });

  test("Escape closes the modal without saving", async ({ page }) => {
    const entry = new EntryPage(page);
    await entry.goto(DATE);
    await entry.openTargetsModal();
    await targetInput(page, "Calories (kcal)").fill("8888");
    await page.keyboard.press("Escape");
    await expect(modal(page)).toHaveCount(0);
    await expect(entry.energyValue).toContainText("/ 2400");
  });

  test("changing a value + mode drives the macro bar indicator", async ({ page }) => {
    // macro bars only render once the day has entries (python parity) — add one
    const foods = new FoodsPage(page);
    await foods.goto();
    await foods.createFood({
      name: "E2E Tofu",
      nutrients: { "Calories (kcal)": 76, "Protein (g)": 17 },
    });
    await expect(foods.alert).toContainText("saved successfully");

    const entry = new EntryPage(page);
    await entry.goto(DATE);
    await entry.addFood("E2E Tofu", 100); // 17g protein consumed
    await expectToast(page, "Added E2E Tofu");

    await entry.openTargetsModal();
    // protein as a tiny LIMIT: 17 > 10 * 1.1 → exceeded ⚠
    await targetInput(page, "Protein (g)").fill("10");
    const proteinModeGroup = modal(page).getByRole("radiogroup", {
      name: "Protein (g) mode",
    });
    await proteinModeGroup.getByRole("radio", { name: "Limit" }).click();
    await shot(page, "targets", "02-mode-controls");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expectToast(page, "Targets saved");

    const proteinBar = entry.macroBar("Protein");
    await expect(proteinBar.locator(".macro-bar-value")).toContainText("/ 10g");
    await expect(proteinBar.locator(".macro-bar-indicator")).toHaveClass(/target-exceeded/);
    await shot(page, "targets", "03-limit-exceeded");

    // switch back to target mode: 17 >= 10 → met ✓
    await entry.openTargetsModal();
    await proteinModeGroup.getByRole("radio", { name: "Target" }).click();
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expectToast(page, "Targets saved");
    await expect(proteinBar.locator(".macro-bar-indicator")).toHaveClass(/target-met/);
  });

  test("targets are per-day (sticky forward, not backward)", async ({ page }) => {
    const entry = new EntryPage(page);
    // the day AFTER our targets date inherits 2400 via stickiness
    await entry.goto(E2E_DATES.spare); // 2024-01-18 > 2024-01-17
    await expect(entry.energyValue).toContainText("/ 2400");
    // a day BEFORE doesn't (falls back to most recent earlier or defaults)
    await entry.goto(E2E_DATES.tracking); // 2024-01-10
    await expect(entry.energyValue).toContainText("/ 2000");
  });
});
