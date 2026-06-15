"use client";

/**
 * Export dialog — date range + one checkbox per export option. Each checked
 * box downloads its own CSV. Mirrors the modal/toast patterns used elsewhere
 * (TargetsModal, ToastContainer). Meals ignore the date range.
 */
import { useEffect, useState, useTransition } from "react";
import {
  exportCaloriesWeightCsv,
  exportDailyEntriesCsv,
  exportMacroBreakdownCsv,
  exportMealsCsv,
  exportNutrientsRdiCsv,
  type ExportResult,
} from "@/app/actions/export";
import ToastContainer, { type ToastMessage } from "@/components/ui/Toast";
import { downloadCsv } from "@/lib/export/download";

type OptionKey =
  | "caloriesWeight"
  | "macroBreakdown"
  | "nutrientsRdi"
  | "dailyEntries"
  | "meals";

interface ExportOption {
  key: OptionKey;
  label: string;
  hint: string;
  /** Runs the matching server action; range-less options ignore from/to. */
  run: (from: string, to: string) => Promise<ExportResult>;
}

const OPTIONS: ExportOption[] = [
  {
    key: "caloriesWeight",
    label: "Calories & Weight",
    hint: "Rolling-average calories and morning/evening weight",
    run: exportCaloriesWeightCsv,
  },
  {
    key: "macroBreakdown",
    label: "Macro Breakdown",
    hint: "Protein, carb, sugar and fat calories",
    run: exportMacroBreakdownCsv,
  },
  {
    key: "nutrientsRdi",
    label: "Nutrients vs RDI",
    hint: "Each tracked nutrient as % of its RDI",
    run: exportNutrientsRdiCsv,
  },
  {
    key: "dailyEntries",
    label: "Daily Entries",
    hint: "One row per logged food item in the range",
    run: exportDailyEntriesCsv,
  },
  {
    key: "meals",
    label: "Meals",
    hint: "All saved meal templates (ignores the date range)",
    run: () => exportMealsCsv(),
  },
];

/** Default range: last 90 days ending yesterday (charts cap at yesterday). */
function defaultRange(): { from: string; to: string } {
  const to = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
  const from = new Date(Date.now() - 91 * 86_400_000).toISOString().slice(0, 10);
  return { from, to };
}

export default function ExportModal({ onClose }: { onClose: () => void }) {
  const initial = defaultRange();
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const [selected, setSelected] = useState<Record<OptionKey, boolean>>({
    caloriesWeight: true,
    macroBreakdown: false,
    nutrientsRdi: false,
    dailyEntries: false,
    meals: false,
  });
  const [isPending, startTransition] = useTransition();
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  function pushToast(kind: ToastMessage["kind"], text: string) {
    setToasts((prev) => [...prev, { id: Date.now() + prev.length, kind, text }]);
  }

  const anySelected = OPTIONS.some((o) => selected[o.key]);
  const rangeValid = from <= to;

  function download() {
    if (!anySelected || !rangeValid) return;
    startTransition(async () => {
      let count = 0;
      const failures: string[] = [];
      for (const opt of OPTIONS) {
        if (!selected[opt.key]) continue;
        const result = await opt.run(from, to);
        if (result.ok) {
          downloadCsv(result.filename, result.csv);
          count++;
        } else {
          failures.push(`${opt.label}: ${result.message}`);
        }
      }
      if (failures.length) {
        pushToast("error", failures.join("; "));
      }
      if (count) {
        pushToast("success", `Exported ${count} file${count === 1 ? "" : "s"}`);
      }
    });
  }

  return (
    <>
      <div className="modal-overlay" onClick={onClose}>
        <div className="modal" onClick={(e) => e.stopPropagation()}>
          <div className="modal-header">
            <h2>Export Data</h2>
            <button className="delete-icon" onClick={onClose} title="Close">
              ×
            </button>
          </div>
          <div className="modal-body">
            <div className="form-row">
              <div className="compact-input">
                <label className="form-label-sm" htmlFor="export-from">
                  From
                </label>
                <input
                  id="export-from"
                  type="date"
                  value={from}
                  max={to}
                  onChange={(e) => setFrom(e.target.value)}
                />
              </div>
              <div className="compact-input">
                <label className="form-label-sm" htmlFor="export-to">
                  To
                </label>
                <input
                  id="export-to"
                  type="date"
                  value={to}
                  min={from}
                  onChange={(e) => setTo(e.target.value)}
                />
              </div>
            </div>
            {!rangeValid && (
              <p className="export-range-error">
                Start date must be on or before end date.
              </p>
            )}

            <div className="export-options">
              {OPTIONS.map((opt) => (
                <label key={opt.key} className="export-option">
                  <input
                    type="checkbox"
                    checked={selected[opt.key]}
                    onChange={(e) =>
                      setSelected((prev) => ({ ...prev, [opt.key]: e.target.checked }))
                    }
                  />
                  <span className="export-option-text">
                    <span className="export-option-label">{opt.label}</span>
                    <span className="export-option-hint">{opt.hint}</span>
                  </span>
                </label>
              ))}
            </div>
          </div>
          <div className="modal-footer">
            <button className="btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button
              className="btn-primary"
              onClick={download}
              disabled={isPending || !anySelected || !rangeValid}
            >
              {isPending ? "Exporting..." : "Download"}
            </button>
          </div>
        </div>
      </div>
      <ToastContainer
        toasts={toasts}
        dismiss={(id) => setToasts((prev) => prev.filter((t) => t.id !== id))}
      />
    </>
  );
}
