"use client";

import { useState } from "react";
import { Send, Sparkles, Check, X, Phone, User, MessageSquare } from "lucide-react";
import { MediaIcon } from "@/components/ui/media-icon";
import { useToast } from "@/components/ui/toast-provider";

const PRESET_MESSAGES = [
  {
    label: "កម្មង់អាវយឺត + ដឹកភ្នំពេញ (ពេញលេញ)",
    text: "សួស្តីបង ខ្ញុំចង់កម្មង់ អាវយឺតកមូលពណ៌ស Size M ចំនួន ២ ដឹកមកទួលគោក ភ្នំពេញ លេខ 012 345 678",
  },
  {
    label: "កម្មង់ផ្ញើតាមខេត្តសៀមរាប",
    text: "បង ជួយផ្ញើ ខោខូវប៊យ Size 32 ចំនួន ១ មកផ្សារលើ ខេត្តសៀមរាប។ លេខទូរស័ព្ទ 098 765 432 វេលុយតាម Bakong",
  },
  {
    label: "សួរតម្លៃ និងស្តុកផលិតផល",
    text: "សួស្តីបង សំពត់ហូលខ្មែរ មានក្នុងស្តុកអត់បង? តម្លៃប៉ុន្មានដែរ?",
  },
];

export function TelegramTestModal({
  close,
  onDetected,
}: {
  close: () => void;
  onDetected: () => void;
}) {
  const notify = useToast();
  const [customerName, setCustomerName] = useState("Sokha Mean");
  const [telegramUsername, setTelegramUsername] = useState("sokha_mean");
  const [message, setMessage] = useState(PRESET_MESSAGES[0].text);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!message.trim()) return;
    setBusy(true);
    setError("");

    try {
      const payload = {
        update_id: Math.floor(Date.now() / 1000),
        message: {
          message_id: Math.floor(Math.random() * 90000) + 10000,
          from: {
            id: 88776655,
            first_name: customerName,
            username: telegramUsername.replace(/^@/, ""),
          },
          chat: {
            id: 88776655,
            type: "private",
            first_name: customerName,
            username: telegramUsername.replace(/^@/, ""),
          },
          date: Math.floor(Date.now() / 1000),
          text: message.trim(),
        },
      };

      const response = await fetch("/api/webhooks/telegram", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "មិនអាចផ្ញើសារសាកល្បង Telegram បានទេ។");

      notify({
        kind: "success",
        title: "AI បានរកឃើញការបញ្ជាទិញតាម Telegram",
        description: `អតិថិជន: ${customerName} · ត្រួតពិនិត្យក្នុងបញ្ជី AI Review`,
      });

      onDetected();
      close();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "មានបញ្ហាក្នុងការផ្ញើសារ");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="modal-backdrop"
      style={{ zIndex: 1200, position: "fixed", inset: 0 }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <section className="modal" style={{ maxWidth: 560 }}>
        <div className="modal-head">
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span
              style={{
                width: 34,
                height: 34,
                borderRadius: "50%",
                background: "#e0f2fe",
                display: "grid",
                placeItems: "center",
              }}
            >
              <MediaIcon channel="TELEGRAM" size={20} />
            </span>
            <div>
              <h2>សាកល្បងការបញ្ជាទិញ Telegram Bot</h2>
              <p>ក្លែងធ្វើការផ្ញើសារចូលពី Telegram ដើម្បីឱ្យ AI វិភាគ និងរកឃើញការបញ្ជាទិញ</p>
            </div>
          </div>
          <button className="icon-button" onClick={close} aria-label="បិទ">
            <X size={17} />
          </button>
        </div>

        <form onSubmit={submit}>
          {error && <div className="error-banner" role="alert">{error}</div>}

          <div className="form-grid" style={{ marginBottom: 14 }}>
            <div className="form-field">
              <label htmlFor="tg-customer-name">ឈ្មោះអតិថិជន Telegram</label>
              <input
                id="tg-customer-name"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                required
                placeholder="ឧ. Sokha Mean"
              />
            </div>
            <div className="form-field">
              <label htmlFor="tg-username">Telegram Username</label>
              <input
                id="tg-username"
                value={telegramUsername}
                onChange={(e) => setTelegramUsername(e.target.value)}
                placeholder="ឧ. sokha_mean"
              />
            </div>
          </div>

          <div className="form-field full" style={{ marginBottom: 12 }}>
            <label style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span>ខ្លឹមសារសារពីអតិថិជន</span>
              <span style={{ fontSize: 11, color: "var(--muted)" }}>ជ្រើសរើសសារគំរូខាងក្រោម</span>
            </label>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
              {PRESET_MESSAGES.map((preset, idx) => (
                <button
                  key={idx}
                  type="button"
                  className="button tiny outline"
                  style={{ fontSize: 11, borderRadius: 16 }}
                  onClick={() => setMessage(preset.text)}
                >
                  <Sparkles size={11} color="#2563eb" /> {preset.label}
                </button>
              ))}
            </div>
            <textarea
              rows={3}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              required
              placeholder="វាយបញ្ចូលសារពីអតិថិជន Telegram..."
              style={{ width: "100%", padding: 10, fontSize: 13, borderRadius: 8, border: "1px solid #cbd5e1" }}
            />
          </div>

          <div
            style={{
              padding: "10px 14px",
              background: "#f0fdf4",
              border: "1px solid #bbf7d0",
              borderRadius: 8,
              fontSize: 12,
              color: "#166534",
              display: "flex",
              alignItems: "center",
              gap: 8,
              marginBottom: 16,
            }}
          >
            <Sparkles size={16} color="#16a34a" />
            <span>AI នឹងស្រង់ទាញយកផលិតផល ចំនួន ទីតាំង និងលេខទូរស័ព្ទចូលទៅក្នុងផ្ទាំង AI Review ភ្លាមៗ។</span>
          </div>

          <div className="modal-actions">
            <button type="button" className="button" onClick={close}>
              បោះបង់
            </button>
            <button className="button primary" disabled={busy || !message.trim()}>
              <Send size={14} />
              {busy ? "កំពុងវិភាគដោយ AI…" : "ផ្ញើសារចូល (Run AI Detection)"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
