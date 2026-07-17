"use client";

import { useEffect, useRef, useState } from "react";

export interface ToastMessage {
  id: number;
  kind: "success" | "error" | "info";
  text: string;
}

const VISIBLE_MS = 3000;
const EXIT_MS = 160; // matches --dur-quick settle-out
const MAX_VISIBLE = 4; // never let the stack bury the controls beneath it

/**
 * Bottom-right toasts, 3s visible, then a quiet settle-out. Each toast is
 * scheduled to leave exactly once (keyed by id) — adding a new toast must not
 * restart the timers of the ones already showing, or they'd never dismiss.
 */
export default function ToastContainer({
  toasts,
  dismiss,
}: {
  toasts: ToastMessage[];
  dismiss: (id: number) => void;
}) {
  const [leaving, setLeaving] = useState<Set<number>>(new Set());
  // Keep dismiss current without making it a timer-scheduling dependency.
  const dismissRef = useRef(dismiss);
  dismissRef.current = dismiss;
  const scheduled = useRef<Set<number>>(new Set());

  useEffect(() => {
    for (const t of toasts) {
      if (scheduled.current.has(t.id)) continue; // already counting down
      scheduled.current.add(t.id);
      setTimeout(() => setLeaving((prev) => new Set(prev).add(t.id)), VISIBLE_MS);
      setTimeout(() => {
        dismissRef.current(t.id);
        setLeaving((prev) => {
          const next = new Set(prev);
          next.delete(t.id);
          return next;
        });
        scheduled.current.delete(t.id);
      }, VISIBLE_MS + EXIT_MS);
    }
    // Prune ids for toasts removed before their timer fired (no leak).
    const live = new Set(toasts.map((t) => t.id));
    for (const id of scheduled.current) {
      if (!live.has(id)) scheduled.current.delete(id);
    }
  }, [toasts]);

  if (toasts.length === 0) return null;

  // Show only the most recent few; older ones are dismissing on their own timers.
  const visible = toasts.slice(-MAX_VISIBLE);

  return (
    <div className="toast-container">
      {visible.map((t) => {
        const icon = t.kind === "success" ? "✓" : t.kind === "info" ? "·" : "!";
        return (
          <div
            key={t.id}
            role="status"
            className={`toast toast-${t.kind}${leaving.has(t.id) ? " leaving" : ""}`}
          >
            <span className="toast-icon" aria-hidden="true">
              {icon}
            </span>
            {t.text}
          </div>
        );
      })}
    </div>
  );
}
