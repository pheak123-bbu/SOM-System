import { describe, expect, it } from "vitest";
import { matchCatalogProducts, isProductOrStockInquiry, normalizeKhmer } from "./matcher";

describe("Khmer Social Commerce Matcher", () => {
  const catalogue = [
    { id: "1", name: "អាវយឺតកប្បាស", sku: "SH-008", category: "សម្លៀកបំពាក់", variants: [{ name: "S" }, { name: "M" }, { name: "L" }] },
    { id: "2", name: "ក្រម៉ាត្បាញដោយដៃ", sku: "HM-003", category: "វត្ថុអនុស្សាវរីយ៍" },
    { id: "3", name: "ក្រម៉ាសូត្រ", sku: "AC-014", category: "វត្ថុអនុស្សាវរីយ៍" },
    { id: "4", name: "ខោជើងវែងក្រណាត់លីនិន", sku: "TR-021", category: "សម្លៀកបំពាក់" },
    { id: "5", name: "សំពត់ខ្មែរលំនាំផ្កា", sku: "FS-001", category: "សម្លៀកបំពាក់" },
  ];

  it("accurately matches 'តើមានអាវសាច់កប្បាសទេបង' to អាវយឺតកប្បាស", () => {
    const matches = matchCatalogProducts("តើមានអាវសាច់កប្បាសទេបង", catalogue);
    expect(matches.length).toBeGreaterThan(0);
    expect(matches[0].name).toBe("អាវយឺតកប្បាស");
  });

  it("matches 'តើមានក្រម៉ាត្បាញដោយដៃទេបង?' to ក្រម៉ាត្បាញដោយដៃ as top match", () => {
    const matches = matchCatalogProducts("តើមានក្រម៉ាត្បាញដោយដៃទេបង?", catalogue);
    expect(matches.length).toBeGreaterThan(0);
    expect(matches[0].name).toBe("ក្រម៉ាត្បាញដោយដៃ");
  });

  it("matches generic 'មានក្រម៉ាអត់បង?' to both kramas", () => {
    const matches = matchCatalogProducts("មានក្រម៉ាអត់បង?", catalogue);
    const names = matches.map((m) => m.name);
    expect(names).toContain("ក្រម៉ាត្បាញដោយដៃ");
    expect(names).toContain("ក្រម៉ាសូត្រ");
  });

  it("matches 'ខោលីនិននៅសល់អត់?' to ខោជើងវែងក្រណាត់លីនិន", () => {
    const matches = matchCatalogProducts("ខោលីនិននៅសល់អត់?", catalogue);
    expect(matches.length).toBeGreaterThan(0);
    expect(matches[0].name).toBe("ខោជើងវែងក្រណាត់លីនិន");
  });

  it("matches 'សំពត់ផ្កាតម្លៃប៉ុន្មាន?' to សំពត់ខ្មែរលំនាំផ្កា", () => {
    const matches = matchCatalogProducts("សំពត់ផ្កាតម្លៃប៉ុន្មាន?", catalogue);
    expect(matches.length).toBeGreaterThan(0);
    expect(matches[0].name).toBe("សំពត់ខ្មែរលំនាំផ្កា");
  });

  it("matches by SKU: SH-008", () => {
    const matches = matchCatalogProducts("យកកូដ SH-008 មួយ", catalogue);
    expect(matches.length).toBeGreaterThan(0);
    expect(matches[0].name).toBe("អាវយឺតកប្បាស");
  });

  it("returns empty array for unavailable products: 'មានស្បែកជើងអត់បង'", () => {
    const matches = matchCatalogProducts("មានស្បែកជើងអត់បង", catalogue);
    expect(matches.length).toBe(0);
  });

  it("identifies product inquiries correctly", () => {
    expect(isProductOrStockInquiry("តើមានអាវសាច់កប្បាសទេបង")).toBe(true);
    expect(isProductOrStockInquiry("តម្លៃប៉ុន្មានបង?")).toBe(true);
    expect(isProductOrStockInquiry("សល់អត់")).toBe(true);
    expect(isProductOrStockInquiry("012 345 678 ភ្នំពេញ")).toBe(false);
  });
});
