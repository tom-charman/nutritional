/**
 * Browser-side CSV download trigger. Imported by the client ExportModal;
 * relies on browser APIs so it must only run in the browser.
 */

/** Build a Blob and click a temporary <a download>. */
function triggerDownload(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/** Download a CSV string (BOM-prefixed so Excel reads UTF-8 correctly). */
export function downloadCsv(filename: string, csv: string): void {
  triggerDownload(filename, new Blob(["﻿", csv], { type: "text/csv;charset=utf-8;" }));
}

/** Download a JSON string (GDPR "download all my data"). */
export function downloadJson(filename: string, json: string): void {
  triggerDownload(filename, new Blob([json], { type: "application/json;charset=utf-8;" }));
}
