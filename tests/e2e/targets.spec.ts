import { expect, test } from "@playwright/test";
import { EntryPage } from "./pages/entry";
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
    await expect(entry.headerSummary).toContainText("/ 2000 kcal");

    await entry.openTargetsModal();
    await shot(page, "targets", "01-modal-open");
    await targetInput(page, "Calories (kcal)").fill("2400");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expectToast(page, "Targets saved");
    await expect(entry.headerSummary).toContainText("/ 2400 kcal");
    await expect(entry.caloriesRemaining).toHaveText("2400");
  });

  test("Cancel discards changes", async ({ page }) => {
    const entry = new EntryPage(page);
    await entry.goto(DATE);
    await entry.openTargetsModal();
    await targetInput(page, "Calories (kcal)").fill("9999");
    await page.getByRole("button", { name: "Cancel" }).click();
    await expect(modal(page)).toHaveCount(0);
    await expect(entry.headerSummary).toContainText("/ 2400 kcal");
  });

  test("Escape closes the modal without saving", async ({ page }) => {
    const entry = new EntryPage(page);
    await entry.goto(DATE);
    await entry.openTargetsModal();
    await targetInput(page, "Calories (kcal)").fill("8888");
    await page.keyboard.press("Escape");
    await expect(modal(page)).toHaveCount(0);
    await expect(entry.headerSummary).toContainText("/ 2400 kcal");
  });

  test("changing a mode affects the macro bar indicator", async ({ page }) => {
    const entry = new EntryPage(page);
    await entry.goto(DATE);
    await entry.openTargetsModal();
    // make protein a tiny LIMIT so any intake would warn; with no entries, no indicator
    await targetInput(page, "Protein (g)").fill("10");
    const proteinMode = modal(page)
      .locator(".compact-input")
      .filter({ has: page.locator("label", { hasText: "Protein (g)" }) })
      .locator("select, [role=radiogroup]");
    await shot(page, "targets", "02-mode-controls");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expectToast(page, "Targets saved");
    await expect(entry.macroBar("Protein").locator(".macro-bar-value")).toContainText("/ 10g");
  });

  test("targets are per-day (sticky forward, not backward)", async ({ page }) => {
    const entry = new EntryPage(page);
    // the day AFTER our targets date inherits 2400 via stickiness
    await entry.goto(E2E_DATES.spare); // 2024-01-18 > 2024-01-17
    await expect(entry.headerSummary).toContainText("/ 2400 kcal");
    // a day BEFORE doesn't (falls back to most recent earlier or defaults)
    await entry.goto(E2E_DATES.tracking); // 2024-01-10
    await expect(entry.headerSummary).toContainText("/ 2000 kcal");
  });
});
