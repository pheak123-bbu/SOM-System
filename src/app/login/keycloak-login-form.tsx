"use client";

import { useState, useEffect, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import {
  ArrowRight,
  Eye,
  EyeOff,
  LoaderCircle,
  Lock,
  Mail,
  ShieldCheck,
  Sparkles,
} from "lucide-react";


export function KeycloakLoginForm({
  configured,
  errorCode,
}: {
  configured: boolean;
  errorCode?: string;
}) {
  const router = useRouter();

  // Form states
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const signInError =
    errorCode === "AccessDenied"
      ? "គណនី Keycloak នេះមិនទាន់មានសិទ្ធិចូលប្រើហាងទេ។ សូមទាក់ទងម្ចាស់ហាង ដើម្បីពិនិត្យអ៊ីមែលដែលបានផ្ទៀងផ្ទាត់ និងសិទ្ធិគណនី។"
      : errorCode === "CredentialsSignin"
        ? "អ៊ីមែល ឬពាក្យសម្ងាត់មិនត្រឹមត្រូវទេ។ សូមពិនិត្យម្ដងទៀត។"
        : errorCode
          ? "មិនអាចបញ្ចប់ការចូលប្រើបានទេ។ សូមពិនិត្យការកំណត់ ហើយសាកល្បងម្ដងទៀត។"
          : "";

  async function handleDirectLogin(e: FormEvent) {
    e.preventDefault();
    if (!email || !password) {
      setError("សូមបញ្ចូលអ៊ីមែល និងពាក្យសម្ងាត់។");
      return;
    }

    setBusy(true);
    setError("");

    try {
      const result = await signIn("credentials", {
        email: email.trim(),
        password,
        redirect: false,
        callbackUrl: "/",
      });

      if (!result) {
        setError("មិនអាចតភ្ជាប់ទៅប្រព័ន្ធចូលគណនីបានទេ។");
        setBusy(false);
        return;
      }

      if (result.error) {
        setError("អ៊ីមែល ឬពាក្យសម្ងាត់មិនត្រឹមត្រូវទេ។ សូមពិនិត្យម្ដងទៀត។");
        setBusy(false);
        return;
      }

      if (result.ok) {
        router.push(result.url || "/");
        router.refresh();
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "មានបញ្ហាក្នុងការចូលប្រើប្រព័ន្ធ។");
      setBusy(false);
    }
  }



  return (
    <div className="login-flow login-flow-credentials">
      {/* Top Header Row with Eyebrow */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "8px",
          marginBottom: "0.5rem",
        }}
      >
        <span
          className="login-form-eyebrow"
          style={{ margin: 0, display: "inline-flex", alignItems: "center", gap: "5px" }}
        >
          <Sparkles size={13} color="#2357c6" />
          <span>សូមស្វាគមន៍មកកាន់ SOM</span>
        </span>
      </div>

      {/* Main Title */}
      <h1
        className="login-title font-kantumruy"
        style={{
          margin: "0 0 6px 0",
          fontSize: "25px",
          lineHeight: 1.4,
          color: "#142c68",
          textAlign: "left",
        }}
      >
        ចូលគណនីរបស់អ្នក
      </h1>

      <p
        className="login-description"
        style={{ margin: "0 0 16px 0", color: "#64748b", fontSize: "0.85rem", lineHeight: 1.5, textAlign: "left" }}
      >
        បញ្ចូលអ៊ីមែល និងពាក្យសម្ងាត់របស់អ្នក ដើម្បីចូលប្រើប្រព័ន្ធគ្រប់គ្រងការលក់ SOM ភ្លាមៗ។
      </p>

      {(error || signInError) && (
        <div className="login-error" role="alert" aria-live="polite" style={{ marginBottom: "1rem" }}>
          {error || signInError}
        </div>
      )}

      {/* Direct Login Form */}
      <form onSubmit={handleDirectLogin} style={{ display: "flex", flexDirection: "column", gap: "0.85rem" }}>
        {/* Email Field */}
        <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
          <label
            htmlFor="som-email-input"
            style={{ fontSize: "0.8rem", fontWeight: 600, color: "#334155", display: "flex", alignItems: "center", gap: 5 }}
          >
            <Mail size={13} color="#64748b" />
            <span>អ៊ីមែល (Email)</span>
          </label>
          <div style={{ position: "relative" }}>
            <input
              id="som-email-input"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@company.com"
              required
              disabled={busy}
              style={{
                width: "100%",
                padding: "9px 12px",
                borderRadius: "8px",
                border: "1.5px solid #cbd5e1",
                fontSize: "0.88rem",
                outline: "none",
                transition: "border-color 0.15s ease",
                backgroundColor: busy ? "#f8fafc" : "#ffffff",
              }}
              onFocus={(e) => (e.target.style.borderColor = "#2357c6")}
              onBlur={(e) => (e.target.style.borderColor = "#cbd5e1")}
            />
          </div>
        </div>

        {/* Password Field */}
        <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <label
              htmlFor="som-password-input"
              style={{ fontSize: "0.8rem", fontWeight: 600, color: "#334155", display: "flex", alignItems: "center", gap: 5 }}
            >
              <Lock size={13} color="#64748b" />
              <span>ពាក្យសម្ងាត់ (Password)</span>
            </label>
          </div>
          <div style={{ position: "relative" }}>
            <input
              id="som-password-input"
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••••••"
              required
              disabled={busy}
              style={{
                width: "100%",
                padding: "9px 36px 9px 12px",
                borderRadius: "8px",
                border: "1.5px solid #cbd5e1",
                fontSize: "0.88rem",
                outline: "none",
                transition: "border-color 0.15s ease",
                backgroundColor: busy ? "#f8fafc" : "#ffffff",
              }}
              onFocus={(e) => (e.target.style.borderColor = "#2357c6")}
              onBlur={(e) => (e.target.style.borderColor = "#cbd5e1")}
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              aria-label={showPassword ? "លាក់ពាក្យសម្ងាត់" : "បង្ហាញពាក្យសម្ងាត់"}
              style={{
                position: "absolute",
                right: "8px",
                top: "50%",
                transform: "translateY(-50%)",
                background: "transparent",
                border: "none",
                cursor: "pointer",
                padding: "4px",
                display: "grid",
                placeItems: "center",
                color: "#64748b",
              }}
            >
              {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
        </div>

        {/* Primary Direct Sign In Button */}
        <button
          className="button primary login-submit"
          type="submit"
          disabled={busy}
          aria-busy={busy}
          style={{
            width: "100%",
            minHeight: "46px",
            marginTop: "0.35rem",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "0.55rem",
            fontSize: "0.95rem",
            fontWeight: 700,
            borderRadius: "10px",
            border: "none",
            color: "#ffffff",
            background: "linear-gradient(135deg, #2357c6 0%, #122b68 100%)",
            boxShadow: "0 4px 14px rgba(35, 87, 198, 0.25)",
            cursor: busy ? "not-allowed" : "pointer",
            transition: "transform 0.15s ease, box-shadow 0.15s ease",
          }}
        >
          {busy ? (
            <LoaderCircle size={18} className="login-spinner" aria-hidden="true" />
          ) : (
            <ArrowRight size={17} aria-hidden="true" />
          )}
          <span>{busy ? "កំពុងផ្ទៀងផ្ទាត់ និងចូល…" : "ចូលប្រើប្រាស់"}</span>
        </button>
      </form>
    </div>
  );
}
