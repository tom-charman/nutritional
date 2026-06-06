/**
 * Time-series primitives — exact ports of nutritional/data/preprocessing.py,
 * with `null` standing in for NaN (JSON-serializable across server/client).
 */

export type Series = (number | null)[];

const DAY_MS = 86_400_000;

/** Parse an ISO date (YYYY-MM-DD) as UTC ms. */
export function isoToUtcMs(iso: string): number {
  return Date.parse(`${iso}T00:00:00Z`);
}

/** Format UTC ms back to ISO date. */
export function utcMsToIso(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/** create_date_range (preprocessing.py:216-249) — inclusive daily range. */
export function createDateRange(startIso: string, endIso: string): string[] {
  const start = isoToUtcMs(startIso);
  const end = isoToUtcMs(endIso);
  const out: string[] = [];
  for (let t = start; t <= end; t += DAY_MS) {
    out.push(utcMsToIso(t));
  }
  return out;
}

/**
 * interpolate_daily (preprocessing.py:6-78):
 * resample to a contiguous daily range; linear-fill gaps ONLY between the
 * first and last known points (no extrapolation). Single point → no fill.
 *
 * `maxGapDays` optionally caps how wide a void may be bridged (wider gaps
 * stay null and chart lines break via d3 `.defined`). Default is unlimited
 * — python parity — because real tracking gaps are ≤ a week and the trend
 * survives them.
 */
export function interpolateDaily(
  dates: string[],
  values: Series,
  maxGapDays = Infinity,
): { dates: string[]; values: Series } {
  if (dates.length === 0) return { dates: [], values: [] };

  const newDates = createDateRange(dates[0], dates[dates.length - 1]);
  const index = new Map(newDates.map((d, i) => [d, i]));
  const newValues: Series = new Array(newDates.length).fill(null);

  for (let i = 0; i < dates.length; i++) {
    const idx = index.get(dates[i]);
    if (idx !== undefined) newValues[idx] = values[i] ?? null;
  }

  const validIndices: number[] = [];
  for (let i = 0; i < newValues.length; i++) {
    if (newValues[i] !== null) validIndices.push(i);
  }
  if (validIndices.length <= 1) return { dates: newDates, values: newValues };

  const first = validIndices[0];
  const last = validIndices[validIndices.length - 1];
  let prevValidPos = 0; // position within validIndices of last valid <= i

  for (let i = first; i <= last; i++) {
    if (newValues[i] !== null) {
      while (
        prevValidPos < validIndices.length - 1 &&
        validIndices[prevValidPos + 1] <= i
      ) {
        prevValidPos++;
      }
      continue;
    }
    const prevIdx = validIndices[prevValidPos];
    const nextIdx = validIndices[prevValidPos + 1];
    if (nextIdx - prevIdx > maxGapDays) continue; // void too wide — stay null
    const weight = (i - prevIdx) / (nextIdx - prevIdx);
    const prev = newValues[prevIdx] as number;
    const next = newValues[nextIdx] as number;
    newValues[i] = prev + weight * (next - prev);
  }

  return { dates: newDates, values: newValues };
}

/**
 * rolling_average (preprocessing.py:81-114):
 * trailing window mean skipping nulls, min_periods observations required.
 */
export function rollingAverage(
  values: Series,
  window: number,
  minPeriods = 1,
): Series {
  const result: Series = new Array(values.length).fill(null);
  for (let i = 0; i < values.length; i++) {
    const start = Math.max(0, i - window + 1);
    let sum = 0;
    let count = 0;
    for (let j = start; j <= i; j++) {
      const v = values[j];
      if (v !== null) {
        sum += v;
        count++;
      }
    }
    if (count >= minPeriods) result[i] = sum / count;
  }
  return result;
}

/** normalize_to_rdi (preprocessing.py:117-136). */
export function normalizeToRdi(values: Series, rdiValue: number): Series {
  if (rdiValue === 0) return values.map(() => null);
  return values.map((v) => (v === null ? null : (v / rdiValue) * 100));
}

/**
 * calculate_macro_calories (preprocessing.py:139-213):
 * potential kcal per macro, proportionally adjusted so the sum matches the
 * recorded total calories. Null-safe per element.
 */
export function calculateMacroCalories(
  proteinG: Series,
  carbsG: Series,
  fatG: Series,
  saturatedFatG: Series,
  totalCalories: Series,
  calProt = 4,
  calCarb = 4,
  calFat = 9,
): {
  protein_cal: Series;
  carbs_cal: Series;
  saturated_fat_cal: Series;
  other_fat_cal: Series;
} {
  const n = proteinG.length;
  const protein_cal: Series = new Array(n).fill(null);
  const carbs_cal: Series = new Array(n).fill(null);
  const saturated_fat_cal: Series = new Array(n).fill(null);
  const other_fat_cal: Series = new Array(n).fill(null);

  for (let i = 0; i < n; i++) {
    const p = proteinG[i];
    const c = carbsG[i];
    const f = fatG[i];
    const sf = saturatedFatG[i];
    const total = totalCalories[i];
    if (p === null || c === null || f === null || sf === null || total === null) {
      continue;
    }
    const otherFatG = Math.max(f - sf, 0);
    const potProtein = p * calProt;
    const potCarbs = c * calCarb;
    const potSatFat = sf * calFat;
    const potOtherFat = otherFatG * calFat;
    const totalPotential = potProtein + potCarbs + potSatFat + potOtherFat;
    let adj = totalPotential > 0 ? total / totalPotential : 1.0;
    if (!Number.isFinite(adj)) adj = 1.0;

    protein_cal[i] = potProtein * adj;
    carbs_cal[i] = potCarbs * adj;
    saturated_fat_cal[i] = potSatFat * adj;
    other_fat_cal[i] = potOtherFat * adj;
  }

  return { protein_cal, carbs_cal, saturated_fat_cal, other_fat_cal };
}
