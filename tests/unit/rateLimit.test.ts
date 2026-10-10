import { describe, it, expect, beforeEach } from "vitest";
import { checkRateLimit, clientKeyFromHeaders, _resetRateLimitForTests } from "@/lib/rateLimit";

describe("checkRateLimit", () => {
  beforeEach(() => {
    _resetRateLimitForTests();
  });

  it("allows requests under the limit", () => {
    const r1 = checkRateLimit("key-a");
    const r2 = checkRateLimit("key-a");
    expect(r1.allowed).toBe(true);
    expect(r2.allowed).toBe(true);
    expect(r2.remaining).toBeLessThan(r1.remaining);
  });

  it("blocks requests once the per-minute limit is exceeded", () => {
    const limit = Number(process.env.RATE_LIMIT_REQUESTS_PER_MINUTE || "30");
    for (let i = 0; i < limit; i++) {
      expect(checkRateLimit("key-b").allowed).toBe(true);
    }
    expect(checkRateLimit("key-b").allowed).toBe(false);
  });

  it("tracks separate keys independently", () => {
    for (let i = 0; i < 30; i++) checkRateLimit("exhaust-me");
    expect(checkRateLimit("exhaust-me").allowed).toBe(false);
    expect(checkRateLimit("fresh-key").allowed).toBe(true);
  });
});

describe("clientKeyFromHeaders", () => {
  it("uses the first entry of x-forwarded-for", () => {
    const headers = new Headers({ "x-forwarded-for": "203.0.113.5, 10.0.0.1" });
    expect(clientKeyFromHeaders(headers)).toBe("203.0.113.5");
  });

  it("falls back to 'unknown' when the header is absent", () => {
    expect(clientKeyFromHeaders(new Headers())).toBe("unknown");
  });
});
