"use client";

import { useEffect, useState } from "react";
import {
  X,
  Phone,
  MessageCircle,
  Truck,
  QrCode,
  Printer,
  CheckCircle2,
  Clock,
  AlertCircle,
  Edit2,
  Trash2,
  ExternalLink,
  ShieldAlert,
  ChevronRight,
  ArrowRight,
  Copy,
  Check,
  Sparkles,
} from "lucide-react";
import {
  CAMBODIA_COURIERS,
  CAMBODIA_PAYMENT_METHODS,
  PAYMENT_STATUSES,
  calculateCustomerTier,
  decodeOrderMetadata,
  formatCambodiaPhone,
  formatDualCurrency,
  formatKHR,
  formatUSD,
  toKhmerDigits,
} from "@/lib/cambodia";
import { useToast } from "./ui/toast-provider";
import { KHQRModal } from "./khqr-modal";
import { OrderPrintDialog, PrintableOrder } from "./order-print-dialog";

export interface DetailedOrder {
  id: string;
  orderNumber: string;
  customerId: string;
  courier?: string | null;
  trackingNumber?: string | null;
  paymentMethod?: string | null;
  paymentStatus?: string | null;
  province?: string | null;
  exchangeRate?: number | string | null;
  paidAt?: string | null;
  customer: {
    id: string;
    name: string;
    phone: string | null;
    email: string | null;
    preferredChannel?: string | null;
    telegramUsername?: string | null;
  };
  status: string;
  channel: string;
  subtotal: number | string;
  discount: number | string;
  deliveryFee: number | string;
  total: number | string;
  deliveryAddress: string | null;
  notes: string | null;
  createdAt: string;
  items: {
    id: string;
    productName: string;
    variantName?: string | null;
    productSku?: string | null;
    quantity: number;
    unitPrice: number | string;
    lineTotal: number | string;
    costPrice?: number | string | null;
  }[];
  suggestion?: {
    id: string;
    confidence: number;
    intent: string;
    status: string;
    explanation?: string;
    createdAt?: string;
    conversation?: { channel: string; externalId?: string | null };
  } | null;
  history?: {
    id: string;
    from: string | null;
    to: string;
    note: string | null;
    createdAt: string;
  }[];
}

interface OrderDetailsDrawerProps {
  orderId: string;
  storeName: string;
  storePhone?: string;
  storeAddress?: string;
  exchangeRate?: number;
  close: () => void;
  onStatusChange: (orderId: string, newStatus: string) => void;
  onEdit: (orderId: string) => void;
  onDelete: (orderId: string) => void;
  onNavigateToDetection?: (suggestionId: string) => void;
  lang?: "kh" | "en";
}

const statusStepOrder = [
  "DRAFT",
  "PENDING_CONFIRMATION",
  "CONFIRMED",
  "PROCESSING",
  "SHIPPED",
  "DELIVERED",
];

const statusLabelsKh: Record<string, string> = {
  DRAFT: "សេចក្ដីព្រាង",
  PENDING_CONFIRMATION: "រង់ចាំការបញ្ជាក់",
  CONFIRMED: "បានបញ្ជាក់",
  PROCESSING: "កំពុងរៀបចំ",
  SHIPPED: "បានដឹកជញ្ជូន",
  DELIVERED: "បានប្រគល់",
  CANCELLED: "បានបោះបង់",
};

export function OrderDetailsDrawer({
  orderId,
  storeName,
  storePhone,
  storeAddress,
  exchangeRate,
  close,
  onStatusChange,
  onEdit,
  onDelete,
  onNavigateToDetection,
  lang = "kh",
}: OrderDetailsDrawerProps) {
  const notify = useToast();
  const [order, setOrder] = useState<DetailedOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showKHQR, setShowKHQR] = useState(false);
  const [showPrint, setShowPrint] = useState(false);
  const [busyStatus, setBusyStatus] = useState(false);
  const [copiedPhone, setCopiedPhone] = useState(false);
  const [editingTracking, setEditingTracking] = useState(false);
  const [trackingInput, setTrackingInput] = useState("");
  const [savingTracking, setSavingTracking] = useState(false);

  const isKh = lang === "kh";

  useEffect(() => {
    let active = true;
    fetch(`/api/orders/${orderId}`)
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to load order");
        if (active) {
          setOrder(data.order);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (active) {
          setError(err instanceof Error ? err.message : "Error loading order");
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [orderId]);

  async function updateStatus(newStatus: string, note?: string) {
    if (!order) return;
    setBusyStatus(true);
    try {
      const res = await fetch(`/api/orders/${order.id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus, note }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to update status");

      setOrder((prev) => (prev ? { ...prev, status: newStatus, history: data.order.history || prev.history } : null));
      onStatusChange(order.id, newStatus);
      notify({
        kind: "success",
        title: isKh ? "បានកែប្រែស្ថានភាពការបញ្ជាទិញ" : "Order status updated",
        description: `${order.orderNumber} ➔ ${statusLabelsKh[newStatus] || newStatus}`,
      });
    } catch (err) {
      notify({
        kind: "error",
        title: isKh ? "មិនអាចកែប្រែស្ថានភាពបានទេ" : "Could not update status",
        description: err instanceof Error ? err.message : "Error",
      });
    } finally {
      setBusyStatus(false);
    }
  }

  function copyPhone(phone: string) {
    navigator.clipboard.writeText(phone);
    setCopiedPhone(true);
    setTimeout(() => setCopiedPhone(false), 2000);
  }

  async function saveTracking(newTracking: string) {
    if (!order) return;
    setSavingTracking(true);
    try {
      const res = await fetch(`/api/orders/${order.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trackingNumber: newTracking.trim() || null }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to update tracking");
      setOrder((prev) => (prev ? { ...prev, trackingNumber: newTracking.trim() || null } : null));
      setEditingTracking(false);
      notify({
        kind: "success",
        title: isKh ? "បានរក្សាទុកលេខកូដតាមដាន" : "Tracking saved",
        description: newTracking.trim() || (isKh ? "បានលុបលេខកូដ" : "Cleared"),
      });
    } catch (err) {
      notify({
        kind: "error",
        title: isKh ? "មិនអាចរក្សាទុកលេខកូដបានទេ" : "Error",
        description: err instanceof Error ? err.message : "Error",
      });
    } finally {
      setSavingTracking(false);
    }
  }

  async function togglePaymentStatus(currentStatus: string) {
    if (!order) return;
    const nextStatus = currentStatus === "PAID" ? "UNPAID" : "PAID";
    setBusyStatus(true);
    try {
      const res = await fetch(`/api/orders/${order.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paymentStatus: nextStatus }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to update payment status");
      setOrder((prev) => (prev ? { ...prev, paymentStatus: nextStatus, paidAt: nextStatus === "PAID" ? new Date().toISOString() : null } : null));
      notify({
        kind: "success",
        title: isKh ? "បានកែប្រែស្ថានភាពទូទាត់" : "Payment status updated",
        description: nextStatus === "PAID" ? (isKh ? "បានទូទាត់រួច" : "Marked as Paid") : (isKh ? "មិនទាន់ទូទាត់" : "Marked as Unpaid"),
      });
    } catch (err) {
      notify({
        kind: "error",
        title: isKh ? "មិនអាចកែប្រែស្ថានភាពទូទាត់បានទេ" : "Error",
        description: err instanceof Error ? err.message : "Error",
      });
    } finally {
      setBusyStatus(false);
    }
  }

  if (loading) {
    return (
      <div className="drawer-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) close(); }}>
        <div className="order-drawer drawer-loading">
          <div className="empty-state">{isKh ? "កំពុងផ្ទុកព័ត៌មានការបញ្ជាទិញ…" : "Loading order details…"}</div>
        </div>
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="drawer-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) close(); }}>
        <div className="order-drawer">
          <div className="modal-head">
            <h2>{isKh ? "មានបញ្ហា" : "Error"}</h2>
            <button className="icon-button" onClick={close}><X size={17} /></button>
          </div>
          <div className="error-banner">{error || "Order not found"}</div>
        </div>
      </div>
    );
  }

  const meta = decodeOrderMetadata(order.notes);
  const effectiveCourierId = order.courier || meta.courier;
  const effectiveTracking = order.trackingNumber || meta.trackingNumber;
  const effectivePayMethod = order.paymentMethod || meta.paymentMethod;
  const effectivePayStatus = (order.paymentStatus || meta.paymentStatus || "UNPAID") as "UNPAID" | "PAID" | "REFUNDED";

  const courier = CAMBODIA_COURIERS.find((c) => c.id === effectiveCourierId) || {
    nameKh: effectiveCourierId || "សេវាដឹកជញ្ជូន",
    nameEn: effectiveCourierId || "Courier",
  };
  const payMethod = CAMBODIA_PAYMENT_METHODS.find((p) => p.id === effectivePayMethod) || {
    nameKh: effectivePayMethod,
    nameEn: effectivePayMethod,
  };
  const payStatusInfo = PAYMENT_STATUSES[effectivePayStatus] || PAYMENT_STATUSES.UNPAID;

  const totalNum = Number(order.total);
  const subtotalNum = Number(order.subtotal);
  const discountNum = Number(order.discount);
  const deliveryNum = Number(order.deliveryFee);

  const cleanPhone = order.customer.phone ? order.customer.phone.replace(/[\s\-\(\)]/g, "") : "";
  const telegramPhone = cleanPhone.startsWith("0") ? "+855" + cleanPhone.slice(1) : cleanPhone;
  const telegramHandle = order.customer.telegramUsername
    ? order.customer.telegramUsername.replace("@", "")
    : telegramPhone.replace("+", "");

  const printableData: PrintableOrder = {
    id: order.id,
    orderNumber: order.orderNumber,
    customer: order.customer.name,
    phone: order.customer.phone || "",
    status: order.status,
    channel: order.channel,
    subtotal: subtotalNum,
    discount: discountNum,
    deliveryFee: deliveryNum,
    total: totalNum,
    deliveryAddress: order.deliveryAddress,
    notes: order.notes,
    createdAt: order.createdAt,
    items: order.items.map((item) => ({
      productName: item.productName,
      variantName: item.variantName,
      quantity: item.quantity,
      unitPrice: Number(item.unitPrice),
      lineTotal: Number(item.lineTotal),
    })),
  };

  return (
    <>
      <div className="drawer-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) close(); }}>
        <div className="order-drawer" role="dialog" aria-modal="true">
          {/* Drawer Top Header */}
          <div className="drawer-header">
            <div className="drawer-title-group">
              <span className="order-number-title">{order.orderNumber}</span>
              <span className={`badge ${order.status === "DELIVERED" ? "green" : order.status === "CANCELLED" ? "red" : "blue"}`}>
                {statusLabelsKh[order.status] || order.status}
              </span>
            </div>
            <div className="drawer-head-actions">
              <button
                type="button"
                className="button subtle"
                onClick={() => setShowPrint(true)}
                title="បោះពុម្ពវិក្កយបត្រ ឬស្លាក 80mm"
              >
                <Printer size={15} />
                <span>{isKh ? "បោះពុម្ព" : "Print"}</span>
              </button>
              <button type="button" className="icon-button" onClick={close} aria-label="Close">
                <X size={18} />
              </button>
            </div>
          </div>

          <div className="drawer-scroll-body">
            {order.suggestion && (
              <div className="ai-origin-card">
                <div className="ai-origin-header">
                  <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                    <Sparkles size={15} color="#7c3aed" />
                    <strong>{isKh ? "បង្កើតឡើងដោយការរកឃើញ AI (AI Detected)" : "Created via AI Auto-Detection"}</strong>
                  </div>
                  <span className="confidence-pill high" style={{ fontSize: "11px", padding: "2px 8px" }}>
                    {toKhmerDigits(order.suggestion.confidence)}% {isKh ? "ភាពជឿជាក់" : "confidence"}
                  </span>
                </div>
                <div className="ai-origin-body">
                  <p style={{ margin: "4px 0 8px 0", fontSize: "12px", color: "#475569" }}>
                    {order.suggestion.explanation || (isKh ? "ការបញ្ជាទិញនេះត្រូវបានស្រង់ និងបង្កើតដោយស្វ័យប្រវត្តពីការសន្ទនាជាមួយអតិថិជន។" : "This order was auto-extracted from customer conversation.")}
                  </p>
                  {onNavigateToDetection && (
                    <button
                      type="button"
                      className="button subtle tiny"
                      style={{ fontSize: "11px", display: "inline-flex", alignItems: "center", gap: "5px", color: "#6d28d9" }}
                      onClick={() => {
                        close();
                        onNavigateToDetection(order.suggestion!.id);
                      }}
                    >
                      <Sparkles size={12} />
                      {isKh ? "ពិនិត្យការរកឃើញ AI & ភស្តុតាងសារដើម →" : "View AI Detection & Chat Evidence →"}
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Quick Status Workflow Progress */}
            <div className="workflow-status-card">
              <div className="workflow-title">
                {isKh ? "ដំណាក់កាលការបញ្ជាទិញ" : "Order Status"}
              </div>
              <div className="workflow-steps">
                {statusStepOrder.map((st, idx) => {
                  const currentIdx = statusStepOrder.indexOf(order.status);
                  const isDone = currentIdx >= idx && order.status !== "CANCELLED";
                  const isCurrent = order.status === st;
                  return (
                    <div
                      key={st}
                      className={`workflow-step ${isDone ? "done" : ""} ${isCurrent ? "current" : ""}`}
                    >
                      <div className="step-dot">{isDone ? "✓" : idx + 1}</div>
                      <span className="step-name">{statusLabelsKh[st]}</span>
                    </div>
                  );
                })}
              </div>

              {/* Status Action Buttons */}
              <div className="workflow-quick-actions">
                {order.status === "DRAFT" && (
                  <button
                    className="button primary"
                    disabled={busyStatus}
                    onClick={() => updateStatus("PENDING_CONFIRMATION", "Request confirmation")}
                  >
                    {isKh ? "ស្នើសុំការបញ្ជាក់ពីអតិថិជន" : "Request Confirmation"}
                  </button>
                )}
                {order.status === "PENDING_CONFIRMATION" && (
                  <button
                    className="button primary"
                    disabled={busyStatus}
                    onClick={() => updateStatus("CONFIRMED", "Confirmed by seller")}
                  >
                    <CheckCircle2 size={14} />
                    {isKh ? "បញ្ជាក់ការបញ្ជាទិញ (កាត់ស្តុក)" : "Confirm Order"}
                  </button>
                )}
                {order.status === "CONFIRMED" && (
                  <button
                    className="button primary"
                    disabled={busyStatus}
                    onClick={() => updateStatus("PROCESSING", "Packing items")}
                  >
                    <ArrowRight size={14} />
                    {isKh ? "ចាប់ផ្ដើមវេចខ្ចប់ (Processing)" : "Start Processing"}
                  </button>
                )}
                {order.status === "PROCESSING" && (
                  <button
                    className="button primary"
                    disabled={busyStatus}
                    onClick={() => updateStatus("SHIPPED", "Handed to courier")}
                  >
                    <Truck size={14} />
                    {isKh ? "ប្រគល់ជូនអ្នកដឹក (Shipped)" : "Mark Shipped"}
                  </button>
                )}
                {order.status === "SHIPPED" && (
                  <button
                    className="button primary"
                    disabled={busyStatus}
                    onClick={() => updateStatus("DELIVERED", "Delivered & paid")}
                  >
                    <CheckCircle2 size={14} />
                    {isKh ? "បានប្រគល់ជោគជ័យ (Delivered)" : "Mark Delivered"}
                  </button>
                )}
                {order.status !== "DELIVERED" && order.status !== "CANCELLED" && (
                  <button
                    className="button subtle text-red-600"
                    disabled={busyStatus}
                    onClick={() => {
                      if (window.confirm(isKh ? "តើអ្នកច្បាស់ថាចង់បោះបង់ការបញ្ជាទិញនេះទេ? ស្តុកនឹងត្រូវបានបញ្ចូលមកវិញ។" : "Cancel this order?")) {
                        updateStatus("CANCELLED", "Order cancelled");
                      }
                    }}
                  >
                    {isKh ? "បោះបង់" : "Cancel"}
                  </button>
                )}
              </div>
            </div>

            {/* Customer Contact Card */}
            <div className="drawer-card">
              <div className="card-header-row">
                <span className="card-section-title">{isKh ? "ព័ត៌មានអតិថិជន" : "Customer Information"}</span>
                <span className="badge blue">{order.channel}</span>
              </div>
              <div className="customer-info-box">
                <div className="customer-main-name">
                  <strong>{order.customer.name}</strong>
                  {order.customer.phone && (
                    <span className="customer-phone-pill">
                      {formatCambodiaPhone(order.customer.phone)}
                    </span>
                  )}
                </div>

                <div className="customer-quick-links">
                  {order.customer.phone && (
                    <a href={`tel:${order.customer.phone}`} className="button tiny-action">
                      <Phone size={12} />
                      {isKh ? "ទូរស័ព្ទ" : "Call"}
                    </a>
                  )}
                  <a
                    href={`https://t.me/${telegramHandle}`}
                    target="_blank"
                    rel="noreferrer"
                    className="button tiny-action"
                  >
                    <MessageCircle size={12} />
                    Telegram {order.customer.telegramUsername ? `(@${order.customer.telegramUsername.replace("@", "")})` : ""}
                  </a>
                  {order.customer.phone && (
                    <button
                      type="button"
                      className="button tiny-action"
                      onClick={() => copyPhone(order.customer.phone || "")}
                    >
                      {copiedPhone ? <Check size={12} /> : <Copy size={12} />}
                      {copiedPhone ? (isKh ? "បានចម្លង" : "Copied") : (isKh ? "ចម្លងលេខ" : "Copy")}
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Delivery & Logistics Card */}
            <div className="drawer-card">
              <div className="card-header-row">
                <span className="card-section-title">{isKh ? "ការដឹកជញ្ជូន" : "Delivery & Logistics"}</span>
                <span className="badge">{isKh ? courier.nameKh : courier.nameEn}</span>
              </div>
              <div className="logistics-body">
                <div className="logistics-row" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span>{isKh ? "លេខកូដតាមដាន (Tracking):" : "Tracking #:"}</span>
                  {editingTracking ? (
                    <div style={{ display: "flex", gap: "4px", alignItems: "center" }}>
                      <input
                        className="input"
                        style={{ height: "28px", fontSize: "0.85rem", width: "160px", padding: "2px 8px" }}
                        placeholder="ឧ. JNT123456"
                        value={trackingInput}
                        onChange={(e) => setTrackingInput(e.target.value)}
                        autoFocus
                      />
                      <button className="button primary tiny-action" disabled={savingTracking} onClick={() => void saveTracking(trackingInput)}>
                        {savingTracking ? "…" : (isKh ? "រក្សាទុក" : "Save")}
                      </button>
                      <button className="button tiny-action" onClick={() => setEditingTracking(false)}>
                        <X size={12} />
                      </button>
                    </div>
                  ) : (
                    <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                      <strong className="tracking-code">{effectiveTracking || "—"}</strong>
                      <button
                        type="button"
                        className="button tiny-action"
                        style={{ padding: "2px 6px", height: "24px" }}
                        title="កែប្រែលេខកូដដឹកជញ្ជូន"
                        onClick={() => {
                          setTrackingInput(effectiveTracking || "");
                          setEditingTracking(true);
                        }}
                      >
                        <Edit2 size={11} />
                      </button>
                    </div>
                  )}
                </div>
                {order.province && (
                  <div className="logistics-row">
                    <span>{isKh ? "ខេត្ត/ក្រុង:" : "Province/City:"}</span>
                    <strong>{order.province}</strong>
                  </div>
                )}
                <div className="logistics-row">
                  <span>{isKh ? "ទីតាំងដឹកជញ្ជូន:" : "Destination:"}</span>
                  <strong>{order.deliveryAddress || (isKh ? "មិនទាន់មានអាសយដ្ឋាន" : "No address")}</strong>
                </div>
                {meta.notes && (
                  <div className="logistics-note">
                    <small>{isKh ? "ចំណាំដឹកជញ្ជូន:" : "Delivery Note:"} {meta.notes}</small>
                  </div>
                )}
              </div>
            </div>

            {/* Items Breakdown Card */}
            <div className="drawer-card">
              <div className="card-header-row">
                <span className="card-section-title">{isKh ? "មុខទំនិញក្នុងកន្ត្រក" : "Order Items"}</span>
                <span className="badge">{order.items.length} {isKh ? "មុខ" : "items"}</span>
              </div>
              <div className="drawer-items-list">
                {order.items.map((item) => (
                  <div className="drawer-item-row" key={item.id}>
                    <div className="item-left">
                      <strong>{item.productName}</strong>
                      <small className="item-variant-label">
                        {item.variantName ? `ជម្រើស: ${item.variantName}` : (item.productSku ? `SKU: ${item.productSku}` : "")}
                      </small>
                    </div>
                    <div className="item-mid">
                      <span className="item-qty">x{item.quantity}</span>
                      <small className="item-unit-price">{formatUSD(Number(item.unitPrice))}</small>
                    </div>
                    <div className="item-right">
                      <strong>{formatUSD(Number(item.lineTotal))}</strong>
                      <small>{formatKHR(Number(item.lineTotal) * 4100)}</small>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Financial Summary & Payment */}
            <div className="drawer-card payment-summary-card">
              <div className="card-header-row">
                <span className="card-section-title">{isKh ? "ការទូទាត់ និងតម្លៃសរុប" : "Payment & Total"}</span>
                <span className={`badge ${payStatusInfo.colorClass}`}>
                  {isKh ? payStatusInfo.labelKh : payStatusInfo.labelEn}
                </span>
              </div>

              <div className="payment-method-row">
                <span>{isKh ? "វិធីសាស្ត្រទូទាត់:" : "Payment Method:"}</span>
                <div className="method-pill">
                  <strong>{isKh ? payMethod.nameKh : payMethod.nameEn}</strong>
                </div>
                <div style={{ display: "flex", gap: "6px", marginLeft: "auto" }}>
                  <button
                    type="button"
                    className={`button tiny-action ${effectivePayStatus === "PAID" ? "subtle" : "primary"}`}
                    disabled={busyStatus}
                    onClick={() => void togglePaymentStatus(effectivePayStatus)}
                  >
                    <CheckCircle2 size={13} />
                    <span>{effectivePayStatus === "PAID" ? (isKh ? "ប្ដូរជាមិនទាន់បង់" : "Mark Unpaid") : (isKh ? "សម្គាល់ថាបានបង់" : "Mark Paid")}</span>
                  </button>
                  <button
                    type="button"
                    className="button subtle tiny-action"
                    onClick={() => setShowKHQR(true)}
                  >
                    <QrCode size={13} />
                    <span>{isKh ? "ស្កេន KHQR" : "Show KHQR"}</span>
                  </button>
                </div>
              </div>

              <div className="finance-breakdown">
                <div className="finance-row">
                  <span>{isKh ? "តម្លៃទំនិញសរុប (Subtotal):" : "Subtotal:"}</span>
                  <span>{formatUSD(subtotalNum)}</span>
                </div>
                {discountNum > 0 && (
                  <div className="finance-row text-red-600">
                    <span>{isKh ? "បញ្ចុះតម្លៃ (Discount):" : "Discount:"}</span>
                    <span>-{formatUSD(discountNum)}</span>
                  </div>
                )}
                <div className="finance-row">
                  <span>{isKh ? "ថ្លៃដឹកជញ្ជូន (Delivery Fee):" : "Delivery Fee:"}</span>
                  <span>{formatUSD(deliveryNum)}</span>
                </div>
                <div className="finance-grand-row">
                  <span className="grand-label">{isKh ? "សរុបរួម:" : "Grand Total:"}</span>
                  <div className="grand-values">
                    <strong className="grand-usd">{formatUSD(totalNum)}</strong>
                    <span className="grand-khr">({formatKHR(totalNum * 4100)})</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Status History Timeline */}
            {order.history && order.history.length > 0 && (
              <div className="drawer-card">
                <div className="card-section-title">{isKh ? "ប្រវត្តិដំណាក់កាល" : "Order History"}</div>
                <div className="history-timeline">
                  {order.history.map((h) => (
                    <div className="history-node" key={h.id}>
                      <div className="history-dot" />
                      <div className="history-info">
                        <strong>{statusLabelsKh[h.to] || h.to}</strong>
                        {h.note && <small>{h.note}</small>}
                        <time>{new Date(h.createdAt).toLocaleString("en-GB")}</time>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Drawer Bottom Toolbar */}
          <div className="drawer-footer">
            {["DRAFT", "PENDING_CONFIRMATION"].includes(order.status) && (
              <button
                type="button"
                className="button"
                onClick={() => {
                  close();
                  onEdit(order.id);
                }}
              >
                <Edit2 size={14} />
                {isKh ? "កែប្រែការបញ្ជាទិញ" : "Edit Order"}
              </button>
            )}
            <button
              type="button"
              className="button"
              onClick={() => {
                if (window.confirm(isKh ? `លុបការបញ្ជាទិញ ${order.orderNumber}?` : `Delete order ${order.orderNumber}?`)) {
                  close();
                  onDelete(order.id);
                }
              }}
            >
              <Trash2 size={14} />
              {isKh ? "លុប" : "Delete"}
            </button>
            <button
              type="button"
              className="button primary"
              onClick={() => setShowPrint(true)}
            >
              <Printer size={14} />
              {isKh ? "បោះពុម្ពវិក្កយបត្រ / ស្លាក" : "Print Invoice / Label"}
            </button>
          </div>
        </div>
      </div>

      {showKHQR && (
        <KHQRModal
          orderNumber={order.orderNumber}
          totalUSD={totalNum}
          storeName={storeName}
          close={() => setShowKHQR(false)}
          lang={lang}
        />
      )}

      {showPrint && (
        <OrderPrintDialog
          order={printableData}
          storeName={storeName}
          storePhone={storePhone}
          storeAddress={storeAddress}
          exchangeRate={exchangeRate}
          close={() => setShowPrint(false)}
          lang={lang}
        />
      )}
    </>
  );
}
