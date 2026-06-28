"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { recordHealthConsent } from "@/lib/data/consent";

/**
 * Record explicit health-data consent for the signed-in user, then send them
 * into the app. Submitted by the consent gate (components/nav/ConsentGate.tsx).
 *
 * The gate decision lives in the root layout (app/layout.tsx), so we must
 * revalidate the layout — otherwise the cached layout keeps rendering the gate
 * after the redirect and the user is bounced back to it in a loop.
 */
export async function giveConsentAction() {
  await recordHealthConsent();
  revalidatePath("/", "layout");
  redirect("/entry");
}
