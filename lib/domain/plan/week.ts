/**
 * Week-date helpers for the Weekly Planner. All dates are ISO YYYY-MM-DD and all
 * arithmetic is in UTC (matching the rest of the app, which slices
 * `toISOString()` for "today" — see app/entry/page.tsx).
 */

/** Add `days` to an ISO date (UTC), returning YYYY-MM-DD. */
export function addDays(iso: string, days: number): string {
  return new Date(Date.parse(`${iso}T00:00:00Z`) + days * 86_400_000)
    .toISOString()
    .slice(0, 10);
}

/** The Monday (ISO week start) on or before `iso`. */
export function mondayOf(iso: string): string {
  const day = new Date(`${iso}T00:00:00Z`).getUTCDay(); // 0=Sun..6=Sat
  const backToMonday = (day + 6) % 7; // Mon→0, Sun→6
  return addDays(iso, -backToMonday);
}

/** The seven ISO dates of the week starting at `weekStart` (a Monday). */
export function weekDates(weekStart: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
}
