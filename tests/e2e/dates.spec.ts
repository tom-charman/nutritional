import { expect, test } from "@playwright/test";
import { EntryPage } from "./pages/entry";
import { FoodsPage } from "./pages/foods";
import { E2E_DATES, expectToast } from "./pages/helpers";

const DAY_A = E2E_DATES.dates_a;
const DAY_B = E2E_DATES.dates_b;

test.describe("date navigation", () => {
  test("fixture", async ({ page }) => {
    const foods = new FoodsPage(page);
    await foods.goto();
    await foods.createFood({
      name: "E2E Apple",
      nutrients: { "Calories (kcal)": 52, "Sugar (g)": 10 },
    });
    await expect(foods.alert).toContainText("saved successfully");
  });

  test("entries are isolated per day", async ({ page }) => {
    const entry = new EntryPage(page);
    await entry.goto(DAY_A);
    await entry.addFood("E2E Apple", 100);
    await expectToast(page, "Added E2E Apple");

    // switch via the date picker
    await entry.datePicker.fill(DAY_B);
    await expect(page).toHaveURL(new RegExp(`date=${DAY_B}`));
    await expect(entry.entryRow("E2E Apple")).toHaveCount(0);

    // back to day A
    await entry.datePicker.fill(DAY_A);
    await expect(entry.entryRow("E2E Apple")).toBeVisible();
  });

  test("header shows the formatted date", async ({ page }) => {
    const entry = new EntryPage(page);
    await entry.goto(DAY_A); // 2024-01-15 = Monday
    await expect(page.locator(".daily-header-left h1")).toHaveText("Monday, January 15");
  });

  test("future dates are clamped to today", async ({ page }) => {
    const entry = new EntryPage(page);
    const future = new Date(Date.now() + 5 * 86_400_000).toISOString().slice(0, 10);
    await page.goto(`/entry?date=${future}`);
    const today = new Date().toISOString().slice(0, 10);
    await expect(entry.datePicker).toHaveValue(today);
    // and the input's max prevents picking future days
    await expect(entry.datePicker).toHaveAttribute("max", today);
  });

  test("prev/next day arrows step through days; next disabled at today", async ({ page }) => {
    const entry = new EntryPage(page);
    await entry.goto(DAY_A); // 2024-01-15
    await page.getByTestId("prev-day").click();
    await expect(entry.datePicker).toHaveValue("2024-01-14");
    await page.getByTestId("next-day").click();
    await page.getByTestId("next-day").click();
    await expect(entry.datePicker).toHaveValue(DAY_B); // 2024-01-16
    // at today, next is disabled
    const today = new Date().toISOString().slice(0, 10);
    await entry.goto(today);
    await expect(page.getByTestId("next-day")).toBeDisabled();
  });

  test("reload preserves the selected date", async ({ page }) => {
    const entry = new EntryPage(page);
    await entry.goto(DAY_A);
    await page.reload();
    await expect(entry.datePicker).toHaveValue(DAY_A);
    await expect(entry.entryRow("E2E Apple")).toBeVisible();
  });
});
