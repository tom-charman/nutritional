import FoodsClient from "@/components/foods/FoodsClient";
import { db } from "@/lib/db/client";
import { loadFoodDatabase } from "@/lib/data/storage";
import { requireUserId } from "@/lib/data/user";

export const dynamic = "force-dynamic";

export default async function FoodsPage() {
  const userId = await requireUserId();
  const foods = await loadFoodDatabase(db, userId);
  return <FoodsClient initialFoods={foods} />;
}
