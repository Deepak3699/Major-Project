import * as React from "react"
import { createPortal } from "react-dom"
import {
  CheckCircle2,
  AlertTriangle,
  Info,
  XCircle,
  X,
} from "lucide-react"
import { cn } from "@/components/ui/cn"

export type ToastVariant = "success" | "error" | "warning" | "info"

interface Toast {
  id: string
  title: string
  description?: string
  variant: ToastVariant
}

interface ToastContextValue {
  toast: (props: { title: string; description?: string; variant?: ToastVariant }) => void
}

const ToastContext = React.createContext<ToastContextValue | null>(null)

const noopToast: ToastContextValue["toast"] = () => {}

export function useToast(): ToastContextValue {
  const ctx = React.useContext(ToastContext)
  if (!ctx) return { toast: noopToast }
  return ctx
}

const variantIcon: Record<ToastVariant, React.ComponentType<{ className?: string }>> = {
  success: CheckCircle2,
  error: XCircle,
  warning: AlertTriangle,
  info: Info,
}

const variantTone: Record<ToastVariant, string> = {
  success: "text-success",
  error: "text-destructive",
  warning: "text-warning",
  info: "text-info",
}

const variantBar: Record<ToastVariant, string> = {
  success: "bg-success",
  error: "bg-destructive",
  warning: "bg-warning",
  info: "bg-info",
}

let toastCounter = 0

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = React.useState<Toast[]>([])
  const [leaving, setLeaving] = React.useState<Set<string>>(new Set())

  const remove = React.useCallback((id: string) => {
    setLeaving((prev) => new Set(prev).add(id))
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id))
      setLeaving((prev) => {
        const next = new Set(prev)
        next.delete(id)
        return next
      })
    }, 220)
  }, [])

  const toast = React.useCallback<ToastContextValue["toast"]>(
    ({ title, description, variant = "success" }) => {
      const id = `toast-${++toastCounter}`
      setToasts((prev) => [...prev.slice(-4), { id, title, description, variant }])
      window.setTimeout(() => remove(id), 4500)
    },
    [remove]
  )

  const value = React.useMemo(() => ({ toast }), [toast])

  return (
    <ToastContext.Provider value={value}>
      {children}
      {createPortal(
        <div
          className="pointer-events-none fixed right-4 top-4 z-toast flex w-[min(92vw,380px)] flex-col gap-2"
          role="region"
          aria-live="polite"
          aria-label="Notifications"
        >
          {toasts.map((t) => {
            const Icon = variantIcon[t.variant]
            const isLeaving = leaving.has(t.id)
            return (
              <div
                key={t.id}
                className={cn(
                  "pointer-events-auto relative overflow-hidden rounded-xl border border-border bg-surface p-4 pr-9 shadow-popover",
                  isLeaving ? "animate-toast-out" : "animate-toast-in"
                )}
              >
                <span
                  className={cn("absolute inset-y-0 left-0 w-1", variantBar[t.variant])}
                />
                <div className="flex items-start gap-3">
                  <Icon className={cn("mt-0.5 h-5 w-5 shrink-0", variantTone[t.variant])} />
                  <div className="min-w-0 space-y-0.5">
                    <p className="text-sm font-semibold text-foreground">{t.title}</p>
                    {t.description && (
                      <p className="text-[13px] leading-snug text-muted-foreground">
                        {t.description}
                      </p>
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => remove(t.id)}
                  className="absolute right-2 top-2 rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                  aria-label="Dismiss notification"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            )
          })}
        </div>,
        document.body
      )}
    </ToastContext.Provider>
  )
}