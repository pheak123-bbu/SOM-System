"use client";

import { useState, FormEvent } from "react";
import { Package, X, ArrowUpRight, ArrowDownRight, RefreshCw } from "lucide-react";
import { useToast } from "./ui/toast-provider";

interface StockAdjustModalProps {
  productId: string;
  productName: string;
  currentStock: number | null;
  variants?: { id: string; name: string; stock: number | null }[];
  close: () => void;
  onSuccess: () => void;
  lang?: "kh" | "en";
}

export function StockAdjustModal({
  productId,
  productName,
  currentStock,
  variants = [],
  close,
  onSuccess,
  lang = "kh",
}: StockAdjustModalProps) {
  const notify = useToast();
  const [selectedVariantId, setSelectedVariantId] = useState<string>(variants[0]?.id || "");
  const [mode, setMode] = useState<"add" | "deduct" | "set">("add");
  const [amount, setAmount] = useState<string>("10");
  const [reason, setReason] = useState<string>("ទំនិញចូលស្តុកថ្មី (Restock)");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const isKh = lang === "kh";
  const activeVariant = variants.find((v) => v.id === selectedVariantId);
  const displayedCurrentStock = variants.length > 0
    ? (activeVariant?.stock ?? null)
    : currentStock;

  async function submit(e: FormEvent) {
    e.preventDefault();
    const qty = parseInt(amount, 10);
    if (isNaN(qty) || qty < 0) {
      setError(isKh ? "សូមបញ្ចូលចំនួនត្រឹមត្រូវ" : "Invalid quantity");
      return;
    }

    setBusy(true);
    setError("");

    try {
      const payload: { delta?: number; setStock?: number; variantId?: string; reason: string } = {
        variantId: variants.length > 0 ? selectedVariantId : undefined,
        reason,
      };

      if (mode === "add") payload.delta = qty;
      else if (mode === "deduct") payload.delta = -qty;
      else payload.setStock = qty;

      const res = await fetch(`/api/products/${productId}/stock`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to adjust stock");

      notify({
        kind: "success",
        title: isKh ? "បានកែសម្រួលស្តុកជោគជ័យ" : "Stock adjusted successfully",
        description: `${productName}${activeVariant ? ` (${activeVariant.name})` : ""}: ${data.newStock}`,
      });
      onSuccess();
      close();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error adjusting stock");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) close(); }}>
      <div className="modal stock-adjust-modal" role="dialog" aria-modal="true">
        <div className="modal-head">
          <div className="stock-modal-title">
            <Package size={18} className="text-blue-600" />
            <div>
              <h2>{isKh ? "កែសម្រួលស្តុកទំនិញ" : "Adjust Inventory"}</h2>
              <p>{productName}</p>
            </div>
          </div>
          <button className="icon-button" onClick={close} aria-label="Close">
            <X size={17} />
          </button>
        </div>

        <form onSubmit={submit}>
          {error && <div className="error-banner">{error}</div>}

          <div className="stock-current-badge">
            <span>{isKh ? "ស្តុកបច្ចុប្បន្ន:" : "Current Stock:"}</span>
            <strong>
              {displayedCurrentStock === null
                ? (isKh ? "មិនបានតាមដាន" : "Untracked")
                : `${displayedCurrentStock} ${isKh ? "គ្រឿង" : "units"}`}
            </strong>
          </div>

          {variants.length > 0 && (
            <div className="form-field">
              <label>{isKh ? "ជ្រើសរើសជម្រើសផលិតផល" : "Select Variant"}</label>
              <select
                value={selectedVariantId}
                onChange={(e) => setSelectedVariantId(e.target.value)}
              >
                {variants.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name} ({isKh ? "ស្តុក: " : "Stock: "} {v.stock ?? "—"})
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="stock-mode-selector">
            <button
              type="button"
              className={`mode-btn ${mode === "add" ? "selected" : ""}`}
              onClick={() => { setMode("add"); setReason(isKh ? "ទំនិញចូលស្តុកថ្មី (Restock)" : "Restock"); }}
            >
              <ArrowUpRight size={15} />
              <span>{isKh ? "+ បន្ថែមស្តុក" : "+ Add Stock"}</span>
            </button>
            <button
              type="button"
              className={`mode-btn ${mode === "deduct" ? "selected" : ""}`}
              onClick={() => { setMode("deduct"); setReason(isKh ? "ទំនិញខូចខាត / បាត់បង់" : "Damaged / Loss"); }}
            >
              <ArrowDownRight size={15} />
              <span>{isKh ? "- ដកស្តុក" : "- Deduct"}</span>
            </button>
            <button
              type="button"
              className={`mode-btn ${mode === "set" ? "selected" : ""}`}
              onClick={() => { setMode("set"); setReason(isKh ? "រាប់ស្តុកជាក់ស្ដែង (Audit)" : "Inventory Count"); }}
            >
              <RefreshCw size={15} />
              <span>{isKh ? "កំណត់ចំនួនផ្ទាល់" : "Set Exact"}</span>
            </button>
          </div>

          <div className="form-grid">
            <div className="form-field">
              <label>
                {mode === "set"
                  ? (isKh ? "ចំនួនស្តុកជាក់ស្ដែង" : "Exact Count")
                  : (isKh ? "ចំនួនដែលត្រូវកែប្រែ" : "Adjustment Quantity")}
              </label>
              <input
                type="number"
                min="0"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                required
              />
            </div>

            <div className="form-field">
              <label>{isKh ? "មូលហេតុ" : "Reason"}</label>
              <input
                type="text"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder={isKh ? "ឧ. ទំនិញចូលថ្មី..." : "e.g. New stock..."}
              />
            </div>
          </div>

          <div className="modal-actions">
            <button type="button" className="button" onClick={close}>
              {isKh ? "បោះបង់" : "Cancel"}
            </button>
            <button type="submit" className="button primary" disabled={busy}>
              {busy ? (isKh ? "កំពុងរក្សាទុក…" : "Saving…") : (isKh ? "រក្សាទុកការកែប្រែ" : "Apply Adjustment")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
