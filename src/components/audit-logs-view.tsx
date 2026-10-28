"use client";

import { useEffect, useState } from "react";
import {
  ShieldAlert, ShieldCheck, Search, Filter, RefreshCw, Clock,
  UserCheck, AlertTriangle, Key, ShoppingCart, Radio, Layers,
  Calendar, ChevronRight, Eye, CheckCircle2, XCircle
} from "lucide-react";
import { DataTablePagination } from "@/components/ui/data-table-pagination";

interface AuditLogEntry {
  id: string;
  action: string;
  entity: string;
  entityId: string | null;
  metadata: Record<string, any> | null;
  createdAt: string;
  user: {
    id: string;
    name: string;
    email: string;
    avatarUrl: string | null;
    role: string;
  } | null;
}

interface PaginationState {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

const ACTION_LABELS: Record<string, { label: string; color: string; bg: string }> = {
  USER_LOGIN_SUCCESS: { label: "ចូលគណនីជោគជ័យ", color: "#166534", bg: "#dcfce7" },
  USER_LOGIN_FAILED: { label: "ចូលគណនីមិនបានសម្រេច", color: "#991b1b", bg: "#fee2e2" },
  AUTH_RATE_LIMIT_TRIGGERED: { label: "លើសកម្រិត Login (Rate Limit)", color: "#b45309", bg: "#fef3c7" },
  USER_PASSWORD_CHANGED: { label: "ប្តូរពាក្យសម្ងាត់", color: "#4338ca", bg: "#e0e7ff" },
  KEYCLOAK_IDENTITY_LINKED: { label: "ភ្ជាប់គណនី SSO", color: "#0369a1", bg: "#e0f2fe" },
  LIVE_CF_ORDER_CREATED: { label: "កក់ Live CF ជោគជ័យ", color: "#15803d", bg: "#dcfce7" },
  ORDER_CREATED: { label: "បង្កើតការបញ្ជាទិញ", color: "#1d4ed8", bg: "#dbeafe" },
  ORDER_STATUS_CHANGED: { label: "ប្តូរស្ថានភាព Order", color: "#6d28d9", bg: "#ede9fe" },
  STOCK_MOVEMENT_RECORDED: { label: "ចលនាស្តុកទំនិញ", color: "#0f766e", bg: "#ccfbf1" },
};

export function AuditLogsView() {
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  // Pagination
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [pagination, setPagination] = useState<PaginationState>({ page: 1, pageSize: 10, total: 0, totalPages: 1 });

  // Filters
  const [search, setSearch] = useState("");
  const [selectedAction, setSelectedAction] = useState("ALL");
  const [selectedEntity, setSelectedEntity] = useState("ALL");

  // Selected Log Details Modal
  const [selectedLog, setSelectedLog] = useState<AuditLogEntry | null>(null);

  const fetchLogs = async (silent = false) => {
    if (!silent) setRefreshing(true);
    setError("");

    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(pageSize),
      });

      if (search.trim()) params.append("search", search.trim());
      if (selectedAction !== "ALL") params.append("action", selectedAction);
      if (selectedEntity !== "ALL") params.append("entity", selectedEntity);

      const res = await fetch(`/api/audit-logs?${params.toString()}`);
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "មិនអាចទាញយកកំណត់ត្រាសុវត្ថិភាពបានទេ។");
      }

      setLogs(data.logs || []);
      setPagination(data.pagination || { page: 1, pageSize: 10, total: 0, totalPages: 1 });
    } catch (err: any) {
      setError(err.message || "មានបញ្ហាក្នុងការទាញយក Audit Logs");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, [page, pageSize, selectedAction, selectedEntity]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    fetchLogs();
  };

  const getActionBadge = (action: string) => {
    const meta = ACTION_LABELS[action] || { label: action, color: "#334155", bg: "#f1f5f9" };
    return (
      <span
        style={{
          display: "inline-block",
          padding: "3px 8px",
          borderRadius: "6px",
          fontSize: "11px",
          fontWeight: 700,
          background: meta.bg,
          color: meta.color,
          whiteSpace: "nowrap",
        }}
      >
        {meta.label}
      </span>
    );
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px", width: "100%" }}>
      {/* Header Banner */}
      <div
        style={{
          background: "#ffffff",
          padding: "16px 20px",
          borderRadius: "14px",
          border: "1px solid #edf0f4",
          boxShadow: "0 2px 10px rgba(0,0,0,0.03)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "12px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <div
            style={{
              width: "42px",
              height: "42px",
              borderRadius: "12px",
              background: "linear-gradient(135deg, #059669, #047857)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#fff",
              flexShrink: 0,
              boxShadow: "0 4px 12px rgba(5,150,105,0.25)",
            }}
          >
            <ShieldCheck size={22} />
          </div>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <h2 style={{ fontSize: "17px", fontWeight: 700, margin: 0, color: "#1e293b" }}>
                កំណត់ត្រាសកម្មភាព & សុវត្ថិភាព (Audit Logs & Security)
              </h2>
              <span
                style={{
                  background: "#dcfce7",
                  color: "#166534",
                  padding: "2px 8px",
                  borderRadius: "12px",
                  fontSize: "11px",
                  fontWeight: 800,
                }}
              >
                🔒 SECURE & REDACTED
              </span>
            </div>
            <p style={{ margin: "2px 0 0", fontSize: "12.5px", color: "#64748b" }}>
              តាមដានរាល់ការចូលគណនី, ការកក់ Live CF, ការកែប្រែទិន្នន័យ និងព្រឹត្តិការណ៍សុវត្ថិភាពដោយគ្មានការលេចធ្លាយពាក្យសម្ងាត់
            </p>
          </div>
        </div>

        <button
          onClick={() => fetchLogs()}
          disabled={refreshing}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "6px",
            padding: "8px 14px",
            borderRadius: "8px",
            border: "1px solid #cbd5e1",
            background: "#fff",
            color: "#334155",
            fontSize: "12.5px",
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          <RefreshCw size={13} className={refreshing ? "animate-spin text-blue-600" : ""} />
          {refreshing ? "កំពុងទាញយក..." : "ផ្ទុកឡើងវិញ"}
        </button>
      </div>

      {error && (
        <div style={{ background: "#fef2f2", color: "#dc2626", padding: "10px 16px", borderRadius: "10px", fontSize: "13px", border: "1px solid #fecaca" }}>
          {error}
        </div>
      )}

      {/* Main Table Card */}
      <div style={{ background: "#ffffff", borderRadius: "14px", border: "1px solid #edf0f4", padding: "18px" }}>
        {/* Search & Filter Bar */}
        <form onSubmit={handleSearchSubmit} style={{ display: "flex", gap: "10px", marginBottom: "16px", flexWrap: "wrap" }}>
          <div style={{ position: "relative", flex: "2 1 240px" }}>
            <Search size={14} style={{ position: "absolute", left: "10px", top: "50%", transform: "translateY(-50%)", color: "#94a3b8" }} />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="ស្វែងរកតាមឈ្មោះ, អ៊ីមែល, ឬលេខកូដសកម្មភាព..."
              style={{ width: "100%", padding: "7px 10px 7px 30px", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "12.5px" }}
            />
          </div>

          <select
            value={selectedAction}
            onChange={(e) => {
              setSelectedAction(e.target.value);
              setPage(1);
            }}
            style={{ padding: "7px 12px", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "12.5px", background: "#fff", flex: "1 1 160px" }}
          >
            <option value="ALL">សកម្មភាពទាំងអស់</option>
            <option value="USER_LOGIN_SUCCESS">ចូលគណនីជោគជ័យ</option>
            <option value="USER_LOGIN_FAILED">ចូលគណនីបរាជ័យ</option>
            <option value="AUTH_RATE_LIMIT_TRIGGERED">លើស Rate Limit</option>
            <option value="LIVE_CF_ORDER_CREATED">ការកក់ Live CF</option>
            <option value="ORDER_CREATED">បង្កើតការបញ្ជាទិញ</option>
            <option value="ORDER_STATUS_CHANGED">ប្តូរស្ថានភាព Order</option>
            <option value="STOCK_MOVEMENT_RECORDED">ចលនាស្តុកទំនិញ</option>
            <option value="USER_PASSWORD_CHANGED">ប្តូរពាក្យសម្ងាត់</option>
          </select>

          <select
            value={selectedEntity}
            onChange={(e) => {
              setSelectedEntity(e.target.value);
              setPage(1);
            }}
            style={{ padding: "7px 12px", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "12.5px", background: "#fff", flex: "1 1 120px" }}
          >
            <option value="ALL">គោលដៅទាំងអស់</option>
            <option value="User">User</option>
            <option value="Order">Order</option>
            <option value="Security">Security</option>
            <option value="StockMovement">Stock</option>
          </select>

          <button
            type="submit"
            style={{
              padding: "7px 16px",
              borderRadius: "8px",
              background: "#1877F2",
              color: "#fff",
              border: "none",
              fontSize: "12.5px",
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            ស្វែងរក
          </button>
        </form>

        {/* Table */}
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: "13px", minWidth: "750px" }}>
            <thead>
              <tr style={{ background: "#f8fafc", borderBottom: "2px solid #e2e8f0", color: "#475569" }}>
                <th style={{ padding: "10px 12px" }}>កាលបរិច្ឆេទ & ម៉ោង</th>
                <th style={{ padding: "10px 12px" }}>អ្នកប្រើប្រាស់</th>
                <th style={{ padding: "10px 12px" }}>សកម្មភាព (Action)</th>
                <th style={{ padding: "10px 12px" }}>គោលដៅ (Entity)</th>
                <th style={{ padding: "10px 12px" }}>ព័ត៌មានលម្អិត (Metadata)</th>
                <th style={{ padding: "10px 12px", textAlign: "right" }}>ពិនិត្យ</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} style={{ padding: "30px", textAlign: "center", color: "#64748b" }}>
                    <RefreshCw className="animate-spin text-blue-600 inline mr-2" size={18} /> កំពុងផ្ទុកកំណត់ត្រា...
                  </td>
                </tr>
              ) : logs.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ padding: "30px", textAlign: "center", color: "#94a3b8" }}>
                    មិនមានកំណត់ត្រាសកម្មភាពដែលត្រូវនឹងការស្វែងរកនេះទេ។
                  </td>
                </tr>
              ) : (
                logs.map((log) => {
                  const date = new Date(log.createdAt);
                  const formattedDate = date.toLocaleDateString("km-KH", { year: "numeric", month: "short", day: "numeric" });
                  const formattedTime = date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });

                  return (
                    <tr
                      key={log.id}
                      onClick={() => setSelectedLog(log)}
                      style={{ borderBottom: "1px solid #edf0f4", cursor: "pointer", transition: "background 0.15s ease" }}
                      onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#f8fafc")}
                      onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
                    >
                      <td style={{ padding: "10px 12px", whiteSpace: "nowrap" }}>
                        <div style={{ fontWeight: 600, color: "#1e293b" }}>{formattedDate}</div>
                        <div style={{ fontSize: "11px", color: "#64748b" }}>{formattedTime}</div>
                      </td>

                      <td style={{ padding: "10px 12px" }}>
                        {log.user ? (
                          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                            <div
                              style={{
                                width: "28px",
                                height: "28px",
                                borderRadius: "50%",
                                background: "#1877F2",
                                color: "#fff",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                fontWeight: 800,
                                fontSize: "11px",
                                overflow: "hidden",
                                flexShrink: 0,
                              }}
                            >
                              {log.user.avatarUrl ? (
                                <img src={log.user.avatarUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                              ) : (
                                log.user.name.charAt(0)
                              )}
                            </div>
                            <div>
                              <div style={{ fontWeight: 600, color: "#1e293b", fontSize: "12.5px" }}>{log.user.name}</div>
                              <div style={{ fontSize: "11px", color: "#64748b" }}>{log.user.role}</div>
                            </div>
                          </div>
                        ) : (
                          <div style={{ color: "#94a3b8", fontSize: "12px", fontStyle: "italic" }}>ប្រព័ន្ធ (System / Live)</div>
                        )}
                      </td>

                      <td style={{ padding: "10px 12px" }}>{getActionBadge(log.action)}</td>

                      <td style={{ padding: "10px 12px" }}>
                        <span style={{ fontWeight: 600, color: "#334155", fontSize: "12px" }}>{log.entity}</span>
                        {log.entityId && (
                          <div style={{ fontSize: "10.5px", color: "#94a3b8", fontFamily: "monospace" }}>
                            {log.entityId.slice(0, 14)}...
                          </div>
                        )}
                      </td>

                      <td style={{ padding: "10px 12px", maxWidth: "260px" }}>
                        {log.metadata ? (
                          <div
                            style={{
                              fontSize: "11.5px",
                              color: "#475569",
                              whiteSpace: "nowrap",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              background: "#f1f5f9",
                              padding: "2px 6px",
                              borderRadius: "4px",
                              fontFamily: "monospace",
                            }}
                          >
                            {JSON.stringify(log.metadata)}
                          </div>
                        ) : (
                          <span style={{ color: "#cbd5e1" }}>—</span>
                        )}
                      </td>

                      <td style={{ padding: "10px 12px", textAlign: "right" }}>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedLog(log);
                          }}
                          style={{
                            background: "none",
                            border: "none",
                            color: "#1877F2",
                            cursor: "pointer",
                            fontSize: "12px",
                            fontWeight: 700,
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "2px",
                          }}
                        >
                          មើល <ChevronRight size={14} />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div style={{ marginTop: "14px" }}>
          <DataTablePagination
            currentPage={pagination.page}
            pageSize={pagination.pageSize}
            totalItems={pagination.total}
            totalPages={pagination.totalPages}
            pageSizeOptions={[10, 20, 50, 100]}
            onPageChange={(p) => setPage(p)}
            onPageSizeChange={(newSize) => {
              setPageSize(newSize);
              setPage(1);
            }}
          />
        </div>
      </div>

      {/* Audit Log Detail Modal */}
      {selectedLog && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.5)",
            backdropFilter: "blur(4px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 100,
            padding: "16px",
          }}
        >
          <div
            style={{
              background: "#ffffff",
              borderRadius: "16px",
              width: "100%",
              maxWidth: "520px",
              padding: "22px",
              boxShadow: "0 20px 40px rgba(0,0,0,0.2)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                {getActionBadge(selectedLog.action)}
                <span style={{ fontSize: "12px", color: "#64748b" }}>
                  {new Date(selectedLog.createdAt).toLocaleString()}
                </span>
              </div>
              <button
                onClick={() => setSelectedLog(null)}
                style={{ background: "none", border: "none", fontSize: "18px", cursor: "pointer", color: "#94a3b8" }}
              >
                ✕
              </button>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "10px", fontSize: "13px" }}>
              <div style={{ background: "#f8fafc", padding: "10px 14px", borderRadius: "8px", border: "1px solid #edf0f4" }}>
                <div>អ្នកធ្វើសកម្មភាព: <strong>{selectedLog.user?.name || "System"}</strong> {selectedLog.user?.email && `(${selectedLog.user.email})`}</div>
                <div>គោលដៅ (Entity): <strong>{selectedLog.entity}</strong> {selectedLog.entityId && `(ID: ${selectedLog.entityId})`}</div>
              </div>

              <div>
                <div style={{ fontWeight: 700, color: "#1e293b", marginBottom: "4px" }}>ទិន្នន័យលម្អិត (Sanitized Metadata)</div>
                <pre
                  style={{
                    background: "#0f172a",
                    color: "#38bdf8",
                    padding: "12px",
                    borderRadius: "8px",
                    fontSize: "12px",
                    overflowX: "auto",
                    fontFamily: "monospace",
                    maxHeight: "220px",
                  }}
                >
                  {JSON.stringify(selectedLog.metadata, null, 2) || "{}"}
                </pre>
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "6px" }}>
                <button
                  onClick={() => setSelectedLog(null)}
                  style={{ padding: "8px 16px", borderRadius: "8px", border: "1px solid #cbd5e1", background: "#fff", cursor: "pointer", fontSize: "13px" }}
                >
                  បិទ
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
