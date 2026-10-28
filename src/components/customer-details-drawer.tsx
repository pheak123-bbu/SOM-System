"use client";

import { useEffect, useState, FormEvent } from "react";
import {
  X,
  Phone,
  MapPin,
  Edit2,
  Trash2,
  Plus,
  Clock,
  ShoppingBag,
  MessageCircle,
  CheckCircle2,
  Calendar,
  ExternalLink,
  ChevronRight,
  Send,
  AlertCircle,
} from "lucide-react";
import {
  formatCambodiaPhone,
  calculateCustomerTier,
  formatDualCurrency,
  formatUSD,
  formatKHR,
  usdToKhr,
  toKhmerDigits,
} from "@/lib/cambodia";
import { MediaBadge, MediaIcon } from "@/components/ui/media-icon";
import { useToast } from "@/components/ui/toast-provider";
import { CustomerAddressItem } from "@/components/customer-address-modal";

interface CustomerNote {
  id: string;
  body: string;
  createdAt: string;
}

export interface CustomerDrawerCustomer {
  id: string;
  name: string;
  phone: string;
  email: string;
  channel: string;
  orderCount: number;
  conversationCount: number;
  totalSpent: number;
  lastOrderAt: string | null;
  notes: CustomerNote[];
  telegramUsername?: string | null;
  facebookId?: string | null;
  codRiskOverride?: string | null;
}

interface OrderRow {
  id: string;
  orderNumber: string;
  customerId: string;
  total: number;
  status: string;
  createdAt: string;
}

interface CustomerDetailsDrawerProps {
  customer: CustomerDrawerCustomer | null;
  code: string;
  close: () => void;
  onEdit: (customer: CustomerDrawerCustomer) => void;
  onDelete: (customer: CustomerDrawerCustomer) => Promise<void>;
  onAddAddress: (customer: CustomerDrawerCustomer) => void;
  addNote: (id: string, body: string) => Promise<void>;
  updateNote: (customerId: string, noteId: string, body: string) => Promise<void>;
  deleteNote: (customerId: string, noteId: string) => Promise<void>;
  onSelectOrder?: (orderId: string) => void;
}

const statusLabels: Record<string, string> = {
  DRAFT: "សេចក្ដីព្រាង",
  PENDING_CONFIRMATION: "រង់ចាំបញ្ជាក់",
  CONFIRMED: "បានបញ្ជាក់",
  PROCESSING: "កំពុងរៀបចំ",
  SHIPPED: "បានផ្ញើចេញ",
  DELIVERED: "បានដឹកជញ្ជូន",
  CANCELLED: "បានបោះបង់",
};

const statusClasses: Record<string, string> = {
  DRAFT: "gray",
  PENDING_CONFIRMATION: "amber",
  CONFIRMED: "blue",
  PROCESSING: "blue",
  SHIPPED: "indigo",
  DELIVERED: "green",
  CANCELLED: "red",
};

const initials = (name: string) =>
  name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();

const khmerDigits = (str: string) => str;

const khmerNumber = (num: number) => (num ?? 0).toLocaleString("en-US");

const CAMBODIA_TZ = "Asia/Phnom_Penh";
const khmerMonths = ["មករា", "កុម្ភៈ", "មីនា", "មេសា", "ឧសភា", "មិថុនា", "កក្កដា", "សីហា", "កញ្ញា", "តុលា", "វិច្ឆិកា", "ធ្នូ"];

const datePartsInTz = (date: Date, timeZone = CAMBODIA_TZ) => {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    day: "numeric",
    month: "numeric",
    year: "numeric",
  }).formatToParts(date);
  const map: Record<string, string> = {};
  for (const p of parts) map[p.type] = p.value;
  return {
    day: Number(map.day),
    monthIndex: Number(map.month) - 1,
    year: Number(map.year),
  };
};

const dateLabel = (value: string | null) => {
  if (!value) return "មិនទាន់មាន";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "មិនទាន់មាន";
  const { day, monthIndex, year } = datePartsInTz(date);
  return `${day} ${khmerMonths[monthIndex] ?? ""} ${year}`;
};

function SavedAddressesBlock({
  customerId,
  onManage,
}: {
  customerId: string;
  onManage: () => void;
}) {
  const [addresses, setAddresses] = useState<CustomerAddressItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    fetch(`/api/customers/${customerId}/addresses`)
      .then((res) => res.json())
      .then((data) => {
        if (active && data.addresses) setAddresses(data.addresses);
      })
      .catch(() => {})
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [customerId]);

  if (loading) {
    return (
      <div style={{ padding: "10px 0", color: "#94a3b8", fontSize: 11 }}>
        កំពុងផ្ទុកអាសយដ្ឋាន…
      </div>
    );
  }

  if (!addresses.length) {
    return (
      <div
        style={{
          padding: "12px",
          background: "#f8fafc",
          borderRadius: 8,
          border: "1px dashed #cbd5e1",
          textAlign: "center",
          fontSize: 11,
          color: "#64748b",
        }}
      >
        មិនទាន់មានអាសយដ្ឋានរក្សាទុកនៅឡើយទេ។ ចុច &quot;+ បន្ថែម&quot; ដើម្បីរក្សាទុកអាសយដ្ឋានដឹកជញ្ជូន។
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginTop: "4px" }}>
      {addresses.map((addr) => (
        <div
          key={addr.id}
          style={{
            fontSize: "12px",
            padding: "8px 12px",
            background: "#f8fafc",
            borderRadius: "8px",
            border: "1px solid #e2e8f0",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <MapPin size={12} style={{ color: "#2563eb" }} />
              <strong>{addr.label || addr.recipient || "អាសយដ្ឋាន"}</strong>
              {addr.isDefault && (
                <span
                  className="badge green"
                  style={{ fontSize: "10px", padding: "1px 6px" }}
                >
                  ចម្បង
                </span>
              )}
            </div>
            <div style={{ color: "#64748b", marginTop: 3, fontSize: 11 }}>
              {addr.address} {addr.phone ? `(☎ ${formatCambodiaPhone(addr.phone)})` : ""}
            </div>
          </div>
          <button
            type="button"
            className="button tiny-action"
            onClick={onManage}
            style={{ fontSize: 11 }}
          >
            កែប្រែ
          </button>
        </div>
      ))}
    </div>
  );
}

export function CustomerDetailsDrawer({
  customer,
  code,
  close,
  onEdit,
  onDelete,
  onAddAddress,
  addNote,
  updateNote,
  deleteNote,
  onSelectOrder,
}: CustomerDetailsDrawerProps) {
  const notify = useToast();
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(false);
  const [orderError, setOrderError] = useState("");
  const [noteText, setNoteText] = useState("");
  const [savingNote, setSavingNote] = useState(false);
  const [noteError, setNoteError] = useState("");
  const [editingNote, setEditingNote] = useState<{ id: string; body: string } | null>(null);
  const [busyNoteId, setBusyNoteId] = useState("");

  useEffect(() => {
    if (!customer?.id) return;
    const controller = new AbortController();
    setLoadingOrders(true);
    setOrderError("");
    fetch(`/api/orders?customerId=${encodeURIComponent(customer.id)}&pageSize=8`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error ?? "មិនអាចផ្ទុកប្រវត្តិការបញ្ជាទិញបានទេ។");
        setOrders(
          data.orders.map((order: any) => ({
            ...order,
            total: Number(order.total),
          }))
        );
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setOrderError(error instanceof Error ? error.message : "មិនអាចផ្ទុកប្រវត្តិការបញ្ជាទិញបានទេ។");
      })
      .finally(() => {
        setLoadingOrders(false);
      });
    return () => controller.abort();
  }, [customer?.id]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") close();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [close]);

  if (!customer) return null;

  const tier = calculateCustomerTier(customer.orderCount, customer.totalSpent);

  async function handleAddNote(e: FormEvent) {
    e.preventDefault();
    if (!customer || !noteText.trim()) return;
    setSavingNote(true);
    setNoteError("");
    try {
      await addNote(customer.id, noteText.trim());
      setNoteText("");
      notify({ kind: "success", title: "បានបន្ថែមកំណត់ចំណាំដោយជោគជ័យ" });
    } catch (err) {
      setNoteError(err instanceof Error ? err.message : "មិនអាចរក្សាទុកកំណត់ចំណាំបានទេ។");
    } finally {
      setSavingNote(false);
    }
  }

  async function handleSaveEditedNote(noteId: string) {
    if (!customer || !editingNote || !editingNote.body.trim()) return;
    setBusyNoteId(noteId);
    try {
      await updateNote(customer.id, noteId, editingNote.body.trim());
      setEditingNote(null);
      notify({ kind: "success", title: "បានកែប្រែកំណត់ចំណាំ" });
    } catch (err) {
      notify({ kind: "error", title: "មិនអាចកែប្រែកំណត់ចំណាំបានទេ" });
    } finally {
      setBusyNoteId("");
    }
  }

  async function handleDeleteNote(noteId: string) {
    if (!customer) return;
    if (!window.confirm("តើអ្នកចង់លុបកំណត់ចំណាំនេះមែនទេ?")) return;
    setBusyNoteId(noteId);
    try {
      await deleteNote(customer.id, noteId);
      notify({ kind: "success", title: "បានលុបកំណត់ចំណាំ" });
    } catch (err) {
      notify({ kind: "error", title: "មិនអាចលុបកំណត់ចំណាំបានទេ" });
    } finally {
      setBusyNoteId("");
    }
  }

  const telegramHandle = customer.telegramUsername?.replace("@", "") || "";
  const telegramUrl = telegramHandle
    ? `https://t.me/${telegramHandle}`
    : customer.phone
    ? `https://t.me/+${customer.phone.replace(/[^0-9]/g, "")}`
    : null;

  return (
    <div
      className="drawer-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div
        className="order-drawer customer-drawer"
        role="dialog"
        aria-modal="true"
        aria-label={`ប្រវត្តិរូបអតិថិជន ${customer.name}`}
      >
        {/* Drawer Header */}
        <div className="drawer-header">
          <div className="drawer-title-group">
            <span
              className="avatar"
              style={{
                width: 44,
                height: 44,
                fontSize: 16,
                background: "linear-gradient(135deg, #1e3a8a, #3b82f6)",
                color: "white",
              }}
            >
              {initials(customer.name)}
            </span>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span className="order-number-title" style={{ fontSize: 16 }}>
                  {customer.name}
                </span>
                <span className={`badge ${tier.badgeClass}`} style={{ fontSize: "0.75rem" }}>
                  {tier.labelKh}
                </span>
              </div>
              <small style={{ color: "var(--muted)", fontSize: 11 }}>
                {customer.orderCount > 0
                  ? `ការបញ្ជាទិញ ${khmerNumber(customer.orderCount)} · ជាអតិថិជនចាប់ពី ${dateLabel(
                      customer.lastOrderAt
                    )}`
                  : "មិនទាន់មានប្រវត្តិការទិញទេ"}
              </small>
            </div>
          </div>
          <div className="drawer-head-actions">
            <button
              type="button"
              className="icon-button"
              onClick={close}
              aria-label="បិទផ្ទាំង"
              style={{ padding: 6, borderRadius: 6, border: "1px solid #e2e8f0" }}
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Drawer Scroll Body */}
        <div className="drawer-scroll-body">
          {/* Action Row */}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <button
              type="button"
              className="button outline tiny"
              onClick={() => onEdit(customer)}
              style={{ display: "inline-flex", alignItems: "center", gap: 5 }}
            >
              <Edit2 size={12} /> កែប្រែព័ត៌មាន
            </button>
            <button
              type="button"
              className="button outline tiny"
              onClick={() => onAddAddress(customer)}
              style={{ display: "inline-flex", alignItems: "center", gap: 5 }}
            >
              <MapPin size={12} /> គ្រប់គ្រងអាសយដ្ឋាន
            </button>
            <button
              type="button"
              className="button outline tiny"
              style={{
                color: "#dc2626",
                borderColor: "#fca5a5",
                marginLeft: "auto",
                display: "inline-flex",
                alignItems: "center",
                gap: 5,
              }}
              onClick={async () => {
                if (
                  window.confirm(
                    `តើអ្នកចង់លុបអតិថិជន ${customer.name} មែនទេ? ការលុបត្រូវបានរារាំង ប្រសិនបើមានការបញ្ជាទិញ ឬទិន្នន័យភ្ជាប់។`
                  )
                ) {
                  try {
                    await onDelete(customer);
                    close();
                  } catch (e) {
                    notify({
                      kind: "error",
                      title: "មិនអាចលុបអតិថិជនបានទេ",
                      description: e instanceof Error ? e.message : "មានទិន្នន័យពាក់ព័ន្ធ",
                    });
                  }
                }
              }}
            >
              <Trash2 size={12} /> លុបអតិថិជន
            </button>
          </div>

          {/* Quick Metrics Grid */}
          <div className="drawer-card" style={{ padding: 14 }}>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(3, 1fr)",
                gap: 10,
                textAlign: "center",
              }}
            >
              <div
                style={{
                  padding: "10px 6px",
                  background: "#f8fafc",
                  borderRadius: 8,
                  border: "1px solid #f1f5f9",
                }}
              >
                <small style={{ color: "#64748b", fontSize: 10, display: "block" }}>
                  ចំណាយសរុប
                </small>
                <strong
                  style={{
                    fontSize: 14,
                    color: "#1e3a8a",
                    marginTop: 4,
                    display: "block",
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {formatUSD(customer.totalSpent)}
                </strong>
                <span style={{ fontSize: 10, color: "#94a3b8" }}>
                  {formatKHR(usdToKhr(customer.totalSpent))}
                </span>
              </div>
              <div
                style={{
                  padding: "10px 6px",
                  background: "#f8fafc",
                  borderRadius: 8,
                  border: "1px solid #f1f5f9",
                }}
              >
                <small style={{ color: "#64748b", fontSize: 10, display: "block" }}>
                  ការបញ្ជាទិញ
                </small>
                <strong
                  style={{
                    fontSize: 16,
                    color: "#1e3a8a",
                    marginTop: 4,
                    display: "block",
                  }}
                >
                  {khmerNumber(customer.orderCount)}
                </strong>
                <span
                  style={{
                    fontSize: 10,
                    color: customer.orderCount >= 2 ? "#16846e" : "#94a3b8",
                  }}
                >
                  {customer.orderCount >= 2 ? "ទិញម្ដងទៀត" : "ទិញថ្មី"}
                </span>
              </div>
              <div
                style={{
                  padding: "10px 6px",
                  background: "#f8fafc",
                  borderRadius: 8,
                  border: "1px solid #f1f5f9",
                }}
              >
                <small style={{ color: "#64748b", fontSize: 10, display: "block" }}>
                  ការជជែក
                </small>
                <strong
                  style={{
                    fontSize: 16,
                    color: "#1e3a8a",
                    marginTop: 4,
                    display: "block",
                  }}
                >
                  {khmerNumber(customer.conversationCount)}
                </strong>
                <span style={{ fontSize: 10, color: "#94a3b8" }}>សារសរុប</span>
              </div>
            </div>
          </div>

          {/* Contact Details Card */}
          <div className="drawer-card">
            <div className="card-header-row">
              <span className="card-section-title">ព័ត៌មានទំនាក់ទំនង និងបណ្ដាញ</span>
              <MediaBadge channel={customer.channel} />
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 12, fontSize: 12 }}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  flexWrap: "wrap",
                  gap: 8,
                }}
              >
                <span style={{ color: "#64748b" }}>លេខទូរស័ព្ទ:</span>
                <div style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                  <strong className="latin-data">
                    {formatCambodiaPhone(customer.phone) || customer.phone || "មិនទាន់បញ្ចូល"}
                  </strong>
                  {customer.phone && (
                    <>
                      <a
                        href={`tel:${customer.phone}`}
                        className="button tiny-action"
                        style={{
                          textDecoration: "none",
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 4,
                          padding: "2px 8px",
                          fontSize: 11,
                        }}
                        title="ហៅទូរស័ព្ទ"
                      >
                        <Phone size={11} /> តេ
                      </a>
                      {telegramUrl && (
                        <a
                          href={telegramUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="button tiny-action"
                          style={{
                            textDecoration: "none",
                            color: "#24A1DE",
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 4,
                            padding: "2px 8px",
                            fontSize: 11,
                          }}
                          title="បើកជជែកតាម Telegram"
                        >
                          <MediaIcon channel="TELEGRAM" size={11} /> Telegram
                        </a>
                      )}
                    </>
                  )}
                </div>
              </div>

              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <span style={{ color: "#64748b" }}>អ៊ីមែល:</span>
                <strong style={{ wordBreak: "break-all" }}>
                  {customer.email || "មិនទាន់បញ្ចូល"}
                </strong>
              </div>

              {customer.telegramUsername && (
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <span style={{ color: "#64748b" }}>Telegram:</span>
                  <strong style={{ color: "#24A1DE" }}>
                    @{customer.telegramUsername.replace("@", "")}
                  </strong>
                </div>
              )}

              {customer.facebookId && (
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <span style={{ color: "#64748b" }}>Facebook ID:</span>
                  <strong className="latin-data">{customer.facebookId}</strong>
                </div>
              )}
            </div>
          </div>

          {/* Delivery Addresses Card */}
          <div className="drawer-card">
            <div className="card-header-row">
              <span className="card-section-title">អាសយដ្ឋានដឹកជញ្ជូនដែលបានរក្សាទុក</span>
              <button
                type="button"
                className="button tiny-action"
                onClick={() => onAddAddress(customer)}
                style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11 }}
              >
                <Plus size={11} /> បន្ថែម
              </button>
            </div>
            <SavedAddressesBlock customerId={customer.id} onManage={() => onAddAddress(customer)} />
          </div>

          {/* Recent Orders Card */}
          <div className="drawer-card">
            <div className="card-header-row">
              <span className="card-section-title">ប្រវត្តិការបញ្ជាទិញថ្មីៗ</span>
              <span style={{ fontSize: 11, color: "#64748b" }}>
                សរុប {khmerNumber(customer.orderCount)}
              </span>
            </div>

            {loadingOrders ? (
              <div style={{ padding: "12px 0", color: "#94a3b8", fontSize: 11 }}>
                កំពុងផ្ទុកប្រវត្តិការបញ្ជាទិញ…
              </div>
            ) : orderError ? (
              <div className="inline-error">{orderError}</div>
            ) : orders.length === 0 ? (
              <div
                style={{
                  padding: "14px",
                  background: "#f8fafc",
                  borderRadius: 8,
                  textAlign: "center",
                  fontSize: 11,
                  color: "#64748b",
                }}
              >
                មិនទាន់មានការបញ្ជាទិញដែលភ្ជាប់ជាមួយប្រវត្តិរូបនេះទេ។
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {orders.map((order) => (
                  <div
                    key={order.id}
                    onClick={() => onSelectOrder?.(order.id)}
                    style={{
                      padding: "10px 12px",
                      background: "#f8fafc",
                      borderRadius: 8,
                      border: "1px solid #e2e8f0",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      cursor: onSelectOrder ? "pointer" : "default",
                      transition: "background 0.15s",
                    }}
                    onMouseEnter={(e) => {
                      if (onSelectOrder) (e.currentTarget as HTMLElement).style.background = "#eff6ff";
                    }}
                    onMouseLeave={(e) => {
                      if (onSelectOrder) (e.currentTarget as HTMLElement).style.background = "#f8fafc";
                    }}
                  >
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <strong style={{ color: "#1e3a8a", fontSize: 12 }}>
                          {order.orderNumber}
                        </strong>
                        <span
                          className={`badge ${statusClasses[order.status] ?? "gray"}`}
                          style={{ fontSize: 10, padding: "1px 6px" }}
                        >
                          {statusLabels[order.status] ?? order.status}
                        </span>
                      </div>
                      <small style={{ color: "#64748b", fontSize: 10, marginTop: 2, display: "block" }}>
                        {dateLabel(order.createdAt)}
                      </small>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <strong style={{ fontSize: 12, display: "block" }}>
                        {formatUSD(order.total)}
                      </strong>
                      <small style={{ fontSize: 10, color: "#94a3b8" }}>
                        {formatKHR(usdToKhr(order.total))}
                      </small>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Seller Notes Card */}
          <div className="drawer-card">
            <div className="card-header-row">
              <span className="card-section-title">កំណត់ចំណាំឯកជនរបស់អ្នកលក់</span>
            </div>

            <form onSubmit={handleAddNote} style={{ marginBottom: 14 }}>
              {noteError && <div className="inline-error" style={{ marginBottom: 8 }}>{noteError}</div>}
              <textarea
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
                placeholder="បន្ថែមការរំលឹកសម្រាប់តាមដាន ចំណង់ចំណូលចិត្ត ឬព័ត៌មានពិសេស…"
                maxLength={1000}
                rows={2}
                style={{
                  width: "100%",
                  border: "1px solid #cbd5e1",
                  borderRadius: 8,
                  padding: "8px 10px",
                  fontSize: 12,
                  resize: "vertical",
                  boxSizing: "border-box",
                }}
              />
              <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 6 }}>
                <button
                  type="submit"
                  className="button primary tiny"
                  disabled={savingNote || !noteText.trim()}
                  style={{ display: "inline-flex", alignItems: "center", gap: 4 }}
                >
                  <Plus size={12} /> {savingNote ? "កំពុងរក្សាទុក…" : "បន្ថែមកំណត់ចំណាំ"}
                </button>
              </div>
            </form>

            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {customer.notes?.length ? (
                customer.notes.map((entry) => (
                  <div
                    key={entry.id}
                    style={{
                      padding: "10px 12px",
                      background: "#f8fafc",
                      borderRadius: 8,
                      border: "1px solid #e2e8f0",
                      fontSize: 12,
                    }}
                  >
                    {editingNote?.id === entry.id ? (
                      <div>
                        <textarea
                          value={editingNote.body}
                          onChange={(e) =>
                            setEditingNote({ id: entry.id, body: e.target.value })
                          }
                          rows={2}
                          style={{
                            width: "100%",
                            border: "1px solid #cbd5e1",
                            borderRadius: 6,
                            padding: 6,
                            fontSize: 12,
                            boxSizing: "border-box",
                          }}
                        />
                        <div style={{ display: "flex", gap: 6, marginTop: 6, justifyContent: "flex-end" }}>
                          <button
                            type="button"
                            className="button tiny-action"
                            onClick={() => setEditingNote(null)}
                          >
                            បោះបង់
                          </button>
                          <button
                            type="button"
                            className="button primary tiny-action"
                            disabled={busyNoteId === entry.id || !editingNote.body.trim()}
                            onClick={() => void handleSaveEditedNote(entry.id)}
                          >
                            {busyNoteId === entry.id ? "កំពុងរក្សា…" : "រក្សាទុក"}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div>
                        <div style={{ color: "#1e293b", lineHeight: 1.5 }}>{entry.body}</div>
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            marginTop: 6,
                            borderTop: "1px solid #f1f5f9",
                            paddingTop: 6,
                          }}
                        >
                          <small style={{ color: "#94a3b8", fontSize: 10 }}>
                            {dateLabel(entry.createdAt)}
                          </small>
                          <div style={{ display: "flex", gap: 6 }}>
                            <button
                              type="button"
                              className="button tiny-action"
                              style={{ padding: "2px 6px", fontSize: 10 }}
                              onClick={() => setEditingNote({ id: entry.id, body: entry.body })}
                            >
                              កែ
                            </button>
                            <button
                              type="button"
                              className="button tiny-action"
                              style={{ color: "#dc2626", padding: "2px 6px", fontSize: 10 }}
                              disabled={busyNoteId === entry.id}
                              onClick={() => void handleDeleteNote(entry.id)}
                            >
                              លុប
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ))
              ) : (
                <div style={{ fontSize: 11, color: "#94a3b8", textAlign: "center", padding: "8px 0" }}>
                  មិនទាន់មានកំណត់ចំណាំឯកជនសម្រាប់អតិថិជននេះទេ។
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
