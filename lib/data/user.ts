/**
 * Server-only user resolution + provisioning.
 *
 * This is deliberately NOT in lib/auth.ts: that module is imported by the Edge
 * middleware (proxy.ts), where the postgres.js client cannot run. Everything
 * here touches the DB and so must only ever be called from server actions and
 * server components (Node runtime).
 *
 * requireUserId() maps the signed-in identity to a stable users.id, creating
 * the row on first sight (the "sign-up" — gated by the AUTHORIZED_EMAILS
 * allowlist). Resolving by email on every call is what lets an already-issued
 * session self-heal after the multi-user deploy with no forced re-login.
 */
import "server-only";
import { eq } from "drizzle-orm";
import { auth, isAuthorizedEmail, parseAllowlist } from "@/lib/auth";
import { db } from "@/lib/db/client";
import { users } from "@/lib/db/schema";

const AUTH_DISABLED =
  process.env.AUTH_DISABLED === "true" && process.env.NODE_ENV !== "production";

/** The email a dev/e2e run acts as when auth is bypassed. */
function bypassEmail(): string | undefined {
  const explicit = process.env.TEST_USER_EMAIL?.trim().toLowerCase();
  if (explicit) return explicit;
  // Fall back to the first allowlisted email so an unconfigured local run still
  // resolves to a real user.
  const [first] = parseAllowlist(process.env.AUTHORIZED_EMAILS);
  return first;
}

/**
 * Resolve the current request's user id, provisioning the users row if needed.
 * Throws if there is no authenticated, allowlisted identity.
 */
export async function requireUserId(): Promise<string> {
  let email: string | null | undefined;
  let name: string | null | undefined;

  if (AUTH_DISABLED) {
    email = bypassEmail();
  } else {
    const session = await auth();
    email = session?.user?.email;
    name = session?.user?.name;
  }

  if (!email) throw new Error("Not authenticated");
  return getOrCreateUserId(email, name);
}

/**
 * Look up a user by (normalized) email; create the row if missing and the email
 * is allowlisted. Concurrency-safe via ON CONFLICT + re-select.
 */
export async function getOrCreateUserId(
  email: string,
  name?: string | null,
): Promise<string> {
  const normalized = email.trim().toLowerCase();

  const existing = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, normalized))
    .limit(1);
  if (existing.length) return existing[0].id;

  // Provisioning is gated by the same allowlist the middleware enforces, so a
  // stray identity can never mint a user row.
  if (!isAuthorizedEmail(normalized)) {
    throw new Error("Not authorized");
  }

  const inserted = await db
    .insert(users)
    .values({ email: normalized, name: name ?? null })
    .onConflictDoNothing({ target: users.email })
    .returning({ id: users.id });
  if (inserted.length) return inserted[0].id;

  // Lost an insert race — the row now exists, fetch it.
  const again = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, normalized))
    .limit(1);
  return again[0].id;
}
