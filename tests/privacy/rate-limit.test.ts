import { describe, expect, it } from "vitest";
import {
  checkRateLimit,
  createRateLimitStore,
} from "@/lib/rateLimit";

const OPTS = { limit: 3, windowMs: 1000 };

describe("checkRateLimit", () => {
  it("allows up to the limit, then denies within the window", () => {
    const store = createRateLimitStore();
    expect(checkRateLimit(store, "a", OPTS, 0).allowed).toBe(true); // 1
    expect(checkRateLimit(store, "a", OPTS, 10).allowed).toBe(true); // 2
    expect(checkRateLimit(store, "a", OPTS, 20).allowed).toBe(true); // 3
    const fourth = checkRateLimit(store, "a", OPTS, 30); // 4 → denied
    expect(fourth.allowed).toBe(false);
    expect(fourth.remaining).toBe(0);
    expect(fourth.retryAfterMs).toBe(1000 - 30);
  });

  it("resets once the window has elapsed", () => {
    const store = createRateLimitStore();
    checkRateLimit(store, "a", OPTS, 0);
    checkRateLimit(store, "a", OPTS, 0);
    checkRateLimit(store, "a", OPTS, 0);
    expect(checkRateLimit(store, "a", OPTS, 999).allowed).toBe(false); // still in window
    expect(checkRateLimit(store, "a", OPTS, 1000).allowed).toBe(true); // window reset
  });

  it("tracks keys independently", () => {
    const store = createRateLimitStore();
    checkRateLimit(store, "a", OPTS, 0);
    checkRateLimit(store, "a", OPTS, 0);
    checkRateLimit(store, "a", OPTS, 0);
    expect(checkRateLimit(store, "a", OPTS, 0).allowed).toBe(false);
    // a different key (e.g. another IP) is unaffected
    expect(checkRateLimit(store, "b", OPTS, 0).allowed).toBe(true);
  });

  it("reports remaining allowance", () => {
    const store = createRateLimitStore();
    expect(checkRateLimit(store, "a", OPTS, 0).remaining).toBe(2);
    expect(checkRateLimit(store, "a", OPTS, 0).remaining).toBe(1);
    expect(checkRateLimit(store, "a", OPTS, 0).remaining).toBe(0);
  });
});
