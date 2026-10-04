"use client";

import React, { createContext, useContext, useState, useCallback } from "react";
import {
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  Info,
  Sparkles,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";

export type ToastVariant = "default" | "success" | "destructive" | "warning" | "info";

export interface ToastOptions {
  title?: string;
  description: string;
  variant?: ToastVariant;
  duration?: number;
}

interface ToastItem extends ToastOptions {
  id: string;
}

interface ToastContextValue {
  toast: {
    (opts: ToastOptions): void;
    success: (desc: string, title?: string) => void;
    error: (desc: string, title?: string) => void;
    warning: (desc: string, title?: string) => void;
    info: (desc: string, title?: string) => void;
  };
  dismiss: (id: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const addToast = useCallback(
    (opts: ToastOptions) => {
      const id = "toast_" + Date.now() + "_" + Math.random().toString(36).substring(2, 7);
      const duration = opts.duration ?? (opts.variant === "destructive" ? 5000 : 4000);

      const newToast: ToastItem = { ...opts, id };
      setToasts((prev) => [...prev, newToast]);

      if (duration > 0) {
        setTimeout(() => {
          dismiss(id);
        }, duration);
      }
    },
    [dismiss]
  );

  const toastCallable = Object.assign(
    (opts: ToastOptions) => addToast(opts),
    {
      success: (description: string, title?: string) =>
        addToast({ description, title: title || "Success", variant: "success" }),
      error: (description: string, title?: string) =>
        addToast({ description, title: title || "Error", variant: "destructive" }),
      warning: (description: string, title?: string) =>
        addToast({ description, title: title || "Warning", variant: "warning" }),
      info: (description: string, title?: string) =>
        addToast({ description, title: title || "Note", variant: "info" }),
    }
  );

  return (
    <ToastContext.Provider value={{ toast: toastCallable, dismiss }}>
      {children}
      <div
        aria-live="polite"
        aria-atomic="true"
        className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm w-full pointer-events-none px-4 sm:px-0"
      >
        {toasts.map((t) => {
          const variant = t.variant || "default";
          return (
            <div
              key={t.id}
              role="alert"
              className={cn(
                "pointer-events-auto rounded-xl border p-3.5 shadow-xl flex items-start gap-3 transition-all duration-200 bg-card text-card-foreground",
                variant === "destructive" && "border-destructive/40 bg-destructive/5 text-destructive dark:bg-destructive/10",
                variant === "success" && "border-emerald-500/40 bg-emerald-500/5 text-emerald-700 dark:text-emerald-300 dark:bg-emerald-950/20",
                variant === "warning" && "border-amber-500/40 bg-amber-500/5 text-amber-700 dark:text-amber-300 dark:bg-amber-950/20",
                variant === "info" && "border-blue-500/40 bg-blue-500/5 text-blue-700 dark:text-blue-300 dark:bg-blue-950/20",
                variant === "default" && "border-border"
              )}
            >
              <div className="shrink-0 pt-0.5">
                {variant === "success" && <CheckCircle2 className="h-4 w-4 text-emerald-500" />}
                {variant === "destructive" && <AlertCircle className="h-4 w-4 text-destructive" />}
                {variant === "warning" && <AlertTriangle className="h-4 w-4 text-amber-500" />}
                {variant === "info" && <Info className="h-4 w-4 text-blue-500" />}
                {variant === "default" && <Sparkles className="h-4 w-4 text-primary" />}
              </div>

              <div className="flex-1 space-y-0.5 text-xs">
                {t.title && <p className="font-semibold leading-tight">{t.title}</p>}
                <p className={cn("leading-relaxed", !t.title && "font-medium", variant === "default" && "text-muted-foreground")}>
                  {t.description}
                </p>
              </div>

              <button
                type="button"
                onClick={() => dismiss(t.id)}
                className="shrink-0 p-1 rounded-md text-muted-foreground/60 hover:text-foreground hover:bg-muted transition-colors"
                aria-label="Close notification"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    // Graceful fallback if invoked outside provider
    return {
      toast: Object.assign(
        (opts: ToastOptions) => console.log("[Toast]", opts),
        {
          success: (desc: string) => console.log("[Toast Success]", desc),
          error: (desc: string) => console.error("[Toast Error]", desc),
          warning: (desc: string) => console.warn("[Toast Warning]", desc),
          info: (desc: string) => console.info("[Toast Info]", desc),
        }
      ),
      dismiss: () => {},
    };
  }
  return ctx;
}
