"use client";

/**
 * Daily targets modal — port of entry.py targets modal:
 * 9 nutrient inputs with target/limit mode dropdowns, Copy Previous Targets.
 */
import { useEffect, useRef, useState, useTransition } from "react";
import { getTargetsForDateAction, saveTargetsAction } from "@/app/actions/entry";
import {
  NUTRIENT_KEYS,
  NUTRIENT_LABELS,
  type NutrientKey,
  type TargetMode,
} from "@/lib/constants";
import type { DailyTargets } from "@/lib/domain/types";

/** Input step per nutrient (entry.py create_target_input). */
function stepFor(key: NutrientKey): number {
  if (key === "energy_kcal") return 10;
  if (key === "salt_g" || key === "calcium_mg") return 0.1;
  return 1;
}

export default function TargetsModal({
  date,
  initial,
  onClose,
  onSaved,
}: {
  date: string;
  initial: DailyTargets;
  onClose: () => void;
  onSaved: (message: string, ok: boolean) => void;
}) {
  const [values, setValues] = useState<Record<NutrientKey, string>>(
    Object.fromEntries(
      NUTRIENT_KEYS.map((k) => [k, String(initial.values[k])]),
    ) as Record<NutrientKey, string>,
  );
  const [modes, setModes] = useState<Record<NutrientKey, TargetMode>>(
    Object.fromEntries(
      NUTRIENT_KEYS.map((k) => [k, initial.modes[k] ?? initial.mode]),
    ) as Record<NutrientKey, TargetMode>,
  );
  const [isPending, startTransition] = useTransition();
  const firstInputRef = useRef<HTMLInputElement | null>(null);
  const modalRef = useRef<HTMLDivElement | null>(null);

  // Unsaved edits? (Cancel/×/Esc discard; the overlay click is guarded below.)
  const dirty =
    NUTRIENT_KEYS.some((k) => values[k] !== String(initial.values[k])) ||
    NUTRIENT_KEYS.some((k) => modes[k] !== (initial.modes[k] ?? initial.mode));

  // Escape closes (discarding changes); focus lands on the first value. Tab is
  // trapped within the modal so focus can't fall to the page behind it.
  useEffect(() => {
    firstInputRef.current?.focus();
    firstInputRef.current?.select();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (e.key !== "Tab" || !modalRef.current) return;
      const focusable = modalRef.current.querySelectorAll<HTMLElement>(
        'button, input, [href], select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  function copyPrevious() {
    startTransition(async () => {
      // Yesterday's (or most recent) targets via the stickiness chain
      const prevDate = new Date(Date.parse(`${date}T00:00:00Z`) - 86_400_000)
        .toISOString()
        .slice(0, 10);
      const prev = await getTargetsForDateAction(prevDate);
      setValues(
        Object.fromEntries(
          NUTRIENT_KEYS.map((k) => [k, String(prev.values[k])]),
        ) as Record<NutrientKey, string>,
      );
      setModes(
        Object.fromEntries(
          NUTRIENT_KEYS.map((k) => [k, prev.modes[k] ?? prev.mode]),
        ) as Record<NutrientKey, TargetMode>,
      );
    });
  }

  function save() {
    startTransition(async () => {
      const targets: DailyTargets = {
        date,
        mode: "target",
        values: Object.fromEntries(
          NUTRIENT_KEYS.map((k) => [k, Number(values[k]) || 0]),
        ) as DailyTargets["values"],
        modes: Object.fromEntries(
          NUTRIENT_KEYS.map((k) => [k, modes[k]]),
        ) as DailyTargets["modes"],
      };
      const result = await saveTargetsAction(targets);
      onSaved(result.ok ? "Targets saved" : result.message, result.ok);
      if (result.ok) onClose();
    });
  }

  return (
    <div
      className="modal-overlay"
      // Only a click on the empty backdrop with NO unsaved edits closes — so a
      // stray click-away can't silently discard target changes.
      onClick={() => {
        if (!dirty) onClose();
      }}
    >
      <div
        className="modal"
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="targets-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <h2 id="targets-modal-title">Edit Daily Targets</h2>
          <button className="delete-icon" onClick={onClose} title="Close">
            ×
          </button>
        </div>
        <div className="modal-body">
          <p className="modal-subtitle">
            <strong>Target</strong> = aim to reach · <strong>Limit</strong> = stay under
          </p>
          <div className="targets-grid">
            {NUTRIENT_KEYS.map((key, i) => (
              <div key={key} className="compact-input">
                <label className="form-label-sm">{NUTRIENT_LABELS[key]}</label>
                <input
                  type="number"
                  ref={i === 0 ? firstInputRef : undefined}
                  min={0}
                  step={stepFor(key)}
                  value={values[key]}
                  onChange={(e) => setValues({ ...values, [key]: e.target.value })}
                />
                <div
                  className="mode-toggle"
                  role="radiogroup"
                  aria-label={`${NUTRIENT_LABELS[key]} mode`}
                >
                  {(["target", "limit"] as TargetMode[]).map((m) => (
                    <button
                      key={m}
                      type="button"
                      role="radio"
                      aria-checked={modes[key] === m}
                      className={`mode-toggle-option${modes[key] === m ? " active" : ""}`}
                      onClick={() => setModes({ ...modes, [key]: m })}
                    >
                      {m === "target" ? "Target" : "Limit"}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn-secondary" onClick={copyPrevious} disabled={isPending}>
            Copy Previous Targets
          </button>
          <button className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="btn-primary" onClick={save} disabled={isPending}>
            {isPending ? "Saving..." : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
