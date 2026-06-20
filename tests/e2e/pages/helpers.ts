import { expect, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import postgres from "postgres";

export const TEST_DB_URL =
  "postgresql://nutritional_user:dev_password@127.0.0.1:5432/nutritional_test";

/** Run a callback with a short-lived test-DB connection. */
export async function withDb<T>(
  fn: (sql: ReturnType<typeof postgres>) => Promise<T>,
): Promise<T> {
  const sql = postgres(TEST_DB_URL, { max: 1 });
  try {
    return await fn(sql);
  } finally {
    await sql.end();
  }
}


/** Reserved E2E dates — before any prod data; cleaned by global-setup. */
export const E2E_DATES = {
  tracking: "2024-01-10",
  mistakes: "2024-01-11",
  meals: "2024-01-12",
  weight: "2024-01-13",
  weight2: "2024-01-14",
  dates_a: "2024-01-15",
  dates_b: "2024-01-16",
  targets: "2024-01-17",
  spare: "2024-01-18",
  spare2: "2024-01-19",
};

const SCREENSHOT_ROOT = path.resolve(__dirname, "../screenshots");

/** Curated screenshot at a named UX moment: <journey>/<NN>-<state>.png */
export async function shot(
  page: Page,
  journey: string,
  name: string,
): Promise<void> {
  const project = page.viewportSize()!.width <= 500 ? "mobile" : "desktop";
  const dir = path.join(SCREENSHOT_ROOT, project, journey);
  fs.mkdirSync(dir, { recursive: true });
  await page.screenshot({ path: path.join(dir, `${name}.png`), fullPage: false });
}

/** Wait for a toast with given text (success or error). */
export async function expectToast(page: Page, text: string | RegExp) {
  await expect(page.locator(".toast").filter({ hasText: text }).first()).toBeVisible();
}
