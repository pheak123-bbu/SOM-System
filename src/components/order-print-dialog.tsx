"use client";

import { useEffect, useState } from "react";
import { Printer, X, FileText, Receipt, Download } from "lucide-react";
import {
  CAMBODIA_COURIERS,
  CAMBODIA_PAYMENT_METHODS,
  PAYMENT_STATUSES,
  formatDualCurrency,
  formatKHR,
  formatUSD,
  toKhmerDigits,
  decodeOrderMetadata,
} from "@/lib/cambodia";
import { generateKHQRDataURL } from "@/lib/khqr-image";

export interface PrintableOrder {
  id: string;
  orderNumber: string;
  customer: string;
  phone: string;
  status: string;
  channel: string;
  subtotal: number;
  discount: number;
  deliveryFee: number;
  total: number;
  deliveryAddress: string | null;
  notes: string | null;
  createdAt: string;
  items: {
    productName: string;
    variantName?: string | null;
    quantity: number;
    unitPrice: number;
    lineTotal: number;
  }[];
}

interface OrderPrintDialogProps {
  order: PrintableOrder;
  storeName: string;
  storePhone?: string;
  storeAddress?: string;
  exchangeRate?: number;
  close: () => void;
  lang?: "kh" | "en";
}

export function OrderPrintDialog({
  order,
  storeName,
  storePhone,
  storeAddress,
  exchangeRate = 4100,
  close,
  lang = "kh",
}: OrderPrintDialogProps) {
  const displayPhone = storePhone?.trim() || "012 345 678";
  const [printType, setPrintType] = useState<"thermal" | "invoice">("thermal");
  const [khqrUrl, setKhqrUrl] = useState<string>("");

  const isKh = lang === "kh";
  const meta = decodeOrderMetadata(order.notes);
  const activeExchangeRate = meta.exchangeRate || exchangeRate;
  const courier = CAMBODIA_COURIERS.find((c) => c.id === meta.courier) || {
    nameKh: meta.courier || "សេវាដឹកជញ្ជូន",
    nameEn: meta.courier || "Courier",
  };
  const payMethod = CAMBODIA_PAYMENT_METHODS.find((p) => p.id === meta.paymentMethod) || {
    nameKh: meta.paymentMethod,
    nameEn: meta.paymentMethod,
  };

  useEffect(() => {
    generateKHQRDataURL({
      amountUSD: order.total,
      orderNumber: order.orderNumber,
      merchantName: storeName,
    })
      .then(setKhqrUrl)
      .catch((err) => console.error("KHQR error:", err));
  }, [order.total, order.orderNumber, storeName]);

  function handlePrint() {
    window.print();
  }

  const dateStr = new Date(order.createdAt).toLocaleDateString("en-GB", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <div className="modal-backdrop print-dialog-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) close(); }}>
      <div className="modal print-modal" role="dialog" aria-modal="true">
        {/* Screen Toolbar (hidden in print) */}
        <div className="modal-head no-print">
          <div className="print-type-toggle">
            <button
              type="button"
              className={`button ${printType === "thermal" ? "primary" : ""}`}
              onClick={() => setPrintType("thermal")}
            >
              <Receipt size={14} />
              {isKh ? "ស្លាកដឹកជញ្ជូន 80mm" : "80mm Shipping Label"}
            </button>
            <button
              type="button"
              className={`button ${printType === "invoice" ? "primary" : ""}`}
              onClick={() => setPrintType("invoice")}
            >
              <FileText size={14} />
              {isKh ? "វិក្កយបត្រផ្លូវការ A4" : "Official A4 Invoice"}
            </button>
          </div>
          <div className="modal-actions-right">
            <button type="button" className="button primary" onClick={handlePrint}>
              <Printer size={14} />
              {isKh ? "បោះពុម្ព (Print)" : "Print"}
            </button>
            <button type="button" className="icon-button" onClick={close} aria-label="Close">
              <X size={17} />
            </button>
          </div>
        </div>

        {/* Printable Content Area */}
        <div className="print-content-scroll">
          {printType === "thermal" ? (
            /* ================= 80mm THERMAL RECEIPT ================= */
            <div className="thermal-receipt" id="printable-thermal">
              <div className="thermal-header">
                <div className="thermal-store-name">{storeName}</div>
                <div className="thermal-store-contact">Tel: {displayPhone}</div>
                <div className="thermal-divider-dashed" />
                <div className="thermal-order-badge">
                  <span>{order.orderNumber}</span>
                  <small>{dateStr}</small>
                </div>
              </div>

              {/* Courier & Destination Banner */}
              <div className="thermal-courier-box">
                <div className="courier-name">
                  🚚 {isKh ? courier.nameKh : courier.nameEn}
                </div>
                {meta.trackingNumber && (
                  <div className="courier-track">
                    Track #: <strong>{meta.trackingNumber}</strong>
                  </div>
                )}
              </div>

              {/* Recipient Information */}
              <div className="thermal-section">
                <div className="thermal-label">{isKh ? "អ្នកទទួល (CUSTOMER)" : "RECIPIENT"}:</div>
                <div className="customer-name-large">{order.customer}</div>
                <div className="customer-phone-bold">📞 {order.phone || "—"}</div>
                <div className="customer-address-box">
                  📍 {order.deliveryAddress || "មិនមានអាសយដ្ឋាន"}
                </div>
              </div>

              <div className="thermal-divider-dashed" />

              {/* Items List */}
              <div className="thermal-section">
                <table className="thermal-items-table">
                  <thead>
                    <tr>
                      <th align="left">{isKh ? "មុខទំនិញ" : "Item"}</th>
                      <th align="center">{isKh ? "ចំនួន" : "Qty"}</th>
                      <th align="right">{isKh ? "តម្លៃ" : "Price"}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {order.items.map((item, index) => (
                      <tr key={index}>
                        <td>
                          <strong>{item.productName}</strong>
                          {item.variantName && <small> · {item.variantName}</small>}
                        </td>
                        <td align="center">x{item.quantity}</td>
                        <td align="right">{formatUSD(item.lineTotal)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="thermal-divider-dashed" />

              {/* Financial Totals */}
              <div className="thermal-totals">
                <div className="thermal-row">
                  <span>{isKh ? "ថ្លៃទំនិញ" : "Subtotal"}:</span>
                  <span>{formatUSD(order.subtotal)}</span>
                </div>
                {order.discount > 0 && (
                  <div className="thermal-row">
                    <span>{isKh ? "បញ្ចុះតម្លៃ" : "Discount"}:</span>
                    <span>-{formatUSD(order.discount)}</span>
                  </div>
                )}
                <div className="thermal-row">
                  <span>{isKh ? "ថ្លៃដឹកជញ្ជូន" : "Delivery Fee"}:</span>
                  <span>{formatUSD(order.deliveryFee)}</span>
                </div>

                {/* COD Prominent Box */}
                <div className="thermal-cod-box">
                  <div className="cod-label">
                    {meta.paymentMethod === "COD"
                      ? (isKh ? "ប្រមូលប្រាក់ពេលដឹកដល់ (COD)" : "COLLECT CASH ON DELIVERY (COD)")
                      : (isKh ? "បានទូទាត់រួច (កុំទារប្រាក់)" : "ALREADY PAID (DO NOT COLLECT)")}
                  </div>
                  <div className="cod-amount-usd">{formatUSD(order.total)}</div>
                  <div className="cod-amount-khr">({formatKHR(order.total * activeExchangeRate)})</div>
                </div>
              </div>

              {meta.notes && (
                <div className="thermal-notes">
                  <strong>{isKh ? "ចំណាំ: " : "Note: "}</strong>
                  {meta.notes}
                </div>
              )}

              <div className="thermal-footer">
                {khqrUrl && (
                  <div className="thermal-qr">
                    <img src={khqrUrl} alt="KHQR" />
                    <small>Scan KHQR to pay</small>
                  </div>
                )}
                <div className="thank-you">{isKh ? "សូមអរគុណសម្រាប់ការគាំទ្រ!" : "Thank You for Your Order!"}</div>
              </div>
            </div>
          ) : (
            /* ================= OFFICIAL A4 INVOICE ================= */
            <div className="a4-invoice" id="printable-a4">
              <div className="invoice-header">
                <div className="invoice-brand">
                  <h1 className="invoice-store-name">{storeName}</h1>
                  <p className="invoice-store-sub">
                    Social Seller & E-Commerce Order System
                    <br />
                    Tel: {displayPhone} · {storeAddress || "Phnom Penh, Cambodia"}
                  </p>
                </div>
                <div className="invoice-title-block">
                  <h2 className="invoice-title">{isKh ? "វិក្កយបត្រ" : "INVOICE"}</h2>
                  <div className="invoice-meta-row">
                    <span>{isKh ? "លេខវិក្កយបត្រ:" : "Invoice #:"}</span>
                    <strong>{order.orderNumber}</strong>
                  </div>
                  <div className="invoice-meta-row">
                    <span>{isKh ? "កាលបរិច្ឆេទ:" : "Date:"}</span>
                    <span>{dateStr}</span>
                  </div>
                  <div className="invoice-meta-row">
                    <span>{isKh ? "ស្ថានភាពទូទាត់:" : "Payment:"}</span>
                    <strong className={meta.paymentStatus === "PAID" ? "text-emerald-700" : "text-amber-700"}>
                      {isKh ? (meta.paymentStatus === "PAID" ? "បានបង់ប្រាក់" : "រង់ចាំទូទាត់ (COD)") : meta.paymentStatus}
                    </strong>
                  </div>
                </div>
              </div>

              <div className="invoice-parties">
                <div className="invoice-party-card">
                  <div className="party-title">{isKh ? "ចេញវិក្កយបត្រជូន (BILL TO)" : "BILL TO"}</div>
                  <strong className="party-name">{order.customer}</strong>
                  <div className="party-detail">Phone: {order.phone || "—"}</div>
                  <div className="party-detail">Channel: {order.channel}</div>
                </div>
                <div className="invoice-party-card">
                  <div className="party-title">{isKh ? "ព័ត៌មានដឹកជញ្ជូន (DELIVERY INFO)" : "SHIP TO"}</div>
                  <div className="party-detail">
                    Courier: <strong>{isKh ? courier.nameKh : courier.nameEn}</strong>
                  </div>
                  {meta.trackingNumber && (
                    <div className="party-detail">Tracking #: <strong>{meta.trackingNumber}</strong></div>
                  )}
                  <div className="party-detail">Address: {order.deliveryAddress || "—"}</div>
                </div>
              </div>

              <table className="invoice-items-table">
                <thead>
                  <tr>
                    <th style={{ width: "40px" }}>#</th>
                    <th align="left">{isKh ? "ការពិពណ៌នាទំនិញ" : "Item Description"}</th>
                    <th align="center" style={{ width: "70px" }}>{isKh ? "ចំនួន" : "Qty"}</th>
                    <th align="right" style={{ width: "110px" }}>{isKh ? "តម្លៃឯកតា ($)" : "Unit Price ($)"}</th>
                    <th align="right" style={{ width: "120px" }}>{isKh ? "សរុប ($)" : "Total ($)"}</th>
                    <th align="right" style={{ width: "130px" }}>{isKh ? "សរុប (៛ KHR)" : "Total (KHR)"}</th>
                  </tr>
                </thead>
                <tbody>
                  {order.items.map((item, index) => (
                    <tr key={index}>
                      <td align="center">{index + 1}</td>
                      <td>
                        <strong>{item.productName}</strong>
                        {item.variantName && <span className="variant-sub"> ({item.variantName})</span>}
                      </td>
                      <td align="center">{item.quantity}</td>
                      <td align="right">{formatUSD(item.unitPrice)}</td>
                      <td align="right"><strong>{formatUSD(item.lineTotal)}</strong></td>
                      <td align="right">{formatKHR(item.lineTotal * 4100)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="invoice-bottom-grid">
                <div className="invoice-qr-section">
                  {khqrUrl && (
                    <div className="khqr-print-box">
                      <img src={khqrUrl} alt="KHQR Payment" className="khqr-invoice-img" />
                      <div className="khqr-invoice-text">
                        <strong>KHQR Scan to Pay</strong>
                        <small>ABA Mobile / Bakong / ACLEDA</small>
                      </div>
                    </div>
                  )}
                  {meta.notes && (
                    <div className="invoice-customer-note">
                      <strong>{isKh ? "កំណត់ចំណាំ:" : "Notes:"}</strong>
                      <p>{meta.notes}</p>
                    </div>
                  )}
                </div>

                <div className="invoice-totals-section">
                  <div className="invoice-calc-row">
                    <span>{isKh ? "សរុបមុខទំនិញ (Subtotal):" : "Subtotal:"}</span>
                    <span>{formatUSD(order.subtotal)}</span>
                  </div>
                  {order.discount > 0 && (
                    <div className="invoice-calc-row text-red-700">
                      <span>{isKh ? "ការបញ្ចុះតម្លៃ (Discount):" : "Discount:"}</span>
                      <span>-{formatUSD(order.discount)}</span>
                    </div>
                  )}
                  <div className="invoice-calc-row">
                    <span>{isKh ? "ថ្លៃដឹកជញ្ជូន (Delivery Fee):" : "Delivery Fee:"}</span>
                    <span>{formatUSD(order.deliveryFee)}</span>
                  </div>
                  <div className="invoice-grand-total">
                    <div className="grand-usd">
                      <span>{isKh ? "សរុបរួម:" : "Grand Total:"}</span>
                      <strong>{formatUSD(order.total)}</strong>
                    </div>
                    <div className="grand-khr">
                      ≈ {formatKHR(order.total * 4100)} (អត្រា 1$ = 4,100៛)
                    </div>
                  </div>
                </div>
              </div>

              <div className="invoice-footer">
                <div className="signature-area">
                  <div className="signature-line">
                    <p>{isKh ? "ហត្ថលេខា ឬត្រាហាង" : "Seller Signature & Stamp"}</p>
                  </div>
                  <div className="signature-line">
                    <p>{isKh ? "ហត្ថលេខាអ្នកទទួល" : "Customer Signature"}</p>
                  </div>
                </div>
                <div className="invoice-closing">
                  {isKh ? "សូមអរគុណចំពោះការគាំទ្រផលិតផល និងសេវាកម្មរបស់យើងខ្ញុំ!" : "Thank you for your business!"}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
