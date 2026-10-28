"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Package,
  Calendar,
  Download,
  FileSpreadsheet,
  Printer,
  CheckCircle2,
  X,
  Truck,
  Check,
  Search,
  ExternalLink,
  AlertCircle,
} from "lucide-react";
import { formatKHR, formatUSD, usdToKhr } from "@/lib/cambodia";
import {
  DailyPreparationData,
  DailyPreparationOrder,
  exportDailyPreparationXlsx,
  openDailyPreparationPrintView,
} from "@/lib/report-export";
import { useToast } from "@/components/ui/toast-provider";

interface DailyPreparationModalProps {
  close: () => void;
  storeName: string;
  storePhone?: string;
  storeAddress?: string;
  exchangeRate?: number;
  currency: string;
  onOpenOrderDrawer?: (orderId: string) => void;
}

export function DailyPreparationModal({
  close,
  storeName,
  storePhone,
  storeAddress,
  exchangeRate = 4100,
  currency,
  onOpenOrderDrawer,
}: DailyPreparationModalProps) {
  const notify = useToast();
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [orders, setOrders] = useState<DailyPreparationOrder[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState<"items" | "manifest">("items");
  const [statusFilter, setStatusFilter] = useState("PACKABLE"); // PACKABLE, ALL, CONFIRMED, SHIPPED

  // Local checklist states
  const [checkedItems, setCheckedItems] = useState<Record<string, boolean>>({});
  const [packedOrders, setPackedOrders] = useState<Record<string, boolean>>({});
  const [dispatchedOrders, setDispatchedOrders] = useState<Record<string, boolean>>({});

  // Fetch orders
  useEffect(() => {
    let live = true;
    setLoading(true);
    setError("");

    // Fetch orders with high pageSize for the preparation sheet
    fetch("/api/orders?pageSize=100&page=1")
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "មិនអាចផ្ទុកទិន្នន័យការបញ្ជាទិញបានទេ។");
        if (live && Array.isArray(data.orders)) {
          const mapped: DailyPreparationOrder[] = data.orders.map((o: any) => ({
            id: o.id,
            orderNumber: o.orderNumber,
            customer: o.customer?.name ?? "—",
            phone: o.customer?.phone ?? "",
            province: o.province,
            courier: o.courier,
            trackingNumber: o.trackingNumber,
            paymentMethod: o.paymentMethod,
            paymentStatus: o.paymentStatus,
            total: Number(o.total),
            status: o.status,
            itemNames: o.items?.map((it: any) => `${it.productName}${it.variantName ? ` (${it.variantName})` : ""} ×${it.quantity}`).join(", ") ?? "",
            items: o.items?.map((it: any) => ({
              productName: it.productName,
              variantName: it.variantName,
              quantity: it.quantity,
              unitPrice: Number(it.unitPrice),
            })) ?? [],
            createdAt: o.createdAt,
          }));
          setOrders(mapped);
        }
      })
      .catch((err) => {
        if (live) setError(err instanceof Error ? err.message : "មិនអាចផ្ទុកទិន្នន័យបានទេ។");
      })
      .finally(() => {
        if (live) setLoading(false);
      });

    return () => {
      live = false;
    };
  }, []);

  // Filter orders by date & status
  const filteredOrders = useMemo(() => {
    return orders.filter((o) => {
      const orderDate = o.createdAt.slice(0, 10);
      if (date && orderDate !== date) return false;

      if (statusFilter === "PACKABLE") {
        return ["CONFIRMED", "PROCESSING", "PENDING_CONFIRMATION"].includes(o.status);
      }
      if (statusFilter === "SHIPPED") {
        return o.status === "SHIPPED";
      }
      if (statusFilter === "DELIVERED") {
        return o.status === "DELIVERED";
      }
      return true;
    });
  }, [orders, date, statusFilter]);

  // Aggregate item packing list
  const aggregatedItems = useMemo(() => {
    const itemMap = new Map<string, { key: string; productName: string; variantName: string; quantity: number }>();
    filteredOrders.forEach((o) => {
      o.items.forEach((it) => {
        const key = `${it.productName}__${it.variantName || ""}`;
        const existing = itemMap.get(key);
        if (existing) {
          existing.quantity += it.quantity;
        } else {
          itemMap.set(key, {
            key,
            productName: it.productName,
            variantName: it.variantName || "ស្តង់ដារ",
            quantity: it.quantity,
          });
        }
      });
    });
    return Array.from(itemMap.values()).sort((a, b) => b.quantity - a.quantity);
  }, [filteredOrders]);

  // Totals
  const totalUnits = useMemo(() => aggregatedItems.reduce((sum, it) => sum + it.quantity, 0), [aggregatedItems]);
  const totalSales = useMemo(() => filteredOrders.reduce((sum, o) => sum + o.total, 0), [filteredOrders]);
  const codAmount = useMemo(() => filteredOrders.filter((o) => o.paymentStatus !== "PAID").reduce((sum, o) => sum + o.total, 0), [filteredOrders]);
  const paidAmount = useMemo(() => filteredOrders.filter((o) => o.paymentStatus === "PAID").reduce((sum, o) => sum + o.total, 0), [filteredOrders]);

  const prepData: DailyPreparationData = useMemo(() => ({
    date,
    storeName,
    storePhone,
    storeAddress,
    currency,
    exchangeRate,
    orders: filteredOrders,
  }), [date, storeName, storePhone, storeAddress, currency, exchangeRate, filteredOrders]);

  async function handleExportExcel() {
    if (!filteredOrders.length) {
      notify({ kind: "info", title: "មិនមានការបញ្ជាទិញ", description: "មិនមានការបញ្ជាទិញសម្រាប់កាលបរិច្ឆេទនេះទេ។" });
      return;
    }
    try {
      await exportDailyPreparationXlsx(prepData);
      notify({ kind: "success", title: "បានទាញយក Excel", description: `សន្លឹកត្រៀមទំនិញ ${date}` });
    } catch (cause) {
      notify({ kind: "error", title: "មានបញ្ហា", description: cause instanceof Error ? cause.message : "មិនអាចបង្កើត Excel បានទេ។" });
    }
  }

  function handlePrint() {
    if (!filteredOrders.length) {
      notify({ kind: "info", title: "មិនមានការបញ្ជាទិញ", description: "មិនមានការបញ្ជាទិញសម្រាប់កាលបរិច្ឆេទនេះទេ។" });
      return;
    }
    try {
      openDailyPreparationPrintView(prepData);
      notify({ kind: "info", title: "បានបើកផ្ទាំងបោះពុម្ព", description: "ជ្រើស «Save as PDF» ឬជ្រើសម៉ាស៊ីនបោះពុម្ពរបស់អ្នក។" });
    } catch (cause) {
      notify({ kind: "error", title: "មានបញ្ហា", description: cause instanceof Error ? cause.message : "សូមអនុញ្ញាត pop-up ក្នុង Browser។" });
    }
  }

  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <section
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label="សន្លឹកត្រៀមទំនិញ និងសង្ខេបការលក់ប្រចាំថ្ងៃ"
        style={{ width: "min(960px, 96vw)", maxHeight: "90vh", display: "flex", flexDirection: "column" }}
      >
        {/* Modal Header */}
        <div className="modal-head" style={{ borderBottom: "1px solid #e2e8f0", paddingBottom: 14 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <h2 style={{ fontSize: 18, color: "#142c68", margin: 0 }}>
                📋 សន្លឹកត្រៀមទំនិញ និងសង្ខេបការលក់ប្រចាំថ្ងៃ
              </h2>
              <span className="badge blue" style={{ fontSize: 11 }}>
                Daily Dispatch
              </span>
            </div>
            <p style={{ margin: "4px 0 0", fontSize: 12, color: "#64748b" }}>
              រៀបចំទំនិញវេចខ្ចប់ ផ្ទៀងផ្ទាត់បញ្ជីដឹកជញ្ជូន (Courier Manifest) និងនាំចេញឯកសារសម្រាប់ម្ចាស់ហាង និងអ្នកដឹក។
            </p>
          </div>
          <button className="icon-button" aria-label="បិទ" onClick={close}>
            <X size={18} />
          </button>
        </div>

        {/* Toolbar & Filters */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: 10,
            padding: "12px 0",
            borderBottom: "1px solid #f1f5f9",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 600 }}>
              <Calendar size={14} color="#2563eb" />
              កាលបរិច្ឆេទ:
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                style={{
                  height: 32,
                  border: "1px solid #cbd5e1",
                  borderRadius: 6,
                  padding: "0 8px",
                  fontSize: 12,
                }}
              />
            </label>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="select"
              style={{ height: 32, fontSize: 12 }}
            >
              <option value="PACKABLE">ត្រូវរៀបចំវេចខ្ចប់ (រង់ចាំ &amp; បានបញ្ជាក់)</option>
              <option value="ALL">ការបញ្ជាទិញទាំងអស់</option>
              <option value="SHIPPED">បានដឹកជញ្ជូន (Shipped)</option>
              <option value="DELIVERED">បានប្រគល់ (Delivered)</option>
            </select>
          </div>

          <div style={{ display: "flex", gap: 8 }}>
            <button
              type="button"
              className="button"
              onClick={() => void handleExportExcel()}
              disabled={loading || !filteredOrders.length}
              style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, height: 32 }}
            >
              <FileSpreadsheet size={14} /> នាំចេញ Excel (.xlsx)
            </button>
            <button
              type="button"
              className="button primary"
              onClick={handlePrint}
              disabled={loading || !filteredOrders.length}
              style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, height: 32, fontWeight: 700 }}
            >
              <Printer size={14} /> បោះពុម្ពសន្លឹកវេចខ្ចប់ (Print)
            </button>
          </div>
        </div>

        {/* KPI Strip */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
            gap: 10,
            padding: "12px 0",
          }}
        >
          <div style={{ background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 8, padding: "8px 12px" }}>
            <small style={{ color: "#1e40af", fontSize: 11, fontWeight: 600 }}>ការបញ្ជាទិញសរុប</small>
            <strong style={{ display: "block", fontSize: 16, color: "#1e3a8a", marginTop: 2 }}>
              {filteredOrders.length} កញ្ចប់
            </strong>
          </div>
          <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 8, padding: "8px 12px" }}>
            <small style={{ color: "#15803d", fontSize: 11, fontWeight: 600 }}>ទំនិញត្រូវវេចខ្ចប់</small>
            <strong style={{ display: "block", fontSize: 16, color: "#166534", marginTop: 2 }}>
              {totalUnits} ឯកតា ({aggregatedItems.length} មុខ)
            </strong>
          </div>
          <div style={{ background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 8, padding: "8px 12px" }}>
            <small style={{ color: "#b45309", fontSize: 11, fontWeight: 600 }}>ប្រាក់ត្រូវប្រមូល (COD)</small>
            <strong style={{ display: "block", fontSize: 15, color: "#92400e", marginTop: 2 }}>
              {formatUSD(codAmount)} ({formatKHR(usdToKhr(codAmount))})
            </strong>
          </div>
          <div style={{ background: "#faf5ff", border: "1px solid #e9d5ff", borderRadius: 8, padding: "8px 12px" }}>
            <small style={{ color: "#7e22ce", fontSize: 11, fontWeight: 600 }}>បានទូទាត់រួច (Paid)</small>
            <strong style={{ display: "block", fontSize: 15, color: "#6b21a8", marginTop: 2 }}>
              {formatUSD(paidAmount)} ({formatKHR(usdToKhr(paidAmount))})
            </strong>
          </div>
        </div>

        {/* Tab Buttons */}
        <div style={{ display: "flex", gap: 6, borderBottom: "1px solid #e2e8f0", paddingBottom: 8, marginBottom: 12 }}>
          <button
            type="button"
            className={`button ${activeTab === "items" ? "primary" : "subtle"}`}
            onClick={() => setActiveTab("items")}
            style={{ fontSize: 12, height: 30, borderRadius: 20 }}
          >
            <Package size={13} /> ១. បញ្ជីរាប់ទំនិញត្រូវរៀបចំ ({aggregatedItems.length})
          </button>
          <button
            type="button"
            className={`button ${activeTab === "manifest" ? "primary" : "subtle"}`}
            onClick={() => setActiveTab("manifest")}
            style={{ fontSize: 12, height: 30, borderRadius: 20 }}
          >
            <Truck size={13} /> ២. បញ្ជីផ្ទៀងផ្ទាត់ដឹកជញ្ជូន ({filteredOrders.length})
          </button>
        </div>

        {/* Modal Scroll Content */}
        <div style={{ flex: 1, overflowY: "auto", minHeight: 280 }}>
          {loading ? (
            <div style={{ textAlign: "center", padding: "40px 0", color: "#64748b" }}>
              កំពុងផ្ទុកទិន្នន័យការបញ្ជាទិញ…
            </div>
          ) : error ? (
            <div className="error-banner">{error}</div>
          ) : !filteredOrders.length ? (
            <div className="empty-state">
              <strong>មិនមានការបញ្ជាទិញសម្រាប់ថ្ងៃ {date} ទេ</strong>
              សាកល្បងជ្រើសរើសកាលបរិច្ឆេទផ្សេង ឬជ្រើសរើស «ការបញ្ជាទិញទាំងអស់»។
            </div>
          ) : activeTab === "items" ? (
            /* TAB 1: Item Packing Aggregation List */
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th style={{ width: 40, textAlign: "center" }}>រៀបចំ</th>
                    <th style={{ width: 40, textAlign: "center" }}>ល.រ</th>
                    <th>ឈ្មោះមុខទំនិញ (Product Name)</th>
                    <th>ជម្រើស (Variant / Size / Color)</th>
                    <th style={{ textAlign: "right" }}>ចំនួនត្រូវរៀបចំ (Qty)</th>
                    <th style={{ width: 130, textAlign: "center" }}>ស្ថានភាព</th>
                  </tr>
                </thead>
                <tbody>
                  {aggregatedItems.map((item, idx) => {
                    const isChecked = Boolean(checkedItems[item.key]);
                    return (
                      <tr
                        key={item.key}
                        style={{
                          background: isChecked ? "#f0fdf4" : undefined,
                          opacity: isChecked ? 0.75 : 1,
                        }}
                      >
                        <td style={{ textAlign: "center" }}>
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={(e) =>
                              setCheckedItems((old) => ({ ...old, [item.key]: e.target.checked }))
                            }
                            aria-label={`Tick ${item.productName}`}
                          />
                        </td>
                        <td style={{ textAlign: "center", color: "#64748b" }}>{idx + 1}</td>
                        <td>
                          <strong>{item.productName}</strong>
                        </td>
                        <td>
                          <span className="badge" style={{ fontSize: 11, background: "#f1f5f9" }}>
                            {item.variantName}
                          </span>
                        </td>
                        <td style={{ textAlign: "right" }}>
                          <strong style={{ fontSize: 14, color: "#1e3a8a" }}>{item.quantity}</strong> ឯកតា
                        </td>
                        <td style={{ textAlign: "center" }}>
                          {isChecked ? (
                            <span style={{ fontSize: 11, color: "#16a34a", fontWeight: 700, display: "inline-flex", alignItems: "center", gap: 3 }}>
                              <CheckCircle2 size={13} /> យកចេញរួច
                            </span>
                          ) : (
                            <span style={{ fontSize: 11, color: "#64748b" }}>រង់ចាំយក</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            /* TAB 2: Courier & Delivery Dispatch Manifest */
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th style={{ width: 35, textAlign: "center" }}>កញ្ចប់</th>
                    <th style={{ width: 35, textAlign: "center" }}>ប្រគល់</th>
                    <th>លេខកូដ</th>
                    <th>អតិថិជន &amp; លេខទូរស័ព្ទ</th>
                    <th>គោលដៅ/ខេត្ត</th>
                    <th>សេវាដឹក (Courier)</th>
                    <th>មុខទំនិញ</th>
                    <th style={{ textAlign: "right" }}>ប្រាក់ត្រូវប្រមូល</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredOrders.map((o) => {
                    const isPaid = o.paymentStatus === "PAID";
                    const isPacked = Boolean(packedOrders[o.id]);
                    const isDispatched = Boolean(dispatchedOrders[o.id]);

                    return (
                      <tr
                        key={o.id}
                        style={{
                          background: isDispatched ? "#f0fdf4" : isPacked ? "#eff6ff" : undefined,
                        }}
                      >
                        <td style={{ textAlign: "center" }}>
                          <input
                            type="checkbox"
                            checked={isPacked}
                            onChange={(e) =>
                              setPackedOrders((old) => ({ ...old, [o.id]: e.target.checked }))
                            }
                            aria-label={`Packed ${o.orderNumber}`}
                            title="បានវេចខ្ចប់រួចរាល់"
                          />
                        </td>
                        <td style={{ textAlign: "center" }}>
                          <input
                            type="checkbox"
                            checked={isDispatched}
                            onChange={(e) =>
                              setDispatchedOrders((old) => ({ ...old, [o.id]: e.target.checked }))
                            }
                            aria-label={`Dispatched ${o.orderNumber}`}
                            title="បានប្រគល់ជូនអ្នកដឹក"
                          />
                        </td>
                        <td>
                          <button
                            type="button"
                            onClick={() => onOpenOrderDrawer?.(o.id)}
                            style={{
                              background: "none",
                              border: 0,
                              padding: 0,
                              fontWeight: 700,
                              color: "#2563eb",
                              cursor: "pointer",
                              textAlign: "left",
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 3,
                            }}
                          >
                            {o.orderNumber}
                            <ExternalLink size={10} />
                          </button>
                        </td>
                        <td>
                          <strong>{o.customer}</strong>
                          {o.phone && (
                            <div style={{ fontSize: 11, color: "#64748b" }}>
                              ☎ {o.phone}
                            </div>
                          )}
                        </td>
                        <td>{o.province || "—"}</td>
                        <td>
                          <strong>{o.courier || "—"}</strong>
                          {o.trackingNumber && (
                            <div style={{ fontSize: 10, color: "#64748b" }}>
                              #{o.trackingNumber}
                            </div>
                          )}
                        </td>
                        <td>
                          <small style={{ color: "#334155" }}>{o.itemNames}</small>
                        </td>
                        <td style={{ textAlign: "right" }}>
                          {isPaid ? (
                            <span className="badge green" style={{ fontSize: 10 }}>
                              PAID ✓
                            </span>
                          ) : (
                            <div>
                              <strong style={{ color: "#b45309", fontSize: 12 }}>
                                {formatUSD(o.total)}
                              </strong>
                              <div style={{ fontSize: 10, color: "#64748b" }}>
                                {formatKHR(usdToKhr(o.total))}
                              </div>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            paddingTop: 14,
            borderTop: "1px solid #e2e8f0",
            marginTop: 10,
          }}
        >
          <div style={{ fontSize: 11, color: "#64748b" }}>
            សរុប: <strong>{filteredOrders.length}</strong> ការបញ្ជាទិញ · <strong>{totalUnits}</strong> ឯកតាទំនិញ
          </div>
          <button type="button" className="button" onClick={close}>
            បិទ
          </button>
        </div>
      </section>
    </div>
  );
}
