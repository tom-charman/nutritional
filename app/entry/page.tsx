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
  loadWeekPlan,
} from "@/lib/data/storage";
import { redirect } from "next/navigation";
import { requireUserId } from "@/lib/data/user";
import { ROLLING_WINDOW_DAYS } from "@/lib/constants";
import { prepareCaloriesWeight } from "@/lib/domain/charts/prepare";
import { computeWeeklyReadout } from "@/lib/domain/summary/weekly";
import { mondayOf } from "@/lib/domain/plan/week";

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
  const requested =
    params.date && /^\d{4}-\d{2}-\d{2}$/.test(params.date) ? params.date : today;
  // A future date can't be logged — send it to the canonical (today) URL so the
  // address bar and the header agree, instead of silently clamping the param.
  if (requested > today) redirect("/entry");
  const date = requested;

  const userId = await requireUserId();
  const [foods, meals, recentFoods, day, targets, allSummaries, settings, weekPlan] =
    await Promise.all([
      loadFoodDatabase(db, userId),
      loadMeals(db, userId),
      loadRecentFoods(db, userId),
      loadDailyEntry(db, userId, date),
      getOrCreateDailyTargets(db, userId, date),
      loadAllSummaries(db, userId),
      loadUserSettings(db, userId),
      loadWeekPlan(db, userId, mondayOf(date)),
    ]);

  // Planned-but-not-yet-logged items for THIS day surface on the entry screen as
  // faint "ghost" suggestions the user adds with one click (the only bridge from
  // plan → log; the planner itself never writes to the diary).
  const planSuggestions = weekPlan.items.filter((it) => it.plan_date === date && !it.applied);

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
      planSuggestions={planSuggestions}
    />
  );
}
