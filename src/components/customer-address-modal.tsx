"use client";

import { useState, FormEvent } from "react";
import { MapPin, X } from "lucide-react";
import { CAMBODIA_PROVINCES } from "@/lib/cambodia";
import { useToast } from "./ui/toast-provider";

export interface CustomerAddressItem {
  id: string;
  customerId: string;
  label: string | null;
  recipient: string;
  phone: string | null;
  address: string;
  province?: string | null;
  district?: string | null;
  commune?: string | null;
  isDefault: boolean;
}

interface CustomerAddressModalProps {
  customerId: string;
  customerName: string;
  customerPhone?: string | null;
  address?: CustomerAddressItem | null;
  close: () => void;
  onSaved: (saved: CustomerAddressItem) => void;
  lang?: "kh" | "en";
}

export function CustomerAddressModal({
  customerId,
  customerName,
  customerPhone,
  address,
  close,
  onSaved,
  lang = "kh",
}: CustomerAddressModalProps) {
  const notify = useToast();
  const isKh = lang === "kh";

  const [label, setLabel] = useState(address?.label || "ផ្ទះ (Home)");
  const [recipient, setRecipient] = useState(address?.recipient || customerName);
  const [phone, setPhone] = useState(address?.phone || customerPhone || "");
  const [provinceId, setProvinceId] = useState(address?.province || "PP");
  const [streetAddress, setStreetAddress] = useState(address?.address || "");
  const [isDefault, setIsDefault] = useState(address?.isDefault ?? true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!recipient.trim() || !streetAddress.trim()) {
      setError(isKh ? "សូមបំពេញឈ្មោះអ្នកទទួល និងអាសយដ្ឋាន" : "Please fill in recipient and address");
      return;
    }

    setBusy(true);
    setError("");

    const selectedProv = CAMBODIA_PROVINCES.find((p) => p.id === provinceId);
    const fullAddress = streetAddress.includes(selectedProv?.nameKh || "")
      ? streetAddress
      : `${selectedProv?.nameKh || ""}, ${streetAddress}`;

    try {
      const url = address
        ? `/api/customers/${customerId}/addresses/${address.id}`
        : `/api/customers/${customerId}/addresses`;

      const method = address ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          label,
          recipient,
          phone,
          address: fullAddress,
          province: provinceId,
          isDefault,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save address");

      notify({
        kind: "success",
        title: isKh ? "បានរក្សាទុកអាសយដ្ឋាន" : "Address saved",
        description: `${recipient} · ${label}`,
      });
      onSaved(data.address);
      close();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error saving address");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) close(); }}>
      <div className="modal" role="dialog" aria-modal="true">
        <div className="modal-head">
          <div className="flex items-center gap-2">
            <MapPin size={18} className="text-blue-600" />
            <div>
              <h2>{address ? (isKh ? "កែប្រែអាសយដ្ឋាន" : "Edit Address") : (isKh ? "បន្ថែមអាសយដ្ឋានដឹកជញ្ជូន" : "Add Delivery Address")}</h2>
              <p>{customerName}</p>
            </div>
          </div>
          <button className="icon-button" onClick={close} aria-label="Close"><X size={17} /></button>
        </div>

        <form onSubmit={submit}>
          {error && <div className="error-banner">{error}</div>}

          <div className="form-grid">
            <div className="form-field">
              <label>{isKh ? "ស្លាកសម្គាល់ (Label)" : "Address Label"}</label>
              <select value={label} onChange={(e) => setLabel(e.target.value)}>
                <option value="ផ្ទះ (Home)">ផ្ទះ (Home)</option>
                <option value="កន្លែងធ្វើការ (Office)">កន្លែងធ្វើការ (Office)</option>
                <option value="ផ្ទះខេត្ត (Province)">ផ្ទះខេត្ត (Province)</option>
                <option value="ផ្សេងៗ (Other)">ផ្សេងៗ (Other)</option>
              </select>
            </div>

            <div className="form-field">
              <label>{isKh ? "ឈ្មោះអ្នកទទួល" : "Recipient Name"}</label>
              <input
                type="text"
                required
                value={recipient}
                onChange={(e) => setRecipient(e.target.value)}
              />
            </div>

            <div className="form-field">
              <label>{isKh ? "លេខទូរស័ព្ទអ្នកទទួល" : "Recipient Phone"}</label>
              <input
                type="text"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+855…"
              />
            </div>

            <div className="form-field">
              <label>{isKh ? "រាជធានី / ខេត្ត" : "Province / City"}</label>
              <select value={provinceId} onChange={(e) => setProvinceId(e.target.value)}>
                {CAMBODIA_PROVINCES.map((p) => (
                  <option key={p.id} value={p.id}>
                    {isKh ? p.nameKh : p.nameEn} ({isKh ? "ថ្លៃដឹកលំនាំដើម " : "Default fee "}${p.defaultFeeUSD.toFixed(2)})
                  </option>
                ))}
              </select>
            </div>

            <div className="form-field full">
              <label>{isKh ? "អាសយដ្ឋានលម្អិត (ខណ្ឌ/ស្រុក សង្កាត់/ឃុំ ផ្លូវ ផ្ទះ)" : "Detailed Address (District, Commune, Street, House)"}</label>
              <textarea
                required
                rows={3}
                value={streetAddress}
                onChange={(e) => setStreetAddress(e.target.value)}
                placeholder={isKh ? "ឧ. ខណ្ឌទួលគោក សង្កាត់បឹងកក់២ ផ្លូវ២៨៩ ផ្ទះលេខ..." : "e.g. Toul Kork, St 289, House..."}
              />
            </div>

            <div className="form-field full flex items-center gap-2">
              <label className="checkbox-label cursor-pointer flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={isDefault}
                  onChange={(e) => setIsDefault(e.target.checked)}
                />
                <span>{isKh ? "កំណត់ជាអាសយដ្ឋានដឹកជញ្ជូនលំនាំដើម" : "Set as default shipping address"}</span>
              </label>
            </div>
          </div>

          <div className="modal-actions">
            <button type="button" className="button" onClick={close}>{isKh ? "បោះបង់" : "Cancel"}</button>
            <button type="submit" className="button primary" disabled={busy}>
              {busy ? (isKh ? "កំពុងរក្សាទុក…" : "Saving…") : (isKh ? "រក្សាទុកអាសយដ្ឋាន" : "Save Address")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
