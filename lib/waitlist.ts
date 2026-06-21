import { promises as fs } from "node:fs";
import path from "node:path";

/**
 * Waitlist persistence — denied users can ask to be added to a plain-text
 * waitlist (one email per line). Stored on disk, not in the database, so it's
 * trivially readable/editable when granting access via AUTHORIZED_EMAILS.
 *
 * Path comes from WAITLIST_PATH. The default lives under the gitignored
 * `local_data/` dir for dev. In production the app runs from a rotated release
 * dir (see scripts/deploy.sh), so WAITLIST_PATH MUST be set to a stable
 * absolute path outside the release dir or the file is lost on the next deploy.
 */
export function waitlistPath(): string {
  return (
    process.env.WAITLIST_PATH ??
    path.join(process.cwd(), "local_data", "waitlist.txt")
  );
}

/** Append an email to the waitlist, normalized and de-duplicated. */
export async function addToWaitlist(email: string): Promise<void> {
  const normalized = email.trim().toLowerCase();
  if (!normalized) throw new Error("Cannot add an empty email to the waitlist");

  const file = waitlistPath();
  await fs.mkdir(path.dirname(file), { recursive: true });

  let existing = "";
  try {
    existing = await fs.readFile(file, "utf8");
  } catch {
    // File doesn't exist yet — first entry creates it.
  }
  const seen = new Set(
    existing
      .split("\n")
      .map((line) => line.trim().toLowerCase())
      .filter(Boolean),
  );
  if (seen.has(normalized)) return;

  await fs.appendFile(file, `${normalized}\n`, "utf8");
}
