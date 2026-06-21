import PlannerClient from "@/components/planner/PlannerClient";
import { db } from "@/lib/db/client";
import { loadFoodDatabase, loadMeals, loadWeekPlan } from "@/lib/data/storage";
import { requireUserId } from "@/lib/data/user";
import { mondayOf } from "@/lib/domain/plan/week";

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
  const [week, meals, foods] = await Promise.all([
    loadWeekPlan(db, userId, weekStart),
    loadMeals(db, userId),
    loadFoodDatabase(db, userId),
  ]);

  return (
    <PlannerClient
      weekStart={weekStart}
      today={today}
      initialWeek={week}
      meals={meals}
      foods={foods}
    />
  );
}
