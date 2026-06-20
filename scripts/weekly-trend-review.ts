/**
 * Focused capture for the Weekly Trend & Goal feature. Drives the no-goal state,
 * sets a goal through the modal, then captures the with-goal state across the
 * dashboard, the entry card, and the chart — at desktop and mobile.
 *
 *   AUTH_DISABLED=true DATABASE_URL=…/nutritional_review npx next dev -p 3300
 *   npx tsx scripts/weekly-trend-review.ts
 */
import { chromium, type Page } from "@playwright/test";
import fs from "node:fs";
import postgres from "postgres";

const BASE = process.env.UX_BASE ?? "http://localhost:3300";
const DB_URL =
  process.env.DATABASE_URL ??
  "postgresql://nutritional_user:dev_password@127.0.0.1:5432/nutritional_review";
const OUT = "tests/e2e/screenshots/weekly-trend";
const ENTRY_DATE = "2026-06-05";

async function resetGoal(): Promise<void> {
  const sql = postgres(DB_URL, { max: 1 });
  try {
    await sql`UPDATE user_settings SET goal_weight_kg = NULL, weekly_rate_target_kg = NULL, start_weight_kg = NULL, start_date = NULL WHERE id = 1`;
  } finally {
    await sql.end();
  }
}

async function shot(page: Page, name: string): Promise<void> {
  await page.screenshot({ path: `${OUT}/${name}.png` });
}

async function shotEl(page: Page, selector: string, name: string): Promise<void> {
  const el = page.locator(selector).first();
  if (await el.count()) await el.screenshot({ path: `${OUT}/${name}.png` });
}

async function run(): Promise<void> {
  fs.mkdirSync(`${OUT}/desktop`, { recursive: true });
  fs.mkdirSync(`${OUT}/mobile`, { recursive: true });

  await resetGoal();
  const browser = await chromium.launch();

  // ---------- DESKTOP ----------
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();

  // No-goal dashboard + chart
  await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
  await page.waitForTimeout(600);
  await shot(page, "desktop/01-dashboard-nogoal");
  await shotEl(page, ".weekly-summary-card", "desktop/02-strip-nogoal");
  await shotEl(page, ".chart-svg", "desktop/03-chart-trend");

  // No-goal entry card
  await page.goto(`${BASE}/entry?date=${ENTRY_DATE}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(400);
  await shot(page, "desktop/04-entry-nogoal");
  await shotEl(page, ".mise-logbook-column", "desktop/05-entry-col3-nogoal");

  // Open goal modal, set a goal + target rate
  await page.locator(".weekly-goal-affordance").first().click();
  await page.waitForTimeout(300);
  await shot(page, "desktop/06-goal-modal");
  await page.fill("#goal-weight", "63");
  await page.fill("#goal-rate", "-0.05");
  await page.locator(".modal-footer .btn-primary").click();
  await page.waitForTimeout(900);

  // With-goal entry card
  await shotEl(page, ".mise-logbook-column", "desktop/07-entry-col3-withgoal");

  // With-goal dashboard + chart (goal guide)
  await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
  await page.waitForTimeout(600);
  await shot(page, "desktop/08-dashboard-withgoal");
  await shotEl(page, ".weekly-summary-card", "desktop/09-strip-withgoal");
  await shotEl(page, ".chart-svg", "desktop/10-chart-withgoal-guide");

  await ctx.close();

  // ---------- MOBILE ----------
  const mctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const mpage = await mctx.newPage();
  await mpage.goto(`${BASE}/`, { waitUntil: "networkidle" });
  await mpage.waitForTimeout(600);
  await shot(mpage, "mobile/01-dashboard-withgoal");
  await mpage.goto(`${BASE}/entry?date=${ENTRY_DATE}`, { waitUntil: "networkidle" });
  await mpage.waitForTimeout(400);
  await shot(mpage, "mobile/02-entry-withgoal");
  await shotEl(mpage, ".weekly-summary-card", "mobile/03-card-withgoal");
  await mctx.close();

  await browser.close();
  console.log("captured →", OUT);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
