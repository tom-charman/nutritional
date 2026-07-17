import FoodsClient from "@/components/foods/FoodsClient";
import { db } from "@/lib/db/client";
import { loadFoodDatabaseWithOwnership } from "@/lib/data/storage";
import { requireUserId } from "@/lib/data/user";

export const dynamic = "force-dynamic";

export default async function FoodsPage() {
  const userId = await requireUserId();
  const foods = await loadFoodDatabaseWithOwnership(db, userId);
  return <FoodsClient initialFoods={foods} />;
}
