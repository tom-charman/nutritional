"use client";

/**
 * Click-to-edit amount — the one inline-edit interaction used everywhere
 * an amount can be corrected (daily-log entries, meal ingredients, the
 * composer). Click → input; Enter/blur commits; Escape cancels.
 */
import { useState } from "react";

export default function EditableAmount({
  display,
  value,
  onSave,
  onRemove,
}: {
  /** Rendered text, e.g. "150 g" or "× 1.5" */
  display: string;
  /** Current numeric value loaded into the input when editing starts. */
  value: number;
  onSave: (newValue: number) => void;
  /** If provided, committing an empty/0 amount removes the entry instead of
   *  being silently ignored. Omit (e.g. for portions) to reject 0 as invalid. */
  onRemove?: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [invalid, setInvalid] = useState(false);

  if (!editing) {
    const startEditing = () => {
      setDraft(String(value));
      setInvalid(false);
      setEditing(true);
    };
    return (
      <span
        className="ingredient-weight editable"
        role="button"
        tabIndex={0}
        aria-label={`Edit amount (${display})`}
        title="Click to edit"
        onClick={startEditing}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            startEditing();
          }
        }}
      >
        {display}
      </span>
    );
  }

  const cancel = () => {
    setInvalid(false);
    setEditing(false);
  };

  // No silent no-op: empty/0 removes the entry (when allowed); a negative or
  // non-numeric value goes red and stays editable on Enter. Blurring away from an
  // invalid value just reverts (rather than leaving a stuck red unfocused input).
  const commit = (viaBlur = false) => {
    const t = draft.trim();
    const n = Number(t);
    if (t === "" || n === 0) {
      if (onRemove) {
        setEditing(false);
        setInvalid(false);
        onRemove();
      } else if (viaBlur) {
        cancel(); // e.g. portions can't be zero — blurring reverts
      } else {
        setInvalid(true);
      }
      return;
    }
    if (!Number.isFinite(n) || n < 0) {
      if (viaBlur) cancel();
      else setInvalid(true);
      return;
    }
    setEditing(false);
    setInvalid(false);
    if (n !== value) onSave(n);
  };

  return (
    <input
      className="inline-edit-input"
      type="number"
      min={0}
      step={0.1}
      autoFocus
      aria-invalid={invalid}
      style={invalid ? { borderColor: "var(--danger)", color: "var(--danger)" } : undefined}
      value={draft}
      onChange={(e) => {
        setDraft(e.target.value);
        if (invalid) setInvalid(false);
      }}
      onBlur={() => commit(true)}
      onKeyDown={(e) => {
        if (e.key === "Enter") commit();
        if (e.key === "Escape") cancel();
      }}
    />
  );
}
