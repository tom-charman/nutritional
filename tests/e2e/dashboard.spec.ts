import { expect, test } from "@playwright/test";
import { shot } from "./pages/helpers";

test.describe("dashboard", () => {
  test("three chart tabs render with prod-copy data", async ({ page }) => {
    await page.goto("/");
    // tab 1: calories & weight (default)
    const svg = page.locator(".graph-wrapper svg.chart-svg");
    await expect(svg).toBeVisible();
    await expect(svg.locator("path").first()).toBeVisible();
    await shot(page, "dashboard", "01-calories-weight");

    await page.getByRole("tab", { name: "Macronutrient Breakdown" }).click();
    await expect(svg.locator("path").first()).toBeVisible();
    await shot(page, "dashboard", "02-macros");

    await page.getByRole("tab", { name: "Nutrients vs RDI" }).click();
    await expect(page.locator(".graph-wrapper")).toContainText("100% RDI Target");
    await shot(page, "dashboard", "03-rdi");
  });

  test("unified hover tooltip appears", async ({ page }) => {
    await page.goto("/");
    const svg = page.locator(".graph-wrapper svg.chart-svg");
    await expect(svg).toBeVisible();
    const box = (await svg.boundingBox())!;
    await page.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.5);
    await expect(page.locator(".chart-tooltip")).toBeVisible();
    await expect(page.locator(".chart-tooltip")).toContainText("Calories");
    await shot(page, "dashboard", "04-hover-tooltip");
  });

  test("entry and foods pages are usable on mobile viewport", async ({ page }) => {
    await page.goto("/entry");
    await expect(page.getByTestId("food-search")).toBeVisible();
    await expect(page.getByTestId("weight-morning")).toBeVisible();
    await shot(page, "dashboard", "05-entry-mobile-or-desktop");

    await page.goto("/foods");
    await expect(page.getByPlaceholder("Search foods...")).toBeVisible();
    await shot(page, "dashboard", "06-foods-mobile-or-desktop");
  });
});
