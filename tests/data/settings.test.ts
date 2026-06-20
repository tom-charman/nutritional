import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb } from "./harness";
import type { DB } from "@/lib/data/storage";
import { loadUserSettings, saveUserSettings } from "@/lib/data/storage";

let db: DB;
let close: () => Promise<void>;

beforeAll(async () => {
  ({ db, close } = await createTestDb());
});

afterAll(async () => {
  await close();
});

describe("user settings storage", () => {
  it("returns the seeded all-null row by default", async () => {
    const s = await loadUserSettings(db);
    expect(s).toEqual({
      goal_weight_kg: null,
      weekly_rate_target_kg: null,
      start_weight_kg: null,
      start_date: null,
    });
  });

  it("upserts on the fixed single row (id = 1)", async () => {
    await saveUserSettings(db, {
      goal_weight_kg: 78,
      weekly_rate_target_kg: -0.5,
      start_weight_kg: 84.2,
      start_date: "2026-01-01",
    });
    const s = await loadUserSettings(db);
    expect(s.goal_weight_kg).toBe(78);
    expect(s.weekly_rate_target_kg).toBe(-0.5);
    expect(s.start_weight_kg).toBe(84.2);
    expect(s.start_date).toBe("2026-01-01");

    // A second save updates the same row rather than inserting a new one.
    await saveUserSettings(db, {
      goal_weight_kg: 75,
      weekly_rate_target_kg: null,
      start_weight_kg: 84.2,
      start_date: "2026-01-01",
    });
    const s2 = await loadUserSettings(db);
    expect(s2.goal_weight_kg).toBe(75);
    expect(s2.weekly_rate_target_kg).toBeNull();
  });

  it("clears the goal back to nulls", async () => {
    await saveUserSettings(db, {
      goal_weight_kg: null,
      weekly_rate_target_kg: null,
      start_weight_kg: null,
      start_date: null,
    });
    const s = await loadUserSettings(db);
    expect(s.goal_weight_kg).toBeNull();
    expect(s.start_weight_kg).toBeNull();
  });
});
