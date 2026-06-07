import { defineConfig } from "drizzle-kit";

/**
 * drizzle-kit is used for `introspect`/`check` ONLY — the production schema
 * already exists (database/init.sql) and is maintained there. NEVER run
 * `drizzle-kit push` or `migrate` against this database.
 */
export default defineConfig({
  dialect: "postgresql",
  schema: "./lib/db/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "",
  },
});
