import PlannerClient from "@/components/planner/PlannerClient";
import { db } from "@/lib/db/client";
import {
  getOrCreateDailyTargets,
  loadFoodDatabase,
  loadMeals,
  loadRecentFoods,
  loadWeekPlan,
} from "@/lib/data/storage";
import { requireUserId } from "@/lib/data/user";
import { aggregateWeek } from "@/lib/domain/plan/aggregate";
import { planDayVerdict, type DayVerdict } from "@/lib/domain/plan/verdict";
import { mondayOf, weekDates } from "@/lib/domain/plan/week";

export const dynamic = "force-dynamic";

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export default async function PlannerPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string }>;
}) {
  const params = await searchParams;
  const today = todayIso();
  // The planner is deliberately NOT capped at today — planning the future is the
  // point. (Only applying a plan into the LOG is today-only; see planner.ts.)
  const requested =
    params.week && /^\d{4}-\d{2}-\d{2}$/.test(params.week) ? params.week : today;
  const weekStart = mondayOf(requested);

  const userId = await requireUserId();
  const [week, meals, foods, recentFoods, targets] = await Promise.all([
    loadWeekPlan(db, userId, weekStart),
    loadMeals(db, userId),
    loadFoodDatabase(db, userId),
    loadRecentFoods(db, userId),
    // One effective targets set (today's) drives per-day verdicts + weekly RDI.
    getOrCreateDailyTargets(db, userId, today),
  ]);

  const dates = weekDates(weekStart);
  const aggregate = aggregateWeek(week);
  const verdicts: Record<string, DayVerdict> = {};
  for (const d of dates) verdicts[d] = planDayVerdict(aggregate.byDay[d], targets);

  return (
    <PlannerClient
      weekStart={weekStart}
      today={today}
      initialWeek={week}
      meals={meals}
      foods={foods}
      recentFoods={recentFoods}
      aggregate={aggregate}
      verdicts={verdicts}
      targets={targets}
    />
  );
}
