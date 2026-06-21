import { expect, test } from "@playwright/test";
import fs from "node:fs";
import { shot } from "./pages/helpers";

/**
 * Feature #6 — the clinician daily-totals export: one row per day, each
 * nutrient in absolute units against that day's target with a hit/miss flag.
 */
test.describe("clinician daily-totals export", () => {
  async function openExport(page: import("@playwright/test").Page) {
    await page.goto("/");
    // Export now lives inside the account dropdown.
    await page.locator(".account-menu-trigger").click();
    await page.getByRole("menuitem", { name: "Export data" }).click();
    await expect(page.locator(".modal")).toBeVisible();
  }

  function option(page: import("@playwright/test").Page, label: string) {
    return page
      .locator(".export-option")
      .filter({ has: page.locator(".export-option-label", { hasText: label }) });
  }

  test("the new option is offered in the export dialog", async ({ page }) => {
    await openExport(page);
    const clinician = option(page, "Daily Totals (clinician)");
    await expect(clinician).toBeVisible();
    await expect(clinician).toContainText(/absolute nutrient totals/i);
    await shot(page, "export", "01-clinician-option");
  });

  test("downloads a CSV with absolute totals, targets and hit/miss columns", async ({
    page,
  }) => {
    await openExport(page);

    // Uncheck the default Calories & Weight so only the clinician file downloads.
    await option(page, "Calories & Weight").locator("input").uncheck();
    await option(page, "Daily Totals (clinician)").locator("input").check();

    // Widen the range to span the reserved E2E entry dates (2024-01).
    await page.locator("#export-from").fill("2024-01-01");
    await page.locator("#export-to").fill("2024-12-31");

    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("button", { name: /Download|Exporting/ }).click(),
    ]);

    expect(download.suggestedFilename()).toMatch(/^daily-totals_.*\.csv$/);

    const path = await download.path();
    const csv = fs.readFileSync(path, "utf8");
    const header = csv.split("\r\n")[0];
    expect(header).toContain("date");
    expect(header).toContain("salt_g_actual");
    expect(header).toContain("salt_g_target");
    expect(header).toContain("salt_g_status");
  });
});
