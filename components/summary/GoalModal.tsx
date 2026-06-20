"use client";

/**
 * Goal-weight modal — mirrors TargetsModal's shell. Two fields: goal weight and an
 * optional weekly-rate target. On first save it captures the current trend weight as
 * a baseline (start_weight/start_date) so progress-to-goal has an anchor.
 */
import { useEffect, useRef, useState, useTransition } from "react";
import { saveUserSettingsAction } from "@/app/actions/settings";
import type { UserSettings } from "@/lib/domain/types";

export default function GoalModal({
  initial,
  currentTrendWeight,
  today,
  onClose,
  onSaved,
}: {
  initial: UserSettings;
  currentTrendWeight: number | null;
  today: string;
  onClose: () => void;
  onSaved: (message: string, ok: boolean) => void;
}) {
  const [goal, setGoal] = useState(
    initial.goal_weight_kg !== null ? String(initial.goal_weight_kg) : "",
  );
  const [rate, setRate] = useState(
    initial.weekly_rate_target_kg !== null ? String(initial.weekly_rate_target_kg) : "",
  );
  const [isPending, startTransition] = useTransition();
  const firstInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    firstInputRef.current?.focus();
    firstInputRef.current?.select();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  function numOrNull(s: string): number | null {
    const t = s.trim();
    if (t === "") return null;
    const n = Number(t);
    return Number.isFinite(n) ? n : null;
  }

  function save() {
    const goalVal = numOrNull(goal);
    startTransition(async () => {
      const next: UserSettings = {
        goal_weight_kg: goalVal,
        weekly_rate_target_kg: numOrNull(rate),
        // Capture a baseline on first goal-set so progress has an anchor.
        start_weight_kg:
          goalVal !== null && initial.start_weight_kg === null
            ? currentTrendWeight
            : initial.start_weight_kg,
        start_date:
          goalVal !== null && initial.start_weight_kg === null
            ? today
            : initial.start_date,
      };
      const result = await saveUserSettingsAction(next);
      onSaved(result.ok ? "Goal saved" : result.message, result.ok);
      if (result.ok) onClose();
    });
  }

  function clearGoal() {
    startTransition(async () => {
      const result = await saveUserSettingsAction({
        goal_weight_kg: null,
        weekly_rate_target_kg: null,
        start_weight_kg: null,
        start_date: null,
      });
      onSaved(result.ok ? "Goal cleared" : result.message, result.ok);
      if (result.ok) onClose();
    });
  }

  const hasGoal = initial.goal_weight_kg !== null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-narrow" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Goal Weight</h2>
          <button className="delete-icon" onClick={onClose} title="Close">
            ×
          </button>
        </div>
        <div className="modal-body">
          <div className="compact-input">
            <label className="form-label-sm" htmlFor="goal-weight">
              Goal weight (kg)
            </label>
            <input
              id="goal-weight"
              ref={firstInputRef}
              type="number"
              min={0}
              step={0.1}
              value={goal}
              placeholder="e.g. 78"
              onChange={(e) => setGoal(e.target.value)}
            />
          </div>
          <div className="compact-input" style={{ marginTop: 12 }}>
            <label className="form-label-sm" htmlFor="goal-rate">
              Target rate (kg/week, optional)
            </label>
            <input
              id="goal-rate"
              type="number"
              step={0.05}
              value={rate}
              placeholder="e.g. −0.5 to cut"
              onChange={(e) => setRate(e.target.value)}
            />
            <p className="field-hint">
              Negative to cut, positive to bulk. Leave blank to just track progress.
            </p>
          </div>
        </div>
        <div className="modal-footer">
          {hasGoal && (
            <button className="btn-secondary" onClick={clearGoal} disabled={isPending}>
              Clear goal
            </button>
          )}
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
