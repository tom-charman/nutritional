/**
 * Server-only health-data consent (GDPR Article 9).
 *
 * The app processes health-revealing data (weights, food logs, macro targets,
 * meal plans). Before any of that is shown or accepted, an authorised user must
 * give explicit consent, recorded on their users row. The consent gate
 * (rendered by app/layout.tsx) blocks the app until consent for the CURRENT
 * notice version is on file.
 *
 * Like lib/data/user.ts this touches the DB and must only run in the Node
 * runtime (server components / server actions), never the Edge middleware.
 */
import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { users } from "@/lib/db/schema";
import { HEALTH_CONSENT_VERSION } from "@/lib/constants";
import { requireUserId } from "@/lib/data/user";

/**
 * Does the current request's user still owe explicit health-data consent?
 *
 * Returns false for any request without an authenticated, allowlisted identity
 * (sign-in / denied flows are handled by the middleware, not the gate). Returns
 * true when the user has never consented OR consented to an older notice
 * version than the one now in force.
 */
export async function needsHealthConsent(): Promise<boolean> {
  let userId: string;
  try {
    userId = await requireUserId();
  } catch {
    // Not authenticated or not allowlisted — the gate does not apply.
    return false;
  }

  const [row] = await db
    .select({
      consentAt: users.healthConsentAt,
      consentVersion: users.healthConsentVersion,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!row) return false;
  return !row.consentAt || row.consentVersion !== HEALTH_CONSENT_VERSION;
}

/** Record explicit consent for the current user against the in-force version. */
export async function recordHealthConsent(): Promise<void> {
  const userId = await requireUserId();
  await db
    .update(users)
    .set({
      healthConsentAt: new Date(),
      healthConsentVersion: HEALTH_CONSENT_VERSION,
    })
    .where(eq(users.id, userId));
}
