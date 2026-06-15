/**
 * Browser-side CSV download trigger. Imported by the client ExportModal;
 * relies on browser APIs so it must only run in the browser.
 */

/** Build a Blob from the CSV string and click a temporary <a download>. */
export function downloadCsv(filename: string, csv: string): void {
  // Prepend a BOM so Excel opens UTF-8 content correctly.
  const blob = new Blob(["﻿", csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
