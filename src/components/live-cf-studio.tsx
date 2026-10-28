"use client";

import { useEffect, useRef, useState } from "react";
import {
  Radio, Video, VideoOff, Play, Pause, RefreshCw, Plus, Edit3, Trash2,
  Copy, Check, ExternalLink, Send, Sparkles, Heart, ThumbsUp, ShoppingBag,
  Eye, Trophy, MessageCircle, AlertCircle, Pin, Layers, CheckCircle2,
  Volume2, VolumeX, Search, Filter, X, Smartphone, Monitor, ChevronRight,
  Move, Maximize2, Minimize2, Sliders, ZoomIn, ZoomOut, RotateCcw, Crosshair,
  Grid, Columns, LayoutGrid, ArrowUp, ArrowDown, ArrowLeft, ArrowRight, Magnet, Wand2, UploadCloud
} from "lucide-react";

interface LiveProductItem {
  id: string;
  cfCode: string;
  customTitle: string | null;
  customPrice: string | number;
  imageUrl: string | null;
  allocatedStock: number;
  remainingStock: number;
  position: "LEFT" | "RIGHT" | "PINNED" | "HIDDEN" | "CUSTOM";
  posX?: number | null;
  posY?: number | null;
  scale?: number;
  cardSize?: "SMALL" | "MEDIUM" | "LARGE" | "CUSTOM";
  isActive: boolean;
  orderIndex: number;
  productId: string;
  product?: { id: string; name: string; sku: string | null; stock: number | null; imageUrl?: string | null };
}

interface LiveSessionData {
  id: string;
  title: string;
  status: string;
  bannerText: string | null;
  topLogoUrl: string | null;
  activePinId: string | null;
  publishedLayout?: string | null;
  publishedAt?: string | null;
  products: LiveProductItem[];
}

interface LiveCommentItem {
  id: string;
  customerName: string;
  text: string;
  badge?: "Top Fan" | "Sharer" | "New";
  avatarBg: string;
  status?: "SUCCESS" | "OUT_OF_STOCK" | "NORMAL";
  replyMessage?: string;
  timestamp: string;
}

interface LiveOrderItem {
  id: string;
  orderNumber: string;
  customer: { id?: string; name: string; phone?: string | null };
  total: number;
  notes?: string | null;
  items: { productName: string; quantity: number; unitPrice: number; lineTotal: number }[];
  createdAt: string;
}

interface Props {
  currencyCode?: string;
  onNavigateToOrders?: () => void;
  onNavigateToConversations?: () => void;
}

const AVATAR_COLORS = ["#1877F2", "#E1306C", "#25D366", "#8b5cf6", "#f59e0b", "#ec4899", "#10b981"];

const SAMPLE_NAMES = [
  "សុខា ភ្នំពេញ", "កញ្ញា ម៉ារី", "ដារ៉ា សៀមរាប", "ចាន់ថន បាត់ដំបង",
  "ពិសី កំពង់ចាម", "ស្រីពៅ កណ្តាល", "គឹមហួង Eva Fan", "សេងហួត តាកែវ"
];

function playCfSuccessSound() {
  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    const now = ctx.currentTime;
    osc.frequency.setValueAtTime(587.33, now); // D5
    osc.frequency.setValueAtTime(880, now + 0.1); // A5
    osc.frequency.setValueAtTime(1174.66, now + 0.2); // D6
    gain.gain.setValueAtTime(0.18, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.55);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.55);
  } catch {
    // Autoplay restrictions or unsupported
  }
}

export function LiveCfStudio({ currencyCode = "USD", onNavigateToOrders, onNavigateToConversations }: Props) {
  const [activeTab, setActiveTab] = useState<"studio" | "products" | "orders">("studio");
  const [session, setSession] = useState<LiveSessionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [recentOrders, setRecentOrders] = useState<LiveOrderItem[]>([]);
  const [soundEnabled, setSoundEnabled] = useState(true);

  // Layout, Grid & Sizing Mode
  const [layoutMode, setLayoutMode] = useState(false);
  const [selectedProductForLayout, setSelectedProductForLayout] = useState<string | null>(null);
  const [draggingProductId, setDraggingProductId] = useState<string | null>(null);
  const phoneStageRef = useRef<HTMLDivElement>(null);
  const [snapToGrid, setSnapToGrid] = useState(true);
  const [showGridLines, setShowGridLines] = useState(true);
  const [resizingProductId, setResizingProductId] = useState<string | null>(null);
  const resizeStateRef = useRef<{ startX: number; startY: number; initialScale: number } | null>(null);
  const [activeGuideLines, setActiveGuideLines] = useState<{ x: number | null; y: number | null; label: string }>({ x: null, y: null, label: "" });
  const [layoutNotice, setLayoutNotice] = useState<string>("");
  const [syncRowScale, setSyncRowScale] = useState(true);

  // Staging vs Live Stream Overlay Sync Status
  const [syncingLive, setSyncingLive] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [hasUnsyncedChanges, setHasUnsyncedChanges] = useState(false);

  // Auto-Rotating & Batch Pagination for Many Products
  const [batchPage, setBatchPage] = useState(0);
  const [autoRotateProducts, setAutoRotateProducts] = useState(true);

  // Video Stage Settings
  const [videoMode, setVideoMode] = useState<"demo" | "webcam" | "poster">("demo");
  const [webcamActive, setWebcamActive] = useState(false);
  const [webcamError, setWebcamError] = useState("");
  const videoRef = useRef<HTMLVideoElement>(null);
  const webcamStreamRef = useRef<MediaStream | null>(null);

  // Live Comments Stream
  const [comments, setComments] = useState<LiveCommentItem[]>([
    { id: "1", customerName: "សុខា ភ្នំពេញ", text: "សួស្តីបង កាបូប EVA ស្អាតណាស់!", badge: "Top Fan", avatarBg: "#1877F2", timestamp: "1 នាទីមុន" },
    { id: "2", customerName: "កញ្ញា ម៉ារី", text: "R445 1", badge: "Sharer", avatarBg: "#E1306C", status: "SUCCESS", replyMessage: "🎉 កក់ R445 x1 ($1.90) ជោគជ័យ!", timestamp: "ទើបតែឥឡូវ" },
  ]);

  // Comment Simulator Form
  const [customName, setCustomName] = useState("អតិថិជន Live");
  const [customComment, setCustomComment] = useState("");
  const [commentSubmitting, setCommentSubmitting] = useState(false);
  const [autoBotActive, setAutoBotActive] = useState(false);

  // Floating Hearts Animation Key tracker
  const [hearts, setHearts] = useState<number[]>([]);

  // Product Setup Modal / Form
  const [editingProduct, setEditingProduct] = useState<LiveProductItem | null>(null);
  const [productModalOpen, setProductModalOpen] = useState(false);
  const [availableProducts, setAvailableProducts] = useState<Array<{ id: string; name: string; sku: string | null; price: number; stock: number | null; imageUrl?: string | null }>>([]);
  const [formProduct, setFormProduct] = useState({
    productId: "",
    cfCode: "",
    customTitle: "",
    customPrice: "1.90",
    imageUrl: "",
    allocatedStock: 20,
    remainingStock: 20,
    position: "LEFT" as "LEFT" | "RIGHT" | "PINNED" | "HIDDEN" | "CUSTOM",
    scale: 1.0,
    cardSize: "MEDIUM" as "SMALL" | "MEDIUM" | "LARGE" | "CUSTOM",
    isActive: true,
  });
  const [productFormError, setProductFormError] = useState("");
  const [productSaving, setProductSaving] = useState(false);

  // Edit Banner Modal
  const [bannerModalOpen, setBannerModalOpen] = useState(false);
  const [bannerTextValue, setBannerTextValue] = useState("");
  const [bannerSaving, setBannerSaving] = useState(false);

  // Selected Order Details Modal
  const [selectedOrder, setSelectedOrder] = useState<LiveOrderItem | null>(null);

  // Filters
  const [productSearch, setProductSearch] = useState("");
  const [productPositionFilter, setProductPositionFilter] = useState("ALL");
  const [orderSearch, setOrderSearch] = useState("");

  // OBS Link Copied Toast
  const [copiedLink, setCopiedLink] = useState(false);

  // Load Live Session & Catalog Products
  const loadLiveSession = async (silent = false) => {
    if (!silent) setRefreshing(true);
    try {
      const res = await fetch("/api/live/sessions");
      if (res.ok) {
        const data = await res.json();
        setSession(data.session);
        if (data.session?.bannerText) {
          setBannerTextValue(data.session.bannerText);
        }
        if (data.session?.publishedAt) {
          setLastSyncedAt(data.session.publishedAt);
        }
        if (data.recentOrders) {
          setRecentOrders(data.recentOrders);
        }
      }
    } catch (err) {
      console.error("Failed to load live session:", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  // Publish / Sync current draft layout to the live stream OBS overlay
  const handleSyncToLive = async () => {
    if (!session) return;
    setSyncingLive(true);
    try {
      const res = await fetch(`/api/live/sessions/${session.id}/publish`, {
        method: "POST",
      });
      const data = await res.json();
      if (res.ok) {
        setLastSyncedAt(data.publishedAt || new Date().toISOString());
        setHasUnsyncedChanges(false);
        setLayoutNotice("🚀 បានធ្វើសមកាលកម្ម (Sync) ប្លង់ និងទំនិញទៅ Live Stream (OBS Overlay) រួចរាល់ហើយ!");
        setTimeout(() => setLayoutNotice(""), 4500);
      } else {
        const errMsg = data.error
          ? data.details
            ? `${data.error}: ${data.details}`
            : data.error
          : "មិនអាចធ្វើសមកាលកម្ម (Sync) ទៅកាន់ Live Stream បានទេ។";
        alert(errMsg);
      }
    } catch (err) {
      console.error("Sync to live error:", err);
      alert("មានបញ្ហាក្នុងការធ្វើសមកាលកម្ម (Sync) ទៅកាន់ Live Stream");
    } finally {
      setSyncingLive(false);
    }
  };

  useEffect(() => {
    loadLiveSession();
    fetch("/api/products")
      .then((r) => r.json())
      .then((data) => {
        if (data.products) setAvailableProducts(data.products);
      })
      .catch(() => {});
  }, []);

  // Handle Webcam Toggle
  useEffect(() => {
    if (videoMode === "webcam") {
      setWebcamError("");
      navigator.mediaDevices?.getUserMedia({ video: true, audio: false })
        .then((stream) => {
          webcamStreamRef.current = stream;
          if (videoRef.current) {
            videoRef.current.srcObject = stream;
            videoRef.current.play().catch(() => {});
          }
          setWebcamActive(true);
        })
        .catch((err) => {
          console.warn("Webcam access error:", err);
          setWebcamError("មិនអាចបើកកាមេរ៉ាបានទេ (សូមអនុញ្ញាត Camera Permission)។ បានប្តូរទៅ Demo វិញ។");
          setVideoMode("demo");
          setWebcamActive(false);
        });
    } else {
      if (webcamStreamRef.current) {
        webcamStreamRef.current.getTracks().forEach((track) => track.stop());
        webcamStreamRef.current = null;
      }
      setWebcamActive(false);
    }

    return () => {
      if (webcamStreamRef.current) {
        webcamStreamRef.current.getTracks().forEach((track) => track.stop());
      }
    };
  }, [videoMode]);

  // Auto Bot Simulation
  useEffect(() => {
    if (!autoBotActive || !session) return;
    const interval = setInterval(() => {
      const activeProducts = session.products.filter((p) => p.isActive && p.remainingStock > 0);
      if (activeProducts.length === 0) return;

      const randomProd = activeProducts[Math.floor(Math.random() * activeProducts.length)];
      const randomName = SAMPLE_NAMES[Math.floor(Math.random() * SAMPLE_NAMES.length)];
      const randomQty = Math.random() > 0.8 ? 2 : 1;
      const variations = [
        `${randomProd.cfCode} ${randomQty}`,
        `CF ${randomProd.cfCode}`,
        `យក ${randomProd.cfCode} មួយ`,
        `${randomProd.cfCode} 012${Math.floor(100000 + Math.random() * 900000)}`,
      ];
      const commentText = variations[Math.floor(Math.random() * variations.length)];
      submitComment(commentText, randomName);
    }, 3200);

    return () => clearInterval(interval);
  }, [autoBotActive, session]);

  // Auto-rotate products when there are many items (> 3 in side columns)
  useEffect(() => {
    if (!autoRotateProducts || !session) return;
    const leftCount = session.products.filter(
      (p) => p.position === "LEFT" && p.isActive && (p.posX === null || p.posX === undefined)
    ).length;
    const rightCount = session.products.filter(
      (p) => p.position === "RIGHT" && p.isActive && (p.posX === null || p.posX === undefined)
    ).length;
    const maxItems = Math.max(leftCount, rightCount);
    if (maxItems <= 3) return;
    const interval = setInterval(() => {
      setBatchPage((prev) => prev + 1);
    }, 7000);
    return () => clearInterval(interval);
  }, [autoRotateProducts, session]);

  // Submit Comment to CF Engine
  const submitComment = async (text: string, senderName?: string) => {
    if (!session || !text.trim()) return;
    const commenter = senderName || customName || "អតិថិជន Live";
    setCommentSubmitting(true);

    try {
      const res = await fetch(`/api/live/sessions/${session.id}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerName: commenter,
          commentText: text.trim(),
        }),
      });

      const data = await res.json();
      const color = AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)];

      if (res.ok && data.result) {
        const result = data.result;
        const newComment: LiveCommentItem = {
          id: String(Date.now()),
          customerName: commenter,
          text: text.trim(),
          badge: Math.random() > 0.5 ? "Top Fan" : "Sharer",
          avatarBg: color,
          status: result.success ? "SUCCESS" : result.reason === "OUT_OF_STOCK" ? "OUT_OF_STOCK" : "NORMAL",
          replyMessage: result.message,
          timestamp: "ទើបតែឥឡូវ",
        };

        setComments((prev) => [newComment, ...prev.slice(0, 25)]);

        if (data.products) {
          setSession((prev) => prev ? { ...prev, products: data.products } : null);
        }

        if (result.success) {
          if (soundEnabled) playCfSuccessSound();
          setHearts((prev) => [...prev.slice(-8), Date.now()]);
          loadLiveSession(true);
        }
      }
    } catch (err) {
      console.error("Comment submit error:", err);
    } finally {
      setCommentSubmitting(false);
      setCustomComment("");
    }
  };

  // Quick Restock Product (+5 or +10)
  const handleQuickRestock = async (prod: LiveProductItem, addCount: number) => {
    if (!session) return;
    const newRemaining = prod.remainingStock + addCount;
    const newAllocated = prod.allocatedStock + addCount;

    setSession((prev) => {
      if (!prev) return null;
      return {
        ...prev,
        products: prev.products.map((p) =>
          p.id === prod.id ? { ...p, remainingStock: newRemaining, allocatedStock: newAllocated } : p
        ),
      };
    });

    try {
      await fetch(`/api/live/sessions/${session.id}/products`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: prod.id,
          remainingStock: newRemaining,
          allocatedStock: newAllocated,
        }),
      });
      loadLiveSession(true);
    } catch (err) {
      console.error("Quick restock error:", err);
      loadLiveSession(true);
    }
  };

  // Quick Toggle Active State
  const handleToggleActive = async (prod: LiveProductItem) => {
    if (!session) return;
    const newActive = !prod.isActive;

    setSession((prev) => {
      if (!prev) return null;
      return {
        ...prev,
        products: prev.products.map((p) => p.id === prod.id ? { ...p, isActive: newActive } : p),
      };
    });

    try {
      setHasUnsyncedChanges(true);
      await fetch(`/api/live/sessions/${session.id}/products`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: prod.id,
          isActive: newActive,
        }),
      });
      loadLiveSession(true);
    } catch (err) {
      console.error(err);
      loadLiveSession(true);
    }
  };

  // Drag & Move Pointer Handlers
  const handleCardPointerDown = (prodId: string, e: React.PointerEvent) => {
    if (!layoutMode) return;
    e.preventDefault();
    e.stopPropagation();
    setSelectedProductForLayout(prodId);
    setDraggingProductId(prodId);
  };

  const handleStagePointerMove = (e: React.PointerEvent) => {
    if (!layoutMode || !phoneStageRef.current) return;
    const rect = phoneStageRef.current.getBoundingClientRect();

    // 1. Handle Corner Resize Dragging
    if (resizingProductId && resizeStateRef.current) {
      const deltaX = e.clientX - resizeStateRef.current.startX;
      const deltaY = e.clientY - resizeStateRef.current.startY;
      const delta = (deltaX + deltaY) / 2;
      const rawScale = resizeStateRef.current.initialScale + (delta / 110);
      const snappedScale = Math.round(Math.max(0.65, Math.min(1.8, rawScale)) * 20) / 20;

      // Find row partner if syncRowScale is enabled
      const targetProd = session?.products.find((p) => p.id === resizingProductId);
      let partnerId: string | null = null;
      if (syncRowScale && targetProd && targetProd.posY != null) {
        const isLeft = (targetProd.posX ?? 0) < 40;
        const partner = session?.products.find((p) => {
          if (p.id === resizingProductId || !p.isActive || p.posY == null) return false;
          const otherLeft = (p.posX ?? 0) < 40;
          return isLeft !== otherLeft && Math.abs(p.posY - targetProd.posY!) < 14;
        });
        if (partner) partnerId = partner.id;
      }

      setSession((prev) => {
        if (!prev) return null;
        return {
          ...prev,
          products: prev.products.map((p) => {
            if (p.id === resizingProductId || (partnerId && p.id === partnerId)) {
              return { ...p, scale: snappedScale };
            }
            return p;
          }),
        };
      });
      return;
    }

    // 2. Handle Position Dragging with Snap-to-Grid & Magnetic Alignment
    if (!draggingProductId) return;

    const rawX = ((e.clientX - rect.left) / rect.width) * 100;
    const rawY = ((e.clientY - rect.top) / rect.height) * 100;

    let targetX = rawX;
    let targetY = rawY;
    let guideX: number | null = null;
    let guideY: number | null = null;
    let guideLabel = "";

    if (snapToGrid) {
      const SNAP_THRESHOLD = 3.6;
      const GRID_COLS = [4, 27, 50, 73];
      const GRID_ROWS = [16, 32, 48, 64];

      // Check Magnetic Sibling Snap first
      const otherProducts = session?.products.filter(
        (p) => p.id !== draggingProductId && p.isActive && p.posX != null && p.posY != null
      ) || [];

      for (const other of otherProducts) {
        if (other.posY != null && Math.abs(rawY - other.posY) < SNAP_THRESHOLD) {
          targetY = other.posY;
          guideY = other.posY;
          guideLabel = `តម្រឹមជួរដេកស្មើ (${other.cfCode})`;
          break;
        }
      }

      for (const other of otherProducts) {
        if (other.posX != null && Math.abs(rawX - other.posX) < SNAP_THRESHOLD) {
          targetX = other.posX;
          guideX = other.posX;
          guideLabel = guideLabel ? `${guideLabel} + ជួរឈរ (${other.cfCode})` : `តម្រឹមជួរឈរស្មើ (${other.cfCode})`;
          break;
        }
      }

      // If not snapped to sibling, snap to grid lines
      if (guideY === null) {
        for (const r of GRID_ROWS) {
          if (Math.abs(rawY - r) < SNAP_THRESHOLD) {
            targetY = r;
            guideY = r;
            guideLabel = `Grid Row: ${r}%`;
            break;
          }
        }
      }

      if (guideX === null) {
        for (const c of GRID_COLS) {
          if (Math.abs(rawX - c) < SNAP_THRESHOLD) {
            targetX = c;
            guideX = c;
            guideLabel = guideLabel ? `${guideLabel} | Grid Col: ${c}%` : `Grid Col: ${c}%`;
            break;
          }
        }
      }
    }

    const clampedX = parseFloat(Math.max(2, Math.min(76, targetX)).toFixed(1));
    const clampedY = parseFloat(Math.max(12, Math.min(74, targetY)).toFixed(1));

    setActiveGuideLines({ x: guideX, y: guideY, label: guideLabel });

    setSession((prev) => {
      if (!prev) return null;
      return {
        ...prev,
        products: prev.products.map((p) =>
          p.id === draggingProductId ? { ...p, posX: clampedX, posY: clampedY, position: "CUSTOM" } : p
        ),
      };
    });
  };

  const handleStagePointerUp = async () => {
    setActiveGuideLines({ x: null, y: null, label: "" });

    // Handle corner resize finish
    if (resizingProductId && session) {
      const prod = session.products.find((p) => p.id === resizingProductId);
      setResizingProductId(null);
      resizeStateRef.current = null;
      if (prod && prod.scale != null) {
        setHasUnsyncedChanges(true);
        await handleUpdateScale(prod.id, prod.scale);
      }
      return;
    }

    if (!draggingProductId || !session) return;
    const currentProd = session.products.find((p) => p.id === draggingProductId);
    setDraggingProductId(null);
    if (!currentProd || currentProd.posX == null || currentProd.posY == null) return;

    try {
      setHasUnsyncedChanges(true);
      await fetch(`/api/live/sessions/${session.id}/products`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: currentProd.id,
          posX: currentProd.posX,
          posY: currentProd.posY,
          position: "CUSTOM",
        }),
      });
    } catch (err) {
      console.error("Save position error:", err);
    }
  };

  // Quick Resize Scale Handler (with optional Row Partner Sync)
  const handleUpdateScale = async (prodId: string, newScale: number, syncPartner = syncRowScale) => {
    if (!session) return;
    const clampedScale = Math.max(0.65, Math.min(2.0, parseFloat(newScale.toFixed(2))));
    const targetProd = session.products.find((p) => p.id === prodId);

    // Find row partner (opposite side within 14% Y)
    let partnerId: string | null = null;
    if (syncPartner && targetProd && targetProd.posY != null) {
      const isLeft = (targetProd.posX ?? 0) < 40;
      const partner = session.products.find((p) => {
        if (p.id === prodId || !p.isActive || p.posY == null) return false;
        const otherLeft = (p.posX ?? 0) < 40;
        return isLeft !== otherLeft && Math.abs(p.posY - targetProd.posY!) < 14;
      });
      if (partner) partnerId = partner.id;
    }

    setSession((prev) => {
      if (!prev) return null;
      return {
        ...prev,
        products: prev.products.map((p) => {
          if (p.id === prodId || (partnerId && p.id === partnerId)) {
            return {
              ...p,
              scale: clampedScale,
              ...(partnerId && p.id === partnerId && targetProd?.posY != null ? { posY: targetProd.posY } : {}),
            };
          }
          return p;
        }),
      };
    });

    const updateBatch = [
      { id: prodId, scale: clampedScale },
      ...(partnerId ? [{ id: partnerId, scale: clampedScale, posY: targetProd?.posY ?? undefined }] : []),
    ];

    try {
      setHasUnsyncedChanges(true);
      await fetch(`/api/live/sessions/${session.id}/products`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ batch: updateBatch }),
      });
    } catch (err) {
      console.error("Save scale error:", err);
    }
  };

  // Match and sync row partner (makes opposite card in same row have identical scale and posY)
  const handleMatchRowPartner = async (prodId: string) => {
    if (!session) return;
    const targetProd = session.products.find((p) => p.id === prodId);
    if (!targetProd || targetProd.posY == null) return;
    const isLeft = (targetProd.posX ?? 0) < 40;
    const partner = session.products.find((p) => {
      if (p.id === prodId || !p.isActive || p.posY == null) return false;
      const otherLeft = (p.posX ?? 0) < 40;
      return isLeft !== otherLeft && Math.abs(p.posY - targetProd.posY!) < 14;
    });
    if (!partner) return;

    const matchedScale = targetProd.scale || 1.0;
    const matchedY = targetProd.posY;

    setLayoutNotice(`✨ បានតម្រឹម និងកំណត់ទំហំស្មើគ្នាជាមួយកាត ${partner.cfCode} (${(matchedScale * 100).toFixed(0)}%)!`);
    setTimeout(() => setLayoutNotice(""), 3500);

    setSession((prev) => {
      if (!prev) return null;
      return {
        ...prev,
        products: prev.products.map((p) => {
          if (p.id === partner.id) {
            return { ...p, scale: matchedScale, posY: matchedY };
          }
          return p;
        }),
      };
    });

    try {
      setHasUnsyncedChanges(true);
      await fetch(`/api/live/sessions/${session.id}/products`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          batch: [
            { id: partner.id, scale: matchedScale, posY: matchedY },
          ],
        }),
      });
    } catch (err) {
      console.error("Match row partner error:", err);
    }
  };

  // Pixel-perfect Nudge using arrow keys / buttons
  const handleNudge = async (dir: "up" | "down" | "left" | "right", step = 2) => {
    if (!selectedProductForLayout || !session) return;
    const prod = session.products.find((p) => p.id === selectedProductForLayout);
    if (!prod) return;

    const curX = prod.posX ?? (prod.position === "RIGHT" ? 73 : 4);
    const curY = prod.posY ?? 20;

    let newX = curX;
    let newY = curY;
    if (dir === "left") newX = Math.max(2, curX - step);
    if (dir === "right") newX = Math.min(76, curX + step);
    if (dir === "up") newY = Math.max(12, curY - step);
    if (dir === "down") newY = Math.min(74, curY + step);

    newX = parseFloat(newX.toFixed(1));
    newY = parseFloat(newY.toFixed(1));

    setSession((prev) => {
      if (!prev) return null;
      return {
        ...prev,
        products: prev.products.map((p) =>
          p.id === prod.id ? { ...p, posX: newX, posY: newY, position: "CUSTOM" } : p
        ),
      };
    });

    try {
      setHasUnsyncedChanges(true);
      await fetch(`/api/live/sessions/${session.id}/products`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: prod.id,
          posX: newX,
          posY: newY,
          position: "CUSTOM",
        }),
      });
    } catch (err) {
      console.error("Nudge error:", err);
    }
  };

  // 1-Click Smart Layout Presets (2x2 Grid, Left Stack, Right Stack, Bottom Row, Auto-Tidy)
  const applyPresetLayout = async (presetType: "grid2x2" | "leftStack" | "rightStack" | "bottomRow" | "tidyUp") => {
    if (!session || session.products.length === 0) return;
    const activeProds = session.products.filter((p) => p.isActive);
    if (activeProds.length === 0) return;

    let updatedBatch: Array<{ id: string; posX: number; posY: number; scale: number; position: "CUSTOM" }> = [];
    let notice = "";

    if (presetType === "grid2x2") {
      notice = "✨ បានរៀបចំជាប្លង់ ២ ជួរស្មើគ្នា (2x2 Grid) ដោយជោគជ័យ!";
      const totalRows = Math.ceil(activeProds.length / 2);
      const cardScale = totalRows >= 3 ? 0.86 : 0.95;
      updatedBatch = activeProds.map((p, idx) => {
        const col = idx % 2;
        const row = Math.floor(idx / 2);
        const rowY = totalRows <= 1 ? 22 : totalRows === 2 ? (row === 0 ? 18 : 38) : (16 + Math.round((row / (totalRows - 1)) * 38));
        return {
          id: p.id,
          posX: col === 0 ? 4 : 72,
          posY: rowY,
          scale: cardScale,
          position: "CUSTOM",
        };
      });
    } else if (presetType === "leftStack") {
      notice = "✨ បានរៀបចំជាប្លង់ជួរឈរខាងឆ្វេងស្មើគ្នា ដោយជោគជ័យ!";
      const cardScale = activeProds.length > 3 ? 0.86 : 1.0;
      const stepY = activeProds.length > 3 ? 13 : 17;
      updatedBatch = activeProds.map((p, idx) => ({
        id: p.id,
        posX: 4,
        posY: Math.min(54, 16 + idx * stepY),
        scale: cardScale,
        position: "CUSTOM",
      }));
    } else if (presetType === "rightStack") {
      notice = "✨ បានរៀបចំជាប្លង់ជួរឈរខាងស្តាំស្មើគ្នា ដោយជោគជ័យ!";
      const cardScale = activeProds.length > 3 ? 0.86 : 1.0;
      const stepY = activeProds.length > 3 ? 13 : 17;
      updatedBatch = activeProds.map((p, idx) => ({
        id: p.id,
        posX: 72,
        posY: Math.min(54, 16 + idx * stepY),
        scale: cardScale,
        position: "CUSTOM",
      }));
    } else if (presetType === "bottomRow") {
      notice = "✨ បានរៀបចំជាប្លង់ជួរផ្តេកខាងក្រោម ដោយជោគជ័យ!";
      updatedBatch = activeProds.map((p, idx) => {
        const slot = idx % 3;
        return {
          id: p.id,
          posX: slot === 0 ? 4 : slot === 1 ? 38 : 72,
          posY: 54,
          scale: 0.85,
          position: "CUSTOM",
        };
      });
    } else if (presetType === "tidyUp") {
      notice = "✨ បានតម្រឹមជួរដេក និងជួរឈរឱ្យស្មើគ្នាដោយស្វ័យប្រវត្តិ (Auto-Tidy)!";
      const sorted = [...activeProds].sort((a, b) => (a.posY || 0) - (b.posY || 0));
      const rows: Array<typeof activeProds> = [];
      sorted.forEach((item) => {
        const y = item.posY || 20;
        const matchingRow = rows.find((r) => Math.abs((r[0].posY || 20) - y) < 14);
        if (matchingRow) matchingRow.push(item);
        else rows.push([item]);
      });

      const totalRows = rows.length;
      const cardScale = totalRows >= 3 ? 0.86 : totalRows === 2 ? 0.92 : 1.0;

      rows.forEach((rowItems, rowIndex) => {
        // Safe Y distribution: stays between 16% and 54% to leave top bar and bottom comments clear
        let safeY = 20;
        if (totalRows === 1) {
          const avgY = Math.round(rowItems.reduce((acc, it) => acc + (it.posY || 20), 0) / rowItems.length);
          safeY = Math.min(54, Math.max(16, avgY));
        } else if (totalRows === 2) {
          safeY = rowIndex === 0 ? 18 : 38;
        } else {
          safeY = 16 + Math.round((rowIndex / (totalRows - 1)) * 38);
        }

        const count = rowItems.length;
        rowItems.sort((a, b) => (a.posX || 0) - (b.posX || 0));
        rowItems.forEach((it, colIndex) => {
          let calcX = 4;
          if (count === 1) {
            calcX = it.posX && it.posX > 40 ? 72 : 4;
          } else if (count === 2) {
            calcX = colIndex === 0 ? 4 : 72;
          } else {
            calcX = colIndex === 0 ? 4 : colIndex === 1 ? 38 : 72;
          }
          updatedBatch.push({
            id: it.id,
            posX: calcX,
            posY: safeY,
            scale: cardScale,
            position: "CUSTOM",
          });
        });
      });
    }

    if (updatedBatch.length === 0) return;

    setLayoutNotice(notice);
    setTimeout(() => setLayoutNotice(""), 3500);

    setSession((prev) => {
      if (!prev) return null;
      return {
        ...prev,
        products: prev.products.map((p) => {
          const match = updatedBatch.find((b) => b.id === p.id);
          return match ? { ...p, ...match } : p;
        }),
      };
    });

    try {
      setHasUnsyncedChanges(true);
      await fetch(`/api/live/sessions/${session.id}/products`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ batch: updatedBatch }),
      });
    } catch (err) {
      console.error("Batch preset layout error:", err);
    }
  };

  // Apply Same Size to ALL Active Products
  const applySizeToAll = async (newScale: number) => {
    if (!session) return;
    const activeProds = session.products.filter((p) => p.isActive);
    const updatedBatch = activeProds.map((p) => ({
      id: p.id,
      scale: newScale,
    }));

    setLayoutNotice(`✨ បានកំណត់ទំហំស្មើគ្នាគ្រប់កាត (${(newScale * 100).toFixed(0)}%)!`);
    setTimeout(() => setLayoutNotice(""), 3000);

    setSession((prev) => {
      if (!prev) return null;
      return {
        ...prev,
        products: prev.products.map((p) =>
          p.isActive ? { ...p, scale: newScale } : p
        ),
      };
    });

    try {
      setHasUnsyncedChanges(true);
      await fetch(`/api/live/sessions/${session.id}/products`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ batch: updatedBatch }),
      });
    } catch (err) {
      console.error("Apply size to all error:", err);
    }
  };

  // Reset to Default Column Position
  const handleResetPosition = async (prodId: string, targetCol: "LEFT" | "RIGHT" = "LEFT") => {
    if (!session) return;
    setSession((prev) => {
      if (!prev) return null;
      return {
        ...prev,
        products: prev.products.map((p) =>
          p.id === prodId ? { ...p, posX: null, posY: null, position: targetCol, scale: 1.0, cardSize: "MEDIUM" } : p
        ),
      };
    });

    try {
      setHasUnsyncedChanges(true);
      await fetch(`/api/live/sessions/${session.id}/products`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: prodId,
          posX: null,
          posY: null,
          position: targetCol,
          scale: 1.0,
          cardSize: "MEDIUM",
        }),
      });
    } catch (err) {
      console.error("Reset position error:", err);
    }
  };

  // Open Product Modal
  const openAddProductModal = () => {
    setEditingProduct(null);
    setProductFormError("");
    const initialProduct = availableProducts[0];
    setFormProduct({
      productId: initialProduct?.id || "",
      cfCode: `CF${(session?.products.length || 0) + 1}`,
      customTitle: initialProduct?.name || "",
      customPrice: String(initialProduct?.price || "1.90"),
      imageUrl: initialProduct?.imageUrl || "",
      allocatedStock: 20,
      remainingStock: 20,
      position: "LEFT",
      scale: 1.0,
      cardSize: "MEDIUM",
      isActive: true,
    });
    setProductModalOpen(true);
  };

  const openEditProductModal = (prod: LiveProductItem) => {
    setEditingProduct(prod);
    setProductFormError("");
    setFormProduct({
      productId: prod.productId,
      cfCode: prod.cfCode,
      customTitle: prod.customTitle || prod.product?.name || "",
      customPrice: String(prod.customPrice),
      imageUrl: prod.imageUrl || prod.product?.imageUrl || "",
      allocatedStock: prod.allocatedStock,
      remainingStock: prod.remainingStock,
      position: prod.position,
      scale: prod.scale || 1.0,
      cardSize: prod.cardSize || "MEDIUM",
      isActive: prod.isActive,
    });
    setProductModalOpen(true);
  };

  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!session) return;
    setProductSaving(true);
    setProductFormError("");

    try {
      if (editingProduct) {
        const res = await fetch(`/api/live/sessions/${session.id}/products`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: editingProduct.id,
            cfCode: formProduct.cfCode,
            customTitle: formProduct.customTitle,
            customPrice: parseFloat(formProduct.customPrice),
            imageUrl: formProduct.imageUrl,
            allocatedStock: formProduct.allocatedStock,
            remainingStock: formProduct.remainingStock,
            position: formProduct.position,
            scale: formProduct.scale,
            cardSize: formProduct.cardSize,
            isActive: formProduct.isActive,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "មិនអាចកែប្រែទំនិញបានទេ។");
      } else {
        const res = await fetch(`/api/live/sessions/${session.id}/products`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            productId: formProduct.productId,
            cfCode: formProduct.cfCode,
            customTitle: formProduct.customTitle,
            customPrice: parseFloat(formProduct.customPrice),
            imageUrl: formProduct.imageUrl,
            allocatedStock: formProduct.allocatedStock,
            position: formProduct.position,
            scale: formProduct.scale,
            cardSize: formProduct.cardSize,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "មិនអាចបន្ថែមទំនិញបានទេ។");
      }

      setProductModalOpen(false);
      setHasUnsyncedChanges(true);
      await loadLiveSession(true);
    } catch (err: unknown) {
      setProductFormError(err instanceof Error ? err.message : "មានបញ្ហាក្នុងការរក្សាទុក");
    } finally {
      setProductSaving(false);
    }
  };

  const handleDeleteProduct = async (prodId: string) => {
    if (!session || !confirm("តើអ្នកពិតជាចង់លុបទំនិញនេះពី Live មែនទេ?")) return;
    try {
      await fetch(`/api/live/sessions/${session.id}/products?id=${prodId}`, { method: "DELETE" });
      setHasUnsyncedChanges(true);
      loadLiveSession(true);
    } catch (err) {
      console.error(err);
    }
  };

  const handleTogglePin = async (prod: LiveProductItem) => {
    if (!session) return;
    const newPin = session.activePinId === prod.id ? null : prod.id;
    try {
      await fetch(`/api/live/sessions/${session.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ activePinId: newPin }),
      });
      setHasUnsyncedChanges(true);
      loadLiveSession(true);
    } catch (err) {
      console.error(err);
    }
  };

  const handleSaveBanner = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!session) return;
    setBannerSaving(true);
    try {
      await fetch(`/api/live/sessions/${session.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bannerText: bannerTextValue }),
      });
      setBannerModalOpen(false);
      setHasUnsyncedChanges(true);
      loadLiveSession(true);
    } catch (err) {
      console.error(err);
    } finally {
      setBannerSaving(false);
    }
  };

  const obsOverlayUrl = typeof window !== "undefined" && session
    ? `${window.location.origin}/live-overlay/${session.id}`
    : "";

  const copyObsUrl = () => {
    if (obsOverlayUrl) {
      navigator.clipboard.writeText(obsOverlayUrl);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2500);
    }
  };

  if (loading) {
    return (
      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "450px" }}>
        <RefreshCw className="animate-spin text-blue-600" size={32} />
      </div>
    );
  }

  // Filtered Products for Tab 2
  const filteredProducts = session?.products.filter((p) => {
    const matchesSearch =
      p.cfCode.toLowerCase().includes(productSearch.toLowerCase()) ||
      (p.customTitle || p.product?.name || "").toLowerCase().includes(productSearch.toLowerCase());
    const matchesPos =
      productPositionFilter === "ALL" ||
      (productPositionFilter === "PINNED" ? (session?.activePinId === p.id || p.position === "PINNED") : p.position === productPositionFilter);
    return matchesSearch && matchesPos;
  }) || [];

  // Filtered Orders for Tab 3
  const filteredOrders = recentOrders.filter((ord) => {
    return (
      ord.orderNumber.toLowerCase().includes(orderSearch.toLowerCase()) ||
      ord.customer.name.toLowerCase().includes(orderSearch.toLowerCase()) ||
      (ord.customer.phone || "").includes(orderSearch)
    );
  });

  const customPlacedProducts = session?.products.filter(
    (p) => p.isActive && p.posX !== null && p.posY !== null && p.posX !== undefined && p.posY !== undefined
  ) || [];
  const leftProducts = session?.products.filter(
    (p) => p.position === "LEFT" && p.isActive && (p.posX === null || p.posX === undefined)
  ) || [];
  const rightProducts = session?.products.filter(
    (p) => p.position === "RIGHT" && p.isActive && (p.posX === null || p.posX === undefined)
  ) || [];
  const pinnedProduct = session?.products.find((p) => p.id === session?.activePinId || p.position === "PINNED");
  const selectedProductObj = session?.products.find((p) => p.id === selectedProductForLayout);
  const selectedRowPartner = session?.products.find((p) => {
    if (!selectedProductObj || p.id === selectedProductObj.id || !p.isActive || p.posY == null || selectedProductObj.posY == null) return false;
    const isLeft = (selectedProductObj.posX ?? 0) < 40;
    const otherLeft = (p.posX ?? 0) < 40;
    return isLeft !== otherLeft && Math.abs(p.posY - selectedProductObj.posY) < 14;
  });

  const getVisibleBatch = (list: LiveProductItem[]) => {
    if (list.length <= 3) return list;
    const offset = (batchPage * 3) % list.length;
    const batch = list.slice(offset, offset + 3);
    if (batch.length < 3) {
      return [...batch, ...list.slice(0, 3 - batch.length)];
    }
    return batch;
  };

  const visibleLeft = getVisibleBatch(leftProducts);
  const visibleRight = getVisibleBatch(rightProducts);
  const totalSideBatches = Math.ceil(Math.max(leftProducts.length, rightProducts.length) / 3);
  const currentBatchNum = totalSideBatches > 0 ? (batchPage % totalSideBatches) + 1 : 1;

  const renderProductCard = (p: LiveProductItem, isCustom = false) => {
    const img = p.imageUrl || p.product?.imageUrl || "https://images.unsplash.com/photo-1584917865442-de89df76afd3?w=200&q=80";
    const scale = p.scale || 1.0;
    const isSelected = selectedProductForLayout === p.id;
    const baseWidth = p.cardSize === "SMALL" ? 72 : p.cardSize === "LARGE" ? 105 : 86;
    const thumbHeight = p.cardSize === "SMALL" ? 58 : p.cardSize === "LARGE" ? 86 : 68;

    return (
      <div
        key={p.id}
        onPointerDown={(e) => handleCardPointerDown(p.id, e)}
        onClick={() => {
          if (!layoutMode) handleTogglePin(p);
          else setSelectedProductForLayout(p.id);
        }}
        title={layoutMode ? "ចុចអូសដើម្បីផ្លាស់ប្តូរទីតាំងលើកញ្ចក់ Live" : "ចុចដើម្បី Pin លើកញ្ចក់ Live"}
        style={{
          position: isCustom ? "absolute" : "relative",
          left: isCustom ? `${p.posX}%` : undefined,
          top: isCustom ? `${p.posY}%` : undefined,
          transform: `scale(${scale})`,
          transformOrigin: isCustom ? "top left" : "center",
          width: `${baseWidth}px`,
          background: "#ffffff",
          borderRadius: "7px",
          overflow: "visible",
          boxShadow: layoutMode && isSelected ? "0 0 0 3px #1877F2, 0 6px 18px rgba(24,119,242,0.4)" : "0 3px 10px rgba(0,0,0,0.35)",
          border: session?.activePinId === p.id ? "2px solid #ffd700" : isSelected ? "2px solid #1877F2" : "1.5px solid #ffffff",
          cursor: layoutMode ? "grab" : "pointer",
          zIndex: isCustom ? (isSelected ? 40 : 32) : (isSelected ? 25 : 15),
          transition: (draggingProductId === p.id || resizingProductId === p.id) ? "none" : "transform 0.15s ease, left 0.1s ease, top 0.1s ease",
          userSelect: "none",
          touchAction: layoutMode ? "none" : "auto",
        }}
      >
        {layoutMode && (
          <div
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              background: isSelected ? "#1877F2" : "rgba(0,0,0,0.72)",
              color: "#fff",
              fontSize: "8.5px",
              padding: "2px",
              textAlign: "center",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "2px",
              zIndex: 10,
              fontWeight: 700,
              borderTopLeftRadius: "6px",
              borderTopRightRadius: "6px",
            }}
          >
            <Move size={9} /> {isSelected ? `${((p.scale || 1.0) * 100).toFixed(0)}%` : "អូស"}
          </div>
        )}

        <div style={{ position: "relative", width: "100%", height: `${thumbHeight}px`, backgroundColor: "#f1f5f9", overflow: "hidden", borderTopLeftRadius: layoutMode ? 0 : "6px", borderTopRightRadius: layoutMode ? 0 : "6px" }}>
          <img src={img} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          <div
            style={{
              position: "absolute",
              top: layoutMode ? "18px" : "2px",
              right: "2px",
              background: "#00c853",
              color: "#fff",
              fontWeight: 900,
              fontSize: "9px",
              padding: "1px 4px",
              borderRadius: "3px",
            }}
          >
            ${Number(p.customPrice).toFixed(2)}
          </div>
          {p.remainingStock <= 0 && (
            <div
              style={{
                position: "absolute",
                inset: 0,
                background: "rgba(220,38,38,0.85)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#fff",
                fontSize: "9px",
                fontWeight: 800,
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
            fontSize: "10.5px",
            textAlign: "center",
            padding: "2px",
          }}
        >
          Code: {p.cfCode}
        </div>
        <div style={{ background: "#111", color: "#ddd", fontSize: "8.5px", textAlign: "center", padding: "1px", borderBottomLeftRadius: "6px", borderBottomRightRadius: "6px" }}>
          សល់: {p.remainingStock}
        </div>

        {/* Bottom-Right Interactive Corner Resize Knob */}
        {layoutMode && isSelected && (
          <div
            onPointerDown={(e) => {
              e.stopPropagation();
              e.preventDefault();
              setResizingProductId(p.id);
              resizeStateRef.current = {
                startX: e.clientX,
                startY: e.clientY,
                initialScale: p.scale || 1.0,
              };
            }}
            title="ចុចអូសត្រង់នេះដើម្បី Resize ទំហំកាត"
            style={{
              position: "absolute",
              right: -5,
              bottom: -5,
              width: "18px",
              height: "18px",
              background: "#1877F2",
              border: "2px solid #ffffff",
              borderRadius: "4px",
              cursor: "se-resize",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: "0 2px 8px rgba(0,0,0,0.45)",
              zIndex: 35,
            }}
          >
            <Maximize2 size={10} color="#fff" />
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="live-cf-studio-wrapper" style={{ display: "flex", flexDirection: "column", gap: "16px", width: "100%" }}>
      {/* Top Header & Session Bar */}
      <div
        className="live-header-bar"
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "12px",
          background: "#ffffff",
          padding: "14px 18px",
          borderRadius: "14px",
          boxShadow: "0 2px 10px rgba(0,0,0,0.04)",
          border: "1px solid #edf0f4",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "12px", minWidth: "260px" }}>
          <div
            style={{
              width: "42px",
              height: "42px",
              borderRadius: "12px",
              background: "linear-gradient(135deg, #1877F2, #0d5cb6)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#fff",
              flexShrink: 0,
              boxShadow: "0 4px 12px rgba(24,119,242,0.3)",
            }}
          >
            <Radio size={22} />
          </div>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
              <h2 style={{ fontSize: "17px", fontWeight: 700, margin: 0, color: "#1e293b" }}>
                {session?.title || "Facebook Live CF Studio"}
              </h2>
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "5px",
                  background: "#fee2e2",
                  color: "#dc2626",
                  padding: "2px 8px",
                  borderRadius: "20px",
                  fontSize: "11px",
                  fontWeight: 800,
                }}
              >
                <span style={{ width: "7px", height: "7px", borderRadius: "50%", background: "#dc2626", animation: "pulse 1.5s infinite" }} />
                LIVE ACTIVE
              </span>
            </div>
            <p style={{ margin: "2px 0 0", fontSize: "12px", color: "#64748b" }}>
              ម៉ាស៊ីនកាត់ស្តុកស្វ័យប្រវត្តិ តាមមតិយោបល់ (Comment CF) និងកំណត់ទីតាំង-ទំហំទំនិញលើកញ្ចក់ Live
            </p>
          </div>
        </div>

        {/* Tab Switcher & Action Tools */}
        <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
          <div style={{ display: "flex", background: "#f1f5f9", padding: "3px", borderRadius: "10px", gap: "3px", flexWrap: "wrap" }}>
            <button
              onClick={() => setActiveTab("studio")}
              style={{
                padding: "6px 12px",
                borderRadius: "8px",
                border: "none",
                fontSize: "12px",
                fontWeight: 600,
                cursor: "pointer",
                background: activeTab === "studio" ? "#ffffff" : "transparent",
                color: activeTab === "studio" ? "#1877F2" : "#64748b",
                boxShadow: activeTab === "studio" ? "0 2px 5px rgba(0,0,0,0.06)" : "none",
                display: "flex",
                alignItems: "center",
                gap: "5px",
              }}
            >
              <Smartphone size={14} /> ស្ទូឌីយោ Live
            </button>
            <button
              onClick={() => setActiveTab("products")}
              style={{
                padding: "6px 12px",
                borderRadius: "8px",
                border: "none",
                fontSize: "12px",
                fontWeight: 600,
                cursor: "pointer",
                background: activeTab === "products" ? "#ffffff" : "transparent",
                color: activeTab === "products" ? "#1877F2" : "#64748b",
                boxShadow: activeTab === "products" ? "0 2px 5px rgba(0,0,0,0.06)" : "none",
                display: "flex",
                alignItems: "center",
                gap: "5px",
              }}
            >
              <Layers size={14} /> កំណត់ទំនិញ ({session?.products.length || 0})
            </button>
            <button
              onClick={() => setActiveTab("orders")}
              style={{
                padding: "6px 12px",
                borderRadius: "8px",
                border: "none",
                fontSize: "12px",
                fontWeight: 600,
                cursor: "pointer",
                background: activeTab === "orders" ? "#ffffff" : "transparent",
                color: activeTab === "orders" ? "#1877F2" : "#64748b",
                boxShadow: activeTab === "orders" ? "0 2px 5px rgba(0,0,0,0.06)" : "none",
                display: "flex",
                alignItems: "center",
                gap: "5px",
              }}
            >
              <ShoppingBag size={14} /> ការកក់ Live ({recentOrders.length})
            </button>
          </div>

          {/* Sound Effect Toggle */}
          <button
            onClick={() => setSoundEnabled(!soundEnabled)}
            title={soundEnabled ? "បិទសំឡេងកក់ទំនិញ (Mute Chime)" : "បើកសំឡេងកក់ទំនិញ (Unmute Chime)"}
            style={{
              padding: "7px 10px",
              borderRadius: "8px",
              background: soundEnabled ? "#f0fdf4" : "#f1f5f9",
              color: soundEnabled ? "#16a34a" : "#64748b",
              border: "1px solid #cbd5e1",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: "4px",
              fontSize: "12px",
              fontWeight: 600,
            }}
          >
            {soundEnabled ? <Volume2 size={16} /> : <VolumeX size={16} />}
          </button>

          {/* Live Sync Status Indicator */}
          {lastSyncedAt ? (
            <span
              style={{
                fontSize: "11px",
                color: hasUnsyncedChanges ? "#b45309" : "#047857",
                background: hasUnsyncedChanges ? "#fef3c7" : "#ecfdf5",
                padding: "6px 10px",
                borderRadius: "8px",
                fontWeight: 600,
                display: "inline-flex",
                alignItems: "center",
                gap: "5px",
                border: `1px solid ${hasUnsyncedChanges ? "#fde68a" : "#a7f3d0"}`,
              }}
              title={hasUnsyncedChanges ? "មានការកែប្រែថ្មីលើប្លង់ព្រាង (សូមចុច Sync ដើម្បីដាក់លើកញ្ចក់ Live)" : "បានធ្វើសមកាលកម្មទៅកាន់កញ្ចក់ Live Stream Overlay រួចរាល់ហើយ"}
            >
              <span
                style={{
                  width: "7px",
                  height: "7px",
                  borderRadius: "50%",
                  background: hasUnsyncedChanges ? "#f59e0b" : "#10b981",
                  display: "inline-block",
                }}
              />
              {hasUnsyncedChanges ? "មានការកែប្រែ (ប្លង់ព្រាង)" : "បាន Sync ទៅ Live រួចរាល់"}
            </span>
          ) : (
            <span
              style={{
                fontSize: "11px",
                color: "#b45309",
                background: "#fef3c7",
                padding: "6px 10px",
                borderRadius: "8px",
                fontWeight: 600,
                border: "1px solid #fde68a",
              }}
            >
              ● មិនទាន់បាន Sync ទៅ Live
            </span>
          )}

          {/* Sync to Live Stream Button */}
          <button
            onClick={handleSyncToLive}
            disabled={syncingLive}
            title="ធ្វើសមកាលកម្មប្លង់ និងទំនិញបច្ចុប្បន្នទៅកាន់កញ្ចក់ Live Stream Overlay (OBS)"
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              padding: "7px 14px",
              borderRadius: "8px",
              background: hasUnsyncedChanges
                ? "linear-gradient(135deg, #059669 0%, #10b981 100%)"
                : "#059669",
              color: "#ffffff",
              border: hasUnsyncedChanges ? "1.5px solid #34d399" : "none",
              fontSize: "12px",
              fontWeight: 700,
              cursor: syncingLive ? "not-allowed" : "pointer",
              boxShadow: hasUnsyncedChanges ? "0 2px 10px rgba(16, 185, 129, 0.4)" : "none",
              transition: "all 0.2s ease",
            }}
          >
            <UploadCloud size={15} className={syncingLive ? "animate-spin" : ""} />
            {syncingLive ? "កំពុង Sync..." : "🚀 Sync ទៅ Live Stream"}
          </button>

          {/* Copy OBS Link */}
          <button
            onClick={copyObsUrl}
            title="ចម្លង Link សម្រាប់ដាក់លើ OBS Studio / StreamYard Browser Source"
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              padding: "7px 12px",
              borderRadius: "8px",
              background: "#1877F2",
              color: "#ffffff",
              border: "none",
              fontSize: "12px",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            {copiedLink ? <Check size={14} /> : <Monitor size={14} />}
            {copiedLink ? "បានចម្លង Link OBS!" : "Link សម្រាប់ OBS"}
          </button>
        </div>
      </div>

      {webcamError && (
        <div style={{ background: "#fef2f2", color: "#dc2626", padding: "8px 14px", borderRadius: "10px", fontSize: "12px", border: "1px solid #fecaca" }}>
          {webcamError}
        </div>
      )}

      {/* TAB 1: LIVE STUDIO & SIMULATOR */}
      {activeTab === "studio" && (
        <div className="live-studio-grid">
          {/* LEFT: REALISTIC FACEBOOK LIVE PHONE STAGE */}
          <div className="live-phone-stage-wrapper" style={{ display: "flex", flexDirection: "column", gap: "10px", alignItems: "center" }}>
            {/* Top Layout Mode Toggle & Control Toolbar */}
            <div
              style={{
                width: "100%",
                maxWidth: "380px",
                display: "flex",
                flexDirection: "column",
                gap: "8px",
                background: layoutMode ? "#eff6ff" : "#ffffff",
                padding: layoutMode ? "10px 12px" : "8px 12px",
                borderRadius: "14px",
                border: layoutMode ? "2px solid #1877F2" : "1px solid #edf0f4",
                boxShadow: "0 2px 8px rgba(0,0,0,0.03)",
              }}
            >
              {/* Header Row */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <span style={{ fontSize: "12px", fontWeight: 700, color: layoutMode ? "#1877F2" : "#334155" }}>
                    {layoutMode ? "🎛️ ប្លង់កាតលើកញ្ចក់ Live" : "រៀបចំកាតទំនិញលើកញ្ចក់"}
                  </span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "5px" }}>
                  {totalSideBatches > 1 && !layoutMode && (
                    <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                      <button
                        type="button"
                        onClick={() => setBatchPage((p) => Math.max(0, p - 1))}
                        title="ទំព័រមុន"
                        style={{
                          padding: "3px 6px",
                          borderRadius: "5px",
                          background: "#f1f5f9",
                          border: "1px solid #cbd5e1",
                          cursor: "pointer",
                          fontSize: "10px",
                          fontWeight: 700,
                        }}
                      >
                        ◀
                      </button>
                      <span style={{ fontSize: "10.5px", color: "#475569", fontWeight: 700 }}>
                        {currentBatchNum}/{totalSideBatches}
                      </span>
                      <button
                        type="button"
                        onClick={() => setBatchPage((p) => p + 1)}
                        title="ទំព័របន្ទាប់"
                        style={{
                          padding: "3px 6px",
                          borderRadius: "5px",
                          background: "#f1f5f9",
                          border: "1px solid #cbd5e1",
                          cursor: "pointer",
                          fontSize: "10px",
                          fontWeight: 700,
                        }}
                      >
                        ▶
                      </button>
                      <button
                        type="button"
                        onClick={() => setAutoRotateProducts(!autoRotateProducts)}
                        title="បិទ/បើក ប្តូរទំនិញស្វ័យប្រវត្តិ"
                        style={{
                          padding: "3px 6px",
                          borderRadius: "5px",
                          background: autoRotateProducts ? "#ecfdf5" : "#f1f5f9",
                          color: autoRotateProducts ? "#059669" : "#64748b",
                          border: `1px solid ${autoRotateProducts ? "#a7f3d0" : "#cbd5e1"}`,
                          cursor: "pointer",
                          fontSize: "10px",
                          fontWeight: 700,
                        }}
                      >
                        🔄 Auto
                      </button>
                    </div>
                  )}

                  {layoutMode && (
                    <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                      <button
                        type="button"
                        onClick={() => setShowGridLines(!showGridLines)}
                        title="បិទ/បើក បន្ទាត់ក្រឡាជំនួយការតម្រឹម (Grid Lines)"
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "3px",
                          padding: "4px 8px",
                          borderRadius: "6px",
                          background: showGridLines ? "#1e293b" : "#f1f5f9",
                          color: showGridLines ? "#38bdf8" : "#64748b",
                          border: "1px solid #cbd5e1",
                          fontSize: "10.5px",
                          fontWeight: 700,
                          cursor: "pointer",
                        }}
                      >
                        <Grid size={11} /> Grid
                      </button>
                      <button
                        type="button"
                        onClick={() => setSnapToGrid(!snapToGrid)}
                        title="បិទ/បើក ការស្រូបស្វ័យប្រវត្តិតាមជួរ និងកាតដទៃ (Snap to Grid)"
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "3px",
                          padding: "4px 8px",
                          borderRadius: "6px",
                          background: snapToGrid ? "#ecfdf5" : "#f1f5f9",
                          color: snapToGrid ? "#059669" : "#64748b",
                          border: `1px solid ${snapToGrid ? "#a7f3d0" : "#cbd5e1"}`,
                          fontSize: "10.5px",
                          fontWeight: 700,
                          cursor: "pointer",
                        }}
                      >
                        <Magnet size={11} /> Snap
                      </button>
                      <button
                        type="button"
                        onClick={() => setSyncRowScale(!syncRowScale)}
                        title="បិទ/បើក ការភ្ជាប់ទំហំស្មើគ្នាស្វ័យប្រវត្តិនៃកាតឆ្វេង-ស្តាំក្នុងជួរតែមួយ (Sync Row Size)"
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "3px",
                          padding: "4px 8px",
                          borderRadius: "6px",
                          background: syncRowScale ? "#eff6ff" : "#f1f5f9",
                          color: syncRowScale ? "#1d4ed8" : "#64748b",
                          border: `1px solid ${syncRowScale ? "#bfdbfe" : "#cbd5e1"}`,
                          fontSize: "10.5px",
                          fontWeight: 700,
                          cursor: "pointer",
                        }}
                      >
                        🔗 Sync ជួរ {syncRowScale ? "ON" : "OFF"}
                      </button>
                    </div>
                  )}

                  <button
                    onClick={() => {
                      setLayoutMode(!layoutMode);
                      if (!layoutMode && session?.products[0]) {
                        setSelectedProductForLayout(session.products[0].id);
                      }
                    }}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "5px",
                      padding: "5px 10px",
                      borderRadius: "8px",
                      background: layoutMode ? "#1877F2" : "#f1f5f9",
                      color: layoutMode ? "#ffffff" : "#475569",
                      border: "none",
                      fontSize: "11.5px",
                      fontWeight: 700,
                      cursor: "pointer",
                    }}
                  >
                    <Move size={13} />
                    {layoutMode ? "រួចរាល់ (Done)" : "ផ្លាស់ទី & Resize"}
                  </button>
                </div>
              </div>

              {/* 1-Click Smart Layout Presets Row (Visible when LayoutMode is ON) */}
              {layoutMode && (
                <div style={{ display: "flex", flexDirection: "column", gap: "5px", borderTop: "1px solid #dbeafe", paddingTop: "6px" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <span style={{ fontSize: "10.5px", fontWeight: 700, color: "#1e40af", display: "flex", alignItems: "center", gap: "4px" }}>
                      <LayoutGrid size={12} /> ប្លង់ស្វ័យប្រវត្តិ (1-Click Presets):
                    </span>
                    <button
                      type="button"
                      onClick={() => applyPresetLayout("tidyUp")}
                      title="តម្រឹមជួរដេក និងជួរឈរឱ្យស្មើគ្នាក្នុងមួយចុច"
                      style={{
                        padding: "2px 8px",
                        borderRadius: "5px",
                        background: "#fef3c7",
                        color: "#92400e",
                        border: "1px solid #fde68a",
                        fontSize: "10px",
                        fontWeight: 800,
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        gap: "3px",
                      }}
                    >
                      <Wand2 size={10} /> តម្រឹមស្មើគ្នា (Auto-Tidy)
                    </button>
                  </div>
                  <div style={{ display: "flex", gap: "4px", flexWrap: "wrap" }}>
                    <button
                      type="button"
                      onClick={() => applyPresetLayout("grid2x2")}
                      title="រៀបចំជា ២ ជួរឈរ និង ២ ជួរដេកស្មើគ្នា"
                      style={{
                        flex: 1,
                        padding: "4px 6px",
                        borderRadius: "6px",
                        background: "#ffffff",
                        border: "1px solid #bfdbfe",
                        color: "#1d4ed8",
                        fontSize: "10.5px",
                        fontWeight: 700,
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: "3px",
                      }}
                    >
                      <Columns size={11} /> ២ ជួរស្មើ (2x2)
                    </button>
                    <button
                      type="button"
                      onClick={() => applyPresetLayout("leftStack")}
                      title="តម្រៀបជាជួរឈរខាងឆ្វេងស្មើគ្នា"
                      style={{
                        flex: 1,
                        padding: "4px 6px",
                        borderRadius: "6px",
                        background: "#ffffff",
                        border: "1px solid #bfdbfe",
                        color: "#1d4ed8",
                        fontSize: "10.5px",
                        fontWeight: 700,
                        cursor: "pointer",
                        textAlign: "center",
                      }}
                    >
                      ជួរឆ្វេង
                    </button>
                    <button
                      type="button"
                      onClick={() => applyPresetLayout("rightStack")}
                      title="តម្រៀបជាជួរឈរខាងស្តាំស្មើគ្នា"
                      style={{
                        flex: 1,
                        padding: "4px 6px",
                        borderRadius: "6px",
                        background: "#ffffff",
                        border: "1px solid #bfdbfe",
                        color: "#1d4ed8",
                        fontSize: "10.5px",
                        fontWeight: 700,
                        cursor: "pointer",
                        textAlign: "center",
                      }}
                    >
                      ជួរស្ដាំ
                    </button>
                    <button
                      type="button"
                      onClick={() => applyPresetLayout("bottomRow")}
                      title="តម្រៀបជាជួរផ្តេកខាងក្រោមស្មើគ្នា"
                      style={{
                        flex: 1,
                        padding: "4px 6px",
                        borderRadius: "6px",
                        background: "#ffffff",
                        border: "1px solid #bfdbfe",
                        color: "#1d4ed8",
                        fontSize: "10.5px",
                        fontWeight: 700,
                        cursor: "pointer",
                        textAlign: "center",
                      }}
                    >
                      ជួរផ្តេកបាត
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Layout Notice Toast */}
            {layoutNotice && (
              <div
                style={{
                  width: "100%",
                  maxWidth: "380px",
                  background: "#059669",
                  color: "#ffffff",
                  padding: "6px 12px",
                  borderRadius: "8px",
                  fontSize: "11px",
                  fontWeight: 700,
                  textAlign: "center",
                  animation: "fadeIn 0.2s ease",
                  boxShadow: "0 2px 6px rgba(5,150,105,0.25)",
                }}
              >
                {layoutNotice}
              </div>
            )}

            {/* Unsynced Changes Bar when operator edited layout/products */}
            {hasUnsyncedChanges && (
              <div
                style={{
                  width: "100%",
                  maxWidth: "380px",
                  background: "#fffbeb",
                  border: "1px solid #fde68a",
                  color: "#92400e",
                  padding: "6px 12px",
                  borderRadius: "8px",
                  fontSize: "11px",
                  fontWeight: 600,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  boxShadow: "0 1px 4px rgba(0,0,0,0.04)",
                }}
              >
                <span>● មានការកែប្រែប្លង់ ឬទំនិញថ្មី (ប្លង់ព្រាង)</span>
                <button
                  type="button"
                  onClick={handleSyncToLive}
                  disabled={syncingLive}
                  style={{
                    background: "#059669",
                    color: "#ffffff",
                    border: "none",
                    padding: "3px 9px",
                    borderRadius: "5px",
                    fontSize: "10.5px",
                    fontWeight: 700,
                    cursor: syncingLive ? "not-allowed" : "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: "4px",
                  }}
                >
                  <UploadCloud size={12} className={syncingLive ? "animate-spin" : ""} />
                  {syncingLive ? "កំពុង Sync..." : "Sync ទៅ Live ឥឡូវ"}
                </button>
              </div>
            )}

            {/* Layout Customizer Floating Inspector when LayoutMode is ON */}
            {layoutMode && selectedProductObj && (
              <div
                style={{
                  width: "100%",
                  maxWidth: "380px",
                  background: "#1e293b",
                  color: "#ffffff",
                  padding: "10px 12px",
                  borderRadius: "12px",
                  fontSize: "12px",
                  display: "flex",
                  flexDirection: "column",
                  gap: "8px",
                  boxShadow: "0 6px 18px rgba(0,0,0,0.25)",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                    <span style={{ background: "#1877F2", color: "#ff0", padding: "1px 6px", borderRadius: "4px", fontWeight: 900, fontSize: "11px" }}>
                      {selectedProductObj.cfCode}
                    </span>
                    <span style={{ fontWeight: 600, maxWidth: "140px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {selectedProductObj.customTitle || selectedProductObj.product?.name}
                    </span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                    <span style={{ color: "#38bdf8", fontWeight: 800, fontSize: "11px" }}>
                      ទំហំ: {((selectedProductObj.scale || 1.0) * 100).toFixed(0)}%
                    </span>
                    <span style={{ color: "#94a3b8", fontSize: "10px" }}>
                      ({selectedProductObj.posX ?? 4}%, {selectedProductObj.posY ?? 20}%)
                    </span>
                  </div>
                </div>

                {/* Row Partner Link Info & Quick Sync */}
                {selectedRowPartner && (
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      background: "#0f172a",
                      padding: "5px 8px",
                      borderRadius: "7px",
                      border: "1px solid #334155",
                      fontSize: "11px",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "5px" }}>
                      <span style={{ color: "#94a3b8", fontSize: "10.5px" }}>កាតក្នុងជួរជាមួយ:</span>
                      <span style={{ background: "#2563eb", color: "#ffff00", padding: "1px 5px", borderRadius: "3px", fontWeight: 800, fontSize: "10px" }}>
                        {selectedRowPartner.cfCode}
                      </span>
                      <span style={{ color: selectedRowPartner.scale === selectedProductObj.scale ? "#34d399" : "#fbbf24", fontWeight: 700, fontSize: "10px" }}>
                        {selectedRowPartner.scale === selectedProductObj.scale ? "ទំហំស្មើគ្នា ✓" : `ទំហំ: ${((selectedRowPartner.scale || 1.0) * 100).toFixed(0)}%`}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleMatchRowPartner(selectedProductObj.id)}
                      title="កំណត់ឱ្យកាតក្នុងជួរជាមួយគ្នាមានទំហំ និងកម្ពស់ស្មើគ្នាភ្លាមៗ"
                      style={{
                        padding: "2px 8px",
                        borderRadius: "5px",
                        background: "#1877F2",
                        color: "#fff",
                        border: "none",
                        fontSize: "10px",
                        fontWeight: 800,
                        cursor: "pointer",
                      }}
                    >
                      ↔️ តម្រឹមស្មើគ្នាក្នុងជួរ
                    </button>
                  </div>
                )}

                {/* Sizing Controls & Equalize All */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "6px", flexWrap: "wrap" }}>
                  <div style={{ display: "flex", gap: "3px" }}>
                    <button
                      type="button"
                      onClick={() => handleUpdateScale(selectedProductObj.id, 0.85)}
                      style={{
                        padding: "3px 7px",
                        borderRadius: "5px",
                        background: (selectedProductObj.scale || 1.0) === 0.85 ? "#1877F2" : "#334155",
                        color: "#fff",
                        border: "none",
                        fontSize: "10.5px",
                        cursor: "pointer",
                        fontWeight: 700,
                      }}
                    >
                      តូច (0.85x)
                    </button>
                    <button
                      type="button"
                      onClick={() => handleUpdateScale(selectedProductObj.id, 1.0)}
                      style={{
                        padding: "3px 7px",
                        borderRadius: "5px",
                        background: (selectedProductObj.scale || 1.0) === 1.0 ? "#1877F2" : "#334155",
                        color: "#fff",
                        border: "none",
                        fontSize: "10.5px",
                        cursor: "pointer",
                        fontWeight: 700,
                      }}
                    >
                      ស្តង់ដារ (1.0x)
                    </button>
                    <button
                      type="button"
                      onClick={() => handleUpdateScale(selectedProductObj.id, 1.25)}
                      style={{
                        padding: "3px 7px",
                        borderRadius: "5px",
                        background: (selectedProductObj.scale || 1.0) === 1.25 ? "#1877F2" : "#334155",
                        color: "#fff",
                        border: "none",
                        fontSize: "10.5px",
                        cursor: "pointer",
                        fontWeight: 700,
                      }}
                    >
                      ធំ (1.25x)
                    </button>
                  </div>

                  {/* Apply size to all button */}
                  <button
                    type="button"
                    onClick={() => applySizeToAll(selectedProductObj.scale || 1.0)}
                    title="កំណត់ទំហំនេះឱ្យស្មើគ្នាគ្រប់កាតទាំងអស់លើ Live"
                    style={{
                      padding: "3px 8px",
                      borderRadius: "5px",
                      background: "#0284c7",
                      color: "#fff",
                      border: "none",
                      fontSize: "10px",
                      fontWeight: 800,
                      cursor: "pointer",
                    }}
                  >
                    ស្មើគ្នាគ្រប់កាត
                  </button>
                </div>

                {/* Precision Nudge & Reset Toolbar */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", borderTop: "1px solid #334155", paddingTop: "6px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "3px" }}>
                    <span style={{ fontSize: "10px", color: "#94a3b8", marginRight: "3px" }}>កែសម្រួល:</span>
                    <button
                      type="button"
                      onClick={() => handleNudge("left")}
                      title="រំកិលទៅឆ្វេង ២%"
                      style={{ width: "22px", height: "22px", borderRadius: "4px", background: "#334155", color: "#fff", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
                    >
                      <ArrowLeft size={11} />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleNudge("up")}
                      title="រំកិលឡើងលើ ២%"
                      style={{ width: "22px", height: "22px", borderRadius: "4px", background: "#334155", color: "#fff", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
                    >
                      <ArrowUp size={11} />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleNudge("down")}
                      title="រំកិលចុះក្រោម ២%"
                      style={{ width: "22px", height: "22px", borderRadius: "4px", background: "#334155", color: "#fff", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
                    >
                      <ArrowDown size={11} />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleNudge("right")}
                      title="រំកិលទៅស្តាំ ២%"
                      style={{ width: "22px", height: "22px", borderRadius: "4px", background: "#334155", color: "#fff", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
                    >
                      <ArrowRight size={11} />
                    </button>
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                    <button
                      type="button"
                      onClick={() => handleUpdateScale(selectedProductObj.id, (selectedProductObj.scale || 1.0) - 0.05)}
                      title="បង្រួមតូចបន្តិច"
                      style={{ padding: "2px 7px", borderRadius: "5px", background: "#334155", color: "#fff", border: "none", cursor: "pointer", fontWeight: 800 }}
                    >
                      -
                    </button>
                    <button
                      type="button"
                      onClick={() => handleUpdateScale(selectedProductObj.id, (selectedProductObj.scale || 1.0) + 0.05)}
                      title="ពង្រីកធំបន្តិច"
                      style={{ padding: "2px 7px", borderRadius: "5px", background: "#334155", color: "#fff", border: "none", cursor: "pointer", fontWeight: 800 }}
                    >
                      +
                    </button>
                    <button
                      type="button"
                      onClick={() => handleResetPosition(selectedProductObj.id, "LEFT")}
                      title="កំណត់ទីតាំង និងទំហំលំនាំដើមឡើងវិញ"
                      style={{
                        padding: "3px 8px",
                        borderRadius: "5px",
                        background: "#475569",
                        color: "#e2e8f0",
                        border: "none",
                        fontSize: "10px",
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        gap: "2px",
                      }}
                    >
                      <RotateCcw size={10} /> Reset
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* LIVE STAGE CONTAINER */}
            <div
              ref={phoneStageRef}
              className="live-phone-stage"
              onPointerMove={handleStagePointerMove}
              onPointerUp={handleStagePointerUp}
              onPointerLeave={handleStagePointerUp}
              style={{
                outline: layoutMode ? "3px dashed #1877F2" : "none",
                outlineOffset: "-3px",
              }}
            >
              {/* Visual Alignment Grid Lines Overlay */}
              {layoutMode && showGridLines && (
                <div
                  style={{
                    position: "absolute",
                    inset: 0,
                    pointerEvents: "none",
                    zIndex: 12,
                  }}
                >
                  {/* 4 Vertical Column Guides */}
                  {[4, 27, 50, 73].map((colX) => (
                    <div
                      key={`col-${colX}`}
                      style={{
                        position: "absolute",
                        left: `${colX}%`,
                        top: "14%",
                        bottom: "16%",
                        width: "1px",
                        borderLeft: "1px dashed rgba(56, 189, 248, 0.28)",
                      }}
                    />
                  ))}
                  {/* 4 Horizontal Row Guides */}
                  {[16, 32, 48, 64].map((rowY) => (
                    <div
                      key={`row-${rowY}`}
                      style={{
                        position: "absolute",
                        top: `${rowY}%`,
                        left: "4%",
                        right: "4%",
                        height: "1px",
                        borderTop: "1px dashed rgba(56, 189, 248, 0.28)",
                      }}
                    />
                  ))}
                </div>
              )}

              {/* Dynamic Snapping Guide Line Indicator (Horizontal Row Snap) */}
              {layoutMode && activeGuideLines.y !== null && (
                <div
                  style={{
                    position: "absolute",
                    top: `${activeGuideLines.y}%`,
                    left: 0,
                    right: 0,
                    height: "2px",
                    background: "#00f0ff",
                    boxShadow: "0 0 8px #00f0ff",
                    zIndex: 42,
                    pointerEvents: "none",
                  }}
                >
                  <span
                    style={{
                      position: "absolute",
                      right: 6,
                      top: -15,
                      background: "#00f0ff",
                      color: "#000",
                      fontSize: "9px",
                      fontWeight: 800,
                      padding: "1px 4px",
                      borderRadius: "3px",
                    }}
                  >
                    Row {activeGuideLines.y}%
                  </span>
                </div>
              )}

              {/* Dynamic Snapping Guide Line Indicator (Vertical Col Snap) */}
              {layoutMode && activeGuideLines.x !== null && (
                <div
                  style={{
                    position: "absolute",
                    left: `${activeGuideLines.x}%`,
                    top: 0,
                    bottom: 0,
                    width: "2px",
                    background: "#00f0ff",
                    boxShadow: "0 0 8px #00f0ff",
                    zIndex: 42,
                    pointerEvents: "none",
                  }}
                >
                  <span
                    style={{
                      position: "absolute",
                      top: 30,
                      left: 4,
                      background: "#00f0ff",
                      color: "#000",
                      fontSize: "9px",
                      fontWeight: 800,
                      padding: "1px 4px",
                      borderRadius: "3px",
                    }}
                  >
                    Col {activeGuideLines.x}%
                  </span>
                </div>
              )}

              {/* Layout Mode Helper Hint */}
              {layoutMode && (
                <div
                  style={{
                    position: "absolute",
                    top: 10,
                    left: 10,
                    right: 10,
                    background: activeGuideLines.label ? "rgba(2, 132, 199, 0.95)" : "rgba(24, 119, 242, 0.9)",
                    color: "#ffffff",
                    padding: "3px 8px",
                    borderRadius: "6px",
                    textAlign: "center",
                    fontSize: "10px",
                    fontWeight: 700,
                    zIndex: 45,
                    pointerEvents: "none",
                    boxShadow: "0 2px 8px rgba(0,0,0,0.3)",
                    transition: "background 0.2s ease",
                  }}
                >
                  {activeGuideLines.label
                    ? `🧲 ${activeGuideLines.label}`
                    : "👆 ចុចអូសកាតដើម្បីផ្លាស់ប្តូរទីតាំង • អូសកែងក្រោមស្តាំ ↘ ដើម្បីប្តូរទំហំ"}
                </div>
              )}

              {/* Camera / Video Stage */}
              {videoMode === "webcam" ? (
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  style={{ width: "100%", height: "100%", objectFit: "cover" }}
                />
              ) : videoMode === "demo" ? (
                <div style={{ width: "100%", height: "100%", position: "relative", overflow: "hidden" }}>
                  <video
                    autoPlay
                    loop
                    muted
                    playsInline
                    style={{ width: "100%", height: "100%", objectFit: "cover" }}
                    poster="https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=500&q=80"
                    src="https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4"
                  />
                  <div
                    style={{
                      position: "absolute",
                      bottom: "40%",
                      left: "50%",
                      transform: "translateX(-50%)",
                      pointerEvents: "none",
                      opacity: 0.15,
                      textAlign: "center",
                    }}
                  >
                    <Radio size={80} color="#fff" />
                  </div>
                </div>
              ) : (
                <div
                  style={{
                    width: "100%",
                    height: "100%",
                    backgroundImage: "url('https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=600&q=80')",
                    backgroundSize: "cover",
                    backgroundPosition: "center",
                  }}
                />
              )}

              {/* Dark Gradient Overlay */}
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  background: "linear-gradient(to bottom, rgba(0,0,0,0.5) 0%, rgba(0,0,0,0.05) 30%, rgba(0,0,0,0.1) 60%, rgba(0,0,0,0.85) 100%)",
                  pointerEvents: "none",
                }}
              />

              {/* Top Bar: LIVE Pill, Viewers, Live ranking */}
              <div
                style={{
                  position: "absolute",
                  top: layoutMode ? 32 : 10,
                  left: 10,
                  right: 10,
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  zIndex: 20,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <span
                    style={{
                      background: "#e11d48",
                      color: "#fff",
                      fontWeight: 900,
                      fontSize: "11px",
                      padding: "2px 7px",
                      borderRadius: "4px",
                      letterSpacing: "0.5px",
                    }}
                  >
                    LIVE
                  </span>
                  <span
                    style={{
                      background: "rgba(0,0,0,0.6)",
                      color: "#fff",
                      fontSize: "11px",
                      fontWeight: 700,
                      padding: "2px 7px",
                      borderRadius: "12px",
                      display: "flex",
                      alignItems: "center",
                      gap: "3px",
                    }}
                  >
                    <Eye size={12} /> 1.8K
                  </span>
                </div>
                <div
                  style={{
                    background: "rgba(0,0,0,0.6)",
                    color: "#ffd700",
                    fontSize: "11px",
                    fontWeight: 700,
                    padding: "2px 7px",
                    borderRadius: "12px",
                    display: "flex",
                    alignItems: "center",
                    gap: "4px",
                  }}
                >
                  <Trophy size={12} /> Live ranking
                </div>
              </div>

              {/* Top Banner Marquee */}
              <div
                onClick={() => setBannerModalOpen(true)}
                title="ចុចដើម្បីកែប្រែ Banner លើកញ្ចក់ Live"
                style={{
                  position: "absolute",
                  top: layoutMode ? 62 : 40,
                  left: 8,
                  right: 8,
                  background: "linear-gradient(135deg, #1877F2, #0d5cb6)",
                  color: "#ffffff",
                  padding: "4px 10px",
                  borderRadius: "20px",
                  textAlign: "center",
                  fontWeight: 700,
                  fontSize: "10.5px",
                  boxShadow: "0 3px 8px rgba(0,0,0,0.4)",
                  border: "1.5px solid rgba(255,255,255,0.75)",
                  zIndex: 20,
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {session?.bannerText || "លេខទូរស័ព្ទទំនាក់ទំនង 012 345 678 | ដឹកជញ្ជូន 25 ខេត្ត/ក្រុង"}
              </div>

              {/* Pinned Product Card (if active) */}
              {pinnedProduct && (
                <div
                  style={{
                    position: "absolute",
                    top: layoutMode ? 92 : 70,
                    left: 8,
                    right: 8,
                    background: "rgba(0,0,0,0.85)",
                    color: "#fff",
                    padding: "4px 8px",
                    borderRadius: "8px",
                    border: "1px solid #ffd700",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    fontSize: "10.5px",
                    zIndex: 20,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "5px", overflow: "hidden" }}>
                    <span style={{ background: "#dc2626", color: "#fff", padding: "1px 4px", borderRadius: "3px", fontWeight: 800, fontSize: "9px" }}>PIN</span>
                    <span style={{ fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "120px" }}>
                      {pinnedProduct.customTitle || pinnedProduct.product?.name}
                    </span>
                    <span style={{ background: "#1877F2", color: "#ff0", padding: "1px 4px", borderRadius: "4px", fontWeight: 900 }}>
                      Code: {pinnedProduct.cfCode}
                    </span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "5px", flexShrink: 0 }}>
                    <span style={{ color: "#39ff14", fontWeight: 800 }}>${Number(pinnedProduct.customPrice).toFixed(2)}</span>
                    <span style={{ color: pinnedProduct.remainingStock > 0 ? "#10b981" : "#ef4444", fontWeight: 700, fontSize: "9.5px" }}>
                      សល់ {pinnedProduct.remainingStock}
                    </span>
                  </div>
                </div>
              )}

              {/* Freeform Dragged Products */}
              {customPlacedProducts.map((p) => renderProductCard(p, true))}

              {/* LEFT COLUMN PRODUCT OVERLAYS (Default) */}
              <div
                style={{
                  position: "absolute",
                  top: layoutMode ? (pinnedProduct ? 124 : 96) : (pinnedProduct ? 104 : 74),
                  left: 6,
                  display: "flex",
                  flexDirection: "column",
                  gap: "7px",
                  zIndex: 15,
                  width: "78px",
                }}
              >
                {visibleLeft.map((p) => renderProductCard(p, false))}
              </div>

              {/* RIGHT COLUMN PRODUCT OVERLAYS (Default) */}
              <div
                style={{
                  position: "absolute",
                  top: layoutMode ? (pinnedProduct ? 124 : 96) : (pinnedProduct ? 104 : 74),
                  right: 6,
                  display: "flex",
                  flexDirection: "column",
                  gap: "7px",
                  zIndex: 15,
                  width: "78px",
                }}
              >
                {visibleRight.map((p) => renderProductCard(p, false))}
              </div>

              {/* FLOATING HEARTS ANIMATION */}
              <div style={{ position: "absolute", right: 14, bottom: 80, zIndex: 25, pointerEvents: "none" }}>
                {hearts.map((hKey) => (
                  <div
                    key={hKey}
                    style={{
                      position: "absolute",
                      bottom: 0,
                      right: 0,
                      animation: "floatUp 2.4s cubic-bezier(0.1, 0.8, 0.3, 1) forwards",
                      color: "#e11d48",
                    }}
                  >
                    <Heart size={26} fill="#e11d48" />
                  </div>
                ))}
              </div>

              {/* FLOATING COMMENTS STREAM */}
              <div
                style={{
                  position: "absolute",
                  bottom: session && session.products.filter((p) => p.isActive).length > 2 ? 72 : 54,
                  left: 8,
                  right: 48,
                  maxHeight: "185px",
                  overflowY: "hidden",
                  display: "flex",
                  flexDirection: "column-reverse",
                  gap: "5px",
                  zIndex: 20,
                  maskImage: "linear-gradient(to top, black 85%, transparent 100%)",
                }}
              >
                {comments.slice(0, 5).map((c) => (
                  <div
                    key={c.id}
                    style={{
                      background: c.status === "SUCCESS"
                        ? "rgba(16, 185, 129, 0.92)"
                        : c.status === "OUT_OF_STOCK"
                        ? "rgba(239, 68, 68, 0.92)"
                        : "rgba(0, 0, 0, 0.65)",
                      backdropFilter: "blur(4px)",
                      borderRadius: "14px",
                      padding: "4px 8px",
                      color: "#fff",
                      fontSize: "10.5px",
                      display: "flex",
                      alignItems: "flex-start",
                      gap: "6px",
                      boxShadow: "0 2px 6px rgba(0,0,0,0.3)",
                      border: c.status === "SUCCESS" ? "1px solid #34d399" : "none",
                    }}
                  >
                    <div
                      style={{
                        width: "20px",
                        height: "20px",
                        borderRadius: "50%",
                        backgroundColor: c.avatarBg,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontWeight: 800,
                        fontSize: "9.5px",
                        flexShrink: 0,
                      }}
                    >
                      {c.customerName.charAt(0)}
                    </div>
                    <div style={{ overflow: "hidden" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                        <span style={{ fontWeight: 700, color: "#93c5fd" }}>{c.customerName}</span>
                        {c.badge && (
                          <span style={{ background: "rgba(255,255,255,0.2)", fontSize: "8.5px", padding: "1px 4px", borderRadius: "3px" }}>
                            {c.badge}
                          </span>
                        )}
                      </div>
                      <div style={{ fontWeight: 600, marginTop: "1px" }}>{c.text}</div>
                      {c.replyMessage && (
                        <div style={{ fontSize: "9.5px", color: "#ffff00", marginTop: "2px", fontWeight: 700 }}>
                          {c.replyMessage}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* Bottom Running Marquee Ticker (Shows All Active CF Products) */}
              {session && session.products.filter((p) => p.isActive).length > 2 && (
                <div
                  style={{
                    position: "absolute",
                    bottom: 44,
                    left: 8,
                    right: 8,
                    background: "rgba(0, 0, 0, 0.78)",
                    backdropFilter: "blur(5px)",
                    borderRadius: "14px",
                    padding: "3px 8px",
                    overflow: "hidden",
                    whiteSpace: "nowrap",
                    zIndex: 22,
                    border: "1px solid rgba(255,255,255,0.22)",
                  }}
                >
                  <div className="live-studio-marquee">
                    {session.products.filter((p) => p.isActive).map((p) => (
                      <span
                        key={p.id}
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "5px",
                          marginRight: "20px",
                          color: "#ffffff",
                          fontSize: "10.5px",
                        }}
                      >
                        <span
                          style={{
                            background: "#1877F2",
                            color: "#ffff00",
                            padding: "1px 4px",
                            borderRadius: "3px",
                            fontWeight: 900,
                            fontSize: "9px",
                          }}
                        >
                          Code: {p.cfCode}
                        </span>
                        <span style={{ fontWeight: 600 }}>{p.customTitle || p.product?.name}</span>
                        <span style={{ color: "#39ff14", fontWeight: 800 }}>${Number(p.customPrice).toFixed(2)}</span>
                        <span
                          style={{
                            color: p.remainingStock > 0 ? "#4ade80" : "#f87171",
                            fontSize: "9px",
                            fontWeight: 700,
                          }}
                        >
                          ({p.remainingStock > 0 ? `សល់ ${p.remainingStock}` : "អស់"})
                        </span>
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Bottom Fake Input / Interaction Bar */}
              <div
                style={{
                  position: "absolute",
                  bottom: 10,
                  left: 10,
                  right: 10,
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  zIndex: 20,
                }}
              >
                <div
                  style={{
                    flex: 1,
                    background: "rgba(255,255,255,0.25)",
                    backdropFilter: "blur(6px)",
                    borderRadius: "18px",
                    padding: "5px 10px",
                    color: "#e2e8f0",
                    fontSize: "10.5px",
                    display: "flex",
                    alignItems: "center",
                    gap: "5px",
                  }}
                >
                  <MessageCircle size={13} />
                  <span>Write a comment...</span>
                </div>
                <button
                  onClick={() => setHearts((prev) => [...prev.slice(-8), Date.now()])}
                  style={{
                    width: "30px",
                    height: "30px",
                    borderRadius: "50%",
                    background: "#e11d48",
                    color: "#fff",
                    border: "none",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    cursor: "pointer",
                  }}
                >
                  <Heart size={15} fill="#fff" />
                </button>
              </div>
            </div>
          </div>

          {/* RIGHT: INTERACTIVE SIMULATOR CONTROLS & MANAGEMENT */}
          <div style={{ display: "flex", flexDirection: "column", gap: "14px", minWidth: 0 }}>
            {/* Stage Camera Mode Switcher */}
            <div
              style={{
                background: "#ffffff",
                padding: "14px 16px",
                borderRadius: "14px",
                border: "1px solid #edf0f4",
                boxShadow: "0 2px 6px rgba(0,0,0,0.02)",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px", flexWrap: "wrap", gap: "6px" }}>
                <h3 style={{ fontSize: "13.5px", fontWeight: 700, margin: 0, color: "#1e293b", display: "flex", alignItems: "center", gap: "6px" }}>
                  <Video size={15} className="text-blue-600" />
                  ប្រភពវីដេអូកញ្ចក់ Live (Video Source Stage)
                </h3>
                <button
                  onClick={() => setBannerModalOpen(true)}
                  style={{
                    padding: "4px 8px",
                    borderRadius: "6px",
                    border: "1px solid #cbd5e1",
                    background: "#f8fafc",
                    fontSize: "11px",
                    fontWeight: 600,
                    cursor: "pointer",
                    color: "#334155",
                  }}
                >
                  ✏️ កែប្រែ Banner ខាងលើ
                </button>
              </div>

              <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                <button
                  onClick={() => setVideoMode("demo")}
                  style={{
                    padding: "6px 12px",
                    borderRadius: "8px",
                    border: videoMode === "demo" ? "2px solid #1877F2" : "1px solid #cbd5e1",
                    background: videoMode === "demo" ? "#eff6ff" : "#fff",
                    color: videoMode === "demo" ? "#1877F2" : "#475569",
                    fontWeight: 600,
                    fontSize: "12px",
                    cursor: "pointer",
                  }}
                >
                  🎬 វីដេអូគំរូអ្នកលក់ (Demo Host)
                </button>
                <button
                  onClick={() => setVideoMode("webcam")}
                  style={{
                    padding: "6px 12px",
                    borderRadius: "8px",
                    border: videoMode === "webcam" ? "2px solid #1877F2" : "1px solid #cbd5e1",
                    background: videoMode === "webcam" ? "#eff6ff" : "#fff",
                    color: videoMode === "webcam" ? "#1877F2" : "#475569",
                    fontWeight: 600,
                    fontSize: "12px",
                    cursor: "pointer",
                  }}
                >
                  📷 កាមេរ៉ាផ្ទាល់ (Webcam Test)
                </button>
                <button
                  onClick={() => setVideoMode("poster")}
                  style={{
                    padding: "6px 12px",
                    borderRadius: "8px",
                    border: videoMode === "poster" ? "2px solid #1877F2" : "1px solid #cbd5e1",
                    background: videoMode === "poster" ? "#eff6ff" : "#fff",
                    color: videoMode === "poster" ? "#1877F2" : "#475569",
                    fontWeight: 600,
                    fontSize: "12px",
                    cursor: "pointer",
                  }}
                >
                  🖼️ រូបភាពស្ទូឌីយោ (Studio Canvas)
                </button>
              </div>
            </div>

            {/* QUICK COMMENT SIMULATION BUTTONS */}
            <div
              style={{
                background: "#ffffff",
                padding: "14px 16px",
                borderRadius: "14px",
                border: "1px solid #edf0f4",
                boxShadow: "0 2px 6px rgba(0,0,0,0.02)",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px", flexWrap: "wrap", gap: "8px" }}>
                <h3 style={{ fontSize: "13.5px", fontWeight: 700, margin: 0, color: "#1e293b", display: "flex", alignItems: "center", gap: "6px" }}>
                  <Sparkles size={15} className="text-amber-500" />
                  ចុចសាកល្បង Comment កាត់ស្តុកភ្លាមៗ (Quick Test CF)
                </h3>
                <button
                  onClick={() => setAutoBotActive(!autoBotActive)}
                  style={{
                    padding: "4px 10px",
                    borderRadius: "20px",
                    border: "none",
                    background: autoBotActive ? "#fee2e2" : "#f1f5f9",
                    color: autoBotActive ? "#dc2626" : "#475569",
                    fontSize: "11px",
                    fontWeight: 700,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: "4px",
                  }}
                >
                  {autoBotActive ? <Pause size={12} /> : <Play size={12} />}
                  {autoBotActive ? "បិទ Auto Traffic" : "បើក Auto Traffic"}
                </button>
              </div>

              <div style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "11px", color: "#16a34a", background: "#f0fdf4", padding: "4px 10px", borderRadius: "12px", border: "1px solid #bbf7d0", marginBottom: "8px" }}>
                <CheckCircle2 size={12} />
                <span>Auto-reply: ផ្ញើសារបញ្ជាក់ការកក់ទៅ Messenger & ការសន្ទនាស្វ័យប្រវត្ត</span>
              </div>

              <p style={{ margin: "0 0 10px", fontSize: "12px", color: "#64748b" }}>
                ចុចលើប៊ូតុងខាងក្រោមដើម្បីបង្កើត Comment ជាក់ស្តែង ម៉ាស៊ីន CF នឹងកាត់ស្តុក និងបង្កើត Order ភ្លាមៗ៖
              </p>

              <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginBottom: "12px" }}>
                {session?.products.slice(0, 6).map((p) => (
                  <button
                    key={p.id}
                    disabled={commentSubmitting}
                    onClick={() => submitComment(`${p.cfCode} 1`)}
                    style={{
                      padding: "6px 10px",
                      borderRadius: "8px",
                      background: p.remainingStock > 0 ? "#1877F2" : "#94a3b8",
                      color: "#fff",
                      border: "none",
                      fontWeight: 700,
                      fontSize: "11.5px",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: "4px",
                      boxShadow: p.remainingStock > 0 ? "0 2px 5px rgba(24,119,242,0.25)" : "none",
                    }}
                  >
                    💬 {p.cfCode} 1 (${Number(p.customPrice).toFixed(2)})
                  </button>
                ))}
                <button
                  disabled={commentSubmitting}
                  onClick={() => submitComment("123 2")}
                  style={{
                    padding: "6px 10px",
                    borderRadius: "8px",
                    background: "#059669",
                    color: "#fff",
                    border: "none",
                    fontWeight: 700,
                    fontSize: "11.5px",
                    cursor: "pointer",
                  }}
                >
                  💬 123 2
                </button>
                <button
                  disabled={commentSubmitting}
                  onClick={() => submitComment("R445 1 012345678 ភ្នំពេញ")}
                  style={{
                    padding: "6px 10px",
                    borderRadius: "8px",
                    background: "#7c3aed",
                    color: "#fff",
                    border: "none",
                    fontWeight: 700,
                    fontSize: "11.5px",
                    cursor: "pointer",
                  }}
                >
                  💬 R445 1 + លេខទូរស័ព្ទ
                </button>
              </div>

              {/* CUSTOM COMMENT FORM */}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  submitComment(customComment);
                }}
                className="sim-comment-form"
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: "8px",
                  background: "#f8fafc",
                  padding: "10px",
                  borderRadius: "10px",
                  border: "1px solid #e2e8f0",
                }}
              >
                <input
                  type="text"
                  value={customName}
                  onChange={(e) => setCustomName(e.target.value)}
                  placeholder="ឈ្មោះអ្នកខមមិន..."
                  style={{
                    flex: "1 1 120px",
                    padding: "7px 10px",
                    borderRadius: "6px",
                    border: "1px solid #cbd5e1",
                    fontSize: "12px",
                    background: "#fff",
                  }}
                />
                <input
                  type="text"
                  value={customComment}
                  onChange={(e) => setCustomComment(e.target.value)}
                  placeholder="វាយខមមិន (ឧ. R445 1, យក 123 មួយ, A65 2)..."
                  style={{
                    flex: "2 1 200px",
                    padding: "7px 10px",
                    borderRadius: "6px",
                    border: "1px solid #cbd5e1",
                    fontSize: "12px",
                    background: "#fff",
                  }}
                />
                <button
                  type="submit"
                  disabled={commentSubmitting || !customComment.trim()}
                  style={{
                    flex: "0 0 auto",
                    padding: "7px 14px",
                    borderRadius: "6px",
                    background: "#1877F2",
                    color: "#fff",
                    border: "none",
                    fontWeight: 700,
                    fontSize: "12px",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: "5px",
                  }}
                >
                  <Send size={13} />
                  {commentSubmitting ? "កំពុងកាត់..." : "ផ្ញើ Comment"}
                </button>
              </form>
            </div>

            {/* LIVE STOCK REAL-TIME STATUS SUMMARY + QUICK RESTOCK */}
            <div
              style={{
                background: "#ffffff",
                padding: "14px 16px",
                borderRadius: "14px",
                border: "1px solid #edf0f4",
                boxShadow: "0 2px 6px rgba(0,0,0,0.02)",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px", flexWrap: "wrap", gap: "8px" }}>
                <h3 style={{ fontSize: "13.5px", fontWeight: 700, margin: 0, color: "#1e293b", display: "flex", alignItems: "center", gap: "6px" }}>
                  <Layers size={15} className="text-teal-600" />
                  ស្ថានភាពស្តុកជាក់ស្តែង & ថែមស្តុកភ្លាមៗ (Quick Restock)
                </h3>
                <button
                  onClick={() => loadLiveSession()}
                  disabled={refreshing}
                  style={{
                    background: "none",
                    border: "none",
                    color: "#64748b",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: "4px",
                    fontSize: "11.5px",
                  }}
                >
                  <RefreshCw size={11} className={refreshing ? "animate-spin" : ""} />
                  {refreshing ? "កំពុងផ្ទុក..." : "ផ្ទុកឡើងវិញ"}
                </button>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: "8px" }}>
                {session?.products.map((p) => (
                  <div
                    key={p.id}
                    style={{
                      padding: "8px 10px",
                      borderRadius: "10px",
                      border: "1px solid #e2e8f0",
                      background: p.remainingStock <= 0 ? "#fef2f2" : "#f8fafc",
                      display: "flex",
                      flexDirection: "column",
                      gap: "4px",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <span style={{ fontWeight: 800, fontSize: "12.5px", color: "#1877F2" }}>
                        Code: {p.cfCode}
                      </span>
                      <span
                        style={{
                          padding: "1px 6px",
                          borderRadius: "4px",
                          fontWeight: 800,
                          fontSize: "11px",
                          background: p.remainingStock > 5 ? "#dcfce7" : p.remainingStock > 0 ? "#fef3c7" : "#fee2e2",
                          color: p.remainingStock > 5 ? "#166534" : p.remainingStock > 0 ? "#92400e" : "#991b1b",
                        }}
                      >
                        សល់ {p.remainingStock}
                      </span>
                    </div>

                    <div style={{ fontSize: "11px", color: "#475569", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {p.customTitle || p.product?.name}
                    </div>

                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "2px" }}>
                      <span style={{ fontSize: "11px", color: "#059669", fontWeight: 700 }}>
                        ${Number(p.customPrice).toFixed(2)}
                      </span>
                      <div style={{ display: "flex", gap: "3px" }}>
                        <button
                          onClick={() => handleQuickRestock(p, 5)}
                          title="ថែមស្តុក 5 ភ្លាមៗ"
                          style={{
                            padding: "2px 6px",
                            borderRadius: "4px",
                            background: "#e0f2fe",
                            color: "#0369a1",
                            border: "none",
                            fontSize: "10px",
                            fontWeight: 700,
                            cursor: "pointer",
                          }}
                        >
                          +5
                        </button>
                        <button
                          onClick={() => handleQuickRestock(p, 10)}
                          title="ថែមស្តុក 10 ភ្លាមៗ"
                          style={{
                            padding: "2px 6px",
                            borderRadius: "4px",
                            background: "#dcfce7",
                            color: "#15803d",
                            border: "none",
                            fontSize: "10px",
                            fontWeight: 700,
                            cursor: "pointer",
                          }}
                        >
                          +10
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: DYNAMIC LIVE PRODUCTS MANAGEMENT */}
      {activeTab === "products" && (
        <div style={{ background: "#ffffff", borderRadius: "14px", border: "1px solid #edf0f4", padding: "18px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px", flexWrap: "wrap", gap: "10px" }}>
            <div>
              <h3 style={{ fontSize: "16px", fontWeight: 700, margin: 0, color: "#1e293b" }}>
                កំណត់ទំនិញលើកញ្ចក់ Live (Dynamic Product Setup)
              </h3>
              <p style={{ margin: "2px 0 0", fontSize: "12.5px", color: "#64748b" }}>
                កំណត់រូបភាព តម្លៃ កូដ CF ទំហំ និងទីតាំងបង្ហាញលើកញ្ចក់ Live ដោយស្វ័យប្រវត្តិ
              </p>
            </div>
            <button
              onClick={openAddProductModal}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "6px",
                padding: "8px 14px",
                borderRadius: "8px",
                background: "#1877F2",
                color: "#ffffff",
                border: "none",
                fontWeight: 700,
                fontSize: "12.5px",
                cursor: "pointer",
              }}
            >
              <Plus size={15} />
              បន្ថែមទំនិញលើ Live
            </button>
          </div>

          {/* Filter Bar */}
          <div style={{ display: "flex", gap: "10px", marginBottom: "14px", flexWrap: "wrap" }}>
            <div style={{ position: "relative", flex: "1 1 200px" }}>
              <Search size={14} style={{ position: "absolute", left: "10px", top: "50%", transform: "translateY(-50%)", color: "#94a3b8" }} />
              <input
                type="text"
                value={productSearch}
                onChange={(e) => setProductSearch(e.target.value)}
                placeholder="ស្វែងរកតាមកូដ ឬឈ្មោះទំនិញ..."
                style={{ width: "100%", padding: "7px 10px 7px 30px", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "12.5px" }}
              />
            </div>
            <select
              value={productPositionFilter}
              onChange={(e) => setProductPositionFilter(e.target.value)}
              style={{ padding: "7px 12px", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "12.5px", background: "#fff" }}
            >
              <option value="ALL">ទីតាំងទាំងអស់</option>
              <option value="LEFT">ជួរឆ្វេង (Left)</option>
              <option value="RIGHT">ជួរស្ដាំ (Right)</option>
              <option value="CUSTOM">Custom (អូសតាមចិត្ត)</option>
              <option value="PINNED">Pinned (លេចធ្លោ)</option>
              <option value="HIDDEN">លាក់</option>
            </select>
          </div>

          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: "13px", minWidth: "680px" }}>
              <thead>
                <tr style={{ background: "#f8fafc", borderBottom: "2px solid #e2e8f0", color: "#475569" }}>
                  <th style={{ padding: "10px 12px" }}>រូបភាព</th>
                  <th style={{ padding: "10px 12px" }}>កូដ CF</th>
                  <th style={{ padding: "10px 12px" }}>ឈ្មោះទំនិញ</th>
                  <th style={{ padding: "10px 12px" }}>តម្លៃ Live</th>
                  <th style={{ padding: "10px 12px" }}>ស្តុកសល់ / បម្រុង</th>
                  <th style={{ padding: "10px 12px" }}>ទីតាំង / ទំហំ</th>
                  <th style={{ padding: "10px 12px" }}>ស្ថានភាព</th>
                  <th style={{ padding: "10px 12px", textAlign: "right" }}>សកម្មភាព</th>
                </tr>
              </thead>
              <tbody>
                {filteredProducts.length === 0 ? (
                  <tr>
                    <td colSpan={8} style={{ padding: "24px", textAlign: "center", color: "#94a3b8" }}>
                      រកមិនឃើញទំនិញដែលត្រូវនឹងការស្វែងរកទេ។
                    </td>
                  </tr>
                ) : (
                  filteredProducts.map((p) => {
                    const img = p.imageUrl || p.product?.imageUrl || "https://images.unsplash.com/photo-1584917865442-de89df76afd3?w=100&q=80";
                    return (
                      <tr key={p.id} style={{ borderBottom: "1px solid #edf0f4" }}>
                        <td style={{ padding: "10px 12px" }}>
                          <img src={img} alt="" style={{ width: "42px", height: "42px", objectFit: "cover", borderRadius: "8px", border: "1px solid #e2e8f0" }} />
                        </td>
                        <td style={{ padding: "10px 12px" }}>
                          <span style={{ background: "#1877F2", color: "#fff", fontWeight: 800, padding: "2px 7px", borderRadius: "6px", fontSize: "12px" }}>
                            {p.cfCode}
                          </span>
                        </td>
                        <td style={{ padding: "10px 12px", fontWeight: 600, color: "#1e293b", maxWidth: "160px" }}>
                          <div style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                            {p.customTitle || p.product?.name}
                          </div>
                        </td>
                        <td style={{ padding: "10px 12px", fontWeight: 800, color: "#059669" }}>
                          ${Number(p.customPrice).toFixed(2)}
                        </td>
                        <td style={{ padding: "10px 12px" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                            <span style={{ fontWeight: 800, color: p.remainingStock <= 0 ? "#dc2626" : "#1e293b" }}>
                              {p.remainingStock}
                            </span>
                            <span style={{ color: "#94a3b8" }}>/</span>
                            <span>{p.allocatedStock}</span>
                            <button
                              onClick={() => handleQuickRestock(p, 5)}
                              title="ថែមស្តុក 5"
                              style={{
                                padding: "2px 5px",
                                borderRadius: "4px",
                                background: "#f0fdf4",
                                color: "#16a34a",
                                border: "1px solid #bbf7d0",
                                fontSize: "10px",
                                fontWeight: 700,
                                cursor: "pointer",
                              }}
                            >
                              +5
                            </button>
                          </div>
                        </td>
                        <td style={{ padding: "10px 12px" }}>
                          <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                            <span
                              style={{
                                display: "inline-block",
                                background: p.position === "CUSTOM" ? "#ede9fe" : p.position === "LEFT" ? "#e0f2fe" : p.position === "RIGHT" ? "#fce7f3" : "#fef3c7",
                                color: p.position === "CUSTOM" ? "#6d28d9" : p.position === "LEFT" ? "#0369a1" : p.position === "RIGHT" ? "#be185d" : "#b45309",
                                padding: "2px 6px",
                                borderRadius: "4px",
                                fontSize: "10.5px",
                                fontWeight: 700,
                                width: "fit-content",
                              }}
                            >
                              {p.position === "CUSTOM" ? `Custom (${p.posX?.toFixed(0)}%, ${p.posY?.toFixed(0)}%)` : p.position === "LEFT" ? "ជួរឆ្វេង" : p.position === "RIGHT" ? "ជួរស្ដាំ" : p.position === "PINNED" ? "📌 PINNED" : "លាក់"}
                            </span>
                            <span style={{ fontSize: "10px", color: "#64748b" }}>
                              ទំហំ: {((p.scale || 1.0) * 100).toFixed(0)}% ({p.cardSize || "M"})
                            </span>
                          </div>
                        </td>
                        <td style={{ padding: "10px 12px" }}>
                          <button
                            onClick={() => handleToggleActive(p)}
                            style={{
                              padding: "3px 8px",
                              borderRadius: "12px",
                              border: "none",
                              fontSize: "11px",
                              fontWeight: 700,
                              cursor: "pointer",
                              background: p.isActive ? "#dcfce7" : "#fee2e2",
                              color: p.isActive ? "#166534" : "#991b1b",
                            }}
                          >
                            {p.isActive ? "សកម្ម" : "បិទ"}
                          </button>
                        </td>
                        <td style={{ padding: "10px 12px", textAlign: "right" }}>
                          <div style={{ display: "inline-flex", gap: "4px" }}>
                            <button
                              onClick={() => handleTogglePin(p)}
                              title="Pin លើ Live"
                              style={{
                                padding: "5px",
                                borderRadius: "6px",
                                border: "1px solid #cbd5e1",
                                background: session?.activePinId === p.id ? "#ffd700" : "#fff",
                                color: "#334155",
                                cursor: "pointer",
                              }}
                            >
                              <Pin size={13} />
                            </button>
                            <button
                              onClick={() => openEditProductModal(p)}
                              title="កែប្រែ"
                              style={{
                                padding: "5px",
                                borderRadius: "6px",
                                border: "1px solid #cbd5e1",
                                background: "#fff",
                                color: "#334155",
                                cursor: "pointer",
                              }}
                            >
                              <Edit3 size={13} />
                            </button>
                            <button
                              onClick={() => handleDeleteProduct(p.id)}
                              title="លុប"
                              style={{
                                padding: "5px",
                                borderRadius: "6px",
                                border: "1px solid #fecaca",
                                background: "#fef2f2",
                                color: "#dc2626",
                                cursor: "pointer",
                              }}
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 3: LIVE CF ORDERS CAPTURED */}
      {activeTab === "orders" && (
        <div style={{ background: "#ffffff", borderRadius: "14px", border: "1px solid #edf0f4", padding: "18px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px", flexWrap: "wrap", gap: "10px" }}>
            <div>
              <h3 style={{ fontSize: "16px", fontWeight: 700, margin: 0, color: "#1e293b" }}>
                បញ្ជីការកក់ Live CF ស្វ័យប្រវត្តិ (Captured Live Orders)
              </h3>
              <p style={{ margin: "2px 0 0", fontSize: "12.5px", color: "#64748b" }}>
                ការបញ្ជាទិញទាំងអស់ដែលចាប់បានតាមរយៈ Comment ក្នុងពេល Live
              </p>
            </div>
            {onNavigateToOrders && (
              <button
                onClick={onNavigateToOrders}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  padding: "7px 12px",
                  borderRadius: "8px",
                  background: "#f1f5f9",
                  color: "#334155",
                  border: "1px solid #cbd5e1",
                  fontWeight: 700,
                  fontSize: "12px",
                  cursor: "pointer",
                }}
              >
                <ExternalLink size={13} />
                មើលក្នុងផ្ទាំងការបញ្ជាទិញ (Orders Tab)
              </button>
            )}
          </div>

          <div style={{ marginBottom: "14px", maxWidth: "300px" }}>
            <div style={{ position: "relative" }}>
              <Search size={14} style={{ position: "absolute", left: "10px", top: "50%", transform: "translateY(-50%)", color: "#94a3b8" }} />
              <input
                type="text"
                value={orderSearch}
                onChange={(e) => setOrderSearch(e.target.value)}
                placeholder="ស្វែងរកតាមលេខវិក្កយបត្រ ឈ្មោះ ឬលេខទូរស័ព្ទ..."
                style={{ width: "100%", padding: "7px 10px 7px 30px", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "12.5px" }}
              />
            </div>
          </div>

          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: "13px", minWidth: "620px" }}>
              <thead>
                <tr style={{ background: "#f8fafc", borderBottom: "2px solid #e2e8f0", color: "#475569" }}>
                  <th style={{ padding: "10px 12px" }}>លេខវិក្កយបត្រ</th>
                  <th style={{ padding: "10px 12px" }}>អតិថិជន</th>
                  <th style={{ padding: "10px 12px" }}>ទំនិញដែលបានកក់</th>
                  <th style={{ padding: "10px 12px" }}>សរុបទឹកប្រាក់</th>
                  <th style={{ padding: "10px 12px" }}>ស្ថានភាព</th>
                  <th style={{ padding: "10px 12px" }}>កាលបរិច្ឆេទ</th>
                  <th style={{ padding: "10px 12px", textAlign: "right" }}>ព័ត៌មានលម្អិត</th>
                </tr>
              </thead>
              <tbody>
                {filteredOrders.length === 0 ? (
                  <tr>
                    <td colSpan={7} style={{ padding: "30px", textAlign: "center", color: "#94a3b8" }}>
                      មិនទាន់មានការកក់ CF ក្នុង Live នេះនៅឡើយទេ។ សូមចុច Comment សាកល្បងនៅផ្ទាំងខាងលើ!
                    </td>
                  </tr>
                ) : (
                  filteredOrders.map((ord) => (
                    <tr
                      key={ord.id}
                      onClick={() => setSelectedOrder(ord)}
                      style={{ borderBottom: "1px solid #edf0f4", cursor: "pointer", transition: "background 0.15s ease" }}
                      onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#f8fafc")}
                      onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
                    >
                      <td style={{ padding: "10px 12px", fontWeight: 800, color: "#1877F2" }}>
                        {ord.orderNumber}
                      </td>
                      <td style={{ padding: "10px 12px" }}>
                        <div style={{ fontWeight: 600, color: "#1e293b" }}>{ord.customer?.name}</div>
                        {ord.customer?.phone && <div style={{ fontSize: "11px", color: "#64748b" }}>{ord.customer.phone}</div>}
                      </td>
                      <td style={{ padding: "10px 12px" }}>
                        {ord.items.map((it, idx) => (
                          <div key={idx} style={{ fontSize: "12px" }}>
                            {it.productName} × {it.quantity}
                          </div>
                        ))}
                      </td>
                      <td style={{ padding: "10px 12px", fontWeight: 800, color: "#059669" }}>
                        ${Number(ord.total).toFixed(2)}
                      </td>
                      <td style={{ padding: "10px 12px" }}>
                        <span
                          style={{
                            background: "#dcfce7",
                            color: "#166534",
                            padding: "2px 7px",
                            borderRadius: "6px",
                            fontSize: "11px",
                            fontWeight: 700,
                          }}
                        >
                          បានកក់ CF (Pending)
                        </span>
                      </td>
                      <td style={{ padding: "10px 12px", fontSize: "11.5px", color: "#64748b" }}>
                        {new Date(ord.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </td>
                      <td style={{ padding: "10px 12px", textAlign: "right" }}>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedOrder(ord);
                          }}
                          style={{
                            background: "none",
                            border: "none",
                            color: "#1877F2",
                            cursor: "pointer",
                            fontSize: "12px",
                            fontWeight: 700,
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "2px",
                          }}
                        >
                          មើល <ChevronRight size={14} />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* DYNAMIC PRODUCT SETUP MODAL */}
      {productModalOpen && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.5)",
            backdropFilter: "blur(4px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 100,
            padding: "16px",
          }}
        >
          <div
            style={{
              background: "#ffffff",
              borderRadius: "16px",
              width: "100%",
              maxWidth: "500px",
              maxHeight: "90vh",
              overflowY: "auto",
              padding: "20px",
              boxShadow: "0 20px 40px rgba(0,0,0,0.2)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px" }}>
              <h3 style={{ fontSize: "16px", fontWeight: 700, margin: 0, color: "#1e293b" }}>
                {editingProduct ? "កែប្រែទំនិញលើ Live" : "បន្ថែមទំនិញលើ Live"}
              </h3>
              <button
                onClick={() => setProductModalOpen(false)}
                style={{ background: "none", border: "none", fontSize: "20px", cursor: "pointer", color: "#94a3b8" }}
              >
                ✕
              </button>
            </div>

            {productFormError && (
              <div style={{ background: "#fef2f2", color: "#dc2626", padding: "8px 12px", borderRadius: "8px", fontSize: "12px", marginBottom: "12px" }}>
                {productFormError}
              </div>
            )}

            <form onSubmit={handleSaveProduct} style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              {!editingProduct && (
                <div>
                  <label style={{ display: "block", fontSize: "12px", fontWeight: 700, marginBottom: "4px", color: "#334155" }}>
                    ជ្រើសរើសទំនិញពីស្តុកហាង
                  </label>
                  <select
                    value={formProduct.productId}
                    onChange={(e) => {
                      const sel = availableProducts.find((p) => p.id === e.target.value);
                      setFormProduct((prev) => ({
                        ...prev,
                        productId: e.target.value,
                        customTitle: sel?.name || prev.customTitle,
                        customPrice: String(sel?.price || prev.customPrice),
                        imageUrl: sel?.imageUrl || prev.imageUrl,
                      }));
                    }}
                    style={{ width: "100%", padding: "8px 12px", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "13px" }}
                  >
                    {availableProducts.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} (${Number(p.price).toFixed(2)}) - ស្តុក: {p.stock ?? 0}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                <div>
                  <label style={{ display: "block", fontSize: "12px", fontWeight: 700, marginBottom: "4px", color: "#334155" }}>
                    កូដ CF (e.g. R445, 123)
                  </label>
                  <input
                    type="text"
                    required
                    value={formProduct.cfCode}
                    onChange={(e) => setFormProduct((prev) => ({ ...prev, cfCode: e.target.value.toUpperCase() }))}
                    style={{ width: "100%", padding: "8px 12px", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "13px", fontWeight: 800 }}
                  />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: "12px", fontWeight: 700, marginBottom: "4px", color: "#334155" }}>
                    តម្លៃ Live Promo ($)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={formProduct.customPrice}
                    onChange={(e) => setFormProduct((prev) => ({ ...prev, customPrice: e.target.value }))}
                    style={{ width: "100%", padding: "8px 12px", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "13px" }}
                  />
                </div>
              </div>

              <div>
                <label style={{ display: "block", fontSize: "12px", fontWeight: 700, marginBottom: "4px", color: "#334155" }}>
                  ឈ្មោះបង្ហាញលើ Live
                </label>
                <input
                  type="text"
                  value={formProduct.customTitle}
                  onChange={(e) => setFormProduct((prev) => ({ ...prev, customTitle: e.target.value }))}
                  style={{ width: "100%", padding: "8px 12px", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "13px" }}
                />
              </div>

              <div>
                <label style={{ display: "block", fontSize: "12px", fontWeight: 700, marginBottom: "4px", color: "#334155" }}>
                  Link រូបភាពទំនិញ (Picture URL)
                </label>
                <input
                  type="url"
                  value={formProduct.imageUrl}
                  onChange={(e) => setFormProduct((prev) => ({ ...prev, imageUrl: e.target.value }))}
                  placeholder="https://... ឬទុកទទេប្រើរូបភាពពី Product"
                  style={{ width: "100%", padding: "8px 12px", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "13px" }}
                />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                <div>
                  <label style={{ display: "block", fontSize: "12px", fontWeight: 700, marginBottom: "4px", color: "#334155" }}>
                    ចំនួនស្តុកសម្រាប់ Live
                  </label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={formProduct.allocatedStock}
                    onChange={(e) => {
                      const val = parseInt(e.target.value, 10) || 1;
                      setFormProduct((prev) => ({
                        ...prev,
                        allocatedStock: val,
                        remainingStock: editingProduct ? prev.remainingStock : val,
                      }));
                    }}
                    style={{ width: "100%", padding: "8px 12px", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "13px" }}
                  />
                </div>
                {editingProduct ? (
                  <div>
                    <label style={{ display: "block", fontSize: "12px", fontWeight: 700, marginBottom: "4px", color: "#334155" }}>
                      ស្តុកនៅសល់ជាក់ស្តែង
                    </label>
                    <input
                      type="number"
                      min="0"
                      required
                      value={formProduct.remainingStock}
                      onChange={(e) => setFormProduct((prev) => ({ ...prev, remainingStock: parseInt(e.target.value, 10) || 0 }))}
                      style={{ width: "100%", padding: "8px 12px", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "13px" }}
                    />
                  </div>
                ) : (
                  <div>
                    <label style={{ display: "block", fontSize: "12px", fontWeight: 700, marginBottom: "4px", color: "#334155" }}>
                      ទីតាំងលើកញ្ចក់ Live
                    </label>
                    <select
                      value={formProduct.position}
                      onChange={(e) => setFormProduct((prev) => ({ ...prev, position: e.target.value as any }))}
                      style={{ width: "100%", padding: "8px 12px", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "13px" }}
                    >
                      <option value="LEFT">ជួរឆ្វេង (Left Column)</option>
                      <option value="RIGHT">ជួរស្តាំ (Right Column)</option>
                      <option value="PINNED">Pinned (លេចធ្លោលើគេ)</option>
                      <option value="CUSTOM">Custom (អូសតាមចិត្ត)</option>
                      <option value="HIDDEN">លាក់បណ្តោះអាសន្ន</option>
                    </select>
                  </div>
                )}
              </div>

              {/* Size & Scale Selector */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                <div>
                  <label style={{ display: "block", fontSize: "12px", fontWeight: 700, marginBottom: "4px", color: "#334155" }}>
                    ទំហំកាតទំនិញ
                  </label>
                  <select
                    value={formProduct.cardSize}
                    onChange={(e) => {
                      const val = e.target.value as "SMALL" | "MEDIUM" | "LARGE";
                      const defaultScale = val === "SMALL" ? 0.8 : val === "LARGE" ? 1.35 : 1.0;
                      setFormProduct((prev) => ({ ...prev, cardSize: val, scale: defaultScale }));
                    }}
                    style={{ width: "100%", padding: "8px 12px", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "13px" }}
                  >
                    <option value="SMALL">តូច (Small Mini - 0.8x)</option>
                    <option value="MEDIUM">មធ្យម (Medium Normal - 1.0x)</option>
                    <option value="LARGE">ធំលេចធ្លោ (Large Spotlight - 1.35x)</option>
                  </select>
                </div>
                <div>
                  <label style={{ display: "block", fontSize: "12px", fontWeight: 700, marginBottom: "4px", color: "#334155" }}>
                    កម្រិតពង្រីក Scale ({((formProduct.scale || 1.0) * 100).toFixed(0)}%)
                  </label>
                  <input
                    type="range"
                    min="0.6"
                    max="1.8"
                    step="0.05"
                    value={formProduct.scale}
                    onChange={(e) => setFormProduct((prev) => ({ ...prev, scale: parseFloat(e.target.value) }))}
                    style={{ width: "100%", marginTop: "10px" }}
                  />
                </div>
              </div>

              {editingProduct && (
                <div>
                  <label style={{ display: "block", fontSize: "12px", fontWeight: 700, marginBottom: "4px", color: "#334155" }}>
                    ទីតាំងលើកញ្ចក់ Live
                  </label>
                  <select
                    value={formProduct.position}
                    onChange={(e) => setFormProduct((prev) => ({ ...prev, position: e.target.value as any }))}
                    style={{ width: "100%", padding: "8px 12px", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "13px" }}
                  >
                    <option value="LEFT">ជួរឆ្វេង (Left Column)</option>
                    <option value="RIGHT">ជួរស្តាំ (Right Column)</option>
                    <option value="PINNED">Pinned (លេចធ្លោលើគេ)</option>
                    <option value="CUSTOM">Custom (អូសតាមចិត្ត)</option>
                    <option value="HIDDEN">លាក់បណ្តោះអាសន្ន</option>
                  </select>
                </div>
              )}

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "12px" }}>
                <button
                  type="button"
                  onClick={() => setProductModalOpen(false)}
                  style={{ padding: "8px 16px", borderRadius: "8px", border: "1px solid #cbd5e1", background: "#fff", cursor: "pointer", fontSize: "13px" }}
                >
                  បោះបង់
                </button>
                <button
                  type="submit"
                  disabled={productSaving}
                  style={{
                    padding: "8px 20px",
                    borderRadius: "8px",
                    border: "none",
                    background: "#1877F2",
                    color: "#fff",
                    fontWeight: 700,
                    cursor: "pointer",
                    fontSize: "13px",
                  }}
                >
                  {productSaving ? "កំពុងរក្សាទុក..." : "រក្សាទុក"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* EDIT TOP BANNER MODAL */}
      {bannerModalOpen && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.5)",
            backdropFilter: "blur(4px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 100,
            padding: "16px",
          }}
        >
          <div
            style={{
              background: "#ffffff",
              borderRadius: "16px",
              width: "100%",
              maxWidth: "460px",
              padding: "20px",
              boxShadow: "0 20px 40px rgba(0,0,0,0.2)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
              <h3 style={{ fontSize: "15px", fontWeight: 700, margin: 0, color: "#1e293b" }}>
                កែប្រែ Banner ខាងលើកញ្ចក់ Live
              </h3>
              <button
                onClick={() => setBannerModalOpen(false)}
                style={{ background: "none", border: "none", fontSize: "18px", cursor: "pointer", color: "#94a3b8" }}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveBanner} style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              <div>
                <label style={{ display: "block", fontSize: "12px", fontWeight: 700, marginBottom: "4px", color: "#334155" }}>
                  អត្ថបទ Banner (ឧ. លេខទូរស័ព្ទដោះស្រាយបន្ទាន់ | ដឹកជញ្ជូន 25 ខេត្ត/ក្រុង)
                </label>
                <textarea
                  rows={3}
                  required
                  value={bannerTextValue}
                  onChange={(e) => setBannerTextValue(e.target.value)}
                  style={{ width: "100%", padding: "8px 12px", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "13px" }}
                />
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px" }}>
                <button
                  type="button"
                  onClick={() => setBannerModalOpen(false)}
                  style={{ padding: "8px 16px", borderRadius: "8px", border: "1px solid #cbd5e1", background: "#fff", cursor: "pointer", fontSize: "13px" }}
                >
                  បោះបង់
                </button>
                <button
                  type="submit"
                  disabled={bannerSaving}
                  style={{
                    padding: "8px 20px",
                    borderRadius: "8px",
                    border: "none",
                    background: "#1877F2",
                    color: "#fff",
                    fontWeight: 700,
                    cursor: "pointer",
                    fontSize: "13px",
                  }}
                >
                  {bannerSaving ? "កំពុងរក្សាទុក..." : "រក្សាទុក Banner"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ORDER DETAILS MODAL */}
      {selectedOrder && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.5)",
            backdropFilter: "blur(4px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 100,
            padding: "16px",
          }}
        >
          <div
            style={{
              background: "#ffffff",
              borderRadius: "16px",
              width: "100%",
              maxWidth: "480px",
              padding: "20px",
              boxShadow: "0 20px 40px rgba(0,0,0,0.2)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <h3 style={{ fontSize: "16px", fontWeight: 800, margin: 0, color: "#1877F2" }}>
                  {selectedOrder.orderNumber}
                </h3>
                <span style={{ background: "#dcfce7", color: "#166534", padding: "2px 8px", borderRadius: "6px", fontSize: "11px", fontWeight: 700 }}>
                  Live CF Order
                </span>
              </div>
              <button
                onClick={() => setSelectedOrder(null)}
                style={{ background: "none", border: "none", fontSize: "18px", cursor: "pointer", color: "#94a3b8" }}
              >
                ✕
              </button>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "10px", fontSize: "13px" }}>
              <div style={{ background: "#f8fafc", padding: "12px", borderRadius: "8px", border: "1px solid #edf0f4" }}>
                <div style={{ fontWeight: 700, color: "#1e293b", marginBottom: "4px" }}>ព័ត៌មានអតិថិជន</div>
                <div>ឈ្មោះ: <strong>{selectedOrder.customer.name}</strong></div>
                {selectedOrder.customer.phone && <div>ទូរស័ព្ទ: <strong>{selectedOrder.customer.phone}</strong></div>}
                {selectedOrder.notes && <div style={{ marginTop: "4px", color: "#64748b", fontSize: "12px" }}>កំណត់ចំណាំ: {selectedOrder.notes}</div>}
              </div>

              <div style={{ background: "#f8fafc", padding: "12px", borderRadius: "8px", border: "1px solid #edf0f4" }}>
                <div style={{ fontWeight: 700, color: "#1e293b", marginBottom: "6px" }}>ទំនិញដែលបានកក់</div>
                {selectedOrder.items.map((it, idx) => (
                  <div key={idx} style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
                    <span>{it.productName} × {it.quantity}</span>
                    <strong style={{ color: "#059669" }}>${Number(it.lineTotal).toFixed(2)}</strong>
                  </div>
                ))}
                <div style={{ borderTop: "1px solid #e2e8f0", paddingTop: "6px", marginTop: "6px", display: "flex", justifyContent: "space-between", fontWeight: 800 }}>
                  <span>សរុប</span>
                  <span style={{ color: "#059669", fontSize: "15px" }}>${Number(selectedOrder.total).toFixed(2)}</span>
                </div>
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", marginTop: "6px" }}>
                <button
                  onClick={() => setSelectedOrder(null)}
                  style={{ padding: "8px 16px", borderRadius: "8px", border: "1px solid #cbd5e1", background: "#fff", cursor: "pointer", fontSize: "13px" }}
                >
                  បិទ
                </button>
                {onNavigateToConversations && (
                  <button
                    onClick={() => {
                      setSelectedOrder(null);
                      onNavigateToConversations();
                    }}
                    style={{
                      padding: "8px 14px",
                      borderRadius: "8px",
                      border: "1px solid #bfdbfe",
                      background: "#eff6ff",
                      color: "#1d4ed8",
                      fontWeight: 600,
                      cursor: "pointer",
                      fontSize: "13px",
                      display: "flex",
                      alignItems: "center",
                      gap: "5px",
                    }}
                  >
                    <MessageCircle size={14} /> មើលការសន្ទនា Messenger
                  </button>
                )}
                {onNavigateToOrders && (
                  <button
                    onClick={() => {
                      setSelectedOrder(null);
                      onNavigateToOrders();
                    }}
                    style={{
                      padding: "8px 16px",
                      borderRadius: "8px",
                      background: "#1877F2",
                      color: "#fff",
                      border: "none",
                      fontWeight: 700,
                      cursor: "pointer",
                      fontSize: "13px",
                    }}
                  >
                    បើកមើលក្នុង Orders
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Embedded Responsive CSS */}
      <style jsx global>{`
        .live-studio-grid {
          display: grid;
          grid-template-columns: minmax(320px, 390px) 1fr;
          gap: 18px;
          align-items: start;
        }

        .live-phone-stage-wrapper {
          display: flex;
          justify-content: center;
          width: 100%;
        }

        .live-phone-stage {
          position: relative;
          width: 100%;
          max-width: 380px;
          height: 640px;
          border-radius: 28px;
          overflow: hidden;
          border: 7px solid #1e293b;
          box-shadow: 0 16px 40px rgba(0, 0, 0, 0.35);
          background-color: #000;
        }

        @media (max-width: 860px) {
          .live-studio-grid {
            grid-template-columns: 1fr;
          }
          .live-phone-stage {
            max-width: 380px;
            height: 600px;
          }
        }

        @media (max-width: 480px) {
          .live-phone-stage {
            max-width: 100%;
            height: 540px;
            border-radius: 20px;
            border-width: 4px;
          }
          .live-header-bar {
            padding: 10px 12px;
          }
        }

        @keyframes floatUp {
          0% {
            opacity: 1;
            transform: translateY(0) scale(0.8) rotate(0deg);
          }
          50% {
            transform: translateY(-75px) scale(1.15) rotate(-12deg);
          }
          100% {
            opacity: 0;
            transform: translateY(-150px) scale(1) rotate(12deg);
          }
        }

        @keyframes studioMarqueeScroll {
          0% {
            transform: translateX(100%);
          }
          100% {
            transform: translateX(-100%);
          }
        }

        .live-studio-marquee {
          display: inline-block;
          animation: studioMarqueeScroll 20s linear infinite;
        }
      `}</style>
    </div>
  );
}
