import { describe, expect, it } from "vitest";
import {
  calorieStatus,
  energyIndicator,
  getDefaultTargets,
  getNutrientMode,
  limitOverPct,
  macroIndicator,
  nutrientIndicator,
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
      vitamin_c_mg: 200,
    });
  });

  it("limit modes on sugar/satfat/salt, target elsewhere", () => {
    expect(t.modes.sugar_g).toBe("limit");
    expect(t.modes.saturated_fat_g).toBe("limit");
    expect(t.modes.salt_g).toBe("limit");
    expect(t.modes.protein_g).toBe("target");
    expect(t.modes.energy_kcal).toBe("target");
    expect(t.modes.vitamin_c_mg).toBe("target");
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

describe("macroIndicator (per-nutrient on-target band)", () => {
  // band = 0.10 → grace zone to target*1.1, exceeded beyond target*1.2.
  it("limit mode: > target*(1+2·band) → exceeded", () => {
    expect(macroIndicator(25, 20, "limit", 0.1)).toBe("exceeded");
  });

  it("limit mode: between +band and +2·band → warning", () => {
    expect(macroIndicator(23, 20, "limit", 0.1)).toBe("warning");
  });

  it("limit mode: at/under the cap (within grace) → met (staying under earns the tick)", () => {
    expect(macroIndicator(21, 20, "limit", 0.1)).toBe("met"); // +5% ≤ +10% grace
    expect(macroIndicator(20, 20, "limit", 0.1)).toBe("met");
    expect(macroIndicator(15, 20, "limit", 0.1)).toBe("met");
  });

  it("target mode: within band below target → met (close enough)", () => {
    expect(macroIndicator(150, 150, "target", 0.08)).toBe("met");
    expect(macroIndicator(151, 150, "target", 0.08)).toBe("met");
    expect(macroIndicator(149, 150, "target", 0.08)).toBe("met"); // within 8% band
  });

  it("target mode: any overage above a floor is still met", () => {
    expect(macroIndicator(300, 150, "target", 0.08)).toBe("met"); // 2× the floor
  });

  it("target mode: below the band → null (a real shortfall)", () => {
    expect(macroIndicator(130, 150, "target", 0.08)).toBeNull(); // 13% short
  });
});

describe("energyIndicator (calories are a window, not a floor)", () => {
  // energy band = 0.04 → grace to 2080, exceeded beyond 2160; floor at 1920.
  it("within ±band of target → met", () => {
    expect(energyIndicator(2000, 2000, 0.04)).toBe("met");
    expect(energyIndicator(1920, 2000, 0.04)).toBe("met"); // bottom of the band
    expect(energyIndicator(2080, 2000, 0.04)).toBe("met"); // top of the band
  });

  it("over the band → warning then exceeded (an overage is a real miss)", () => {
    expect(energyIndicator(2100, 2000, 0.04)).toBe("warning"); // >2080, ≤2160
    expect(energyIndicator(2200, 2000, 0.04)).toBe("exceeded"); // >2160
  });

  it("below the band → null, never a tick (under-eating is not on-target)", () => {
    expect(energyIndicator(1500, 2000, 0.04)).toBeNull();
  });
});

describe("nutrientIndicator (dispatch: energy → window, else mode)", () => {
  it("routes energy through the window — overage breaks the tick", () => {
    expect(nutrientIndicator("energy_kcal", 2200, 2000, "target", 0.04)).toBe("exceeded");
    expect(nutrientIndicator("energy_kcal", 2000, 2000, "target", 0.04)).toBe("met");
  });

  it("routes a floor nutrient through macroIndicator — overage stays met", () => {
    expect(nutrientIndicator("protein_g", 300, 150, "target", 0.08)).toBe("met");
  });

  it("routes a cap nutrient through macroIndicator — under cap is met", () => {
    expect(nutrientIndicator("salt_g", 5, 6, "limit", 0.08)).toBe("met");
  });
});

describe("limitOverPct (live preview breach copy)", () => {
  it("rounds the percentage a projected total sits over the limit", () => {
    expect(limitOverPct(8.4, 6)).toBe(40); // 8.4g salt vs 6g cap → 40% over
    expect(limitOverPct(6.6, 6)).toBe(10);
    expect(limitOverPct(12, 6)).toBe(100);
  });

  it("guards a zero/negative target", () => {
    expect(limitOverPct(5, 0)).toBe(0);
  });
});

describe("limit alert projection (committed total + pending entry)", () => {
  // The preview feeds projected = dayTotals + entry into macroIndicator, the
  // same function the committed macro bars use.
  // Salt band = 0.08 → grace to 6.48g, exceeded beyond 6.96g.
  it("warns once the pending entry pushes the day past a cap", () => {
    // 5g salt already logged, adding 1.5g → 6.5g (>6.48, ≤6.96) → warning
    expect(macroIndicator(5 + 1.5, 6, "limit", 0.08)).toBe("warning");
    // adding 2g → 7g (>6.96) → exceeded
    expect(macroIndicator(5 + 2, 6, "limit", 0.08)).toBe("exceeded");
  });

  it("no breach while the projected total is within the cap + grace (met, not warning/exceeded)", () => {
    // The preview only raises an alert on warning/exceeded; "met" leaves it silent.
    expect(macroIndicator(3 + 2, 6, "limit", 0.08)).toBe("met");
    expect(macroIndicator(6.3, 6, "limit", 0.08)).toBe("met"); // +5% ≤ +8% grace
  });
});

describe("calorieStatus (energy on-target band = 0.04)", () => {
  it("clearly over the band → over amount surfaced, remaining clamped to 0", () => {
    const s = calorieStatus(2200, 2000, 0.04);
    expect(s.remaining).toBe(0);
    expect(s.over).toBe(200);
    expect(s.status).toBe("over");
    expect(s.statusText).toBe("over target");
  });

  it("a trivial overage within the band reads as met, never '0 over'", () => {
    const s = calorieStatus(2010, 2000, 0.04); // +0.5% ≤ +4%
    expect(s.over).toBe(0);
    expect(s.remaining).toBe(0);
    expect(s.status).toBe("met");
    expect(s.statusText).toBe("Target met");
  });

  it("reached the target → met (0 remaining never reads as 'nearly met')", () => {
    const s = calorieStatus(2000, 2000, 0.04);
    expect(s.remaining).toBe(0);
    expect(s.status).toBe("met");
    expect(s.statusText).toBe("Target met");
  });

  it("a hair under, remaining rounds to 0 → met, not 'nearly met'", () => {
    const s = calorieStatus(1999.7, 2000, 0.04);
    expect(s.remaining).toBe(0);
    expect(s.status).toBe("met");
  });

  it("within band below target with a real remainder → near", () => {
    const s = calorieStatus(1950, 2000, 0.04);
    expect(s.remaining).toBe(50);
    expect(s.status).toBe("near");
    expect(s.statusText).toBe("Target nearly met");
  });

  it("empty day → On track, full target remaining (never 'nearly met')", () => {
    const s = calorieStatus(0, 2000, 0.04);
    expect(s.remaining).toBe(2000);
    expect(s.status).toBe("default");
    expect(s.statusText).toBe("On track");
  });

  it("plenty remaining → default", () => {
    const s = calorieStatus(1000, 2000, 0.04);
    expect(s.remaining).toBe(1000);
    expect(s.status).toBe("default");
    expect(s.statusText).toBe("On track");
  });
});
