/**
 * GDPR erasure — operator tool. Export-then-delete one user's personal data.
 *
 * This is the technical half of the manual deletion runbook (see
 * compliance/rights-procedure.md). It does NOT decide whether deletion is
 * warranted, verify identity, remove the email from AUTHORIZED_EMAILS, or touch
 * the waitlist file — those are manual steps the operator must do as well.
 *
 * USAGE (against the target database):
 *   DATABASE_URL=postgresql://… npx tsx scripts/gdpr-delete-user.ts <email> [--out <dir>] [--confirm]
 *
 *   Without --confirm it is a DRY RUN: it writes the JSON export and reports the
 *   row counts that WOULD be deleted, but deletes nothing. Re-run with --confirm
 *   to actually erase. The export is always written first so the data is
 *   captured before any deletion.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { eq } from "drizzle-orm";
import { db, sql } from "@/lib/db/client";
import { users } from "@/lib/db/schema";
import { collectAllUserData, deleteAllUserData } from "@/lib/data/gdpr";

function parseArgs(argv: string[]): { email: string; out: string; confirm: boolean } {
  const args = argv.slice(2);
  let email = "";
  let out = "./gdpr-exports";
  let confirm = false;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--confirm") confirm = true;
    else if (a === "--out") out = args[++i];
    else if (!a.startsWith("--")) email = a;
  }
  return { email: email.trim().toLowerCase(), out, confirm };
}

async function main() {
  const { email, out, confirm } = parseArgs(process.argv);
  if (!email) {
    console.error("Usage: tsx scripts/gdpr-delete-user.ts <email> [--out <dir>] [--confirm]");
    process.exit(1);
  }

  const [user] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);
  if (!user) {
    console.error(`No user found for ${email}`);
    process.exit(1);
  }

  // 1. Export first — capture the data before deleting anything.
  const data = await collectAllUserData(db, user.id);
  mkdirSync(out, { recursive: true });
  const stamp = new Date().toISOString().slice(0, 10);
  const file = path.join(out, `nutritional-export-${email}-${stamp}.json`);
  writeFileSync(file, JSON.stringify(data, null, 2), "utf8");
  console.log(`Exported ${email} → ${file}`);

  if (!confirm) {
    console.log("\nDRY RUN — nothing deleted. Re-run with --confirm to erase.");
    console.log("Reminder of the MANUAL steps deletion still needs:");
    console.log("  • remove the email from AUTHORIZED_EMAILS (else it is re-provisioned on next login)");
    console.log("  • remove the email from the waitlist file (WAITLIST_PATH)");
    await sql.end();
    return;
  }

  // 2. Erase.
  const summary = await deleteAllUserData(db, user.id);
  console.log(`\nDeleted ${email}. Rows removed per table:`);
  for (const [table, n] of Object.entries(summary)) {
    console.log(`  ${table}: ${n}`);
  }
  console.log("\nNOW DO THE MANUAL STEPS:");
  console.log("  • remove the email from AUTHORIZED_EMAILS");
  console.log("  • remove the email from the waitlist file (WAITLIST_PATH)");
  console.log("  • deleted data ages out of nightly backups over the retention cycle (not restored to live)");
  await sql.end();
}

main().catch(async (e) => {
  console.error(e);
  await sql.end();
  process.exit(1);
});
