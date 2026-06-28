/**
 * Privacy-request validation + types. Plain module (NOT "use server") so the
 * pure validator and the constants can be imported by the server action, the
 * client form, and unit tests alike. The DB/email side effects live in
 * app/actions/privacy.ts.
 */

export const REQUEST_TYPES = [
  "access",
  "export",
  "correction",
  "deletion",
  "complaint",
  "other",
] as const;
export type RequestType = (typeof REQUEST_TYPES)[number];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_MESSAGE = 5000;

export interface PrivacyRequestInput {
  requestType: string;
  email: string;
  message: string;
  /** Honeypot — must be empty for a real human. */
  honeypot?: string;
}

export type ValidationResult =
  | { ok: true; value: { requestType: RequestType; email: string; message: string } }
  | { ok: false; spam?: boolean; error: string };

/** Pure validation (no DB / no email) so it can be unit-tested directly. */
export function validatePrivacyRequest(input: PrivacyRequestInput): ValidationResult {
  if (input.honeypot && input.honeypot.trim() !== "") {
    return { ok: false, spam: true, error: "" };
  }

  const requestType = input.requestType?.trim();
  if (!REQUEST_TYPES.includes(requestType as RequestType)) {
    return { ok: false, error: "Please choose a request type." };
  }

  const email = input.email?.trim().toLowerCase() ?? "";
  if (!EMAIL_RE.test(email)) {
    return { ok: false, error: "Please enter a valid email address so we can reply." };
  }

  const message = input.message?.trim() ?? "";
  if (message.length === 0) {
    return { ok: false, error: "Please describe your request." };
  }
  if (message.length > MAX_MESSAGE) {
    return { ok: false, error: "Your message is too long." };
  }

  return { ok: true, value: { requestType: requestType as RequestType, email, message } };
}

export interface SubmitState {
  status: "idle" | "success" | "error";
  error?: string;
}
