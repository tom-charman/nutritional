/**
 * Minimal in-memory fixed-window rate limiter.
 *
 * Deliberately in-memory (not DB-backed): the keys are client IPs, and we do
 * NOT want to persist IP addresses — that would expand the personal-data
 * surface. State lives only transiently in process memory and resets on
 * restart, which is fine for a single-process deployment.
 *
 * The core (`checkRateLimit`) is pure — it takes the store and the current time
 * — so it can be unit-tested deterministically.
 */

export interface RateLimitOptions {
  /** Max allowed hits per window. */
  limit: number;
  /** Window length in milliseconds. */
  windowMs: number;
}

interface WindowState {
  count: number;
  resetAt: number;
}

export interface RateLimitStore {
  hits: Map<string, WindowState>;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterMs: number;
}

export function createRateLimitStore(): RateLimitStore {
  return { hits: new Map() };
}

/** Drop expired entries when the map grows, so it can't leak memory. */
function prune(store: RateLimitStore, now: number): void {
  if (store.hits.size <= 5000) return;
  for (const [key, state] of store.hits) {
    if (now >= state.resetAt) store.hits.delete(key);
  }
}

/**
 * Record a hit for `key` and report whether it is allowed. Fixed window: the
 * first hit starts a window of `windowMs`; once `limit` hits land within it,
 * further hits are denied until the window resets.
 */
export function checkRateLimit(
  store: RateLimitStore,
  key: string,
  opts: RateLimitOptions,
  now: number,
): RateLimitResult {
  const state = store.hits.get(key);

  if (!state || now >= state.resetAt) {
    store.hits.set(key, { count: 1, resetAt: now + opts.windowMs });
    prune(store, now);
    return { allowed: true, remaining: opts.limit - 1, retryAfterMs: 0 };
  }

  if (state.count >= opts.limit) {
    return { allowed: false, remaining: 0, retryAfterMs: state.resetAt - now };
  }

  state.count += 1;
  return { allowed: true, remaining: opts.limit - state.count, retryAfterMs: 0 };
}
