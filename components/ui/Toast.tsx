"use client";

import { useEffect, useState } from "react";

export interface ToastMessage {
  id: number;
  kind: "success" | "error";
  text: string;
}

const VISIBLE_MS = 3000;
const EXIT_MS = 160; // matches --dur-quick settle-out

/**
 * Bottom-right toasts, 3s visible, then a quiet settle-out (entry.py toast
 * behavior + the app's one motion gesture).
 */
export default function ToastContainer({
  toasts,
  dismiss,
}: {
  toasts: ToastMessage[];
  dismiss: (id: number) => void;
}) {
  const [leaving, setLeaving] = useState<Set<number>>(new Set());

  useEffect(() => {
    if (toasts.length === 0) return;
    const timers = toasts.flatMap((t) => [
      setTimeout(
        () => setLeaving((prev) => new Set(prev).add(t.id)),
        VISIBLE_MS,
      ),
      setTimeout(() => {
        dismiss(t.id);
        setLeaving((prev) => {
          const next = new Set(prev);
          next.delete(t.id);
          return next;
        });
      }, VISIBLE_MS + EXIT_MS),
    ]);
    return () => timers.forEach(clearTimeout);
  }, [toasts, dismiss]);

  if (toasts.length === 0) return null;

  return (
    <div className="toast-container">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`toast toast-${t.kind === "success" ? "success" : "error"}${
            leaving.has(t.id) ? " leaving" : ""
          }`}
        >
          {t.text}
        </div>
      ))}
    </div>
  );
}
