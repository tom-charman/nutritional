"use server";

/**
 * Cross-day user settings server actions (goal weight, weekly-rate target).
 * Mirrors the load/save + ActionResult pattern of the entry/targets actions;
 * upserts the single user_settings row.
 */
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db/client";
import { loadUserSettings, saveUserSettings } from "@/lib/data/storage";
import type { UserSettings } from "@/lib/domain/types";
import type { ActionResult } from "@/app/actions/entry";

export async function getUserSettingsAction(): Promise<UserSettings> {
  return loadUserSettings(db);
}

export async function saveUserSettingsAction(s: UserSettings): Promise<ActionResult> {
  if (
    s.goal_weight_kg !== null &&
    (!Number.isFinite(s.goal_weight_kg) || s.goal_weight_kg <= 0 || s.goal_weight_kg > 500)
  ) {
    return { ok: false, message: "Goal weight must be between 0 and 500 kg" };
  }
  if (
    s.weekly_rate_target_kg !== null &&
    (!Number.isFinite(s.weekly_rate_target_kg) || Math.abs(s.weekly_rate_target_kg) > 3.5)
  ) {
    return { ok: false, message: "Weekly rate target must be within ±3.5 kg/week" };
  }

  await saveUserSettings(db, s);
  revalidatePath("/");
  revalidatePath("/entry");
  return { ok: true, message: "Goal saved" };
}

/** Show/hide the Weekly Trend panel (a single-field update). */
export async function setWeeklyPanelHiddenAction(hidden: boolean): Promise<ActionResult> {
  const current = await loadUserSettings(db);
  await saveUserSettings(db, { ...current, hide_weekly_panel: hidden });
  revalidatePath("/");
  revalidatePath("/entry");
  return { ok: true, message: hidden ? "Weekly trend hidden" : "Weekly trend shown" };
}
