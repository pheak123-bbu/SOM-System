"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRef } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { signOut } from "next-auth/react";
import { ActionButton } from "@/components/ui/action-button";
import { useToast } from "@/components/ui/toast-provider";
import { exportOrdersXlsx, exportReportXlsx, openReportPrintView } from "@/lib/report-export";
import {
  Activity, ArrowUpRight, BarChart3, Bell, CalendarDays, Check, CheckCircle2, ChevronDown, ChevronLeft, ChevronRight,
  Clock3, Download, FileSpreadsheet, FolderTree, LayoutDashboard, LogOut, MessageCircle, MessageSquareText, Printer,
  Menu, Package, Plus, Search, Send, Settings, ShoppingCart, Boxes, Radio, Tag,
  ShieldCheck, Sparkles, TrendingUp, Users, Wallet, X, MapPin, Phone, RefreshCw, Eye, EyeOff,
  AlertCircle, Camera, Upload, Copy,
  Edit2, Trash2, Key, KeyRound, Lock, Zap,
} from "lucide-react";
import {
  Area, AreaChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip,
  XAxis, YAxis,
} from "recharts";
import {
  CAMBODIA_COURIERS,
  CAMBODIA_PROVINCES,
  CAMBODIA_PAYMENT_METHODS,
  DEFAULT_EXCHANGE_RATE,
  calculateCustomerTier,
  decodeOrderMetadata,
  encodeOrderMetadata,
  formatCambodiaPhone,
  formatDualCurrency,
  formatKHR,
  formatUSD,
  parseLiveSaleComment,
  usdToKhr,
} from "@/lib/cambodia";
import { OrderDetailsDrawer } from "@/components/order-details-drawer";
import { OrderPrintDialog, PrintableOrder } from "@/components/order-print-dialog";
import { StockAdjustModal } from "@/components/stock-adjust-modal";
import { CustomerAddressModal, CustomerAddressItem } from "@/components/customer-address-modal";
import { CustomerDetailsDrawer } from "@/components/customer-details-drawer";
import { CambodiaOrderModal, EditableOrder } from "@/components/cambodia-order-modal";
import { MediaIcon, MediaBadge } from "@/components/ui/media-icon";
import { TelegramTestModal } from "./telegram-test-modal";
import { DailyPreparationModal } from "./daily-preparation-modal";
import { InventoryView } from "./inventory-view";
import { LiveCfStudio } from "./live-cf-studio";
import { AuditLogsView } from "./audit-logs-view";
import { DataTablePagination } from "@/components/ui/data-table-pagination";

type Customer = {
  id: string; name: string; phone: string; email: string; channel: string;
  orderCount: number; conversationCount: number; totalSpent: number;
  lastOrderAt: string | null; notes: { id: string; body: string; createdAt: string }[];
  telegramUsername?: string | null; facebookId?: string | null; codRiskOverride?: string | null;
};
type Order = {
  id: string; orderNumber: string; customerId: string; customer: string; phone: string;
  status: string; channel: string; total: number; itemNames: string; createdAt: string;
  courier?: string | null; trackingNumber?: string | null; paymentMethod?: string | null;
  paymentStatus?: string | null; province?: string | null; notes?: string | null; deliveryAddress?: string | null;
  suggestion?: {
    id: string;
    confidence: number;
    intent: string;
    status: string;
    createdAt?: string;
  } | null;
};
type Product = {
  id: string; name: string; sku: string; category: string; categoryId?: string | null; price: number;
  description?: string; stock: number | null; active: boolean;
  imageUrl?: string | null;
  variants: { id: string; name: string; sku?: string | null; price: number | null; stock: number | null; active?: boolean }[];
};
type Category = {
  id: string;
  name: string;
  description?: string | null;
  color?: string | null;
  icon?: string | null;
  active: boolean;
  productCount: number;
  createdAt: string;
};
type Suggestion = {
  id: string; status: string; intent: string; confidence: number; explanation: string;
  missingInfo: string[]; createdAt: string; customer: string; channel: string;
  items: { productId: string | null; variantId: string | null; productName: string; variantName: string | null; quantity: number }[];
  messages: { body: string; sender: string; at: string }[];
  orderId?: string | null;
  order?: {
    id: string;
    orderNumber: string;
    status: string;
    total: number;
    createdAt: string;
  } | null;
  customerId?: string | null;
  conversationId?: string | null;
};
type Conversation = {
  id: string; customer: string; customerId: string | null; channel: string; externalId: string | null;
  lastMessage: string; lastMessageAt: string | null;
  messages: { id: string; body: string; sender: string; senderType: string; sentAt: string }[];
};
type ReportData = {
  range: { from: string; to: string; timezone: string; salesDefinition: string };
  summary: { sales: number; orders: number; averageOrderValue: number };
  timeSeries: { date: string; sales: number; orders: number }[];
  channels: { channel: string; sales: number; orders: number }[];
  bestSellers: { name: string; units: number; sales: number }[];
  statuses: Record<string, number>;
  suggestions: Record<string, number>;
};
type Props = {
  user: {
    name: string;
    role: string;
    store: string;
    currency: string;
    storePhone?: string;
    storeAddress?: string;
    bakongAccountId?: string;
    exchangeRate?: number;
    avatarUrl?: string | null;
  };
  summary: { totalOrders: number; ordersToday: number; pendingOrders: number; awaitingReview: number; totalSales: number; customersCount: number; activeProducts: number; lowStockCount: number };
  orders: Order[]; customers: Customer[]; products: Product[]; categories: Category[]; suggestions: Suggestion[]; conversations: Conversation[]; simulatorEnabled: boolean;
};
type GlobalSearchResult = { id: string; label: string; detail: string; section: Section; searchTerm: string };

type Section = "Overview" | "Orders" | "Order Detection" | "Live CF Studio" | "Conversations" | "Customers" | "Products" | "Categories" | "Inventory" | "Reports" | "Users" | "Audit Logs" | "Settings";
const navigation: { label: Section; icon: typeof LayoutDashboard }[] = [
  { label: "Overview", icon: LayoutDashboard }, { label: "Orders", icon: ShoppingCart },
  { label: "Order Detection", icon: Sparkles }, { label: "Live CF Studio", icon: Radio },
  { label: "Conversations", icon: MessageSquareText },
  { label: "Customers", icon: Users }, { label: "Products", icon: Package },
  { label: "Categories", icon: FolderTree },
  { label: "Inventory", icon: Boxes },
  { label: "Reports", icon: BarChart3 }, { label: "Users", icon: Users },
  { label: "Audit Logs", icon: ShieldCheck },
  { label: "Settings", icon: Settings },
];
const chartColors = ["#3164ce", "#18a787", "#e4a43a", "#8b74cf", "#ed6b77", "#55a1bf"];
const digitMap: Record<string, string> = { "0": "0", "1": "1", "2": "2", "3": "3", "4": "4", "5": "5", "6": "6", "7": "7", "8": "8", "9": "9" };
const khmerDigits = (value: string | number) => String(value ?? "");
const khmerNumber = (value: number) => (value ?? 0).toLocaleString("en-US");
const khmerMonths = ["មករា", "កុម្ភៈ", "មីនា", "មេសា", "ឧសភា", "មិថុនា", "កក្កដា", "សីហា", "កញ្ញា", "តុលា", "វិច្ឆិកា", "ធ្នូ"];
const currency = (amount: number, code: string) => new Intl.NumberFormat("en-US", { style: "currency", currency: code, maximumFractionDigits: 2 }).format(amount);
const csvField = (value: unknown) => {
  const text = String(value ?? "");
  const safe = /^[\t\r ]*[=+\-@]/.test(text) ? `'${text}` : text;
  return `"${safe.replaceAll('"', '""')}"`;
};
const channelNames: Record<string, string> = { FACEBOOK: "ហ្វេសប៊ុក", TIKTOK: "ធីកតុក", TELEGRAM: "តេលេក្រាម", DIRECT: "ផ្ទាល់", OTHER: "ផ្សេងៗ" };
const statusLabels: Record<string, string> = {
  DRAFT: "សេចក្ដីព្រាង", PENDING_CONFIRMATION: "រង់ចាំការបញ្ជាក់", CONFIRMED: "បានបញ្ជាក់",
  PROCESSING: "កំពុងរៀបចំ", SHIPPED: "បានដឹកជញ្ជូន", DELIVERED: "បានប្រគល់", CANCELLED: "បានបោះបង់",
};
const statusClass: Record<string, string> = {
  DRAFT: "", PENDING_CONFIRMATION: "amber", CONFIRMED: "blue", PROCESSING: "purple",
  SHIPPED: "teal", DELIVERED: "green", CANCELLED: "red",
};
const CAMBODIA_TZ = "Asia/Phnom_Penh";

const datePartsInTz = (date: Date, timeZone = CAMBODIA_TZ) => {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    day: "numeric",
    month: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const map: Record<string, string> = {};
  for (const p of parts) map[p.type] = p.value;
  return {
    day: Number(map.day),
    monthIndex: Number(map.month) - 1,
    year: Number(map.year),
    time: `${(map.hour ?? "00").padStart(2, "0")}:${(map.minute ?? "00").padStart(2, "0")}`,
  };
};

const getCambodiaDateString = (date: Date = new Date()) => {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: CAMBODIA_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
};

const dateLabel = (value: string | null) => {
  if (!value) return "មិនទាន់មានការបញ្ជាទិញ";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "មិនទាន់មានការបញ្ជាទិញ";
  const { day, monthIndex, year } = datePartsInTz(date);
  return `${day} ${khmerMonths[monthIndex] ?? ""} ${year}`;
};
const dateTimeLabel = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "កាលបរិច្ឆេទមិនត្រឹមត្រូវ";
  const { day, monthIndex, year, time } = datePartsInTz(date);
  return `${day} ${khmerMonths[monthIndex] ?? ""} ${year} · ${time}`;
};
const sectionNames: Record<Section, string> = {
  Overview: "ទិដ្ឋភាពទូទៅ", Orders: "ការបញ្ជាទិញ", "Order Detection": "ការរកឃើញការបញ្ជាទិញ",
  "Live CF Studio": "Live CF Studio",
  Conversations: "ការសន្ទនា", Customers: "អតិថិជន", Products: "ផលិតផល", Categories: "ប្រភេទផលិតផល", Inventory: "ស្តុកទំនិញ", Reports: "របាយការណ៍",
  Users: "អ្នកប្រើប្រាស់",
  "Audit Logs": "កំណត់ត្រាសកម្មភាព",
  Settings: "ការកំណត់",
};
const suggestionStatusNames: Record<string, string> = {
  PENDING: "រង់ចាំពិនិត្យ", APPROVED: "បានអនុម័ត", NOT_AN_ORDER: "មិនមែនការបញ្ជាទិញ",
  DISMISSED: "បានបដិសេធ", DUPLICATE: "ស្ទួន",
};
const intentNames: Record<string, string> = {
  ORDER_DETAILS_MISSING: "ព័ត៌មានការបញ្ជាទិញនៅខ្វះ", AWAITING_CUSTOMER_CONFIRMATION: "រង់ចាំការបញ្ជាក់ពីអតិថិជន",
  PURCHASE_INTENT: "មានបំណងទិញ", PURCHASE_CONFIRMED: "អតិថិជនបានបញ្ជាក់ការទិញ",
  PRODUCT_INTEREST: "ចាប់អារម្មណ៍លើផលិតផល", COMPARING_PRODUCTS: "កំពុងប្រៀបធៀបផលិតផល",
  GENERAL_INQUIRY: "សំណួរទូទៅ", ORDER_CHANGE_REQUEST: "ស្នើកែប្រែការបញ្ជាទិញ",
  CANCELLATION_REQUEST: "ស្នើបោះបង់", NO_PURCHASE: "មិនមានបំណងទិញ", UNKNOWN: "មិនស្គាល់",
};
const initials = (name: string) => name.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();

function Metric({ title, value, note, icon: Icon, trend }: { title: string; value: string; note: string; icon: typeof Wallet; trend?: "up" | "down" }) {
  return <article className="metric-card">
    <div className="metric-top"><span>{title}</span><span className="metric-icon"><Icon size={15} /></span></div>
    <div className="metric-value latin-data">{value}</div>
    <div className={`metric-note ${trend === "up" ? "positive" : ""}`}>{trend === "up" ? <ArrowUpRight size={12} /> : null}{note}</div>
  </article>;
}

function Panel({ title, description, action, children }: { title: string; description?: string; action?: React.ReactNode; children: React.ReactNode }) {
  return <section className="panel">
    <div className="panel-heading"><div><h2>{title}</h2>{description && <p>{description}</p>}</div>{action}</div>
    {children}
  </section>;
}

function Badge({ value, className = "" }: { value: string; className?: string }) {
  return <span className={`badge ${className}`}>{value}</span>;
}

function CustomerModal({ close, created, customer, updated }: { close: () => void; created: (customer: Customer) => void; customer?: Customer; updated?: (customer: Customer) => void }) {
  const notify = useToast();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true); setError("");
    const data = new FormData(event.currentTarget);
    try {
      const response = await fetch(customer ? `/api/customers/${customer.id}` : "/api/customers", {
        method: customer ? "PATCH" : "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: data.get("name"), phone: data.get("phone"), email: data.get("email"), preferredChannel: data.get("channel") }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "មិនអាចរក្សាទុកអតិថិជនបានទេ។");
      const saved = customer
        ? { ...customer, ...result.customer, email: result.customer.email ?? "", phone: result.customer.phone ?? "", channel: result.customer.preferredChannel ?? "DIRECT" }
        : { ...result.customer, email: result.customer.email ?? "", phone: result.customer.phone ?? "", channel: result.customer.preferredChannel ?? "DIRECT", orderCount: 0, conversationCount: 0, totalSpent: 0, lastOrderAt: null, notes: [] };
      if (customer) updated?.(saved);
      else created(saved);
      notify({ kind: "success", title: customer ? "បានកែប្រែព័ត៌មានអតិថិជន" : "បានបន្ថែមអតិថិជន", description: saved.name });
      close();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "មិនអាចរក្សាទុកអតិថិជនបានទេ។"); }
    finally { setBusy(false); }
  }
  return <Modal title={customer ? "កែប្រែព័ត៌មានអតិថិជន" : "បន្ថែមអតិថិជន"} subtitle="រក្សាទុកព័ត៌មានទំនាក់ទំនង និងបណ្ដាញដែលចូលចិត្តរបស់អតិថិជន។" close={close}>
    <form onSubmit={submit}>
      {error && <div className="error-banner">{error}</div>}
      <div className="form-grid">
        <Field label="ឈ្មោះអតិថិជន" name="name" required defaultValue={customer?.name} />
        <Field label="លេខទូរស័ព្ទ" name="phone" placeholder="+855…" defaultValue={customer?.phone} />
        <Field label="អ៊ីមែល" name="email" type="email" defaultValue={customer?.email} />
        <div className="form-field"><label htmlFor="channel">បណ្ដាញដែលចូលចិត្ត</label><select name="channel" id="channel" defaultValue={customer?.channel ?? "DIRECT"}><ChannelOptions /></select></div>
      </div>
      <div className="modal-actions"><button type="button" className="button" onClick={close}>បោះបង់</button><button className="button primary" disabled={busy}>{busy ? "កំពុងរក្សាទុក…" : customer ? "រក្សាទុកការកែប្រែ" : "រក្សាទុកអតិថិជន"}</button></div>
    </form>
  </Modal>;
}

function ProductModal({ close, created, product, updated, categories = [], onCategoryCreated }: { close: () => void; created: (product: Product) => void; product?: Product; updated?: (product: Product) => void; categories?: Category[]; onCategoryCreated?: (category: Category) => void }) {
  const notify = useToast();
  const [error, setError] = useState("");
  const [imageUrl, setImageUrl] = useState<string>(product?.imageUrl ?? "");
  const [imageUploading, setImageUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [selectedCategoryName, setSelectedCategoryName] = useState<string>(product?.category === "មិនទាន់ចាត់ថ្នាក់" ? "" : (product?.category ?? ""));
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>(product?.categoryId ?? (categories.find(c => c.name === product?.category)?.id ?? ""));
  const [showQuickAddCategory, setShowQuickAddCategory] = useState(false);
  const [quickCategoryName, setQuickCategoryName] = useState("");
  const [quickAddingCategory, setQuickAddingCategory] = useState(false);

  async function handleQuickAddCategory() {
    if (!quickCategoryName.trim()) return;
    setQuickAddingCategory(true);
    setError("");
    try {
      const res = await fetch("/api/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: quickCategoryName.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "មិនអាចបង្កើតប្រភេទបានទេ។");
      onCategoryCreated?.(data.category);
      setSelectedCategoryName(data.category.name);
      setSelectedCategoryId(data.category.id);
      setShowQuickAddCategory(false);
      setQuickCategoryName("");
      notify({ kind: "success", title: "បានបង្កើតប្រភេទថ្មី", description: data.category.name });
    } catch (err) {
      setError(err instanceof Error ? err.message : "មិនអាចបង្កើតប្រភេទបានទេ។");
    } finally {
      setQuickAddingCategory(false);
    }
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("សូមជ្រើសរើសឯកសាររូបភាព (JPG, PNG, WebP)");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError("ទំហំរូបភាពមិនត្រូវលើសពី 5MB ឡើយ");
      return;
    }
    setImageUploading(true);
    setError("");
    const reader = new FileReader();
    reader.onload = () => {
      const img = new window.Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const maxDim = 600;
        let w = img.width;
        let h = img.height;
        if (w > h) {
          if (w > maxDim) {
            h = Math.round((h * maxDim) / w);
            w = maxDim;
          }
        } else {
          if (h > maxDim) {
            w = Math.round((w * maxDim) / h);
            h = maxDim;
          }
        }
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.drawImage(img, 0, 0, w, h);
          const compressed = canvas.toDataURL("image/jpeg", 0.85);
          setImageUrl(compressed);
        }
        setImageUploading(false);
      };
      img.onerror = () => {
        setImageUploading(false);
        setError("មិនអាចដំណើរការរូបភាពបានទេ។");
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError("");
    const data = new FormData(event.currentTarget);
    try {
      const response = await fetch(product ? `/api/products/${product.id}` : "/api/products", {
        method: product ? "PATCH" : "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: data.get("name"),
          sku: data.get("sku"),
          category: selectedCategoryName.trim() || null,
          categoryId: selectedCategoryId || null,
          description: data.get("description"),
          price: Number(data.get("price")),
          stock: data.get("stock") ? Number(data.get("stock")) : null,
          active: data.get("active") === "true",
          imageUrl: imageUrl.trim() || null,
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "មិនអាចរក្សាទុកផលិតផលបានទេ។");
      const saved = {
        ...result.product,
        price: Number(result.product.price),
        stock: result.product.stock,
        sku: result.product.sku ?? "",
        imageUrl: result.product.imageUrl ?? null,
        category: result.product.category ?? "មិនទាន់ចាត់ថ្នាក់",
        variants: result.product.variants?.map((variant: Product["variants"][number]) => ({
          ...variant,
          price: variant.price === null ? null : Number(variant.price),
        })) ?? product?.variants ?? [],
      };
      if (product) updated?.(saved);
      else created(saved);
      notify({ kind: "success", title: product ? "បានកែប្រែផលិតផល" : "បានបន្ថែមផលិតផល", description: saved.name });
      close();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "មិនអាចរក្សាទុកផលិតផលបានទេ។"); }
  }
  return <Modal title={product ? "កែប្រែផលិតផល" : "បន្ថែមផលិតផល"} subtitle="គ្រប់គ្រងព័ត៌មានផលិតផល រូបភាព តម្លៃ ស្តុក និងស្ថានភាព។" close={close}>
    <form onSubmit={submit}>
      {error && <div className="error-banner">{error}</div>}

      {/* Product Image Section */}
      <div style={{ marginBottom: "16px", padding: "14px", background: "#f8fafc", borderRadius: "10px", border: "1px solid #e2e8f0" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
          <label style={{ fontSize: "12px", fontWeight: 700, color: "#334155", display: "flex", alignItems: "center", gap: "6px" }}>
            <Camera size={14} color="#2563eb" /> រូបភាពផលិតផល (Product Image)
          </label>
          {imageUrl && (
            <button
              type="button"
              onClick={() => setImageUrl("")}
              style={{ fontSize: "11px", color: "#dc2626", background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: "3px" }}
            >
              <Trash2 size={12} /> លុបរូបភាព
            </button>
          )}
        </div>

        <div style={{ display: "flex", gap: "14px", alignItems: "center" }}>
          <div
            style={{
              width: "72px",
              height: "72px",
              borderRadius: "10px",
              border: "1.5px dashed #cbd5e1",
              background: "#ffffff",
              display: "grid",
              placeItems: "center",
              overflow: "hidden",
              flexShrink: 0,
              boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
            }}
          >
            {imageUrl ? (
              <img src={imageUrl} alt="Preview" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            ) : (
              <div style={{ textAlign: "center", color: "#94a3b8" }}>
                <Camera size={22} style={{ margin: "0 auto 2px", display: "block" }} />
                <span style={{ fontSize: "9px" }}>គ្មានរូប</span>
              </div>
            )}
          </div>

          <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: "8px" }}>
            <div style={{ display: "flex", gap: "8px" }}>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileSelect}
                style={{ display: "none" }}
              />
              <button
                type="button"
                className="button subtle"
                disabled={imageUploading}
                onClick={() => fileInputRef.current?.click()}
                style={{ height: "32px", fontSize: "11.5px", padding: "0 10px" }}
              >
                <Upload size={13} /> {imageUploading ? "កំពុងដំណើរការ…" : "ជ្រើសរើសឯកសាររូបភាព"}
              </button>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <input
                type="url"
                value={imageUrl}
                onChange={(e) => setImageUrl(e.target.value)}
                placeholder="ឬបិទភ្ជាប់តំណ URL រូបភាព (https://...)"
                style={{
                  width: "100%",
                  height: "30px",
                  borderRadius: "6px",
                  border: "1px solid #cbd5e1",
                  padding: "0 8px",
                  fontSize: "11.5px",
                  background: "#ffffff",
                }}
              />
            </div>
          </div>
        </div>
      </div>

      <div className="form-grid"><Field label="ឈ្មោះផលិតផល" name="name" required defaultValue={product?.name} /><Field label="លេខកូដផលិតផល (SKU)" name="sku" defaultValue={product?.sku} />
        <div className="form-field">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
            <label htmlFor="cat-select">ប្រភេទផលិតផល</label>
            <button
              type="button"
              onClick={() => setShowQuickAddCategory(!showQuickAddCategory)}
              style={{ fontSize: "11px", color: "#3164ce", background: "none", border: "none", cursor: "pointer", fontWeight: 600, display: "flex", alignItems: "center", gap: 3 }}
            >
              <Plus size={12} /> បង្កើតប្រភេទថ្មី
            </button>
          </div>
          {showQuickAddCategory ? (
            <div style={{ display: "flex", gap: "6px", alignItems: "center", background: "#f8fafc", padding: "6px", borderRadius: "8px", border: "1px solid #cbd5e1" }}>
              <input
                type="text"
                placeholder="ឈ្មោះប្រភេទថ្មី..."
                value={quickCategoryName}
                onChange={(e) => setQuickCategoryName(e.target.value)}
                style={{ flex: 1, height: "30px", fontSize: "12px", padding: "0 8px" }}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void handleQuickAddCategory(); } }}
              />
              <button
                type="button"
                className="button primary tiny"
                disabled={quickAddingCategory || !quickCategoryName.trim()}
                onClick={() => void handleQuickAddCategory()}
                style={{ height: "30px", padding: "0 10px" }}
              >
                {quickAddingCategory ? "…" : "រក្សាទុក"}
              </button>
              <button
                type="button"
                className="button subtle tiny"
                onClick={() => setShowQuickAddCategory(false)}
                style={{ height: "30px" }}
              >
                បោះបង់
              </button>
            </div>
          ) : (
            <select
              id="cat-select"
              value={selectedCategoryName}
              onChange={(e) => {
                const val = e.target.value;
                setSelectedCategoryName(val);
                const matched = categories.find((c) => c.name === val);
                setSelectedCategoryId(matched?.id ?? "");
              }}
              className="select"
              style={{ width: "100%", height: "38px" }}
            >
              <option value="">-- ជ្រើសរើសប្រភេទ (មិនទាន់ចាត់ថ្នាក់) --</option>
              {categories.map((c) => (
                <option key={c.id} value={c.name}>{c.name}</option>
              ))}
            </select>
          )}
        </div>
        <Field label="តម្លៃ" name="price" type="number" step="0.01" min="0" required defaultValue={product?.price.toString()} />
        <Field label="ស្តុក (មិនចាំបាច់)" name="stock" type="number" min="0" defaultValue={product?.stock?.toString()} />
        <Field label="ការពិពណ៌នា" name="description" defaultValue={product?.description} />
        <div className="form-field"><label htmlFor="active">ស្ថានភាព</label><select id="active" name="active" defaultValue={product?.active === false ? "false" : "true"}><option value="true">សកម្ម</option><option value="false">អសកម្ម</option></select></div>
      </div>
      <div className="modal-actions"><button type="button" className="button" onClick={close}>បោះបង់</button><button className="button primary">{product ? "រក្សាទុកការកែប្រែ" : "រក្សាទុកផលិតផល"}</button></div>
    </form>
  </Modal>;
}

function VariantModal({ product, close, changed, code }: { product: Product; close: () => void; changed: (variants: Product["variants"]) => void; code: string }) {
  const notify = useToast();
  const [editing, setEditing] = useState<Product["variants"][number] | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError("");
    const form = event.currentTarget;
    const data = new FormData(form);
    const body = {
      name: data.get("name"),
      sku: data.get("sku"),
      price: data.get("price") ? Number(data.get("price")) : null,
      stock: data.get("stock") ? Number(data.get("stock")) : null,
      active: data.get("active") === "true",
    };
    try {
      const response = await fetch(editing ? `/api/products/${product.id}/variants/${editing.id}` : `/api/products/${product.id}/variants`, {
        method: editing ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "មិនអាចរក្សាទុកជម្រើសផលិតផលបានទេ។");
      const variant = { ...result.variant, price: result.variant.price === null ? null : Number(result.variant.price) };
      changed(editing ? product.variants.map((entry) => entry.id === variant.id ? variant : entry) : [...product.variants, variant]);
      notify({ kind: "success", title: editing ? "បានកែប្រែជម្រើសផលិតផល" : "បានបន្ថែមជម្រើសផលិតផល", description: variant.name });
      setEditing(null);
      if (!editing) form.reset();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "មិនអាចរក្សាទុកជម្រើសផលិតផលបានទេ។"); }
    finally { setBusy(false); }
  }
  async function remove(variant: Product["variants"][number]) {
    if (!window.confirm(`លុបជម្រើស ${variant.name}? ការលុបត្រូវបានរារាំង ប្រសិនបើមានការបញ្ជាទិញភ្ជាប់។`)) return;
    setError("");
    try {
      const response = await fetch(`/api/products/${product.id}/variants/${variant.id}`, { method: "DELETE" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "មិនអាចលុបជម្រើសបានទេ។");
      changed(product.variants.filter((entry) => entry.id !== variant.id));
      notify({ kind: "success", title: "បានលុបជម្រើសផលិតផល", description: variant.name });
    } catch (cause) { setError(cause instanceof Error ? cause.message : "មិនអាចលុបជម្រើសបានទេ។"); }
  }
  return <Modal title={`ជម្រើសផលិតផល · ${product.name}`} subtitle="បង្កើត កែប្រែ ឬលុបជម្រើស។ ជម្រើសដែលមានការបញ្ជាទិញអាចបិទបាន ប៉ុន្តែមិនអាចលុបបានទេ។" close={close}>
    {error && <div className="error-banner" role="alert">{error}</div>}
    <div className="account-list">{product.variants.map((variant) => <div className="account-row" key={variant.id}>
      <span className="account-copy"><strong>{variant.name}</strong><small>{variant.sku || "—"} · {variant.price === null ? "តម្លៃតាមផលិតផល" : currency(variant.price, code)} · {variant.stock === null ? "មិនតាមដានស្តុក" : `ស្តុក ${khmerNumber(variant.stock)}`}</small></span>
      <Badge value={variant.active === false ? "អសកម្ម" : "សកម្ម"} className={variant.active === false ? "amber" : "green"} />
      <div className="table-actions-group">
        <button
          type="button"
          className="action-icon-btn edit-action"
          title="កែប្រែជម្រើស"
          onClick={() => setEditing(variant)}
          aria-label="Edit variant"
        >
          <Edit2 size={13} />
        </button>
        <button
          type="button"
          className="action-icon-btn delete-action"
          title="លុបជម្រើស"
          onClick={() => void remove(variant)}
          aria-label="Delete variant"
        >
          <Trash2 size={13} />
        </button>
      </div>
    </div>)}</div>
    <form key={editing?.id ?? "new"} onSubmit={save}>
      <div className="form-grid">
        <Field label="ឈ្មោះជម្រើស" name="name" required defaultValue={editing?.name} />
        <Field label="លេខកូដ SKU" name="sku" defaultValue={editing?.sku ?? ""} />
        <Field label="តម្លៃផ្ទាល់ខ្លួន (ទទេ = តាមផលិតផល)" name="price" type="number" min="0" step="0.01" defaultValue={editing?.price?.toString()} />
        <Field label="ស្តុក (ទទេ = មិនតាមដាន)" name="stock" type="number" min="0" defaultValue={editing?.stock?.toString()} />
        <div className="form-field"><label htmlFor="variant-active">ស្ថានភាព</label><select id="variant-active" name="active" defaultValue={editing?.active === false ? "false" : "true"}><option value="true">សកម្ម</option><option value="false">អសកម្ម</option></select></div>
      </div>
      <div className="modal-actions">{editing && <button type="button" className="button" onClick={() => setEditing(null)}>បោះបង់ការកែប្រែ</button>}<button type="submit" className="button primary" disabled={busy}>{busy ? "កំពុងរក្សាទុក…" : editing ? "រក្សាទុកជម្រើស" : "បន្ថែមជម្រើស"}</button></div>
    </form>
  </Modal>;
}

function OrderModal({ customers, products, close, created, code, order, updated, initialMode }: { customers: Customer[]; products: Product[]; close: () => void; created: (order: Order) => void; code: string; order?: EditableOrder; updated?: (order: Order) => void; initialMode?: "pos" | "social" }) {
  return <CambodiaOrderModal customers={customers} products={products} close={close} created={created} code={code} order={order} updated={updated} initialMode={initialMode} />;
}

function Modal({ title, subtitle, close, children }: { title: string; subtitle: string; close: () => void; children: React.ReactNode }) {
  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}>
    <section className="modal" role="dialog" aria-modal="true" aria-label={title}>
      <div className="modal-head"><div><h2>{title}</h2><p>{subtitle}</p></div><button className="icon-button" aria-label="បិទ" onClick={close}><X size={17} /></button></div>
      {children}
    </section>
  </div>;
}

function Field({ label, name, type = "text", required, placeholder, defaultValue, min, step }: {
  label: string; name: string; type?: string; required?: boolean; placeholder?: string; defaultValue?: string; min?: string; step?: string;
}) {
  return <div className="form-field"><label htmlFor={name}>{label}</label><input id={name} name={name} type={type} required={required} placeholder={placeholder} defaultValue={defaultValue} min={min} step={step} /></div>;
}

function ChannelOptions() {
  return <><option value="DIRECT">ផ្ទាល់</option><option value="FACEBOOK">ហ្វេសប៊ុក</option><option value="TIKTOK">ធីកតុក</option><option value="TELEGRAM">តេលេក្រាម</option><option value="OTHER">ផ្សេងៗ</option></>;
}

export function Workspace(props: Props) {
  const [section, setSection] = useState<Section>("Overview");
  const [storeInfo, setStoreInfo] = useState({
    name: props.user.store,
    phone: props.user.storePhone || "",
    address: props.user.storeAddress || "",
    bakongAccountId: props.user.bakongAccountId || "",
    exchangeRate: props.user.exchangeRate || 4100,
  });
  const [currentUserAvatar, setCurrentUserAvatar] = useState<string | null>(props.user.avatarUrl ?? null);
  const [currentUserName, setCurrentUserName] = useState<string>(props.user.name);
  const [orders, setOrders] = useState(props.orders);
  const [customers, setCustomers] = useState(props.customers);
  const [products, setProducts] = useState(props.products);
  const [categories, setCategories] = useState(props.categories);
  const [selectedProductCategory, setSelectedProductCategory] = useState<string>("");

  useEffect(() => {
    setProducts(props.products);
  }, [props.products]);
  useEffect(() => {
    setCategories(props.categories);
  }, [props.categories]);
  useEffect(() => {
    setOrders(props.orders);
  }, [props.orders]);
  useEffect(() => {
    setCustomers(props.customers);
  }, [props.customers]);
  const [query, setQuery] = useState("");
  const [customerSearch, setCustomerSearch] = useState<{ query: string; results: Customer[]; error: string }>({ query: "", results: [], error: "" });
  const [orderSearch, setOrderSearch] = useState("");
  const [customerFilter, setCustomerFilter] = useState("អតិថិជនទាំងអស់");
  const [customerSort, setCustomerSort] = useState("recent");
  const [selectedCustomerId, setSelectedCustomerId] = useState("");
  const [modal, setModal] = useState<"customer" | "order" | "product" | null>(null);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [editingOrder, setEditingOrder] = useState<EditableOrder | null>(null);
  const [posMode, setPosMode] = useState(false);
  const [dailyPrepOpen, setDailyPrepOpen] = useState(false);
  const [variantProductId, setVariantProductId] = useState("");
  const [report, setReport] = useState<ReportData | null>(null);
  const [reportError, setReportError] = useState("");
  const [range, setRange] = useState(30);
  const [reportFrom, setReportFrom] = useState("");
  const [reportTo, setReportTo] = useState("");
  const [logoutBusy, setLogoutBusy] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem("som_sidebar_collapsed");
      if (saved === "true") setSidebarCollapsed(true);
    } catch {}
  }, []);

  const toggleSidebarCollapsed = () => {
    setSidebarCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem("som_sidebar_collapsed", String(next));
      } catch {}
      return next;
    });
  };
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [globalSearch, setGlobalSearch] = useState("");
  const [globalSearchOpen, setGlobalSearchOpen] = useState(false);
  const [globalSearchResults, setGlobalSearchResults] = useState<GlobalSearchResult[]>([]);
  const [globalSearchLoading, setGlobalSearchLoading] = useState(false);
  const [globalSearchError, setGlobalSearchError] = useState("");
  const [focusedConversationId, setFocusedConversationId] = useState("");
  const [selectedOrderDrawerId, setSelectedOrderDrawerId] = useState<string | null>(null);
  const [focusedSuggestionId, setFocusedSuggestionId] = useState<string | null>(null);
  const [printOrderData, setPrintOrderData] = useState<PrintableOrder | null>(null);
  const [stockAdjustProduct, setStockAdjustProduct] = useState<Product | null>(null);
  const [customerAddressModalData, setCustomerAddressModalData] = useState<{ customerId: string; customerName: string; customerPhone?: string | null; address?: CustomerAddressItem | null } | null>(null);
  const [lang, setLang] = useState<"kh" | "en">("kh");
  const topbarRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!mobileNavOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMobileNavOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [mobileNavOpen]);
  useEffect(() => {
    const closeMenus = (event: MouseEvent | KeyboardEvent) => {
      if (event instanceof KeyboardEvent && event.key === "Escape") {
        setNotificationsOpen(false);
        setProfileOpen(false);
        setGlobalSearchOpen(false);
        return;
      }
      if (event instanceof MouseEvent && !topbarRef.current?.contains(event.target as Node)) {
        setNotificationsOpen(false);
        setProfileOpen(false);
        setGlobalSearchOpen(false);
      }
    };
    document.addEventListener("pointerdown", closeMenus);
    document.addEventListener("keydown", closeMenus);
    return () => {
      document.removeEventListener("pointerdown", closeMenus);
      document.removeEventListener("keydown", closeMenus);
    };
  }, []);

  const selectedCustomer = (customerSearch.query === query.trim()
    ? customerSearch.results.find((customer) => customer.id === selectedCustomerId)
    : undefined)
    ?? customers.find((customer) => customer.id === selectedCustomerId)
    ?? null;
  useEffect(() => {
    const term = query.trim();
    if (section !== "Customers" || term.length < 2) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch(`/api/customers?search=${encodeURIComponent(term)}&pageSize=100`, { signal: controller.signal });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error ?? "មិនអាចស្វែងរកអតិថិជនបានទេ។");
        setCustomerSearch({ query: term, results: data.customers, error: "" });
      } catch (error) {
        if (controller.signal.aborted) return;
        setCustomerSearch({ query: term, results: [], error: error instanceof Error ? error.message : "មិនអាចស្វែងរកអតិថិជនបានទេ។" });
      }
    }, 250);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [query, section]);

  const filteredCustomers = useMemo(() => {
    const needle = query.toLowerCase();
    const liveResults = query.trim().length >= 2 && customerSearch.query === query.trim() ? customerSearch.results : customers;
    const result = liveResults.filter((customer) => {
      const matches = `${customer.name} ${customer.phone} ${customer.email}`.toLowerCase().includes(needle);
      const segment = customerFilter === "អតិថិជនទិញម្ដងទៀត" ? customer.orderCount >= 2
        : customerFilter === "ការបញ្ជាទិញដំបូង" ? customer.orderCount === 1
        : customerFilter === "មិនទាន់មានការបញ្ជាទិញ" ? customer.orderCount === 0
        : true;
      return matches && segment;
    });
    result.sort((a, b) => customerSort === "spend" ? b.totalSpent - a.totalSpent
      : customerSort === "orders" ? b.orderCount - a.orderCount
      : new Date(b.lastOrderAt ?? 0).getTime() - new Date(a.lastOrderAt ?? 0).getTime());
    return result;
  }, [customers, customerSearch, query, customerFilter, customerSort]);

  useEffect(() => {
    if (section !== "Reports" && section !== "Overview") return;
    let cancelled = false;
    const dateQuery = section === "Reports" && reportFrom && reportTo
      ? `from=${encodeURIComponent(reportFrom)}&to=${encodeURIComponent(reportTo)}`
      : `days=${section === "Overview" ? 7 : range}`;
    fetch(`/api/reports?${dateQuery}`)
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error ?? "មិនអាចផ្ទុករបាយការណ៍បានទេ។");
        if (!cancelled) {
          setReportError("");
          setReport(data);
        }
      })
      .catch((error: unknown) => { if (!cancelled) setReportError(error instanceof Error ? error.message : "មិនអាចផ្ទុករបាយការណ៍បានទេ។"); });
    return () => { cancelled = true; };
  }, [section, range, reportFrom, reportTo]);

  const searchCustomers = (value: string) => setQuery(value);
  const searchResults = globalSearchResults;
  const pendingNotifications = useMemo(
    () => props.suggestions.filter((suggestion) => suggestion.status === "PENDING").slice(0, 4),
    [props.suggestions],
  );
  useEffect(() => {
    const term = globalSearch.trim();
    if (!globalSearchOpen || term.length < 2) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const params = new URLSearchParams({ search: term, page: "1", pageSize: "5" });
        const [ordersResponse, customersResponse, conversationsResponse] = await Promise.all([
          fetch(`/api/orders?${params}`, { signal: controller.signal }),
          fetch(`/api/customers?${params}`, { signal: controller.signal }),
          fetch(`/api/conversations?search=${encodeURIComponent(term)}`, { signal: controller.signal }),
        ]);
        const [ordersData, customersData, conversationsData] = await Promise.all([
          ordersResponse.json(), customersResponse.json(), conversationsResponse.json(),
        ]);
        if (!ordersResponse.ok) throw new Error(ordersData.error ?? "មិនអាចស្វែងរកការបញ្ជាទិញបានទេ។");
        if (!customersResponse.ok) throw new Error(customersData.error ?? "មិនអាចស្វែងរកអតិថិជនបានទេ។");
        if (!conversationsResponse.ok) throw new Error(conversationsData.error ?? "មិនអាចស្វែងរកសារបានទេ។");
        const orderMatches: GlobalSearchResult[] = ordersData.orders.map((order: {
          id: string; orderNumber: string; customer: { name: string }; status: string;
        }) => ({
          id: order.id,
          label: order.orderNumber,
          detail: `${order.customer.name} · ${statusLabels[order.status] ?? order.status}`,
          section: "Orders",
          searchTerm: order.orderNumber,
        }));
        const customerMatches: GlobalSearchResult[] = customersData.customers.map((customer: {
          id: string; name: string; phone: string | null; email: string | null;
        }) => ({
          id: customer.id,
          label: customer.name,
          detail: customer.phone || customer.email || "អតិថិជន",
          section: "Customers",
          searchTerm: customer.name,
        }));
        const conversationMatches: GlobalSearchResult[] = conversationsData.conversations.slice(0, 4).map((conversation: {
          id: string; customer: { name: string } | null; messages: { body: string }[];
        }) => ({
          id: conversation.id,
          label: conversation.customer?.name ?? "អតិថិជនមិនស្គាល់",
          detail: conversation.messages[0]?.body ?? "ការសន្ទនា",
          section: "Conversations",
          searchTerm: conversation.messages[0]?.body ?? "",
        }));
        const categoryMatches: GlobalSearchResult[] = categories
          .filter((c) => c.name.toLowerCase().includes(term.toLowerCase()))
          .slice(0, 3)
          .map((c) => ({
            id: c.id,
            label: c.name,
            detail: `ប្រភេទផលិតផល (${khmerNumber(c.productCount)} មុខ)`,
            section: "Categories",
            searchTerm: c.name,
          }));
        if (!controller.signal.aborted) setGlobalSearchResults([...orderMatches, ...customerMatches, ...categoryMatches, ...conversationMatches].slice(0, 8));
      } catch (cause) {
        if (controller.signal.aborted) return;
        setGlobalSearchResults([]);
        setGlobalSearchError(cause instanceof Error ? cause.message : "មិនអាចស្វែងរកបានទេ។");
      } finally {
        if (!controller.signal.aborted) setGlobalSearchLoading(false);
      }
    }, 250);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [globalSearch, globalSearchOpen]);

  function chooseSearchResult(result: { id: string; section: Section; searchTerm: string }) {
    setGlobalSearch("");
    setGlobalSearchOpen(false);
    setNotificationsOpen(false);
    setProfileOpen(false);
    setSection(result.section);
    setQuery("");
    setOrderSearch(result.section === "Orders" ? result.searchTerm : "");
    if (result.section === "Customers") setQuery(result.searchTerm);
    if (result.section === "Conversations") setFocusedConversationId(result.id);
    if (result.section === "Customers") setSelectedCustomerId(result.id);
  }

  async function logout() {
    setLogoutBusy(true);
    try {
      await signOut({ callbackUrl: "/login" });
    } finally {
      setLogoutBusy(false);
    }
  }

  const navTo = (label: Section) => {
    setSection(label);
    setQuery("");
    setOrderSearch("");
    setNotificationsOpen(false);
    setProfileOpen(false);
  };

  return <div className="app-shell">
    <a className="skip-link" href="#main-content">រំលងទៅកាន់ខ្លឹមសារចម្បង</a>
    {mobileNavOpen && <button className="sidebar-backdrop" aria-label="បិទម៉ឺនុយ" onClick={() => setMobileNavOpen(false)} />}
    <aside id="workspace-sidebar" className={`sidebar ${sidebarCollapsed ? "collapsed" : ""} ${mobileNavOpen ? "mobile-open" : ""}`}>
      <button className="brand brand-button" onClick={() => { navTo("Overview"); setMobileNavOpen(false); }} title={sidebarCollapsed ? "SOM — ផ្ទាំងទំព័រដើម (ចុចដើម្បីពង្រីក)" : "SOM — ផ្ទាំងទំព័រដើម"}>
        <span className="brand-mark"><Image src="/som-mark.png" alt="SOM Logo" width={32} height={28} priority /></span>
        <span className="brand-copy"><strong>SOM</strong><small>ប្រព័ន្ធគ្រប់គ្រងការបញ្ជាទិញ</small></span>
      </button>
      <nav className="nav-group" aria-label="ម៉ឺនុយចម្បង">
        <div className="nav-label">កន្លែងធ្វើការ</div>
        {navigation.filter(({ label }) => (label !== "Users" || props.user.role === "OWNER") && (label !== "Audit Logs" || props.user.role === "OWNER" || props.user.role === "ADMIN")).map(({ label, icon: Icon }) => <button key={label} className={`nav-link ${section === label ? "active" : ""}`} onClick={() => { navTo(label); setMobileNavOpen(false); }} title={sectionNames[label]} aria-current={section === label ? "page" : undefined}>
          <Icon size={16} strokeWidth={1.8} /><span>{sectionNames[label]}</span>
          {label === "Order Detection" && props.summary.awaitingReview > 0 && <span className="nav-count">{khmerNumber(props.summary.awaitingReview)}</span>}
        </button>)}
      </nav>
      <div className="side-footer">
        <div className="profile">
          <div className="avatar small">{currentUserAvatar ? <img src={currentUserAvatar} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: "50%" }} /> : initials(currentUserName)}</div>
          <div>
            <div className="profile-name">{currentUserName}</div>
            <div className="profile-role">{props.user.role === "OWNER" ? "ម្ចាស់ហាង" : "បុគ្គលិក"} · {storeInfo.name}</div>
          </div>
        </div>
      </div>
    </aside>
    <div className={`main-area ${sidebarCollapsed ? "sidebar-collapsed" : ""}`}>
      <header className="topbar" ref={topbarRef}>
        <div className="topbar-title">
          <button
            className="icon-button topbar-menu-toggle"
            aria-label="បិទ/បើកម៉ឺនុយ"
            aria-controls="workspace-sidebar"
            aria-expanded={mobileNavOpen || !sidebarCollapsed}
            onClick={() => {
              if (typeof window !== "undefined" && window.innerWidth <= 800) {
                setMobileNavOpen((open) => !open);
              } else {
                toggleSidebarCollapsed();
              }
            }}
            title={sidebarCollapsed ? "ពង្រីកម៉ឺនុយ (Full Menu)" : "បង្រួមម៉ឺនុយ (Icon Only)"}
          >
            <Menu size={19} />
          </button>
          <div className="breadcrumbs"><span>{storeInfo.name}</span><span>›</span><strong>{sectionNames[section]}</strong></div>
        </div>
        <div className="global-search-wrap">
          <label className="search-global">
            <Search size={17} aria-hidden="true" />
            <input
              role="combobox"
              aria-label="ស្វែងរកការបញ្ជាទិញ អតិថិជន ឬសារ"
              aria-autocomplete="list"
              aria-expanded={globalSearchOpen && searchResults.length > 0}
              aria-controls="global-search-results"
              placeholder="ស្វែងរកការបញ្ជាទិញ អតិថិជន ឬសារ..."
              value={globalSearch}
              onFocus={() => {
                setGlobalSearchOpen(true);
                setNotificationsOpen(false);
                setProfileOpen(false);
                if (globalSearch.trim().length >= 2) setGlobalSearchLoading(true);
              }}
              onChange={(event) => {
                const value = event.target.value;
                setGlobalSearch(value);
                setGlobalSearchResults([]);
                setGlobalSearchError("");
                setGlobalSearchLoading(value.trim().length >= 2);
                setGlobalSearchOpen(true);
                setNotificationsOpen(false);
                setProfileOpen(false);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter" && searchResults[0]) chooseSearchResult(searchResults[0]);
                if (event.key === "Escape") setGlobalSearchOpen(false);
              }}
            />
            {globalSearch && <button type="button" className="global-search-clear" aria-label="សម្អាតការស្វែងរក" onClick={() => { setGlobalSearch(""); setGlobalSearchResults([]); setGlobalSearchError(""); }}><X size={14} /></button>}
          </label>
          {globalSearchOpen && globalSearch.trim().length >= 2 && <div className="global-search-results" id="global-search-results" role="listbox" aria-label="លទ្ធផលស្វែងរក">
            {globalSearchLoading ? <div className="global-search-empty">កំពុងស្វែងរក…</div> : globalSearchError ? <div className="global-search-empty" role="alert">{globalSearchError}</div> : searchResults.length ? searchResults.map((result) => <button type="button" role="option" aria-selected="false" className="global-search-result" key={`${result.section}-${result.id}`} onClick={() => chooseSearchResult(result)}>
              <span className="global-search-result-icon">{result.section === "Orders" ? <ShoppingCart size={15} /> : result.section === "Customers" ? <Users size={15} /> : <MessageSquareText size={15} />}</span>
              <span><strong>{result.label}</strong><small>{result.detail}</small></span>
              <small className="global-search-section">{sectionNames[result.section]}</small>
            </button>) : <div className="global-search-empty">រកមិនឃើញការបញ្ជាទិញ អតិថិជន ឬសារដែលត្រូវគ្នាទេ។</div>}
          </div>}
        </div>
        <div className="top-actions">
          <div className="rate-badge-pill" title="អត្រាប្តូរប្រាក់កម្ពុជាលំនាំដើម">💱 1$ = ៛4,100</div>
          <button type="button" className="lang-toggle-btn" onClick={() => setLang((l) => l === "kh" ? "en" : "kh")} title="ប្តូរភាសា / Toggle Language">
            🌐 {lang === "kh" ? "ខ្មែរ" : "EN"}
          </button>
          <div className="header-menu-wrap">
            <button className="icon-button notification-button" aria-label={`ការជូនដំណឹង ${khmerNumber(props.summary.awaitingReview)}`} title="ការជូនដំណឹង" aria-haspopup="dialog" aria-expanded={notificationsOpen} onClick={() => { setNotificationsOpen((open) => !open); setProfileOpen(false); setGlobalSearchOpen(false); }}>
              <Bell size={17} />{props.summary.awaitingReview > 0 && <span className="notification-count">{khmerNumber(props.summary.awaitingReview)}</span>}
            </button>
            {notificationsOpen && <section className="header-popover notification-popover" role="dialog" aria-label="ការជូនដំណឹងថ្មីៗ">
              <div className="popover-heading"><div><strong>ការជូនដំណឹង</strong><small>{khmerNumber(props.summary.awaitingReview)} សំណើរង់ចាំពិនិត្យ</small></div><span className="popover-heading-icon"><Bell size={16} /></span></div>
              {pendingNotifications.length ? <div className="notification-list">{pendingNotifications.map((suggestion) => <button className="notification-item" key={suggestion.id} onClick={() => { navTo("Order Detection"); setNotificationsOpen(false); }}>
                <span className="notification-item-icon"><Sparkles size={15} /></span>
                <span className="notification-item-copy"><strong>{suggestion.customer}</strong><small>{intentNames[suggestion.intent] ?? suggestion.intent} · {channelNames[suggestion.channel] ?? suggestion.channel}</small><small className="notification-time">{dateTimeLabel(suggestion.createdAt)}</small></span>
                <span className={`confidence ${suggestion.confidence >= 75 ? "high" : "low"}`}>{khmerNumber(suggestion.confidence)}%</span>
              </button>)}</div> : <div className="notification-empty">{props.summary.awaitingReview > 0 ? <><Sparkles size={20} /><strong>មានសំណើរង់ចាំពិនិត្យ</strong><span>បើក AI Review ដើម្បីមើលសំណើចុងក្រោយទាំងអស់។</span></> : <><CheckCircle2 size={20} /><strong>ទាន់សម័យហើយ</strong><span>មិនមានសំណើរង់ចាំពិនិត្យទេ។</span></>}</div>}
              <button className="popover-footer-action" onClick={() => { navTo("Order Detection"); setNotificationsOpen(false); }}>មើលសំណើ AI ទាំងអស់ <ArrowUpRight size={14} /></button>
            </section>}
          </div>
          <div className="header-menu-wrap">
            <button className={`profile-trigger ${profileOpen ? "active" : ""}`} aria-label="បើកម៉ឺនុយប្រវត្តិរូប" aria-haspopup="menu" aria-expanded={profileOpen} onClick={() => { setProfileOpen((open) => !open); setNotificationsOpen(false); setGlobalSearchOpen(false); }}>
              <span className="avatar small">{currentUserAvatar ? <img src={currentUserAvatar} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: "50%" }} /> : initials(currentUserName)}</span><span className="profile-trigger-copy"><strong>{currentUserName}</strong><small>{props.user.role === "OWNER" ? "ម្ចាស់ហាង" : "បុគ្គលិក"}</small></span><ChevronDown size={14} />
            </button>
            {profileOpen && <div className="header-popover profile-popover" role="menu" aria-label="ម៉ឺនុយគណនី">
              <div className="profile-popover-head"><span className="avatar">{currentUserAvatar ? <img src={currentUserAvatar} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: "50%" }} /> : initials(currentUserName)}</span><span><strong>{currentUserName}</strong><small>{storeInfo.name}</small></span></div>
              <button role="menuitem" onClick={() => { navTo("Settings"); setProfileOpen(false); }}><Settings size={15} /> ការកំណត់គណនី និងហាង</button>
              {props.user.role === "OWNER" && <button role="menuitem" onClick={() => { navTo("Users"); setProfileOpen(false); }}><Users size={15} /> គ្រប់គ្រងអ្នកប្រើប្រាស់</button>}
              <button role="menuitem" disabled={logoutBusy} onClick={() => void logout()}><LogOut size={15} /> {logoutBusy ? "កំពុងចេញពីគណនី…" : "ចេញពីគណនី"}</button>
            </div>}
          </div>
          <button className="button primary header-action" aria-label="បង្កើតការបញ្ជាទិញ" onClick={() => { setPosMode(false); setEditingOrder(null); setModal("order"); }}><Plus size={14} /> {lang === "kh" ? "កម្មង់រហ័ស" : "Quick Order"}</button>
        </div>
      </header>
      <main id="main-content" className="content" tabIndex={-1}>
        {section === "Overview" && <Overview {...props} orders={orders} report={report} reportError={reportError} openSection={navTo} code={props.user.currency} />}
        {section === "Customers" && <CustomersView customers={filteredCustomers} selected={selectedCustomer} onSelect={setSelectedCustomerId} query={query} setQuery={searchCustomers} searchError={customerSearch.query === query.trim() ? customerSearch.error : ""} filter={customerFilter} setFilter={setCustomerFilter} sort={customerSort} setSort={setCustomerSort} total={props.summary.customersCount} code={props.user.currency} add={() => { setEditingCustomer(null); setModal("customer"); }} editCustomer={(customer) => { setEditingCustomer(customer); setModal("customer"); }} deleteCustomer={async (customer) => {
          if (!window.confirm(`តើអ្នកចង់លុបអតិថិជន ${customer.name} មែនទេ? ការលុបត្រូវបានរារាំង ប្រសិនបើមានការបញ្ជាទិញ ឬទិន្នន័យភ្ជាប់។`)) return;
          const response = await fetch(`/api/customers/${customer.id}`, { method: "DELETE" });
          const data = await response.json();
          if (!response.ok) throw new Error(data.error ?? "មិនអាចលុបអតិថិជនបានទេ។");
          setCustomers((old) => old.filter((entry) => entry.id !== customer.id));
          if (selectedCustomerId === customer.id) setSelectedCustomerId(customers.find((entry) => entry.id !== customer.id)?.id ?? "");
        }} updateNote={async (customerId, noteId, body) => {
          const response = await fetch(`/api/customers/${customerId}/notes/${noteId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ body }) });
          const data = await response.json();
          if (!response.ok) throw new Error(data.error ?? "មិនអាចកែប្រែកំណត់ចំណាំបានទេ។");
          setCustomers((old) => old.map((customer) => customer.id === customerId ? { ...customer, notes: customer.notes.map((entry) => entry.id === noteId ? data.note : entry) } : customer));
        }} deleteNote={async (customerId, noteId) => {
          const response = await fetch(`/api/customers/${customerId}/notes/${noteId}`, { method: "DELETE" });
          const data = await response.json();
          if (!response.ok) throw new Error(data.error ?? "មិនអាចលុបកំណត់ចំណាំបានទេ។");
          setCustomers((old) => old.map((customer) => customer.id === customerId ? { ...customer, notes: customer.notes.filter((entry) => entry.id !== noteId) } : customer));
        }} addNote={async (customerId, body) => {
          const response = await fetch(`/api/customers/${customerId}/notes`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ body }) });
          const data = await response.json();
          if (!response.ok) throw new Error(data.error ?? "មិនអាចបន្ថែមកំណត់ចំណាំបានទេ។");
          setCustomers((old) => old.map((customer) => customer.id === customerId ? { ...customer, notes: [data.note, ...customer.notes] } : customer));
        }} onAddAddress={(cust: Customer) => setCustomerAddressModalData({ customerId: cust.id, customerName: cust.name, customerPhone: cust.phone })} />}
        {section === "Reports" && <ReportsView
          data={report}
          error={reportError}
          range={range}
          setRange={(value) => { setRange(value); setReportFrom(""); setReportTo(""); setReportError(""); }}
          from={reportFrom}
          to={reportTo}
          setFrom={(value) => { setReportFrom(value); setReportError(""); }}
          setTo={(value) => { setReportTo(value); setReportError(""); }}
          code={props.user.currency}
          store={storeInfo.name}
          storePhone={storeInfo.phone}
          storeAddress={storeInfo.address}
          exchangeRate={storeInfo.exchangeRate}
          onOpenDailyPrep={() => setDailyPrepOpen(true)}
        />}
        {section === "Orders" && <OrdersView
          orders={orders}
          search={orderSearch}
          setSearch={setOrderSearch}
          code={props.user.currency}
          create={() => { setPosMode(false); setEditingOrder(null); setModal("order"); }}
          createPos={() => { setPosMode(true); setEditingOrder(null); setModal("order"); }}
          onOpenDailyPrep={() => setDailyPrepOpen(true)}
          onNavigateToDetection={() => navTo("Order Detection")}
          pendingSuggestionsCount={props.suggestions.filter((s) => s.status === "PENDING").length}
          edit={async (orderId: string) => {
            const response = await fetch(`/api/orders/${orderId}`);
            const data = await response.json();
            if (!response.ok) throw new Error(data.error ?? "មិនអាចផ្ទុកការបញ្ជាទិញបានទេ។");
            setEditingOrder({ ...data.order, discount: Number(data.order.discount), deliveryFee: Number(data.order.deliveryFee), items: data.order.items });
            setPosMode(false);
            setModal("order");
          }}
          remove={async (order: Order) => {
            const response = await fetch(`/api/orders/${order.id}`, { method: "DELETE" });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error ?? "មិនអាចលុបការបញ្ជាទិញបានទេ។");
            setOrders((old) => old.filter((entry) => entry.id !== order.id));
          }}
          refresh={setOrders}
          onOpenDrawer={(id: string) => setSelectedOrderDrawerId(id)}
          onPrintOrder={async (order: Order) => {
          const res = await fetch(`/api/orders/${order.id}`);
          const data = await res.json();
          if (res.ok && data.order) {
            setPrintOrderData({
              id: data.order.id,
              orderNumber: data.order.orderNumber,
              customer: data.order.customer.name,
              phone: data.order.customer.phone || "",
              status: data.order.status,
              channel: data.order.channel,
              subtotal: Number(data.order.subtotal),
              discount: Number(data.order.discount),
              deliveryFee: Number(data.order.deliveryFee),
              total: Number(data.order.total),
              deliveryAddress: data.order.deliveryAddress,
              notes: data.order.notes,
              createdAt: data.order.createdAt,
              items: data.order.items.map((it: any) => ({
                productName: it.productName,
                variantName: it.variantName,
                quantity: it.quantity,
                unitPrice: Number(it.unitPrice),
                lineTotal: Number(it.lineTotal),
              })),
            });
          }
        }} />}
        {section === "Products" && (
          <ProductsView
            products={products}
            categories={categories}
            initialCategory={selectedProductCategory}
            lowStockCount={props.summary.lowStockCount}
            code={props.user.currency}
            onOpenCategories={() => navTo("Categories")}
            add={() => { setEditingProduct(null); setModal("product"); }}
            edit={(product: Product) => { setEditingProduct(product); setModal("product"); }}
            onAdjustStock={(product: Product) => setStockAdjustProduct(product)}
            onOpenInventory={() => navTo("Inventory")}
            remove={async (product: Product) => {
              const response = await fetch(`/api/products/${product.id}`, { method: "DELETE" });
              const data = await response.json();
              if (!response.ok) throw new Error(data.error ?? "មិនអាចលុបផលិតផលបានទេ។");
              setProducts((old) => old.filter((entry) => entry.id !== product.id));
            }}
            manageVariants={(product) => setVariantProductId(product.id)}
          />
        )}
        {section === "Categories" && (
          <CategoriesView
            categories={categories}
            products={products}
            code={props.user.currency}
            onOpenProductsWithCategory={(catName) => {
              setSelectedProductCategory(catName);
              navTo("Products");
            }}
            onCategoriesUpdated={(newCats) => setCategories(newCats)}
          />
        )}
        {section === "Inventory" && (
          <InventoryView
            products={products}
            onRefreshProducts={async () => {
              const res = await fetch("/api/products");
              const data = await res.json();
              if (res.ok && data.products) setProducts(data.products);
            }}
          />
        )}
        {section === "Order Detection" && (
          <DetectionView
            suggestions={props.suggestions}
            products={products}
            focusedSuggestionId={focusedSuggestionId}
            onClearFocusedSuggestion={() => setFocusedSuggestionId(null)}
            onNavigateToOrders={() => navTo("Orders")}
            onOpenOrder={(orderId) => setSelectedOrderDrawerId(orderId)}
          />
        )}
        {section === "Live CF Studio" && (
          <LiveCfStudio
            currencyCode={props.user.currency}
            onNavigateToOrders={() => navTo("Orders")}
            onNavigateToConversations={() => navTo("Conversations")}
          />
        )}
        {section === "Conversations" && <ConversationsView key={focusedConversationId} conversations={props.conversations} customers={customers} simulatorEnabled={props.simulatorEnabled} focusedConversationId={focusedConversationId} />}
        {section === "Users" && props.user.role === "OWNER" && <UserManagement />}
        {section === "Audit Logs" && (props.user.role === "OWNER" || props.user.role === "ADMIN") && <AuditLogsView />}
        {section === "Settings" && (
          <SettingsView
            storeInfo={storeInfo}
            onUpdateStore={setStoreInfo}
            role={props.user.role}
            currentUser={{
              name: currentUserName,
              role: props.user.role,
              avatarUrl: currentUserAvatar,
            }}
            onProfileUpdated={(updated) => {
              if (updated.name) setCurrentUserName(updated.name);
              if (updated.avatarUrl !== undefined) setCurrentUserAvatar(updated.avatarUrl);
            }}
            onOpenLiveCf={() => setSection("Live CF Studio")}
          />
        )}
      </main>
    </div>
    {modal === "customer" && <CustomerModal customer={editingCustomer ?? undefined} close={() => { setModal(null); setEditingCustomer(null); }} updated={(updated) => setCustomers((old) => old.map((entry) => entry.id === updated.id ? updated : entry))} created={(customer) => { setCustomers((old) => [customer, ...old]); setQuery(""); setSelectedCustomerId(customer.id); }} />}
    {modal === "product" && (
      <ProductModal
        product={editingProduct ?? undefined}
        categories={categories}
        onCategoryCreated={(newCat) => setCategories((old) => [...old, newCat])}
        close={() => { setModal(null); setEditingProduct(null); }}
        updated={(product) => setProducts((old) => old.map((entry) => entry.id === product.id ? product : entry))}
        created={(product) => setProducts((old) => [product, ...old])}
      />
    )}
    {variantProductId && products.find((product) => product.id === variantProductId) && <VariantModal product={products.find((product) => product.id === variantProductId)!} code={props.user.currency} close={() => setVariantProductId("")} changed={(variants) => setProducts((old) => old.map((product) => product.id === variantProductId ? { ...product, variants } : product))} />}
    {modal === "order" && (
      <OrderModal
        order={editingOrder ?? undefined}
        customers={customers}
        products={products}
        close={() => { setModal(null); setEditingOrder(null); setPosMode(false); }}
        code={props.user.currency}
        initialMode={posMode ? "pos" : "social"}
        updated={(order) => setOrders((old) => old.map((entry) => entry.id === order.id ? order : entry))}
        created={(order) => setOrders((old) => [order, ...old])}
      />
    )}
    {selectedOrderDrawerId && (
      <OrderDetailsDrawer
        orderId={selectedOrderDrawerId}
        storeName={storeInfo.name}
        storePhone={storeInfo.phone}
        storeAddress={storeInfo.address}
        exchangeRate={storeInfo.exchangeRate}
        lang={lang}
        close={() => setSelectedOrderDrawerId(null)}
        onNavigateToDetection={(suggestionId) => {
          setSelectedOrderDrawerId(null);
          setFocusedSuggestionId(suggestionId);
          navTo("Order Detection");
        }}
        onStatusChange={(orderId, newStatus) => {
          setOrders((old) => old.map((o) => o.id === orderId ? { ...o, status: newStatus } : o));
        }}
        onEdit={async (orderId) => {
          const response = await fetch(`/api/orders/${orderId}`);
          const data = await response.json();
          if (response.ok) {
            setEditingOrder({ ...data.order, discount: Number(data.order.discount), deliveryFee: Number(data.order.deliveryFee), items: data.order.items });
            setModal("order");
          }
        }}
        onDelete={async (orderId) => {
          const response = await fetch(`/api/orders/${orderId}`, { method: "DELETE" });
          if (response.ok) {
            setOrders((old) => old.filter((o) => o.id !== orderId));
          }
        }}
      />
    )}
    {printOrderData && (
      <OrderPrintDialog
        order={printOrderData}
        storeName={storeInfo.name}
        storePhone={storeInfo.phone}
        storeAddress={storeInfo.address}
        exchangeRate={storeInfo.exchangeRate}
        lang={lang}
        close={() => setPrintOrderData(null)}
      />
    )}
    {stockAdjustProduct && (
      <StockAdjustModal
        productId={stockAdjustProduct.id}
        productName={stockAdjustProduct.name}
        currentStock={stockAdjustProduct.stock}
        variants={stockAdjustProduct.variants}
        lang={lang}
        close={() => setStockAdjustProduct(null)}
        onSuccess={async () => {
          const res = await fetch(`/api/products/${stockAdjustProduct.id}`);
          const data = await res.json();
          if (res.ok && data.product) {
            setProducts((old) => old.map((p) => p.id === data.product.id ? { ...p, stock: data.product.stock, variants: data.product.variants } : p));
          }
        }}
      />
    )}
    {customerAddressModalData && (
      <CustomerAddressModal
        customerId={customerAddressModalData.customerId}
        customerName={customerAddressModalData.customerName}
        customerPhone={customerAddressModalData.customerPhone}
        address={customerAddressModalData.address}
        lang={lang}
        close={() => setCustomerAddressModalData(null)}
        onSaved={() => {
          setCustomerAddressModalData(null);
        }}
      />
    )}
    {dailyPrepOpen && (
      <DailyPreparationModal
        close={() => setDailyPrepOpen(false)}
        storeName={storeInfo.name}
        storePhone={storeInfo.phone}
        storeAddress={storeInfo.address}
        exchangeRate={storeInfo.exchangeRate}
        currency={props.user.currency}
        onOpenOrderDrawer={(orderId) => setSelectedOrderDrawerId(orderId)}
      />
    )}
  </div>;
}

function Overview({ summary, orders, report, reportError, suggestions, openSection, code }: Pick<Props, "summary" | "suggestions"> & {
  orders: Order[]; report: ReportData | null; reportError: string; openSection: (section: Section) => void; code: string;
}) {
  const dailySales = report?.timeSeries ?? [];
  const todayStr = getCambodiaDateString(new Date());
  const todayOrders = orders.filter((o) => {
    const d = getCambodiaDateString(new Date(o.createdAt));
    return d === todayStr;
  });
  const todaySalesFromOrders = todayOrders
    .filter((o) => o.status !== "CANCELLED")
    .reduce((sum, o) => sum + o.total, 0);
  const todaySeries = dailySales.find((s) => s.date === todayStr) ?? dailySales[dailySales.length - 1];
  const todaySalesAmount = todaySalesFromOrders || (todaySeries ? todaySeries.sales : 0);
  const statuses = report?.statuses ?? {};
  const distribution = [
    { name: "បានបញ្ជាក់", value: (statuses.CONFIRMED ?? 0) + (statuses.PROCESSING ?? 0), color: "#3164ce" },
    { name: "រង់ចាំ", value: (statuses.DRAFT ?? 0) + (statuses.PENDING_CONFIRMATION ?? 0), color: "#66758c" },
    { name: "បានដឹកជញ្ជូន", value: (statuses.SHIPPED ?? 0) + (statuses.DELIVERED ?? 0), color: "#18a787" },
    { name: "បានបោះបង់", value: statuses.CANCELLED ?? 0, color: "#ed5965" },
  ].filter((item) => item.value > 0);
  const pendingSuggestions = suggestions.filter((suggestion) => suggestion.status === "PENDING").slice(0, 3);
  return <>
    <PageHeading title="សួស្តី" description="មើលស្ថានភាពហាងលក់តាមបណ្ដាញសង្គមរបស់អ្នកនៅថ្ងៃនេះ។" action={<button className="button primary" onClick={() => openSection("Order Detection")}><Sparkles size={14} /> ពិនិត្យសំណើ {summary.awaitingReview > 0 && <span className="action-count">{khmerNumber(summary.awaitingReview)}</span>}</button>} />
    <div className="metrics">
      <Metric title="ចំណូលពីការលក់" value={currency(summary.totalSales, code)} note={`≈ ${formatKHR(usdToKhr(summary.totalSales))} · បញ្ជាក់ & បំពេញរួច`} icon={Wallet} />
      <Metric title="ការបញ្ជាទិញទាំងអស់" value={khmerNumber(summary.totalOrders)} note={`បានបង្កើត ${khmerNumber(summary.ordersToday)} នៅថ្ងៃនេះ`} icon={ShoppingCart} />
      <Metric title="រង់ចាំការបញ្ជាក់" value={khmerNumber(summary.pendingOrders)} note="ត្រូវការការសម្រេចពីអតិថិជន ឬអ្នកលក់" icon={Clock3} />
      <Metric title="សំណើ AI" value={khmerNumber(summary.awaitingReview)} note="រង់ចាំអ្នកពិនិត្យ" icon={Sparkles} />
    </div>
    {reportError && <div className="error-banner" role="alert">{reportError}</div>}
    <div className="grid-2 dashboard-charts">
      <Panel
        title="Today Sale"
        description={`ចំណូលថ្ងៃនេះ: ${currency(todaySalesAmount, code)} · ${khmerNumber(summary.ordersToday)} ការបញ្ជាទិញ`}
        action={<span style={{ background: "#ecfdf5", color: "#059669", fontWeight: 700, fontSize: "11px", padding: "3px 8px", borderRadius: "6px", border: "1px solid #a7f3d0" }}>{currency(todaySalesAmount, code)}</span>}
      >
        {dailySales.length ? <div className="dashboard-sales-chart"><ResponsiveContainer width="100%" height="100%"><AreaChart data={dailySales} margin={{ left: -12, right: 8, top: 12, bottom: 0 }}>
          <defs><linearGradient id="overviewSalesFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#3164ce" stopOpacity={0.2} /><stop offset="95%" stopColor="#3164ce" stopOpacity={0.01} /></linearGradient></defs>
          <CartesianGrid vertical={false} stroke="#edf1f7" strokeDasharray="3 4" />
          <XAxis dataKey="date" tickFormatter={(value: string) => value.slice(5)} axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: "#8792a4" }} minTickGap={22} />
          <YAxis tickFormatter={(value: number) => new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(value)} axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: "#8792a4" }} width={45} />
          <Tooltip formatter={(value) => currency(Number(value), code)} labelFormatter={(label) => String(label)} />
          <Area type="monotone" dataKey="sales" name="ការលក់" stroke="#3164ce" strokeWidth={2.5} fill="url(#overviewSalesFill)" activeDot={{ r: 5 }} />
        </AreaChart></ResponsiveContainer></div> : <div className="dashboard-chart-empty">ទិន្នន័យការលក់នឹងបង្ហាញនៅពេលមានប្រតិបត្តិការក្នុងរយៈពេលនេះ។</div>}
      </Panel>
      <Panel title="ចំណែកតាមស្ថានភាព" description="ចំនួនការបញ្ជាទិញក្នុង ៧ ថ្ងៃចុងក្រោយ">
        {distribution.length ? <div className="dashboard-distribution">
          <div className="dashboard-donut"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={distribution} dataKey="value" nameKey="name" innerRadius="68%" outerRadius="94%" paddingAngle={3} stroke="none">{distribution.map((item) => <Cell key={item.name} fill={item.color} />)}</Pie><Tooltip formatter={(value) => khmerNumber(Number(value))} /></PieChart></ResponsiveContainer><span className="dashboard-donut-center"><strong>{khmerNumber(distribution.reduce((total, item) => total + item.value, 0))}</strong><small>ការបញ្ជាទិញ</small></span></div>
          <div className="dashboard-distribution-legend">{distribution.map((item) => <div key={item.name}><span><i style={{ background: item.color }} />{item.name}</span><strong>{khmerNumber(item.value)}</strong></div>)}</div>
        </div> : <div className="dashboard-chart-empty">មិនទាន់មានការបញ្ជាទិញក្នុងចន្លោះពេលនេះទេ។</div>}
      </Panel>
    </div>
    <div className="grid-2 equal dashboard-activity">
      <Panel title="ការបញ្ជាទិញថ្មីៗ" description="ប្រតិបត្តិការថ្មីៗពីហាងរបស់អ្នក" action={<button className="text-action" onClick={() => openSection("Orders")}>មើលទាំងអស់ <ArrowUpRight size={13} /></button>}>
        <OrderTable orders={orders.slice(0, 5)} code={code} />
      </Panel>
      <Panel title="AI Order Detection" description="សំណើថ្មីៗដែលត្រូវការការពិនិត្យពីអ្នក" action={<button className="text-action" onClick={() => openSection("Order Detection")}>បើក AI Review <ArrowUpRight size={13} /></button>}>
        {pendingSuggestions.length ? <div className="overview-ai-list">{pendingSuggestions.map((suggestion) => {
          const customerMsg = suggestion.messages.find((m) => m.sender !== "អ្នកលក់" && !m.body.startsWith("ជម្រាបសួរ")) || suggestion.messages[0];
          const rawBody = customerMsg?.body?.trim();
          const cleanBody = rawBody
            ? rawBody.replace(/🖼️\s*រូបភាព[៖:]\s*data:image\/[a-zA-Z0-9+/=;,-]+/gi, "").replace(/data:image\/[a-zA-Z0-9+/=;,-]+/gi, "").trim()
            : "";
          const isCorrupted = !cleanBody || /^[\?\s\uFFFD\u0000-\u001F]+$/.test(cleanBody);
          const snippet = !isCorrupted
            ? cleanBody
            : suggestion.items && suggestion.items.length > 0
            ? `📦 ${suggestion.items.map((i) => `${i.productName}${i.variantName ? ` (${i.variantName})` : ""} x ${i.quantity}`).join(", ")}`
            : suggestion.explanation && !/^[\?\s\uFFFD\u0000-\u001F]+$/.test(suggestion.explanation)
            ? suggestion.explanation
            : intentNames[suggestion.intent] ?? "សំណើបញ្ជាទិញពីអតិថិជន";
          return <article className="overview-ai-item" key={suggestion.id}>
            <div className="overview-ai-top"><MediaBadge channel={suggestion.channel} /><strong>{suggestion.customer}</strong><span className={`confidence ${suggestion.confidence >= 75 ? "high" : "low"}`}>{khmerNumber(suggestion.confidence)}% ត្រូវគ្នា</span></div>
            <p style={{ wordBreak: "break-word", overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical" }}>{snippet}</p>
            <div className="overview-ai-bottom"><Badge value={intentNames[suggestion.intent] ?? suggestion.intent} className="blue" /><button className="button" onClick={() => openSection("Order Detection")}>ពិនិត្យ <ArrowUpRight size={13} /></button></div>
          </article>;
        })}</div> : <div className="dashboard-chart-empty">{summary.awaitingReview > 0 ? "មានសំណើរង់ចាំពិនិត្យ។ បើក AI Review ដើម្បីមើលទាំងអស់។" : "មិនមានសំណើថ្មីដែលត្រូវពិនិត្យទេ។"}</div>}
      </Panel>
    </div>
    <div className="grid-2">
      <Panel title="កិច្ចការត្រូវធ្វើ" description="ចំណុចដែលអាចត្រូវការការយកចិត្តទុកដាក់របស់អ្នក">
        <div className="queue-list">
          <button className="queue-item" onClick={() => openSection("Orders")}><span className="queue-icon amber-bg"><Clock3 size={16} /></span><span><strong>{khmerNumber(summary.pendingOrders)} ការបញ្ជាទិញ</strong><small>កំពុងរង់ចាំការបញ្ជាក់</small></span><ArrowUpRight size={14} /></button>
          <button className="queue-item" onClick={() => openSection("Order Detection")}><span className="queue-icon violet-bg"><Sparkles size={16} /></span><span><strong>{khmerNumber(summary.awaitingReview)} សំណើ</strong><small>ពិនិត្យចំណាប់អារម្មណ៍ដែល AI រកឃើញ។ មិនមានការបញ្ជាក់ស្វ័យប្រវត្តិទេ</small></span><ArrowUpRight size={14} /></button>
          <button className="queue-item" onClick={() => openSection("Customers")}><span className="queue-icon blue-bg"><Users size={16} /></span><span><strong>{khmerNumber(summary.customersCount)} ប្រវត្តិរូបអតិថិជន</strong><small>មើលប្រវត្តិទំនាក់ទំនង និងការទិញ</small></span><ArrowUpRight size={14} /></button>
          {summary.lowStockCount > 0 && <button className="queue-item" onClick={() => openSection("Products")}><span className="queue-icon amber-bg"><Package size={16} /></span><span><strong>{khmerNumber(summary.lowStockCount)} មុខទំនិញស្តុកទាប</strong><small>ស្តុកនៅសល់ ៥ ឬតិចជាងនេះ</small></span><ArrowUpRight size={14} /></button>}
        </div>
      </Panel>
    </div>
    <div className="grid-2 equal">
      <Panel title="បញ្ជីផលិតផលរបស់អ្នក" description={`ផលិតផលសកម្ម ${khmerNumber(summary.activeProducts)} មុខ`} action={<button className="text-action" onClick={() => openSection("Products")}>គ្រប់គ្រងផលិតផល <ArrowUpRight size={13} /></button>}>
        <p className="panel-copy">ធ្វើបច្ចុប្បន្នភាពឈ្មោះ តម្លៃ និងជម្រើសផលិតផល ដើម្បីផ្ទៀងផ្ទាត់ការបញ្ជាទិញ និងសំណើ AI ជាមួយបញ្ជីផលិតផលបានត្រឹមត្រូវ។</p>
      </Panel>
      <Panel title="ទំនាក់ទំនងអតិថិជន" description="ទិដ្ឋភាពគ្រប់គ្រងអតិថិជន ដើម្បីបង្កើនការទិញម្ដងទៀត" action={<button className="text-action" onClick={() => openSection("Customers")}>មើលអតិថិជន <ArrowUpRight size={13} /></button>}>
        <p className="panel-copy">ពិនិត្យចំណាយសរុប ប្រវត្តិការទិញ ការសន្ទនា និងកំណត់ចំណាំឯកជនសម្រាប់តាមដានរបស់អតិថិជនម្នាក់ៗនៅកន្លែងតែមួយ។</p>
      </Panel>
    </div>
  </>;
}

function PageHeading({ title, description, action }: { title: string; description: string; action?: React.ReactNode }) {
  return <div className="page-heading"><div><h1>{title}</h1><p>{description}</p></div>{action && <div className="heading-actions">{action}</div>}</div>;
}

function OrderTable({ orders, code }: { orders: Order[]; code: string }) {
  if (orders.length === 0) return <div className="empty-state"><strong>មិនទាន់មានការបញ្ជាទិញ</strong>ការបញ្ជាទិញថ្មីនឹងបង្ហាញនៅទីនេះ បន្ទាប់ពីបង្កើត។</div>;
  return <div className="table-wrap"><table><thead><tr><th>លេខបញ្ជាទិញ</th><th>អតិថិជន</th><th>បណ្ដាញ</th><th>សរុប</th><th>ស្ថានភាព</th></tr></thead>
    <tbody>{orders.map((order) => <tr key={order.id}><td><strong className="latin-data">{order.orderNumber}</strong><small className="table-sub" suppressHydrationWarning>{dateLabel(order.createdAt)}</small></td><td><span className="latin-data">{order.customer}</span></td><td><MediaBadge channel={order.channel} /></td><td><strong className="latin-data">{currency(order.total, code)}</strong></td><td><Badge value={statusLabels[order.status] ?? order.status} className={statusClass[order.status]} /></td></tr>)}</tbody></table></div>;
}

function CustomersView({
  customers,
  selected,
  onSelect,
  query,
  setQuery,
  searchError,
  filter,
  setFilter,
  sort,
  setSort,
  total,
  code,
  add,
  addNote,
  editCustomer,
  deleteCustomer,
  updateNote,
  deleteNote,
  onAddAddress,
}: {
  customers: Customer[];
  selected: Customer | null;
  onSelect: (id: string) => void;
  query: string;
  setQuery: (value: string) => void;
  searchError: string;
  filter: string;
  setFilter: (value: string) => void;
  sort: string;
  setSort: (value: string) => void;
  total: number;
  code: string;
  add: () => void;
  addNote: (id: string, body: string) => Promise<void>;
  editCustomer: (customer: Customer) => void;
  deleteCustomer: (customer: Customer) => Promise<void>;
  updateNote: (customerId: string, noteId: string, body: string) => Promise<void>;
  deleteNote: (customerId: string, noteId: string) => Promise<void>;
  onAddAddress: (customer: Customer) => void;
}) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  useEffect(() => {
    setPage(1);
  }, [query, filter, sort]);

  const repeatCount = customers.filter((customer) => customer.orderCount >= 2).length;
  const vipCount = customers.filter(
    (customer) => customer.totalSpent >= 500 || customer.orderCount >= 5
  ).length;
  const localSpend = customers.reduce((sum, customer) => sum + customer.totalSpent, 0);

  const totalPages = Math.max(1, Math.ceil(customers.length / pageSize));
  const paginatedCustomers = customers.slice((page - 1) * pageSize, page * pageSize);

  return (
    <>
      <PageHeading
        title="អតិថិជន"
        description="ស្គាល់ប្រវត្តិការទិញ បណ្ដាញទំនាក់ទំនង និងជំហានបន្ទាប់សម្រាប់តាមដានអតិថិជនម្នាក់ៗ។"
        action={
          <button className="button primary" onClick={add}>
            <Plus size={14} /> បន្ថែមអតិថិជន
          </button>
        }
      />
      <div className="customer-summary" style={{ gridTemplateColumns: "repeat(4, 1fr)" }}>
        <div className="summary-tile">
          <span>ប្រវត្តិរូបអតិថិជន</span>
          <strong>{khmerNumber(total)}</strong>
        </div>
        <div className="summary-tile">
          <span>អតិថិជនទិញម្ដងទៀត</span>
          <strong>{khmerNumber(repeatCount)}</strong>
        </div>
        <div className="summary-tile">
          <span>អតិថិជន VIP</span>
          <strong>{khmerNumber(vipCount)}</strong>
        </div>
        <div className="summary-tile">
          <span>ចំណាយសរុបក្នុងបញ្ជី</span>
          <strong>{formatUSD(localSpend)}</strong>
          <small style={{ color: "#94a3b8", fontSize: 10 }}>{formatKHR(usdToKhr(localSpend))}</small>
        </div>
      </div>

      <div className="section-toolbar">
        <div className="segment-bar">
          {["អតិថិជនទាំងអស់", "អតិថិជនទិញម្ដងទៀត", "ការបញ្ជាទិញដំបូង", "មិនទាន់មានការបញ្ជាទិញ"].map((option) => (
            <button
              key={option}
              className={`segment-button ${filter === option ? "selected" : ""}`}
              onClick={() => setFilter(option)}
            >
              {option}
            </button>
          ))}
        </div>
        <div className="toolbar">
          <label className="input-wrap">
            <Search size={14} />
            <input
              placeholder="ស្វែងរកឈ្មោះ លេខទូរស័ព្ទ អ៊ីមែល ឬ @telegram"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
          <select
            className="select"
            aria-label="តម្រៀបអតិថិជន"
            value={sort}
            onChange={(event) => setSort(event.target.value)}
          >
            <option value="recent">សកម្មភាពថ្មីៗ</option>
            <option value="spend">ចំណាយច្រើនជាងគេ</option>
            <option value="orders">ការបញ្ជាទិញច្រើនជាងគេ</option>
          </select>
        </div>
      </div>

      <section className="panel customer-table-panel" style={{ width: "100%" }}>
        <div className="panel-heading">
          <div>
            <h2>បញ្ជីអតិថិជន</h2>
            <p>ចុចលើជួរអតិថិជន ឬប៊ូតុង &quot;មើល&quot; ដើម្បីបើកផ្ទាំងប្រវត្តិរូប និងកំណត់ចំណាំលម្អិត។</p>
          </div>
          <span className="badge">បង្ហាញ {khmerNumber(customers.length)} នាក់</span>
        </div>
        {searchError && <div className="inline-error" role="alert">{searchError}</div>}
        {customers.length === 0 ? (
          <div className="empty-state">
            <strong>រកមិនឃើញអតិថិជនទេ</strong>
            សាកល្បងស្វែងរក ឬជ្រើសក្រុមផ្សេង។
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>អតិថិជន</th>
                  <th>កម្រិត</th>
                  <th>ការបញ្ជាទិញ</th>
                  <th>ចំណាយសរុប</th>
                  <th>ការបញ្ជាទិញចុងក្រោយ</th>
                  <th>បណ្ដាញ</th>
                  <th className="actions-header">សកម្មភាព</th>
                </tr>
              </thead>
              <tbody>
                {paginatedCustomers.map((customer) => {
                  const tier = calculateCustomerTier(customer.orderCount, customer.totalSpent);
                  return (
                    <tr
                      key={customer.id}
                      className={`clickable-row ${selected?.id === customer.id ? "row-selected" : ""}`}
                      onClick={() => onSelect(customer.id)}
                    >
                      <td>
                        <div className="customer-cell">
                          <span className="avatar small">{initials(customer.name)}</span>
                          <span>
                            <strong className="latin-data">{customer.name}</strong>
                            <small className="latin-data">
                              {formatCambodiaPhone(customer.phone) || customer.phone || customer.email || "មិនមានព័ត៌មានទំនាក់ទំនង"}
                              {customer.telegramUsername && (
                                <span style={{ color: "#24A1DE", marginLeft: "4px" }}>
                                  · @{customer.telegramUsername.replace("@", "")}
                                </span>
                              )}
                            </small>
                          </span>
                        </div>
                      </td>
                      <td>
                        <span
                          className={`badge ${tier.badgeClass}`}
                          style={{ fontSize: "0.75rem", padding: "2px 6px" }}
                        >
                          {tier.labelKh}
                        </span>
                      </td>
                      <td>
                        <strong>{khmerNumber(customer.orderCount)}</strong>
                        {customer.orderCount >= 2 && <small className="table-sub">ទិញម្ដងទៀត</small>}
                      </td>
                      <td>
                        <strong>{formatUSD(customer.totalSpent)}</strong>
                        <small className="table-sub">{formatKHR(usdToKhr(customer.totalSpent))}</small>
                      </td>
                      <td suppressHydrationWarning>{dateLabel(customer.lastOrderAt)}</td>
                      <td>
                        <MediaBadge channel={customer.channel} />
                      </td>
                      <td className="actions-cell" onClick={(e) => e.stopPropagation()}>
                        <div className="table-actions-group">
                          <button
                            type="button"
                            className="action-icon-btn primary-action"
                            title="មើលប្រវត្តិរូបពេញលេញ"
                            onClick={() => onSelect(customer.id)}
                            aria-label="View customer details"
                          >
                            <Eye size={13} />
                          </button>
                          <button
                            type="button"
                            className="action-icon-btn edit-action"
                            title="កែប្រែព័ត៌មានអតិថិជន"
                            onClick={() => editCustomer(customer)}
                            aria-label="Edit customer"
                          >
                            <Edit2 size={13} />
                          </button>
                          <button
                            type="button"
                            className="action-icon-btn info-action"
                            title="គ្រប់គ្រងអាសយដ្ឋានដឹកជញ្ជូន"
                            onClick={() => onAddAddress(customer)}
                            aria-label="Manage addresses"
                          >
                            <MapPin size={13} />
                          </button>
                          <button
                            type="button"
                            className="action-icon-btn delete-action"
                            title="លុបអតិថិជន"
                            onClick={() => void deleteCustomer(customer)}
                            aria-label="Delete customer"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <DataTablePagination
          currentPage={page}
          totalPages={totalPages}
          totalItems={customers.length}
          pageSize={pageSize}
          onPageChange={(p) => setPage(p)}
          onPageSizeChange={(newSize) => {
            setPageSize(newSize);
            setPage(1);
          }}
          itemName="អតិថិជន"
        />
      </section>

      {selected && (
        <CustomerDetailsDrawer
          customer={selected}
          code={code}
          close={() => onSelect("")}
          onEdit={editCustomer}
          onDelete={deleteCustomer}
          onAddAddress={onAddAddress}
          addNote={addNote}
          updateNote={updateNote}
          deleteNote={deleteNote}
        />
      )}
    </>
  );
}

function ReportsView({
  data,
  error,
  range,
  setRange,
  from,
  to,
  setFrom,
  setTo,
  code,
  store,
  storePhone,
  storeAddress,
  exchangeRate,
  onOpenDailyPrep,
}: {
  data: ReportData | null;
  error: string;
  range: number;
  setRange: (range: number) => void;
  from: string;
  to: string;
  setFrom: (date: string) => void;
  setTo: (date: string) => void;
  code: string;
  store: string;
  storePhone?: string;
  storeAddress?: string;
  exchangeRate?: number;
  onOpenDailyPrep?: () => void;
}) {
  const notify = useToast();
  function exportCsv() {
    if (!data) return;
    const rows = [["កាលបរិច្ឆេទ", "ការលក់", "ការបញ្ជាទិញ"], ...data.timeSeries.map((row) => [row.date, row.sales.toFixed(2), String(row.orders)])];
    rows.push([], ["បណ្ដាញ", "ការលក់", "ការបញ្ជាទិញ"], ...data.channels.map((row) => [channelNames[row.channel] ?? row.channel, row.sales.toFixed(2), String(row.orders)]));
    rows.push([], ["ផលិតផលលក់ដាច់", "ចំនួន", "ការលក់"], ...data.bestSellers.map((row) => [row.name, String(row.units), row.sales.toFixed(2)]));
    rows.push([], ["ស្ថានភាពការបញ្ជាទិញ", "ចំនួន"], ...Object.entries(data.statuses).map(([status, count]) => [statusLabels[status] ?? status, String(count)]));
    rows.push([], ["ស្ថានភាពសំណើ AI", "ចំនួន"], ...Object.entries(data.suggestions).map(([status, count]) => [suggestionStatusNames[status] ?? status, String(count)]));
    const content = rows.map((row) => row.map(csvField).join(",")).join("\r\n");
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([content], { type: "text/csv;charset=utf-8" }));
    link.download = `របាយការណ៍ហាង-${khmerDigits(data.range.from)}-ដល់-${khmerDigits(data.range.to)}.csv`;
    link.click(); window.setTimeout(() => URL.revokeObjectURL(link.href), 0);
    notify({ kind: "success", title: "បានទាញយក CSV", description: `របាយការណ៍ ${data.range.from} — ${data.range.to}` });
  }
  async function exportXlsx() {
    if (!data) return;
    try {
      await exportReportXlsx(data, store, code);
      notify({ kind: "success", title: "បានទាញយក Excel", description: "ឯកសាររួមមានសេចក្ដីសង្ខេប និងទិន្នន័យជាសន្លឹកដាច់ដោយឡែក។" });
    } catch (cause) {
      notify({ kind: "error", title: "មិនអាចបង្កើតឯកសារ Excel បានទេ", description: cause instanceof Error ? cause.message : "សូមសាកល្បងម្ដងទៀត។" });
    }
  }
  function exportPdf() {
    if (!data) return;
    try {
      openReportPrintView(data, store, code, {
        phone: storePhone,
        address: storeAddress,
        exchangeRate: exchangeRate,
      });
      notify({ kind: "info", title: "របាយការណ៍ PDF ត្រៀមរួចហើយ", description: "ក្នុងបង្អួចបោះពុម្ព សូមជ្រើស «Save as PDF» ដើម្បីរក្សាទុក។" });
    } catch (cause) {
      notify({ kind: "error", title: "មិនអាចបើករបាយការណ៍ PDF បានទេ", description: cause instanceof Error ? cause.message : "សូមអនុញ្ញាត pop-up ហើយសាកល្បងម្ដងទៀត។" });
    }
  }
  const maxSales = Math.max(...(data?.bestSellers.map((p) => p.sales) ?? [0]), 1);
  const totalSuggestions = data ? Object.values(data.suggestions).reduce((sum, count) => sum + count, 0) : 0;
  const reviewed = data ? (data.suggestions.APPROVED ?? 0) + (data.suggestions.NOT_AN_ORDER ?? 0) + (data.suggestions.DISMISSED ?? 0) + (data.suggestions.DUPLICATE ?? 0) : 0;
  return <>
    <PageHeading
      title="របាយការណ៍"
      description="សម្រេចចិត្តដោយផ្អែកលើប្រវត្តិការបញ្ជាទិញពិតរបស់ហាង និងនិយមន័យចំណូល ព្រមទាំងចន្លោះកាលបរិច្ឆេទច្បាស់លាស់។"
      action={
        <div className="export-actions">
          {onOpenDailyPrep && (
            <button
              className="button"
              onClick={onOpenDailyPrep}
              title="សន្លឹកត្រៀមទំនិញ និងបញ្ជីផ្ទៀងផ្ទាត់ដឹកជញ្ជូនប្រចាំថ្ងៃ"
              style={{ background: "#eef2ff", color: "#3164ce", borderColor: "#c7d2fe" }}
            >
              <Package size={14} /> ត្រៀមទំនិញថ្ងៃនេះ
            </button>
          )}
          <button className="button" onClick={exportCsv} disabled={!data}><Download size={14} /> CSV</button>
          <button className="button" onClick={() => void exportXlsx()} disabled={!data}><FileSpreadsheet size={14} /> Excel</button>
          <button className="button primary" onClick={exportPdf} disabled={!data}><Printer size={14} /> PDF / បោះពុម្ព</button>
        </div>
      }
    />
    <div className="report-toolbar">
      <div className="range-picker">{[[7, "៧ ថ្ងៃ"], [30, "៣០ ថ្ងៃ"], [90, "៩០ ថ្ងៃ"]].map(([days, label]) => <button key={days} className={`segment-button ${range === days && !from && !to ? "selected" : ""}`} onClick={() => setRange(Number(days))}>{label}</button>)}</div>
      <div className="filter-row"><label className="date-control">ចាប់ពី <input type="date" aria-label="កាលបរិច្ឆេទចាប់ផ្ដើមរបាយការណ៍" value={from} max={to || undefined} onChange={(event) => setFrom(event.target.value)} /></label><label className="date-control">ដល់ <input type="date" aria-label="កាលបរិច្ឆេទបញ្ចប់របាយការណ៍" value={to} min={from || undefined} onChange={(event) => setTo(event.target.value)} /></label></div>
      {data && <span className="range-caption"><CalendarDays size={13} /> {dateLabel(data.range.from)} — {dateLabel(data.range.to)} · ម៉ោងក្នុងតំបន់ហាង</span>}
    </div>
    {error && <div className="error-banner" role="alert">{error}</div>}
    <div className="metrics">
      <Metric title="ចំណូលសុទ្ធពីការបញ្ជាទិញ" value={currency(data?.summary.sales ?? 0, code)} note="រាប់ចាប់ពីបានបញ្ជាក់ដល់បានប្រគល់ · មិនរាប់សេចក្ដីព្រាង រង់ចាំ ឬបានបោះបង់" icon={Wallet} />
      <Metric title="ការបញ្ជាទិញដែលរាប់បញ្ចូល" value={khmerNumber(data?.summary.orders ?? 0)} note="ក្នុងចន្លោះពេលដែលបានជ្រើសរើស" icon={ShoppingCart} />
      <Metric title="តម្លៃមធ្យមក្នុងមួយការបញ្ជាទិញ" value={currency(data?.summary.averageOrderValue ?? 0, code)} note="ចំណូលចែកនឹងចំនួនការបញ្ជាទិញ" icon={TrendingUp} />
      <Metric title="សំណើដែលបានពិនិត្យ" value={totalSuggestions ? `${khmerNumber(Math.round(reviewed / totalSuggestions * 100))}%` : "—"} note={totalSuggestions ? `បានពិនិត្យ ${khmerNumber(reviewed)} ក្នុងចំណោម ${khmerNumber(totalSuggestions)} សំណើ` : "មិនមានសំណើក្នុងចន្លោះពេលនេះទេ"} icon={Sparkles} />
    </div>
    <div className="report-charts">
      <Panel title="ការលក់តាមពេលវេលា" description="ចំនួនទឹកប្រាក់ការបញ្ជាទិញតាមថ្ងៃ ដោយប្រើម៉ោងក្នុងតំបន់ហាងរបស់អ្នក">
        {data?.summary.orders ? <div className="chart-area"><ResponsiveContainer width="100%" height="100%"><AreaChart data={data.timeSeries} margin={{ left: -12, right: 6, top: 8, bottom: 0 }}>
          <defs><linearGradient id="salesFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#356ad2" stopOpacity={0.18} /><stop offset="95%" stopColor="#356ad2" stopOpacity={0} /></linearGradient></defs>
          <CartesianGrid vertical={false} stroke="#edf0f4" /><XAxis dataKey="date" tickFormatter={(value: string) => value.slice(5)} axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: "#8b96a8" }} minTickGap={24} /><YAxis tickFormatter={(value: number) => currency(value, code)} axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: "#8b96a8" }} width={65} />
          <Tooltip formatter={(value) => currency(Number(value), code)} labelFormatter={(label) => String(label)} /><Area type="monotone" dataKey="sales" name="ការលក់" stroke="#356ad2" strokeWidth={2} fill="url(#salesFill)" />
        </AreaChart></ResponsiveContainer></div> : <div className="empty-state"><strong>មិនមានការលក់ដែលបានបញ្ចប់ក្នុងចន្លោះពេលនេះទេ</strong>រាប់តែការបញ្ជាទិញដែលបានបញ្ជាក់ កំពុងរៀបចំ បានដឹកជញ្ជូន ឬបានប្រគល់ប៉ុណ្ណោះ។</div>}
      </Panel>
      <Panel title="ការលក់តាមបណ្ដាញ" description="សមាមាត្រការលក់នៃការបញ្ជាទិញដែលបានរាប់បញ្ចូល">
        {data?.channels.length ? <div className="channel-chart"><div className="donut"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={data.channels} dataKey="sales" nameKey="channel" innerRadius="68%" outerRadius="94%" paddingAngle={3} stroke="none">{data.channels.map((item, i) => <Cell key={item.channel} fill={chartColors[i % chartColors.length]} />)}</Pie><Tooltip formatter={(value) => currency(Number(value), code)} /></PieChart></ResponsiveContainer><div className="donut-center"><strong>{currency(data.summary.sales, code)}</strong><small>ចំណូលសរុប</small></div></div>
          <div className="channel-legend">{data.channels.map((item, i) => <div key={item.channel}><span><i style={{ background: chartColors[i % chartColors.length] }} />{channelNames[item.channel] ?? item.channel}</span><strong>{currency(item.sales, code)}</strong><small>ការបញ្ជាទិញ {khmerNumber(item.orders)} · {data.summary.sales ? khmerNumber(Math.round(item.sales / data.summary.sales * 100)) : "០"}%</small></div>)}</div></div> : <div className="empty-state"><strong>មិនមានទិន្នន័យការលក់តាមបណ្ដាញសម្រាប់បង្ហាញទេ</strong>សមាមាត្របណ្ដាញនឹងបង្ហាញនៅពេលមានការបញ្ជាទិញដែលបានរាប់បញ្ចូល។</div>}
      </Panel>
    </div>
    <div className="grid-2 equal">
      <Panel title="ផលិតផលលក់ដាច់ជាងគេ" description="តម្រៀបតាមចំនួនក្នុងការបញ្ជាទិញដែលបានរាប់បញ្ចូល">
        {data?.bestSellers.length ? <div className="list-ranking">{data.bestSellers.map((product, index) => <div className="ranking-row" key={product.name}><span className="rank">{khmerNumber(index + 1)}</span><div><div className="ranking-name latin-data">{product.name}</div><div className="ranking-track"><i style={{ width: `${Math.min(100, Math.max(4, Math.round((product.sales / maxSales) * 100)))}%` }} /></div></div><div className="ranking-value latin-data">{khmerNumber(product.units)} ឯកតា <small>{currency(product.sales, code)}</small></div></div>)}</div> : <div className="empty-state"><strong>មិនមានការលក់ផលិតផលក្នុងចន្លោះពេលនេះទេ</strong>មុខទំនិញពីការបញ្ជាទិញដែលបានបញ្ចប់នឹងបង្ហាញនៅទីនេះ។</div>}
      </Panel>
      <Panel title="លទ្ធផលការបញ្ជាទិញ" description="ស្ថានភាពការបញ្ជាទិញទាំងអស់ក្នុងចន្លោះពេលដែលបានជ្រើសរើស">
        <div className="outcome-list">{Object.entries(statusLabels).map(([key, label]) => {
          const count = data?.statuses[key] ?? 0;
            return <div className="outcome-row" key={key}><span><i className={`outcome-dot ${statusClass[key] || "neutral"}`} />{label}</span><strong>{khmerNumber(count)}</strong></div>;
        })}</div>
        <div className="report-definition"><CheckCircle2 size={14} /><span>ចំណូលរាប់ការបញ្ជាទិញចាប់ពីបានបញ្ជាក់រហូតដល់បានប្រគល់។ មិនរាប់ការបញ្ជាទិញដែលបានបោះបង់ និងសេចក្ដីព្រាងដែលមិនទាន់បញ្ជាក់ទេ។ ការសងប្រាក់មិនទាន់ត្រូវបានគ្រប់គ្រងទេ។</span></div>
      </Panel>
    </div>
  </>;
}

function OrdersView({ orders, search, setSearch, code, create, createPos, edit, remove, refresh, onOpenDrawer, onPrintOrder, onOpenDailyPrep, onNavigateToDetection, pendingSuggestionsCount = 0 }: {
  orders: Order[]; search: string; setSearch: (value: string) => void; code: string; create: () => void; createPos?: () => void; edit: (id: string) => Promise<void>; remove: (order: Order) => Promise<void>; refresh: (callback: (orders: Order[]) => Order[]) => void;
  onOpenDrawer: (id: string) => void; onPrintOrder: (order: Order) => Promise<void>; onOpenDailyPrep?: () => void; onNavigateToDetection?: () => void; pendingSuggestionsCount?: number;
}) {
  const notify = useToast();
  const [busyId, setBusyId] = useState("");
  const [bulkBusy, setBulkBusy] = useState(false);
  const [error, setError] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [total, setTotal] = useState(0);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkStatus, setBulkStatus] = useState("");
  const [reloadVersion, setReloadVersion] = useState(0);
  const [actionError, setActionError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    const query = new URLSearchParams({ search, page: String(page), pageSize: String(pageSize) });
    if (statusFilter === "__AI__") {
      query.set("source", "AI");
    } else if (statusFilter) {
      query.set("status", statusFilter);
    }
    fetch(`/api/orders?${query}`, { signal: controller.signal })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error ?? "មិនអាចផ្ទុកការបញ្ជាទិញបានទេ។");
        const rows = data.orders.map((order: any) => ({
          id: order.id, orderNumber: order.orderNumber, customerId: order.customerId,
          customer: order.customer?.name ?? "—", phone: order.customer?.phone ?? "",
          status: order.status, channel: order.channel, total: Number(order.total),
          itemNames: order.items?.map((item: any) => `${item.productName}${item.variantName ? ` · ${item.variantName}` : ""}`).join(", ") ?? "",
          createdAt: order.createdAt,
          courier: order.courier,
          trackingNumber: order.trackingNumber,
          paymentMethod: order.paymentMethod,
          paymentStatus: order.paymentStatus,
          province: order.province,
          notes: order.notes,
          deliveryAddress: order.deliveryAddress,
          suggestion: order.suggestion ? {
            id: order.suggestion.id,
            confidence: order.suggestion.confidence,
            intent: order.suggestion.intent,
            status: order.suggestion.status,
            createdAt: order.suggestion.createdAt,
          } : null,
        }));
        setTotal(data.pagination.total);
        setSelectedIds([]);
        refresh(() => rows);
      })
      .catch((cause: unknown) => {
        if (cause instanceof DOMException && cause.name === "AbortError") return;
        setError(cause instanceof Error ? cause.message : "មិនអាចផ្ទុកការបញ្ជាទិញបានទេ។");
      });
    return () => controller.abort();
  }, [search, statusFilter, page, pageSize, refresh, reloadVersion]);
  function exportOrders(rows = orders) {
    const lines = [
      ["លេខបញ្ជាទិញ", "អតិថិជន", "លេខទូរស័ព្ទ", "ផលិតផល", "បណ្ដាញ", "ស្ថានភាព", "សេវាដឹកជញ្ជូន", "លេខកូដតាមដាន", "វិធីសាស្ត្រទូទាត់", "ស្ថានភាពទូទាត់", "សរុប", "កាលបរិច្ឆេទបង្កើត"],
      ...rows.map((order) => [
        order.orderNumber,
        order.customer,
        order.phone,
        order.itemNames,
        channelNames[order.channel] ?? order.channel,
        statusLabels[order.status] ?? order.status,
        order.courier ?? "",
        order.trackingNumber ?? "",
        order.paymentMethod ?? "",
        order.paymentStatus ?? "",
        order.total.toFixed(2),
        order.createdAt,
      ]),
    ];
    const csv = lines.map((row) => row.map(csvField).join(",")).join("\r\n");
    const link = document.createElement("a");
    const url = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" }));
    link.href = url;
    link.download = "orders.csv";
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
    notify({ kind: "success", title: "បានទាញយក CSV", description: `${khmerNumber(rows.length)} ការបញ្ជាទិញ` });
  }
  async function exportOrdersExcel(rows = orders) {
    try {
      await exportOrdersXlsx(rows.map((order) => ({
        orderNumber: order.orderNumber, customer: order.customer, phone: order.phone, itemNames: order.itemNames,
        channel: channelNames[order.channel] ?? order.channel, status: statusLabels[order.status] ?? order.status,
        courier: order.courier, trackingNumber: order.trackingNumber,
        paymentMethod: order.paymentMethod, paymentStatus: order.paymentStatus,
        total: order.total, createdAt: order.createdAt,
      })), code);
      notify({ kind: "success", title: "បានទាញយក Excel", description: `${khmerNumber(rows.length)} ការបញ្ជាទិញ` });
    } catch (cause) {
      notify({ kind: "error", title: "មិនអាចបង្កើតឯកសារ Excel បានទេ", description: cause instanceof Error ? cause.message : "សូមសាកល្បងម្ដងទៀត។" });
    }
  }
  async function changeStatus(order: Order, status: string) {
    setBusyId(order.id); setError("");
    try {
      const response = await fetch(`/api/orders/${order.id}/status`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "មិនអាចកែប្រែការបញ្ជាទិញបានទេ។");
      setReloadVersion((version) => version + 1);
      notify({ kind: "success", title: "បានកែប្រែស្ថានភាពការបញ្ជាទិញ", description: `${order.orderNumber} · ${statusLabels[status] ?? status}` });
    } catch (cause) { setError(cause instanceof Error ? cause.message : "មិនអាចកែប្រែការបញ្ជាទិញបានទេ។"); }
    finally { setBusyId(""); }
  }
  async function bulkUpdate() {
    if (!bulkStatus || selectedIds.length === 0) return;
    setBulkBusy(true);
    setError("");
    try {
      const response = await fetch("/api/orders/bulk-status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderIds: selectedIds, status: bulkStatus }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "មិនអាចកែប្រែស្ថានភាពការបញ្ជាទិញបានទេ។");
      setSelectedIds([]);
      setReloadVersion((version) => version + 1);
      notify({ kind: "success", title: "បានកែប្រែការបញ្ជាទិញដែលបានជ្រើស", description: khmerNumber(result.updatedCount ?? selectedIds.length) });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "មិនអាចកែប្រែស្ថានភាពការបញ្ជាទិញបានទេ។");
    } finally {
      setBulkBusy(false);
    }
  }
  async function editOrder(order: Order) {
    setActionError("");
    try { await edit(order.id); }
    catch (cause) { setActionError(cause instanceof Error ? cause.message : "មិនអាចផ្ទុកការបញ្ជាទិញបានទេ។"); }
  }
  async function deleteOrder(order: Order) {
    if (!window.confirm(`លុបការបញ្ជាទិញ ${order.orderNumber}? ប្រវត្តិការបញ្ជាទិញត្រូវបានរក្សាទុកតាមលក្ខខណ្ឌភ្ជាប់។`)) return;
    setActionError("");
    try { await remove(order); }
    catch (cause) { setActionError(cause instanceof Error ? cause.message : "មិនអាចលុបការបញ្ជាទិញបានទេ។"); }
  }

  const pendingConfirmationCount = orders.filter((o) => o.status === "PENDING_CONFIRMATION").length;
  const inProgressCount = orders.filter((o) => ["PROCESSING", "SHIPPED"].includes(o.status)).length;
  const deliveredCount = orders.filter((o) => o.status === "DELIVERED").length;
  const aiOrdersCount = orders.filter((o) => Boolean(o.suggestion)).length;

  return <>
    <PageHeading
      title="ការបញ្ជាទិញ"
      description="តាមដានការបញ្ជាទិញ និងជំហានបន្ទាប់ ដោយមិនចាត់ទុកការសាកសួរថាជាការទិញដែលបានបញ្ជាក់ទេ។"
      action={
        <div className="export-actions">
          {onNavigateToDetection && (
            <button
              type="button"
              className="button"
              onClick={onNavigateToDetection}
              style={{ background: "#f5f3ff", color: "#6d28d9", borderColor: "#ddd6fe", fontWeight: 600 }}
              title="ពិនិត្យសំណើទិញដែល AI បានរកឃើញពីបណ្ដាញសង្គម"
            >
              <Sparkles size={14} color="#7c3aed" />
              ពិនិត្យការរកឃើញ AI {pendingSuggestionsCount > 0 ? `(${khmerNumber(pendingSuggestionsCount)} រង់ចាំ)` : ""} →
            </button>
          )}
          <button className="button" onClick={() => exportOrders()}><Download size={14} /> CSV</button>
          <button className="button" onClick={() => void exportOrdersExcel()}><FileSpreadsheet size={14} /> Excel</button>
          {onOpenDailyPrep && (
            <button
              className="button"
              onClick={onOpenDailyPrep}
              title="សន្លឹកត្រៀមទំនិញ និងបញ្ជីផ្ទៀងផ្ទាត់ដឹកជញ្ជូនប្រចាំថ្ងៃ"
              style={{ background: "#eef2ff", color: "#3164ce", borderColor: "#c7d2fe" }}
            >
              <Package size={14} /> ត្រៀមទំនិញថ្ងៃនេះ
            </button>
          )}
          {createPos && (
            <button
              className="button"
              onClick={createPos}
              style={{ background: "#f0fdf4", color: "#166534", borderColor: "#86efac" }}
              title="លក់ផ្ទាល់នៅហាង កាត់ស្តុកភ្លាមៗ"
            >
              <ShoppingCart size={14} /> លក់ផ្ទាល់ / POS
            </button>
          )}
          <button className="button primary" onClick={create}><Plus size={14} /> បង្កើតការបញ្ជាទិញ</button>
        </div>
      }
    />

    {/* Enterprise Admin Standard: KPI Metric Summary Tiles */}
    <div className="orders-kpi-grid">
      <div className="orders-kpi-card">
        <div className="orders-kpi-icon" style={{ background: "#eff6ff", color: "#2563eb" }}>
          <ShoppingCart size={18} />
        </div>
        <div className="orders-kpi-content">
          <small>ការបញ្ជាទិញសរុប</small>
          <strong>{khmerNumber(total || orders.length)}</strong>
        </div>
      </div>
      <div
        className="orders-kpi-card"
        style={{ cursor: "pointer", background: statusFilter === "PENDING_CONFIRMATION" ? "#fef3c7" : "white" }}
        onClick={() => { setStatusFilter(statusFilter === "PENDING_CONFIRMATION" ? "" : "PENDING_CONFIRMATION"); setPage(1); }}
      >
        <div className="orders-kpi-icon" style={{ background: "#fef3c7", color: "#d97706" }}>
          <Clock3 size={18} />
        </div>
        <div className="orders-kpi-content">
          <small>រង់ចាំបញ្ជាក់</small>
          <strong>{khmerNumber(pendingConfirmationCount)}</strong>
        </div>
      </div>
      <div
        className="orders-kpi-card"
        style={{ cursor: "pointer", background: ["PROCESSING", "SHIPPED"].includes(statusFilter) ? "#e0e7ff" : "white" }}
        onClick={() => { setStatusFilter(statusFilter === "PROCESSING" ? "" : "PROCESSING"); setPage(1); }}
      >
        <div className="orders-kpi-icon" style={{ background: "#e0e7ff", color: "#4f46e5" }}>
          <Package size={18} />
        </div>
        <div className="orders-kpi-content">
          <small>កំពុងរៀបចំ & ដឹក</small>
          <strong>{khmerNumber(inProgressCount)}</strong>
        </div>
      </div>
      <div
        className="orders-kpi-card"
        style={{ cursor: "pointer", background: statusFilter === "DELIVERED" ? "#dcfce7" : "white" }}
        onClick={() => { setStatusFilter(statusFilter === "DELIVERED" ? "" : "DELIVERED"); setPage(1); }}
      >
        <div className="orders-kpi-icon" style={{ background: "#dcfce7", color: "#16a34a" }}>
          <CheckCircle2 size={18} />
        </div>
        <div className="orders-kpi-content">
          <small>បានប្រគល់ជោគជ័យ</small>
          <strong>{khmerNumber(deliveredCount)}</strong>
        </div>
      </div>
      <div
        className="orders-kpi-card"
        style={{
          cursor: "pointer",
          background: statusFilter === "__AI__" ? "#f3e8ff" : "white",
          borderColor: statusFilter === "__AI__" ? "#c084fc" : "#e2e8f0"
        }}
        onClick={() => { setStatusFilter(statusFilter === "__AI__" ? "" : "__AI__"); setPage(1); }}
      >
        <div className="orders-kpi-icon" style={{ background: "#f5f3ff", color: "#7c3aed" }}>
          <Sparkles size={18} />
        </div>
        <div className="orders-kpi-content">
          <small>មកពី AI Detection</small>
          <strong>{khmerNumber(aiOrdersCount)}</strong>
        </div>
      </div>
    </div>

    <div className="order-status-strip"><span>ការបញ្ជាទិញ {khmerNumber(total)}</span><small>ការបញ្ជាទិញថ្មីត្រូវបានរក្សាទុកជាសេចក្ដីព្រាង ឬរង់ចាំការបញ្ជាក់ រហូតដល់មានការបញ្ជាក់ច្បាស់លាស់។</small></div>
    {(error || actionError) && <div className="error-banner" role="alert">{error || actionError}</div>}
    <section className="panel">
      <div className="orders-status-tabs" style={{ display: "flex", gap: "6px", overflowX: "auto", paddingBottom: "10px", marginBottom: "14px", borderBottom: "1px solid #edf0f4" }}>
        {[
          { id: "", label: "ទាំងអស់" },
          { id: "__AI__", label: "✨ មកពី AI Detection", special: true },
          { id: "PENDING_CONFIRMATION", label: "រង់ចាំបញ្ជាក់" },
          { id: "CONFIRMED", label: "បានបញ្ជាក់" },
          { id: "PROCESSING", label: "កំពុងរៀបចំ" },
          { id: "SHIPPED", label: "បានផ្ញើ/ដឹកជញ្ជូន" },
          { id: "DELIVERED", label: "បានប្រគល់" },
          { id: "CANCELLED", label: "បានបោះបង់" },
        ].map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={`button ${statusFilter === tab.id ? "primary" : "subtle"}`}
            style={{
              fontSize: "11px",
              height: "30px",
              padding: "0 12px",
              borderRadius: "20px",
              fontWeight: statusFilter === tab.id ? 700 : 500,
              background: tab.special && statusFilter === tab.id ? "#7c3aed" : tab.special ? "#f5f3ff" : undefined,
              color: tab.special && statusFilter === tab.id ? "#ffffff" : tab.special ? "#7c3aed" : undefined,
              borderColor: tab.special ? "#ddd6fe" : undefined,
            }}
            onClick={() => { setStatusFilter(tab.id); setPage(1); }}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div className="section-toolbar"><label className="input-wrap"><Search size={14} /><input aria-label="ស្វែងរកការបញ្ជាទិញ" placeholder="ស្វែងរកលេខបញ្ជាទិញ អតិថិជន ឬលេខទូរស័ព្ទ" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} /></label><select className="select" aria-label="ច្រោះតាមស្ថានភាពការបញ្ជាទិញ" value={statusFilter} onChange={(event) => { setStatusFilter(event.target.value); setPage(1); }}><option value="">ស្ថានភាពទាំងអស់</option>{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
      {selectedIds.length > 0 && <div className="bulk-toolbar"><strong>បានជ្រើស {khmerNumber(selectedIds.length)}</strong><button className="button" onClick={() => exportOrders(orders.filter((order) => selectedIds.includes(order.id)))}><Download size={13} /> នាំចេញ CSV ដែលបានជ្រើស</button><button className="button" onClick={() => void exportOrdersExcel(orders.filter((order) => selectedIds.includes(order.id)))}><FileSpreadsheet size={13} /> Excel ដែលបានជ្រើស</button><select className="select" aria-label="ស្ថានភាពថ្មីសម្រាប់ការបញ្ជាទិញដែលបានជ្រើស" value={bulkStatus} onChange={(event) => setBulkStatus(event.target.value)}><option value="">ជ្រើសស្ថានភាពបន្ទាប់</option>{[["PENDING_CONFIRMATION", "រង់ចាំការបញ្ជាក់"], ["CONFIRMED", "បានបញ្ជាក់"], ["PROCESSING", "កំពុងរៀបចំ"], ["SHIPPED", "បានដឹកជញ្ជូន"], ["DELIVERED", "បានប្រគល់"]].map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><button className="button primary" disabled={!bulkStatus || bulkBusy} onClick={() => void bulkUpdate()}>{bulkBusy ? "កំពុងកែប្រែ…" : "អនុវត្ត"}</button><button className="button" disabled={bulkBusy} onClick={() => setSelectedIds([])}>សម្អាតការជ្រើស</button></div>}
      {orders.length ? <div className="table-wrap"><table><thead><tr><th><input type="checkbox" aria-label="ជ្រើសការបញ្ជាទិញក្នុងទំព័រនេះ" checked={orders.length > 0 && orders.every((order) => selectedIds.includes(order.id))} onChange={(event) => setSelectedIds(event.target.checked ? orders.map((order) => order.id) : [])} /></th><th>លេខបញ្ជាទិញ</th><th>អតិថិជន</th><th>ផលិតផល</th><th>បណ្ដាញ</th><th>សរុប</th><th>ស្ថានភាព</th><th>ជំហានបន្ទាប់</th><th className="actions-header">សកម្មភាព</th></tr></thead>
        <tbody>{orders.map((order) => <tr key={order.id} className="clickable-row" onClick={() => onOpenDrawer(order.id)}>
          <td onClick={(event) => event.stopPropagation()}><input type="checkbox" aria-label={`ជ្រើសការបញ្ជាទិញ ${order.orderNumber}`} checked={selectedIds.includes(order.id)} onChange={(event) => setSelectedIds((old) => event.target.checked ? [...old, order.id] : old.filter((id) => id !== order.id))} /></td>
          <td>
            <strong>{order.orderNumber}</strong>
            <small className="table-sub" suppressHydrationWarning>{dateLabel(order.createdAt)}</small>
            {order.suggestion && (
              <div style={{ marginTop: "3px" }}>
                <button
                  type="button"
                  className="ai-source-badge"
                  title="ការបញ្ជាទិញនេះបានមកពីការរកឃើញ AI ។ ចុចដើម្បីពិនិត្យភស្តុតាង និងប្រភពដើម។"
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpenDrawer(order.id);
                  }}
                >
                  <Sparkles size={10} /> AI ({khmerNumber(order.suggestion.confidence)}%)
                </button>
              </div>
            )}
          </td>
          <td>
            <div style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}>
              <strong>{order.customer}</strong>
              {order.phone && <a href={`tel:${order.phone}`} onClick={(e) => e.stopPropagation()} style={{ color: "var(--blue)" }} title="តេ"><Phone size={11} /></a>}
            </div>
            <small className="table-sub latin-data">{formatCambodiaPhone(order.phone) || order.phone}</small>
            {order.province && (
              <small className="table-sub" style={{ color: "#2563eb", display: "flex", alignItems: "center", gap: "3px", marginTop: "2px" }}>
                <MapPin size={10} /> {order.province}
              </small>
            )}
          </td>
          <td>{order.itemNames || "—"}</td>
          <td>
            <MediaBadge channel={order.channel} />
            {order.courier && (
              <div style={{ marginTop: "4px", display: "flex", alignItems: "center", gap: "3px" }}>
                <span className="badge" style={{ fontSize: "0.68rem", padding: "1px 5px", background: "#f1f5f9", color: "#475569" }}>
                  {order.courier}
                </span>
                {order.trackingNumber && (
                  <span className="latin-data" style={{ fontSize: "0.68rem", color: "#64748b" }} title="លេខកូដតាមដាន">
                    #{order.trackingNumber}
                  </span>
                )}
              </div>
            )}
          </td>
          <td>
            <strong>{currency(order.total, code)}</strong>
            <div style={{ fontSize: "0.75rem", color: "var(--text-muted, #64748b)" }}>{formatKHR(usdToKhr(order.total))}</div>
            {order.paymentMethod && (
              <div style={{ marginTop: "3px" }}>
                <span className={`badge ${order.paymentStatus === "PAID" ? "green" : "amber"}`} style={{ fontSize: "0.65rem", padding: "1px 5px" }}>
                  {order.paymentMethod} {order.paymentStatus === "PAID" ? "✓" : ""}
                </span>
              </div>
            )}
          </td>
          <td><Badge value={statusLabels[order.status] ?? order.status} className={statusClass[order.status]} /></td>
          <td onClick={(event) => event.stopPropagation()}>{order.status === "PENDING_CONFIRMATION" ? <button className="button tiny-action" onClick={() => void changeStatus(order, "CONFIRMED")} disabled={busyId === order.id}><Check size={12} /> បញ្ជាក់</button> : order.status === "DRAFT" ? <button className="button tiny-action" onClick={() => void changeStatus(order, "PENDING_CONFIRMATION")} disabled={busyId === order.id}>ស្នើសុំការបញ្ជាក់</button> : order.status === "CONFIRMED" ? <button className="button tiny-action" onClick={() => void changeStatus(order, "PROCESSING")} disabled={busyId === order.id}>ចាប់ផ្ដើមរៀបចំ</button> : order.status === "PROCESSING" ? <button className="button tiny-action" onClick={() => void changeStatus(order, "SHIPPED")} disabled={busyId === order.id}>សម្គាល់ថាបានដឹកជញ្ជូន</button> : order.status === "SHIPPED" ? <button className="button tiny-action" onClick={() => void changeStatus(order, "DELIVERED")} disabled={busyId === order.id}>សម្គាល់ថាបានប្រគល់</button> : <span className="quiet-copy">—</span>}</td>
          <td className="actions-cell" onClick={(event) => event.stopPropagation()}>
            <div className="table-actions-group">
              <button
                type="button"
                className="action-icon-btn primary-action"
                title="មើលព័ត៌មានលម្អិត & វិវឌ្ឍ"
                onClick={() => onOpenDrawer(order.id)}
                aria-label="View order details"
              >
                <Eye size={13} />
              </button>
              <button
                type="button"
                className="action-icon-btn print-action"
                title="បោះពុម្ពវិក្កយបត្រ / ស្លាកដឹកជញ្ជូន 80mm"
                onClick={() => void onPrintOrder(order)}
                aria-label="Print receipt"
              >
                <Printer size={13} />
              </button>
              {["DRAFT", "PENDING_CONFIRMATION"].includes(order.status) && (
                <button
                  type="button"
                  className="action-icon-btn edit-action"
                  title="កែប្រែការបញ្ជាទិញ"
                  onClick={() => void editOrder(order)}
                  aria-label="Edit order"
                >
                  <Edit2 size={13} />
                </button>
              )}
              <button
                type="button"
                className="action-icon-btn delete-action"
                title="លុបការបញ្ជាទិញ"
                onClick={() => void deleteOrder(order)}
                aria-label="Delete order"
              >
                <Trash2 size={13} />
              </button>
            </div>
          </td>
        </tr>)}</tbody></table></div> :
        <div className="empty-state"><strong>រកមិនឃើញការបញ្ជាទិញទេ</strong>បង្កើតការបញ្ជាទិញដោយដៃ ឬពិនិត្យសំណើ AI។</div>}
      <DataTablePagination
        currentPage={page}
        totalPages={Math.max(1, Math.ceil(total / pageSize))}
        totalItems={total}
        pageSize={pageSize}
        onPageChange={(value) => setPage(value)}
        onPageSizeChange={(newSize) => {
          setPageSize(newSize);
          setPage(1);
        }}
        itemName="ការបញ្ជាទិញ"
      />
    </section>
  </>;
}

function ProductThumbnail({ src, alt }: { src?: string | null; alt: string }) {
  const [hasError, setHasError] = useState(false);
  useEffect(() => {
    setHasError(false);
  }, [src]);

  if (!src || hasError) {
    return (
      <div
        style={{
          width: "42px",
          height: "42px",
          borderRadius: "8px",
          background: "linear-gradient(135deg, #f1f5f9 0%, #e2e8f0 100%)",
          border: "1px solid #e2e8f0",
          display: "grid",
          placeItems: "center",
          color: "#94a3b8",
          flexShrink: 0,
        }}
      >
        <Package size={18} />
      </div>
    );
  }
  return (
    <img
      src={src}
      alt={alt}
      onError={() => setHasError(true)}
      style={{
        width: "42px",
        height: "42px",
        borderRadius: "8px",
        objectFit: "cover",
        border: "1px solid #e2e8f0",
        flexShrink: 0,
        boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
      }}
    />
  );
}

function ProductsView({
  products,
  categories = [],
  lowStockCount,
  code,
  add,
  edit,
  remove,
  manageVariants,
  onAdjustStock,
  onOpenInventory,
  onOpenCategories,
  initialCategory,
}: {
  products: Product[];
  categories?: Category[];
  lowStockCount: number;
  code: string;
  add: () => void;
  edit: (product: Product) => void;
  remove: (product: Product) => Promise<void>;
  manageVariants: (product: Product) => void;
  onAdjustStock: (product: Product) => void;
  onOpenInventory?: () => void;
  onOpenCategories?: () => void;
  initialCategory?: string;
}) {
  const notify = useToast();
  const [query, setQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState(initialCategory ?? "");
  const [lowStockOnly, setLowStockOnly] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [error, setError] = useState("");

  useEffect(() => {
    if (initialCategory !== undefined) {
      setSelectedCategory(initialCategory);
    }
  }, [initialCategory]);

  useEffect(() => {
    setPage(1);
  }, [query, selectedCategory, lowStockOnly]);

  const categoryColorMap = useMemo(() => {
    const map: Record<string, string> = {};
    for (const c of categories) {
      if (c.color) map[c.name] = c.color;
    }
    return map;
  }, [categories]);

  const distinctCategories = useMemo(() => {
    const set = new Set<string>();
    for (const c of categories) set.add(c.name);
    for (const p of products) {
      if (p.category && p.category !== "មិនទាន់ចាត់ថ្នាក់") set.add(p.category);
    }
    return Array.from(set);
  }, [categories, products]);

  async function deleteProduct(product: Product) {
    if (!window.confirm(`លុបផលិតផល ${product.name}? ផលិតផលដែលភ្ជាប់នឹងការបញ្ជាទិញមិនអាចលុបបានទេ។`)) return;
    setError("");
    try {
      await remove(product);
      notify({ kind: "success", title: "បានលុបផលិតផល", description: product.name });
    }
    catch (cause) { setError(cause instanceof Error ? cause.message : "មិនអាចលុបផលិតផលបានទេ។"); }
  }
  const hasLowStock = (product: Product) => !product.active ? false : product.variants.length
    ? product.variants.some((variant) => variant.stock !== null && variant.stock <= 5)
    : product.stock !== null && product.stock <= 5;
  const rows = products.filter((product) =>
    (!lowStockOnly || hasLowStock(product)) &&
    (!selectedCategory || product.category === selectedCategory) &&
    `${product.name} ${product.sku} ${product.category}`.toLowerCase().includes(query.toLowerCase()),
  );
  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const paginatedRows = rows.slice((page - 1) * pageSize, page * pageSize);
  return <>
    <PageHeading
      title="ផលិតផល"
      description="គ្រប់គ្រងបញ្ជីផលិតផលសម្រាប់កំណត់តម្លៃការបញ្ជាទិញ និងផ្ទៀងផ្ទាត់ផលិតផលដែល AI ស្នើ។"
      action={
        <div style={{ display: "flex", gap: "8px" }}>
          {onOpenCategories && (
            <button
              className="button"
              onClick={onOpenCategories}
              title="គ្រប់គ្រង និងចាត់ថ្នាក់ផលិតផល"
              style={{ background: "#eff6ff", color: "#1e40af", borderColor: "#bfdbfe" }}
            >
              <FolderTree size={14} /> ប្រភេទផលិតផល
            </button>
          )}
          {onOpenInventory && (
            <button
              className="button"
              onClick={onOpenInventory}
              title="មើលប្រវត្តិស្តុកចេញ-ចូល និងស្តុកទាប"
              style={{ background: "#f0fdf4", color: "#166534", borderColor: "#86efac" }}
            >
              <Boxes size={14} /> ប្រវត្តិ & ស្តុកទំនិញ
            </button>
          )}
          <button className="button primary" onClick={add}><Plus size={14} /> បន្ថែមផលិតផល</button>
        </div>
      }
    />
    <div className="product-insight-row">
      <span><Package size={14} /> ផលិតផលសកម្ម {khmerNumber(products.filter((product) => product.active).length)} មុខ</span>
      <span>{categories.length > 0 ? `ចែកចេញជា ${khmerNumber(categories.length)} ប្រភេទ` : "ជម្រើសផលិតផលអាចប្រើសម្រាប់ការបញ្ជាទិញ នៅពេលបានកំណត់រួច។"}</span>
    </div>
    {lowStockCount > 0 && <div className="stock-alert" role="status"><Package size={17} /><span><strong>ស្តុកទាប {khmerNumber(lowStockCount)} មុខ</strong><small>មុខទំនិញដែលមានស្តុក ៥ ឬតិចជាងនេះ ត្រូវការបញ្ចូលស្តុកបន្ថែម។</small></span><button className="button subtle" onClick={() => setLowStockOnly((value) => !value)}>{lowStockOnly ? "បង្ហាញផលិតផលទាំងអស់" : "មើលស្តុកទាប"}</button></div>}
    <section className="panel">
      {error && <div className="error-banner" role="alert">{error}</div>}
      <div className="section-toolbar">
        <label className="input-wrap"><Search size={14} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="ស្វែងរកឈ្មោះ លេខកូដ SKU ឬប្រភេទ" /></label>
        <select className="select" value={selectedCategory} onChange={(e) => setSelectedCategory(e.target.value)} aria-label="ច្រោះតាមប្រភេទ">
          <option value="">ប្រភេទទាំងអស់</option>
          {distinctCategories.map((cat) => (
            <option key={cat} value={cat}>{cat}</option>
          ))}
        </select>
        <Badge value={`${khmerNumber(rows.length)} មុខ`} />
      </div>
      {rows.length ? (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>ផលិតផល</th>
                <th>លេខកូដ SKU</th>
                <th>ប្រភេទ</th>
                <th>តម្លៃ</th>
                <th>ជម្រើស</th>
                <th>ស្តុក</th>
                <th>ស្ថានភាព</th>
                <th className="actions-header">សកម្មភាព</th>
              </tr>
            </thead>
            <tbody>
              {paginatedRows.map((product) => (
                <tr key={product.id}>
                  <td>
                    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                      <ProductThumbnail src={product.imageUrl} alt={product.name} />
                      <div style={{ minWidth: 0 }}>
                        <strong className="latin-data">{product.name}</strong>
                        {product.variants.length > 0 && (
                          <small className="table-sub latin-data" style={{ display: "block", marginTop: "2px" }}>
                            {product.variants.map((variant) => `${variant.name}${variant.active === false ? " (អសកម្ម)" : ""}`).join(" · ")}
                          </small>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="latin-data">{product.sku || "—"}</td>
                  <td>
                    {product.category && product.category !== "មិនទាន់ចាត់ថ្នាក់" ? (
                      <span
                        className="badge"
                        style={{
                          background: `${categoryColorMap[product.category] ?? "#3164ce"}15`,
                          color: categoryColorMap[product.category] ?? "#3164ce",
                          borderColor: `${categoryColorMap[product.category] ?? "#3164ce"}30`,
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 5,
                        }}
                      >
                        <i style={{ width: 6, height: 6, borderRadius: "50%", background: categoryColorMap[product.category] ?? "#3164ce", display: "inline-block" }} />
                        {product.category}
                      </span>
                    ) : (
                      <span style={{ color: "#94a3b8", fontSize: "0.8rem" }}>មិនទាន់ចាត់ថ្នាក់</span>
                    )}
                  </td>
                  <td>
                    <strong className="latin-data">{currency(product.price, code)}</strong>
                    <div style={{ fontSize: "0.75rem", color: "var(--text-muted, #64748b)" }}>{formatKHR(usdToKhr(product.price))}</div>
                  </td>
                  <td>{product.variants.length ? khmerNumber(product.variants.length) : "—"}</td>
                  <td>
                    {product.variants.length ? (
                      <div className="stock-variant-list" style={{ display: "flex", flexDirection: "column", gap: "3px" }}>
                        {product.variants.map((variant) => {
                          const isZero = variant.stock === 0;
                          const isLow = variant.stock !== null && variant.stock > 0 && variant.stock <= 5;
                          return (
                            <span
                              key={variant.id}
                              className={`latin-data ${isLow ? "stock-low" : ""}`}
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: "4px",
                                padding: "2px 6px",
                                borderRadius: "4px",
                                fontSize: "0.75rem",
                                background: isZero ? "#fef2f2" : isLow ? "#fffbeb" : "#f8fafc",
                                color: isZero ? "#dc2626" : isLow ? "#b45309" : "#334155",
                                border: `1px solid ${isZero ? "#fecaca" : isLow ? "#fde68a" : "#e2e8f0"}`,
                                width: "fit-content",
                              }}
                            >
                              <strong>{variant.name}:</strong>
                              {variant.stock === null ? "—" : isZero ? "❌ អស់" : isLow ? `⚠️ ${khmerNumber(variant.stock)}` : `${khmerNumber(variant.stock)}`}
                            </span>
                          );
                        })}
                      </div>
                    ) : product.stock === null ? (
                      <span style={{ color: "var(--text-muted, #94a3b8)", fontSize: "0.8rem" }}>មិនបានតាមដាន</span>
                    ) : product.stock === 0 ? (
                      <span style={{ display: "inline-flex", alignItems: "center", gap: "4px", padding: "2px 8px", borderRadius: "6px", fontSize: "0.78rem", fontWeight: 600, background: "#fef2f2", color: "#dc2626", border: "1px solid #fecaca" }}>
                        ❌ អស់ស្តុក
                      </span>
                    ) : product.stock <= 5 ? (
                      <span style={{ display: "inline-flex", alignItems: "center", gap: "4px", padding: "2px 8px", borderRadius: "6px", fontSize: "0.78rem", fontWeight: 600, background: "#fffbeb", color: "#b45309", border: "1px solid #fde68a" }}>
                        ⚠️ ជិតអស់ ({khmerNumber(product.stock)})
                      </span>
                    ) : (
                      <span style={{ display: "inline-flex", alignItems: "center", gap: "4px", padding: "2px 8px", borderRadius: "6px", fontSize: "0.78rem", fontWeight: 500, background: "#f0fdf4", color: "#16a34a", border: "1px solid #bbf7d0" }}>
                        ✓ {khmerNumber(product.stock)} ក្នុងស្តុក
                      </span>
                    )}
                  </td>
                  <td><Badge value={product.active ? "សកម្ម" : "អសកម្ម"} className={product.active ? "green" : ""} /></td>
                  <td className="actions-cell">
                    <div className="table-actions-group">
                      <button
                        type="button"
                        className="action-icon-btn edit-action"
                        title="កែប្រែផលិតផល"
                        onClick={() => edit(product)}
                        aria-label="Edit product"
                      >
                        <Edit2 size={13} />
                      </button>
                      <button
                        type="button"
                        className="action-icon-btn stock-action"
                        title="កែសម្រួលស្តុក (Stock Adjust)"
                        onClick={() => onAdjustStock(product)}
                        aria-label="Adjust stock"
                      >
                        <RefreshCw size={13} />
                      </button>
                      <button
                        type="button"
                        className="action-icon-btn variant-action"
                        title="គ្រប់គ្រងជម្រើស (Variants)"
                        onClick={() => manageVariants(product)}
                        aria-label="Manage variants"
                      >
                        <Package size={13} />
                      </button>
                      <button
                        type="button"
                        className="action-icon-btn delete-action"
                        title="លុបផលិតផល"
                        onClick={() => void deleteProduct(product)}
                        aria-label="Delete product"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="empty-state"><strong>រកមិនឃើញផលិតផលទេ</strong>បន្ថែមផលិតផលដើម្បីបង្កើតបញ្ជីសម្រាប់ការបញ្ជាទិញ។</div>
      )}
      {rows.length > 0 && (
        <DataTablePagination
          currentPage={page}
          totalPages={totalPages}
          totalItems={rows.length}
          pageSize={pageSize}
          onPageChange={(p) => setPage(p)}
          onPageSizeChange={(newSize) => {
            setPageSize(newSize);
            setPage(1);
          }}
          itemName="មុខទំនិញ"
        />
      )}
    </section>
  </>;
}

function CategoryModal({
  category,
  close,
  created,
  updated,
}: {
  category?: Category | null;
  close: () => void;
  created?: (category: Category) => void;
  updated?: (category: Category) => void;
}) {
  const notify = useToast();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState(category?.name ?? "");
  const [description, setDescription] = useState(category?.description ?? "");
  const [color, setColor] = useState(category?.color ?? "#3164ce");
  const [active, setActive] = useState(category?.active !== false);

  const PRESET_COLORS = [
    { label: "ខៀវ", value: "#3164ce" },
    { label: "ស្វាយ", value: "#8b5cf6" },
    { label: "បៃតង", value: "#10b981" },
    { label: "ទឹកក្រូច", value: "#f59e0b" },
    { label: "ផ្កាឈូក", value: "#f43f5e" },
    { label: "ផ្ទៃមេឃ", value: "#06b6d4" },
    { label: "អាំងឌីហ្គោ", value: "#6366f1" },
    { label: "ប្រផេះ", value: "#64748b" },
  ];

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setError("សូមបញ្ចូលឈ្មោះប្រភេទផលិតផល");
      return;
    }
    setError("");
    setLoading(true);

    try {
      const response = await fetch(category ? `/api/categories/${category.id}` : "/api/categories", {
        method: category ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || null,
          color,
          active,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error ?? "មិនអាចរក្សាទុកប្រភេទផលិតផលបានទេ។");
      }

      if (category) {
        updated?.(data.category);
        notify({ kind: "success", title: "បានកែប្រែប្រភេទផលិតផល", description: data.category.name });
      } else {
        created?.(data.category);
        notify({ kind: "success", title: "បានបង្កើតប្រភេទផលិតផលថ្មី", description: data.category.name });
      }
      close();
    } catch (err) {
      setError(err instanceof Error ? err.message : "មានបញ្ហាក្នុងការរក្សាទុក");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal
      title={category ? "កែប្រែប្រភេទផលិតផល" : "បង្កើតប្រភេទផលិតផលថ្មី"}
      subtitle="កំណត់ឈ្មោះ ពណ៌សម្គាល់ និងការពិពណ៌នាសម្រាប់ចាត់ថ្នាក់ផលិតផល។"
      close={close}
    >
      <form onSubmit={submit}>
        {error && <div className="error-banner">{error}</div>}

        <div className="form-grid">
          <div className="form-field" style={{ gridColumn: "1 / -1" }}>
            <label htmlFor="cat-name">
              ឈ្មោះប្រភេទផលិតផល <span style={{ color: "#ef4444" }}>*</span>
            </label>
            <input
              id="cat-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="ឧទាហរណ៍៖ សម្លៀកបំពាក់ប្រពៃណី, ក្រម៉ា, ស្បែកជើង..."
              required
              autoFocus
            />
          </div>

          <div className="form-field" style={{ gridColumn: "1 / -1" }}>
            <label>ពណ៌សម្គាល់ (Color Badge)</label>
            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center", marginTop: 6 }}>
              {PRESET_COLORS.map((p) => (
                <button
                  key={p.value}
                  type="button"
                  onClick={() => setColor(p.value)}
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: "50%",
                    background: p.value,
                    border: color === p.value ? "3px solid #0f172a" : "2px solid #ffffff",
                    boxShadow: "0 1px 3px rgba(0,0,0,0.15)",
                    cursor: "pointer",
                    display: "grid",
                    placeItems: "center",
                    transition: "transform 0.15s ease",
                    transform: color === p.value ? "scale(1.15)" : "scale(1)",
                  }}
                  title={p.label}
                >
                  {color === p.value && <Check size={14} color="#ffffff" strokeWidth={3} />}
                </button>
              ))}
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginLeft: 8 }}>
                <input
                  type="color"
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                  style={{ width: 32, height: 32, padding: 0, border: "none", borderRadius: 6, cursor: "pointer" }}
                />
                <span className="latin-data" style={{ fontSize: 12, color: "#64748b" }}>{color}</span>
              </div>
            </div>
          </div>

          <div className="form-field" style={{ gridColumn: "1 / -1" }}>
            <label htmlFor="cat-desc">ការពិពណ៌នា (មិនចាំបាច់)</label>
            <textarea
              id="cat-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="ព័ត៌មានបន្ថែមអំពីប្រភេទផលិតផលនេះ..."
              rows={3}
              style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid #cbd5e1" }}
            />
          </div>

          <div className="form-field" style={{ gridColumn: "1 / -1" }}>
            <label htmlFor="cat-active">ស្ថានភាព</label>
            <select
              id="cat-active"
              value={active ? "true" : "false"}
              onChange={(e) => setActive(e.target.value === "true")}
              className="select"
            >
              <option value="true">សកម្ម (Active)</option>
              <option value="false">អសកម្ម (Inactive)</option>
            </select>
          </div>
        </div>

        <div className="modal-actions" style={{ marginTop: 20 }}>
          <button type="button" className="button" onClick={close} disabled={loading}>
            បោះបង់
          </button>
          <button type="submit" className="button primary" disabled={loading || !name.trim()}>
            {loading ? "កំពុងរក្សាទុក…" : category ? "រក្សាទុកការកែប្រែ" : "បង្កើតប្រភេទថ្មី"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function CategoriesView({
  categories,
  products,
  code,
  onOpenProductsWithCategory,
  onCategoriesUpdated,
}: {
  categories: Category[];
  products: Product[];
  code: string;
  onOpenProductsWithCategory: (categoryName: string) => void;
  onCategoriesUpdated: (categories: Category[]) => void;
}) {
  const notify = useToast();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ALL" | "ACTIVE" | "INACTIVE">("ALL");
  const [modalOpen, setModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  useEffect(() => {
    setPage(1);
  }, [search, statusFilter]);

  // Compute live stats for each category
  const categoryStats = useMemo(() => {
    const stats = new Map<string, { productCount: number; totalStock: number; totalValue: number }>();
    for (const cat of categories) {
      stats.set(cat.id, { productCount: 0, totalStock: 0, totalValue: 0 });
    }
    for (const p of products) {
      const cat = categories.find((c) => c.id === p.categoryId || c.name === p.category);
      if (cat) {
        const s = stats.get(cat.id);
        if (s) {
          s.productCount += 1;
          const pStock = p.variants.length > 0
            ? p.variants.reduce((acc, v) => acc + (v.stock ?? 0), 0)
            : (p.stock ?? 0);
          s.totalStock += pStock;
          s.totalValue += pStock * p.price;
        }
      }
    }
    return stats;
  }, [categories, products]);

  const categorizedProductsCount = useMemo(() => {
    return products.filter((p) => p.category && p.category !== "មិនទាន់ចាត់ថ្នាក់").length;
  }, [products]);

  const uncategorizedProductsCount = products.length - categorizedProductsCount;
  const activeCategoriesCount = categories.filter((c) => c.active).length;

  const filteredCategories = categories.filter((c) => {
    if (statusFilter === "ACTIVE" && !c.active) return false;
    if (statusFilter === "INACTIVE" && c.active) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      return c.name.toLowerCase().includes(q) || (c.description ?? "").toLowerCase().includes(q);
    }
    return true;
  });

  async function handleDelete(category: Category) {
    const stat = categoryStats.get(category.id);
    const count = stat?.productCount ?? category.productCount;
    const confirmMsg = count > 0
      ? `តើលោកអ្នកពិតជាចង់លុបប្រភេទផលិតផល «${category.name}» មែនទេ? ផលិតផលចំនួន ${count} មុខដែលស្ថិតក្នុងប្រភេទនេះ នឹងត្រូវប្ដូរទៅជា «មិនទាន់ចាត់ថ្នាក់»។`
      : `តើលោកអ្នកពិតជាចង់លុបប្រភេទផលិតផល «${category.name}» មែនទេ?`;

    if (!window.confirm(confirmMsg)) return;

    setDeletingId(category.id);
    try {
      const res = await fetch(`/api/categories/${category.id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "មិនអាចលុបប្រភេទបានទេ។");

      const nextCats = categories.filter((c) => c.id !== category.id);
      onCategoriesUpdated(nextCats);
      notify({ kind: "success", title: "បានលុបប្រភេទផលិតផល", description: category.name });
    } catch (err) {
      notify({ kind: "error", title: "កំហុស", description: err instanceof Error ? err.message : "មិនអាចលុបបានទេ" });
    } finally {
      setDeletingId(null);
    }
  }

  const totalPages = Math.max(1, Math.ceil(filteredCategories.length / pageSize));
  const paginatedCategories = filteredCategories.slice((page - 1) * pageSize, page * pageSize);

  return (
    <>
      <PageHeading
        title="ប្រភេទផលិតផល"
        description="គ្រប់គ្រង និងរៀបចំផលិតផលតាមប្រភេទ ដើម្បីងាយស្រួលស្វែងរក គ្រប់គ្រងស្តុក និងតាមដានរបាយការណ៍លក់។"
        action={
          <div style={{ display: "flex", gap: "8px" }}>
            <button
              className="button"
              onClick={() => onOpenProductsWithCategory("")}
              title="ទៅកាន់បញ្ជីផលិតផលទាំងអស់"
              style={{ background: "#eff6ff", color: "#1e40af", borderColor: "#bfdbfe" }}
            >
              <Package size={14} /> បញ្ជីផលិតផល
            </button>
            <button
              className="button primary"
              onClick={() => {
                setEditingCategory(null);
                setModalOpen(true);
              }}
            >
              <Plus size={14} /> បន្ថែមប្រភេទថ្មី
            </button>
          </div>
        }
      />

      <div className="product-insight-row">
        <span>
          <FolderTree size={14} /> ប្រភេទសរុប {khmerNumber(categories.length)} ប្រភេទ (សកម្ម {khmerNumber(activeCategoriesCount)})
        </span>
        <span>
          បានចាត់ថ្នាក់ {khmerNumber(categorizedProductsCount)} នៃ {khmerNumber(products.length)} មុខទំនិញ ({categories.length ? Math.round((categorizedProductsCount / Math.max(1, products.length)) * 100) : 0}%)
        </span>
      </div>

      <section className="panel">
        <div className="section-toolbar">
          <label className="input-wrap">
            <Search size={14} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="ស្វែងរកឈ្មោះប្រភេទ ឬការពិពណ៌នា..."
            />
          </label>
          <select
            className="select"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as any)}
            aria-label="ច្រោះតាមស្ថានភាព"
          >
            <option value="ALL">ស្ថានភាពទាំងអស់</option>
            <option value="ACTIVE">សកម្ម (Active)</option>
            <option value="INACTIVE">អសកម្ម (Inactive)</option>
          </select>
          <Badge value={`${khmerNumber(filteredCategories.length)} ប្រភេទ`} />
        </div>

        {filteredCategories.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>ប្រភេទផលិតផល</th>
                  <th>កូដពណ៌</th>
                  <th>ការពិពណ៌នា</th>
                  <th>ចំនួនផលិតផល</th>
                  <th>ស្តុក</th>
                  <th>តម្លៃស្តុក</th>
                  <th>ស្ថានភាព</th>
                  <th className="actions-header">សកម្មភាព</th>
                </tr>
              </thead>
              <tbody>
                {paginatedCategories.map((cat) => {
                  const stat = categoryStats.get(cat.id);
                  const pCount = stat?.productCount ?? cat.productCount;
                  const tStock = stat?.totalStock ?? 0;
                  const tValue = stat?.totalValue ?? 0;
                  const catColor = cat.color || "#3164ce";

                  return (
                    <tr key={cat.id}>
                      <td>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <span
                            className="badge"
                            style={{
                              background: `${catColor}15`,
                              color: catColor,
                              borderColor: `${catColor}30`,
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 6,
                              fontWeight: 600,
                              fontSize: "0.85rem",
                              padding: "4px 10px",
                              borderRadius: "20px",
                            }}
                          >
                            <i style={{ width: 7, height: 7, borderRadius: "50%", background: catColor, display: "inline-block" }} />
                            {cat.name}
                          </span>
                        </div>
                        <small className="table-sub" style={{ display: "block", marginTop: "3px" }}>
                          បង្កើត៖ {dateLabel(cat.createdAt)}
                        </small>
                      </td>
                      <td>
                        <span
                          className="latin-data"
                          style={{
                            fontFamily: "monospace",
                            fontSize: "0.8rem",
                            color: "#64748b",
                            background: "#f1f5f9",
                            padding: "2px 7px",
                            borderRadius: "4px",
                            border: "1px solid #e2e8f0",
                            display: "inline-block",
                          }}
                        >
                          {catColor.toUpperCase()}
                        </span>
                      </td>
                      <td style={{ maxWidth: 260 }}>
                        {cat.description ? (
                          <span style={{ fontSize: "0.85rem", color: "#334155" }} title={cat.description}>
                            {cat.description}
                          </span>
                        ) : (
                          <span style={{ color: "#94a3b8", fontSize: "0.8rem" }}>—</span>
                        )}
                      </td>
                      <td>
                        <button
                          type="button"
                          className="button subtle tiny"
                          onClick={() => onOpenProductsWithCategory(cat.name)}
                          title={`មើលផលិតផលទាំងអស់ក្នុងប្រភេទ ${cat.name}`}
                          style={{
                            color: "#2563eb",
                            fontWeight: 600,
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 4,
                            padding: "3px 8px",
                            borderRadius: 6,
                          }}
                        >
                          <Package size={12} />
                          <span>{khmerNumber(pCount)} មុខ</span>
                          <ArrowUpRight size={12} />
                        </button>
                      </td>
                      <td>
                        {tStock === 0 ? (
                          <span style={{ display: "inline-flex", alignItems: "center", gap: "4px", padding: "2px 8px", borderRadius: "6px", fontSize: "0.78rem", fontWeight: 600, background: "#fef2f2", color: "#dc2626", border: "1px solid #fecaca" }}>
                            ❌ អស់ស្តុក
                          </span>
                        ) : tStock <= 5 ? (
                          <span style={{ display: "inline-flex", alignItems: "center", gap: "4px", padding: "2px 8px", borderRadius: "6px", fontSize: "0.78rem", fontWeight: 600, background: "#fffbeb", color: "#b45309", border: "1px solid #fde68a" }}>
                            ⚠️ ជិតអស់ ({khmerNumber(tStock)})
                          </span>
                        ) : (
                          <span style={{ display: "inline-flex", alignItems: "center", gap: "4px", padding: "2px 8px", borderRadius: "6px", fontSize: "0.78rem", fontWeight: 500, background: "#f0fdf4", color: "#16a34a", border: "1px solid #bbf7d0" }}>
                            ✓ {khmerNumber(tStock)} ក្នុងស្តុក
                          </span>
                        )}
                      </td>
                      <td>
                        <strong className="latin-data">{currency(tValue, code)}</strong>
                        <div style={{ fontSize: "0.75rem", color: "var(--text-muted, #64748b)" }}>
                          {formatKHR(usdToKhr(tValue))}
                        </div>
                      </td>
                      <td>
                        <Badge
                          value={cat.active ? "សកម្ម" : "អសកម្ម"}
                          className={cat.active ? "green" : ""}
                        />
                      </td>
                      <td className="actions-cell">
                        <div className="table-actions-group">
                          <button
                            type="button"
                            className="action-icon-btn edit-action"
                            title="កែប្រែប្រភេទ"
                            onClick={() => {
                              setEditingCategory(cat);
                              setModalOpen(true);
                            }}
                            aria-label="Edit category"
                          >
                            <Edit2 size={13} />
                          </button>
                          <button
                            type="button"
                            className="action-icon-btn delete-action"
                            disabled={deletingId === cat.id}
                            onClick={() => void handleDelete(cat)}
                            title="លុបប្រភេទ"
                            aria-label="Delete category"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty-state" style={{ padding: "40px 20px" }}>
            <FolderTree size={36} color="#94a3b8" style={{ marginBottom: 12, opacity: 0.6 }} />
            <strong>
              {search.trim() || statusFilter !== "ALL"
                ? "រកមិនឃើញប្រភេទផលិតផលទេ"
                : "មិនទាន់មានប្រភេទផលិតផលនៅឡើយទេ"}
            </strong>
            <p style={{ maxWidth: 440, margin: "8px auto 16px", color: "#64748b", fontSize: 13 }}>
              {search.trim() || statusFilter !== "ALL"
                ? "សូមសាកល្បងផ្លាស់ប្ដូរពាក្យគន្លឹះ ឬជ្រើសរើសតម្រងឡើងវិញ។"
                : "បង្កើតប្រភេទផលិតផលដើម្បីចាត់ថ្នាក់ទំនិញរបស់អ្នកឱ្យមានរបៀបរៀបរយ និងងាយស្រួលដល់ការស្វែងរក។"}
            </p>
            {(!search.trim() && statusFilter === "ALL") && (
              <button
                className="button primary"
                onClick={() => {
                  setEditingCategory(null);
                  setModalOpen(true);
                }}
              >
                <Plus size={14} /> បង្កើតប្រភេទថ្មី
              </button>
            )}
          </div>
        )}

        {filteredCategories.length > 0 && (
          <DataTablePagination
            currentPage={page}
            totalPages={totalPages}
            totalItems={filteredCategories.length}
            pageSize={pageSize}
            onPageChange={(p) => setPage(p)}
            onPageSizeChange={(newSize) => {
              setPageSize(newSize);
              setPage(1);
            }}
            itemName="ប្រភេទ"
          />
        )}
      </section>

      {modalOpen && (
        <CategoryModal
          category={editingCategory}
          close={() => {
            setModalOpen(false);
            setEditingCategory(null);
          }}
          created={(newCat) => {
            onCategoriesUpdated([...categories, newCat]);
          }}
          updated={(upCat) => {
            onCategoriesUpdated(categories.map((c) => (c.id === upCat.id ? upCat : c)));
          }}
        />
      )}
    </>
  );
}

function SuggestionReviewDrawer({
  suggestion,
  products,
  currentItems,
  onItemsChange,
  onApprove,
  onApproveAndConfirm,
  onReview,
  onClose,
  onOpenOrder,
  isBusy,
}: {
  suggestion: Suggestion;
  products: Product[];
  currentItems: Suggestion["items"];
  onItemsChange: (items: Suggestion["items"]) => void;
  onApprove: (extra: { deliveryAddress?: string; deliveryFee?: number; notes?: string }) => Promise<void>;
  onApproveAndConfirm?: (extra: { deliveryAddress?: string; deliveryFee?: number; notes?: string }) => Promise<void>;
  onReview: (decision: "NOT_AN_ORDER" | "DISMISSED" | "DUPLICATE") => Promise<void>;
  onClose: () => void;
  onOpenOrder?: (orderId: string) => void;
  isBusy: boolean;
}) {
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [deliveryFee, setDeliveryFee] = useState(0);
  const [notes, setNotes] = useState("");

  const total = currentItems.reduce((sum, item) => {
    const prod = products.find((p) => p.id === item.productId);
    if (!prod) return sum;
    const variant = prod.variants.find((v) => v.id === item.variantId);
    const price = variant?.price ?? prod.price ?? 0;
    return sum + price * item.quantity;
  }, 0);

  const confidenceClass = suggestion.confidence >= 80 ? "high" : suggestion.confidence >= 60 ? "medium" : "low";

  return (
    <div
      className="drawer-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="order-drawer suggestion-drawer"
        role="dialog"
        aria-modal="true"
        aria-label={`ពិនិត្យសំណើ AI សម្រាប់ ${suggestion.customer}`}
      >
        {/* Drawer Header */}
        <div className="drawer-header">
          <div className="drawer-title-group">
            <span
              className="avatar"
              style={{
                width: 42,
                height: 42,
                fontSize: 15,
                background: "linear-gradient(135deg, #1e3a8a, #3b82f6)",
                color: "white",
              }}
            >
              {initials(suggestion.customer)}
            </span>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <span className="order-number-title" style={{ fontSize: 16 }}>
                  {suggestion.customer}
                </span>
                <span className={`confidence-pill ${confidenceClass}`} style={{ fontSize: 11, padding: "2px 8px" }}>
                  <Sparkles size={11} /> {khmerNumber(suggestion.confidence)}% ភាពជឿជាក់
                </span>
                <Badge
                  value={intentNames[suggestion.intent] ?? suggestion.intent}
                  className="blue"
                />
              </div>
              <small style={{ color: "var(--muted)", fontSize: 11, display: "flex", alignItems: "center", gap: 5, marginTop: 3 }}>
                <MediaIcon channel={suggestion.channel} size={12} />
                {channelNames[suggestion.channel] ?? suggestion.channel} · {dateLabel(suggestion.createdAt)}
              </small>
            </div>
          </div>
          <div className="drawer-head-actions">
            <button
              type="button"
              className="icon-button"
              onClick={onClose}
              aria-label="បិទផ្ទាំង"
              style={{ padding: 6, borderRadius: 6, border: "1px solid #e2e8f0" }}
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Drawer Scroll Body */}
        <div className="drawer-scroll-body">
          {/* Linked Order Banner */}
          {(suggestion.order || suggestion.orderId) && (
            <div style={{
              background: "#f0fdf4",
              border: "1px solid #86efac",
              borderRadius: "10px",
              padding: "12px 14px",
              marginBottom: "14px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "10px",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <div style={{ background: "#dcfce7", color: "#16a34a", width: 34, height: 34, borderRadius: "50%", display: "grid", placeItems: "center", flexShrink: 0 }}>
                  <Package size={18} />
                </div>
                <div>
                  <strong style={{ fontSize: "13px", color: "#166534", display: "block" }}>
                    បានភ្ជាប់ទៅការបញ្ជាទិញ: #{suggestion.order?.orderNumber || suggestion.orderId}
                  </strong>
                  <small style={{ fontSize: "11px", color: "#4b5563" }}>
                    {suggestion.order ? `ស្ថានភាព: ${statusLabels[suggestion.order.status] ?? suggestion.order.status} · សរុប ${formatUSD(suggestion.order.total)}` : "ការបញ្ជាទិញត្រូវបានបង្កើតក្នុងប្រព័ន្ធ"}
                  </small>
                </div>
              </div>
              {onOpenOrder && (suggestion.order?.id || suggestion.orderId) && (
                <button
                  type="button"
                  className="button subtle tiny"
                  onClick={() => {
                    onClose();
                    onOpenOrder(suggestion.order?.id || suggestion.orderId!);
                  }}
                  style={{ background: "white", borderColor: "#86efac", color: "#166534", fontWeight: 700, padding: "5px 12px" }}
                >
                  បើកមើលការបញ្ជាទិញ →
                </button>
              )}
            </div>
          )}

          {/* Card 1: Product Matching */}
          <div className="drawer-card">
            <div className="card-header-row">
              <span className="card-section-title" style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <Package size={14} color="#2563eb" /> មុខទំនិញដែលបានស្រង់ និងផ្គូផ្គង (Detected Items)
              </span>
              <span style={{ fontSize: 11, color: "#64748b" }}>
                {khmerNumber(currentItems.length)} មុខទំនិញ
              </span>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {currentItems.map((extracted, index) => {
                const matchedProduct = products.find((p) => p.id === extracted.productId);
                const matchedPrice = matchedProduct?.price ?? 0;
                const hasVariants = Boolean(matchedProduct?.variants?.length);
                const variant = matchedProduct?.variants?.find((v) => v.id === extracted.variantId);
                const unitPrice = variant?.price ?? matchedPrice;
                const lineTotal = unitPrice * extracted.quantity;

                return (
                  <div className="ai-item-match-row" key={index} style={{ marginBottom: 0 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 6 }}>
                      <span className="ai-item-keyword-tag">
                        🔎 ស្រង់ពាក្យ: &quot;{extracted.productName}&quot;
                      </span>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        {matchedProduct && (
                          <span style={{ fontSize: 12, color: "#16846e", fontWeight: 700 }}>
                            {formatUSD(lineTotal)} ({formatKHR(usdToKhr(lineTotal))})
                          </span>
                        )}
                        {currentItems.length > 1 && (
                          <button
                            type="button"
                            className="icon-button"
                            title="លុបមុខទំនិញនេះចេញពីសំណើ"
                            style={{ padding: 3, color: "#dc2626" }}
                            onClick={() => {
                              onItemsChange(currentItems.filter((_, i) => i !== index));
                            }}
                          >
                            <Trash2 size={13} />
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="ai-item-controls">
                      <select
                        aria-label={`ផ្គូផ្គងផលិតផលសំណើ ${khmerNumber(index + 1)}`}
                        value={extracted.productId ?? ""}
                        className={!extracted.productId ? "warning-select" : ""}
                        onChange={(event) => {
                          const prod = products.find((entry) => entry.id === event.target.value);
                          onItemsChange(
                            currentItems.map((entry, i) =>
                              i === index
                                ? {
                                    ...entry,
                                    productId: prod?.id ?? null,
                                    productName: prod?.name ?? entry.productName,
                                    variantId: null,
                                    variantName: null,
                                  }
                                : entry
                            )
                          );
                        }}
                      >
                        <option value="">⚠️ ផ្គូផ្គងផលិតផលក្នុងបញ្ជី…</option>
                        {products
                          .filter((product) => product.active)
                          .map((product) => (
                            <option key={product.id} value={product.id}>
                              {product.name} ({formatUSD(product.price)})
                            </option>
                          ))}
                      </select>

                      {hasVariants ? (
                        <select
                          aria-label={`ជម្រើសសម្រាប់មុខទំនិញ ${khmerNumber(index + 1)}`}
                          value={extracted.variantId ?? ""}
                          className={!extracted.variantId ? "warning-select" : ""}
                          onChange={(event) => {
                            const v = matchedProduct?.variants.find(
                              (entry) => entry.id === event.target.value
                            );
                            onItemsChange(
                              currentItems.map((entry, i) =>
                                i === index
                                  ? {
                                      ...entry,
                                      variantId: v?.id ?? null,
                                      variantName: v?.name ?? null,
                                    }
                                  : entry
                              )
                            );
                          }}
                        >
                          <option value="">ជ្រើសរើសជម្រើស…</option>
                          {matchedProduct?.variants.map((v) => (
                            <option key={v.id} value={v.id}>
                              {v.name} ({formatUSD(v.price ?? matchedPrice)})
                            </option>
                          ))}
                        </select>
                      ) : (
                        <div style={{ fontSize: 11, color: "#94a3b8", padding: "0 6px" }}>
                          ស្តង់ដារ
                        </div>
                      )}

                      <div style={{ display: "flex", alignItems: "center", gap: 3 }}>
                        <input
                          aria-label={`ចំនួនមុខទំនិញសំណើ ${khmerNumber(index + 1)}`}
                          type="number"
                          min="1"
                          max="1000"
                          value={extracted.quantity}
                          onChange={(event) => {
                            const quantity = Number(event.target.value) || 1;
                            onItemsChange(
                              currentItems.map((entry, i) =>
                                i === index ? { ...entry, quantity } : entry
                              )
                            );
                          }}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}

              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: 4 }}>
                <button
                  type="button"
                  className="button outline tiny"
                  onClick={() => {
                    const firstActive = products.find((p) => p.active);
                    onItemsChange([
                      ...currentItems,
                      {
                        productId: firstActive?.id ?? null,
                        productName: firstActive?.name ?? "មុខទំនិញថ្មី",
                        variantId: null,
                        variantName: null,
                        quantity: 1,
                      },
                    ]);
                  }}
                  style={{ display: "inline-flex", alignItems: "center", gap: 4 }}
                >
                  <Plus size={12} /> បន្ថែមមុខទំនិញ
                </button>

                {total > 0 && (
                  <div style={{ textAlign: "right" }}>
                    <small style={{ color: "#64748b", display: "block", fontSize: 11 }}>តម្លៃសរុបប៉ាន់ស្មាន</small>
                    <strong style={{ fontSize: 15, color: "#16846e" }}>
                      {formatUSD(total)}
                    </strong>{" "}
                    <span style={{ fontSize: 12, color: "#64748b" }}>
                      ({formatKHR(usdToKhr(total))})
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Card 2: AI Checklist & Extra Info */}
          <div className="drawer-card">
            <div className="card-header-row">
              <span className="card-section-title" style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <Sparkles size={14} color="#0284c7" /> ការវិភាគ និងព័ត៌មានបន្ថែម
              </span>
            </div>

            {suggestion.missingInfo.length > 0 ? (
              <div className="ai-missing-banner" style={{ marginTop: 0 }}>
                <AlertCircle size={15} style={{ flexShrink: 0 }} />
                <span>
                  <strong>ព័ត៌មានដែលនៅខ្វះ:</strong>{" "}
                  {suggestion.missingInfo
                    .map((info) => (info === "Delivery address" ? "អាសយដ្ឋានដឹកជញ្ជូន" : info))
                    .join(" · ")}
                </span>
              </div>
            ) : (
              <div className="ai-ready-banner" style={{ marginTop: 0 }}>
                <CheckCircle2 size={15} style={{ flexShrink: 0 }} />
                <span>ព័ត៌មានគ្រប់គ្រាន់សម្រាប់ចេញវិក្កយបត្រភ្លាមៗ</span>
              </div>
            )}

            <div className="ai-reasoning-card">
              <Sparkles size={14} style={{ flexShrink: 0, marginTop: 1, color: "#0284c7" }} />
              <div>
                <strong>ការវិភាគរបស់ AI:</strong> {suggestion.explanation}
              </div>
            </div>

            {/* Optional Delivery Address & Notes for Draft creation */}
            <div style={{ marginTop: 14, display: "grid", gap: 10 }}>
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: "#475569", display: "block", marginBottom: 4 }}>
                  អាសយដ្ឋានដឹកជញ្ជូន (ជម្រើស):
                </label>
                <input
                  type="text"
                  placeholder="ឧ. ផ្ទះលេខ ១២ ផ្លូវ ២០០ ភ្នំពេញ"
                  value={deliveryAddress}
                  onChange={(e) => setDeliveryAddress(e.target.value)}
                  style={{ width: "100%", height: 34, fontSize: 12, border: "1px solid #cbd5e1", borderRadius: 6, padding: "0 10px" }}
                />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 600, color: "#475569", display: "block", marginBottom: 4 }}>
                    ថ្លៃដឹកជញ្ជូន ($USD):
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.5"
                    value={deliveryFee || ""}
                    placeholder="0.00"
                    onChange={(e) => setDeliveryFee(Number(e.target.value) || 0)}
                    style={{ width: "100%", height: 34, fontSize: 12, border: "1px solid #cbd5e1", borderRadius: 6, padding: "0 10px" }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 600, color: "#475569", display: "block", marginBottom: 4 }}>
                    ចំណាំបន្ថែម:
                  </label>
                  <input
                    type="text"
                    placeholder="ឧ. ដឹកបន្ទាន់"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    style={{ width: "100%", height: 34, fontSize: 12, border: "1px solid #cbd5e1", borderRadius: 6, padding: "0 10px" }}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Card 3: Live Conversation Evidence */}
          <div className="drawer-card">
            <div className="card-header-row">
              <span className="card-section-title" style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <MessageCircle size={14} color="#6366f1" /> ភស្តុតាងពីការសន្ទនាផ្ទាល់
              </span>
              <span style={{ fontSize: 11, color: "#64748b" }}>
                {khmerNumber(suggestion.messages.length)} សារ
              </span>
            </div>

            <div className="ai-chat-stream-box" style={{ background: "#f8fafc", maxHeight: 260, overflowY: "auto" }}>
              {suggestion.messages.length ? (
                suggestion.messages
                  .slice()
                  .reverse()
                  .map((msg, index) => (
                    <div className="ai-chat-bubble-container" key={index}>
                      <span className="ai-chat-bubble-sender">
                        <span className="avatar small" style={{ width: 18, height: 18, fontSize: 9 }}>
                          {initials(msg.sender)}
                        </span>
                        {msg.sender} · <small style={{ color: "#94a3b8" }}>{dateLabel(msg.at)}</small>
                      </span>
                      <div className="ai-chat-bubble-msg" style={{ fontSize: 12, padding: "8px 12px" }}>
                        {renderChatMessageContent(msg.body)}
                      </div>
                    </div>
                  ))
              ) : (
                <p className="quiet-copy" style={{ fontSize: 12 }}>មិនមានភស្តុតាងសារភ្ជាប់ទេ។</p>
              )}
            </div>
          </div>
        </div>

        {/* Drawer Sticky Footer */}
        <div className="drawer-footer">
          {suggestion.status === "PENDING" ? (
            <div className="drawer-actions-split">
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                <button
                  type="button"
                  className="button outline tiny"
                  onClick={() => void onReview("DUPLICATE")}
                  disabled={isBusy}
                >
                  ស្ទួន
                </button>
                <button
                  type="button"
                  className="button outline tiny"
                  onClick={() => void onReview("NOT_AN_ORDER")}
                  disabled={isBusy}
                >
                  មិនមែនការបញ្ជាទិញ
                </button>
                <button
                  type="button"
                  className="button outline tiny"
                  style={{ color: "#dc2626", borderColor: "#fca5a5" }}
                  onClick={() => void onReview("DISMISSED")}
                  disabled={isBusy}
                >
                  បដិសេធ
                </button>
              </div>

              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button
                  type="button"
                  className="button"
                  onClick={() => void onApprove({ deliveryAddress: deliveryAddress.trim() || undefined, deliveryFee, notes: notes.trim() || undefined })}
                  disabled={isBusy}
                  style={{ display: "inline-flex", alignItems: "center", gap: 6, fontWeight: 600 }}
                  title="បង្កើតជាការបញ្ជាទិញព្រាង (DRAFT) ទុកត្រួតពិនិត្យបន្ថែម"
                >
                  <Edit2 size={13} /> {isBusy ? "កំពុងដំណើរការ…" : "បង្កើតជាព្រាង"}
                </button>
                {onApproveAndConfirm && (
                  <button
                    type="button"
                    className="button primary btn-quick-confirm"
                    onClick={() => void onApproveAndConfirm({ deliveryAddress: deliveryAddress.trim() || undefined, deliveryFee, notes: notes.trim() || undefined })}
                    disabled={isBusy}
                    style={{ display: "inline-flex", alignItems: "center", gap: 6, fontWeight: 700 }}
                    title="អនុម័ត និងបញ្ជាក់ការបញ្ជាទិញភ្លាមៗ (CONFIRMED)"
                  >
                    <Zap size={14} /> {isBusy ? "កំពុងបញ្ជាក់…" : "⚡ បញ្ជាក់ភ្លាមៗ"}
                  </button>
                )}
              </div>
            </div>
          ) : suggestion.status === "APPROVED" ? (
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, color: "#16a34a", fontSize: 12, fontWeight: 600 }}>
                <CheckCircle2 size={16} /> បានបង្កើតការបញ្ជាទិញរួចរាល់
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                {onOpenOrder && (suggestion.order?.id || suggestion.orderId) && (
                  <button
                    type="button"
                    className="button primary tiny"
                    onClick={() => {
                      onClose();
                      onOpenOrder(suggestion.order?.id || suggestion.orderId!);
                    }}
                  >
                    <Package size={13} /> បើកការបញ្ជាទិញ #{suggestion.order?.orderNumber || ""}
                  </button>
                )}
                <button type="button" className="button" onClick={onClose}>
                  បិទ
                </button>
              </div>
            </div>
          ) : (
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%" }}>
              <div style={{ color: "#64748b", fontSize: 12 }}>
                ស្ថានភាព: <strong>{suggestionStatusNames[suggestion.status] ?? suggestion.status}</strong>
              </div>
              <button type="button" className="button" onClick={onClose}>
                បិទ
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function DetectionView({
  suggestions,
  products,
  focusedSuggestionId,
  onClearFocusedSuggestion,
  onNavigateToOrders,
  onOpenOrder,
}: {
  suggestions: Suggestion[];
  products: Product[];
  focusedSuggestionId?: string | null;
  onClearFocusedSuggestion?: () => void;
  onNavigateToOrders?: () => void;
  onOpenOrder?: (orderId: string) => void;
}) {
  const notify = useToast();
  const [items, setItems] = useState(suggestions);
  const [editedItems, setEditedItems] = useState<Record<string, Suggestion["items"]>>({});
  const [failedJobs, setFailedJobs] = useState<{ id: string; failure: string | null; attempts: number; customer: string }[]>([]);
  const [error, setError] = useState("");
  const [telegramModalOpen, setTelegramModalOpen] = useState(false);
  const [reloading, setReloading] = useState(false);
  const [statusFilter, setStatusFilter] = useState("ទាំងអស់");
  const [channelFilter, setChannelFilter] = useState("ទាំងអស់");
  const [confidenceFilter, setConfidenceFilter] = useState("ទាំងអស់");
  const [search, setSearch] = useState("");
  const [selectedSuggestionId, setSelectedSuggestionId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [busyId, setBusyId] = useState("");

  useEffect(() => {
    if (focusedSuggestionId) {
      setSelectedSuggestionId(focusedSuggestionId);
      if (onClearFocusedSuggestion) onClearFocusedSuggestion();
    }
  }, [focusedSuggestionId, onClearFocusedSuggestion]);

  async function reloadSuggestions() {
    setReloading(true);
    try {
      const response = await fetch("/api/suggestions");
      const data = await response.json();
      if (response.ok && Array.isArray(data.suggestions)) {
        setItems(data.suggestions);
        notify({ kind: "success", title: "បានផ្ទុកសំណើ AI ថ្មី", description: `សរុប ${khmerNumber(data.suggestions.length)} សំណើ` });
      }
    } catch {
      // ignore
    } finally {
      setReloading(false);
    }
  }

  useEffect(() => {
    let live = true;
    fetch("/api/detection-jobs").then(async (response) => {
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Unable to load failed jobs.");
      if (live) setFailedJobs(data.jobs);
    }).catch((cause: unknown) => {
      if (live) setError(cause instanceof Error ? cause.message : "Unable to load failed jobs.");
    });
    return () => { live = false; };
  }, []);

  useEffect(() => {
    setPage(1);
  }, [search, statusFilter, channelFilter, confidenceFilter]);

  async function review(suggestion: Suggestion, decision: "NOT_AN_ORDER" | "DISMISSED" | "DUPLICATE") {
    setBusyId(suggestion.id);
    setError("");
    try {
      const response = await fetch(`/api/suggestions/${suggestion.id}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "មិនអាចរក្សាទុកការពិនិត្យបានទេ។");
      setItems((old) => old.map((item) => (item.id === suggestion.id ? { ...item, status: decision } : item)));
      notify({
        kind: "info",
        title: "បានធ្វើបច្ចុប្បន្នភាព",
        description: `បានផ្លាស់ប្ដូរស្ថានភាពទៅជា ${suggestionStatusNames[decision] ?? decision}`,
      });
      if (selectedSuggestionId === suggestion.id) {
        setSelectedSuggestionId(null);
      }
    } catch (cause) {
      const msg = cause instanceof Error ? cause.message : "មិនអាចរក្សាទុកការពិនិត្យបានទេ។";
      setError(msg);
      notify({ kind: "error", title: "មានបញ្ហា", description: msg });
    } finally {
      setBusyId("");
    }
  }

  async function createDraft(
    suggestion: Suggestion,
    extra?: { deliveryAddress?: string; deliveryFee?: number; notes?: string }
  ) {
    const selectedItems = editedItems[suggestion.id] ?? suggestion.items;
    if (
      !selectedItems.length ||
      selectedItems.some((item) => {
        const product = products.find((entry) => entry.id === item.productId);
        return !product || (product.variants.length > 0 && !item.variantId);
      })
    ) {
      setSelectedSuggestionId(suggestion.id);
      notify({
        kind: "info",
        title: "សូមផ្គូផ្គងផលិតផលសិន",
        description: "សូមជ្រើសរើសផលិតផល និងជម្រើសក្នុងបញ្ជីឱ្យបានត្រឹមត្រូវ មុនពេលបង្កើតសេចក្ដីព្រាង។",
      });
      return;
    }
    setBusyId(suggestion.id);
    setError("");
    try {
      const response = await fetch(`/api/suggestions/${suggestion.id}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          decision: "APPROVE_AS_DRAFT",
          items: selectedItems.map((item) => ({
            productId: item.productId,
            variantId: item.variantId ?? undefined,
            quantity: item.quantity,
          })),
          deliveryAddress: extra?.deliveryAddress,
          deliveryFee: extra?.deliveryFee,
          notes: extra?.notes,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "មិនអាចបង្កើតសេចក្ដីព្រាងការបញ្ជាទិញបានទេ។");
      const updatedOrder = data.orderNumber
        ? {
            id: data.orderId,
            orderNumber: data.orderNumber,
            status: "DRAFT",
            total: data.total ?? 0,
            createdAt: new Date().toISOString(),
          }
        : null;
      setItems((old) =>
        old.map((item) =>
          item.id === suggestion.id
            ? {
                ...item,
                status: "APPROVED",
                orderId: data.orderId,
                order: updatedOrder ?? item.order,
              }
            : item
        )
      );
      notify({
        kind: "success",
        title: "បានបង្កើតសេចក្ដីព្រាង",
        description: `បានបង្កើតសេចក្ដីព្រាងការបញ្ជាទិញសម្រាប់ ${suggestion.customer} រួចរាល់`,
      });
      if (selectedSuggestionId === suggestion.id) {
        setSelectedSuggestionId(null);
      }
    } catch (cause) {
      const msg = cause instanceof Error ? cause.message : "មិនអាចបង្កើតសេចក្ដីព្រាងការបញ្ជាទិញបានទេ។";
      setError(msg);
      notify({ kind: "error", title: "មានបញ្ហា", description: msg });
    } finally {
      setBusyId("");
    }
  }

  async function approveAndConfirm(
    suggestion: Suggestion,
    extra?: { deliveryAddress?: string; deliveryFee?: number; notes?: string }
  ) {
    const selectedItems = editedItems[suggestion.id] ?? suggestion.items;
    if (
      !selectedItems.length ||
      selectedItems.some((item) => {
        const product = products.find((entry) => entry.id === item.productId);
        return !product || (product.variants.length > 0 && !item.variantId);
      })
    ) {
      setSelectedSuggestionId(suggestion.id);
      notify({
        kind: "info",
        title: "សូមផ្គូផ្គងផលិតផលសិន",
        description: "សូមជ្រើសរើសផលិតផល និងជម្រើសក្នុងបញ្ជីឱ្យបានត្រឹមត្រូវ មុនពេលបញ្ជាក់ការបញ្ជាទិញ។",
      });
      return;
    }
    setBusyId(suggestion.id);
    setError("");
    try {
      const response = await fetch(`/api/suggestions/${suggestion.id}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          decision: "APPROVE_AND_CONFIRM",
          items: selectedItems.map((item) => ({
            productId: item.productId,
            variantId: item.variantId ?? undefined,
            quantity: item.quantity,
          })),
          deliveryAddress: extra?.deliveryAddress,
          deliveryFee: extra?.deliveryFee,
          notes: extra?.notes,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "មិនអាចបញ្ជាក់ការបញ្ជាទិញបានទេ។");
      const updatedOrder = data.orderNumber
        ? {
            id: data.orderId,
            orderNumber: data.orderNumber,
            status: "CONFIRMED",
            total: data.total ?? 0,
            createdAt: new Date().toISOString(),
          }
        : null;
      setItems((old) =>
        old.map((item) =>
          item.id === suggestion.id
            ? {
                ...item,
                status: "APPROVED",
                orderId: data.orderId,
                order: updatedOrder ?? item.order,
              }
            : item
        )
      );
      notify({
        kind: "success",
        title: "បានបញ្ជាក់ការបញ្ជាទិញរួចរាល់! 🎉",
        description: `ការបញ្ជាទិញ #${data.orderNumber ?? ""} ត្រូវបានបញ្ជាក់ និងបញ្ចូលក្នុងបញ្ជីការបញ្ជាទិញ`,
      });
      if (selectedSuggestionId === suggestion.id) {
        setSelectedSuggestionId(null);
      }
    } catch (cause) {
      const msg = cause instanceof Error ? cause.message : "មិនអាចបញ្ជាក់ការបញ្ជាទិញបានទេ។";
      setError(msg);
      notify({ kind: "error", title: "មានបញ្ហា", description: msg });
    } finally {
      setBusyId("");
    }
  }

  async function retry(jobId: string) {
    setError("");
    try {
      const response = await fetch("/api/detection-jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "មិនអាចសាកល្បងរកឃើញម្ដងទៀតបានទេ។");
      setFailedJobs((old) => old.filter((job) => job.id !== jobId));
      notify({ kind: "success", title: "បានបញ្ជូនការងារសាកល្បងម្ដងទៀត" });
    } catch (cause) {
      const msg = cause instanceof Error ? cause.message : "មិនអាចសាកល្បងរកឃើញម្ដងទៀតបានទេ។";
      setError(msg);
      notify({ kind: "error", title: "មានបញ្ហា", description: msg });
    }
  }

  const pendingCount = items.filter((i) => i.status === "PENDING").length;
  const highConfidenceCount = items.filter((i) => i.confidence >= 85).length;
  const approvedCount = items.filter((i) => i.status === "APPROVED").length;
  const dismissedCount = items.filter((i) => ["NOT_AN_ORDER", "DISMISSED", "DUPLICATE"].includes(i.status)).length;

  const filteredItems = items.filter((item) => {
    if (statusFilter === "រង់ចាំពិនិត្យ" && item.status !== "PENDING") return false;
    if (statusFilter === "បានអនុម័ត" && item.status !== "APPROVED") return false;
    if (statusFilter === "បដិសេធ / ស្ទួន" && !["NOT_AN_ORDER", "DISMISSED", "DUPLICATE"].includes(item.status)) return false;
    if (channelFilter !== "ទាំងអស់" && item.channel !== channelFilter) return false;
    if (confidenceFilter === "HIGH" && item.confidence < 80) return false;
    if (confidenceFilter === "MEDIUM" && (item.confidence < 60 || item.confidence >= 80)) return false;
    if (confidenceFilter === "LOW" && item.confidence >= 60) return false;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      const nameMatch = item.customer.toLowerCase().includes(q);
      const itemMatch = item.items.some((it) => it.productName.toLowerCase().includes(q));
      const msgMatch = item.messages.some((m) => m.body.toLowerCase().includes(q));
      if (!nameMatch && !itemMatch && !msgMatch) return false;
    }
    return true;
  });

  const totalPages = Math.max(1, Math.ceil(filteredItems.length / pageSize));
  const paginatedItems = filteredItems.slice((page - 1) * pageSize, page * pageSize);
  const selectedSuggestion = items.find((item) => item.id === selectedSuggestionId) ?? null;

  return (
    <>
      <PageHeading
        title="ការរកឃើញការបញ្ជាទិញដោយ AI"
        description="ពិនិត្យសំណើទិញដែលមានភស្តុតាងគាំទ្រពី Telegram, Facebook & TikTok។ AI មិនបញ្ជាក់ ឬបង្កើតការបញ្ជាទិញដោយខ្លួនឯងទេ។"
        action={
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            {onNavigateToOrders && (
              <button
                type="button"
                className="button"
                onClick={onNavigateToOrders}
                style={{ background: "#f8fafc", color: "#334155", borderColor: "#cbd5e1", fontWeight: 600 }}
              >
                <ShoppingCart size={14} /> ទៅកាន់បញ្ជីការបញ្ជាទិញ →
              </button>
            )}
            <button className="button primary" onClick={() => setTelegramModalOpen(true)}>
              <MediaIcon channel="TELEGRAM" size={14} /> សាកល្បងសារ Telegram
            </button>
            <button
              className="button"
              onClick={() => void reloadSuggestions()}
              disabled={reloading}
              title="ផ្ទុកសំណើ AI ឡើងវិញ"
            >
              <RefreshCw size={13} className={reloading ? "login-spinner" : ""} /> ផ្ទុកឡើងវិញ
            </button>
          </div>
        }
      />

      {/* AI Command Center Hero Banner */}
      <div className="ai-command-hero">
        <div className="ai-engine-info">
          <div className="ai-status-pulse">
            <span className="pulse-dot-green"></span>
            <span>SOM Cambodia AI Engine: សកម្ម (Active 24/7)</span>
          </div>
          <p className="ai-engine-subtitle">
            ម៉ូដែលវិភាគភាសាខ្មែរឆ្លាតវៃ ស្រង់លេខទូរស័ព្ទកម្ពុជា ទីតាំងខេត្ត/ក្រុង និងបម្លែងសារពី Telegram & Social ទៅជាការបញ្ជាទិញដោយស្វ័យប្រវត្តិ។
          </p>
        </div>
      </div>

      {/* AI Command Center KPI Tiles */}
      <div className="ai-kpi-grid">
        <div className="ai-kpi-card">
          <div className="ai-kpi-icon" style={{ background: "#fef3c7", color: "#d97706" }}>
            <Clock3 size={20} />
          </div>
          <div className="ai-kpi-content">
            <small>រង់ចាំពិនិត្យ</small>
            <strong>{khmerNumber(pendingCount)}</strong>
          </div>
        </div>
        <div className="ai-kpi-card">
          <div className="ai-kpi-icon" style={{ background: "#dcfce7", color: "#16a34a" }}>
            <ShieldCheck size={20} />
          </div>
          <div className="ai-kpi-content">
            <small>ភាពត្រឹមត្រូវខ្ពស់ (≥ 85%)</small>
            <strong>{khmerNumber(highConfidenceCount)}</strong>
          </div>
        </div>
        <div className="ai-kpi-card">
          <div className="ai-kpi-icon" style={{ background: "#eff6ff", color: "#2563eb" }}>
            <CheckCircle2 size={20} />
          </div>
          <div className="ai-kpi-content">
            <small>បានបង្កើតសេចក្ដីព្រាង</small>
            <strong>{khmerNumber(approvedCount)}</strong>
          </div>
        </div>
        <div className="ai-kpi-card">
          <div className="ai-kpi-icon" style={{ background: "#f3e8ff", color: "#9333ea" }}>
            <MessageSquareText size={20} />
          </div>
          <div className="ai-kpi-content">
            <small>សារសរុបដែលបានវិភាគ</small>
            <strong>{khmerNumber(items.length)}</strong>
          </div>
        </div>
      </div>

      {/* Toolbar & Filter Tabs */}
      <div className="section-toolbar" style={{ marginBottom: 16 }}>
        <div className="segment-bar">
          {[
            { label: "ទាំងអស់", count: items.length },
            { label: "រង់ចាំពិនិត្យ", count: pendingCount },
            { label: "បានអនុម័ត", count: approvedCount },
            { label: "បដិសេធ / ស្ទួន", count: dismissedCount },
          ].map((tab) => (
            <button
              key={tab.label}
              className={`segment-button ${statusFilter === tab.label ? "selected" : ""}`}
              onClick={() => setStatusFilter(tab.label)}
            >
              {tab.label} ({khmerNumber(tab.count)})
            </button>
          ))}
        </div>
        <div className="toolbar" style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <label className="input-wrap" style={{ minWidth: 240 }}>
            <Search size={14} />
            <input
              placeholder="ស្វែងរកតាមឈ្មោះ ទំនិញ ឬខ្លឹមសារសារ…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
          <select
            className="select"
            value={channelFilter}
            onChange={(e) => setChannelFilter(e.target.value)}
            aria-label="ច្រោះតាមបណ្ដាញ"
          >
            <option value="ទាំងអស់">គ្រប់បណ្ដាញ</option>
            <option value="TELEGRAM">តេលេក្រាម (Telegram)</option>
            <option value="FACEBOOK">ហ្វេសប៊ុក (Facebook)</option>
            <option value="TIKTOK">ធីកតុក (TikTok)</option>
          </select>
          <select
            className="select"
            value={confidenceFilter}
            onChange={(e) => setConfidenceFilter(e.target.value)}
            aria-label="ច្រោះតាមកម្រិតភាពជឿជាក់"
          >
            <option value="ទាំងអស់">គ្រប់កម្រិតភាពជឿជាក់</option>
            <option value="HIGH">ភាពជឿជាក់ខ្ពស់ (≥ 80%)</option>
            <option value="MEDIUM">ភាពជឿជាក់មធ្យម (60% - 79%)</option>
            <option value="LOW">ភាពជឿជាក់ទាប (&lt; 60%)</option>
          </select>
        </div>
      </div>

      {error && <div className="error-banner" style={{ marginBottom: 16 }}>{error}</div>}

      {failedJobs.length > 0 && (
        <Panel
          title="ការងារវិភាគដែលត្រូវសាកល្បងម្ដងទៀត"
          description="សារត្រូវបានរក្សាទុកដោយសុវត្ថិភាព។ សាកល្បងវិភាគម្ដងទៀត នៅពេលកម្មវិធីដំណើរការ ឬអ្នកផ្ដល់សេវា AI អាចប្រើបាន។"
        >
          <div className="failed-jobs">
            {failedJobs.map((job) => (
              <div className="failed-job" key={job.id}>
                <div>
                  <strong>{job.customer}</strong>
                  <small>
                    {job.failure || "ការរកឃើញបរាជ័យ"} · បានសាកល្បង {khmerNumber(job.attempts)} ដង
                  </small>
                </div>
                <button className="button" onClick={() => void retry(job.id)}>
                  សាកល្បងម្ដងទៀត
                </button>
              </div>
            ))}
          </div>
        </Panel>
      )}

      {/* AI Suggestions DataTable */}
      {filteredItems.length ? (
        <section className="panel detection-table-panel">
          <div className="table-wrap">
            <table className="data-table detection-table">
              <thead>
                <tr>
                  <th>អតិថិជន &amp; បណ្ដាញ</th>
                  <th>មុខទំនិញដែលបានស្រង់</th>
                  <th>តម្លៃប៉ាន់ស្មាន</th>
                  <th>បំណង</th>
                  <th>ភាពជឿជាក់</th>
                  <th>កាលបរិច្ឆេទ</th>
                  <th>ស្ថានភាព</th>
                  <th className="actions-header" style={{ textAlign: "right" }}>សកម្មភាព</th>
                </tr>
              </thead>
              <tbody>
                {paginatedItems.map((item) => {
                  const extracted = editedItems[item.id] ?? item.items;
                  const confidenceClass =
                    item.confidence >= 80 ? "high" : item.confidence >= 60 ? "medium" : "low";

                  // Calculate estimated total from catalogue products
                  const totalAmount = extracted.reduce((sum, it) => {
                    const prod = products.find((p) => p.id === it.productId);
                    if (!prod) return sum;
                    const variant = prod.variants.find((v) => v.id === it.variantId);
                    const price = variant?.price ?? prod.price ?? 0;
                    return sum + price * it.quantity;
                  }, 0);

                  const allMapped = extracted.length > 0 && extracted.every((it) => {
                    const prod = products.find((p) => p.id === it.productId);
                    return prod && (!prod.variants.length || Boolean(it.variantId));
                  });

                  return (
                    <tr
                      key={item.id}
                      className="clickable-row"
                      onClick={() => setSelectedSuggestionId(item.id)}
                    >
                      {/* Customer & Channel */}
                      <td>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <span
                            className="avatar small"
                            style={{
                              background: "#e0e7ff",
                              color: "#3730a3",
                              fontWeight: 700,
                              flexShrink: 0,
                            }}
                          >
                            {initials(item.customer)}
                          </span>
                          <div>
                            <strong style={{ fontSize: 13, color: "#0f172a", display: "block" }}>
                              {item.customer}
                            </strong>
                            <small
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: 4,
                                color: "#64748b",
                                fontSize: 11,
                                marginTop: 2,
                              }}
                            >
                              <MediaIcon channel={item.channel} size={12} />
                              {channelNames[item.channel] ?? item.channel}
                            </small>
                          </div>
                        </div>
                      </td>

                      {/* Detected Items */}
                      <td>
                        <div style={{ display: "flex", flexDirection: "column", gap: 4, maxWidth: 320 }}>
                          {extracted.slice(0, 3).map((it, idx) => {
                            const isMapped = Boolean(it.productId);
                            return (
                              <div
                                key={idx}
                                className={`detection-item-chip ${!isMapped ? "unmapped" : ""}`}
                              >
                                <span>{it.productName}</span>
                                {it.variantName && (
                                  <span style={{ fontSize: 10, color: "#64748b" }}>
                                    ({it.variantName})
                                  </span>
                                )}
                                <span className="detection-qty-tag">
                                  ×{khmerNumber(it.quantity)}
                                </span>
                                {!isMapped && (
                                  <span style={{ fontSize: 10, color: "#d97706", fontWeight: 700 }}>
                                    ⚠️ មិនទាន់ផ្គូផ្គង
                                  </span>
                                )}
                              </div>
                            );
                          })}
                          {extracted.length > 3 && (
                            <small style={{ color: "#64748b", fontSize: 10 }}>
                              + {khmerNumber(extracted.length - 3)} មុខទំនិញទៀត…
                            </small>
                          )}
                          {item.missingInfo.length > 0 && (
                            <small
                              style={{
                                color: "#d97706",
                                fontSize: 10,
                                display: "inline-flex",
                                alignItems: "center",
                                gap: 3,
                                marginTop: 1,
                              }}
                            >
                              <AlertCircle size={10} /> ខ្វះ{item.missingInfo.map((m) => (m === "Delivery address" ? "អាសយដ្ឋាន" : m)).join(", ")}
                            </small>
                          )}
                        </div>
                      </td>

                      {/* Estimated Total */}
                      <td>
                        {totalAmount > 0 ? (
                          <div>
                            <strong style={{ fontSize: 13, color: "#16846e", display: "block" }}>
                              {formatUSD(totalAmount)}
                            </strong>
                            <small style={{ fontSize: 11, color: "#64748b" }}>
                              {formatKHR(usdToKhr(totalAmount))}
                            </small>
                          </div>
                        ) : (
                          <span style={{ color: "#94a3b8", fontSize: 12 }}>—</span>
                        )}
                      </td>

                      {/* Intent */}
                      <td>
                        <Badge
                          value={intentNames[item.intent] ?? item.intent}
                          className={
                            item.intent === "PURCHASE_CONFIRMED"
                              ? "blue"
                              : item.intent === "PURCHASE_INTENT"
                              ? "amber"
                              : "default"
                          }
                        />
                      </td>

                      {/* Confidence */}
                      <td>
                        <span className={`confidence-pill ${confidenceClass}`} style={{ fontSize: 11, padding: "2px 8px" }}>
                          <Sparkles size={11} /> {khmerNumber(item.confidence)}%
                        </span>
                      </td>

                      {/* Created At */}
                      <td>
                        <small style={{ color: "#64748b", fontSize: 11 }}>
                          {dateLabel(item.createdAt)}
                        </small>
                      </td>

                      {/* Status & Linked Order */}
                      <td>
                        <Badge
                          value={suggestionStatusNames[item.status] ?? item.status}
                          className={
                            item.status === "PENDING"
                              ? "amber"
                              : item.status === "APPROVED"
                              ? "green"
                              : "default"
                          }
                        />
                        {(item.order || item.orderId) && (
                          <div style={{ marginTop: "4px" }}>
                            <button
                              type="button"
                              className="linked-order-pill"
                              title="ចុចដើម្បីបើកមើលការបញ្ជាទិញនេះ"
                              onClick={(e) => {
                                e.stopPropagation();
                                if (onOpenOrder && (item.order?.id || item.orderId)) {
                                  onOpenOrder(item.order?.id || item.orderId!);
                                } else if (onNavigateToOrders) {
                                  onNavigateToOrders();
                                }
                              }}
                            >
                              <Package size={11} /> #{item.order?.orderNumber || "ការបញ្ជាទិញ"}
                            </button>
                          </div>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="actions-cell" onClick={(e) => e.stopPropagation()}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 5 }}>
                          <button
                            type="button"
                            className="button subtle tiny"
                            onClick={() => setSelectedSuggestionId(item.id)}
                            title="ពិនិត្យលម្អិត និងកែប្រែ"
                            style={{ display: "inline-flex", alignItems: "center", gap: 3, padding: "4px 8px", fontSize: 11 }}
                          >
                            <Eye size={12} /> ពិនិត្យ
                          </button>
                          {item.status === "PENDING" && (
                            <>
                              <button
                                type="button"
                                className="button tiny"
                                onClick={() => void createDraft(item)}
                                disabled={busyId === item.id}
                                title={allMapped ? "បង្កើតសេចក្ដីព្រាងការបញ្ជាទិញ" : "ផ្គូផ្គងផលិតផលដើម្បីបង្កើតសេចក្ដីព្រាង"}
                                style={{ display: "inline-flex", alignItems: "center", gap: 3, padding: "4px 8px", fontSize: 11, background: "#f8fafc", color: "#334155" }}
                              >
                                <Edit2 size={11} /> ព្រាង
                              </button>
                              <button
                                type="button"
                                className="button tiny btn-quick-confirm"
                                onClick={() => void approveAndConfirm(item)}
                                disabled={busyId === item.id}
                                title={allMapped ? "បញ្ជាក់ភ្លាមៗ និងបង្កើតការបញ្ជាទិញ" : "ផ្គូផ្គងផលិតផលដើម្បីបញ្ជាក់"}
                                style={{ display: "inline-flex", alignItems: "center", gap: 3, padding: "4px 8px", fontSize: 11 }}
                              >
                                <Zap size={11} /> {busyId === item.id ? "…" : "បញ្ជាក់ភ្លាមៗ"}
                              </button>
                            </>
                          )}
                          {item.status === "APPROVED" && (
                            <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                              {item.orderId ? (
                                <button
                                  type="button"
                                  className="linked-order-pill"
                                  onClick={() => {
                                    if (onOpenOrder && (item.order?.id || item.orderId)) {
                                      onOpenOrder(item.order?.id || item.orderId!);
                                    }
                                  }}
                                  title="បើកមើលការបញ្ជាទិញ"
                                >
                                  <CheckCircle2 size={11} /> #{item.order?.orderNumber || "ការបញ្ជាទិញ"}
                                </button>
                              ) : (
                                <span
                                  style={{
                                    fontSize: 11,
                                    color: "#16a34a",
                                    display: "inline-flex",
                                    alignItems: "center",
                                    gap: 3,
                                    fontWeight: 600,
                                  }}
                                >
                                  <CheckCircle2 size={13} /> បានអនុម័ត
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Table Footer / Pagination */}
          <DataTablePagination
            currentPage={page}
            totalPages={totalPages}
            totalItems={filteredItems.length}
            pageSize={pageSize}
            onPageChange={(p) => setPage(p)}
            onPageSizeChange={(newSize) => {
              setPageSize(newSize);
              setPage(1);
            }}
            itemName="សំណើ AI"
          />
        </section>
      ) : (
        <section className="panel empty-state">
          <strong>មិនមានសំណើ AI ត្រូវនឹងលក្ខខណ្ឌស្វែងរកទេ</strong>
          សាកល្បងជ្រើសរើសផ្ទាំងស្ថានភាពផ្សេង ឬចុច &quot;សាកល្បងសារ Telegram&quot; ដើម្បីសាកល្បងម៉ាស៊ីន AI។
        </section>
      )}

      {/* Review Drawer Modal */}
      {selectedSuggestion && (
        <SuggestionReviewDrawer
          suggestion={selectedSuggestion}
          products={products}
          currentItems={editedItems[selectedSuggestion.id] ?? selectedSuggestion.items}
          onItemsChange={(newItems) => {
            setEditedItems((old) => ({ ...old, [selectedSuggestion.id]: newItems }));
          }}
          onApprove={(extra) => createDraft(selectedSuggestion, extra)}
          onApproveAndConfirm={(extra) => approveAndConfirm(selectedSuggestion, extra)}
          onReview={(decision) => review(selectedSuggestion, decision)}
          onClose={() => setSelectedSuggestionId(null)}
          onOpenOrder={onOpenOrder}
          isBusy={busyId === selectedSuggestion.id}
        />
      )}

      {telegramModalOpen && (
        <TelegramTestModal
          close={() => setTelegramModalOpen(false)}
          onDetected={() => void reloadSuggestions()}
        />
      )}
    </>
  );
}

function formatChatMessageText(text: string | null | undefined): string {
  if (!text) return "";
  let clean = text.trim();
  // Detect corrupted encoding or pure question marks (e.g. "???????" or "???????????????????")
  if (/^[\?\s\uFFFD\u0000-\u001F]+$/.test(clean) && clean.length >= 2) {
    return "💬 [សំណួរពីអតិថិជន / Customer Inquiry]";
  }
  // Strip raw base64 data URLs from the display text so it doesn't flood the UI
  clean = clean.replace(/🖼️\s*រូបភាព[៖:]\s*data:image\/[a-zA-Z0-9+/=;,-]+/gi, "");
  clean = clean.replace(/data:image\/[a-zA-Z0-9+/=;,-]+/gi, "");
  clean = clean.replace(/\n{3,}/g, "\n\n").trim();
  return clean || text;
}

function renderChatMessageContent(text: string | null | undefined) {
  if (!text) return "";
  // Extract image URL from markdown or 🖼️ text or direct URL before stripping
  const imgMatch = text.match(/(?:🖼️\s*រូបភាព[៖:]\s*|\!\[.*?\]\()?(https?:\/\/[^\s\n\)]+(?:\.(?:jpg|jpeg|png|webp|gif)|images\.unsplash\.com[^\s\n\)]*)|data:image\/[a-z]+;base64,[^\s\n\)]+)/i);
  const imageUrl = imgMatch ? imgMatch[1] : null;
  const formatted = formatChatMessageText(text);

  return (
    <div className="chat-bubble-content">
      <div style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{formatted}</div>
      {imageUrl && (
        <div style={{ marginTop: 8, borderRadius: 8, overflow: "hidden", maxWidth: 220, border: "1px solid rgba(0,0,0,0.1)", background: "#fff", boxShadow: "0 2px 6px rgba(0,0,0,0.06)" }}>
          <img
            src={imageUrl}
            alt="Product"
            style={{ width: "100%", maxHeight: 150, objectFit: "cover", display: "block" }}
            onError={(e) => { (e.currentTarget as HTMLElement).style.display = "none"; }}
          />
        </div>
      )}
    </div>
  );
}

function ConversationsView({ conversations, customers, simulatorEnabled, focusedConversationId }: {
  conversations: Conversation[]; customers: Customer[]; simulatorEnabled: boolean; focusedConversationId: string;
}) {
  const [selected, setSelected] = useState(focusedConversationId || conversations[0]?.id || "");
  const [searchTerm, setSearchTerm] = useState("");
  const [focusedConversation, setFocusedConversation] = useState<Conversation | null>(null);
  const [threadState, setThreadState] = useState<{ id: string; messages: Conversation["messages"] } | null>(null);
  const [threadLoadingId, setThreadLoadingId] = useState(focusedConversationId || conversations[0]?.id || "");
  const [threadError, setThreadError] = useState("");
  const [threadRevision, setThreadRevision] = useState(0);
  const [message, setMessage] = useState("");
  const [customerId, setCustomerId] = useState(customers[0]?.id ?? "");
  const [channel, setChannel] = useState("FACEBOOK");
  const [simError, setSimError] = useState("");
  const [sending, setSending] = useState(false);
  const simulatorConversationIds = useRef(new Map<string, string>());
  const router = useRouter();

  const filteredConversations = useMemo(() => {
    if (!searchTerm.trim()) return conversations;
    const q = searchTerm.trim().toLowerCase();
    return conversations.filter(
      (c) =>
        c.customer.toLowerCase().includes(q) ||
        (c.lastMessage && c.lastMessage.toLowerCase().includes(q))
    );
  }, [conversations, searchTerm]);

  const current = conversations.find((item) => item.id === selected)
    ?? (focusedConversation?.id === selected ? focusedConversation : undefined);
  const thread = threadState?.id === selected ? threadState.messages : [];
  const threadLoading = threadLoadingId === selected;
  useEffect(() => {
    if (!selected) return;
    let active = true;
    fetch(`/api/conversations/${encodeURIComponent(selected)}`, { cache: "no-store" })
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok) throw new Error(result.error ?? "មិនអាចផ្ទុកសារបានទេ។");
        const conversation = result.conversation;
        const latestMessage = conversation.messages[0];
        if (active) {
          setFocusedConversation({
            id: conversation.id,
            customer: conversation.customer?.name ?? "អតិថិជនមិនស្គាល់",
            customerId: conversation.customerId,
            channel: conversation.channel,
            externalId: conversation.externalId,
            lastMessage: latestMessage?.body ?? "ការសន្ទនា",
            lastMessageAt: conversation.lastMessageAt,
            messages: [],
          });
        }
        return conversation.messages as { id: string; body: string; senderName: string | null; senderType: string; sentAt: string }[];
      })
      .then((messages) => {
        if (active) setThreadState({
          id: selected,
          messages: messages.reverse().map((entry) => ({
            id: entry.id,
            body: entry.body,
            sender: entry.senderName ?? (entry.senderType === "SELLER" ? "អ្នកលក់" : "អតិថិជន"),
            senderType: entry.senderType,
            sentAt: entry.sentAt,
          })),
        });
      })
      .catch((error: unknown) => {
        if (active) setThreadError(error instanceof Error ? error.message : "មិនអាចផ្ទុកសារបានទេ។");
      })
      .finally(() => {
        if (active) setThreadLoadingId((id) => id === selected ? "" : id);
      });
    return () => { active = false; };
  }, [selected, threadRevision]);
  async function simulate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSimError(""); setSending(true);
    const conversationKey = `${customerId}:${channel}`;
    if (!simulatorConversationIds.current.has(conversationKey)) simulatorConversationIds.current.set(conversationKey, crypto.randomUUID());
    const externalConversationId = current?.customerId === customerId && current.channel === channel
      ? (current.externalId ?? current.id)
      : simulatorConversationIds.current.get(conversationKey);
    try {
      const response = await fetch("/api/simulator/messages", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customerId, channel, body: message, senderType: "CUSTOMER", externalConversationId }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "មិនអាចរក្សាទុកសារសាកល្បងបានទេ។");
      setMessage(""); router.refresh(); setThreadLoadingId(selected); setThreadRevision((revision) => revision + 1);
    } catch (cause) { setSimError(cause instanceof Error ? cause.message : "មិនអាចរក្សាទុកសារសាកល្បងបានទេ។"); }
    finally { setSending(false); }
  }
  return <>
    <PageHeading title="ការសន្ទនា" description="មើលបរិបទអតិថិជនជាមួយការបញ្ជាទិញ និងការពិនិត្យសំណើនៅកន្លែងតែមួយ។" />
    {conversations.length ? (
      <section className="panel inbox-panel">
        <div className="conversation-sidebar">
          <div className="conversation-search-box">
            <Search size={13} style={{ color: "#94a3b8", flexShrink: 0 }} />
            <input
              type="text"
              placeholder="ស្វែងរកអតិថិជន ឬសារ…"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="conversation-search-input"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm("")}
                style={{ background: "none", border: "none", padding: 2, cursor: "pointer", color: "#94a3b8", display: "flex", alignItems: "center" }}
                title="សម្អាតការស្វែងរក"
              >
                <X size={12} />
              </button>
            )}
          </div>
          <div className="conversation-list">
            {filteredConversations.length > 0 ? (
              filteredConversations.map((conversation) => (
                <button
                  key={conversation.id}
                  onClick={() => {
                    if (selected !== conversation.id) {
                      setSelected(conversation.id);
                      setThreadLoadingId(conversation.id);
                      setThreadError("");
                    }
                  }}
                  className={`conversation-row ${selected === conversation.id ? "selected" : ""}`}
                >
                  <span className="avatar small">{initials(conversation.customer)}</span>
                  <span className="conversation-copy">
                    <strong>{conversation.customer}</strong>
                    <small>{formatChatMessageText(conversation.lastMessage)}</small>
                  </span>
                  <span className="conversation-meta">
                    <MediaBadge channel={conversation.channel} />
                    <small suppressHydrationWarning>{conversation.lastMessageAt ? dateLabel(conversation.lastMessageAt) : "—"}</small>
                  </span>
                </button>
              ))
            ) : (
              <div style={{ padding: "30px 16px", textAlign: "center", color: "#94a3b8", fontSize: "11.5px" }}>
                រកមិនឃើញការសន្ទនាត្រូវនឹង &quot;{searchTerm}&quot; ទេ
              </div>
            )}
          </div>
        </div>
        <div className="conversation-detail">
          {current ? (
            <>
              <div className="inbox-detail-head">
                <span className="avatar small">{initials(current.customer)}</span>
                <span>
                  <strong>{current.customer}</strong>
                  <small style={{ display: "inline-flex", alignItems: "center", gap: 5, marginTop: 2 }}>
                    <MediaIcon channel={current.channel} size={13} /> {channelNames[current.channel] ?? current.channel} · បានរក្សាទុក
                  </small>
                </span>
              </div>
              <div className="conversation-thread">
                {threadError && <div className="inline-error" role="alert">{threadError}</div>}
                {threadLoading && !thread.length && <div className="empty-state">កំពុងផ្ទុកសារ…</div>}
                {thread.map((entry) => (
                  <div className={`message-bubble ${entry.senderType === "SELLER" ? "seller" : ""}`} key={entry.id}>
                    <small>{entry.sender}</small>
                    {renderChatMessageContent(entry.body)}
                    <time suppressHydrationWarning>{dateTimeLabel(entry.sentAt)}</time>
                  </div>
                ))}
                {!threadLoading && !threadError && thread.length === 0 && <div className="empty-state">មិនទាន់មានសារកត់ត្រាទេ។</div>}
              </div>
              {simulatorEnabled ? (
                <form className="message-simulator" onSubmit={simulate}>
                  <div className="simulator-notice">
                    <Activity size={14} /> កម្មវិធីសាកល្បង · សារត្រូវបានសម្គាល់ថាជាសារសាកល្បង ហើយមិនត្រូវបានផ្ញើទៅខាងក្រៅទេ។
                  </div>
                  {simError && <div className="inline-error" role="alert">{simError}</div>}
                  <div className="toolbar">
                    <select className="select" value={customerId} onChange={(event) => setCustomerId(event.target.value)} required>
                      <option value="" disabled>ជ្រើសរើសអតិថិជន</option>
                      {customers.map((customer) => (
                        <option key={customer.id} value={customer.id}>{customer.name}</option>
                      ))}
                    </select>
                    <select className="select" value={channel} onChange={(event) => setChannel(event.target.value)}>
                      <option value="FACEBOOK">ហ្វេសប៊ុក</option>
                      <option value="TIKTOK">ធីកតុក</option>
                      <option value="TELEGRAM">តេលេក្រាម</option>
                    </select>
                  </div>
                  <div className="toolbar">
                    <input
                      value={message}
                      onChange={(event) => setMessage(event.target.value)}
                      maxLength={10000}
                      placeholder="សាកល្បងសារចូលពីអតិថិជន…"
                      required
                    />
                    <button className="button primary" disabled={sending || !customers.length}>
                      <Send size={13} /> {sending ? "កំពុងរក្សាទុក…" : "សាកល្បងផ្ញើ"}
                    </button>
                  </div>
                </form>
              ) : (
                <div className="simulator-notice">
                  <Activity size={14} /> មិនអាចផ្ញើសារបានទេ រហូតដល់បានកំណត់ការតភ្ជាប់បណ្ដាញដែលមានការអនុញ្ញាត។
                </div>
              )}
            </>
          ) : (
            <div className="empty-state">ជ្រើសរើសការសន្ទនាដើម្បីពិនិត្យ។</div>
          )}
        </div>
      </section>
    ) : (
      <section className="panel empty-state">
        <strong>មិនទាន់មានការសន្ទនាដែលបានរក្សាទុកទេ</strong>
        ភ្ជាប់បណ្ដាញដែលមានការអនុញ្ញាត ឬប្រើកម្មវិធីសាកល្បងនៅពេលបានកំណត់រួច។ មិនមានការអះអាងថាបានភ្ជាប់ទៅបណ្ដាញផ្ទាល់ទេ។
      </section>
    )}
  </>;
}

function SettingsView({
  storeInfo,
  onUpdateStore,
  role,
  currentUser,
  onProfileUpdated,
  onOpenLiveCf,
}: {
  storeInfo: {
    name: string;
    phone: string;
    address: string;
    bakongAccountId: string;
    exchangeRate: number;
  };
  onUpdateStore: (updated: {
    name: string;
    phone: string;
    address: string;
    bakongAccountId: string;
    exchangeRate: number;
  }) => void;
  role: string;
  currentUser: {
    name: string;
    role: string;
    avatarUrl?: string | null;
  };
  onProfileUpdated: (updated: { name: string; avatarUrl?: string | null }) => void;
  onOpenLiveCf?: () => void;
}) {
  const notify = useToast();
  const [formData, setFormData] = useState(storeInfo);
  const [savingStore, setSavingStore] = useState(false);
  const [storeError, setStoreError] = useState("");

  // Personal Profile State
  const [profileName, setProfileName] = useState(currentUser.name);
  const [profileAvatar, setProfileAvatar] = useState<string | null>(currentUser.avatarUrl ?? null);
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileError, setProfileError] = useState("");
  const [avatarUploading, setAvatarUploading] = useState(false);
  const profileFileInputRef = useRef<HTMLInputElement>(null);

  function handleProfileAvatarFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setProfileError("សូមជ្រើសរើសឯកសាររូបភាព (JPG, PNG, WebP)");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setProfileError("ទំហំរូបភាពមិនត្រូវលើសពី 5MB ឡើយ");
      return;
    }
    setAvatarUploading(true);
    setProfileError("");
    const reader = new FileReader();
    reader.onload = () => {
      const img = new window.Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const maxDim = 256;
        let w = img.width;
        let h = img.height;
        if (w > h) {
          if (w > maxDim) {
            h = Math.round((h * maxDim) / w);
            w = maxDim;
          }
        } else {
          if (h > maxDim) {
            w = Math.round((w * maxDim) / h);
            h = maxDim;
          }
        }
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.drawImage(img, 0, 0, w, h);
          setProfileAvatar(canvas.toDataURL("image/jpeg", 0.85));
        }
        setAvatarUploading(false);
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  }

  async function handleSaveProfile(e: FormEvent) {
    e.preventDefault();
    setSavingProfile(true);
    setProfileError("");
    try {
      const res = await fetch("/api/auth/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: profileName.trim(),
          avatarUrl: profileAvatar,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "មិនអាចកែប្រែប្រវត្តិរូបបានទេ។");
      onProfileUpdated({
        name: data.user.name,
        avatarUrl: data.user.avatarUrl,
      });
      notify({
        kind: "success",
        title: "បានរក្សាទុកប្រវត្តិរូបដោយជោគជ័យ",
        description: `ឈ្មោះ: ${data.user.name}`,
      });
    } catch (err) {
      setProfileError(err instanceof Error ? err.message : "មានបញ្ហាក្នុងការរក្សាទុក");
    } finally {
      setSavingProfile(false);
    }
  }

  // Telegram Integration State
  const [telegramInfo, setTelegramInfo] = useState<{
    connected: boolean;
    botUsername: string | null;
    botName: string | null;
    webhookUrl: string | null;
    autoReplyEnabled?: boolean;
    autoReplyStockCheck?: boolean;
    autoReplyOrderNotice?: boolean;
    telegramLiveInfo: any;
    webhookError?: string | null;
    hasWebhookError?: boolean;
    pendingCount?: number;
  } | null>(null);
  const [loadingTelegram, setLoadingTelegram] = useState(true);
  const [botTokenInput, setBotTokenInput] = useState("");
  const [customWebhookUrl, setCustomWebhookUrl] = useState("");
  const [testModalOpen, setTestModalOpen] = useState(false);
  const [telegramBusy, setTelegramBusy] = useState(false);
  const [telegramError, setTelegramError] = useState("");

  // Settings Navigation Tabs
  const [settingsTab, setSettingsTab] = useState<"store" | "channels" | "ai" | "security">("store");

  // Facebook Integration State
  const [fbPageName, setFbPageName] = useState("Davika Clothing Store");
  const [fbPageId, setFbPageId] = useState("104829104829104");
  const [fbAccessToken, setFbAccessToken] = useState("");
  const [fbLiveCfActive, setFbLiveCfActive] = useState(true);
  const [fbMessengerSync, setFbMessengerSync] = useState(true);
  const [fbConnected, setFbConnected] = useState(true);
  const [savingFb, setSavingFb] = useState(false);
  const [showFbToken, setShowFbToken] = useState(false);

  // TikTok Integration State
  const [tiktokShopId, setTiktokShopId] = useState("");
  const [tiktokAppKey, setTiktokAppKey] = useState("");
  const [tiktokAppSecret, setTiktokAppSecret] = useState("");
  const [tiktokLiveCfActive, setTiktokLiveCfActive] = useState(false);
  const [tiktokAutoSync, setTiktokAutoSync] = useState(false);
  const [tiktokConnected, setTiktokConnected] = useState(false);
  const [savingTiktok, setSavingTiktok] = useState(false);
  const [showTiktokSecret, setShowTiktokSecret] = useState(false);

  // AI Smart Auto-Reply State
  const [autoReplyEnabled, setAutoReplyEnabled] = useState(true);
  const [autoReplyStockCheck, setAutoReplyStockCheck] = useState(true);
  const [autoReplyOrderNotice, setAutoReplyOrderNotice] = useState(true);
  const [aiProvider, setAiProvider] = useState<string>("pattern");
  const [aiApiKey, setAiApiKey] = useState<string>("");
  const [aiModel, setAiModel] = useState<string>("");
  const [showAiApiKey, setShowAiApiKey] = useState(false);
  const [savingAutoReply, setSavingAutoReply] = useState(false);

  // Ollama AI State
  const [ollamaStatus, setOllamaStatus] = useState<{
    online: boolean;
    baseUrl: string;
    configuredModel: string;
    models: string[];
    message: string;
    activeProvider: string;
    skipped?: boolean;
  } | null>(null);
  const [loadingOllama, setLoadingOllama] = useState(true);

  // Load initial settings
  useEffect(() => {
    fetch("/api/telegram")
      .then((res) => res.json())
      .then((data) => {
        if (data && !data.error) {
          setTelegramInfo(data);
          if (data.autoReplyEnabled !== undefined) setAutoReplyEnabled(data.autoReplyEnabled);
          if (data.autoReplyStockCheck !== undefined) setAutoReplyStockCheck(data.autoReplyStockCheck);
          if (data.autoReplyOrderNotice !== undefined) setAutoReplyOrderNotice(data.autoReplyOrderNotice);
          if (data.aiProvider !== undefined) setAiProvider(data.aiProvider);
          if (data.aiApiKey !== undefined) setAiApiKey(data.aiApiKey);
          if (data.aiModel !== undefined) setAiModel(data.aiModel);
        }
      })
      .catch(() => {})
      .finally(() => setLoadingTelegram(false));

    fetch("/api/channels")
      .then((res) => res.json())
      .then((data) => {
        if (data?.channels) {
          const fb = data.channels.FACEBOOK;
          if (fb) {
            setFbConnected(fb.status === "CONNECTED");
            if (fb.metadata?.pageName) setFbPageName(fb.metadata.pageName);
            if (fb.metadata?.pageId) setFbPageId(fb.metadata.pageId);
            if (fb.metadata?.accessToken) setFbAccessToken(fb.metadata.accessToken);
            if (fb.metadata?.liveCfActive !== undefined) setFbLiveCfActive(fb.metadata.liveCfActive);
            if (fb.metadata?.messengerSync !== undefined) setFbMessengerSync(fb.metadata.messengerSync);
          }
          const tt = data.channels.TIKTOK;
          if (tt) {
            setTiktokConnected(tt.status === "CONNECTED");
            if (tt.metadata?.shopId) setTiktokShopId(tt.metadata.shopId);
            if (tt.metadata?.appKey) setTiktokAppKey(tt.metadata.appKey);
            if (tt.metadata?.appSecret) setTiktokAppSecret(tt.metadata.appSecret);
            if (tt.metadata?.liveCfActive !== undefined) setTiktokLiveCfActive(tt.metadata.liveCfActive);
            if (tt.metadata?.autoSync !== undefined) setTiktokAutoSync(tt.metadata.autoSync);
          }
        }
      })
      .catch(() => {});

    fetch("/api/ai/ollama")
      .then((res) => res.json())
      .then((data) => {
        if (data && !data.error) setOllamaStatus(data);
      })
      .catch(() => {})
      .finally(() => setLoadingOllama(false));
  }, []);

  function copyTextToClipboard(text: string, label: string) {
    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(text);
      notify({ kind: "success", title: `បានចម្លង ${label}!` });
    }
  }

  async function handleSaveFacebook(e?: FormEvent) {
    if (e) e.preventDefault();
    setSavingFb(true);
    try {
      const res = await fetch("/api/channels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          channel: "FACEBOOK",
          status: fbConnected ? "CONNECTED" : "NOT_CONNECTED",
          metadata: {
            pageName: fbPageName.trim(),
            pageId: fbPageId.trim(),
            accessToken: fbAccessToken.trim(),
            liveCfActive: fbLiveCfActive,
            messengerSync: fbMessengerSync,
          },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "បរាជ័យក្នុងការរក្សាទុក");
      notify({ kind: "success", title: "បានរក្សាទុកការកំណត់ Facebook & Live CF រួចរាល់" });
    } catch (err) {
      notify({ kind: "error", title: err instanceof Error ? err.message : "មានបញ្ហាក្នុងការរក្សាទុក" });
    } finally {
      setSavingFb(false);
    }
  }

  async function handleSaveTikTok(e?: FormEvent) {
    if (e) e.preventDefault();
    setSavingTiktok(true);
    try {
      const res = await fetch("/api/channels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          channel: "TIKTOK",
          status: tiktokConnected ? "CONNECTED" : "NOT_CONNECTED",
          metadata: {
            shopId: tiktokShopId.trim(),
            appKey: tiktokAppKey.trim(),
            appSecret: tiktokAppSecret.trim(),
            liveCfActive: tiktokLiveCfActive,
            autoSync: tiktokAutoSync,
          },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "បរាជ័យក្នុងការរក្សាទុក");
      notify({ kind: "success", title: "បានរក្សាទុកការកំណត់ TikTok Shop រួចរាល់" });
    } catch (err) {
      notify({ kind: "error", title: err instanceof Error ? err.message : "មានបញ្ហាក្នុងការរក្សាទុក" });
    } finally {
      setSavingTiktok(false);
    }
  }

  async function handleSaveAutoReply() {
    setSavingAutoReply(true);
    try {
      const res = await fetch("/api/telegram", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "save_settings",
          autoReplyEnabled,
          autoReplyStockCheck,
          autoReplyOrderNotice,
          aiProvider,
          aiApiKey: aiApiKey.trim(),
          aiModel: aiModel.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "មិនអាចរក្សាទុកការកំណត់បានទេ");
      notify({ kind: "success", title: "បានរក្សាទុកការកំណត់ម៉ាស៊ីន AI & ការឆ្លើយតបស្វ័យប្រវត្តិតាម AI រួចរាល់" });
    } catch (err) {
      notify({ kind: "error", title: err instanceof Error ? err.message : "មានបញ្ហាក្នុងការរក្សាទុក" });
    } finally {
      setSavingAutoReply(false);
    }
  }

  async function handleSaveStore(e: FormEvent) {
    e.preventDefault();
    setSavingStore(true);
    setStoreError("");
    try {
      const res = await fetch("/api/store", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: formData.name,
          phone: formData.phone || null,
          address: formData.address || null,
          bakongAccountId: formData.bakongAccountId || null,
          exchangeRate: Number(formData.exchangeRate) || 4100,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "មិនអាចរក្សាទុកព័ត៌មានហាងបានទេ។");
      onUpdateStore({
        name: data.store.name,
        phone: data.store.phone || "",
        address: data.store.address || "",
        bakongAccountId: data.store.bakongAccountId || "",
        exchangeRate: Number(data.store.exchangeRate || 4100),
      });
      notify({
        kind: "success",
        title: "បានរក្សាទុកព័ត៌មានហាងដោយជោគជ័យ",
        description: `ឈ្មោះហាង: ${data.store.name}`,
      });
    } catch (err) {
      setStoreError(err instanceof Error ? err.message : "មានបញ្ហាក្នុងការរក្សាទុក");
    } finally {
      setSavingStore(false);
    }
  }

  async function handleTelegramAction(action: "set_webhook" | "delete_webhook" | "check_status" | "sync_pending_updates") {
    if (!botTokenInput.trim() && action !== "delete_webhook" && action !== "sync_pending_updates") {
      setTelegramError("សូមបញ្ចូល Telegram Bot Token");
      return;
    }
    setTelegramBusy(true);
    setTelegramError("");
    const effectiveWebhookUrl =
      customWebhookUrl.trim() ||
      (typeof window !== "undefined"
        ? `${window.location.origin}/api/webhooks/telegram`
        : "");

    try {
      const res = await fetch("/api/telegram", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          botToken: botTokenInput.trim(),
          webhookUrl: effectiveWebhookUrl,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "បរាជ័យក្នុងការតភ្ជាប់ Telegram");
      notify({ kind: "success", title: data.message || "ជោគជ័យ" });

      const refreshRes = await fetch("/api/telegram");
      const refreshData = await refreshRes.json();
      if (refreshData && !refreshData.error) setTelegramInfo(refreshData);
    } catch (err) {
      setTelegramError(err instanceof Error ? err.message : "មានបញ្ហាក្នុងការតភ្ជាប់");
    } finally {
      setTelegramBusy(false);
    }
  }

  const defaultWebhook =
    typeof window !== "undefined"
      ? `${window.location.origin}/api/webhooks/telegram`
      : "/api/webhooks/telegram";

  const defaultFbWebhook =
    typeof window !== "undefined"
      ? `${window.location.origin}/api/webhooks/facebook`
      : "/api/webhooks/facebook";

  const defaultTiktokWebhook =
    typeof window !== "undefined"
      ? `${window.location.origin}/api/webhooks/tiktok`
      : "/api/webhooks/tiktok";

  return (
    <>
      <PageHeading
        title="ការកំណត់ហាង និងប្រព័ន្ធ"
        description="គ្រប់គ្រងឈ្មោះហាង លេខទូរស័ព្ទ បោះពុម្ពវិក្កយបត្រ ការតភ្ជាប់បណ្ដាញសង្គម (Facebook, TikTok, Telegram) និងម៉ាស៊ីន AI Detection។"
      />

      {/* Modern Redesigned Navigation Tabs */}
      <div
        style={{
          display: "flex",
          gap: "8px",
          background: "#f1f5f9",
          padding: "6px",
          borderRadius: "14px",
          marginBottom: "22px",
          flexWrap: "wrap",
          border: "1px solid #e2e8f0",
        }}
      >
        <button
          type="button"
          onClick={() => setSettingsTab("store")}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "7px",
            padding: "8px 16px",
            borderRadius: "9px",
            border: "none",
            fontSize: "12.5px",
            fontWeight: 700,
            cursor: "pointer",
            background: settingsTab === "store" ? "#ffffff" : "transparent",
            color: settingsTab === "store" ? "#1e293b" : "#64748b",
            boxShadow: settingsTab === "store" ? "0 2px 6px rgba(0,0,0,0.06)" : "none",
            transition: "all 0.15s ease",
          }}
        >
          <Package size={15} /> ព័ត៌មានហាង & គណនី
        </button>
        <button
          type="button"
          onClick={() => setSettingsTab("channels")}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "7px",
            padding: "8px 16px",
            borderRadius: "9px",
            border: "none",
            fontSize: "12.5px",
            fontWeight: 700,
            cursor: "pointer",
            background: settingsTab === "channels" ? "#ffffff" : "transparent",
            color: settingsTab === "channels" ? "#1877F2" : "#64748b",
            boxShadow: settingsTab === "channels" ? "0 2px 6px rgba(0,0,0,0.06)" : "none",
            transition: "all 0.15s ease",
          }}
        >
          <Radio size={15} /> បណ្ដាញលក់សង្គម (Facebook, TikTok, Telegram)
        </button>
        <button
          type="button"
          onClick={() => setSettingsTab("ai")}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "7px",
            padding: "8px 16px",
            borderRadius: "9px",
            border: "none",
            fontSize: "12.5px",
            fontWeight: 700,
            cursor: "pointer",
            background: settingsTab === "ai" ? "#ffffff" : "transparent",
            color: settingsTab === "ai" ? "#7c3aed" : "#64748b",
            boxShadow: settingsTab === "ai" ? "0 2px 6px rgba(0,0,0,0.06)" : "none",
            transition: "all 0.15s ease",
          }}
        >
          <Sparkles size={15} /> ម៉ាស៊ីន AI & ឆ្លើយតបស្វ័យប្រវត្ត
        </button>
        <button
          type="button"
          onClick={() => setSettingsTab("security")}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "7px",
            padding: "8px 16px",
            borderRadius: "9px",
            border: "none",
            fontSize: "12.5px",
            fontWeight: 700,
            cursor: "pointer",
            background: settingsTab === "security" ? "#ffffff" : "transparent",
            color: settingsTab === "security" ? "#059669" : "#64748b",
            boxShadow: settingsTab === "security" ? "0 2px 6px rgba(0,0,0,0.06)" : "none",
            transition: "all 0.15s ease",
          }}
        >
          <ShieldCheck size={15} /> សុវត្ថិភាពគណនី (2FA)
        </button>
      </div>

      {/* TAB 1: STORE & PERSONAL PROFILE */}
      {settingsTab === "store" && (
        <div className="grid-2 equal" style={{ marginBottom: 20 }}>
          {/* Store Profile & Receipt Settings Panel */}
          <Panel
            title="ប្រវត្តិរូប និងព័ត៌មានហាង (Store Profile & Receipt Branding)"
            description="ឈ្មោះហាង និងលេខទូរស័ព្ទនឹងត្រូវបង្ហាញលើវិក្កយបត្របោះពុម្ព (Thermal Receipt & A4 Invoice) និងផ្ទាំងគ្រប់គ្រង។"
          >
            <form onSubmit={handleSaveStore}>
              {storeError && <div className="error-banner" style={{ marginBottom: 12 }}>{storeError}</div>}
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <div className="form-field">
                  <label htmlFor="store-name">
                    <strong>ឈ្មោះហាង (Shop Name) *</strong>
                  </label>
                  <input
                    id="store-name"
                    type="text"
                    required
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="ឧ. សោភា ស្ទូឌីយោ / My Cambodia Store"
                    disabled={role !== "OWNER" && role !== "ADMIN"}
                  />
                </div>

                <div className="form-field">
                  <label htmlFor="store-phone">
                    <strong>លេខទូរស័ព្ទហាង (Store Phone)</strong>
                  </label>
                  <input
                    id="store-phone"
                    type="text"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    placeholder="ឧ. 012 345 678 / 098 765 432 (បោះពុម្ពលើវិក្កយបត្រ)"
                    disabled={role !== "OWNER" && role !== "ADMIN"}
                  />
                </div>

                <div className="form-field">
                  <label htmlFor="store-address">
                    <strong>អាសយដ្ឋានហាង (Store Address)</strong>
                  </label>
                  <input
                    id="store-address"
                    type="text"
                    value={formData.address}
                    onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                    placeholder="ឧ. ផ្ទះលេខ 12 ផ្លូវ 2004 រាជធានីភ្នំពេញ"
                    disabled={role !== "OWNER" && role !== "ADMIN"}
                  />
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <div className="form-field">
                    <label htmlFor="store-bakong">
                      <strong>គណនីបាគង (Bakong Account ID)</strong>
                    </label>
                    <input
                      id="store-bakong"
                      type="text"
                      value={formData.bakongAccountId}
                      onChange={(e) => setFormData({ ...formData, bakongAccountId: e.target.value })}
                      placeholder="ឧ. 012345678@aclb"
                      disabled={role !== "OWNER" && role !== "ADMIN"}
                    />
                  </div>

                  <div className="form-field">
                    <label htmlFor="store-rate">
                      <strong>អត្រាប្តូរប្រាក់ (1 USD = KHR)</strong>
                    </label>
                    <input
                      id="store-rate"
                      type="number"
                      min="3000"
                      max="6000"
                      value={formData.exchangeRate}
                      onChange={(e) => setFormData({ ...formData, exchangeRate: Number(e.target.value) || 4100 })}
                      placeholder="4100"
                      disabled={role !== "OWNER" && role !== "ADMIN"}
                    />
                  </div>
                </div>

                {(role === "OWNER" || role === "ADMIN") && (
                  <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 8 }}>
                    <button type="submit" className="button primary" disabled={savingStore}>
                      {savingStore ? "កំពុងរក្សាទុក…" : "រក្សាទុកការកំណត់ហាង"}
                    </button>
                  </div>
                )}
              </div>
            </form>
          </Panel>

          {/* Personal Profile & Avatar Panel */}
          <Panel
            title="ប្រវត្តិរូប និងគណនីផ្ទាល់ខ្លួន (Personal Profile & Avatar)"
            description="គ្រប់គ្រងរូបតំណាងប្រវត្តិរូប (Avatar) ឈ្មោះផ្ទាល់ខ្លួន និងតួនាទីរបស់អ្នកក្នុងប្រព័ន្ធ។"
          >
            <form onSubmit={handleSaveProfile}>
              {profileError && <div className="error-banner" style={{ marginBottom: 12 }}>{profileError}</div>}

              <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 16, padding: "12px 14px", background: "#f8fafc", borderRadius: 8, border: "1px solid #e2e8f0" }}>
                <div
                  style={{
                    width: 68,
                    height: 68,
                    borderRadius: "50%",
                    background: "#e2e8f0",
                    border: "2px solid #cbd5e1",
                    display: "grid",
                    placeItems: "center",
                    overflow: "hidden",
                    flexShrink: 0,
                    boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
                  }}
                >
                  {profileAvatar ? (
                    <img
                      src={profileAvatar}
                      alt="Avatar"
                      style={{ width: "100%", height: "100%", objectFit: "cover" }}
                    />
                  ) : (
                    <span style={{ fontSize: 20, color: "#475569", fontWeight: 700 }}>
                      {initials(profileName || currentUser.name)}
                    </span>
                  )}
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <input
                    ref={profileFileInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    style={{ display: "none" }}
                    onChange={handleProfileAvatarFile}
                  />
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button
                      type="button"
                      className="button tiny"
                      onClick={() => profileFileInputRef.current?.click()}
                      disabled={avatarUploading || savingProfile}
                    >
                      <Camera size={13} /> {avatarUploading ? "កំពុងផ្ទុក…" : profileAvatar ? "ប្តូររូបថត" : "ជ្រើសរើសរូបថត"}
                    </button>
                    {profileAvatar && (
                      <button
                        type="button"
                        className="button subtle tiny"
                        style={{ color: "#dc2626" }}
                        onClick={() => setProfileAvatar(null)}
                        disabled={avatarUploading || savingProfile}
                      >
                        <Trash2 size={13} /> លុបរូប
                      </button>
                    )}
                  </div>
                  <small style={{ color: "#64748b", fontSize: 11 }}>
                    គាំទ្រ JPG, PNG, WebP (បង្រួមទំហំស្វ័យប្រវត្តិ)
                  </small>
                </div>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <div className="form-field">
                  <label htmlFor="user-profile-name">
                    <strong>ឈ្មោះអ្នកប្រើ (Full Name) *</strong>
                  </label>
                  <input
                    id="user-profile-name"
                    type="text"
                    required
                    value={profileName}
                    onChange={(e) => setProfileName(e.target.value)}
                    placeholder="ឧ. សុខា ម៉េង"
                    disabled={savingProfile}
                  />
                </div>

                <div className="form-field">
                  <label>
                    <strong>តួនាទីគណនី (System Role)</strong>
                  </label>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <Badge
                      value={currentUser.role === "OWNER" ? "ម្ចាស់ហាង (Owner)" : currentUser.role === "ADMIN" ? "អ្នកគ្រប់គ្រង (Admin)" : "បុគ្គលិក (Staff)"}
                      className={currentUser.role === "OWNER" ? "purple" : currentUser.role === "ADMIN" ? "blue" : "gray"}
                    />
                    <small style={{ color: "#64748b", fontSize: 12 }}>
                      {currentUser.role === "OWNER"
                        ? "សិទ្ធិពេញលេញលើការគ្រប់គ្រងហាង និងគណនីបុគ្គលិក"
                        : "សិទ្ធិប្រតិបត្តិការតាមតួនាទីដែលបានកំណត់"}
                    </small>
                  </div>
                </div>

                <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 8 }}>
                  <button type="submit" className="button primary" disabled={savingProfile || avatarUploading}>
                    {savingProfile ? "កំពុងរក្សាទុក…" : "រក្សាទុកប្រវត្តិរូប"}
                  </button>
                </div>
              </div>
            </form>
          </Panel>
        </div>
      )}

      {/* TAB 2: SOCIAL SALES CHANNELS (FACEBOOK, TIKTOK, TELEGRAM) */}
      {settingsTab === "channels" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 20, marginBottom: 20 }}>
          {/* Channel 1: FACEBOOK PAGE & LIVE CF */}
          <Panel
            title="១. ហ្វេសប៊ុក (Facebook Page & Live CF Studio)"
            description="ភ្ជាប់ Facebook Page ដើម្បីទាញយកសារកម្មង់ពី Messenger និងកាត់ស្តុក CF ស្វ័យប្រវត្តតាម Comment លើការ Live Stream។"
          >
            <form onSubmit={handleSaveFacebook} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {/* Channel Header Status Banner */}
              <div
                style={{
                  padding: "12px 14px",
                  borderRadius: 8,
                  background: fbConnected ? "#eff6ff" : "#f8fafc",
                  border: `1px solid ${fbConnected ? "#bfdbfe" : "#e2e8f0"}`,
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span
                    style={{
                      width: 10,
                      height: 10,
                      borderRadius: "50%",
                      background: fbConnected ? "#1877F2" : "#94a3b8",
                      display: "inline-block",
                    }}
                  />
                  <div>
                    <strong style={{ fontSize: 13, color: fbConnected ? "#1e40af" : "#475569" }}>
                      {fbConnected ? `បានភ្ជាប់ Facebook Page: ${fbPageName}` : "មិនទាន់បានភ្ជាប់ Facebook Page នៅឡើយទេ"}
                    </strong>
                    <small style={{ display: "block", color: "#64748b", fontSize: 11, marginTop: 2 }}>
                      {fbConnected
                        ? "Facebook Webhook សកម្ម · ត្រៀមចាប់ខមិនកក់ CF លើ Live និង Messenger ស្វ័យប្រវត្ត"
                        : "បញ្ចូល Page ID និង Access Token ដើម្បីភ្ជាប់ហាងរបស់អ្នក"}
                    </small>
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <Badge value={fbConnected ? "បានភ្ជាប់ (Connected)" : "មិនទាន់ភ្ជាប់"} className={fbConnected ? "blue" : "gray"} />
                  <MediaIcon channel="FACEBOOK" size={24} />
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div className="form-field">
                  <label htmlFor="fb-page-name">
                    <strong>ឈ្មោះទំព័រ Facebook Page Name</strong>
                  </label>
                  <input
                    id="fb-page-name"
                    type="text"
                    value={fbPageName}
                    onChange={(e) => setFbPageName(e.target.value)}
                    placeholder="ឧ. Davika Clothing Store"
                  />
                </div>
                <div className="form-field">
                  <label htmlFor="fb-page-id">
                    <strong>លេខសម្គាល់ទំព័រ Facebook Page ID</strong>
                  </label>
                  <input
                    id="fb-page-id"
                    type="text"
                    value={fbPageId}
                    onChange={(e) => setFbPageId(e.target.value)}
                    placeholder="ឧ. 104829104829104"
                  />
                </div>
              </div>

              <div className="form-field">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <label htmlFor="fb-token">
                    <strong>Page Access Token (API Key)</strong>
                  </label>
                  <button
                    type="button"
                    style={{ fontSize: 11, color: "#2563eb", background: "none", border: "none", cursor: "pointer" }}
                    onClick={() => setShowFbToken(!showFbToken)}
                  >
                    {showFbToken ? "លាក់ Token" : "បង្ហាញ Token"}
                  </button>
                </div>
                <input
                  id="fb-token"
                  type={showFbToken ? "text" : "password"}
                  value={fbAccessToken}
                  onChange={(e) => setFbAccessToken(e.target.value)}
                  placeholder="EAAB... (បិទភ្ជាប់ Facebook Page Access Token ពី Meta for Developers)"
                />
              </div>

              <div className="form-field">
                <label>
                  <strong>Facebook Webhook Callback URL (សម្រាប់ Meta App Dashboard)</strong>
                </label>
                <div style={{ display: "flex", gap: 8 }}>
                  <input
                    type="text"
                    readOnly
                    value={defaultFbWebhook}
                    style={{ background: "#f8fafc", color: "#334155" }}
                  />
                  <button
                    type="button"
                    className="button"
                    onClick={() => copyTextToClipboard(defaultFbWebhook, "Facebook Webhook URL")}
                    style={{ display: "inline-flex", alignItems: "center", gap: 5, whiteSpace: "nowrap" }}
                  >
                    <Copy size={13} /> ចម្លង Link
                  </button>
                </div>
              </div>

              {/* Toggles */}
              <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: "12px 14px", background: "#f8fafc", borderRadius: 8, border: "1px solid #e2e8f0" }}>
                <label style={{ display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer", fontSize: 12 }}>
                  <span>
                    <strong>ចាប់កូដកក់ទំនិញស្វ័យប្រវត្តលើ Facebook Live (Live CF Detection)</strong>
                    <small style={{ display: "block", color: "#64748b" }}>
                      នៅពេលអតិថិជនខមិនកូដទំនិញ (ឧ. CF1 1, A12 2) លើ Live ប្រព័ន្ធកាត់ស្តុក និងបង្កើតការកម្មង់ភ្លាមៗ
                    </small>
                  </span>
                  <input
                    type="checkbox"
                    checked={fbLiveCfActive}
                    onChange={(e) => setFbLiveCfActive(e.target.checked)}
                    style={{ width: 18, height: 18, cursor: "pointer" }}
                  />
                </label>

                <label style={{ display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer", fontSize: 12, borderTop: "1px solid #e2e8f0", paddingTop: 8 }}>
                  <span>
                    <strong>ទទួលសារកម្មង់ពី Facebook Messenger (Messenger Inbox Sync)</strong>
                    <small style={{ display: "block", color: "#64748b" }}>
                      ទាញយកសារ និងវិភាគទីតាំងដឹកជញ្ជូន និងលេខទូរស័ព្ទដោយផ្ទាល់ពី Facebook Messenger
                    </small>
                  </span>
                  <input
                    type="checkbox"
                    checked={fbMessengerSync}
                    onChange={(e) => setFbMessengerSync(e.target.checked)}
                    style={{ width: 18, height: 18, cursor: "pointer" }}
                  />
                </label>
              </div>

              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 4 }}>
                <button
                  type="button"
                  className="button subtle"
                  onClick={() => onOpenLiveCf?.()}
                  style={{ display: "inline-flex", alignItems: "center", gap: 5 }}
                >
                  <Radio size={14} color="#1877F2" /> បើកកញ្ចក់ Live CF Studio
                </button>
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    type="button"
                    className="button outline"
                    onClick={() => {
                      setFbConnected(!fbConnected);
                      handleSaveFacebook();
                    }}
                    style={{ color: fbConnected ? "#dc2626" : "#2563eb", borderColor: fbConnected ? "#fca5a5" : "#cbd5e1" }}
                  >
                    {fbConnected ? "ផ្តាច់ការតភ្ជាប់" : "ភ្ជាប់ឡើងវិញ"}
                  </button>
                  <button type="submit" className="button primary" disabled={savingFb}>
                    {savingFb ? "កំពុងរក្សាទុក…" : "រក្សាទុកការកំណត់ Facebook"}
                  </button>
                </div>
              </div>
            </form>
          </Panel>

          {/* Channel 2: TIKTOK SHOP & TIKTOK LIVE */}
          <Panel
            title="២. ធីកតុក (TikTok Shop & TikTok Live Stream)"
            description="រៀបចំការតភ្ជាប់ជាមួយ TikTok Seller Center ដើម្បីធ្វើសមកាលកម្មស្តុក និងកាត់កូដ CF ពីការផ្សាយផ្ទាល់ TikTok Live។"
          >
            <form onSubmit={handleSaveTikTok} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {/* Channel Header Status Banner */}
              <div
                style={{
                  padding: "12px 14px",
                  borderRadius: 8,
                  background: tiktokConnected ? "#fdf2f8" : "#f8fafc",
                  border: `1px solid ${tiktokConnected ? "#fbcfe8" : "#e2e8f0"}`,
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span
                    style={{
                      width: 10,
                      height: 10,
                      borderRadius: "50%",
                      background: tiktokConnected ? "#db2777" : "#94a3b8",
                      display: "inline-block",
                    }}
                  />
                  <div>
                    <strong style={{ fontSize: 13, color: tiktokConnected ? "#be185d" : "#475569" }}>
                      {tiktokConnected ? "បានភ្ជាប់ TikTok Shop រួចរាល់" : "រៀបចំរួចរាល់សម្រាប់ភ្ជាប់ (TikTok Shop Ready)"}
                    </strong>
                    <small style={{ display: "block", color: "#64748b", fontSize: 11, marginTop: 2 }}>
                      {tiktokConnected
                        ? "TikTok Shop API សកម្ម · កំពុងធ្វើសមកាលកម្មទំនិញ និងការបញ្ជាទិញ"
                        : "បញ្ចូល Seller Shop ID និង Partner Key ដើម្បីផ្ទៀងផ្ទាត់ជាមួយ TikTok Shop"}
                    </small>
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <Badge value={tiktokConnected ? "បានភ្ជាប់ (Connected)" : "ត្រៀមតភ្ជាប់"} className={tiktokConnected ? "pink" : "gray"} />
                  <MediaIcon channel="TIKTOK" size={24} />
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div className="form-field">
                  <label htmlFor="tiktok-shop-id">
                    <strong>TikTok Shop ID / Seller Code</strong>
                  </label>
                  <input
                    id="tiktok-shop-id"
                    type="text"
                    value={tiktokShopId}
                    onChange={(e) => setTiktokShopId(e.target.value)}
                    placeholder="ឧ. KH_SHOP_90821"
                  />
                </div>
                <div className="form-field">
                  <label htmlFor="tiktok-app-key">
                    <strong>TikTok Partner App Key</strong>
                  </label>
                  <input
                    id="tiktok-app-key"
                    type="text"
                    value={tiktokAppKey}
                    onChange={(e) => setTiktokAppKey(e.target.value)}
                    placeholder="ឧ. 6a8f19bc30e4..."
                  />
                </div>
              </div>

              <div className="form-field">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <label htmlFor="tiktok-secret">
                    <strong>App Secret Key</strong>
                  </label>
                  <button
                    type="button"
                    style={{ fontSize: 11, color: "#2563eb", background: "none", border: "none", cursor: "pointer" }}
                    onClick={() => setShowTiktokSecret(!showTiktokSecret)}
                  >
                    {showTiktokSecret ? "លាក់ Secret" : "បង្ហាញ Secret"}
                  </button>
                </div>
                <input
                  id="tiktok-secret"
                  type={showTiktokSecret ? "text" : "password"}
                  value={tiktokAppSecret}
                  onChange={(e) => setTiktokAppSecret(e.target.value)}
                  placeholder="បិទភ្ជាប់ App Secret Key ពី TikTok for Developers"
                />
              </div>

              <div className="form-field">
                <label>
                  <strong>TikTok Webhook Endpoint URL</strong>
                </label>
                <div style={{ display: "flex", gap: 8 }}>
                  <input
                    type="text"
                    readOnly
                    value={defaultTiktokWebhook}
                    style={{ background: "#f8fafc", color: "#334155" }}
                  />
                  <button
                    type="button"
                    className="button"
                    onClick={() => copyTextToClipboard(defaultTiktokWebhook, "TikTok Webhook URL")}
                    style={{ display: "inline-flex", alignItems: "center", gap: 5, whiteSpace: "nowrap" }}
                  >
                    <Copy size={13} /> ចម្លង Link
                  </button>
                </div>
              </div>

              {/* Toggles */}
              <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: "12px 14px", background: "#f8fafc", borderRadius: 8, border: "1px solid #e2e8f0" }}>
                <label style={{ display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer", fontSize: 12 }}>
                  <span>
                    <strong>កាត់ស្តុក CF ស្វ័យប្រវត្តលើ TikTok Live (TikTok Live Comment Ingestion)</strong>
                    <small style={{ display: "block", color: "#64748b" }}>
                      ចាប់កូដកក់ពីខមិនរបស់អ្នកទស្សនាលើ TikTok Live Stream ភ្លាមៗ
                    </small>
                  </span>
                  <input
                    type="checkbox"
                    checked={tiktokLiveCfActive}
                    onChange={(e) => setTiktokLiveCfActive(e.target.checked)}
                    style={{ width: 18, height: 18, cursor: "pointer" }}
                  />
                </label>

                <label style={{ display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer", fontSize: 12, borderTop: "1px solid #e2e8f0", paddingTop: 8 }}>
                  <span>
                    <strong>ធ្វើសមកាលកម្មកាតាឡុកទំនិញ (Auto-Sync Products from TikTok Shop)</strong>
                    <small style={{ display: "block", color: "#64748b" }}>
                      ទាញយកបញ្ជីទំនិញ និងចំនួនស្តុកពី TikTok Shop មកកាន់ Social Seller Order Manager ដោយស្វ័យប្រវត្ត
                    </small>
                  </span>
                  <input
                    type="checkbox"
                    checked={tiktokAutoSync}
                    onChange={(e) => setTiktokAutoSync(e.target.checked)}
                    style={{ width: 18, height: 18, cursor: "pointer" }}
                  />
                </label>
              </div>

              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 4 }}>
                <button
                  type="button"
                  className="button"
                  onClick={() => {
                    setTiktokConnected(true);
                    notify({ kind: "success", title: "បានតភ្ជាប់គណនី TikTok Shop សាកល្បងដោយជោគជ័យ!" });
                  }}
                  style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "#000", color: "#fff", border: "none" }}
                >
                  <MediaIcon channel="TIKTOK" size={14} /> ភ្ជាប់គណនី TikTok Shop (Connect)
                </button>
                <button type="submit" className="button primary" disabled={savingTiktok}>
                  {savingTiktok ? "កំពុងរក្សាទុក…" : "រក្សាទុកការកំណត់ TikTok"}
                </button>
              </div>
            </form>
          </Panel>

          {/* Channel 3: TELEGRAM BOT & GROUP */}
          <Panel
            title="៣. តេលេក្រាម (Telegram Bot & Group Inflow)"
            description="ភ្ជាប់ Telegram Bot ផ្ទាល់ខ្លួន ដើម្បីទទួលសារកម្មង់ពីអតិថិជន និងបម្លែងជាការបញ្ជាទិញដោយស្វ័យប្រវត្តិ។"
          >
            {telegramError && <div className="error-banner" style={{ marginBottom: 12 }}>{telegramError}</div>}

            {/* Connection Status Badge */}
            <div
              style={{
                padding: "12px 14px",
                borderRadius: 8,
                background: telegramInfo?.hasWebhookError
                  ? "#fffbeb"
                  : telegramInfo?.connected
                  ? "#f0fdf4"
                  : "#f8fafc",
                border: `1px solid ${
                  telegramInfo?.hasWebhookError
                    ? "#fde68a"
                    : telegramInfo?.connected
                    ? "#bbf7d0"
                    : "#e2e8f0"
                }`,
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 14,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: "50%",
                    background: telegramInfo?.hasWebhookError
                      ? "#f59e0b"
                      : telegramInfo?.connected
                      ? "#22c55e"
                      : "#94a3b8",
                    display: "inline-block",
                  }}
                />
                <div>
                  <strong
                    style={{
                      fontSize: 13,
                      color: telegramInfo?.hasWebhookError
                        ? "#b45309"
                        : telegramInfo?.connected
                        ? "#15803d"
                        : "#475569",
                    }}
                  >
                    {telegramInfo?.connected
                      ? `បានភ្ជាប់ Telegram Bot: @${telegramInfo.botUsername || "Bot"} ${
                          telegramInfo.hasWebhookError ? "(Webhook មិនដំណើរការ / Offline)" : ""
                        }`
                      : "មិនទាន់បានភ្ជាប់ Telegram Bot នៅឡើយទេ"}
                  </strong>
                  <small style={{ display: "block", color: "#64748b", fontSize: 11, marginTop: 2 }}>
                    {telegramInfo?.hasWebhookError
                      ? `កំហុស Webhook៖ ${telegramInfo.webhookError} · មាន ${telegramInfo.pendingCount || 0} សារកំពុងរង់ចាំ`
                      : telegramInfo?.connected
                      ? `Webhook សកម្ម · ត្រៀមទទួលសារកម្មង់ទិញ ២៤/៧`
                      : "បញ្ចូល Bot Token ពី @BotFather ដើម្បីដំណើរការ"}
                  </small>
                </div>
              </div>
              <MediaIcon channel="TELEGRAM" size={24} />
            </div>

            {telegramInfo?.hasWebhookError && (
              <div
                style={{
                  background: "#fef2f2",
                  border: "1px solid #fecaca",
                  borderRadius: 8,
                  padding: "10px 14px",
                  marginBottom: 14,
                  fontSize: 12,
                  color: "#991b1b",
                  display: "flex",
                  flexDirection: "column",
                  gap: 6,
                }}
              >
                <div style={{ fontWeight: 700, display: "flex", alignItems: "center", gap: 6 }}>
                  <AlertCircle size={15} color="#dc2626" /> មូលហេតុ Telegram មិនឆ្លើយតប (Webhook Offline):
                </div>
                <div>
                  Telegram មិនអាចបញ្ជូនសារមកកាន់ម៉ាស៊ីនអ្នកបានទេ ពីព្រោះ Webhook URL{" "}
                  <code>{telegramInfo.webhookUrl}</code> ត្រូវបានបិទ (ngrok offline) ធ្វើឱ្យ Telegram ទទួលបាន <strong>404 Not Found</strong>។
                  {telegramInfo.pendingCount && telegramInfo.pendingCount > 0 ? (
                    <span> បច្ចុប្បន្នមាន <strong>{telegramInfo.pendingCount} សារ</strong> កំពុងរង់ចាំនៅលើ Telegram Server។</span>
                  ) : null}
                </div>
                <div style={{ display: "flex", gap: 8, marginTop: 4, flexWrap: "wrap", alignItems: "center" }}>
                  <button
                    type="button"
                    className="button primary"
                    disabled={telegramBusy}
                    onClick={() => handleTelegramAction("sync_pending_updates")}
                    style={{ fontSize: 11, padding: "4px 10px", display: "inline-flex", alignItems: "center", gap: 5 }}
                  >
                    <Download size={13} /> {telegramBusy ? "កំពុងទាញយក…" : "ទាញយកសាររង់ចាំឥឡូវនេះ (Sync)"}
                  </button>
                  <span style={{ fontSize: 11, color: "#64748b" }}>
                    ឬដំណើរការ <code>ngrok http 3000</code> ក្នុង Terminal ហើយបិទភ្ជាប់ Link ថ្មីខាងក្រោម។
                  </span>
                </div>
              </div>
            )}

            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div className="form-field">
                <label htmlFor="tg-token">
                  <strong>Telegram Bot Token (API Key)</strong>
                </label>
                <input
                  id="tg-token"
                  type="password"
                  value={botTokenInput}
                  onChange={(e) => setBotTokenInput(e.target.value)}
                  placeholder="ឧ. 123456789:ABCdefGhIJKlmNoPQRsTUVwxyZ..."
                  disabled={role !== "OWNER" && role !== "ADMIN"}
                />
              </div>

              <div className="form-field">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <label htmlFor="tg-webhook">
                    <strong>Webhook Destination URL (ស្វ័យប្រវត្តិ ឬ ngrok HTTPS)</strong>
                  </label>
                  {customWebhookUrl && (
                    <button
                      type="button"
                      style={{ fontSize: 11, color: "#2563eb", background: "none", border: "none", cursor: "pointer", textDecoration: "underline" }}
                      onClick={() => setCustomWebhookUrl("")}
                    >
                      ត្រឡប់ទៅ URL លំនាំដើម
                    </button>
                  )}
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <input
                    id="tg-webhook"
                    type="text"
                    value={customWebhookUrl || defaultWebhook}
                    onChange={(e) => setCustomWebhookUrl(e.target.value)}
                    placeholder="https://your-domain.com/api/webhooks/telegram"
                    disabled={role !== "OWNER" && role !== "ADMIN"}
                  />
                  <button
                    type="button"
                    className="button"
                    onClick={() => copyTextToClipboard(customWebhookUrl || defaultWebhook, "Telegram Webhook URL")}
                    style={{ display: "inline-flex", alignItems: "center", gap: 5, whiteSpace: "nowrap" }}
                  >
                    <Copy size={13} /> ចម្លង Link
                  </button>
                </div>
                <small style={{ color: "#64748b", fontSize: 11, marginTop: 3 }}>
                  Telegram ទាមទារ <strong>HTTPS</strong>។ ប្រសិនបើសាកល្បងលើ Localhost សូមដំឡើង <code>ngrok http 3000</code> ហើយបិទភ្ជាប់ HTTPS URL នៅទីនេះ។
                </small>
              </div>

              {(role === "OWNER" || role === "ADMIN") && (
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "space-between", alignItems: "center" }}>
                  <button
                    type="button"
                    className="button subtle"
                    style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
                    onClick={() => setTestModalOpen(true)}
                  >
                    <Sparkles size={14} /> សាកល្បងសារ AI (Test Simulator)
                  </button>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {telegramInfo?.connected && (
                      <button
                        type="button"
                        className="button outline"
                        disabled={telegramBusy}
                        onClick={() => handleTelegramAction("sync_pending_updates")}
                        style={{ display: "inline-flex", alignItems: "center", gap: 5 }}
                        title="ទាញយកសារដែល Telegram មិនទាន់អាចបញ្ជូនដល់"
                      >
                        <Download size={13} /> {telegramBusy ? "កំពុងទាញយក…" : "ទាញយកសាររង់ចាំ (Sync)"}
                      </button>
                    )}
                    {telegramInfo?.connected && (
                      <button
                        type="button"
                        className="button outline"
                        style={{ color: "#dc2626", borderColor: "#fca5a5" }}
                        disabled={telegramBusy}
                        onClick={() => handleTelegramAction("delete_webhook")}
                      >
                        ផ្តាច់ Webhook
                      </button>
                    )}
                    <button
                      type="button"
                      className="button outline"
                      disabled={telegramBusy}
                      onClick={() => handleTelegramAction("check_status")}
                    >
                      {telegramBusy ? "កំពុងពិនិត្យ…" : "ពិនិត្យស្ថានភាព"}
                    </button>
                    <button
                      type="button"
                      className="button primary"
                      disabled={telegramBusy || !botTokenInput.trim()}
                      onClick={() => handleTelegramAction("set_webhook")}
                      style={{ display: "inline-flex", alignItems: "center", gap: 5 }}
                    >
                      <MediaIcon channel="TELEGRAM" size={13} /> {telegramBusy ? "កំពុងភ្ជាប់…" : "ភ្ជាប់ Webhook ឥឡូវនេះ"}
                    </button>
                  </div>
                </div>
              )}

              <div
                style={{
                  marginTop: 8,
                  padding: "10px 12px",
                  background: "#f0f7ff",
                  border: "1px solid #bfdbfe",
                  borderRadius: 8,
                  fontSize: 11,
                  color: "#1e40af",
                  lineHeight: 1.6,
                }}
              >
                <strong>💡 របៀបបង្កើត Telegram Bot ដោយឥតគិតថ្លៃ៖</strong>
                <ol style={{ margin: "4px 0 0 16px", padding: 0 }}>
                  <li>បើកកម្មវិធី Telegram រួចស្វែងរក <code>@BotFather</code></li>
                  <li>ផ្ញើសារ <code>/newbot</code> ហើយដាក់ឈ្មោះហាងរបស់អ្នក</li>
                  <li>ចម្លងលេខកូដ HTTP API Token មកបិទភ្ជាប់ក្នុងប្រអប់ខាងលើ</li>
                  <li>ចុចប៊ូតុង &quot;ភ្ជាប់ Webhook&quot; នោះសារកម្មង់នឹងហូរចូលប្រព័ន្ធដោយស្វ័យប្រវត្តិ!</li>
                </ol>
                <div style={{ marginTop: 8, paddingTop: 6, borderTop: "1px dashed #bfdbfe" }}>
                  <strong>👥 របៀបប្រើក្នុង Telegram Group៖</strong>
                  <ul style={{ margin: "2px 0 0 16px", padding: 0 }}>
                    <li>បន្ថែម Bot ចូលក្នុង Group ហើយបិទ Privacy Mode ក្នុង <code>@BotFather</code> (ផ្ញើ <code>/setprivacy</code> &gt; ជ្រើសរើស Bot &gt; <strong>Disable</strong>) ឬតម្លើង Bot ជា <strong>Admin</strong> ដើម្បីឱ្យ Bot មើលឃើញសារកម្មង់របស់សមាជិកគ្រប់រូប។</li>
                    <li>ប្រព័ន្ធនឹងបែងចែក និងសម្គាល់អតិថិជនម្នាក់ៗដោយស្វ័យប្រវត្តិ ទោះបីជាមានការកម្មង់ដំណាលគ្នាក្នុង Group តែមួយក៏ដោយ។</li>
                  </ul>
                </div>
              </div>
            </div>
          </Panel>
        </div>
      )}

      {/* TAB 3: AI ENGINE & SMART AUTO-REPLY */}
      {settingsTab === "ai" && (
        <div className="grid-2 equal" style={{ marginBottom: 20 }}>
          {/* AI Engine Status & Provider Panel */}
          <Panel
            title="ម៉ាស៊ីនវិភាគ & ឆ្លើយតប AI (AI Engine Configuration)"
            description="ជ្រើសរើសម៉ាស៊ីន AI ឆ្លាតវៃសម្រាប់ស្គាល់ផលិតផល ស្តុក និងឆ្លើយតបអតិថិជនលើ Telegram / Social Chat។"
          >
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div className="form-field">
                <label>ម៉ាស៊ីន AI សកម្ម (Active AI Engine)</label>
                <select
                  value={aiProvider}
                  onChange={(e) => setAiProvider(e.target.value)}
                  disabled={role !== "OWNER" && role !== "ADMIN"}
                  className="select"
                >
                  <option value="pattern">🚀 Cambodia Social Smart Engine (ដំណើរការស្រាប់ · 0MB Disk · ឥតគិតថ្លៃ)</option>
                  <option value="groq">⚡ Groq Cloud AI (Llama 3.3 70B · 0MB Disk · Free Key · លឿនបំផុត)</option>
                  <option value="openai">🤖 OpenAI (GPT-4o-mini / GPT-4o · 0MB Disk)</option>
                  <option value="gemini">💎 Google Gemini (Gemini 1.5 Flash · 0MB Disk)</option>
                  <option value="deepseek">🌊 DeepSeek (DeepSeek-V3 · 0MB Disk)</option>
                </select>
              </div>

              {aiProvider !== "pattern" ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: 12, background: "#f8fafc", borderRadius: 8, border: "1px solid #e2e8f0" }}>
                  <div className="form-field">
                    <label style={{ display: "flex", justifyContent: "space-between" }}>
                      <span>{aiProvider.toUpperCase()} API Key:</span>
                      {aiProvider === "groq" && (
                        <a href="https://console.groq.com/keys" target="_blank" rel="noreferrer" style={{ fontSize: 11, color: "#2563eb", textDecoration: "underline" }}>
                          ចុះឈ្មោះយក Free Key នៅ console.groq.com ↗
                        </a>
                      )}
                      {aiProvider === "openai" && (
                        <a href="https://platform.openai.com/api-keys" target="_blank" rel="noreferrer" style={{ fontSize: 11, color: "#2563eb", textDecoration: "underline" }}>
                          យក Key នៅ platform.openai.com ↗
                        </a>
                      )}
                      {aiProvider === "gemini" && (
                        <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noreferrer" style={{ fontSize: 11, color: "#2563eb", textDecoration: "underline" }}>
                          យក Key នៅ aistudio.google.com ↗
                        </a>
                      )}
                    </label>
                    <div style={{ display: "flex", gap: 6 }}>
                      <input
                        type={showAiApiKey ? "text" : "password"}
                        value={aiApiKey}
                        onChange={(e) => setAiApiKey(e.target.value)}
                        placeholder={aiProvider === "groq" ? "gsk_..." : aiProvider === "openai" ? "sk-..." : "API Key..."}
                        disabled={role !== "OWNER" && role !== "ADMIN"}
                        style={{ flex: 1 }}
                      />
                      <button
                        type="button"
                        className="button subtle"
                        onClick={() => setShowAiApiKey((v) => !v)}
                        title={showAiApiKey ? "លាក់" : "បង្ហាញ"}
                      >
                        {showAiApiKey ? <EyeOff size={14} /> : <Eye size={14} />}
                      </button>
                    </div>
                  </div>

                  <div className="form-field">
                    <label>ម៉ូដែល AI (AI Model - ជម្រើសបន្ថែម)</label>
                    <input
                      type="text"
                      value={aiModel}
                      onChange={(e) => setAiModel(e.target.value)}
                      placeholder={
                        aiProvider === "groq"
                          ? "llama-3.3-70b-versatile"
                          : aiProvider === "openai"
                          ? "gpt-4o-mini"
                          : aiProvider === "gemini"
                          ? "gemini-1.5-flash"
                          : "deepseek-chat"
                      }
                      disabled={role !== "OWNER" && role !== "ADMIN"}
                    />
                    <small style={{ color: "#64748b", fontSize: 11 }}>
                      ទុកនៅទទេដើម្បីប្រើម៉ូដែលលំនាំដើមដែលល្អបំផុតសម្រាប់ភាសាខ្មែរ។
                    </small>
                  </div>
                </div>
              ) : (
                <div
                  style={{
                    fontSize: 12,
                    color: "#334155",
                    lineHeight: 1.65,
                    background: "#f0fdf4",
                    padding: "12px 14px",
                    borderRadius: 8,
                    border: "1px solid #bbf7d0",
                  }}
                >
                  <p style={{ margin: "0 0 6px 0", fontWeight: 700, color: "#15803d" }}>
                    ✓ ដំណើរការដោយផ្ទាល់ក្នុងម៉ាស៊ីន (0MB Disk · ឥតគិតថ្លៃ · ក្រោម 10ms)៖
                  </p>
                  <ul style={{ margin: 0, paddingLeft: 18, display: "flex", flexDirection: "column", gap: 4 }}>
                    <li>
                      <strong>ស្គាល់ឈ្មោះ និងសាច់ក្រណាត់ខ្មែរច្បាស់លាស់៖</strong> ស្គាល់ «អាវសាច់កប្បាស» ➔ «អាវយឺតកប្បាស», «ខោលីនិន» ➔ «ខោជើងវែងក្រណាត់លីនិន», «ក្រម៉ា», «សំពត់ផ្កា»។
                    </li>
                    <li>
                      <strong>ណែនាំផលិតផលស្វ័យប្រវត្តិ៖</strong> ឆ្លើយប្រាប់អតិថិជនយ៉ាងរាក់ទាក់ និងបង្ហាញទំនិញដែលមានលក់ ប្រសិនបើសួររកទំនិញដែលគ្មានក្នុងស្តុក។
                    </li>
                    <li>
                      <strong>មិនស៊ីទំហំ Disk (0MB):</strong> មិនត្រូវការទាញយក Ollama 10GB ឡើយ។
                    </li>
                  </ul>
                </div>
              )}

              {(role === "OWNER" || role === "ADMIN") && (
                <div style={{ display: "flex", justifyContent: "flex-end" }}>
                  <button
                    type="button"
                    className="button primary tiny"
                    disabled={savingAutoReply}
                    onClick={handleSaveAutoReply}
                  >
                    {savingAutoReply ? "កំពុងរក្សាទុក…" : "រក្សាទុកម៉ាស៊ីន AI"}
                  </button>
                </div>
              )}
            </div>
          </Panel>

          {/* AI Smart Auto-Reply 24/7 Panel */}
          <Panel
            title="ឆ្លើយតបស្វ័យប្រវត្តិតាម AI ពេលរវល់ (Smart Auto-Reply 24/7)"
            description="កំណត់ឱ្យ AI ឆ្លើយតបសារអតិថិជនលើ Telegram & Facebook ដោយស្វ័យប្រវត្តជាមួយរូបភាព និងតម្លៃជាក់ស្តែង។"
          >
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div
                style={{
                  padding: "12px 14px",
                  background: "#f8fafc",
                  border: "1px solid #e2e8f0",
                  borderRadius: 10,
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <div>
                  <strong style={{ fontSize: 13, color: "#1e293b", display: "inline-flex", alignItems: "center", gap: 6 }}>
                    <Sparkles size={15} style={{ color: "#2563eb" }} />
                    បើកដំណើរការឆ្លើយតបស្វ័យប្រវត្តិ (Auto-Reply Master Switch)
                  </strong>
                  <small style={{ display: "block", color: "#64748b", fontSize: 11, marginTop: 2 }}>
                    AI ពិនិត្យតម្លៃ និងស្តុកទំនិញក្នុងស្តុកឆ្លើយតបភ្លាមៗ ប៉ុន្តែម្ចាស់ហាងនៅតែជាអ្នកពិនិត្យ និងបញ្ជាក់លំហូរទូទាត់ប្រាក់។
                  </small>
                </div>
                <label className="toggle-switch" style={{ display: "flex", alignItems: "center", cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={autoReplyEnabled}
                    onChange={(e) => setAutoReplyEnabled(e.target.checked)}
                    disabled={role !== "OWNER" && role !== "ADMIN"}
                    style={{ width: 18, height: 18, cursor: "pointer" }}
                  />
                </label>
              </div>

              {autoReplyEnabled && (
                <div style={{ display: "flex", flexDirection: "column", gap: 10, paddingLeft: 8, borderLeft: "2px solid #3b82f6" }}>
                  <label style={{ display: "flex", alignItems: "flex-start", gap: 8, fontSize: 12, cursor: "pointer", color: "#334155" }}>
                    <input
                      type="checkbox"
                      checked={autoReplyStockCheck}
                      onChange={(e) => setAutoReplyStockCheck(e.target.checked)}
                      disabled={role !== "OWNER" && role !== "ADMIN"}
                      style={{ marginTop: 2 }}
                    />
                    <span>
                      <strong>ឆ្លើយតបតម្លៃ និងស្តុកទំនិញជាក់ស្តែង (Real-Time Stock & Price Check)</strong>
                      <small style={{ display: "block", color: "#64748b" }}>
                        ពេលអតិថិជនសួរតម្លៃ ឬសួរថាតើមានទំនិញក្នុងស្តុកឬអត់ AI នឹងឆែកស្តុក និងផ្ញើរូបភាពទំនិញជូនភ្លាមៗ។
                      </small>
                    </span>
                  </label>

                  <label style={{ display: "flex", alignItems: "flex-start", gap: 8, fontSize: 12, cursor: "pointer", color: "#334155" }}>
                    <input
                      type="checkbox"
                      checked={autoReplyOrderNotice}
                      onChange={(e) => setAutoReplyOrderNotice(e.target.checked)}
                      disabled={role !== "OWNER" && role !== "ADMIN"}
                      style={{ marginTop: 2 }}
                    />
                    <span>
                      <strong>កត់ត្រា និងឆ្លើយតបការកម្មង់បឋម (Order Intake & Draft Acknowledgment)</strong>
                      <small style={{ display: "block", color: "#64748b" }}>
                        ពេលអតិថិជនកម្មង់ទិញ AI រៀបរាប់មុខទំនិញ តម្លៃសរុប និងបញ្ជាក់ប្រាប់អតិថិជនថា «ម្ចាស់ហាងនឹងពិនិត្យផ្ញើ Bakong KHQR ជូន»។
                      </small>
                    </span>
                  </label>

                  {(role === "OWNER" || role === "ADMIN") && (
                    <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 4 }}>
                      <button
                        type="button"
                        className="button primary tiny"
                        disabled={savingAutoReply}
                        onClick={handleSaveAutoReply}
                      >
                        {savingAutoReply ? "កំពុងរក្សាទុក…" : "រក្សាទុកជម្រើសឆ្លើយតប AI"}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </Panel>
        </div>
      )}

      {/* TAB 4: SECURITY SETTINGS */}
      {settingsTab === "security" && (
        <div style={{ marginBottom: 20 }}>
          <SecuritySettings />
        </div>
      )}

      <div className="settings-note"><CheckCircle2 size={15} /><span>ដំណើរការគ្រប់គ្រងអតិថិជន ផលិតផល និងការបញ្ជាទិញដោយដៃ មិនអាស្រ័យលើ AI, Redis ឬការតភ្ជាប់បណ្ដាញសង្គមទេ។</span></div>

      {testModalOpen && (
        <TelegramTestModal
          close={() => setTestModalOpen(false)}
          onDetected={() => {}}
        />
      )}
    </>
  );
}

type ManagedUser = { id: string; name: string; email: string; role: string; keycloakLinked: boolean; avatarUrl?: string | null };
const managedRoleNames: Record<string, string> = { OWNER: "ម្ចាស់ហាង", ADMIN: "អ្នកគ្រប់គ្រង", STAFF: "បុគ្គលិក" };

function UserManagement() {
  const notify = useToast();
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState("");
  const [editingUser, setEditingUser] = useState<ManagedUser | null>(null);
  const [accountModalOpen, setAccountModalOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  useEffect(() => {
    setPage(1);
  }, [search]);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/auth/admin/users", { signal: controller.signal })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error ?? "មិនអាចផ្ទុកបញ្ជីគណនីបានទេ។");
        setUsers(data.users);
        setError("");
      })
      .catch((cause: unknown) => {
        if (cause instanceof DOMException && cause.name === "AbortError") return;
        setError(cause instanceof Error ? cause.message : "មិនអាចផ្ទុកបញ្ជីគណនីបានទេ។");
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [reloadKey]);

  const visibleUsers = users.filter((user) => `${user.name} ${user.email} ${managedRoleNames[user.role] ?? user.role}`.toLowerCase().includes(search.trim().toLowerCase()));
  const linkedUsers = users.filter((user) => user.keycloakLinked).length;

  async function deleteUser(user: ManagedUser) {
    if (!window.confirm(`ដកសិទ្ធិប្រើប្រាស់ក្នុងហាងរបស់ ${user.name}? គណនី Keycloak របស់ពួកគេនឹងមិនត្រូវបានលុបទេ។`)) return;
    setBusyId(user.id); setError("");
    try {
      const response = await fetch(`/api/auth/admin/users/${user.id}`, { method: "DELETE" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "មិនអាចដកសិទ្ធិបានទេ។");
      setUsers((old) => old.filter((entry) => entry.id !== user.id));
      notify({ kind: "success", title: "បានដកសិទ្ធិចូលប្រើហាង", description: user.email });
    } catch (cause) { setError(cause instanceof Error ? cause.message : "មិនអាចដកសិទ្ធិបានទេ។"); }
    finally { setBusyId(""); }
  }

  return <>
    <PageHeading title={sectionNames.Users} description="គ្រប់គ្រងសិទ្ធិចូលប្រើហាង តួនាទី និងពាក្យសម្ងាត់ Keycloak របស់ក្រុមការងារ។" action={<button className="button primary" onClick={() => { setEditingUser(null); setAccountModalOpen(true); }}><Plus size={14} /> បន្ថែមអ្នកប្រើ</button>} />
    <div className="user-admin-summary">
      <div className="summary-tile"><span>អ្នកប្រើក្នុងហាង</span><strong>{khmerNumber(users.length)}</strong></div>
      <div className="summary-tile"><span>បានភ្ជាប់ Keycloak</span><strong>{khmerNumber(linkedUsers)}</strong></div>
      <div className="summary-tile"><span>ត្រូវការចូលប្រើលើកដំបូង</span><strong>{khmerNumber(users.length - linkedUsers)}</strong></div>
    </div>
    <Panel title="សិទ្ធិអ្នកប្រើប្រាស់" description="តួនាទីកំណត់សិទ្ធិក្នុងហាង។ ម្ចាស់ហាងអាចបង្កើតគណនី កែប្រែព័ត៌មាន និងកំណត់ពាក្យសម្ងាត់ថ្មីក្នុងទម្រង់តែមួយ។"
      action={<label className="input-wrap user-search"><Search size={14} /><input aria-label="ស្វែងរកអ្នកប្រើ" placeholder="ស្វែងរកឈ្មោះ ឬអ៊ីមែល" value={search} onChange={(event) => setSearch(event.target.value)} /></label>}>
      <div className="security-policy user-keycloak-note"><ShieldCheck size={18} /><span><strong>គ្រប់គ្រងការចូលដោយ Keycloak SSO & Database</strong><small>ម្ចាស់ហាងអាចបង្កើតគណនីបុគ្គលិក កំណត់ពាក្យសម្ងាត់ និងធ្វើសមកាលកម្មដោយស្វ័យប្រវត្តិទៅ Keycloak Identity Server។</small></span><Badge value="Keycloak" className="blue" /></div>
      {error && <div className="error-banner" role="alert">{error}<button className="text-action" onClick={() => { setLoading(true); setReloadKey((key) => key + 1); }}>ព្យាយាមម្ដងទៀត</button></div>}
      {loading ? <div className="empty-state" role="status">កំពុងផ្ទុកបញ្ជីអ្នកប្រើ…</div>
        : error ? null
        : visibleUsers.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>អ្នកប្រើប្រាស់</th>
                  <th>អ៊ីមែល</th>
                  <th>តួនាទី</th>
                  <th>Keycloak SSO</th>
                  <th className="actions-header">សកម្មភាព</th>
                </tr>
              </thead>
              <tbody>
                {visibleUsers
                  .slice((page - 1) * pageSize, page * pageSize)
                  .map((user) => (
                  <tr key={user.id}>
                    <td>
                      <div className="customer-cell">
                        <span className="avatar small">
                          {user.avatarUrl ? (
                            <img
                              src={user.avatarUrl}
                              alt={user.name}
                              style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: "50%" }}
                            />
                          ) : (
                            initials(user.name)
                          )}
                        </span>
                        <div>
                          <strong className="latin-data">{user.name}</strong>
                        </div>
                      </div>
                    </td>
                    <td className="latin-data">{user.email}</td>
                    <td>
                      <span className="badge" style={{ fontSize: "0.75rem", padding: "2px 8px" }}>
                        {managedRoleNames[user.role] ?? user.role}
                      </span>
                    </td>
                    <td>
                      <Badge
                        value={user.keycloakLinked ? "បានភ្ជាប់" : "រង់ចាំការចូលដំបូង"}
                        className={user.keycloakLinked ? "green" : "amber"}
                      />
                    </td>
                    <td className="actions-cell">
                      <div className="table-actions-group">
                        <button
                          type="button"
                          className="action-icon-btn edit-action"
                          title="កែប្រែព័ត៌មាន និងពាក្យសម្ងាត់"
                          disabled={busyId === user.id}
                          onClick={() => { setEditingUser(user); setAccountModalOpen(true); }}
                          aria-label="Edit user"
                        >
                          <Edit2 size={13} />
                        </button>
                        <button
                          type="button"
                          className="action-icon-btn delete-action"
                          title="ដកសិទ្ធិចូលប្រើប្រាស់"
                          disabled={busyId === user.id}
                          onClick={() => void deleteUser(user)}
                          aria-label="Delete user"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
        : <div className="empty-state"><strong>{search ? "រកមិនឃើញអ្នកប្រើទេ" : "មិនទាន់មានអ្នកប្រើក្នុងហាងនេះ"}</strong>{search ? "សាកល្បងពាក្យស្វែងរកផ្សេង។" : "បន្ថែមអ្នកប្រើជាមួយពាក្យសម្ងាត់ ដើម្បីផ្ដល់សិទ្ធិចូលប្រើប្រព័ន្ធភ្លាមៗ។"}</div>}
      {!loading && users.length > 0 && (
        <DataTablePagination
          currentPage={page}
          totalPages={Math.max(1, Math.ceil(visibleUsers.length / pageSize))}
          totalItems={visibleUsers.length}
          pageSize={pageSize}
          onPageChange={setPage}
          onPageSizeChange={(newSize) => {
            setPageSize(newSize);
            setPage(1);
          }}
          itemName="គណនីអ្នកប្រើ"
        />
      )}
    </Panel>
    {accountModalOpen && <AccountModal user={editingUser ?? undefined} close={() => { setAccountModalOpen(false); setEditingUser(null); }} saved={(user) => {
      setUsers((old) => old.some((entry) => entry.id === user.id) ? old.map((entry) => entry.id === user.id ? user : entry) : [...old, user]);
    }} />}
  </>;
}

function AccountModal({ user, close, saved }: { user?: ManagedUser; close: () => void; saved: (user: ManagedUser) => void }) {
  const notify = useToast();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(user?.avatarUrl ?? null);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleAvatarFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("សូមជ្រើសរើសឯកសាររូបភាព (JPG, PNG, WebP)");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError("ទំហំរូបភាពមិនត្រូវលើសពី 5MB ឡើយ");
      return;
    }
    setAvatarUploading(true);
    const reader = new FileReader();
    reader.onload = () => {
      const img = new window.Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const maxDim = 256;
        let w = img.width;
        let h = img.height;
        if (w > h) {
          if (w > maxDim) {
            h = Math.round((h * maxDim) / w);
            w = maxDim;
          }
        } else {
          if (h > maxDim) {
            w = Math.round((w * maxDim) / h);
            h = maxDim;
          }
        }
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.drawImage(img, 0, 0, w, h);
          setAvatarUrl(canvas.toDataURL("image/jpeg", 0.85));
        }
        setAvatarUploading(false);
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError("");
    const form = new FormData(event.currentTarget);
    const body: Record<string, unknown> = {
      name: form.get("name"),
      email: form.get("email"),
      role: form.get("role"),
      avatarUrl: avatarUrl,
    };
    const passwordValue = (form.get("password") as string | null)?.trim();
    if (!user) {
      body.password = passwordValue;
    } else if (passwordValue) {
      body.password = passwordValue;
    }
    try {
      const response = await fetch(user ? `/api/auth/admin/users/${user.id}` : "/api/auth/admin/users", {
        method: user ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "មិនអាចរក្សាទុកគណនីបានទេ។");
      saved({ ...data.user, keycloakLinked: data.user.keycloakLinked ?? user?.keycloakLinked ?? false });
      notify({ kind: "success", title: user ? "បានកែប្រែគណនី និងធ្វើបច្ចុប្បន្នភាព Keycloak" : "បានបន្ថែមអ្នកប្រើ និងបង្កើតគណនី Keycloak", description: data.user.email });
      close();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "មិនអាចរក្សាទុកគណនីបានទេ។"); }
    finally { setBusy(false); }
  }

  return <Modal title={user ? "កែប្រែគណនីអ្នកប្រើ" : "បន្ថែមអ្នកប្រើក្នុងហាង"} subtitle={user ? "កែប្រែឈ្មោះ អ៊ីមែល តួនាទី រូបថតប្រវត្តិរូប ឬកំណត់ពាក្យសម្ងាត់ថ្មីក្នុងទម្រង់តែមួយ។" : "បង្កើតសិទ្ធិប្រើប្រាស់ និងគណនី Keycloak ភ្លាមៗជាមួយពាក្យសម្ងាត់។"} close={close}>
    <form onSubmit={submit}>
      {error && <div className="error-banner" role="alert">{error}</div>}
      <div className="form-grid">
        <div className="form-field full" style={{ marginBottom: "6px" }}>
          <label>រូបថតប្រវត្តិរូប (Profile Photo)</label>
          <div style={{ display: "flex", alignItems: "center", gap: "16px", marginTop: "6px" }}>
            <div
              style={{
                width: 64,
                height: 64,
                borderRadius: "50%",
                background: "#f1f5f9",
                border: "2px solid #e2e8f0",
                display: "grid",
                placeItems: "center",
                overflow: "hidden",
                flexShrink: 0,
                boxShadow: "0 2px 6px rgba(0,0,0,0.06)",
              }}
            >
              {avatarUrl ? (
                <img
                  src={avatarUrl}
                  alt="Avatar"
                  style={{ width: "100%", height: "100%", objectFit: "cover" }}
                />
              ) : (
                <span style={{ fontSize: 18, color: "#64748b", fontWeight: 700 }}>
                  {user ? initials(user.name) : <Camera size={22} />}
                </span>
              )}
            </div>
            <div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                style={{ display: "none" }}
                onChange={handleAvatarFile}
              />
              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                <button
                  type="button"
                  className="button tiny"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={avatarUploading || busy}
                >
                  <Camera size={13} /> {avatarUploading ? "កំពុងផ្ទុក…" : avatarUrl ? "ប្តូររូបថត" : "ជ្រើសរើសរូបថត"}
                </button>
                {avatarUrl && (
                  <button
                    type="button"
                    className="button subtle tiny"
                    style={{ color: "#dc2626" }}
                    onClick={() => setAvatarUrl(null)}
                    disabled={avatarUploading || busy}
                  >
                    <Trash2 size={13} /> លុបរូប
                  </button>
                )}
              </div>
              <small style={{ display: "block", color: "var(--muted)", fontSize: 10, marginTop: 4 }}>
                គាំទ្រ JPG, PNG, WebP (ទំហំ &lt; 5MB)។ រូបថតត្រូវបានរក្សាទុកក្នុងប្រព័ន្ធ។
              </small>
            </div>
          </div>
        </div>
        <Field label="ឈ្មោះ" name="name" required defaultValue={user?.name} />
        <Field label="អ៊ីមែល" name="email" type="email" required defaultValue={user?.email} />
        <div className="form-field"><label htmlFor="account-role">តួនាទី</label><select id="account-role" name="role" defaultValue={user?.role ?? "STAFF"}><option value="STAFF">បុគ្គលិក</option><option value="ADMIN">អ្នកគ្រប់គ្រង</option>{user && <option value="OWNER">ម្ចាស់ហាង</option>}</select></div>
        <div className="form-field full">
          <label htmlFor="account-password">
            {user ? "ពាក្យសម្ងាត់ថ្មី (ទុកទទេបើមិនចង់ផ្លាស់ប្តូរ)" : "ពាក្យសម្ងាត់ដំបូង (យ៉ាងហោចណាស់ ៨ តួអក្សរ)"}
          </label>
          <div className="password-field">
            <input
              id="account-password"
              name="password"
              type={showPassword ? "text" : "password"}
              required={!user}
              minLength={8}
              placeholder={user ? "បញ្ចូលពាក្យសម្ងាត់ថ្មីប្រសិនបើចង់ផ្លាស់ប្តូរ" : "បញ្ចូលពាក្យសម្ងាត់សម្រាប់បុគ្គលិក"}
              autoComplete="new-password"
            />
            <button
              type="button"
              className="password-visibility"
              onClick={() => setShowPassword(!showPassword)}
              tabIndex={-1}
              aria-label={showPassword ? "លាក់ពាក្យសម្ងាត់" : "បង្ហាញពាក្យសម្ងាត់"}
            >
              {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
          <small style={{ color: "var(--muted)", fontSize: 11 }}>
            {user
              ? "ប្រសិនបើបញ្ចូលពាក្យសម្ងាត់ថ្មី វានឹងត្រូវធ្វើសមកាលកម្មជាមួយ Keycloak ភ្លាមៗ។"
              : "បុគ្គលិកអាចប្រើអ៊ីមែល និងពាក្យសម្ងាត់នេះ ដើម្បីចូលប្រើប្រព័ន្ធបានភ្លាមៗ។"}
          </small>
        </div>
      </div>
      <div className="modal-actions"><button type="button" className="button" onClick={close}>បោះបង់</button><button className="button primary" disabled={busy}>{busy ? "កំពុងរក្សាទុក…" : user ? "រក្សាទុកការកែប្រែ" : "បង្កើតគណនី"}</button></div>
    </form>
  </Modal>;
}

function SecuritySettings() {
  return <div className="security-settings">
    <Panel title="សុវត្ថិភាពគណនី និងការផ្ទៀងផ្ទាត់" description="គ្រប់គ្រងគោលការណ៍ចូលប្រើប្រព័ន្ធ សុវត្ថិភាពទិន្នន័យ និង Keycloak SSO។">
      <div className="security-policy">
        <ShieldCheck size={20} />
        <span>
          <strong>ការផ្ទៀងផ្ទាត់តាម Keycloak SSO & Role-Based Access Control (RBAC)</strong>
          <small>គណនីបុគ្គលិកត្រូវបានការពារដោយ Keycloak Identity Server ជាមួយការចាក់សោគណនីសុវត្ថិភាព និងការគ្រប់គ្រងពាក្យសម្ងាត់ផ្ទាល់ពីផ្ទាំងគ្រប់គ្រង។</small>
        </span>
        <Badge value="Keycloak 26" className="blue" />
      </div>
    </Panel>
  </div>;
}
