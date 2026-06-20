import EntryClient from "@/components/entry/EntryClient";
import { db } from "@/lib/db/client";
import {
  getOrCreateDailyTargets,
  loadAllSummaries,
  loadDailyEntry,
  loadFoodDatabase,
  loadMeals,
  loadRecentFoods,
  loadUserSettings,
} from "@/lib/data/storage";
import { ROLLING_WINDOW_DAYS } from "@/lib/constants";
import { prepareCaloriesWeight } from "@/lib/domain/charts/prepare";
import { computeWeeklyReadout } from "@/lib/domain/summary/weekly";

export const dynamic = "force-dynamic";

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export default async function EntryPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const params = await searchParams;
  const today = todayIso();
  let date = params.date && /^\d{4}-\d{2}-\d{2}$/.test(params.date) ? params.date : today;
  if (date > today) date = today; // max allowed = today

  const [foods, meals, recentFoods, day, targets, allSummaries, settings] = await Promise.all([
    loadFoodDatabase(db),
    loadMeals(db),
    loadRecentFoods(db),
    loadDailyEntry(db, date),
    getOrCreateDailyTargets(db, date),
    loadAllSummaries(db),
    loadUserSettings(db),
  ]);

  // The weekly trend is a global readout (not date-specific): compute it as of
  // yesterday, since today is usually incomplete.
  const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
  const trendSummaries = allSummaries.filter((s) => s.date <= yesterday);
  const caloriesWeight = prepareCaloriesWeight(trendSummaries, ROLLING_WINDOW_DAYS, settings.goal_weight_kg);
  const weeklyReadout = computeWeeklyReadout(caloriesWeight, trendSummaries, settings, yesterday);

  return (
    <EntryClient
      date={date}
      today={today}
      foods={foods}
      meals={meals}
      recentFoods={recentFoods}
      initialDay={
        day ?? {
          date,
          entries: [],
          measurements: { morning_weight_kg: null, evening_weight_kg: null },
        }
      }
      targets={targets}
      weeklyReadout={weeklyReadout}
      userSettings={settings}
    />
  );
}
