import { test } from "@playwright/test";
import { resetE2EData } from "../reset-db";

/** Runs between the desktop and mobile projects so each starts clean. */
test("reset E2E data between projects", async () => {
  await resetE2EData();
});
