"use client";

/**
 * Client island for the dashboard (a server component): holds the goal-modal +
 * toast state around the WeeklySummaryCard strip. The entry page manages this
 * state inline instead (it already has a toast container).
 */
import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import WeeklySummaryCard from "./WeeklySummaryCard";
import GoalModal from "./GoalModal";
import ToastContainer, { type ToastMessage } from "@/components/ui/Toast";
import type { WeeklyReadout } from "@/lib/domain/summary/weekly";
import type { UserSettings } from "@/lib/domain/types";

export default function WeeklySummarySection({
  readout,
  settings,
  today,
}: {
  readout: WeeklyReadout;
  settings: UserSettings;
  today: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const toastId = useRef(0);

  const pushToast = useCallback((text: string, ok: boolean) => {
    if (!text) return;
    toastId.current += 1;
    setToasts((t) => [...t, { id: toastId.current, kind: ok ? "success" : "error", text }]);
  }, []);
  const dismissToast = useCallback((id: number) => {
    setToasts((t) => t.filter((x) => x.id !== id));
  }, []);

  return (
    <>
      <WeeklySummaryCard
        readout={readout}
        hasGoal={settings.goal_weight_kg !== null}
        onSetGoal={() => setOpen(true)}
        variant="strip"
      />
      {open && (
        <GoalModal
          initial={settings}
          currentTrendWeight={readout.trend_weight_kg}
          today={today}
          onClose={() => setOpen(false)}
          onSaved={(msg, ok) => {
            pushToast(msg, ok);
            if (ok) router.refresh();
          }}
        />
      )}
      <ToastContainer toasts={toasts} dismiss={dismissToast} />
    </>
  );
}
