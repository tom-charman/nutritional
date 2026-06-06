import MealsClient from "@/components/meals/MealsClient";
import { db } from "@/lib/db/client";
import { loadFoodDatabase, loadMeals } from "@/lib/data/storage";

export const dynamic = "force-dynamic";

export default async function MealsPage() {
  const [foods, meals] = await Promise.all([loadFoodDatabase(db), loadMeals(db)]);
  return <MealsClient foods={foods} initialMeals={meals} />;
}
