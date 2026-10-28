import { describe, expect, it } from "vitest";
import { dayStartInZone, storeDayStart } from "@/lib/dates";

describe("store-local report day boundaries", () => {
  it("finds midnight in Phnom Penh independently of the host timezone", () => {
    expect(dayStartInZone("2026-10-17", "Asia/Phnom_Penh").toISOString()).toBe("2026-10-16T17:00:00.000Z");
  });

  it("rejects impossible calendar days", () => {
    expect(() => dayStartInZone("2026-02-30", "Asia/Phnom_Penh")).toThrow("Invalid report date.");
  });

  it("uses the given instant in the store timezone", () => {
    expect(storeDayStart(new Date("2026-10-17T18:00:00.000Z"), "Asia/Phnom_Penh").toISOString()).toBe("2026-10-17T17:00:00.000Z");
  });
});
