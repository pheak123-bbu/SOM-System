"use client";

import { useState, useMemo } from "react";
import { X, PackagePlus, AlertCircle, ArrowRight, Check } from "lucide-react";
import { useToast } from "@/components/ui/toast-provider";

interface ProductItem {
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
}

interface StockInModalProps {
  products: ProductItem[];
  preselectedProductId?: string;
  preselectedVariantId?: string;
  close: () => void;
  onSuccess: () => void;
}

export function StockInModal({
  products,
  preselectedProductId,
  preselectedVariantId,
  close,
  onSuccess,
}: StockInModalProps) {
  const notify = useToast();
  const [productId, setProductId] = useState(preselectedProductId || products[0]?.id || "");
  const [variantId, setVariantId] = useState(preselectedVariantId || "");
  const [movementType, setMovementType] = useState<"STOCK_IN" | "ADJUSTMENT" | "DAMAGE_LOSS">("STOCK_IN");
  const [quantity, setQuantity] = useState("10");
  const [reason, setReason] = useState("");
  const [referenceId, setReferenceId] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const selectedProduct = useMemo(
    () => products.find((p) => p.id === productId),
    [products, productId]
  );

  const selectedVariant = useMemo(
    () => selectedProduct?.variants.find((v) => v.id === variantId),
    [selectedProduct, variantId]
  );

  const currentStock = useMemo(() => {
    if (selectedVariant) return selectedVariant.stock ?? 0;
    return selectedProduct?.stock ?? 0;
  }, [selectedProduct, selectedVariant]);

  const numQty = parseInt(quantity || "0", 10);
  const delta = movementType === "DAMAGE_LOSS" ? -Math.abs(numQty) : Math.abs(numQty);
  const projectedStock = Math.max(0, currentStock + (movementType === "ADJUSTMENT" ? numQty : delta));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (!productId) {
      setError("សូមជ្រើសរើសមុខទំនិញ។");
      return;
    }

    if (numQty === 0) {
      setError("ចំនួនទំនិញត្រូវតែធំជាង 0។");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/inventory/movements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productId,
          variantId: variantId || null,
          type: movementType,
          quantity: movementType === "DAMAGE_LOSS" ? -Math.abs(numQty) : numQty,
          reason: reason.trim() || (movementType === "STOCK_IN" ? "នាំចូលស្តុកបន្ថែម" : "កែសម្រួលស្តុក"),
          referenceId: referenceId.trim() || null,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "មិនអាចកត់ត្រាស្តុកបានទេ។");
      }

      notify({
        kind: "success",
        title: movementType === "STOCK_IN" ? "បាននាំចូលស្តុកជោគជ័យ" : "បានកែសម្រួលស្តុកជោគជ័យ",
        description: `${selectedProduct?.name}${selectedVariant ? ` (${selectedVariant.name})` : ""}: ស្តុកថ្មី ${data.newStock} ឯកតា`,
      });

      onSuccess();
      close();
    } catch (err) {
      setError(err instanceof Error ? err.message : "មានបញ្ហាក្នុងការកត់ត្រាស្តុក");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div
        className="modal modal-card"
        style={{
          width: "min(560px, 95vw)",
          background: "#ffffff",
          borderRadius: 16,
          boxShadow: "0 25px 60px -12px rgba(15, 23, 42, 0.35)",
          border: "1px solid #e2e8f0",
          overflow: "hidden",
          padding: 0,
        }}
        role="dialog"
        aria-modal="true"
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "18px 24px 16px",
            borderBottom: "1px solid #f1f5f9",
            background: "#ffffff",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div
              style={{
                width: 40,
                height: 40,
                borderRadius: 10,
                background: "#e0f2fe",
                color: "#0369a1",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <PackagePlus size={22} />
            </div>
            <div>
              <h2 style={{ fontSize: "1.1rem", fontWeight: 700, margin: 0, color: "#0f172a" }}>
                {movementType === "STOCK_IN" ? "នាំចូលស្តុក (Stock IN)" : "កត់ត្រាបន្លាស់ប្តូរស្តុក"}
              </h2>
              <small style={{ color: "#64748b", fontSize: "0.8rem" }}>
                កត់ត្រាប្រវត្តិនាំចូល ឬកាត់ចេញពីឃ្លាំងដោយស្វ័យប្រវត្តិ
              </small>
            </div>
          </div>
          <button className="icon-button" onClick={close} aria-label="បិទ">
            <X size={18} />
          </button>
        </div>

        {error && (
          <div className="error-banner" style={{ margin: "16px 24px 0" }} role="alert">
            <AlertCircle size={15} /> {error}
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ padding: "20px 24px 24px" }}>
          {/* Movement Type Selector */}
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, marginBottom: 6 }}>
              ប្រភេទសកម្មភាព
            </label>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
              <button
                type="button"
                onClick={() => setMovementType("STOCK_IN")}
                style={{
                  padding: "8px 10px",
                  borderRadius: 6,
                  fontSize: "0.82rem",
                  fontWeight: 600,
                  cursor: "pointer",
                  border: movementType === "STOCK_IN" ? "2px solid #0284c7" : "1px solid #cbd5e1",
                  background: movementType === "STOCK_IN" ? "#f0f9ff" : "#fff",
                  color: movementType === "STOCK_IN" ? "#0369a1" : "#475569",
                }}
              >
                + នាំចូលស្តុក (Restock)
              </button>
              <button
                type="button"
                onClick={() => setMovementType("ADJUSTMENT")}
                style={{
                  padding: "8px 10px",
                  borderRadius: 6,
                  fontSize: "0.82rem",
                  fontWeight: 600,
                  cursor: "pointer",
                  border: movementType === "ADJUSTMENT" ? "2px solid #0284c7" : "1px solid #cbd5e1",
                  background: movementType === "ADJUSTMENT" ? "#f0f9ff" : "#fff",
                  color: movementType === "ADJUSTMENT" ? "#0369a1" : "#475569",
                }}
              >
                កែសម្រួល (Adjust)
              </button>
              <button
                type="button"
                onClick={() => setMovementType("DAMAGE_LOSS")}
                style={{
                  padding: "8px 10px",
                  borderRadius: 6,
                  fontSize: "0.82rem",
                  fontWeight: 600,
                  cursor: "pointer",
                  border: movementType === "DAMAGE_LOSS" ? "2px solid #dc2626" : "1px solid #cbd5e1",
                  background: movementType === "DAMAGE_LOSS" ? "#fef2f2" : "#fff",
                  color: movementType === "DAMAGE_LOSS" ? "#b91c1c" : "#475569",
                }}
              >
                ខូចខាត/បាត់ (Loss)
              </button>
            </div>
          </div>

          {/* Product Select */}
          <div style={{ marginBottom: 14 }}>
            <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, marginBottom: 6 }}>
              មុខទំនិញ *
            </label>
            <select
              className="select"
              value={productId}
              onChange={(e) => {
                setProductId(e.target.value);
                setVariantId("");
              }}
              style={{ width: "100%" }}
              required
            >
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} {p.sku ? `(${p.sku})` : ""} · ស្តុកបច្ចុប្បន្ន: {p.stock ?? 0}
                </option>
              ))}
            </select>
          </div>

          {/* Variant Select (if available) */}
          {selectedProduct && selectedProduct.variants.length > 0 && (
            <div style={{ marginBottom: 14 }}>
              <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, marginBottom: 6 }}>
                ជម្រើសទំហំ/ពណ៌ (Variant)
              </label>
              <select
                className="select"
                value={variantId}
                onChange={(e) => setVariantId(e.target.value)}
                style={{ width: "100%" }}
              >
                <option value="">-- ស្តុកផលិតផលរួម (Standard) --</option>
                {selectedProduct.variants.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name} {v.sku ? `(${v.sku})` : ""} · ស្តុក: {v.stock ?? 0}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Quantity & Live Preview */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
            <div>
              <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, marginBottom: 6 }}>
                {movementType === "STOCK_IN"
                  ? "ចំនួនត្រូវនាំចូល *"
                  : movementType === "DAMAGE_LOSS"
                  ? "ចំនួនខូចខាត *"
                  : "ចំនួនប្រែប្រួល (+ ឬ -) *"}
              </label>
              <input
                type="number"
                className="input"
                style={{ width: "100%", fontSize: "1rem", fontWeight: 600 }}
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                required
                min={movementType === "ADJUSTMENT" ? undefined : "1"}
              />
            </div>

            {/* Visual Stock Transition Preview */}
            <div
              style={{
                background: "#f8fafc",
                borderRadius: 8,
                padding: "8px 12px",
                border: "1px solid #e2e8f0",
                display: "flex",
                flexDirection: "column",
                justifyContent: "center",
              }}
            >
              <small style={{ color: "#64748b", fontSize: "0.75rem", marginBottom: 2 }}>
                ការប្រែប្រួលស្តុក (Transition)
              </small>
              <div style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 700 }}>
                <span style={{ color: "#475569" }}>{currentStock}</span>
                <ArrowRight size={14} style={{ color: "#94a3b8" }} />
                <span
                  style={{
                    color: projectedStock > currentStock ? "#16a34a" : projectedStock < currentStock ? "#dc2626" : "#2563eb",
                    fontSize: "1.1rem",
                  }}
                >
                  {projectedStock} ឯកតា
                </span>
              </div>
            </div>
          </div>

          {/* Reference and Reason */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 18 }}>
            <div>
              <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, marginBottom: 6 }}>
                លេខបុង / លេខយោង (PO / Ref #)
              </label>
              <input
                type="text"
                className="input"
                style={{ width: "100%" }}
                placeholder="ឧ. PO-2026-001"
                value={referenceId}
                onChange={(e) => setReferenceId(e.target.value)}
              />
            </div>
            <div>
              <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, marginBottom: 6 }}>
                មូលហេតុ / កំណត់ចំណាំ
              </label>
              <input
                type="text"
                className="input"
                style={{ width: "100%" }}
                placeholder="ឧ. នាំចូលពីឃ្លាំងធំ"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </div>
          </div>

          {/* Action Buttons */}
          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              alignItems: "center",
              gap: 10,
              paddingTop: 16,
              borderTop: "1px solid #f1f5f9",
              marginTop: 10,
            }}
          >
            <button type="button" className="button" onClick={close} disabled={saving}>
              បោះបង់
            </button>
            <button type="submit" className="button primary" disabled={saving}>
              {saving ? "កំពុងកត់ត្រា…" : "✓ រក្សាទុកបន្លាស់ប្តូរស្តុក"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
