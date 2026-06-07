import EntryClient from "@/components/entry/EntryClient";
import { db } from "@/lib/db/client";
import {
  getOrCreateDailyTargets,
  loadDailyEntry,
  loadFoodDatabase,
  loadMeals,
} from "@/lib/data/storage";

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

  const [foods, meals, day, targets] = await Promise.all([
    loadFoodDatabase(db),
    loadMeals(db),
    loadDailyEntry(db, date),
    getOrCreateDailyTargets(db, date),
  ]);

  return (
    <EntryClient
      date={date}
      today={today}
      foods={foods}
      meals={meals}
      initialDay={
        day ?? {
          date,
          entries: [],
          measurements: { morning_weight_kg: null, evening_weight_kg: null },
        }
      }
      targets={targets}
    />
  );
}
