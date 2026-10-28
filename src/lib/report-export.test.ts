import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildReportPrintHtml,
  exportOrdersXlsx,
  exportReportXlsx,
  exportDailyPreparationXlsx,
  DailyPreparationData,
} from "./report-export";

const data = {
  range: { from: "2026-10-01", to: "2026-10-19", timezone: "Asia/Phnom_Penh" },
  summary: { sales: 125.5, orders: 5, averageOrderValue: 25.1 },
  timeSeries: [{ date: "2026-10-19", sales: 125.5, orders: 5 }],
  channels: [{ channel: "FACEBOOK", sales: 125.5, orders: 5 }],
  bestSellers: [{ name: "សំពត់ <script>alert(1)</script>", units: 5, sales: 125.5 }],
  statuses: { CONFIRMED: 5 },
  suggestions: { APPROVED: 2 },
};

describe("report print template", () => {
  it("renders a branded print report with all report sections", () => {
    const html = buildReportPrintHtml(data, "សោភា ស្ទូឌីយោ", "USD", new Date("2026-10-19T09:00:00.000Z"));
    expect(html).toContain("របាយការណ៍លទ្ធផលហាង");
    expect(html).toContain("ការលក់ប្រចាំថ្ងៃ");
    expect(html).toContain("ផលិតផលលក់ដាច់");
    expect(html).toContain("ស្ថានភាពការបញ្ជាទិញ");
    expect(html).toContain("Asia/Phnom_Penh");
  });

  it("escapes user-controlled store and product values in the print template", () => {
    const html = buildReportPrintHtml(data, "<img src=x onerror=alert(1)>", "USD");
    expect(html).toContain("&lt;img src=x onerror=alert(1)&gt;");
    expect(html).toContain("សំពត់ &lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).not.toContain("<script>alert(1)</script>");
  });
});

describe("XLSX exports", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("creates a multi-sheet report workbook with numeric report values", async () => {
    const blobs: Blob[] = [];
    vi.spyOn(URL, "createObjectURL").mockImplementation((blob) => {
      if (blob instanceof Blob) blobs.push(blob);
      return "blob:report";
    });
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    vi.stubGlobal("document", { createElement: () => ({ click: vi.fn(), href: "", download: "" }) });
    vi.stubGlobal("window", { setTimeout: vi.fn() });

    await exportReportXlsx(data, "សោភា ស្ទូឌីយោ", "USD");

    const { default: ExcelJS } = await import("exceljs");
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(await blobs[0].arrayBuffer());
    expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual([
      "Overview", "Daily sales", "Channels", "Best sellers", "Order statuses", "Order detection",
    ]);
    expect(workbook.getWorksheet("Overview")?.getCell("B7").value).toBe(125.5);
    expect(workbook.getWorksheet("Daily sales")?.getCell("B2").value).toBe(125.5);
    expect(workbook.getWorksheet("Best sellers")?.getCell("A2").value).toBe("សំពត់ <script>alert(1)</script>");
  }, 60000);

  it("exports order rows to a frozen, filterable workbook", async () => {
    const blobs: Blob[] = [];
    vi.spyOn(URL, "createObjectURL").mockImplementation((blob) => {
      if (blob instanceof Blob) blobs.push(blob);
      return "blob:orders";
    });
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    vi.stubGlobal("document", { createElement: () => ({ click: vi.fn(), href: "", download: "" }) });
    vi.stubGlobal("window", { setTimeout: vi.fn() });

    await exportOrdersXlsx([{
      orderNumber: "SOM-1001", customer: "សុភា", phone: "012345678", itemNames: "អាវ",
      channel: "ហ្វេសប៊ុក", status: "បានបញ្ជាក់", courier: "J&T Express", trackingNumber: "JT12345",
      paymentMethod: "COD", paymentStatus: "PAID", total: 25.5, createdAt: "2026-10-19",
    }], "USD");

    const { default: ExcelJS } = await import("exceljs");
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(await blobs[0].arrayBuffer());
    const sheet = workbook.getWorksheet("Orders");
    expect(sheet?.getCell("A2").value).toBe("SOM-1001");
    expect(sheet?.getCell("G2").value).toBe("J&T Express");
    expect(sheet?.getCell("H2").value).toBe("JT12345");
    expect(sheet?.getCell("K2").value).toBe(25.5);
    expect(sheet?.views[0]).toMatchObject({ state: "frozen", ySplit: 1 });
    expect(sheet?.autoFilter).toBeDefined();
  });

  it("exports daily preparation and dispatch manifest workbook", async () => {
    const blobs: Blob[] = [];
    vi.spyOn(URL, "createObjectURL").mockImplementation((blob) => {
      if (blob instanceof Blob) blobs.push(blob);
      return "blob:daily-prep";
    });
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    vi.stubGlobal("document", { createElement: () => ({ click: vi.fn(), href: "", download: "" }) });
    vi.stubGlobal("window", { setTimeout: vi.fn() });

    const prepData: DailyPreparationData = {
      date: "2026-10-20",
      storeName: "ហាងសាកល្បង",
      currency: "USD",
      exchangeRate: 4100,
      orders: [
        {
          id: "ord-1",
          orderNumber: "SOM-101",
          customer: "សុខា",
          phone: "012345678",
          province: "ភ្នំពេញ",
          courier: "J&T Express",
          trackingNumber: "JT999",
          paymentMethod: "COD",
          paymentStatus: "UNPAID",
          status: "CONFIRMED",
          channel: "TELEGRAM",
          total: 25,
          deliveryAddress: "ផ្ទះលេខ ១២ ផ្លូវ ២០០",
          itemNames: "អាវយឺត (Size L - ពណ៌ខ្មៅ)",
          createdAt: "2026-10-20T10:00:00.000Z",
          items: [
            {
              productName: "អាវយឺត",
              variantName: "Size L - ពណ៌ខ្មៅ",
              quantity: 2,
              unitPrice: 10,
              lineTotal: 20,
            },
          ],
        },
      ],
    };

    await exportDailyPreparationXlsx(prepData);

    const { default: ExcelJS } = await import("exceljs");
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(await blobs[0].arrayBuffer());

    expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual([
      "Packing Summary",
      "Dispatch Manifest",
    ]);

    const packSheet = workbook.getWorksheet("Packing Summary");
    expect(packSheet?.getCell("B2").value).toBe("អាវយឺត");
    expect(packSheet?.getCell("D2").value).toBe(2);

    const dispatchSheet = workbook.getWorksheet("Dispatch Manifest");
    expect(dispatchSheet?.getCell("B2").value).toBe("SOM-101");
    expect(dispatchSheet?.getCell("C2").value).toBe("សុខា");
    expect(dispatchSheet?.getCell("I2").value).toBe(25);
  });
});
