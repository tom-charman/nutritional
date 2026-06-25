import DashboardTabs from "@/components/dashboard/DashboardTabs";
import { RDI_GUIDELINES, ROLLING_WINDOW_DAYS, type NutrientKey, type TargetMode } from "@/lib/constants";
import { db } from "@/lib/db/client";
import { getOrCreateDailyTargets, loadAllSummaries, loadUserSettings } from "@/lib/data/storage";
import { requireUserId } from "@/lib/data/user";
import { getNutrientMode } from "@/lib/domain/targets";
import {
  prepareCaloriesWeight,
  prepareMacroBreakdown,
  prepareNutrientsRdi,
} from "@/lib/domain/charts/prepare";
import { computeWeeklyReadout } from "@/lib/domain/summary/weekly";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const today = new Date().toISOString().slice(0, 10);
  const userId = await requireUserId();
  const [all, targets, settings] = await Promise.all([
    loadAllSummaries(db, userId),
    // current target modes drive the RDI strips' floor/ceiling semantics
    getOrCreateDailyTargets(db, userId, today),
    loadUserSettings(db, userId),
  ]);

  // Cap the range to yesterday — today is usually incomplete (callbacks.py:148-151)
  const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
  const summaries = all.filter((s) => s.date <= yesterday);

  const caloriesWeight = prepareCaloriesWeight(summaries, ROLLING_WINDOW_DAYS, settings.goal_weight_kg);
  const weeklyReadout = computeWeeklyReadout(caloriesWeight, summaries, settings, yesterday);
  const macroBreakdown = prepareMacroBreakdown(summaries, ROLLING_WINDOW_DAYS);

  // The panel measures intake against the user's CURRENT targets, not a generic
  // RDI. RDI_GUIDELINES' keys still define WHICH nutrients this panel tracks
  // (the curated micronutrient/limit set); the 100% datum is each one's target.
  const targetGuidelines = Object.fromEntries(
    (Object.keys(RDI_GUIDELINES) as NutrientKey[]).map((key) => [key, targets.values[key]]),
  ) as Partial<Record<NutrientKey, number>>;
  const nutrientsRdi = prepareNutrientsRdi(summaries, ROLLING_WINDOW_DAYS, targetGuidelines);

  const rdiModes = Object.fromEntries(
    (Object.keys(nutrientsRdi.series) as NutrientKey[]).map((key) => [
      key,
      getNutrientMode(targets, key),
    ]),
  ) as Record<NutrientKey, TargetMode>;

  return (
    <div className="visualizations-container">
      <DashboardTabs
        caloriesWeight={caloriesWeight}
        macroBreakdown={macroBreakdown}
        nutrientsRdi={nutrientsRdi}
        rdiModes={rdiModes}
        rdiGuidelines={targetGuidelines}
        weeklyReadout={weeklyReadout}
        userSettings={settings}
        today={today}
      />
    </div>
  );
}
