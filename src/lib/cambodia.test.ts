import { describe, expect, it } from "vitest";
import {
  calculateCustomerTier,
  formatCambodiaPhone,
  formatDualCurrency,
  formatKHR,
  formatUSD,
  generateBakongKHQRString,
  khrToUsd,
  parseLiveSaleComment,
  toKhmerDigits,
  usdToKhr,
} from "./cambodia";
import { generateKHQRDataURL } from "./khqr-image";

describe("Cambodia localization and financial engine", () => {
  it("formats dual currency accurately with default 4100 exchange rate", () => {
    expect(usdToKhr(10)).toBe(41000);
    expect(khrToUsd(41000)).toBe(10);
    expect(formatUSD(12.5)).toBe("$12.50");
    expect(formatKHR(51250)).toBe("៛51,250");
    expect(formatDualCurrency(10)).toBe("$10.00 (៛41,000)");
  });

  it("converts western numbers to Khmer digits", () => {
    expect(toKhmerDigits("0123456789")).toBe("០១២៣៤៥៦៧៨៩");
    expect(formatDualCurrency(10, 4100, true)).toBe("$១០.០០ (៛៤១,០០០)");
  });

  it("formats Cambodian phone numbers", () => {
    expect(formatCambodiaPhone("012345678")).toBe("012 345 678");
    expect(formatCambodiaPhone("+85512345678")).toBe("012 345 678");
  });

  it("calculates customer tiers and risk badges correctly", () => {
    const vip = calculateCustomerTier(6, 250, 0);
    expect(vip.tier).toBe("VIP");

    const regular = calculateCustomerTier(3, 40, 0);
    expect(regular.tier).toBe("REGULAR");

    const newCust = calculateCustomerTier(1, 15, 0);
    expect(newCust.tier).toBe("NEW");

    const risk = calculateCustomerTier(4, 50, 2);
    expect(risk.tier).toBe("COD_RISK");
  });

  it("generates a valid EMVCo Bakong KHQR payload with CRC16", () => {
    const khqr = generateBakongKHQRString({
      bakongAccountId: "seller@aba",
      merchantName: "SOM Store",
      amountUSD: 15.5,
      orderNumber: "SS-20261020-A1B2",
    });

    expect(khqr).toContain("000201");
    expect(khqr).toContain("5303840"); // Currency 840 (USD)
    expect(khqr).toContain("540515.50"); // Amount 15.50
    expect(khqr).toContain("5802KH"); // Country KH
    expect(khqr).toMatch(/6304[0-9A-F]{4}$/); // Ends with 4-hex CRC
  });

  it("generates a scannable KHQR data URL image", async () => {
    const dataUrl = await generateKHQRDataURL({
      amountUSD: 25.0,
      orderNumber: "SS-20261020-TEST",
    });
    expect(dataUrl).toMatch(/^data:image\/png;base64,/);
  });

  it("parses live sale comments into structured orders", () => {
    const parsed = parseLiveSaleComment("012 889 977 សុខា ភ្នំពេញ ទួលគោក យកអាវស ២");
    expect(parsed.phone).toBe("012 889 977");
    expect(parsed.province?.nameEn).toBe("Phnom Penh");
  });
});
