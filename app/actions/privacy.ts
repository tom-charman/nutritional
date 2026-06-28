"use server";

/**
 * Privacy / data-subject request intake (the public contact form).
 *
 * Each submission is PERSISTED to privacy_requests first — that row is the
 * source of truth and the rights-request register — then a best-effort
 * notification email is sent. If the email fails the request is NOT lost and
 * the user still sees success. A hidden honeypot field silently absorbs bots.
 *
 * Pure validation + types live in lib/privacy/requests.ts (this file may only
 * export async functions).
 */
import { db } from "@/lib/db/client";
import { privacyRequests } from "@/lib/db/schema";
import { sendPrivacyRequestEmail } from "@/lib/email";
import { validatePrivacyRequest, type SubmitState } from "@/lib/privacy/requests";

/** Form action (useActionState). */
export async function submitPrivacyRequest(
  _prev: SubmitState,
  formData: FormData,
): Promise<SubmitState> {
  const v = validatePrivacyRequest({
    requestType: String(formData.get("requestType") ?? ""),
    email: String(formData.get("email") ?? ""),
    message: String(formData.get("message") ?? ""),
    honeypot: String(formData.get("company") ?? ""),
  });

  if (!v.ok) {
    // Bots get a silent "success" — no row, no email, no signal.
    if (v.spam) return { status: "success" };
    return { status: "error", error: v.error };
  }

  try {
    await db.insert(privacyRequests).values({
      requestType: v.value.requestType,
      requesterEmail: v.value.email,
      message: v.value.message,
    });
  } catch {
    return {
      status: "error",
      error: "Sorry, we couldn't submit your request. Please try again.",
    };
  }

  // Best-effort notification — the DB row above is the record of the request.
  try {
    await sendPrivacyRequestEmail({
      requestType: v.value.requestType,
      requesterEmail: v.value.email,
      message: v.value.message,
    });
  } catch {
    // Swallow: request is safely stored; the operator will see it in the register.
  }

  return { status: "success" };
}
