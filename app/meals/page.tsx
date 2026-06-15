import MealsClient from "@/components/meals/MealsClient";
import { db } from "@/lib/db/client";
import { getOrCreateDailyTargets, loadFoodDatabase, loadMeals } from "@/lib/data/storage";

export const dynamic = "force-dynamic";

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export default async function MealsPage() {
  // Meal templates are date-independent, but the nutrient preview shows each
  // meal's share of a day's targets — so use today's effective targets, the
  // same pigment-channel language as the daily-entry page.
  const [foods, meals, targets] = await Promise.all([
    loadFoodDatabase(db),
    loadMeals(db),
    getOrCreateDailyTargets(db, todayIso()),
  ]);
  return <MealsClient foods={foods} initialMeals={meals} targets={targets} />;
}
