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
}: {
  /** Rendered text, e.g. "150 g" or "× 1.5" */
  display: string;
  /** Current numeric value loaded into the input when editing starts. */
  value: number;
  onSave: (newValue: number) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");

  if (!editing) {
    return (
      <span
        className="ingredient-weight editable"
        title="Click to edit"
        onClick={() => {
          setDraft(String(value));
          setEditing(true);
        }}
      >
        {display}
      </span>
    );
  }

  const commit = () => {
    setEditing(false);
    const n = Number(draft);
    if (Number.isFinite(n) && n > 0 && n !== value) onSave(n);
  };

  return (
    <input
      className="inline-edit-input"
      type="number"
      min={0}
      step={0.1}
      autoFocus
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") commit();
        if (e.key === "Escape") setEditing(false);
      }}
    />
  );
}
