"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import {
  Package,
  Plus,
  Sparkles,
  Trash2,
  Truck,
  X,
  CreditCard,
  MapPin,
  Check,
  AlertCircle,
} from "lucide-react";
import {
  CAMBODIA_COURIERS,
  CAMBODIA_PAYMENT_METHODS,
  CAMBODIA_PROVINCES,
  calculateCustomerTier,
  decodeOrderMetadata,
  encodeOrderMetadata,
  formatCambodiaPhone,
  formatDualCurrency,
  formatKHR,
  formatUSD,
  parseLiveSaleComment,
  toKhmerDigits,
} from "@/lib/cambodia";
import { useToast } from "./ui/toast-provider";
import { CustomerAddressItem } from "./customer-address-modal";

interface Customer {
  id: string;
  name: string;
  phone: string;
  email: string;
  channel: string;
  orderCount: number;
  totalSpent: number;
}

interface Product {
  id: string;
  name: string;
  sku: string;
  category: string;
  price: number;
  active: boolean;
  stock: number | null;
  imageUrl?: string | null;
  variants: {
    id: string;
    name: string;
    sku?: string | null;
    price: number | null;
    stock: number | null;
    active?: boolean;
  }[];
}

interface Order {
  id: string;
  orderNumber: string;
  customerId: string;
  customer: string;
  phone: string;
  status: string;
  channel: string;
  total: number;
  itemNames: string;
  createdAt: string;
}

export type EditableOrder = {
  id: string;
  customerId: string;
  channel: string;
  deliveryAddress: string | null;
  notes: string | null;
  courier?: string | null;
  trackingNumber?: string | null;
  paymentMethod?: string | null;
  paymentStatus?: string | null;
  province?: string | null;
  discount: number | string;
  deliveryFee: number | string;
  items: { productId: string | null; variantId: string | null; quantity: number }[];
};

interface OrderModalProps {
  customers: Customer[];
  products: Product[];
  close: () => void;
  created: (order: Order) => void;
  code: string;
  order?: EditableOrder;
  updated?: (order: Order) => void;
  lang?: "kh" | "en";
  initialMode?: "pos" | "social";
}

export function CambodiaOrderModal({
  customers,
  products,
  close,
  created,
  code,
  order,
  updated,
  lang = "kh",
  initialMode = "social",
}: OrderModalProps) {
  const notify = useToast();
  const isKh = lang === "kh";

  const initialMeta = decodeOrderMetadata(order?.notes);
  const [isPos, setIsPos] = useState(() => initialMode === "pos" || (order?.channel === "DIRECT"));

  const [items, setItems] = useState(() =>
    order?.items.map((item) => ({
      productId: item.productId ?? "",
      variantId: item.variantId ?? "",
      quantity: String(item.quantity),
    })) ?? [{ productId: "", variantId: "", quantity: "1" }]
  );

  const [customerId, setCustomerId] = useState(order?.customerId ?? (customers[0]?.id || ""));
  const [channel, setChannel] = useState(order?.channel ?? (initialMode === "pos" ? "DIRECT" : "DIRECT"));
  const [provinceId, setProvinceId] = useState(order?.province || initialMeta.provinceId || "PP");
  const [courierId, setCourierId] = useState(order?.courier || initialMeta.courier || (initialMode === "pos" ? "DIRECT_PICKUP" : "VET"));
  const [trackingNumber, setTrackingNumber] = useState(order?.trackingNumber || initialMeta.trackingNumber || "");
  const [paymentMethod, setPaymentMethod] = useState<"COD" | "KHQR" | "BANK_TRANSFER" | "CASH">((order?.paymentMethod as any) || initialMeta.paymentMethod || (initialMode === "pos" ? "CASH" : "COD"));
  const [deliveryFee, setDeliveryFee] = useState<string>(order ? String(order.deliveryFee) : (initialMode === "pos" ? "0" : "1.25"));
  const [discount, setDiscount] = useState<string>(order ? String(order.discount) : "0");
  const [deliveryAddress, setDeliveryAddress] = useState<string>(order?.deliveryAddress ?? (initialMode === "pos" ? "ទិញផ្ទាល់នៅហាង (Storefront Walk-in)" : ""));
  const [sellerNotes, setSellerNotes] = useState<string>(initialMeta.notes || "");

  function togglePos(enabled: boolean) {
    setIsPos(enabled);
    if (enabled) {
      setChannel("DIRECT");
      setDeliveryFee("0");
      setCourierId("DIRECT_PICKUP");
      setPaymentMethod("CASH");
      if (!deliveryAddress) setDeliveryAddress("ទិញផ្ទាល់នៅហាង (Storefront Walk-in)");
    } else {
      setChannel("FACEBOOK");
      setDeliveryFee("1.25");
      setCourierId("VET");
      setPaymentMethod("COD");
      if (deliveryAddress === "ទិញផ្ទាល់នៅហាង (Storefront Walk-in)") setDeliveryAddress("");
    }
  }

  // Smart Live Sale Parser State
  const [showLiveParser, setShowLiveParser] = useState(false);
  const [liveSaleText, setLiveSaleText] = useState("");
  const [parserSuccess, setParserSuccess] = useState("");

  // Customer Addresses State
  const [savedAddresses, setSavedAddresses] = useState<CustomerAddressItem[]>([]);
  const [selectedAddressId, setSelectedAddressId] = useState("");

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const idempotencyKey = useRef<string | null>(null);

  // Fetch customer saved addresses
  useEffect(() => {
    if (!customerId) return;
    let active = true;
    fetch(`/api/customers/${customerId}/addresses`)
      .then(async (res) => {
        const data = await res.json();
        if (active && res.ok && data.addresses) {
          setSavedAddresses(data.addresses);
          const defaultAddr = data.addresses.find((a: CustomerAddressItem) => a.isDefault);
          if (defaultAddr && !order) {
            setDeliveryAddress(defaultAddr.address);
          }
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [customerId, order]);

  // Handle province change: auto-set courier fee preset
  function handleProvinceChange(newProvId: string) {
    setProvinceId(newProvId);
    const prov = CAMBODIA_PROVINCES.find((p) => p.id === newProvId);
    if (prov) {
      setDeliveryFee(prov.defaultFeeUSD.toFixed(2));
    }
  }

  // Handle saved address select
  function handleSelectSavedAddress(addrId: string) {
    setSelectedAddressId(addrId);
    const addr = savedAddresses.find((a) => a.id === addrId);
    if (addr) {
      setDeliveryAddress(addr.address);
      for (const p of CAMBODIA_PROVINCES) {
        if (addr.address.includes(p.nameKh) || addr.address.toLowerCase().includes(p.nameEn.toLowerCase())) {
          setProvinceId(p.id);
          setDeliveryFee(p.defaultFeeUSD.toFixed(2));
          break;
        }
      }
    }
  }

  // Parse live comment
  function runLiveParser() {
    if (!liveSaleText.trim()) return;
    const parsed = parseLiveSaleComment(liveSaleText);
    let matchedCount = 0;

    // 1. Phone / Customer match
    if (parsed.phone) {
      const cleanTarget = parsed.phone.replace(/[\s\-\(\)]/g, "");
      const matchedCust = customers.find(
        (c) => c.phone && c.phone.replace(/[\s\-\(\)]/g, "") === cleanTarget
      );
      if (matchedCust) {
        setCustomerId(matchedCust.id);
        matchedCount++;
      }
    }

    // 2. Province match
    if (parsed.province) {
      setProvinceId(parsed.province.id);
      setDeliveryFee(parsed.province.defaultFeeUSD.toFixed(2));
      matchedCount++;
    }

    // 3. Address
    if (parsed.address) {
      setDeliveryAddress(parsed.address);
      matchedCount++;
    }

    // 4. Products match
    if (parsed.items.length > 0) {
      const newLines: typeof items = [];
      for (const parsedItem of parsed.items) {
        const foundProduct = products.find((p) =>
          p.name.toLowerCase().includes(parsedItem.keyword.toLowerCase())
        );
        if (foundProduct) {
          newLines.push({
            productId: foundProduct.id,
            variantId: foundProduct.variants[0]?.id || "",
            quantity: String(parsedItem.quantity),
          });
        }
      }
      if (newLines.length > 0) {
        setItems(newLines);
        matchedCount += newLines.length;
      }
    }

    setParserSuccess(
      isKh
        ? `បានរកឃើញ និងបញ្ចូលទិន្នន័យ ${matchedCount} ចំណុចដោយជោគជ័យ!`
        : `Extracted ${matchedCount} fields successfully!`
    );
    setTimeout(() => setParserSuccess(""), 4000);
  }

  function updateItem(index: number, key: "productId" | "variantId" | "quantity", value: string) {
    setItems((old) =>
      old.map((item, i) =>
        i === index
          ? { ...item, [key]: value, ...(key === "productId" ? { variantId: "" } : {}) }
          : item
      )
    );
  }

  const subtotalEstimated = items.reduce((sum, line) => {
    const product = products.find((entry) => entry.id === line.productId);
    const variant = product?.variants.find((entry) => entry.id === line.variantId);
    return sum + (variant?.price ?? product?.price ?? 0) * Math.max(0, Number(line.quantity) || 0);
  }, 0);

  const discountNum = Math.max(0, Number(discount) || 0);
  const deliveryFeeNum = Math.max(0, Number(deliveryFee) || 0);
  const grandTotalEstimated = Math.max(0, subtotalEstimated - discountNum + deliveryFeeNum);

  const selectedCustomer = customers.find((c) => c.id === customerId);
  const customerTier = selectedCustomer
    ? calculateCustomerTier(selectedCustomer.orderCount, selectedCustomer.totalSpent)
    : null;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setBusy(true);
    idempotencyKey.current ??= crypto.randomUUID();

    const mode = (event.nativeEvent as SubmitEvent).submitter instanceof HTMLButtonElement
      ? (event.nativeEvent as SubmitEvent).submitter?.getAttribute("value")
      : null;

    const isPosOrder = mode === "pos" || (isPos && !order && mode !== "draft");
    const resolvedStatus = isPosOrder ? "CONFIRMED" : mode === "draft" ? "DRAFT" : "PENDING_CONFIRMATION";
    const resolvedPaymentStatus: "UNPAID" | "PAID" | "PARTIAL" | "REFUNDED" = isPosOrder
      ? "PAID"
      : ((order?.paymentStatus as "UNPAID" | "PAID" | "PARTIAL" | "REFUNDED" | undefined) ||
          (paymentMethod === "CASH" || paymentMethod === "KHQR" ? "PAID" : "UNPAID"));

    // Encode metadata into notes
    const fullNotes = encodeOrderMetadata({
      courier: isPosOrder ? "ទទួលផ្ទាល់នៅហាង" : courierId,
      trackingNumber,
      paymentMethod,
      paymentStatus: resolvedPaymentStatus,
      provinceId,
      notes: sellerNotes,
    });

    try {
      const response = await fetch(order ? `/api/orders/${order.id}` : "/api/orders", {
        method: order ? "PATCH" : "POST",
        headers: {
          "Content-Type": "application/json",
          ...(order ? {} : { "Idempotency-Key": idempotencyKey.current }),
        },
        body: JSON.stringify({
          customerId,
          channel: isPosOrder ? "DIRECT" : channel,
          status: resolvedStatus,
          idempotencyKey: idempotencyKey.current,
          deliveryAddress: isPosOrder ? (deliveryAddress.trim() || "ទិញផ្ទាល់នៅហាង (Storefront Walk-in)") : deliveryAddress.trim() || null,
          notes: fullNotes,
          courier: isPosOrder ? "ទទួលផ្ទាល់នៅហាង" : courierId,
          trackingNumber: trackingNumber.trim() || null,
          paymentMethod,
          paymentStatus: resolvedPaymentStatus,
          province: provinceId,
          discount: discountNum,
          deliveryFee: isPosOrder ? 0 : deliveryFeeNum,
          items: items.map((item) => ({
            productId: item.productId,
            variantId: item.variantId || undefined,
            quantity: Number(item.quantity),
          })),
        }),
      });

      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "មិនអាចបង្កើតការបញ្ជាទិញបានទេ។");

      idempotencyKey.current = null;
      const customer = customers.find((entry) => entry.id === result.order.customerId);
      const saved: Order = {
        id: result.order.id,
        orderNumber: result.order.orderNumber,
        customerId: result.order.customerId,
        customer: customer?.name ?? "អតិថិជន",
        phone: customer?.phone ?? "",
        status: result.order.status,
        channel: result.order.channel,
        total: Number(result.order.total),
        itemNames: result.order.items
          .map((item: { productName: string; variantName?: string | null }) =>
            item.productName + (item.variantName ? ` · ${item.variantName}` : "")
          )
          .join(", "),
        createdAt: result.order.createdAt,
      };

      if (order) updated?.(saved);
      else created(saved);

      notify({
        kind: "success",
        title: isPosOrder ? (isKh ? "បានបញ្ចប់ការលក់ POS" : "POS Sale Complete") : order ? (isKh ? "បានកែប្រែការបញ្ជាទិញ" : "Order updated") : (isKh ? "បានបង្កើតការបញ្ជាទិញ" : "Order created"),
        description: isPosOrder ? `${saved.orderNumber} (បានទូទាត់រួច និងកាត់ស្តុក)` : saved.orderNumber,
      });
      close();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "មិនអាចបង្កើតការបញ្ជាទិញបានទេ។");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) close(); }}>
      <section className="modal modal-wide" role="dialog" aria-modal="true">
        <div className="modal-head">
          <div>
            <h2>{order ? (isKh ? "កែប្រែការបញ្ជាទិញ" : "Edit Order") : isPos ? (isKh ? "🏪 ការលក់ផ្ទាល់ / POS (Direct Storefront Sale)" : "Storefront POS Sale") : (isKh ? "📱 បង្កើតការបញ្ជាទិញតាមបណ្ដាញ (Social Order)" : "Create Social Order")}</h2>
            <p>{isKh ? "ប្រព័ន្ធគ្រប់គ្រងការបញ្ជាទិញ គាំទ្ររូបិយប័ណ្ណពីរ និងដឹកជញ្ជូនទូទាំងកម្ពុជា" : "Cambodia Social Seller Order Entry"}</p>
          </div>
          <button className="icon-button" aria-label="Close" onClick={close}>
            <X size={17} />
          </button>
        </div>

        {/* Order Mode Switcher */}
        {!order && (
          <div style={{ display: "flex", gap: 6, margin: "10px 0 12px", padding: 3, background: "#f1f5f9", borderRadius: 8, width: "fit-content" }}>
            <button
              type="button"
              className={`button tiny ${!isPos ? "primary" : "subtle"}`}
              onClick={() => togglePos(false)}
              style={{ borderRadius: 6, height: 28, fontSize: 11 }}
            >
              📱 {isKh ? "ការបញ្ជាទិញតាមបណ្ដាញ (Social Order)" : "Social Order"}
            </button>
            <button
              type="button"
              className={`button tiny ${isPos ? "primary" : "subtle"}`}
              onClick={() => togglePos(true)}
              style={{ borderRadius: 6, height: 28, fontSize: 11, background: isPos ? "#16a34a" : undefined }}
            >
              🏪 {isKh ? "ការលក់ផ្ទាល់ / POS (Direct Storefront)" : "Storefront POS"}
            </button>
          </div>
        )}

        {isPos && (
          <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 8, padding: "8px 12px", marginBottom: 12, fontSize: 11, color: "#166534", display: "flex", alignItems: "center", gap: 6 }}>
            <Check size={14} style={{ flexShrink: 0 }} />
            <span><strong>របៀបលក់ផ្ទាល់ (POS Mode):</strong> ការបញ្ជាទិញនឹងត្រូវបានកត់ត្រាជា <strong>បានបញ្ជាក់ (Confirmed)</strong> និង <strong>បានទូទាត់រួច (Paid)</strong> ព្រមទាំងកាត់ស្តុកភ្លាមៗ។</span>
          </div>
        )}

        <form onSubmit={submit}>
          {error && <div className="error-banner">{error}</div>}

          {/* Smart Live Comment Order Parser Button & Expander */}
          <div className="live-parser-box">
            <div className="flex justify-between items-center">
              <button
                type="button"
                className="button subtle tiny-action"
                onClick={() => setShowLiveParser((prev) => !prev)}
              >
                <Sparkles size={14} className="text-blue-600" />
                <strong>{isKh ? "✨ បិទភ្ជាប់អត្ថបទកម្មង់រហ័ស (Smart Paste / Live Order Parser)" : "✨ Smart Paste Live Sale Order"}</strong>
              </button>
              {parserSuccess && <span className="text-emerald-700 text-xs font-semibold">{parserSuccess}</span>}
            </div>

            {showLiveParser && (
              <div className="live-parser-row">
                <textarea
                  rows={2}
                  value={liveSaleText}
                  onChange={(e) => setLiveSaleText(e.target.value)}
                  placeholder={
                    isKh
                      ? "បិទភ្ជាប់អត្ថបទពី Live ឬ Chat ឧ. 012 889 977 សុខា ភ្នំពេញ ទួលគោក យកអាវស ២..."
                      : "Paste comment: 012 889 977 Sokha Phnom Penh Toul Kork 2x Serum..."
                  }
                />
                <button
                  type="button"
                  className="button primary"
                  onClick={runLiveParser}
                >
                  {isKh ? "ញែកទិន្នន័យ" : "Parse"}
                </button>
              </div>
            )}
          </div>

          <div className="form-grid">
            {/* Customer Selector & Customer Trust Badge */}
            <div className="form-field">
              <div className="flex justify-between items-center">
                <label htmlFor="customerId">{isKh ? "អតិថិជន" : "Customer"}</label>
                {customerTier && (
                  <span className={customerTier.badgeClass}>
                    {isKh ? customerTier.labelKh : customerTier.labelEn}
                  </span>
                )}
              </div>
              <select
                id="customerId"
                value={customerId}
                onChange={(e) => setCustomerId(e.target.value)}
                required
              >
                <option value="" disabled>{isKh ? "ជ្រើសរើសអតិថិជន" : "Select customer"}</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} {c.phone ? `· ${c.phone}` : ""} ({isKh ? "ទិញ " : "Orders "}{c.orderCount})
                  </option>
                ))}
              </select>
            </div>

            {/* Sales Channel */}
            <div className="form-field">
              <label htmlFor="orderChannel">{isKh ? "បណ្ដាញលក់" : "Sales Channel"}</label>
              <select
                id="orderChannel"
                value={channel}
                onChange={(e) => setChannel(e.target.value)}
              >
                <option value="DIRECT">{isKh ? "ផ្ទាល់ (Direct / Walk-in)" : "Direct"}</option>
                <option value="FACEBOOK">{isKh ? "ហ្វេសប៊ុក (Facebook Live / Page)" : "Facebook"}</option>
                <option value="TIKTOK">{isKh ? "ធីកតុក (TikTok Live / Shop)" : "TikTok"}</option>
                <option value="TELEGRAM">{isKh ? "តេលេក្រាម (Telegram Chat / Group)" : "Telegram"}</option>
                <option value="OTHER">{isKh ? "ផ្សេងៗ (Other)" : "Other"}</option>
              </select>
            </div>

            {/* Saved Delivery Addresses for Customer */}
            {savedAddresses.length > 0 && (
              <div className="form-field full">
                <label className="text-blue-700 font-semibold text-xs flex items-center gap-1">
                  <MapPin size={12} />
                  {isKh ? "ជ្រើសអាសយដ្ឋានដែលបានរក្សាទុករបស់អតិថិជន" : "Customer Saved Addresses"}
                </label>
                <select
                  value={selectedAddressId}
                  onChange={(e) => handleSelectSavedAddress(e.target.value)}
                >
                  <option value="">{isKh ? "-- ជ្រើសអាសយដ្ឋានដែលបានរក្សាទុក --" : "-- Select saved address --"}</option>
                  {savedAddresses.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.label ? `[${a.label}] ` : ""}{a.recipient} · {a.phone} · {a.address} {a.isDefault ? " (Default)" : ""}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Cambodia Province Selector */}
            <div className="form-field">
              <label>{isKh ? "រាជធានី / ខេត្តគោលដៅ" : "Destination Province"}</label>
              <select
                value={provinceId}
                onChange={(e) => handleProvinceChange(e.target.value)}
              >
                {CAMBODIA_PROVINCES.map((p) => (
                  <option key={p.id} value={p.id}>
                    {isKh ? p.nameKh : p.nameEn} ({isKh ? "ថ្លៃដឹកលំនាំដើម " : "Default fee "}${p.defaultFeeUSD.toFixed(2)})
                  </option>
                ))}
              </select>
            </div>

            {/* Cambodia Courier Selector */}
            <div className="form-field">
              <label>{isKh ? "សេវាដឹកជញ្ជូន" : "Delivery Courier"}</label>
              <select
                value={courierId}
                onChange={(e) => setCourierId(e.target.value)}
              >
                {CAMBODIA_COURIERS.map((c) => (
                  <option key={c.id} value={c.id}>
                    {isKh ? c.nameKh : c.nameEn}
                  </option>
                ))}
              </select>
            </div>

            {/* Tracking Number */}
            <div className="form-field">
              <label>{isKh ? "លេខកូដតាមដាន (Tracking Code)" : "Tracking Number"}</label>
              <input
                type="text"
                value={trackingNumber}
                onChange={(e) => setTrackingNumber(e.target.value)}
                placeholder="VET-..., JT-..."
              />
            </div>

            {/* Payment Method Selector */}
            <div className="form-field">
              <label>{isKh ? "វិធីសាស្ត្រទូទាត់ប្រាក់" : "Payment Method"}</label>
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value as any)}
              >
                {CAMBODIA_PAYMENT_METHODS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {isKh ? p.nameKh : p.nameEn}
                  </option>
                ))}
              </select>
            </div>

            {/* Order Items List */}
            {items.map((item, index) => {
              const selectedProd = products.find((p) => p.id === item.productId);
              const selectedVariant = selectedProd?.variants.find((v) => v.id === item.variantId);
              const availableStock = selectedVariant ? selectedVariant.stock : selectedProd?.stock;
              const isOutOfStock = availableStock !== null && availableStock !== undefined && availableStock <= 0;
              const isLowStock = availableStock !== null && availableStock !== undefined && availableStock > 0 && availableStock <= 5;
              const isOverStock = availableStock !== null && availableStock !== undefined && Number(item.quantity) > availableStock;

              return (
                <div className="item-editor form-field full" key={index}>
                  <label>{isKh ? `មុខទំនិញ ${toKhmerDigits(index + 1)}` : `Item ${index + 1}`}</label>
                  <div className="toolbar">
                    <select
                      aria-label={`Product ${index + 1}`}
                      value={item.productId}
                      onChange={(e) => updateItem(index, "productId", e.target.value)}
                      required
                    >
                      <option value="" disabled>{isKh ? "ជ្រើសរើសផលិតផល" : "Select product"}</option>
                      {products
                        .filter((p) => p.active || item.productId === p.id)
                        .map((p) => {
                          const stockTag = p.stock === null ? "" : p.stock <= 0 ? " [❌ អស់ស្តុក]" : p.stock <= 5 ? ` [⚠️ ស្តុកទាប: ${p.stock}]` : ` [ស្តុក: ${p.stock}]`;
                          return (
                            <option key={p.id} value={p.id}>
                              {p.name} · {formatUSD(p.price)} ({formatKHR(p.price * 4100)}){stockTag}
                            </option>
                          );
                        })}
                    </select>

                    {products.find((p) => p.id === item.productId)?.variants.length ? (
                      <select
                        aria-label={`Variant ${index + 1}`}
                        value={item.variantId}
                        onChange={(e) => updateItem(index, "variantId", e.target.value)}
                        required
                      >
                        <option value="" disabled>{isKh ? "ជ្រើសរើសជម្រើស" : "Select variant"}</option>
                        {products
                          .find((p) => p.id === item.productId)
                          ?.variants.filter((v) => v.active !== false || item.variantId === v.id)
                          .map((v) => {
                            const vStockTag = v.stock === null ? "" : v.stock <= 0 ? " [❌ អស់ស្តុក]" : v.stock <= 5 ? ` [⚠️ ស្តុកទាប: ${v.stock}]` : ` [ស្តុក: ${v.stock}]`;
                            return (
                              <option key={v.id} value={v.id}>
                                {v.name}
                                {v.price ? ` · ${formatUSD(v.price)}` : ""}
                                {vStockTag}
                              </option>
                            );
                          })}
                      </select>
                    ) : null}

                    <input
                      aria-label={`Quantity ${index + 1}`}
                      type="number"
                      min="1"
                      max="1000"
                      value={item.quantity}
                      onChange={(e) => updateItem(index, "quantity", e.target.value)}
                      required
                    />

                    {items.length > 1 && (
                      <button
                        type="button"
                        className="icon-button"
                        aria-label="Remove item"
                        onClick={() => setItems((old) => old.filter((_, i) => i !== index))}
                      >
                        <X size={14} />
                      </button>
                    )}
                  </div>

                  {selectedProd && (
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4, fontSize: 11 }}>
                      {isOutOfStock ? (
                        <span style={{ color: "#dc2626", fontWeight: 700, display: "inline-flex", alignItems: "center", gap: 3 }}>
                          <AlertCircle size={11} /> ❌ អស់ស្តុកហើយ (0 ឯកតា)
                        </span>
                      ) : isLowStock ? (
                        <span style={{ color: "#d97706", fontWeight: 700, display: "inline-flex", alignItems: "center", gap: 3 }}>
                          <AlertCircle size={11} /> ⚠️ ជិតអស់ស្តុក (នៅសល់តែ {availableStock} ឯកតា)
                        </span>
                      ) : availableStock !== null && availableStock !== undefined ? (
                        <span style={{ color: "#16a34a", fontWeight: 600 }}>
                          ✓ ស្តុកនៅសល់: {availableStock} ឯកតា
                        </span>
                      ) : (
                        <span style={{ color: "#64748b" }}>មិនបានកំណត់ចំនួនស្តុក</span>
                      )}
                      {isOverStock && (
                        <span style={{ color: "#dc2626", fontWeight: 700 }}>
                          (⚠️ ចំនួនដែលបញ្ចូលលើសពីស្តុកដែលមាន!)
                        </span>
                      )}
                    </div>
                  )}
                </div>
              );
            })}

            <button
              type="button"
              className="button subtle full"
              onClick={() => setItems((old) => [...old, { productId: "", variantId: "", quantity: "1" }])}
            >
              <Plus size={14} /> {isKh ? "បន្ថែមមុខទំនិញ" : "Add Item"}
            </button>

            {/* Financial Fees */}
            <div className="form-field">
              <label>{isKh ? "ថ្លៃដឹកជញ្ជូន ($)" : "Delivery Fee ($)"}</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={deliveryFee}
                onChange={(e) => setDeliveryFee(e.target.value)}
              />
            </div>

            <div className="form-field">
              <label>{isKh ? "បញ្ចុះតម្លៃ ($)" : "Discount ($)"}</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={discount}
                onChange={(e) => setDiscount(e.target.value)}
              />
            </div>

            {/* Delivery Address */}
            <div className="form-field full">
              <label>{isKh ? "អាសយដ្ឋានដឹកជញ្ជូន" : "Delivery Address"}</label>
              <textarea
                rows={2}
                value={deliveryAddress}
                onChange={(e) => setDeliveryAddress(e.target.value)}
                placeholder={isKh ? "ខណ្ឌ/ស្រុក សង្កាត់/ឃុំ ផ្លូវ ផ្ទះលេខ..." : "Street, house, district..."}
              />
            </div>

            {/* Notes */}
            <div className="form-field full">
              <label>{isKh ? "កំណត់ចំណាំរបស់អ្នកលក់" : "Seller Notes"}</label>
              <input
                type="text"
                value={sellerNotes}
                onChange={(e) => setSellerNotes(e.target.value)}
                placeholder={isKh ? "ឧ. សូមតេមុនដឹក..." : "e.g. Call before delivery..."}
              />
            </div>
          </div>

          {/* Dual Currency Financial Breakdown Banner */}
          <div className="order-total-cambodia-box">
            <div className="flex justify-between items-center text-xs text-slate-500 mb-1">
              <span>{isKh ? "តម្លៃទំនិញ:" : "Subtotal:"} {formatUSD(subtotalEstimated)}</span>
              <span>{isKh ? "ថ្លៃដឹក:" : "Shipping:"} +{formatUSD(deliveryFeeNum)}</span>
              {discountNum > 0 && <span>{isKh ? "បញ្ចុះតម្លៃ:" : "Discount:"} -{formatUSD(discountNum)}</span>}
            </div>
            <div className="flex justify-between items-baseline">
              <span className="font-bold text-slate-800 text-sm">
                {isKh ? "សរុបចុងក្រោយ (Grand Total):" : "Grand Total:"}
              </span>
              <div className="text-right">
                <strong className="text-xl text-blue-900 block">
                  {formatUSD(grandTotalEstimated)}
                </strong>
                <span className="text-xs text-slate-600 font-semibold">
                  ≈ {formatKHR(grandTotalEstimated * 4100)} (1$ = 4,100៛)
                </span>
              </div>
            </div>
          </div>

          <div className="modal-actions">
            <button type="button" className="button" onClick={close}>
              {isKh ? "បោះបង់" : "Cancel"}
            </button>
            {!order && !isPos && (
              <button
                type="submit"
                name="saveMode"
                value="draft"
                className="button"
                disabled={busy}
              >
                {isKh ? "រក្សាទុកសេចក្ដីព្រាង" : "Save as Draft"}
              </button>
            )}
            {isPos && !order ? (
              <button
                type="submit"
                name="saveMode"
                value="pos"
                className="button primary"
                disabled={busy}
                style={{ background: "#16a34a", borderColor: "#15803d", fontWeight: 700 }}
              >
                {busy
                  ? (isKh ? "កំពុងបញ្ចប់ការលក់…" : "Processing…")
                  : (isKh ? "✓ បញ្ចប់ការលក់ & កាត់ស្តុក (POS Sale)" : "Complete POS Sale")}
              </button>
            ) : (
              <button
                type="submit"
                name="saveMode"
                value={order ? "" : "pending"}
                className="button primary"
                disabled={busy}
              >
                {busy
                  ? (isKh ? "កំពុងរក្សាទុក…" : "Saving…")
                  : order
                  ? (isKh ? "រក្សាទុកការកែប្រែ" : "Save Changes")
                  : (isKh ? "រក្សាទុកការបញ្ជាទិញរង់ចាំ" : "Save Order")}
              </button>
            )}
          </div>
        </form>
      </section>
    </div>
  );
}
