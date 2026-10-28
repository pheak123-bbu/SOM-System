"use client";

import { useEffect, useState, use } from "react";

interface LiveProduct {
  id: string;
  cfCode: string;
  customTitle: string | null;
  customPrice: string | number;
  imageUrl: string | null;
  remainingStock: number;
  position: string;
  posX?: number | null;
  posY?: number | null;
  scale?: number;
  cardSize?: string;
  isActive: boolean;
  product?: { name: string; imageUrl?: string | null };
}

interface LiveSession {
  id: string;
  title: string;
  bannerText: string | null;
  topLogoUrl: string | null;
  activePinId: string | null;
  products: LiveProduct[];
}

export default function LiveOverlayPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const resolvedParams = use(params);
  const sessionId = resolvedParams.sessionId;
  const [session, setSession] = useState<LiveSession | null>(null);
  const [batchIndex, setBatchIndex] = useState(0);

  useEffect(() => {
    let isMounted = true;
    const fetchSession = async () => {
      try {
        const res = await fetch(`/api/live/sessions/${sessionId}?view=overlay`);
        if (!res.ok) return;
        const data = await res.json();
        if (isMounted && data.session) {
          setSession(data.session);
        }
      } catch (err) {
        console.error("Overlay fetch error:", err);
      }
    };

    fetchSession();
    const interval = setInterval(fetchSession, 2000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [sessionId]);

  // Auto-rotate product batches if catalog has more than 3 products on either side
  useEffect(() => {
    if (!session) return;
    const timer = setInterval(() => {
      setBatchIndex((prev) => prev + 1);
    }, 7000);
    return () => clearInterval(timer);
  }, [session]);

  if (!session) {
    return <div style={{ background: "transparent", minHeight: "100vh" }} />;
  }

  const customPlacedProducts = session.products.filter(
    (p) => p.isActive && p.posX !== null && p.posY !== null && p.posX !== undefined && p.posY !== undefined
  );
  const leftProducts = session.products.filter(
    (p) => p.position === "LEFT" && p.isActive && (p.posX === null || p.posX === undefined)
  );
  const rightProducts = session.products.filter(
    (p) => p.position === "RIGHT" && p.isActive && (p.posX === null || p.posX === undefined)
  );
  const pinnedProduct = session.products.find((p) => p.id === session.activePinId || p.position === "PINNED");

  // When there are many products, rotate in batches of 3
  const getVisibleBatch = (list: LiveProduct[]) => {
    if (list.length <= 3) return list;
    const offset = (batchIndex * 3) % list.length;
    const batch = list.slice(offset, offset + 3);
    if (batch.length < 3) {
      return [...batch, ...list.slice(0, 3 - batch.length)];
    }
    return batch;
  };

  const visibleLeft = getVisibleBatch(leftProducts);
  const visibleRight = getVisibleBatch(rightProducts);

  const renderProductCard = (p: LiveProduct, isCustom = false) => {
    const img = p.imageUrl || p.product?.imageUrl || "https://images.unsplash.com/photo-1584917865442-de89df76afd3?w=200&q=80";
    const scale = p.scale || 1.0;
    const baseWidth = p.cardSize === "SMALL" ? 72 : p.cardSize === "LARGE" ? 105 : 86;
    const thumbHeight = p.cardSize === "SMALL" ? 58 : p.cardSize === "LARGE" ? 86 : 68;

    return (
      <div
        key={p.id}
        style={{
          position: isCustom ? "absolute" : "relative",
          left: isCustom ? `${p.posX}%` : undefined,
          top: isCustom ? `${p.posY}%` : undefined,
          transform: `scale(${scale})`,
          transformOrigin: isCustom ? "top left" : "center",
          width: `${baseWidth}px`,
          background: "rgba(255, 255, 255, 0.96)",
          borderRadius: "8px",
          boxShadow: "0 6px 18px rgba(0,0,0,0.35)",
          overflow: "hidden",
          border: session.activePinId === p.id ? "2.5px solid #ffd700" : "2px solid #ffffff",
          display: "flex",
          flexDirection: "column",
          zIndex: isCustom ? 36 : 30,
          transition: "transform 0.25s ease, opacity 0.3s ease",
        }}
      >
        <div style={{ position: "relative", width: "100%", height: `${thumbHeight}px`, backgroundColor: "#f0f2f5" }}>
          <img src={img} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          <div
            style={{
              position: "absolute",
              top: "3px",
              right: "3px",
              background: "#00c853",
              color: "#ffffff",
              fontWeight: 900,
              fontSize: "11px",
              padding: "1px 5px",
              borderRadius: "4px",
              boxShadow: "0 2px 5px rgba(0,0,0,0.3)",
            }}
          >
            ${Number(p.customPrice).toFixed(2)}
          </div>
          {p.remainingStock <= 0 && (
            <div
              style={{
                position: "absolute",
                inset: 0,
                background: "rgba(200, 0, 0, 0.8)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#fff",
                fontWeight: 800,
                fontSize: "12px",
              }}
            >
              អស់ស្តុក
            </div>
          )}
        </div>
        <div
          style={{
            background: "#1877F2",
            color: "#ffff00",
            fontWeight: 900,
            fontSize: "12px",
            textAlign: "center",
            padding: "2px",
            letterSpacing: "0.5px",
          }}
        >
          Code: {p.cfCode}
        </div>
        <div
          style={{
            background: "#222",
            color: "#ddd",
            fontSize: "9.5px",
            textAlign: "center",
            padding: "1px 2px",
            fontWeight: 600,
          }}
        >
          នៅសល់: {p.remainingStock}
        </div>
      </div>
    );
  };

  return (
    <div
      style={{
        position: "relative",
        width: "100vw",
        height: "100vh",
        background: "transparent",
        overflow: "hidden",
        fontFamily: "'Kantumruy Pro', sans-serif",
        pointerEvents: "none",
        userSelect: "none",
      }}
    >
      {/* Top Promotional Banner */}
      <div
        style={{
          position: "absolute",
          top: "1.5vh",
          left: "2vw",
          right: "2vw",
          display: "flex",
          flexDirection: "column",
          gap: "8px",
          zIndex: 40,
        }}
      >
        <div
          style={{
            background: "linear-gradient(135deg, #1877F2, #0d5cb6)",
            color: "#ffffff",
            padding: "8px 18px",
            borderRadius: "30px",
            textAlign: "center",
            fontWeight: 700,
            fontSize: "clamp(13px, 1.6vw, 18px)",
            boxShadow: "0 4px 15px rgba(0,0,0,0.35)",
            border: "2px solid rgba(255,255,255,0.85)",
            letterSpacing: "0.2px",
          }}
        >
          {session.bannerText || "លេខទូរស័ព្ទទំនាក់ទំនង 012 345 678 | ដឹកជញ្ជូន 25 ខេត្ត/ក្រុង"}
        </div>

        {/* Pinned Spotlight Banner if active */}
        {pinnedProduct && (
          <div
            style={{
              background: "rgba(0, 0, 0, 0.82)",
              backdropFilter: "blur(8px)",
              color: "#ffffff",
              padding: "6px 14px",
              borderRadius: "12px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              border: "1.5px solid #ffd700",
              boxShadow: "0 4px 14px rgba(0,0,0,0.45)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <img
                src={pinnedProduct.imageUrl || pinnedProduct.product?.imageUrl || "https://images.unsplash.com/photo-1584917865442-de89df76afd3?w=100&q=80"}
                alt=""
                style={{
                  width: "40px",
                  height: "40px",
                  objectFit: "cover",
                  borderRadius: "6px",
                  border: "1.5px solid #ffd700",
                  flexShrink: 0,
                }}
              />
              <span
                style={{
                  background: "#ff0044",
                  color: "#fff",
                  padding: "2px 8px",
                  borderRadius: "6px",
                  fontSize: "clamp(10px, 1.2vw, 13px)",
                  fontWeight: 800,
                }}
              >
                កំពុងបង្ហាញ
              </span>
              <span style={{ fontWeight: 600, fontSize: "clamp(12px, 1.4vw, 16px)" }}>
                {pinnedProduct.customTitle || pinnedProduct.product?.name}
              </span>
              <span
                style={{
                  background: "#1877F2",
                  color: "#ffff00",
                  padding: "2px 8px",
                  borderRadius: "6px",
                  fontWeight: 900,
                  fontSize: "clamp(12px, 1.4vw, 15px)",
                }}
              >
                Code: {pinnedProduct.cfCode}
              </span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              <span style={{ color: "#39ff14", fontWeight: 800, fontSize: "clamp(14px, 1.7vw, 18px)" }}>
                ${Number(pinnedProduct.customPrice).toFixed(2)}
              </span>
              <span
                style={{
                  background: pinnedProduct.remainingStock > 0 ? "rgba(24,167,135,0.3)" : "rgba(220,53,69,0.4)",
                  color: pinnedProduct.remainingStock > 0 ? "#20c997" : "#ff6b6b",
                  padding: "2px 8px",
                  borderRadius: "6px",
                  fontSize: "clamp(11px, 1.2vw, 13px)",
                  fontWeight: 700,
                }}
              >
                ស្តុក: {pinnedProduct.remainingStock}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Freeform Custom Moved Products */}
      {customPlacedProducts.map((p) => renderProductCard(p, true))}

      {/* Default Column: Left Products (Auto-Rotated) */}
      <div
        style={{
          position: "absolute",
          top: pinnedProduct ? "14vh" : "11vh",
          left: "2vw",
          display: "flex",
          flexDirection: "column",
          gap: "8px",
          zIndex: 35,
        }}
      >
        {visibleLeft.map((p) => renderProductCard(p, false))}
      </div>

      {/* Default Column: Right Products (Auto-Rotated) */}
      <div
        style={{
          position: "absolute",
          top: pinnedProduct ? "14vh" : "11vh",
          right: "2vw",
          display: "flex",
          flexDirection: "column",
          gap: "8px",
          zIndex: 35,
        }}
      >
        {visibleRight.map((p) => renderProductCard(p, false))}
      </div>

      {/* Bottom Running Marquee Ticker (Shows ALL Products Smoothly) */}
      <div
        style={{
          position: "absolute",
          bottom: "12px",
          left: "2vw",
          right: "2vw",
          background: "rgba(0, 0, 0, 0.78)",
          backdropFilter: "blur(6px)",
          borderRadius: "20px",
          padding: "5px 14px",
          overflow: "hidden",
          whiteSpace: "nowrap",
          zIndex: 40,
          border: "1px solid rgba(255,255,255,0.25)",
        }}
      >
        <div className="live-overlay-marquee">
          {session.products.filter((p) => p.isActive).map((p) => (
            <span
              key={p.id}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                marginRight: "28px",
                color: "#ffffff",
                fontSize: "12.5px",
              }}
            >
              <span
                style={{
                  background: "#1877F2",
                  color: "#ffff00",
                  padding: "1px 6px",
                  borderRadius: "4px",
                  fontWeight: 900,
                  fontSize: "11px",
                }}
              >
                Code: {p.cfCode}
              </span>
              <span style={{ fontWeight: 600 }}>{p.customTitle || p.product?.name}</span>
              <span style={{ color: "#39ff14", fontWeight: 800 }}>${Number(p.customPrice).toFixed(2)}</span>
              <span
                style={{
                  color: p.remainingStock > 0 ? "#4ade80" : "#f87171",
                  fontSize: "11px",
                  fontWeight: 700,
                }}
              >
                (សល់ {p.remainingStock})
              </span>
            </span>
          ))}
        </div>
      </div>

      <style jsx global>{`
        @keyframes marqueeScroll {
          0% {
            transform: translateX(100%);
          }
          100% {
            transform: translateX(-100%);
          }
        }
        .live-overlay-marquee {
          display: inline-block;
          animation: marqueeScroll 24s linear infinite;
        }
      `}</style>
    </div>
  );
}
