/**
 * Domain constants ported from the Python app.
 * Sources: nutritional/settings.py, nutritional/data_entry/models.py,
 * nutritional/components.py, docs/brand-guidelines.md.
 */

/** Dashboard rolling-average window (callbacks.py hardcoded 30). */
export const ROLLING_WINDOW_DAYS = 30;

/**
 * GDPR: the version of the privacy notice / health-data consent currently in
 * force. Recorded on the users row when a user consents; the consent gate
 * (lib/data/consent.ts) re-prompts if a user's recorded version differs, so a
 * material change to the notice forces fresh explicit consent. Bump this (date
 * the notice materially changed) only when re-consent should be required.
 */
export const HEALTH_CONSENT_VERSION = "2026-06-28";

/** Caloric conversion factors (kcal/g) — settings.py */
export const CAL_PROT = 4;
export const CAL_CARB = 4;
export const CAL_FAT = 9;

/**
 * Maintenance-calories estimate (adaptive TDEE from energy balance).
 * KCAL_PER_KG: standard energy density of body-mass change (~7700 kcal/kg).
 * MAINTENANCE_MIN_POINTS: minimum valid weight points in the trailing window
 *   before a trend slope is trusted; below this no estimate is produced.
 */
export const KCAL_PER_KG = 7700;
export const MAINTENANCE_MIN_POINTS = 14;
/** Robustness guards so one bad weigh-in can't wreck the maintenance estimate. */
export const MAX_WEIGHT_SLOPE_KG_PER_DAY = 0.5; // ~3.5 kg/week ceiling on trend
export const MAX_WEIGHT_DELTA_KG = 3; // day-over-day jump beyond this = a fat-finger

/**
 * Weekly trend & goal projection (the Cutter card).
 * - TREND_EWMA_ALPHA: smoothing for the responsive "trend weight" line/number
 *   (≈9-day responsiveness; Hacker's Diet uses ~0.1). A 30-day mean lags a cutter
 *   by ~2 weeks, so the trend weight uses this instead.
 * - MAINTENANCE_BAND_KG: |trend − goal| within this → "at goal / maintaining".
 * - MIN_MEANINGFUL_DEFICIT_KCAL: the projection is energy-balance-driven
 *   (maintenance − intake); a |deficit| below this is treated as "holding" (no
 *   spurious ETA from noise). ~75 kcal/day ≈ 0.07 kg/week.
 */
export const TREND_EWMA_ALPHA = 0.1;
export const MAINTENANCE_BAND_KG = 0.5;
export const MIN_MEANINGFUL_DEFICIT_KCAL = 75;

/** The 9 tracked nutrients, canonical input/display order (models.py NUTRIENT_INPUT_ORDER). */
export const NUTRIENT_KEYS = [
  "energy_kcal",
  "fat_g",
  "saturated_fat_g",
  "carbohydrates_g",
  "sugar_g",
  "protein_g",
  "fibre_g",
  "salt_g",
  "calcium_mg",
  "vitamin_c_mg",
] as const;

export type NutrientKey = (typeof NUTRIENT_KEYS)[number];

export type Nutrients = Record<NutrientKey, number>;

export const ZERO_NUTRIENTS: Nutrients = {
  energy_kcal: 0,
  fat_g: 0,
  saturated_fat_g: 0,
  carbohydrates_g: 0,
  sugar_g: 0,
  protein_g: 0,
  fibre_g: 0,
  salt_g: 0,
  calcium_mg: 0,
  vitamin_c_mg: 0,
};

/** Labels per models.py NUTRIENT_FIELD_INFO. */
export const NUTRIENT_LABELS: Record<NutrientKey, string> = {
  energy_kcal: "Calories (kcal)",
  fat_g: "Fat (g)",
  saturated_fat_g: "Sat Fat (g)",
  carbohydrates_g: "Carbs (g)",
  sugar_g: "Sugar (g)",
  protein_g: "Protein (g)",
  fibre_g: "Fibre (g)",
  salt_g: "Salt (g)",
  calcium_mg: "Calcium (mg)",
  vitamin_c_mg: "Vitamin C (mg)",
};

export const NUTRIENT_UNITS: Record<NutrientKey, string> = {
  energy_kcal: "kcal",
  fat_g: "g",
  saturated_fat_g: "g",
  carbohydrates_g: "g",
  sugar_g: "g",
  protein_g: "g",
  fibre_g: "g",
  salt_g: "g",
  calcium_mg: "mg",
  vitamin_c_mg: "mg",
};

/**
 * RDI guidelines used ONLY by the Nutrients-vs-RDI dashboard chart.
 * Exact production values from settings.py:42-48 (NOT the daily-target defaults).
 */
export const RDI_GUIDELINES: Partial<Record<NutrientKey, number>> = {
  saturated_fat_g: 30,
  sugar_g: 90,
  fibre_g: 30,
  salt_g: 6,
  calcium_mg: 1000,
  vitamin_c_mg: 40, // NHS UK reference (the personal default target is 200; see getDefaultTargets)
};

/**
 * THE canonical per-nutrient pigment system — each nutrient owns one HUE
 * IDENTITY, rendered in four context tones like a single pigment applied
 * thick or thin (ink dilution):
 *
 *   ink  — identity markers: dots, progress bars, tooltip bullets, accent
 *          text. ≥4.5:1 on white surface. This is "the nutrient's color"
 *          a user recognizes everywhere.
 *   line — chart strokes. Deep enough for a 2.25px line on Kaolin #F2F0EB
 *          (≥3:1 — sugar at 3.2:1 is the tightest).
 *   area — stacked-area fills. Soft mineral tones; the stack must sing as
 *          one composition (cool iron base → warm sunrise top).
 *   wash — faint background tints behind badges/rows.
 *
 * CSS custom properties in globals.css (--<nutrient>-{ink,line,area,wash})
 * MUST mirror these values.
 */
export interface NutrientTones {
  ink: string;
  line: string;
  area: string;
  wash: string;
}

export const NUTRIENT_COLORS: Record<NutrientKey, NutrientTones> = {
  // Sumi ink — energy is never tinted
  energy_kcal: { ink: "#2B2B2B", line: "#2B2B2B", area: "#2B2B2B", wash: "#F2F0EB" },
  // Baked Clay — the soft terracotta-rose that made the old stack beautiful
  fat_g: { ink: "#BF6B59", line: "#A8503D", area: "#E5A593", wash: "#F3E6E0" },
  // Persimmon — fat's deeper kin, rotated orange; brightest band at stack top
  saturated_fat_g: { ink: "#C8531C", line: "#B5440F", area: "#EFB48C", wash: "#FBEADD" },
  // Antique Gold — the dominant stack mass, honeyed ochre
  carbohydrates_g: { ink: "#B07D2B", line: "#9A6A1E", area: "#D9A848", wash: "#F5EEDD" },
  // Pale Amber — sugar is carved out of carbs: same warm family, lighter.
  // (The original beloved #EBC374; deep warm amber for ink/line — no green.)
  sugar_g: { ink: "#997C18", line: "#8A6D00", area: "#EBC374", wash: "#F8F0DA" },
  // Iron Blue — the anchor; cool base under the warm stack
  protein_g: { ink: "#2C4C5B", line: "#2C4C5B", area: "#5E7C88", wash: "#E6ECEE" },
  // Aged Pine — held distinct from Bamboo success green
  fibre_g: { ink: "#4F6D46", line: "#3F5C38", area: "#8FA587", wash: "#E7EFE5" },
  // Wisteria — the separation pigment, one cool note among the warms
  salt_g: { ink: "#6E54A8", line: "#5B4196", area: "#B4A4D6", wash: "#EFEAF7" },
  // Verdigris — mineral patina bridging blue and green
  calcium_mg: { ink: "#3F8C80", line: "#2F7468", area: "#9CC7BF", wash: "#E4F0ED" },
  // Marigold — citrus golden-orange; Vitamin C's pigment (kept clear of Sat-Fat's
  // persimmon and Sugar's amber; locked via the UI/UX screenshot sweep)
  vitamin_c_mg: { ink: "#D98A1F", line: "#C2760F", area: "#F0C06A", wash: "#FBF0D9" },
};

/**
 * Per-nutrient "on-target" tolerance, as a fraction of the day's target.
 * A value within ±band of target reads as on-target (✓) — so a trivial
 * overage never shows as an alarmist "0% over", while a meaningful deviation
 * still flags. Tuned per nutrient: TIGHT where small daily swings compound
 * into real outcomes (energy → weight), LOOSER where intake is naturally
 * lumpy/imprecise (fibre, calcium). For limit nutrients the band is the grace
 * zone above the cap; the band DOUBLED is the hard "exceeded" edge.
 * Consumed by macroIndicator/calorieStatus (lib/domain/targets.ts) so every
 * warning surface (entry bars, live preview, planner, RDI chart) agrees.
 */
export const NUTRIENT_BANDS: Record<NutrientKey, number> = {
  energy_kcal: 0.04, // ±80 @2000 / ±120 @3000 — a sustained ~150 kcal cut still flags
  fat_g: 0.1, //         ±7g  @67  — calorie-dense, lumpy (≈½ tbsp oil)
  saturated_fat_g: 0.1, // ±2g @20 (limit)
  carbohydrates_g: 0.1, // ±22g @225 — high-volume, flexible
  sugar_g: 0.08, //      ±7g  @90  (limit)
  protein_g: 0.08, //    ±12g @150 — protein comes in chunky portions
  fibre_g: 0.12, //      ±3.6g @30 — hard to hit precisely
  salt_g: 0.08, //       ±0.5g @6  (limit) — small target, one processed food ≈ 0.5–1g
  calcium_mg: 0.12, //   ±84mg @700 — lumpy (≈glass of milk = 300mg)
  vitamin_c_mg: 0.12, // ±24mg @200 — lumpy (one orange ≈ 70mg)
};

/** CSS channel class per nutrient (progress bars + preview channels). */
export const NUTRIENT_CSS_CLASS: Record<NutrientKey, string> = {
  energy_kcal: "progress-calories",
  fat_g: "progress-fat",
  saturated_fat_g: "progress-saturated-fat",
  carbohydrates_g: "progress-carbs",
  sugar_g: "progress-sugar",
  protein_g: "progress-protein",
  fibre_g: "progress-fibre",
  salt_g: "progress-salt",
  calcium_mg: "progress-calcium",
  vitamin_c_mg: "progress-vitamin-c",
};

/** Convenience: the recognizable identity tone per nutrient. */
export const NUTRIENT_INK: Record<NutrientKey, string> = Object.fromEntries(
  (Object.keys(NUTRIENT_COLORS) as NutrientKey[]).map((k) => [
    k,
    NUTRIENT_COLORS[k].ink,
  ]),
) as Record<NutrientKey, string>;

/** Short display names — the one label set used wherever nutrients are listed. */
export const NUTRIENT_SHORT_NAMES: Record<NutrientKey, string> = {
  energy_kcal: "Energy",
  fat_g: "Fat",
  saturated_fat_g: "Sat Fat",
  carbohydrates_g: "Carbs",
  sugar_g: "Sugar",
  protein_g: "Protein",
  fibre_g: "Fibre",
  salt_g: "Salt",
  calcium_mg: "Calcium",
  vitamin_c_mg: "Vitamin C",
};

/** Weight series color (Wakatake Bamboo) and band fill. */
export const WEIGHT_COLOR = "#789440";
export const WEIGHT_BAND_FILL = "rgba(120, 148, 64, 0.08)";


export type TargetMode = "target" | "limit";

export type UnitType = "per_100g" | "per_item";

/**
 * How a saved recipe (meal) converts into a logged amount:
 *   'whole'     — eat the assembled batch, scaled by portions (legacy default).
 *   'by_weight' — batch has a finished cooked weight (e.g. a 1200 g cake); log a
 *                 weighed portion (a 150 g slice → its share of the macros).
 *   'by_count'  — batch yields N identical items (e.g. 12 cookies); log a count.
 */
export type MealYieldMode = "whole" | "by_weight" | "by_count";
