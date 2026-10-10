import "server-only";
import { getServerEnv } from "@/lib/env";

/**
 * Minimal in-memory sliding-window rate limiter, keyed by client IP.
 *
 * CAVEAT (document this for deployment): this state lives in a single
 * server process's memory. On a traditional long-running Node server
 * (e.g. a single container) that's an accurate global limit. On a
 * serverless/edge platform with multiple concurrent instances (e.g.
 * Vercel), each instance gets its own counter, so the *effective* limit
 * is (RATE_LIMIT_REQUESTS_PER_MINUTE x number of warm instances) rather
 * than a hard global ceiling. For a strict global limit in that
 * environment, replace this with a shared store (Upstash Redis /
 * Vercel KV) behind the same `checkRateLimit` signature -- the call
 * sites don't need to change.
 */
const buckets = new Map<string, { count: number; windowStart: number }>();
const WINDOW_MS = 60_000;

export function checkRateLimit(key: string): { allowed: boolean; remaining: number } {
  const limit = getServerEnv().RATE_LIMIT_REQUESTS_PER_MINUTE;
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || now - bucket.windowStart >= WINDOW_MS) {
    buckets.set(key, { count: 1, windowStart: now });
    return { allowed: true, remaining: limit - 1 };
  }

  if (bucket.count >= limit) {
    return { allowed: false, remaining: 0 };
  }

  bucket.count += 1;
  return { allowed: true, remaining: limit - bucket.count };
}

export function clientKeyFromHeaders(headers: Headers): string {
  // Standard reverse-proxy header; Vercel and most hosts set this.
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return "unknown";
}

/**
 * Rate-limit key for an authenticated admin write (sources/authorities/
 * schools/programs create, boundary publish/rollback). Keyed by user id
 * rather than IP: several admins can legitimately share an office IP
 * (IP-keying would let one throttle the others), and this also bounds a
 * single compromised/scripted admin session regardless of which IP it
 * calls from.
 */
export function adminWriteKey(userId: string): string {
  return `admin-write:${userId}`;
}

/** Exposed only for tests -- resets all buckets. */
export function _resetRateLimitForTests() {
  buckets.clear();
}
