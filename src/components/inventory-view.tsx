"use client";

import { useEffect, useState } from "react";
import {
  Boxes,
  Plus,
  Search,
  Filter,
  RefreshCw,
  ArrowDownLeft,
  ArrowUpRight,
  AlertTriangle,
  PackageX,
  PackageCheck,
  CheckCircle2,
  Clock,
  Layers,
  FileSpreadsheet,
} from "lucide-react";
import { StockInModal } from "@/components/stock-in-modal";
import { DataTablePagination } from "@/components/ui/data-table-pagination";
import { useToast } from "@/components/ui/toast-provider";

interface StockMovementRow {
  id: string;
  productId: string;
  productName: string;
  productSku?: string | null;
  variantId?: string | null;
  variantName?: string | null;
  type: "STOCK_IN" | "SALE_ORDER" | "SALE_POS" | "RETURN_RESTOCK" | "ADJUSTMENT" | "DAMAGE_LOSS";
  quantity: number;
  previousStock: number | null;
  newStock: number | null;
  reason: string | null;
  referenceId: string | null;
  performedBy: string | null;
  createdAt: string;
}

interface LowStockAlertItem {
  productId: string;
  productName: string;
  sku: string | null;
  variantId?: string | null;
  variantName?: string | null;
  currentStock: number;
  lowStockThreshold: number;
  status: "OUT_OF_STOCK" | "LOW_STOCK";
}

interface InventorySummary {
  totalTrackedProducts: number;
  totalUnitsInStock: number;
  lowStockCount: number;
  outOfStockCount: number;
  todayMovementsCount: number;
}

interface InventoryViewProps {
  products: Array<{
    id: string;
    name: string;
    sku?: string | null;
    stock: number | null;
    variants: Array<{
      id: string;
      name: string;
      sku?: string | null;
      stock: number | null;
    }>;
  }>;
  onRefreshProducts?: () => void;
}

export function InventoryView({ products, onRefreshProducts }: InventoryViewProps) {
  const notify = useToast();
  const [activeTab, setActiveTab] = useState<"history" | "alerts">("history");

  // Summary state
  const [summary, setSummary] = useState<InventorySummary>({
    totalTrackedProducts: products.length,
    totalUnitsInStock: 0,
    lowStockCount: 0,
    outOfStockCount: 0,
    todayMovementsCount: 0,
  });
  const [lowStockAlerts, setLowStockAlerts] = useState<LowStockAlertItem[]>([]);
  const [summaryLoading, setSummaryLoading] = useState(true);

  // Movements state
  const [movements, setMovements] = useState<StockMovementRow[]>([]);
  const [movementsLoading, setMovementsLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedType, setSelectedType] = useState<string>("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [totalPages, setTotalPages] = useState(1);
  const [totalMovements, setTotalMovements] = useState(0);

  // Alerts pagination
  const [alertsPage, setAlertsPage] = useState(1);
  const [alertsPageSize, setAlertsPageSize] = useState(10);

  // Stock In Modal
  const [stockInModalOpen, setStockInModalOpen] = useState(false);
  const [preselectedProdId, setPreselectedProdId] = useState<string | undefined>();
  const [preselectedVarId, setPreselectedVarId] = useState<string | undefined>();

  // Fetch summary and low stock alerts
  const loadSummary = async () => {
    setSummaryLoading(true);
    try {
      const res = await fetch("/api/inventory/summary");
      const data = await res.json();
      if (res.ok && data.summary) {
        setSummary(data.summary);
        setLowStockAlerts(data.lowStockAlerts || []);
      }
    } catch (err) {
      console.error("Failed to load inventory summary:", err);
    } finally {
      setSummaryLoading(false);
    }
  };

  // Fetch paginated movements
  const loadMovements = async () => {
    setMovementsLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(pageSize),
      });
      if (search.trim()) params.set("search", search.trim());
      if (selectedType) params.set("type", selectedType);

      const res = await fetch(`/api/inventory/movements?${params}`);
      const data = await res.json();
      if (res.ok && Array.isArray(data.movements)) {
        setMovements(data.movements);
        setTotalPages(data.pagination.totalPages || 1);
        setTotalMovements(data.pagination.total || 0);
      }
    } catch (err) {
      console.error("Failed to load stock movements:", err);
    } finally {
      setMovementsLoading(false);
    }
  };

  useEffect(() => {
    loadSummary();
  }, []);

  useEffect(() => {
    loadMovements();
  }, [page, pageSize, selectedType, search]);

  const handleRefresh = () => {
    loadSummary();
    loadMovements();
    onRefreshProducts?.();
  };

  const openStockInFor = (prodId?: string, varId?: string) => {
    setPreselectedProdId(prodId);
    setPreselectedVarId(varId);
    setStockInModalOpen(true);
  };

  const getMovementTypeBadge = (type: StockMovementRow["type"]) => {
    switch (type) {
      case "STOCK_IN":
        return {
          label: "នាំចូលស្តុក (Restock)",
          bg: "#ecfdf5",
          color: "#059669",
          border: "#a7f3d0",
          icon: <ArrowDownLeft size={13} />,
        };
      case "SALE_ORDER":
        return {
          label: "លក់តាម Order",
          bg: "#eff6ff",
          color: "#2563eb",
          border: "#bfdbfe",
          icon: <ArrowUpRight size={13} />,
        };
      case "SALE_POS":
        return {
          label: "លក់ផ្ទាល់ POS",
          bg: "#f0fdf4",
          color: "#16a34a",
          border: "#bbf7d0",
          icon: <ArrowUpRight size={13} />,
        };
      case "RETURN_RESTOCK":
        return {
          label: "ចូលវិញ (Return)",
          bg: "#faf5ff",
          color: "#7e22ce",
          border: "#e9d5ff",
          icon: <CheckCircle2 size={13} />,
        };
      case "ADJUSTMENT":
        return {
          label: "កែសម្រួល (Adjust)",
          bg: "#f8fafc",
          color: "#475569",
          border: "#cbd5e1",
          icon: <RefreshCw size={13} />,
        };
      case "DAMAGE_LOSS":
        return {
          label: "ខូចខាត/បាត់ (Loss)",
          bg: "#fef2f2",
          color: "#dc2626",
          border: "#fecaca",
          icon: <AlertTriangle size={13} />,
        };
      default:
        return {
          label: type,
          bg: "#f1f5f9",
          color: "#475569",
          border: "#cbd5e1",
          icon: null,
        };
    }
  };

  return (
    <>
      {/* Header */}
      <div className="page-heading">
        <div>
          <h1 style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Boxes size={22} style={{ color: "#3164ce" }} />
            ស្តុកទំនិញ & ប្រវត្តិបន្លាស់ប្តូរ (Inventory)
          </h1>
          <p>
            តាមដានប្រវត្តិស្តុកចេញ-ចូល ការលក់ និងការជូនដំណឹងស្តុកទាប ឬដាច់ស្តុកក្នុងពេលជាក់ស្តែង។
          </p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="button" onClick={handleRefresh} title="ផ្ទុកទិន្នន័យឡើងវិញ">
            <RefreshCw size={14} /> ផ្ទុកឡើងវិញ
          </button>
          <button className="button primary" onClick={() => openStockInFor()}>
            <Plus size={14} /> នាំចូលស្តុក (Stock IN)
          </button>
        </div>
      </div>

      {/* Metrics Row */}
      <div className="metrics" style={{ marginBottom: 18 }}>
        <div className="metric">
          <div className="metric-icon" style={{ background: "#eef2ff", color: "#3164ce" }}>
            <Layers size={18} />
          </div>
          <div>
            <div className="metric-title">ទំនិញក្នុងស្តុកសរុប</div>
            <div className="metric-value">
              {summaryLoading ? "…" : `${summary.totalUnitsInStock} ឯកតា`}
            </div>
            <small style={{ color: "#64748b" }}>
              តាមដាន {summary.totalTrackedProducts} មុខទំនិញ
            </small>
          </div>
        </div>

        <div className="metric">
          <div className="metric-icon" style={{ background: "#fffbeb", color: "#d97706" }}>
            <AlertTriangle size={18} />
          </div>
          <div>
            <div className="metric-title">ទំនិញជិតអស់ (Low Stock)</div>
            <div className="metric-value" style={{ color: summary.lowStockCount > 0 ? "#d97706" : "inherit" }}>
              {summaryLoading ? "…" : `${summary.lowStockCount} មុខ`}
            </div>
            <small style={{ color: "#64748b" }}>ស្តុក ៥ ឯកតា ឬតិចជាងនេះ</small>
          </div>
        </div>

        <div className="metric">
          <div className="metric-icon" style={{ background: "#fef2f2", color: "#dc2626" }}>
            <PackageX size={18} />
          </div>
          <div>
            <div className="metric-title">ដាច់ស្តុក (Out of Stock)</div>
            <div className="metric-value" style={{ color: summary.outOfStockCount > 0 ? "#dc2626" : "inherit" }}>
              {summaryLoading ? "…" : `${summary.outOfStockCount} មុខ`}
            </div>
            <small style={{ color: "#64748b" }}>ស្តុកសល់ 0 ឯកតា ត្រូវការនាំចូល</small>
          </div>
        </div>

        <div className="metric">
          <div className="metric-icon" style={{ background: "#ecfdf5", color: "#059669" }}>
            <Clock size={18} />
          </div>
          <div>
            <div className="metric-title">បន្លាស់ប្តូរថ្ងៃនេះ</div>
            <div className="metric-value">
              {summaryLoading ? "…" : `${summary.todayMovementsCount} ដង`}
            </div>
            <small style={{ color: "#64748b" }}>នាំចូល និងលក់ចេញថ្ងៃនេះ</small>
          </div>
        </div>
      </div>

      {/* Main Panel with Tabs */}
      <section className="panel">
        {/* Tab Headers */}
        <div
          style={{
            display: "flex",
            gap: 12,
            borderBottom: "1px solid #e2e8f0",
            paddingBottom: 10,
            marginBottom: 16,
          }}
        >
          <button
            type="button"
            className={`tab-button ${activeTab === "history" ? "active" : ""}`}
            onClick={() => setActiveTab("history")}
            style={{
              padding: "6px 14px",
              borderRadius: 6,
              border: "none",
              cursor: "pointer",
              fontWeight: 600,
              fontSize: "0.9rem",
              background: activeTab === "history" ? "#3164ce" : "transparent",
              color: activeTab === "history" ? "#fff" : "#64748b",
            }}
          >
            📋 ប្រវត្តិបន្លាស់ប្តូរស្តុក ({totalMovements})
          </button>
          <button
            type="button"
            className={`tab-button ${activeTab === "alerts" ? "active" : ""}`}
            onClick={() => setActiveTab("alerts")}
            style={{
              padding: "6px 14px",
              borderRadius: 6,
              border: "none",
              cursor: "pointer",
              fontWeight: 600,
              fontSize: "0.9rem",
              background: activeTab === "alerts" ? "#3164ce" : "transparent",
              color: activeTab === "alerts" ? "#fff" : "#64748b",
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            ⚠️ ទំនិញជិតអស់ & ដាច់ស្តុក ({lowStockAlerts.length})
            {lowStockAlerts.length > 0 && (
              <span
                style={{
                  background: activeTab === "alerts" ? "#fff" : "#fee2e2",
                  color: activeTab === "alerts" ? "#3164ce" : "#dc2626",
                  padding: "1px 6px",
                  borderRadius: 10,
                  fontSize: "0.72rem",
                  fontWeight: 700,
                }}
              >
                {lowStockAlerts.length}
              </span>
            )}
          </button>
        </div>

        {/* Tab 1: History Content */}
        {activeTab === "history" && (
          <>
            {/* Filter Toolbar */}
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: 10,
                marginBottom: 14,
                alignItems: "center",
              }}
            >
              <div style={{ flex: 1, minWidth: 220 }}>
                <label className="input-wrap">
                  <Search size={14} />
                  <input
                    value={search}
                    onChange={(e) => {
                      setSearch(e.target.value);
                      setPage(1);
                    }}
                    placeholder="ស្វែងរកឈ្មោះទំនិញ កូដ SKU មូលហេតុ ឬលេខ Order…"
                  />
                </label>
              </div>

              <div>
                <select
                  className="select"
                  value={selectedType}
                  onChange={(e) => {
                    setSelectedType(e.target.value);
                    setPage(1);
                  }}
                  aria-label="ច្រោះតាមប្រភេទបន្លាស់ប្តូរ"
                >
                  <option value="">ប្រភេទបន្លាស់ប្តូរទាំងអស់</option>
                  <option value="STOCK_IN">នាំចូលស្តុក (STOCK_IN)</option>
                  <option value="SALE_ORDER">លក់តាម Order (SALE_ORDER)</option>
                  <option value="SALE_POS">លក់ផ្ទាល់ POS (SALE_POS)</option>
                  <option value="RETURN_RESTOCK">ចូលវិញ (RETURN_RESTOCK)</option>
                  <option value="ADJUSTMENT">កែសម្រួលដោយដៃ (ADJUSTMENT)</option>
                  <option value="DAMAGE_LOSS">ខូចខាត/បាត់បង់ (DAMAGE_LOSS)</option>
                </select>
              </div>
            </div>

            {/* Table */}
            {movementsLoading ? (
              <div className="empty-state" style={{ padding: 40 }}>
                កំពុងផ្ទុកប្រវត្តិបន្លាស់ប្តូរស្តុក…
              </div>
            ) : movements.length === 0 ? (
              <div className="empty-state" style={{ padding: 40 }}>
                មិនទាន់មានប្រវត្តិបន្លាស់ប្តូរស្តុកនៅឡើយទេ។
              </div>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>កាលបរិច្ឆេទ & ម៉ោង</th>
                      <th>មុខទំនិញ (Product)</th>
                      <th>ប្រភេទ</th>
                      <th>ចំនួនប្រែប្រួល</th>
                      <th>ស្តុក (មុន ➔ ក្រោយ)</th>
                      <th>មូលហេតុ / លេខយោង</th>
                      <th>អ្នកកែប្រែ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {movements.map((m) => {
                      const badge = getMovementTypeBadge(m.type);
                      const isPositive = m.quantity > 0;
                      return (
                        <tr key={m.id}>
                          <td style={{ fontSize: "0.8rem", color: "#64748b", whiteSpace: "nowrap" }}>
                            {new Date(m.createdAt).toLocaleString("km-KH", {
                              year: "numeric",
                              month: "short",
                              day: "numeric",
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </td>
                          <td>
                            <strong>{m.productName}</strong>
                            {m.variantName && (
                              <div style={{ fontSize: "0.75rem", color: "#64748b" }}>
                                ជម្រើស: {m.variantName}
                              </div>
                            )}
                            {m.productSku && (
                              <small style={{ color: "#94a3b8", fontSize: "0.72rem" }}>
                                SKU: {m.productSku}
                              </small>
                            )}
                          </td>
                          <td>
                            <span
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: 4,
                                background: badge.bg,
                                color: badge.color,
                                border: `1px solid ${badge.border}`,
                                borderRadius: 4,
                                padding: "2px 6px",
                                fontSize: "0.75rem",
                                fontWeight: 600,
                                whiteSpace: "nowrap",
                              }}
                            >
                              {badge.icon} {badge.label}
                            </span>
                          </td>
                          <td>
                            <strong
                              style={{
                                color: isPositive ? "#16a34a" : "#dc2626",
                                fontSize: "0.92rem",
                              }}
                            >
                              {isPositive ? `+${m.quantity}` : m.quantity}
                            </strong>
                          </td>
                          <td style={{ whiteSpace: "nowrap" }}>
                            <span style={{ color: "#64748b" }}>{m.previousStock ?? "—"}</span>
                            {" ➔ "}
                            <strong style={{ color: "#0f172a" }}>{m.newStock ?? "—"}</strong>
                          </td>
                          <td style={{ fontSize: "0.82rem" }}>
                            <div>{m.reason || "—"}</div>
                            {m.referenceId && (
                              <small style={{ color: "#3164ce", fontWeight: 600 }}>
                                Ref: {m.referenceId}
                              </small>
                            )}
                          </td>
                          <td style={{ fontSize: "0.8rem", color: "#475569" }}>
                            {m.performedBy || "System"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* Consistent DataTable Pagination */}
            <DataTablePagination
              currentPage={page}
              totalPages={totalPages}
              totalItems={totalMovements}
              pageSize={pageSize}
              onPageChange={(newPage) => setPage(newPage)}
              onPageSizeChange={(newSize) => {
                setPageSize(newSize);
                setPage(1);
              }}
              itemName="កំណត់ត្រា"
            />
          </>
        )}

        {/* Tab 2: Low Stock Alerts Content */}
        {activeTab === "alerts" && (
          <>
            {lowStockAlerts.length === 0 ? (
              <div className="empty-state" style={{ padding: 40 }}>
                <CheckCircle2 size={32} style={{ color: "#16a34a", marginBottom: 8 }} />
                <h3>ស្តុកទំនិញគ្រប់គ្រាន់ទាំងអស់</h3>
                <p>គ្មានទំនិញណាមួយកំពុងស្ថិតក្នុងកម្រិតស្តុកទាប ឬដាច់ស្តុកឡើយ។</p>
              </div>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>មុខទំនិញ</th>
                      <th>កូដ SKU</th>
                      <th>ស្តុកបច្ចុប្បន្ន</th>
                      <th>កម្រិតកំណត់ព្រមាន</th>
                      <th>ស្ថានភាព</th>
                      <th className="actions-header">សកម្មភាព</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lowStockAlerts
                      .slice((alertsPage - 1) * alertsPageSize, alertsPage * alertsPageSize)
                      .map((item, idx) => (
                      <tr key={`${item.productId}-${item.variantId || idx}`}>
                        <td>
                          <strong>{item.productName}</strong>
                          {item.variantName && (
                            <div style={{ fontSize: "0.75rem", color: "#64748b" }}>
                              ជម្រើស: {item.variantName}
                            </div>
                          )}
                        </td>
                        <td>{item.sku || "—"}</td>
                        <td>
                          <strong
                            style={{
                              color: item.currentStock === 0 ? "#dc2626" : "#d97706",
                              fontSize: "1rem",
                            }}
                          >
                            {item.currentStock} ឯកតា
                          </strong>
                        </td>
                        <td style={{ color: "#64748b" }}>
                          ≤ {item.lowStockThreshold} ឯកតា
                        </td>
                        <td>
                          {item.status === "OUT_OF_STOCK" ? (
                            <span
                              style={{
                                background: "#fef2f2",
                                color: "#dc2626",
                                border: "1px solid #fecaca",
                                padding: "2px 8px",
                                borderRadius: 4,
                                fontSize: "0.78rem",
                                fontWeight: 700,
                              }}
                            >
                              ❌ ដាច់ស្តុក (0)
                            </span>
                          ) : (
                            <span
                              style={{
                                background: "#fffbeb",
                                color: "#d97706",
                                border: "1px solid #fde68a",
                                padding: "2px 8px",
                                borderRadius: 4,
                                fontSize: "0.78rem",
                                fontWeight: 600,
                              }}
                            >
                              ⚠️ ស្តុកទាប ({item.currentStock})
                            </span>
                          )}
                        </td>
                        <td className="actions-cell">
                          <button
                            type="button"
                            className="button"
                            style={{
                              padding: "4px 10px",
                              fontSize: "0.8rem",
                              background: "#f0f9ff",
                              color: "#0369a1",
                              borderColor: "#bae6fd",
                            }}
                            onClick={() => openStockInFor(item.productId, item.variantId || undefined)}
                          >
                            <Plus size={12} /> នាំចូលស្តុក (Restock)
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <DataTablePagination
                  currentPage={alertsPage}
                  totalPages={Math.max(1, Math.ceil(lowStockAlerts.length / alertsPageSize))}
                  totalItems={lowStockAlerts.length}
                  pageSize={alertsPageSize}
                  onPageChange={(p) => setAlertsPage(p)}
                  onPageSizeChange={(newSize) => {
                    setAlertsPageSize(newSize);
                    setAlertsPage(1);
                  }}
                  itemName="មុខទំនិញស្តុកទាប"
                />
              </div>
            )}
          </>
        )}
      </section>

      {/* Stock In Modal */}
      {stockInModalOpen && (
        <StockInModal
          products={products}
          preselectedProductId={preselectedProdId}
          preselectedVariantId={preselectedVarId}
          close={() => {
            setStockInModalOpen(false);
            setPreselectedProdId(undefined);
            setPreselectedVarId(undefined);
          }}
          onSuccess={handleRefresh}
        />
      )}
    </>
  );
}
