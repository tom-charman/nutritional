/**
 * DECIMAL(8,2) columns come back from postgres as strings (numeric type).
 * All coercion to number happens here — the single place that prevents the
 * string-arithmetic footgun.
 */

/** Coerce a numeric-string (or number) to number; null/undefined pass through as null. */
export function num(v: string | number | null | undefined): number | null {
  if (v === null || v === undefined) return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isNaN(n) ? null : n;
}

/** Coerce, treating null as 0 (for NOT NULL nutrient columns). */
export function num0(v: string | number | null | undefined): number {
  return num(v) ?? 0;
}

/** Format a number for writing into a DECIMAL(8,2) column. */
export function dec(v: number): string {
  return v.toFixed(2);
}

/** Format an optional number; null stays null. */
export function decOrNull(v: number | null | undefined): string | null {
  return v === null || v === undefined ? null : v.toFixed(2);
}
