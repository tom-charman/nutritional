/**
 * Shared display formatters so the same datum reads identically across every
 * surface (list, hero, bars, preview, chart).
 */

/** Whole-number kcal with locale thousands separators, e.g. 2,879. */
export function formatKcal(v: number): string {
  return Math.round(v).toLocaleString("en-GB");
}

/**
 * An amount at the stored precision (DECIMAL(8,2)) with trailing zeros dropped,
 * so display, stored value and the inline editor all agree: 0.333 → "0.33",
 * 1.50 → "1.5", 2 → "2", 150 → "150".
 */
export function formatAmount(v: number): string {
  return String(Math.round(v * 100) / 100);
}
