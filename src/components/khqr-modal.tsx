"use client";

import { useEffect, useState } from "react";
import { Download, QrCode, X, Copy, Check } from "lucide-react";
import { formatDualCurrency, toKhmerDigits } from "@/lib/cambodia";
import { generateKHQRDataURL } from "@/lib/khqr-image";

interface KHQRModalProps {
  orderNumber: string;
  totalUSD: number;
  storeName: string;
  bakongAccountId?: string;
  close: () => void;
  lang?: "kh" | "en";
}

export function KHQRModal({
  orderNumber,
  totalUSD,
  storeName,
  bakongAccountId = "seller_som@aba",
  close,
  lang = "kh",
}: KHQRModalProps) {
  const [qrUrl, setQrUrl] = useState<string>("");
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    generateKHQRDataURL({
      amountUSD: totalUSD,
      orderNumber,
      merchantName: storeName,
      bakongAccountId,
    })
      .then((url) => {
        if (active) {
          setQrUrl(url);
          setLoading(false);
        }
      })
      .catch((err) => {
        console.error("Failed to generate KHQR:", err);
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [orderNumber, totalUSD, storeName, bakongAccountId]);

  function copyText() {
    navigator.clipboard.writeText(
      `${storeName} - ${orderNumber}\nសរុប: ${formatDualCurrency(totalUSD)}\nBakong: ${bakongAccountId}`
    );
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function downloadQR() {
    if (!qrUrl) return;
    const link = document.createElement("a");
    link.href = qrUrl;
    link.download = `KHQR-${orderNumber}.png`;
    link.click();
  }

  const isKh = lang === "kh";

  return (
    <div
      className="modal-backdrop"
      style={{ zIndex: 1200, position: "fixed", inset: 0, background: "rgba(14, 28, 64, 0.72)", backdropFilter: "blur(6px)" }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) close(); }}
    >
      <div className="modal khqr-modal" role="dialog" aria-modal="true" aria-label="KHQR Payment" style={{ zIndex: 1210 }}>
        <div className="modal-head">
          <div className="khqr-head-title">
            <span className="khqr-badge">KHQR</span>
            <h2>{isKh ? "ស្កេនទូទាត់ប្រាក់ (Bakong / ABA)" : "Scan to Pay (KHQR)"}</h2>
          </div>
          <button className="icon-button" aria-label="បិទ" onClick={close}>
            <X size={17} />
          </button>
        </div>

        <div className="khqr-body">
          <div className="khqr-card">
            <div className="khqr-card-header">
              <span className="khqr-bank-tag">BAKONG KHQR</span>
              <strong className="khqr-merchant">{storeName}</strong>
              <small className="khqr-account">{bakongAccountId}</small>
            </div>

            <div className="khqr-image-wrap">
              {loading ? (
                <div className="khqr-loading">{isKh ? "កំពុងបង្កើត KHQR…" : "Generating KHQR…"}</div>
              ) : qrUrl ? (
                <img src={qrUrl} alt="KHQR Code" className="khqr-img" />
              ) : (
                <div className="khqr-error">{isKh ? "មិនអាចបង្កើត QR បានទេ" : "Could not generate QR"}</div>
              )}
            </div>

            <div className="khqr-card-footer">
              <div className="khqr-amount-label">{isKh ? "ចំនួនទឹកប្រាក់សរុប" : "Total Amount"}</div>
              <div className="khqr-amount-value">
                {formatDualCurrency(totalUSD, 4100, isKh)}
              </div>
              <div className="khqr-order-sub">
                {isKh ? "លេខបញ្ជាទិញ: " : "Order: "}
                <strong>{orderNumber}</strong>
              </div>
            </div>
          </div>

          <div className="khqr-supported-apps">
            <small>{isKh ? "គាំទ្រការស្កេនជាមួយគ្រប់កម្មវិធីធនាគារនៅកម្ពុជា:" : "Supports all Cambodian banking apps:"}</small>
            <div className="bank-tags">
              <span>ABA Mobile</span>
              <span>Bakong</span>
              <span>ACLEDA mobile</span>
              <span>Wing Bank</span>
              <span>Canadia</span>
              <span>Prince</span>
            </div>
          </div>
        </div>

        <div className="modal-actions khqr-actions">
          <button type="button" className="button" onClick={copyText}>
            {copied ? <Check size={14} className="text-emerald-600" /> : <Copy size={14} />}
            {copied ? (isKh ? "បានចម្លង!" : "Copied!") : (isKh ? "ចម្លងព័ត៌មាន" : "Copy Info")}
          </button>
          <button type="button" className="button" onClick={downloadQR} disabled={!qrUrl}>
            <Download size={14} />
            {isKh ? "ទាញយក QR" : "Download QR"}
          </button>
          <button type="button" className="button primary" onClick={close}>
            {isKh ? "រួចរាល់" : "Done"}
          </button>
        </div>
      </div>
    </div>
  );
}
