import { redirect } from "next/navigation";
import Image from "next/image";
import { getAuthContext } from "@/lib/auth";
import { keycloakConfigured } from "@/lib/keycloak-auth";
import { KeycloakLoginForm } from "./keycloak-login-form";
import { Sparkles, ShieldCheck, QrCode, Truck, Printer } from "lucide-react";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  if (await getAuthContext()) redirect("/");
  const { error: errorCode } = await searchParams;

  return (
    <main className="login-page">
      <section className="login-shell">
        <div className="login-visual">
          <div className="login-brand">
            <span className="login-mark">
              <Image src="/som-mark.png" alt="SOM Logo" width={44} height={38} priority />
            </span>
            <span className="login-brand-copy">
              <strong>SOM</strong>
              <small>ប្រព័ន្ធគ្រប់គ្រងការបញ្ជាទិញកម្ពុជា</small>
            </span>
          </div>

          <div className="login-visual-copy">
            <span className="login-eyebrow">CAMBODIA SOCIAL COMMERCE OS</span>
            <h2>
              ការលក់របស់អ្នក<br />
              គ្រប់គ្រងនៅកន្លែងតែមួយ។
            </h2>
            <p>
              ប្រព័ន្ធគ្រប់គ្រងការលក់ Live និង Chat តាម Facebook, TikTok &amp; Telegram សម្រាប់អាជីវកម្មនៅកម្ពុជា។
            </p>

            <div className="login-features-grid" style={{ display: "grid", gap: "0.75rem", marginTop: "1.5rem" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", color: "#e2ecff", fontSize: "0.85rem" }}>
                <span style={{ width: 26, height: 26, borderRadius: "50%", background: "rgba(255,255,255,0.14)", display: "grid", placeItems: "center" }}>
                  <QrCode size={14} color="#93c5fd" />
                </span>
                <span>ទូទាត់ភ្លាមៗជាមួយ <strong>Bakong KHQR</strong> (USD &amp; ៛KHR)</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", color: "#e2ecff", fontSize: "0.85rem" }}>
                <span style={{ width: 26, height: 26, borderRadius: "50%", background: "rgba(255,255,255,0.14)", display: "grid", placeItems: "center" }}>
                  <Truck size={14} color="#93c5fd" />
                </span>
                <span>ភ្ជាប់អ្នកដឹកជញ្ជូន ៦ ក្រុមហ៊ុន &amp; ២៥ ខេត្ត-ក្រុង</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", color: "#e2ecff", fontSize: "0.85rem" }}>
                <span style={{ width: 26, height: 26, borderRadius: "50%", background: "rgba(255,255,255,0.14)", display: "grid", placeItems: "center" }}>
                  <Printer size={14} color="#93c5fd" />
                </span>
                <span>បោះពុម្ពស្លាក <strong>80mm Thermal</strong> &amp; វិក្កយបត្រ <strong>A4</strong></span>
              </div>
            </div>
          </div>

          <div className="login-visual-footer">
            <span className="login-status-dot" />
            <span>ប្រព័ន្ធដំណើរការ ២៤/៧ · បច្ចេកវិទ្យាសុវត្ថិភាពខ្ពស់</span>
          </div>
        </div>

        <div className="login-card">
          <div className="login-card-brand">
            <span className="login-mark">
              <Image src="/som-mark.png" alt="SOM Logo" width={38} height={32} />
            </span>
            <span className="login-brand-copy">
              <strong>SOM</strong>
              <small>ចូលប្រើកន្លែងធ្វើការរបស់អ្នក</small>
            </span>
          </div>

          <KeycloakLoginForm configured={keycloakConfigured} errorCode={errorCode} />

          <div className="login-card-footer">
            <span style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}>
              <ShieldCheck size={14} color="#2357c6" />
              <span>ការចូលប្រើមានសុវត្ថិភាពខ្ពស់</span>
            </span>
            <span>SOM Cloud Security · 2026</span>
          </div>
        </div>
      </section>
    </main>
  );
}
