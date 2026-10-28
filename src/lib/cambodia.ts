/**
 * Cambodia Localization, Dual Currency (USD & KHR), Logistics, and KHQR Engine
 * Tailored for Cambodian Social Sellers (Facebook Live, TikTok, Telegram)
 */

export const DEFAULT_EXCHANGE_RATE = 4100; // 1 USD = 4,100 KHR

export interface CourierOption {
  id: string;
  nameKh: string;
  nameEn: string;
  phone?: string;
  trackingPrefix?: string;
  defaultFeeUSD: number;
}

export const CAMBODIA_COURIERS: CourierOption[] = [
  { id: "VET", nameKh: "វីរៈ ប៊ុនថាំ (VET Logistics)", nameEn: "Virak Buntham Express", phone: "023 999 999", defaultFeeUSD: 1.75 },
  { id: "JT", nameKh: "ជេអ៊ែនធី (J&T Express)", nameEn: "J&T Express Cambodia", phone: "023 901 888", defaultFeeUSD: 1.50 },
  { id: "FLASH", nameKh: "ផ្លាស អិចប្រេស (Flash Express)", nameEn: "Flash Express", phone: "023 900 888", defaultFeeUSD: 1.50 },
  { id: "KERRY", nameKh: "ខេរី អិចប្រេស (Kerry Express)", nameEn: "Kerry Express", defaultFeeUSD: 1.75 },
  { id: "CAPITOL", nameKh: "កាពីតូល (Capitol Express)", nameEn: "Capitol Tour & Express", defaultFeeUSD: 1.50 },
  { id: "GRAB_PASSAPP", nameKh: "ដឹកជញ្ជូនរហ័ស (Grab / PassApp)", nameEn: "Instant Delivery (Grab/PassApp)", defaultFeeUSD: 1.25 },
  { id: "STORE_PICKUP", nameKh: "មកយកនៅហាងផ្ទាល់", nameEn: "Store Self Pickup", defaultFeeUSD: 0 },
  { id: "OTHER", nameKh: "សេវាដឹកជញ្ជូនផ្សេងទៀត", nameEn: "Other Courier", defaultFeeUSD: 1.50 },
];

export interface ProvinceOption {
  id: string;
  nameKh: string;
  nameEn: string;
  isCapital?: boolean;
  defaultFeeUSD: number;
}

export const CAMBODIA_PROVINCES: ProvinceOption[] = [
  { id: "PP", nameKh: "រាជធានីភ្នំពេញ", nameEn: "Phnom Penh", isCapital: true, defaultFeeUSD: 1.25 },
  { id: "KD", nameKh: "ខេត្តកណ្តាល", nameEn: "Kandal", defaultFeeUSD: 1.75 },
  { id: "SR", nameKh: "ខេត្តសៀមរាប", nameEn: "Siem Reap", defaultFeeUSD: 2.00 },
  { id: "BB", nameKh: "ខេត្តបាត់ដំបង", nameEn: "Battambang", defaultFeeUSD: 2.00 },
  { id: "SHV", nameKh: "ខេត្តព្រះសីហនុ", nameEn: "Preah Sihanouk (Kompong Som)", defaultFeeUSD: 2.00 },
  { id: "KC", nameKh: "ខេត្តកំពង់ចាម", nameEn: "Kampong Cham", defaultFeeUSD: 1.75 },
  { id: "KP", nameKh: "ខេត្តកំពត", nameEn: "Kampot", defaultFeeUSD: 2.00 },
  { id: "TK", nameKh: "ខេត្តតាកែវ", nameEn: "Takeo", defaultFeeUSD: 1.75 },
  { id: "KS", nameKh: "ខេត្តកំពង់ស្ពឺ", nameEn: "Kampong Speu", defaultFeeUSD: 1.75 },
  { id: "KCH", nameKh: "ខេត្តកំពង់ឆ្នាំង", nameEn: "Kampong Chhnang", defaultFeeUSD: 1.75 },
  { id: "KT", nameKh: "ខេត្តកំពង់ធំ", nameEn: "Kampong Thom", defaultFeeUSD: 2.00 },
  { id: "PV", nameKh: "ខេត្តព្រៃវែង", nameEn: "Prey Veng", defaultFeeUSD: 1.75 },
  { id: "SRI", nameKh: "ខេត្តស្វាយរៀង", nameEn: "Svay Rieng", defaultFeeUSD: 2.00 },
  { id: "PS", nameKh: "ខេត្តពោធិ៍សាត់", nameEn: "Pursat", defaultFeeUSD: 2.00 },
  { id: "BMC", nameKh: "ខេត្តបន្ទាយមានជ័យ", nameEn: "Banteay Meanchey", defaultFeeUSD: 2.00 },
  { id: "KK", nameKh: "ខេត្តកោះកុង", nameEn: "Koh Kong", defaultFeeUSD: 2.25 },
  { id: "KEP", nameKh: "ខេត្តកែប", nameEn: "Kep", defaultFeeUSD: 2.00 },
  { id: "PL", nameKh: "ខេត្តប៉ៃលិន", nameEn: "Pailin", defaultFeeUSD: 2.25 },
  { id: "KR", nameKh: "ខេត្តក្រចេះ", nameEn: "Kratie", defaultFeeUSD: 2.25 },
  { id: "ST", nameKh: "ខេត្តស្ទឹងត្រែង", nameEn: "Stung Treng", defaultFeeUSD: 2.50 },
  { id: "RK", nameKh: "ខេត្តរតនគិរី", nameEn: "Ratanakiri", defaultFeeUSD: 2.50 },
  { id: "MK", nameKh: "ខេត្តមណ្ឌលគិរី", nameEn: "Mondulkiri", defaultFeeUSD: 2.50 },
  { id: "PVH", nameKh: "ខេត្តព្រះវិហារ", nameEn: "Preah Vihear", defaultFeeUSD: 2.25 },
  { id: "OMC", nameKh: "ខេត្តឧត្តរមានជ័យ", nameEn: "Oddar Meanchey", defaultFeeUSD: 2.25 },
  { id: "TBK", nameKh: "ខេត្តត្បូងឃ្មុំ", nameEn: "Tboung Khmum", defaultFeeUSD: 1.75 },
];

export interface PaymentMethodOption {
  id: string;
  nameKh: string;
  nameEn: string;
  icon: string;
  description: string;
}

export const CAMBODIA_PAYMENT_METHODS: PaymentMethodOption[] = [
  { id: "COD", nameKh: "ទូទាត់ពេលដឹកដល់ (COD)", nameEn: "Cash On Delivery (COD)", icon: "Truck", description: "អ្នកដឹកជញ្ជូនប្រមូលប្រាក់ផ្ទាល់ពេលប្រគល់ទំនិញ" },
  { id: "KHQR", nameKh: "ស្កេន KHQR (Bakong / ABA / ACLEDA)", nameEn: "KHQR / Bakong / ABA Pay", icon: "QrCode", description: "ស្កេនបង់ប្រាក់ភ្លាមៗតាម App ធនាគារនានានៅកម្ពុជា" },
  { id: "BANK_TRANSFER", nameKh: "ផ្ទេរប្រាក់តាមធនាគារ (ABA / Wing / ACLEDA)", nameEn: "Bank Transfer", icon: "Building2", description: "អតិថិជនផ្ញើវិក្កយបត្រ / ស្លីបផ្ទេរប្រាក់" },
  { id: "CASH", nameKh: "សាច់ប្រាក់សុទ្ធផ្ទាល់", nameEn: "Direct Cash", icon: "Banknote", description: "បង់ប្រាក់ផ្ទាល់នៅហាង ឬអ្នកលក់ទទួលផ្ទាល់" },
];

export const PAYMENT_STATUSES: Record<string, { labelKh: string; labelEn: string; colorClass: string }> = {
  UNPAID: { labelKh: "មិនទាន់បង់", labelEn: "Unpaid", colorClass: "amber" },
  PAID: { labelKh: "បានបង់ប្រាក់", labelEn: "Paid", colorClass: "green" },
  PARTIAL: { labelKh: "បង់ប្រាក់កក់", labelEn: "Partial / Deposit", colorClass: "blue" },
  REFUNDED: { labelKh: "បានសងប្រាក់វិញ", labelEn: "Refunded", colorClass: "red" },
};

const digitMap: Record<string, string> = {
  "0": "០", "1": "១", "2": "២", "3": "៣", "4": "៤",
  "5": "៥", "6": "៦", "7": "៧", "8": "៨", "9": "៩",
};

export function toKhmerDigits(value: string | number): string {
  return String(value).replace(/[0-9]/g, (digit) => digitMap[digit] ?? digit);
}

export function usdToKhr(usd: number, rate = DEFAULT_EXCHANGE_RATE): number {
  return Math.round(usd * rate);
}

export function khrToUsd(khr: number, rate = DEFAULT_EXCHANGE_RATE): number {
  return Number((khr / rate).toFixed(2));
}

export function formatUSD(amount: number, useKhmerDigits = false): string {
  const formatted = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
  return useKhmerDigits ? toKhmerDigits(formatted) : formatted;
}

export function formatKHR(amount: number, useKhmerDigits = false): string {
  const rounded = Math.round(amount);
  const formatted = `៛${rounded.toLocaleString("en-US")}`;
  return useKhmerDigits ? toKhmerDigits(formatted) : formatted;
}

/**
 * Returns formatted dual currency representation, e.g.:
 * "$15.00 (៛61,500)"
 */
export function formatDualCurrency(amountUSD: number, rate = DEFAULT_EXCHANGE_RATE, useKhmerDigits = false): string {
  const usd = formatUSD(amountUSD, useKhmerDigits);
  const khr = formatKHR(usdToKhr(amountUSD, rate), useKhmerDigits);
  return `${usd} (${khr})`;
}

/**
 * Formats a Cambodian phone number into a standard readable format,
 * e.g., "012345678" -> "012 345 678" or "+855 12 345 678"
 */
export function formatCambodiaPhone(phone: string): string {
  const clean = phone.replace(/[\s\-\(\)]/g, "");
  if (/^0\d{8}$/.test(clean)) {
    return `${clean.slice(0, 3)} ${clean.slice(3, 6)} ${clean.slice(6)}`;
  }
  if (/^0\d{9}$/.test(clean)) {
    return `${clean.slice(0, 3)} ${clean.slice(3, 6)} ${clean.slice(6)}`;
  }
  if (/^\+855\d{8,9}$/.test(clean)) {
    const local = "0" + clean.slice(4);
    return formatCambodiaPhone(local);
  }
  return phone;
}

export interface ParsedLiveOrder {
  phone?: string;
  name?: string;
  province?: ProvinceOption;
  address?: string;
  items: { keyword: string; quantity: number }[];
  notes?: string;
}

/**
 * Smart Live Sale / Chat Order Parser
 * Allows Cambodian sellers to paste a customer's comment or message and auto-extract order details.
 * Example input:
 * "012 889 977 សុខា ភ្នំពេញ ទួលគោក ផ្លូវ២៨៩ យកអាវស ២ ឡេការពារកម្ដៅ ១"
 */
export function parseLiveSaleComment(text: string): ParsedLiveOrder {
  const result: ParsedLiveOrder = { items: [] };
  if (!text || typeof text !== "string") return result;

  const cleanText = text.trim();

  // 1. Extract Cambodian Phone Number (supports spaces, hyphens, etc.)
  const rawPhoneMatch = cleanText.match(/(?:\+855\s*|0)[1-9](?:[\s\-\.]*[0-9]){7,8}/);
  if (rawPhoneMatch) {
    const rawDigits = rawPhoneMatch[0].replace(/[\s\-\.]/g, "");
    result.phone = formatCambodiaPhone(rawDigits);
  }

  // 2. Match Province / City
  for (const province of CAMBODIA_PROVINCES) {
    const khMatch = cleanText.includes(province.nameKh.replace("ខេត្ត", "").replace("រាជធានី", "").trim());
    const enMatch = cleanText.toLowerCase().includes(province.nameEn.toLowerCase());
    if (khMatch || enMatch) {
      result.province = province;
      break;
    }
  }

  // 3. Extract item quantities and patterns like "2x", "២កំប៉ុង", "យក 2"
  const itemRegex = /(?:យក|កម្មង់|កុម្ម៉ង់|កុម្មង់|order)?\s*([a-zA-Z\u1780-\u17FF\s]+?)\s*(?:ចំនួន|x|\*|:)?\s*([០-៩0-9]+)\s*(?:កំប៉ុង|ប្រអប់|ដប|មុខ|ឈុត|គូ|កញ្ចប់|pcs|bottle|box)?/gi;
  let match;
  while ((match = itemRegex.exec(cleanText)) !== null) {
    const rawName = match[1]?.trim();
    const rawQty = match[2];
    if (rawName && rawQty) {
      const qtyNumber = parseInt(
        rawQty.replace(/[០-៩]/g, (d) => String(Object.values(digitMap).indexOf(d))),
        10
      );
      if (qtyNumber > 0 && rawName.length > 1 && !rawName.startsWith("0")) {
        result.items.push({ keyword: rawName, quantity: qtyNumber });
      }
    }
  }

  result.address = cleanText;
  return result;
}

export type CustomerTier = "VIP" | "REGULAR" | "NEW" | "COD_RISK";

export interface CustomerTrustBadge {
  tier: CustomerTier;
  labelKh: string;
  labelEn: string;
  badgeClass: string;
  description: string;
}

export function calculateCustomerTier(orderCount: number, totalSpent: number, cancelledCount = 0): CustomerTrustBadge {
  if (cancelledCount >= 2 && cancelledCount >= orderCount * 0.4) {
    return {
      tier: "COD_RISK",
      labelKh: "ហានិភ័យ COD (បោះបង់ញឹកញាប់)",
      labelEn: "COD Risk (High Cancellation)",
      badgeClass: "badge red",
      description: "អតិថិជននេះធ្លាប់បោះបង់ការបញ្ជាទិញ។ គួរទារប្រាក់កក់ ឬទូទាត់មុនពេលដឹកជញ្ជូន។",
    };
  }
  if (totalSpent >= 200 || orderCount >= 5) {
    return {
      tier: "VIP",
      labelKh: "អតិថិជន VIP",
      labelEn: "VIP Customer",
      badgeClass: "badge blue",
      description: "អតិថិជនឆ្នើម មានប្រវត្តិទិញច្រើន និងទំនុកចិត្តខ្ពស់។",
    };
  }
  if (orderCount >= 2) {
    return {
      tier: "REGULAR",
      labelKh: "អតិថិជនទៀងទាត់",
      labelEn: "Regular Buyer",
      badgeClass: "badge green",
      description: "អតិថិជនធ្លាប់ទិញជោគជ័យ ២ ដងឡើងទៅ។",
    };
  }
  return {
    tier: "NEW",
    labelKh: "អតិថិជនថ្មី",
    labelEn: "New Customer",
    badgeClass: "badge",
    description: "ការបញ្ជាទិញលើកដំបូង។ សូមផ្ទៀងផ្ទាត់លេខទូរស័ព្ទ និងទីតាំងដឹកជញ្ជូន។",
  };
}

/**
 * Generates an EMVCo-compliant KHQR payload string for Bakong / ABA Pay / ACLEDA
 * Format tags:
 * 00: Format Indicator ("01")
 * 01: Point of Initiation Method ("12" for Dynamic QR with amount, "11" for Static)
 * 29: Merchant Account Information - Bakong
 * 52: Merchant Category Code ("5999")
 * 53: Transaction Currency ("840" for USD, "116" for KHR)
 * 54: Transaction Amount
 * 58: Country Code ("KH")
 * 59: Merchant Name
 * 60: Merchant City ("Phnom Penh")
 * 62: Additional Data (Bill Number / Reference)
 * 63: CRC16 checksum
 */
export function generateBakongKHQRString(params: {
  bakongAccountId: string; // e.g. "som_store@aba"
  merchantName: string;
  amountUSD: number;
  orderNumber: string;
}): string {
  const padTag = (tag: string, val: string) => `${tag}${String(val.length).padStart(2, "0")}${val}`;

  const bakongSubtag = padTag("00", params.bakongAccountId);
  const tag29 = padTag("29", bakongSubtag);

  const amountStr = params.amountUSD.toFixed(2);
  const tag62Sub = padTag("01", params.orderNumber);
  const tag62 = padTag("62", tag62Sub);

  let raw = "";
  raw += padTag("00", "01"); // Payload Format Indicator
  raw += padTag("01", "12"); // Dynamic QR
  raw += tag29;
  raw += padTag("52", "5999"); // Merchant Category Code
  raw += padTag("53", "840"); // Currency USD
  raw += padTag("54", amountStr); // Amount
  raw += padTag("58", "KH"); // Country
  raw += padTag("59", params.merchantName.slice(0, 25)); // Merchant Name
  raw += padTag("60", "Phnom Penh"); // Merchant City
  raw += tag62; // Additional Data

  raw += "6304"; // CRC placeholder

  // Calculate CRC16-CCITT
  let crc = 0xffff;
  for (let i = 0; i < raw.length; i++) {
    crc ^= raw.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      if ((crc & 0x8000) !== 0) {
        crc = ((crc << 1) ^ 0x1021) & 0xffff;
      } else {
        crc = (crc << 1) & 0xffff;
      }
    }
  }
  const crcHex = crc.toString(16).toUpperCase().padStart(4, "0");
  return raw.slice(0, -4) + "6304" + crcHex;
}

export interface OrderCustomMetadata {
  courier?: string; // e.g. "VET", "JT"
  trackingNumber?: string;
  paymentMethod: "COD" | "KHQR" | "BANK_TRANSFER" | "CASH";
  paymentStatus: "UNPAID" | "PAID" | "PARTIAL" | "REFUNDED";
  provinceId?: string;
  notes: string;
  exchangeRate?: number;
}

export function encodeOrderMetadata(meta: Partial<OrderCustomMetadata>): string {
  const payload = {
    courier: meta.courier || "VET",
    tracking: meta.trackingNumber || "",
    payMethod: meta.paymentMethod || "COD",
    payStatus: meta.paymentStatus || "UNPAID",
    prov: meta.provinceId || "",
    note: meta.notes?.trim() || "",
  };
  return JSON.stringify(payload);
}

export function decodeOrderMetadata(rawText?: string | null): OrderCustomMetadata {
  const defaultMeta: OrderCustomMetadata = {
    courier: "VET",
    trackingNumber: "",
    paymentMethod: "COD",
    paymentStatus: "UNPAID",
    provinceId: "",
    notes: rawText || "",
  };
  if (!rawText) return defaultMeta;

  const trimmed = rawText.trim();
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    try {
      const parsed = JSON.parse(trimmed);
      return {
        courier: parsed.courier || defaultMeta.courier,
        trackingNumber: parsed.tracking || defaultMeta.trackingNumber,
        paymentMethod: parsed.payMethod || defaultMeta.paymentMethod,
        paymentStatus: parsed.payStatus || defaultMeta.paymentStatus,
        provinceId: parsed.prov || defaultMeta.provinceId,
        notes: parsed.note !== undefined ? parsed.note : (parsed.notes || ""),
      };
    } catch {
      // fallback
    }
  }

  // Bracket format: [Courier: VET | Track: 123 | Pay: COD | Status: UNPAID] ...
  const bracketMatch = trimmed.match(/^\[([\s\S]*?)\]\s*([\s\S]*)$/);
  if (bracketMatch) {
    const metaStr = bracketMatch[1];
    const restNotes = bracketMatch[2];
    const parts = metaStr.split("|").map((p) => p.trim());
    const res = { ...defaultMeta, notes: restNotes };
    for (const part of parts) {
      const [key, val] = part.split(":").map((s) => s.trim());
      if (key && val) {
        if (key.toLowerCase() === "courier") res.courier = val;
        else if (key.toLowerCase() === "track") res.trackingNumber = val;
        else if (key.toLowerCase() === "pay") res.paymentMethod = val as OrderCustomMetadata["paymentMethod"];
        else if (key.toLowerCase() === "status") res.paymentStatus = val as OrderCustomMetadata["paymentStatus"];
        else if (key.toLowerCase() === "province") res.provinceId = val;
      }
    }
    return res;
  }

  return defaultMeta;
}
