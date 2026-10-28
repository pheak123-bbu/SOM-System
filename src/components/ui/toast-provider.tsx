"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, Info, TriangleAlert, X } from "lucide-react";

export type ToastKind = "success" | "error" | "info";
type ToastInput = { kind: ToastKind; title: string; description?: string; duration?: number };
type ToastItem = ToastInput & { id: number };
type ToastContextValue = { toast: (message: ToastInput) => void };

const ToastContext = createContext<ToastContextValue | null>(null);
const toastIcons = { success: CheckCircle2, error: TriangleAlert, info: Info };

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error("useToast must be used within ToastProvider.");
  return context.toast;
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const timers = useRef(new Map<number, number>());
  const dismiss = useCallback((id: number) => {
    const timer = timers.current.get(id);
    if (timer) {
      window.clearTimeout(timer);
      timers.current.delete(id);
    }
    setItems((current) => current.filter((item) => item.id !== id));
  }, []);
  const toast = useCallback((message: ToastInput) => {
    const id = Date.now() + Math.random();
    setItems((current) => [...current.slice(-3), { ...message, id }]);
    const timer = window.setTimeout(() => {
      timers.current.delete(id);
      dismiss(id);
    }, message.duration ?? 4500);
    timers.current.set(id, timer);
  }, [dismiss]);
  const context = useMemo(() => ({ toast }), [toast]);

  useEffect(() => () => {
    timers.current.forEach((timer) => window.clearTimeout(timer));
    timers.current.clear();
  }, []);

  return <ToastContext.Provider value={context}>
    {children}
    <div className="toast-stack" aria-label="ការជូនដំណឹង" aria-live="polite" aria-relevant="additions">
      {items.map((item) => {
        const Icon = toastIcons[item.kind];
        return <div key={item.id} className={`toast toast-${item.kind}`} role={item.kind === "error" ? "alert" : "status"}>
          <Icon size={19} aria-hidden="true" />
          <span className="toast-copy"><strong>{item.title}</strong>{item.description && <small>{item.description}</small>}</span>
          <button type="button" className="toast-close" aria-label="បិទការជូនដំណឹង" onClick={() => dismiss(item.id)}><X size={15} /></button>
        </div>;
      })}
    </div>
  </ToastContext.Provider>;
}
