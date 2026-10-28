"use client";

import { useMemo } from "react";
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";

export interface DataTablePaginationProps {
  currentPage: number;
  totalPages: number;
  totalItems: number;
  pageSize?: number;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (pageSize: number) => void;
  pageSizeOptions?: number[];
  itemName?: string; // e.g. "កំណត់ត្រា", "ការបញ្ជាទិញ", "មុខទំនិញ", "អតិថិជន", "ករណី"
}

export function DataTablePagination({
  currentPage,
  totalPages,
  totalItems,
  pageSize = 10,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [10, 20, 50, 100],
  itemName = "កំណត់ត្រា",
}: DataTablePaginationProps) {
  const safeTotalPages = Math.max(1, totalPages);
  const safeCurrentPage = Math.max(1, Math.min(currentPage, safeTotalPages));

  const startItem = totalItems === 0 ? 0 : (safeCurrentPage - 1) * pageSize + 1;
  const endItem = totalItems === 0 ? 0 : Math.min(safeCurrentPage * pageSize, totalItems);

  // Generate page numbers for smart pagination pills
  const pageNumbers = useMemo(() => {
    if (safeTotalPages <= 7) {
      return Array.from({ length: safeTotalPages }, (_, i) => i + 1);
    }
    const pages: (number | string)[] = [1];
    const leftBound = Math.max(2, safeCurrentPage - 1);
    const rightBound = Math.min(safeTotalPages - 1, safeCurrentPage + 1);

    if (leftBound > 2) pages.push("...");
    for (let i = leftBound; i <= rightBound; i++) {
      pages.push(i);
    }
    if (rightBound < safeTotalPages - 1) pages.push("...");
    pages.push(safeTotalPages);
    return pages;
  }, [safeTotalPages, safeCurrentPage]);

  return (
    <div className="table-footer-pagination">
      {/* Items Count Summary & Page Size Filter on Left */}
      <div className="pagination-info" style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
        {totalItems > 0 ? (
          <span>
            បង្ហាញ <strong>{startItem}–{endItem}</strong> នៃ <strong>{totalItems}</strong> {itemName}
          </span>
        ) : (
          <span>មិនមាន{itemName}ទេ</span>
        )}

        {/* Page Size Filter Option Dropdown */}
        {onPageSizeChange && (
          <div
            className="pagination-pagesize-filter"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
              paddingLeft: "8px",
              borderLeft: "1px solid #e2e8f0",
            }}
          >
            <span style={{ fontSize: "12px", color: "#64748b" }}>ក្នុងមួយទំព័រ:</span>
            <select
              value={pageSize}
              onChange={(e) => onPageSizeChange(Number(e.target.value))}
              aria-label="ចំនួនកំណត់ត្រាក្នុងមួយទំព័រ"
              style={{
                padding: "2px 8px",
                height: "26px",
                borderRadius: "6px",
                border: "1px solid #cbd5e1",
                background: "#ffffff",
                fontSize: "12px",
                fontWeight: 600,
                color: "#1e293b",
                cursor: "pointer",
                outline: "none",
              }}
              title="ជ្រើសរើសចំនួនកំណត់ត្រាក្នុងមួយទំព័រ (Items per page)"
            >
              {pageSizeOptions.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Navigation Controls on Right */}
      <div className="pagination-controls">
        {/* Previous Button */}
        <button
          type="button"
          className="button tiny-action pagination-btn"
          disabled={safeCurrentPage <= 1}
          onClick={() => onPageChange(safeCurrentPage - 1)}
          aria-label="ទំព័រមុន (Previous page)"
          title="ទំព័រមុន"
        >
          <ChevronLeft size={14} />
          <span>មុន</span>
        </button>

        {/* Page Number Pills */}
        <div className="pagination-pages" style={{ display: "flex", alignItems: "center", gap: 3 }}>
          {pageNumbers.map((p, idx) => {
            if (p === "...") {
              return (
                <span key={`ellipsis-${idx}`} style={{ padding: "0 4px", color: "#94a3b8", fontSize: "12px" }}>
                  …
                </span>
              );
            }
            const pageNum = p as number;
            const isActive = pageNum === safeCurrentPage;
            return (
              <button
                key={`page-${pageNum}`}
                type="button"
                className={`pagination-page-pill ${isActive ? "active" : ""}`}
                onClick={() => onPageChange(pageNum)}
                aria-current={isActive ? "page" : undefined}
                title={`ទំព័រ ${pageNum}`}
              >
                {pageNum}
              </button>
            );
          })}
        </div>

        {/* Current / Total Page Text Indicator (Compact) */}
        <span className="pagination-page-indicator" style={{ fontSize: "12px", color: "#64748b", margin: "0 4px" }}>
          (ទំព័រ <strong>{safeCurrentPage}</strong>/<strong>{safeTotalPages}</strong>)
        </span>

        {/* Next Button */}
        <button
          type="button"
          className="button tiny-action pagination-btn"
          disabled={safeCurrentPage >= safeTotalPages}
          onClick={() => onPageChange(safeCurrentPage + 1)}
          aria-label="ទំព័របន្ទាប់ (Next page)"
          title="ទំព័របន្ទាប់"
        >
          <span>បន្ទាប់</span>
          <ChevronRight size={14} />
        </button>
      </div>
    </div>
  );
}
