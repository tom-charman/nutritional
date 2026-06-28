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
import { headers } from "next/headers";
import { db } from "@/lib/db/client";
import { privacyRequests } from "@/lib/db/schema";
import { sendPrivacyRequestEmail } from "@/lib/email";
import { validatePrivacyRequest, type SubmitState } from "@/lib/privacy/requests";
import { checkRateLimit, createRateLimitStore } from "@/lib/rateLimit";

// In-memory limiter, singleton across HMR/module reloads. Keys are client IPs
// (and one global bucket) — never persisted (see lib/rateLimit.ts).
const globalForRl = globalThis as unknown as {
  __privacyRl?: ReturnType<typeof createRateLimitStore>;
};
const rlStore = (globalForRl.__privacyRl ??= createRateLimitStore());

const PER_IP = { limit: 5, windowMs: 10 * 60_000 }; // 5 / 10 min per IP
const GLOBAL = { limit: 100, windowMs: 10 * 60_000 }; // 100 / 10 min backstop

/** Best-effort client IP from the reverse proxy; "unknown" shares one bucket. */
async function clientIp(): Promise<string> {
  const h = await headers();
  const fwd = h.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return h.get("x-real-ip")?.trim() || "unknown";
}

/** Form action (useActionState). */
export async function submitPrivacyRequest(
  _prev: SubmitState,
  formData: FormData,
): Promise<SubmitState> {
  // Rate limit before any work: per-IP first, then a global backstop. Counts
  // every attempt (incl. bots/invalid) so a flood from one source is capped.
  const now = Date.now();
  const tooMany =
    !checkRateLimit(rlStore, `ip:${await clientIp()}`, PER_IP, now).allowed ||
    !checkRateLimit(rlStore, "global", GLOBAL, now).allowed;
  if (tooMany) {
    return {
      status: "error",
      error: "Too many requests just now. Please try again in a few minutes.",
    };
  }

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
