import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

/**
 * postgres.js connection — tuned for the 1GB e2-micro:
 *  - max 4 connections (postgres max_connections=20 on the VM)
 *  - prepare:false keeps per-connection memory low
 *
 * Initialization is LAZY (first property access) so that `next build` can
 * import route modules without DATABASE_URL being set. Singleton on
 * globalThis so Next dev HMR doesn't leak pools.
 */
const globalForDb = globalThis as unknown as {
  __nutritionalSql?: ReturnType<typeof postgres>;
  __nutritionalDb?: PostgresJsDatabase<typeof schema>;
};

function getSql(): ReturnType<typeof postgres> {
  if (!globalForDb.__nutritionalSql) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is not set");
    globalForDb.__nutritionalSql = postgres(url, {
      max: 4,
      idle_timeout: 20,
      prepare: false,
    });
  }
  return globalForDb.__nutritionalSql;
}

function getDb(): PostgresJsDatabase<typeof schema> {
  if (!globalForDb.__nutritionalDb) {
    globalForDb.__nutritionalDb = drizzle(getSql(), { schema });
  }
  return globalForDb.__nutritionalDb;
}

/** Lazy proxies — the real client is created on first use, not at import. */
export const sql: ReturnType<typeof postgres> = new Proxy(
  function () {} as unknown as ReturnType<typeof postgres>,
  {
    get(_target, prop) {
      return Reflect.get(getSql(), prop);
    },
    apply(_target, _thisArg, args) {
      return Reflect.apply(getSql() as unknown as (...a: unknown[]) => unknown, undefined, args);
    },
  },
);

export const db: PostgresJsDatabase<typeof schema> = new Proxy(
  {} as PostgresJsDatabase<typeof schema>,
  {
    get(_target, prop) {
      const real = getDb();
      const value = Reflect.get(real, prop);
      return typeof value === "function" ? value.bind(real) : value;
    },
  },
);
