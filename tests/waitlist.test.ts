import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { addToWaitlist } from "@/lib/waitlist";

let dir: string;
let file: string;

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), "waitlist-"));
  file = path.join(dir, "nested", "waitlist.txt");
  process.env.WAITLIST_PATH = file;
});

afterEach(async () => {
  delete process.env.WAITLIST_PATH;
  await fs.rm(dir, { recursive: true, force: true });
});

describe("addToWaitlist", () => {
  it("creates the file (and parent dirs) with one email per line", async () => {
    await addToWaitlist("alice@example.com");
    await addToWaitlist("bob@example.com");
    expect(await fs.readFile(file, "utf8")).toBe(
      "alice@example.com\nbob@example.com\n",
    );
  });

  it("normalizes and de-duplicates by lowercased/trimmed email", async () => {
    await addToWaitlist("Alice@Example.com");
    await addToWaitlist("  alice@example.com  ");
    await addToWaitlist("ALICE@EXAMPLE.COM");
    expect(await fs.readFile(file, "utf8")).toBe("alice@example.com\n");
  });

  it("rejects an empty email", async () => {
    await expect(addToWaitlist("   ")).rejects.toThrow();
  });
});
