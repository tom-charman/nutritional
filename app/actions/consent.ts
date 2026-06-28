"use server";

import { redirect } from "next/navigation";
import { recordHealthConsent } from "@/lib/data/consent";

/**
 * Record explicit health-data consent for the signed-in user, then send them
 * into the app. Submitted by the consent gate (components/nav/ConsentGate.tsx).
 */
export async function giveConsentAction() {
  await recordHealthConsent();
  redirect("/entry");
}
