/**
 * PGlite-backed test database seeded with the REAL schema from
 * database/init.sql — CHECK constraints, triggers, and defaults included.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { drizzle } from "drizzle-orm/pglite";
import * as schema from "@/lib/db/schema";
import type { DB } from "@/lib/data/storage";

const INIT_SQL = readFileSync(
  path.resolve(__dirname, "../../database/init.sql"),
  "utf-8",
);

export async function createTestDb(): Promise<{
  db: DB;
  userId: string;
  close: () => Promise<void>;
}> {
  const pglite = new PGlite({ extensions: { pgcrypto } });
  await pglite.exec(INIT_SQL);
  const db = drizzle(pglite, { schema }) as unknown as DB;
  const [u] = await db
    .insert(schema.users)
    .values({ email: "test@example.com", name: "Test User" })
    .returning({ id: schema.users.id });
  return { db, userId: u.id, close: () => pglite.close() };
}
