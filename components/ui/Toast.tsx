"use client";

import { useEffect } from "react";

export interface ToastMessage {
  id: number;
  kind: "success" | "error";
  text: string;
}

/** Bottom-right toasts, 3s auto-dismiss (entry.py toast behavior). */
export default function ToastContainer({
  toasts,
  dismiss,
}: {
  toasts: ToastMessage[];
  dismiss: (id: number) => void;
}) {
  useEffect(() => {
    if (toasts.length === 0) return;
    const timers = toasts.map((t) => setTimeout(() => dismiss(t.id), 3000));
    return () => timers.forEach(clearTimeout);
  }, [toasts, dismiss]);

  if (toasts.length === 0) return null;

  return (
    <div className="toast-container">
      {toasts.map((t) => (
        <div key={t.id} className={`toast toast-${t.kind === "success" ? "success" : "error"}`}>
          {t.text}
        </div>
      ))}
    </div>
  );
}
