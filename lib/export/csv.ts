/**
 * Minimal RFC-4180 CSV serializer. Server-safe (no browser APIs); used by the
 * export server actions in app/actions/export.ts.
 */

export type CsvValue = string | number | null | undefined;

/** Quote a single field if it contains a comma, quote, CR or LF; null/undefined → empty. */
function field(value: CsvValue): string {
  if (value === null || value === undefined) return "";
  const s = typeof value === "number" ? String(value) : value;
  if (/[",\r\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/** Serialize a header row + data rows to a CRLF-delimited CSV string. */
export function toCsv(headers: string[], rows: CsvValue[][]): string {
  const lines = [headers.map(field).join(",")];
  for (const row of rows) {
    lines.push(row.map(field).join(","));
  }
  return lines.join("\r\n");
}

/** Round to 2 decimals, preserving null (chart gaps / missing data stay empty). */
export function round2(value: number | null): number | null {
  if (value === null) return null;
  return Math.round(value * 100) / 100;
}
