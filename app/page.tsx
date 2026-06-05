import DashboardTabs from "@/components/dashboard/DashboardTabs";
import { ROLLING_WINDOW_DAYS } from "@/lib/constants";
import { db } from "@/lib/db/client";
import { loadAllSummaries } from "@/lib/data/storage";
import {
  prepareCaloriesWeight,
  prepareMacroBreakdown,
  prepareNutrientsRdi,
} from "@/lib/domain/charts/prepare";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const all = await loadAllSummaries(db);

  // Cap the range to yesterday — today is usually incomplete (callbacks.py:148-151)
  const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
  const summaries = all.filter((s) => s.date <= yesterday);

  const caloriesWeight = prepareCaloriesWeight(summaries, ROLLING_WINDOW_DAYS);
  const macroBreakdown = prepareMacroBreakdown(summaries, ROLLING_WINDOW_DAYS);
  const nutrientsRdi = prepareNutrientsRdi(summaries, ROLLING_WINDOW_DAYS);

  return (
    <div className="visualizations-container">
      <DashboardTabs
        caloriesWeight={caloriesWeight}
        macroBreakdown={macroBreakdown}
        nutrientsRdi={nutrientsRdi}
      />
    </div>
  );
}
