import { describe, expect, it } from "vitest";
import {
  calorieStatus,
  getDefaultTargets,
  getNutrientMode,
  macroIndicator,
} from "@/lib/domain/targets";

describe("getDefaultTargets (models.py get_default_targets port)", () => {
  const t = getDefaultTargets("2024-06-01");

  it("matches production defaults", () => {
    expect(t.values).toEqual({
      energy_kcal: 2000,
      protein_g: 150,
      carbohydrates_g: 225,
      fat_g: 67,
      sugar_g: 90,
      saturated_fat_g: 20,
      fibre_g: 30,
      salt_g: 6,
      calcium_mg: 700,
    });
  });

  it("limit modes on sugar/satfat/salt, target elsewhere", () => {
    expect(t.modes.sugar_g).toBe("limit");
    expect(t.modes.saturated_fat_g).toBe("limit");
    expect(t.modes.salt_g).toBe("limit");
    expect(t.modes.protein_g).toBe("target");
    expect(t.modes.energy_kcal).toBe("target");
  });
});

describe("getNutrientMode", () => {
  it("uses per-nutrient override when set", () => {
    const t = getDefaultTargets("2024-06-01");
    expect(getNutrientMode(t, "sugar_g")).toBe("limit");
  });

  it("falls back to default mode when override is null", () => {
    const t = getDefaultTargets("2024-06-01");
    t.modes.protein_g = null;
    t.mode = "limit";
    expect(getNutrientMode(t, "protein_g")).toBe("limit");
  });
});

describe("macroIndicator (entry.py create_macro_bar thresholds)", () => {
  it("limit mode: >1.1x → exceeded", () => {
    expect(macroIndicator(23, 20, "limit")).toBe("exceeded");
  });

  it("limit mode: >1x but <=1.1x → warning", () => {
    expect(macroIndicator(21, 20, "limit")).toBe("warning");
  });

  it("limit mode: at or under limit → null", () => {
    expect(macroIndicator(20, 20, "limit")).toBeNull();
    expect(macroIndicator(15, 20, "limit")).toBeNull();
  });

  it("target mode: >= target → met", () => {
    expect(macroIndicator(150, 150, "target")).toBe("met");
    expect(macroIndicator(151, 150, "target")).toBe("met");
  });

  it("target mode: below target → null", () => {
    expect(macroIndicator(149, 150, "target")).toBeNull();
  });
});

describe("calorieStatus (entry.py calories-remaining card)", () => {
  it("over target → over + kcal over text, remaining clamped to 0", () => {
    const s = calorieStatus(2200, 2000);
    expect(s.remaining).toBe(0);
    expect(s.status).toBe("over");
    expect(s.statusText).toBe("200 kcal over target");
  });

  it("within 200 kcal → near", () => {
    const s = calorieStatus(1850, 2000);
    expect(s.remaining).toBe(150);
    expect(s.status).toBe("near");
  });

  it("plenty remaining → default", () => {
    const s = calorieStatus(1000, 2000);
    expect(s.remaining).toBe(1000);
    expect(s.status).toBe("default");
    expect(s.statusText).toBe("On track");
  });
});
