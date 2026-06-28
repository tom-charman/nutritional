"use client";

import { useActionState } from "react";
import { submitPrivacyRequest } from "@/app/actions/privacy";
import type { SubmitState } from "@/lib/privacy/requests";

const INITIAL: SubmitState = { status: "idle" };

const TYPE_OPTIONS: { value: string; label: string }[] = [
  { value: "access", label: "Access a copy of my data" },
  { value: "export", label: "Export my data" },
  { value: "correction", label: "Correct my data" },
  { value: "deletion", label: "Delete my data / account" },
  { value: "complaint", label: "Make a complaint" },
  { value: "other", label: "Something else" },
];

/**
 * Public privacy-request form. Submits to submitPrivacyRequest, which persists
 * the request and emails the controller privately. Includes an off-screen
 * honeypot ("company") to absorb bots.
 */
export default function ContactForm() {
  const [state, formAction, pending] = useActionState(
    submitPrivacyRequest,
    INITIAL,
  );

  if (state.status === "success") {
    return (
      <p className="contact-status" role="status">
        Thanks — your request has been received. We&rsquo;ll respond within one
        month, usually sooner.
      </p>
    );
  }

  return (
    <form action={formAction}>
      <div className="contact-field">
        <label htmlFor="requestType">What can we help with?</label>
        <select id="requestType" name="requestType" defaultValue="" required>
          <option value="" disabled>
            Choose…
          </option>
          {TYPE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      <div className="contact-field">
        <label htmlFor="email">Your email (so we can reply)</label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
        />
      </div>

      <div className="contact-field">
        <label htmlFor="message">Your request</label>
        <textarea id="message" name="message" rows={6} required />
      </div>

      {/* Honeypot: hidden from humans, attractive to bots. */}
      <div className="contact-honeypot" aria-hidden="true">
        <label htmlFor="company">Company</label>
        <input id="company" name="company" type="text" tabIndex={-1} autoComplete="off" />
      </div>

      <button type="submit" className="btn-primary btn" disabled={pending}>
        {pending ? "Sending…" : "Send request"}
      </button>

      {state.status === "error" && (
        <p className="contact-status is-error" role="alert">
          {state.error}
        </p>
      )}
    </form>
  );
}
