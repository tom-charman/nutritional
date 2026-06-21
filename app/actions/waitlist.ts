"use server";

import { auth } from "@/lib/auth";
import { addToWaitlist } from "@/lib/waitlist";

/**
 * Add the signed-in (but unauthorized) user to the waitlist. The email is read
 * from the session server-side — never trusted from the client — so there's
 * nothing to spoof or validate.
 */
export async function joinWaitlistAction(): Promise<{ ok: boolean }> {
  const session = await auth();
  const email = session?.user?.email;
  if (!email) return { ok: false };
  try {
    await addToWaitlist(email);
    return { ok: true };
  } catch {
    return { ok: false };
  }
}
