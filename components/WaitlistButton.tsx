"use client";

import { useState, useTransition } from "react";
import { joinWaitlistAction } from "@/app/actions/waitlist";

/**
 * Waitlist opt-in for denied users. Calls the server action (which reads the
 * email from the session) and swaps to a confirmation line on success.
 */
export default function WaitlistButton() {
  const [pending, startTransition] = useTransition();
  const [state, setState] = useState<"idle" | "done" | "error">("idle");

  if (state === "done") {
    return (
      <p className="denied-waitlist-confirm">
        You&rsquo;re on the waitlist — we&rsquo;ll be in touch.
      </p>
    );
  }

  return (
    <div className="denied-waitlist">
      <button
        type="button"
        className="btn btn-primary"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const res = await joinWaitlistAction();
            setState(res.ok ? "done" : "error");
          })
        }
      >
        {pending ? "Adding…" : "Join the waitlist"}
      </button>
      {state === "error" && (
        <p className="denied-waitlist-error">
          Something went wrong. Please try again.
        </p>
      )}
    </div>
  );
}
