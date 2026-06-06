import { expect, test } from "@playwright/test";
import { EntryPage } from "./pages/entry";
import { E2E_DATES, shot, withDb } from "./pages/helpers";

const DATE = E2E_DATES.weight;
const DATE2 = E2E_DATES.weight2;

async function dbWeights(date: string) {
  return withDb(async (sql) => {
    const rows =
      await sql`SELECT morning_weight_kg, evening_weight_kg, energy_kcal
                FROM daily_summaries WHERE summary_date = ${date}`;
    return rows[0] ?? null;
  });
}

test.describe("weight tracking", () => {
  test("enter morning weight on an empty day → weights-only row", async ({ page }) => {
    const entry = new EntryPage(page);
    await entry.goto(DATE);
    await entry.setWeight("morning", "70.5");
    // persisted to DB with NULL nutrients
    await expect.poll(async () => (await dbWeights(DATE))?.morning_weight_kg).toBe("70.50");
    expect((await dbWeights(DATE))?.energy_kcal).toBeNull();
    // survives reload
    await entry.goto(DATE);
    await expect(entry.morningWeight).toHaveValue("70.5");
    await shot(page, "weight", "01-morning-entered");
  });

  test("typo'd weight → correct it", async ({ page }) => {
    const entry = new EntryPage(page);
    await entry.goto(DATE);
    await entry.setWeight("morning", "705"); // fat-fingered the decimal
    await expect.poll(async () => (await dbWeights(DATE))?.morning_weight_kg).toBe("70.50"); // rejected: >500 → unchanged
    await entry.setWeight("morning", "70.9");
    await expect.poll(async () => (await dbWeights(DATE))?.morning_weight_kg).toBe("70.90");
  });

  test("evening weight is independent of morning", async ({ page }) => {
    const entry = new EntryPage(page);
    await entry.goto(DATE);
    await entry.setWeight("evening", "71.6");
    await expect.poll(async () => (await dbWeights(DATE))?.evening_weight_kg).toBe("71.60");
    expect((await dbWeights(DATE))?.morning_weight_kg).toBe("70.90");
  });

  test("accidentally entered weight on the wrong day → clear it", async ({ page }) => {
    const entry = new EntryPage(page);
    await entry.goto(DATE2);
    // oops — meant to enter this on another day
    await entry.setWeight("morning", "70.2");
    await expect.poll(async () => (await dbWeights(DATE2))?.morning_weight_kg).toBe("70.20");

    // rectify: empty the field = clear the weight
    await entry.setWeight("morning", "");
    await expect.poll(async () => (await dbWeights(DATE2))?.morning_weight_kg).toBeNull();
    // reload shows empty input
    await entry.goto(DATE2);
    await expect(entry.morningWeight).toHaveValue("");
    await shot(page, "weight", "02-after-clear");
  });

  test("clearing one weight leaves the other untouched", async ({ page }) => {
    const entry = new EntryPage(page);
    await entry.goto(DATE);
    await entry.setWeight("morning", "");
    await expect.poll(async () => (await dbWeights(DATE))?.morning_weight_kg).toBeNull();
    expect((await dbWeights(DATE))?.evening_weight_kg).toBe("71.60");
  });
});
