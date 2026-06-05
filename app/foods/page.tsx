import FoodsClient from "@/components/foods/FoodsClient";
import { db } from "@/lib/db/client";
import { loadFoodDatabase } from "@/lib/data/storage";

export const dynamic = "force-dynamic";

export default async function FoodsPage() {
  const foods = await loadFoodDatabase(db);
  return <FoodsClient initialFoods={foods} />;
}
