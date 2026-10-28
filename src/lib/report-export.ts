export type ReportExportData = {
  range: { from: string; to: string; timezone: string };
  summary: { sales: number; orders: number; averageOrderValue: number };
  timeSeries: { date: string; sales: number; orders: number }[];
  channels: { channel: string; sales: number; orders: number }[];
  bestSellers: { name: string; units: number; sales: number }[];
  statuses: Record<string, number>;
  suggestions: Record<string, number>;
};

export type OrderExportRow = {
  orderNumber: string;
  customer: string;
  phone: string;
  itemNames: string;
  channel: string;
  status: string;
  courier?: string | null;
  trackingNumber?: string | null;
  paymentMethod?: string | null;
  paymentStatus?: string | null;
  total: number;
  createdAt: string;
};

type ExportLabels = {
  channelNames: Record<string, string>;
  statusLabels: Record<string, string>;
  suggestionStatusNames: Record<string, string>;
};

const reportLabels: ExportLabels = {
  channelNames: { FACEBOOK: "ហ្វេសប៊ុក", TIKTOK: "ធីកតុក", TELEGRAM: "តេលេក្រាម", DIRECT: "ផ្ទាល់", OTHER: "ផ្សេងៗ" },
  statusLabels: {
    DRAFT: "សេចក្ដីព្រាង", PENDING_CONFIRMATION: "រង់ចាំការបញ្ជាក់", CONFIRMED: "បានបញ្ជាក់",
    PROCESSING: "កំពុងរៀបចំ", SHIPPED: "បានដឹកជញ្ជូន", DELIVERED: "បានប្រគល់", CANCELLED: "បានបោះបង់",
  },
  suggestionStatusNames: {
    PENDING: "រង់ចាំពិនិត្យ", APPROVED: "បានអនុម័ត", NOT_AN_ORDER: "មិនមែនការបញ្ជាទិញ",
    DISMISSED: "បានបដិសេធ", DUPLICATE: "ស្ទួន", FAILED: "បរាជ័យ",
  },
};

const currencyFormatter = (currency: string) => new Intl.NumberFormat("en-US", {
  style: "currency", currency, maximumFractionDigits: 2,
});
const formatMoney = (amount: number, currency: string) => currencyFormatter(currency).format(amount);
const displayLabel = (key: string, map: Record<string, string>) => map[key] ?? key;

/**
 * Escapes HTML characters safely without using the deprecated window.escape which corrupts Unicode Khmer characters into %uXXXX.
 */
function escapeHtml(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
// Module-scoped escape alias so that ${escape(...)} template tags safely format HTML without Unicode URI encoding
const escape = escapeHtml;

export async function exportOrdersXlsx(rows: OrderExportRow[], currency: string) {
  const { default: ExcelJS } = await import("exceljs");
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Social Seller Order Manager";
  workbook.created = new Date();
  const sheet = workbook.addWorksheet("Orders", { views: [{ state: "frozen", ySplit: 1 }] });
  sheet.columns = [
    { header: "Order number", key: "orderNumber", width: 22 },
    { header: "Customer", key: "customer", width: 28 },
    { header: "Phone", key: "phone", width: 19 },
    { header: "Products", key: "itemNames", width: 44 },
    { header: "Channel", key: "channel", width: 18 },
    { header: "Status", key: "status", width: 24 },
    { header: "Courier", key: "courier", width: 16 },
    { header: "Tracking #", key: "trackingNumber", width: 20 },
    { header: "Payment Method", key: "paymentMethod", width: 18 },
    { header: "Payment Status", key: "paymentStatus", width: 16 },
    { header: `Total (${currency})`, key: "total", width: 18, style: { numFmt: `"${currency}" #,##0.00` } },
    { header: "Created at", key: "createdAt", width: 24 },
  ];
  sheet.addRows(rows);
  styleWorksheet(sheet);
  await saveWorkbook(workbook, "social-seller-orders.xlsx");
}

export async function exportReportXlsx(data: ReportExportData, store: string, currency: string) {
  const { default: ExcelJS } = await import("exceljs");
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Social Seller Order Manager";
  workbook.created = new Date();
  workbook.subject = `${store} ${data.range.from} - ${data.range.to}`;

  const overview = workbook.addWorksheet("Overview");
  overview.columns = [{ width: 34 }, { width: 34 }];
  overview.addRows([
    ["SOCIAL SELLER ORDER MANAGER", ""],
    ["Store", store],
    ["Report period", `${data.range.from} — ${data.range.to}`],
    ["Store timezone", data.range.timezone],
    [],
    ["Metric", "Value"],
    ["Sales", data.summary.sales],
    ["Included orders", data.summary.orders],
    ["Average order value", data.summary.averageOrderValue],
  ]);
  overview.mergeCells("A1:B1");
  overview.getCell("A1").font = { bold: true, size: 16, color: { argb: "FFFFFFFF" } };
  overview.getCell("A1").fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF17356F" } };
  overview.getRow(6).eachCell((cell) => applyHeaderStyle(cell));
  [7, 9].forEach((rowNumber) => { overview.getCell(`B${rowNumber}`).numFmt = `"${currency}" #,##0.00`; });

  const sheets: { name: string; headers: string[]; rows: (string | number)[][]; moneyColumn?: number }[] = [
    {
      name: "Daily sales", headers: ["Date", "Sales", "Orders"],
      rows: data.timeSeries.map((row) => [row.date, row.sales, row.orders]), moneyColumn: 2,
    },
    {
      name: "Channels", headers: ["Channel", "Sales", "Orders"],
      rows: data.channels.map((row) => [displayLabel(row.channel, reportLabels.channelNames), row.sales, row.orders]), moneyColumn: 2,
    },
    {
      name: "Best sellers", headers: ["Product", "Units sold", "Sales"],
      rows: data.bestSellers.map((row) => [row.name, row.units, row.sales]), moneyColumn: 3,
    },
    {
      name: "Order statuses", headers: ["Status", "Orders"],
      rows: Object.entries(data.statuses).map(([status, count]) => [displayLabel(status, reportLabels.statusLabels), count]),
    },
    {
      name: "Order detection", headers: ["Review status", "Suggestions"],
      rows: Object.entries(data.suggestions).map(([status, count]) => [displayLabel(status, reportLabels.suggestionStatusNames), count]),
    },
  ];
  for (const definition of sheets) {
    const sheet = workbook.addWorksheet(definition.name, { views: [{ state: "frozen", ySplit: 1 }] });
    sheet.addRow(definition.headers);
    definition.rows.forEach((row) => sheet.addRow(row));
    sheet.columns.forEach((column, index) => { column.width = index === 0 ? 30 : 20; });
    if (definition.moneyColumn) {
      sheet.getColumn(definition.moneyColumn).numFmt = `"${currency}" #,##0.00`;
    }
    styleWorksheet(sheet);
  }
  await saveWorkbook(workbook, `social-seller-report-${data.range.from}-${data.range.to}.xlsx`);
}

function applyHeaderStyle(cell: import("exceljs").Cell) {
  cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
  cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF2458C7" } };
  cell.alignment = { vertical: "middle" };
}

function styleWorksheet(sheet: import("exceljs").Worksheet) {
  const header = sheet.getRow(1);
  header.height = 26;
  header.eachCell((cell) => applyHeaderStyle(cell));
  sheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: Math.max(1, sheet.rowCount), column: sheet.columnCount },
  };
  for (let row = 2; row <= sheet.rowCount; row++) {
    if (row % 2 === 0) {
      sheet.getRow(row).eachCell((cell) => {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF4F7FC" } };
      });
    }
  }
}

async function saveWorkbook(workbook: import("exceljs").Workbook, fileName: string) {
  const contents = await workbook.xlsx.writeBuffer();
  const blob = new Blob([new Uint8Array(contents)], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export interface ReportPrintOptions {
  phone?: string;
  address?: string;
  exchangeRate?: number;
}

export function buildReportPrintHtml(
  data: ReportExportData,
  store: string,
  currency: string,
  optionsOrDate?: ReportPrintOptions | Date,
  generatedAtDate?: Date
) {
  let options: ReportPrintOptions = {};
  let generatedAt = new Date();

  if (optionsOrDate instanceof Date) {
    generatedAt = optionsOrDate;
  } else if (optionsOrDate && typeof optionsOrDate === "object") {
    options = optionsOrDate;
    if (generatedAtDate instanceof Date) {
      generatedAt = generatedAtDate;
    }
  }

  const rate = options.exchangeRate || 4100;
  const escape = (value: unknown) => String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character] ?? character);

  const formatKhrAmount = (amountUSD: number) => `៛${Math.round(amountUSD * rate).toLocaleString("en-US")}`;
  const formatUsdAmount = (amountUSD: number) => formatMoney(amountUSD, currency);

  // Top sales channel
  const sortedChannels = [...data.channels].sort((a, b) => b.sales - a.sales);
  const topChannel = sortedChannels[0] || null;
  const channelShare = topChannel && data.summary.sales > 0
    ? Math.round((topChannel.sales / data.summary.sales) * 100)
    : 0;

  // Filter daily sales: show active days if any exist to prevent huge 30-day $0.00 printouts
  const activeTimeSeries = data.timeSeries.filter((row) => row.sales > 0 || row.orders > 0);
  const displayTimeSeries = activeTimeSeries.length > 0 ? activeTimeSeries : data.timeSeries;
  const sumDailySales = displayTimeSeries.reduce((sum, r) => sum + r.sales, 0);
  const sumDailyOrders = displayTimeSeries.reduce((sum, r) => sum + r.orders, 0);

  // Totals for channels
  const totalChannelSales = data.channels.reduce((sum, c) => sum + c.sales, 0);
  const totalChannelOrders = data.channels.reduce((sum, c) => sum + c.orders, 0);

  // Totals for best sellers
  const totalProductUnits = data.bestSellers.reduce((sum, p) => sum + p.units, 0);
  const totalProductSales = data.bestSellers.reduce((sum, p) => sum + p.sales, 0);

  // Totals for statuses
  const totalOrdersCount = Object.values(data.statuses).reduce((sum, count) => sum + count, 0);
  const totalSuggestionsCount = Object.values(data.suggestions).reduce((sum, count) => sum + count, 0);

  return `<!doctype html>
<html lang="km">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${escape(store)} · របាយការណ៍លទ្ធផលហាង</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Kantumruy+Pro:ital,wght@0,100..700;1,100..700&display=swap" rel="stylesheet">
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Kantumruy+Pro:ital,wght@0,100..700;1,100..700&display=swap');
    @page {
      size: A4 portrait;
      margin: 12mm 14mm 14mm;
    }
    * {
      box-sizing: border-box;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    body, button, table, th, td, div, span, p, h1, h2, h3, h4, h5, h6, strong, b, small {
      font-family: 'Kantumruy Pro', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif !important;
    }
    body {
      margin: 0;
      color: #0f172a;
      background: #f8fafc;
      font-size: 11px;
      line-height: 1.5;
    }
    .print-wrapper {
      max-width: 820px;
      margin: 0 auto;
      background: #ffffff;
      padding: 24px 28px 32px;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.05);
    }

    /* Screen-only Controls */
    .screen-toolbar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      max-width: 820px;
      margin: 14px auto 10px;
      padding: 10px 16px;
      background: #ffffff;
      border: 1px solid #e2e8f0;
      border-radius: 10px;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
    }
    .toolbar-hint {
      color: #64748b;
      font-size: 11px;
    }
    .toolbar-actions {
      display: flex;
      gap: 8px;
    }
    .btn {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 7px 14px;
      border-radius: 6px;
      font-family: inherit;
      font-size: 11px;
      font-weight: 600;
      cursor: pointer;
      border: 1px solid transparent;
      transition: all 0.15s ease;
    }
    .btn-primary {
      background: #142c68;
      color: #ffffff;
    }
    .btn-primary:hover {
      background: #1d4ed8;
    }
    .btn-outline {
      background: #ffffff;
      color: #475569;
      border-color: #cbd5e1;
    }
    .btn-outline:hover {
      background: #f1f5f9;
    }

    /* Executive Header */
    .report-header {
      border: 1px solid #e2e8f0;
      border-top: 4px solid #142c68;
      border-radius: 10px;
      padding: 18px 22px;
      background: #ffffff;
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 20px;
      margin-bottom: 16px;
    }
    .brand-tag {
      font-size: 9px;
      font-weight: 700;
      letter-spacing: 0.1em;
      color: #2357c6;
      text-transform: uppercase;
      margin-bottom: 4px;
    }
    .report-title {
      font-size: 20px;
      font-weight: 700;
      color: #0f172a;
      margin: 0 0 4px;
    }
    .store-name {
      font-size: 13px;
      font-weight: 600;
      color: #334155;
      margin-bottom: 4px;
    }
    .store-contact {
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
      color: #64748b;
      font-size: 10px;
    }
    .meta-box {
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      padding: 10px 14px;
      font-size: 10px;
      min-width: 240px;
    }
    .meta-row {
      display: flex;
      justify-content: space-between;
      gap: 12px;
      margin-bottom: 4px;
    }
    .meta-row:last-child {
      margin-bottom: 0;
    }
    .meta-label {
      color: #64748b;
    }
    .meta-value {
      font-weight: 600;
      color: #1e293b;
      text-align: right;
    }

    /* Executive KPI Metrics Grid */
    .metrics-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 10px;
      margin-bottom: 16px;
    }
    .metric-card {
      background: #ffffff;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      padding: 12px 14px;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.02);
    }
    .metric-card .title {
      font-size: 10px;
      color: #64748b;
      font-weight: 500;
      margin-bottom: 6px;
    }
    .metric-card .main-val {
      font-size: 16px;
      font-weight: 700;
      color: #0f172a;
      font-variant-numeric: tabular-nums;
      margin-bottom: 2px;
    }
    .metric-card .sub-val {
      font-size: 10px;
      color: #0284c7;
      font-weight: 600;
      font-variant-numeric: tabular-nums;
    }
    .metric-card .caption {
      font-size: 9px;
      color: #94a3b8;
      margin-top: 4px;
    }

    /* Two Columns Section */
    .grid-2 {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 14px;
      margin-bottom: 16px;
    }
    .section-card {
      background: #ffffff;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      padding: 12px 14px;
      page-break-inside: avoid;
      break-inside: avoid;
    }
    .section-card.full-width {
      margin-bottom: 16px;
    }
    .section-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 8px;
      padding-bottom: 6px;
      border-bottom: 2px solid #142c68;
    }
    .section-header h2 {
      margin: 0;
      font-size: 12px;
      font-weight: 700;
      color: #0f172a;
    }
    .section-header .tag {
      font-size: 9px;
      color: #64748b;
      background: #f1f5f9;
      padding: 2px 6px;
      border-radius: 4px;
    }

    /* Standardized Financial Tables */
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 10px;
      font-variant-numeric: tabular-nums;
    }
    thead {
      display: table-header-group;
    }
    tfoot {
      display: table-footer-group;
    }
    tr {
      page-break-inside: avoid;
      break-inside: avoid;
    }
    th {
      background: #f8fafc;
      color: #475569;
      font-weight: 600;
      text-align: left;
      padding: 6px 8px;
      border-bottom: 1px solid #cbd5e1;
      font-size: 9.5px;
      text-transform: uppercase;
      letter-spacing: 0.02em;
    }
    td {
      padding: 6px 8px;
      border-bottom: 1px solid #f1f5f9;
      color: #334155;
      vertical-align: middle;
    }
    tbody tr:nth-child(even) td {
      background-color: #fafbfc;
    }
    tfoot td {
      background: #f8fafc;
      font-weight: 700;
      color: #0f172a;
      border-top: 1px solid #cbd5e1;
      border-bottom: none;
      padding: 7px 8px;
    }
    .text-right {
      text-align: right !important;
    }
    .text-center {
      text-align: center !important;
    }
    .rank-pill {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 18px;
      height: 18px;
      border-radius: 50%;
      background: #e2e8f0;
      color: #334155;
      font-size: 9px;
      font-weight: 700;
    }
    .rank-pill.top {
      background: #dbeafe;
      color: #1e40af;
    }
    .channel-badge {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      font-weight: 600;
      color: #1e293b;
    }
    .share-bar-container {
      display: flex;
      align-items: center;
      gap: 6px;
      justify-content: flex-end;
    }
    .share-bar {
      width: 45px;
      height: 5px;
      background: #e2e8f0;
      border-radius: 3px;
      overflow: hidden;
    }
    .share-bar-fill {
      height: 100%;
      background: #2563eb;
      border-radius: 3px;
    }
    .empty-notice {
      color: #94a3b8;
      text-align: center;
      padding: 18px;
      font-size: 10px;
      margin: 0;
    }
    .table-caption-note {
      font-size: 9px;
      color: #64748b;
      margin-top: 6px;
      margin-bottom: 0;
    }

    /* Formal Signatures and Stamp Section */
    .signature-section {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 40px;
      margin-top: 24px;
      padding-top: 14px;
      border-top: 1px dashed #cbd5e1;
      page-break-inside: avoid;
      break-inside: avoid;
    }
    .sig-box {
      text-align: center;
    }
    .sig-box .sig-title {
      font-size: 10px;
      font-weight: 600;
      color: #334155;
      margin-bottom: 45px;
    }
    .sig-box .sig-line {
      width: 180px;
      margin: 0 auto 5px;
      border-bottom: 1px solid #94a3b8;
    }
    .sig-box .sig-sub {
      font-size: 9px;
      color: #64748b;
    }

    /* Executive Footer */
    .report-footer {
      margin-top: 20px;
      padding-top: 8px;
      border-top: 1px solid #e2e8f0;
      display: flex;
      justify-content: space-between;
      color: #94a3b8;
      font-size: 8.5px;
    }

    @media print {
      body {
        background: #ffffff;
      }
      .screen-toolbar {
        display: none !important;
      }
      .print-wrapper {
        padding: 0;
        box-shadow: none;
        max-width: 100%;
      }
      .section-card {
        border-color: #cbd5e1;
      }
      th {
        background: #f1f5f9 !important;
      }
      tbody tr:nth-child(even) td {
        background-color: #f8fafc !important;
      }
      tfoot td {
        background: #f1f5f9 !important;
      }
    }
  </style>
</head>
<body>
  <div class="screen-toolbar">
    <div class="toolbar-hint">
      <strong>ទិដ្ឋភាពបោះពុម្ពរបាយការណ៍</strong> · ក្នុងផ្ទាំង Print សូមជ្រើស «Save as PDF» ដើម្បីរក្សាទុកជាឯកសារ PDF
    </div>
    <div class="toolbar-actions">
      <button class="btn btn-outline" onclick="window.close()">បិទបង្អួច</button>
      <button class="btn btn-primary" onclick="window.print()">បោះពុម្ព / រក្សាទុកជា PDF</button>
    </div>
  </div>

  <div class="print-wrapper">
    <!-- Executive Branded Header -->
    <header class="report-header">
      <div>
        <div class="brand-tag">SOM · SOCIAL SELLER ORDER MANAGER</div>
        <h1 class="report-title">របាយការណ៍លទ្ធផលហាង</h1>
        <div class="store-name">${escape(store)}</div>
        <div class="store-contact">
          ${options.phone ? `<span>ទូរស័ព្ទ: <strong>${escape(options.phone)}</strong></span>` : ""}
          ${options.address ? `<span>ទីតាំង: <strong>${escape(options.address)}</strong></span>` : ""}
        </div>
      </div>
      <div class="meta-box">
        <div class="meta-row">
          <span class="meta-label">កាលបរិច្ឆេទបង្កើត:</span>
          <span class="meta-value">${escape(generatedAt.toLocaleString("en-GB", { dateStyle: "short", timeStyle: "short" }))}</span>
        </div>
        <div class="meta-row">
          <span class="meta-label">ចន្លោះកាលបរិច្ឆេទ:</span>
          <span class="meta-value">${escape(data.range.from)} — ${escape(data.range.to)}</span>
        </div>
        <div class="meta-row">
          <span class="meta-label">អត្រាប្តូរប្រាក់:</span>
          <span class="meta-value">$1 = ${rate.toLocaleString()} ៛</span>
        </div>
        <div class="meta-row">
          <span class="meta-label">តំបន់ម៉ោង:</span>
          <span class="meta-value">${escape(data.range.timezone)}</span>
        </div>
      </div>
    </header>

    <!-- Executive KPI Metrics Grid -->
    <div class="metrics-grid">
      <div class="metric-card">
        <div class="title">ចំណូលសរុប (Net Sales)</div>
        <div class="main-val">${escape(formatUsdAmount(data.summary.sales))}</div>
        <div class="sub-val">(${escape(formatKhrAmount(data.summary.sales))})</div>
        <div class="caption">រាប់ការបញ្ជាទិញជោគជ័យ</div>
      </div>
      <div class="metric-card">
        <div class="title">ការបញ្ជាទិញដែលបានរាប់</div>
        <div class="main-val">${data.summary.orders.toLocaleString()} កម្មង់</div>
        <div class="caption">បានបញ្ជាក់ ដល់ បានប្រគល់</div>
      </div>
      <div class="metric-card">
        <div class="title">តម្លៃមធ្យមក្នុងមួយការបញ្ជាទិញ</div>
        <div class="main-val">${escape(formatUsdAmount(data.summary.averageOrderValue))}</div>
        <div class="sub-val">(${escape(formatKhrAmount(data.summary.averageOrderValue))})</div>
        <div class="caption">ចំណូលមធ្យម / ១ កម្មង់</div>
      </div>
      <div class="metric-card">
        <div class="title">បណ្តាញលក់នាំមុខ</div>
        <div class="main-val">${topChannel ? escape(displayLabel(topChannel.channel, reportLabels.channelNames)) : "—"}</div>
        <div class="sub-val">${topChannel ? `${escape(formatUsdAmount(topChannel.sales))} (${channelShare}%)` : "—"}</div>
        <div class="caption">ចំណូលខ្ពស់ជាងគេក្នុងចន្លោះពេល</div>
      </div>
    </div>

    <!-- Side-by-Side: Channels & Best Sellers -->
    <div class="grid-2">
      <!-- Sales by Channel -->
      <section class="section-card">
        <div class="section-header">
          <h2>ការលក់តាមបណ្ដាញ</h2>
          <span class="tag">${data.channels.length} បណ្ដាញ</span>
        </div>
        ${data.channels.length ? `
          <table>
            <thead>
              <tr>
                <th>បណ្ដាញ</th>
                <th class="text-center">កម្មង់</th>
                <th class="text-right">ការលក់ ($)</th>
                <th class="text-right">សមាមាត្រ</th>
              </tr>
            </thead>
            <tbody>
              ${data.channels.map((row) => {
                const share = data.summary.sales > 0 ? Math.round((row.sales / data.summary.sales) * 100) : 0;
                return `
                  <tr>
                    <td>
                      <span class="channel-badge">${escape(displayLabel(row.channel, reportLabels.channelNames))}</span>
                    </td>
                    <td class="text-center">${row.orders}</td>
                    <td class="text-right">
                      <strong>${escape(formatUsdAmount(row.sales))}</strong>
                      <div style="font-size:8.5px;color:#64748b;">${escape(formatKhrAmount(row.sales))}</div>
                    </td>
                    <td class="text-right">
                      <div class="share-bar-container">
                        <span>${share}%</span>
                        <div class="share-bar"><div class="share-bar-fill" style="width:${share}%"></div></div>
                      </div>
                    </td>
                  </tr>
                `;
              }).join("")}
            </tbody>
            <tfoot>
              <tr>
                <td>សរុប</td>
                <td class="text-center">${totalChannelOrders}</td>
                <td class="text-right">
                  <strong>${escape(formatUsdAmount(totalChannelSales))}</strong>
                  <div style="font-size:8.5px;color:#0284c7;">${escape(formatKhrAmount(totalChannelSales))}</div>
                </td>
                <td class="text-right">100%</td>
              </tr>
            </tfoot>
          </table>
        ` : `<p class="empty-notice">មិនមានទិន្នន័យការលក់តាមបណ្ដាញទេ</p>`}
      </section>

      <!-- Best Sellers -->
      <section class="section-card">
        <div class="section-header">
          <h2>ផលិតផលលក់ដាច់</h2>
          <span class="tag">${data.bestSellers.length} មុខទំនិញ</span>
        </div>
        ${data.bestSellers.length ? `
          <table>
            <thead>
              <tr>
                <th style="width:30px;">ល.រ</th>
                <th>ផលិតផល</th>
                <th class="text-center">ចំនួន</th>
                <th class="text-right">ការលក់សរុប</th>
              </tr>
            </thead>
            <tbody>
              ${data.bestSellers.map((product, idx) => `
                <tr>
                  <td><span class="rank-pill ${idx === 0 ? "top" : ""}">${idx + 1}</span></td>
                  <td><strong>${escape(product.name)}</strong></td>
                  <td class="text-center">${product.units}</td>
                  <td class="text-right">
                    <strong>${escape(formatUsdAmount(product.sales))}</strong>
                    <div style="font-size:8.5px;color:#64748b;">${escape(formatKhrAmount(product.sales))}</div>
                  </td>
                </tr>
              `).join("")}
            </tbody>
            <tfoot>
              <tr>
                <td colspan="2">សរុបផលិតផល</td>
                <td class="text-center">${totalProductUnits}</td>
                <td class="text-right">
                  <strong>${escape(formatUsdAmount(totalProductSales))}</strong>
                  <div style="font-size:8.5px;color:#0284c7;">${escape(formatKhrAmount(totalProductSales))}</div>
                </td>
              </tr>
            </tfoot>
          </table>
        ` : `<p class="empty-notice">មិនទាន់មានទិន្នន័យផលិតផលលក់ក្នុងចន្លោះពេលនេះទេ</p>`}
      </section>
    </div>

    <!-- Daily Sales Performance (Clean, filtered from zero-dollar empty lines) -->
    <section class="section-card full-width">
      <div class="section-header">
        <h2>ការលក់ប្រចាំថ្ងៃ</h2>
        <span class="tag">
          ${activeTimeSeries.length > 0
            ? `${activeTimeSeries.length} ថ្ងៃមានការលក់ (ក្នុងចំណោម ${data.timeSeries.length} ថ្ងៃ)`
            : `${data.timeSeries.length} ថ្ងៃ`}
        </span>
      </div>
      ${displayTimeSeries.length ? `
        <table>
          <thead>
            <tr>
              <th>កាលបរិច្ឆេទ</th>
              <th class="text-center">ការបញ្ជាទិញ (Orders)</th>
              <th class="text-right">ការលក់ជាដុល្លារ (USD)</th>
              <th class="text-right">សមមូលប្រាក់រៀល (KHR)</th>
            </tr>
          </thead>
          <tbody>
            ${displayTimeSeries.map((row) => `
              <tr>
                <td><strong>${escape(row.date)}</strong></td>
                <td class="text-center">${row.orders}</td>
                <td class="text-right"><strong>${escape(formatUsdAmount(row.sales))}</strong></td>
                <td class="text-right" style="color:#0284c7;">${escape(formatKhrAmount(row.sales))}</td>
              </tr>
            `).join("")}
          </tbody>
          <tfoot>
            <tr>
              <td>សរុបការលក់ប្រចាំថ្ងៃ</td>
              <td class="text-center">${sumDailyOrders}</td>
              <td class="text-right"><strong>${escape(formatUsdAmount(sumDailySales))}</strong></td>
              <td class="text-right" style="color:#0284c7;"><strong>${escape(formatKhrAmount(sumDailySales))}</strong></td>
            </tr>
          </tfoot>
        </table>
        ${activeTimeSeries.length > 0 && activeTimeSeries.length < data.timeSeries.length
          ? `<p class="table-caption-note">* បង្ហាញតែថ្ងៃដែលមានប្រតិបត្តិការលក់ជាក់ស្តែង ដើម្បីកាត់បន្ថយទំហំទំព័របោះពុម្ព។ ថ្ងៃដែលគ្មានការលក់ ($0.00) ត្រូវបានលាក់ដោយស្វ័យប្រវត្តិ។</p>`
          : ""
        }
      ` : `<p class="empty-notice">មិនមានទិន្នន័យការលក់ក្នុងចន្លោះពេលនេះទេ</p>`}
    </section>

    <!-- Side-by-Side Lower: Order Statuses & AI Detection -->
    <div class="grid-2">
      <!-- Order Statuses -->
      <section class="section-card">
        <div class="section-header">
          <h2>ស្ថានភាពការបញ្ជាទិញ</h2>
          <span class="tag">សរុប ${totalOrdersCount}</span>
        </div>
        <table>
          <thead>
            <tr>
              <th>ស្ថានភាព</th>
              <th class="text-right">ចំនួន</th>
              <th class="text-right">សមាមាត្រ</th>
            </tr>
          </thead>
          <tbody>
            ${Object.entries(data.statuses).map(([status, count]) => {
              const pct = totalOrdersCount > 0 ? Math.round((count / totalOrdersCount) * 100) : 0;
              return `
                <tr>
                  <td>${escape(displayLabel(status, reportLabels.statusLabels))}</td>
                  <td class="text-right"><strong>${count}</strong></td>
                  <td class="text-right" style="color:#64748b;">${pct}%</td>
                </tr>
              `;
            }).join("")}
          </tbody>
        </table>
      </section>

      <!-- AI Order Detection Suggestions -->
      <section class="section-card">
        <div class="section-header">
          <h2>លទ្ធផលការរកឃើញការបញ្ជាទិញ</h2>
          <span class="tag">សរុប ${totalSuggestionsCount}</span>
        </div>
        <table>
          <thead>
            <tr>
              <th>ស្ថានភាពសំណើ</th>
              <th class="text-right">ចំនួន</th>
              <th class="text-right">សមាមាត្រ</th>
            </tr>
          </thead>
          <tbody>
            ${Object.entries(data.suggestions).map(([status, count]) => {
              const pct = totalSuggestionsCount > 0 ? Math.round((count / totalSuggestionsCount) * 100) : 0;
              return `
                <tr>
                  <td>${escape(displayLabel(status, reportLabels.suggestionStatusNames))}</td>
                  <td class="text-right"><strong>${count}</strong></td>
                  <td class="text-right" style="color:#64748b;">${pct}%</td>
                </tr>
              `;
            }).join("")}
          </tbody>
        </table>
      </section>
    </div>

    <!-- Official Signatures and Stamp Section -->
    <div class="signature-section">
      <div class="sig-box">
        <div class="sig-title">អ្នករៀបចំរបាយការណ៍ (Prepared By)</div>
        <div class="sig-line"></div>
        <div class="sig-sub">ហត្ថលេខា / ឈ្មោះបុគ្គលិក</div>
      </div>
      <div class="sig-box">
        <div class="sig-title">ការអនុម័តពីម្ចាស់ហាង (Approved By)</div>
        <div class="sig-line"></div>
        <div class="sig-sub">ហត្ថលេខា និងត្រាហាង / Shop Stamp</div>
      </div>
    </div>

    <!-- Executive Footer -->
    <footer class="report-footer">
      <span>របាយការណ៍បង្កើតដោយស្វ័យប្រវត្តិតាមរយៈប្រព័ន្ធ SOM · ម៉ោងក្នុងតំបន់: ${escape(data.range.timezone)}</span>
      <span>កាលបរិច្ឆេទបង្កើត: ${escape(generatedAt.toLocaleString())}</span>
    </footer>
  </div>
</body>
</html>`;
}

export function openReportPrintView(
  data: ReportExportData,
  store: string,
  currency: string,
  options?: ReportPrintOptions
) {
  const printWindow = window.open("", "_blank");
  if (!printWindow) throw new Error("បង្អួចបោះពុម្ពត្រូវបានទប់ស្កាត់។ សូមអនុញ្ញាត pop-up រួចសាកល្បងម្ដងទៀត។");
  printWindow.opener = null;
  printWindow.document.open();
  printWindow.document.write(buildReportPrintHtml(data, store, currency, options));
  printWindow.document.close();
  printWindow.focus();
  const triggerPrint = () => {
    try {
      printWindow.focus();
      printWindow.print();
    } catch {
      // ignore
    }
  };
  if (printWindow.document.fonts && printWindow.document.fonts.ready) {
    printWindow.document.fonts.ready
      .then(() => printWindow.setTimeout(triggerPrint, 200))
      .catch(() => printWindow.setTimeout(triggerPrint, 500));
  } else {
    printWindow.setTimeout(triggerPrint, 500);
  }
}

export type DailyPreparationOrderItem = {
  productName: string;
  variantName?: string | null;
  quantity: number;
  unitPrice?: number;
  lineTotal?: number;
};

export type DailyPreparationOrder = {
  id: string;
  orderNumber: string;
  customer: string;
  phone: string;
  province?: string | null;
  courier?: string | null;
  trackingNumber?: string | null;
  paymentMethod?: string | null;
  paymentStatus?: string | null;
  total: number;
  status: string;
  channel?: string | null;
  deliveryAddress?: string | null;
  itemNames: string;
  items: DailyPreparationOrderItem[];
  createdAt: string;
};

export type DailyPreparationData = {
  date: string;
  storeName: string;
  storePhone?: string;
  storeAddress?: string;
  currency: string;
  exchangeRate?: number;
  orders: DailyPreparationOrder[];
};

export async function exportDailyPreparationXlsx(data: DailyPreparationData) {
  const { default: ExcelJS } = await import("exceljs");
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Social Seller Order Manager";
  workbook.created = new Date();

  // Aggregate items across all orders
  const itemMap = new Map<string, { productName: string; variantName: string; quantity: number }>();
  data.orders.forEach((o) => {
    o.items.forEach((it) => {
      const key = `${it.productName}__${it.variantName || ""}`;
      const existing = itemMap.get(key);
      if (existing) {
        existing.quantity += it.quantity;
      } else {
        itemMap.set(key, {
          productName: it.productName,
          variantName: it.variantName || "ស្តង់ដារ",
          quantity: it.quantity,
        });
      }
    });
  });
  const aggregatedItems = Array.from(itemMap.values()).sort((a, b) => b.quantity - a.quantity);

  // 1. Sheet 1: Packing Summary (រាប់ទំនិញ)
  const packingSheet = workbook.addWorksheet("Packing Summary", { views: [{ state: "frozen", ySplit: 1 }] });
  packingSheet.columns = [
    { header: "ល.រ (No.)", key: "no", width: 10 },
    { header: "មុខទំនិញ (Product)", key: "productName", width: 34 },
    { header: "ជម្រើស (Variant)", key: "variantName", width: 22 },
    { header: "ចំនួនត្រូវរៀបចំ (Qty to Pack)", key: "quantity", width: 24 },
    { header: "ស្ថានភាពវេចខ្ចប់ (Check)", key: "check", width: 20 },
  ];
  aggregatedItems.forEach((item, idx) => {
    packingSheet.addRow({
      no: idx + 1,
      productName: item.productName,
      variantName: item.variantName,
      quantity: item.quantity,
      check: "[ ] រៀបចំរួច",
    });
  });
  styleWorksheet(packingSheet);

  // 2. Sheet 2: Dispatch Manifest (បញ្ជីផ្ទៀងផ្ទាត់ដឹក)
  const dispatchSheet = workbook.addWorksheet("Dispatch Manifest", { views: [{ state: "frozen", ySplit: 1 }] });
  dispatchSheet.columns = [
    { header: "ល.រ", key: "no", width: 8 },
    { header: "លេខបញ្ជាទិញ (Order #)", key: "orderNumber", width: 20 },
    { header: "អតិថិជន (Customer)", key: "customer", width: 24 },
    { header: "លេខទូរស័ព្ទ (Phone)", key: "phone", width: 18 },
    { header: "គោលដៅ (Province)", key: "province", width: 18 },
    { header: "សេវាដឹក (Courier)", key: "courier", width: 18 },
    { header: "កូដតាមដាន (Tracking #)", key: "trackingNumber", width: 20 },
    { header: "មុខទំនិញ (Items)", key: "itemNames", width: 38 },
    { header: `ប្រាក់ត្រូវប្រមូល (${data.currency})`, key: "codAmount", width: 20, style: { numFmt: `"${data.currency}" #,##0.00` } },
    { header: "ស្ថានភាពទូទាត់", key: "paymentStatus", width: 16 },
    { header: "ស្ថានភាពបញ្ជាទិញ", key: "status", width: 18 },
    { header: "ហត្ថលេខាអ្នកដឹក", key: "sign", width: 18 },
  ];
  data.orders.forEach((o, idx) => {
    const isPaid = o.paymentStatus === "PAID";
    dispatchSheet.addRow({
      no: idx + 1,
      orderNumber: o.orderNumber,
      customer: o.customer,
      phone: o.phone,
      province: o.province || "—",
      courier: o.courier || "—",
      trackingNumber: o.trackingNumber || "—",
      itemNames: o.itemNames || o.items?.map((it) => `${it.productName}${it.variantName ? ` (${it.variantName})` : ""}`).join(", ") || "—",
      codAmount: isPaid ? 0 : o.total,
      paymentStatus: isPaid ? "បានទូទាត់រួច (PAID)" : "ប្រមូលពេលដឹក (COD)",
      status: displayLabel(o.status, reportLabels.statusLabels),
      sign: "[ ] បានទទួល",
    });
  });
  styleWorksheet(dispatchSheet);

  await saveWorkbook(workbook, `daily-preparation-${data.date}.xlsx`);
}

export function openDailyPreparationPrintView(data: DailyPreparationData) {
  const printWindow = window.open("", "_blank");
  if (!printWindow) throw new Error("បង្អួចបោះពុម្ពត្រូវបានទប់ស្កាត់។ សូមអនុញ្ញាត pop-up រួចសាកល្បងម្ដងទៀត។");

  // Aggregate items
  const itemMap = new Map<string, { productName: string; variantName: string; quantity: number }>();
  let totalUnits = 0;
  let totalCodAmount = 0;
  let totalPaidAmount = 0;

  data.orders.forEach((o) => {
    if (o.paymentStatus === "PAID") {
      totalPaidAmount += o.total;
    } else {
      totalCodAmount += o.total;
    }
    o.items.forEach((it) => {
      totalUnits += it.quantity;
      const key = `${it.productName}__${it.variantName || ""}`;
      const existing = itemMap.get(key);
      if (existing) {
        existing.quantity += it.quantity;
      } else {
        itemMap.set(key, {
          productName: it.productName,
          variantName: it.variantName || "ស្តង់ដារ",
          quantity: it.quantity,
        });
      }
    });
  });
  const aggregatedItems = Array.from(itemMap.values()).sort((a, b) => b.quantity - a.quantity);
  const rate = data.exchangeRate || 4100;
  const totalSales = totalCodAmount + totalPaidAmount;

  const html = `<!DOCTYPE html>
<html lang="km">
<head>
  <meta charset="utf-8" />
  <title>សន្លឹកត្រៀមទំនិញ និងបញ្ជីផ្ទៀងផ្ទាត់ដឹកជញ្ជូន - ${escape(data.date)}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Kantumruy+Pro:ital,wght@0,100..700;1,100..700&display=swap" rel="stylesheet">
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Kantumruy+Pro:ital,wght@0,100..700;1,100..700&display=swap');
    @page { size: A4; margin: 12mm; }
    * { box-sizing: border-box; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
    body, button, table, th, td, div, span, p, h1, h2, h3, h4, h5, h6, strong, b, small {
      font-family: 'Kantumruy Pro', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif !important;
    }
    body {
      margin: 0; padding: 0; background: #fff; color: #0f172a; font-size: 11px; line-height: 1.45;
    }
    .prep-wrap { max-width: 100%; margin: 0 auto; }
    .prep-header {
      display: flex; justify-content: space-between; align-items: flex-start;
      padding-bottom: 12px; border-bottom: 2px solid #1e3a8a; margin-bottom: 12px;
    }
    .shop-title { font-size: 18px; font-weight: 800; color: #1e3a8a; }
    .prep-doc-title { font-size: 15px; font-weight: 700; color: #0f172a; margin-top: 2px; }
    .kpi-row {
      display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 14px;
    }
    .kpi-box {
      border: 1px solid #cbd5e1; border-radius: 6px; padding: 8px 10px; background: #f8fafc;
    }
    .kpi-box small { display: block; font-size: 10px; color: #64748b; font-weight: 600; }
    .kpi-box strong { font-size: 14px; color: #0f172a; }
    .section-title {
      font-size: 12px; font-weight: 700; text-transform: uppercase; color: #1e3a8a;
      letter-spacing: 0.04em; margin: 14px 0 6px; display: flex; align-items: center; gap: 6px;
    }
    table { width: 100%; border-collapse: collapse; margin-bottom: 14px; font-size: 10.5px; }
    th {
      background: #f1f5f9; color: #334155; font-weight: 700; text-align: left;
      padding: 6px 8px; border: 1px solid #cbd5e1; font-size: 10px;
    }
    td { padding: 5px 8px; border: 1px solid #cbd5e1; vertical-align: top; }
    tr:nth-child(even) td { background: #fafafa; }
    .text-center { text-align: center; }
    .text-right { text-align: right; }
    .chk { display: inline-block; width: 13px; height: 13px; border: 1.5px solid #475569; border-radius: 2px; vertical-align: middle; }
    .badge { display: inline-block; padding: 1px 5px; border-radius: 4px; font-size: 9.5px; font-weight: 600; }
    .badge-paid { background: #dcfce7; color: #15803d; }
    .badge-cod { background: #fef3c7; color: #b45309; }
    .sig-grid {
      display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; margin-top: 24px;
      page-break-inside: avoid;
    }
    .sig-box {
      border: 1px dashed #94a3b8; border-radius: 6px; padding: 12px; text-align: center;
    }
    .sig-line { margin: 38px auto 6px; width: 75%; border-bottom: 1px solid #334155; }
    .sig-label { font-size: 10px; font-weight: 600; color: #475569; }
  </style>
</head>
<body>
  <div class="prep-wrap">
    <div class="prep-header">
      <div>
        <div class="shop-title">${escape(data.storeName)}</div>
        <div class="prep-doc-title">📋 សន្លឹកត្រៀមទំនិញ និងបញ្ជីផ្ទៀងផ្ទាត់ដឹកជញ្ជូនប្រចាំថ្ងៃ</div>
        <small style="color: #64748b;">
          ${data.storePhone ? `ទូរស័ព្ទ: ${escape(data.storePhone)} · ` : ""}${data.storeAddress ? escape(data.storeAddress) : ""}
        </small>
      </div>
      <div style="text-align: right;">
        <div style="font-weight: 700; font-size: 13px; color: #1e3a8a;">កាលបរិច្ឆេទ: ${escape(data.date)}</div>
        <small style="color: #64748b;">ម៉ោងចេញប័ណ្ណ: ${new Date().toLocaleTimeString("km-KH")}</small>
      </div>
    </div>

    <div class="kpi-row">
      <div class="kpi-box">
        <small>ការបញ្ជាទិញសរុប</small>
        <strong>${data.orders.length} កញ្ចប់</strong>
      </div>
      <div class="kpi-box">
        <small>ចំនួនឯកតាត្រូវវេចខ្ចប់</small>
        <strong>${totalUnits} ឯកតា</strong>
      </div>
      <div class="kpi-box">
        <small>ប្រាក់ត្រូវប្រមូល (COD)</small>
        <strong style="color: #b45309;">$${totalCodAmount.toFixed(2)} (${(totalCodAmount * rate).toLocaleString()} ៛)</strong>
      </div>
      <div class="kpi-box">
        <small>បានទូទាត់រួច (Paid)</small>
        <strong style="color: #15803d;">$${totalPaidAmount.toFixed(2)}</strong>
      </div>
    </div>

    <!-- Section 1: Item Packing Aggregation -->
    <div class="section-title">
      📦 ១. បញ្ជីរាប់ទំនិញដែលត្រូវរៀបចំវេចខ្ចប់ (Item Preparation List - ${aggregatedItems.length} មុខ)
    </div>
    <table>
      <thead>
        <tr>
          <th class="text-center" style="width: 35px;">[ ]</th>
          <th class="text-center" style="width: 35px;">ល.រ</th>
          <th>ឈ្មោះមុខទំនិញ (Product Name)</th>
          <th>ជម្រើស (Variant / Size / Color)</th>
          <th class="text-right" style="width: 110px;">ចំនួនត្រូវរៀបចំ (Qty)</th>
        </tr>
      </thead>
      <tbody>
        ${aggregatedItems.map((item, idx) => `
          <tr>
            <td class="text-center"><span class="chk"></span></td>
            <td class="text-center">${idx + 1}</td>
            <td><strong>${escape(item.productName)}</strong></td>
            <td>${escape(item.variantName)}</td>
            <td class="text-right"><strong>${item.quantity}</strong> ឯកតា</td>
          </tr>
        `).join("")}
      </tbody>
    </table>

    <!-- Section 2: Detailed Courier Manifest -->
    <div class="section-title">
      🚚 ២. បញ្ជីផ្ទៀងផ្ទាត់ដឹកជញ្ជូនលម្អិតតាមអតិថិជន (Courier Dispatch Manifest)
    </div>
    <table>
      <thead>
        <tr>
          <th class="text-center" style="width: 32px;">វេចខ្ចប់</th>
          <th class="text-center" style="width: 32px;">ប្រគល់</th>
          <th style="width: 85px;">លេខកូដ</th>
          <th>អតិថិជន & លេខទូរស័ព្ទ</th>
          <th>គោលដៅ/ខេត្ត</th>
          <th>សេវាដឹក (Courier)</th>
          <th>មុខទំនិញក្នុងកញ្ចប់</th>
          <th class="text-right" style="width: 95px;">ត្រូវប្រមូល (COD)</th>
        </tr>
      </thead>
      <tbody>
        ${data.orders.map((o) => {
          const isPaid = o.paymentStatus === "PAID";
          return `
            <tr>
              <td class="text-center"><span class="chk"></span></td>
              <td class="text-center"><span class="chk"></span></td>
              <td><strong>${escape(o.orderNumber)}</strong></td>
              <td>
                <div><strong>${escape(o.customer)}</strong></div>
                <small style="color: #475569;">☎ ${escape(o.phone)}</small>
              </td>
              <td>${escape(o.province || "—")}</td>
              <td>
                <strong>${escape(o.courier || "—")}</strong>
                ${o.trackingNumber ? `<br><small style="color:#64748b;">#${escape(o.trackingNumber)}</small>` : ""}
              </td>
              <td><small>${escape(o.itemNames)}</small></td>
              <td class="text-right">
                ${isPaid ? `<span class="badge badge-paid">PAID ✓</span>` : `<span class="badge badge-cod">COD: $${o.total.toFixed(2)}</span>`}
              </td>
            </tr>
          `;
        }).join("")}
      </tbody>
    </table>

    <!-- Signatures -->
    <div class="sig-grid">
      <div class="sig-box">
        <div class="sig-label">អ្នករៀបចំ និងវេចខ្ចប់ (Packed By)</div>
        <div class="sig-line"></div>
        <small style="color: #64748b;">ហត្ថលេខា / កាលបរិច្ឆេទ</small>
      </div>
      <div class="sig-box">
        <div class="sig-label">តំណាងសេវាដឹកជញ្ជូន (Courier Received By)</div>
        <div class="sig-line"></div>
        <small style="color: #64748b;">ហត្ថលេខាអ្នកទទួលដឹក / ត្រា</small>
      </div>
      <div class="sig-box">
        <div class="sig-label">ម្ចាស់ហាងអនុម័ត (Store Manager)</div>
        <div class="sig-line"></div>
        <small style="color: #64748b;">ហត្ថលេខា និងត្រាហាង</small>
      </div>
    </div>
  </div>
</body>
</html>`;

  printWindow.opener = null;
  printWindow.document.open();
  printWindow.document.write(html);
  printWindow.document.close();
  printWindow.focus();
  const triggerPrint = () => {
    try {
      printWindow.focus();
      printWindow.print();
    } catch {
      // ignore
    }
  };
  if (printWindow.document.fonts && printWindow.document.fonts.ready) {
    printWindow.document.fonts.ready
      .then(() => printWindow.setTimeout(triggerPrint, 200))
      .catch(() => printWindow.setTimeout(triggerPrint, 500));
  } else {
    printWindow.setTimeout(triggerPrint, 500);
  }
}
