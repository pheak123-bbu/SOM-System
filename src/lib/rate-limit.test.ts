import { describe, expect, it } from "vitest";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";

describe("Rate Limiting", () => {
  it("allows requests under the limit and tracks remaining quota", async () => {
    const key = `test-user-${Date.now()}`;
    const r1 = await checkRateLimit(key, 3, 60);
    expect(r1.success).toBe(true);
    expect(r1.remaining).toBe(2);

    const r2 = await checkRateLimit(key, 3, 60);
    expect(r2.success).toBe(true);
    expect(r2.remaining).toBe(1);

    const r3 = await checkRateLimit(key, 3, 60);
    expect(r3.success).toBe(true);
    expect(r3.remaining).toBe(0);

    const r4 = await checkRateLimit(key, 3, 60);
    expect(r4.success).toBe(false);
    expect(r4.remaining).toBe(0);
  });

  it("extracts client IP from x-forwarded-for and headers correctly", () => {
    const req1 = new Request("http://localhost/test", {
      headers: { "x-forwarded-for": "203.0.113.195, 70.41.3.18" },
    });
    expect(getClientIp(req1)).toBe("203.0.113.195");

    const req2 = new Request("http://localhost/test", {
      headers: { "x-real-ip": "198.51.100.42" },
    });
    expect(getClientIp(req2)).toBe("198.51.100.42");

    const req3 = new Request("http://localhost/test");
    expect(getClientIp(req3)).toBe("127.0.0.1");
  });
});
