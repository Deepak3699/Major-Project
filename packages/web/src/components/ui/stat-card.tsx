import * as React from "react"
import { motion } from "framer-motion"
import type { LucideIcon } from "lucide-react"
import { cn } from "@/components/ui/cn"

export type StatTone = "primary" | "success" | "warning" | "danger" | "info" | "muted"

// Value tint ink used on the metric itself; the icon stays neutral.
const valueTone: Record<StatTone, string> = {
  primary: "text-foreground",
  success: "text-success",
  warning: "text-warning",
  danger: "text-destructive",
  info: "text-info",
  muted: "text-foreground",
}

const tickTone: Record<StatTone, string> = {
  primary: "border-l-border-strong",
  success: "border-l-success",
  warning: "border-l-warning",
  danger: "border-l-destructive",
  info: "border-l-info",
  muted: "border-l-border-strong",
}

// Count-up hook: eases a number in when it changes (no dependency).
function useCountUp(value: number, duration = 800): number {
  const [display, setDisplay] = React.useState(value)
  const fromRef = React.useRef(value)
  React.useEffect(() => {
    const from = fromRef.current
    if (from === value) return
    let raf = 0
    const start = performance.now()
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration)
      const eased = 1 - Math.pow(1 - t, 3)
      setDisplay(Math.round(from + (value - from) * eased))
      if (t < 1) raf = requestAnimationFrame(tick)
      else fromRef.current = value
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [value, duration])
  return display
}

export interface StatCardProps {
  icon: LucideIcon
  label: string
  value?: number | string | null
  tone?: StatTone
  suffix?: string
  hint?: string
  loading?: boolean
  className?: string
}

export function StatCard({
  icon: Icon,
  label,
  value,
  tone = "muted",
  suffix,
  hint,
  loading,
  className,
}: StatCardProps) {
  const isNum = typeof value === "number" && Number.isFinite(value)
  const counted = useCountUp(isNum ? (value as number) : 0)
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
      className={cn(
        "card group relative overflow-hidden py-4 pl-4 pr-4 transition-colors duration-150 hover:border-border-strong",
        `border-l-2 ${tickTone[tone]}`,
        className
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="eyebrow truncate">{label}</p>
        <Icon className="h-[15px] w-[15px] shrink-0 text-muted-foreground/50 transition-colors group-hover:text-muted-foreground" strokeWidth={1.75} />
      </div>
      <div className="mt-2 flex items-baseline gap-1.5">
        {loading ? (
          <div className="skeleton h-7 w-16" />
        ) : (
          <span className={cn("text-[26px] font-semibold leading-none tracking-[-0.02em] tabular-nums", valueTone[tone])}>
            {isNum ? counted.toLocaleString() : value ?? "—"}
          </span>
        )}
      </div>
      {suffix && !loading && (
        <p className="mt-1.5 truncate font-mono text-[11px] uppercase tracking-[0.04em] text-success">{suffix}</p>
      )}
      {hint && <p className="mt-1.5 truncate text-[12px] text-muted-foreground">{hint}</p>}
    </motion.div>
  )
}

export function StatCardSkeleton() {
  return (
    <div className="card flex flex-col gap-2.5 py-4 pl-4 pr-4">
      <div className="skeleton h-3 w-20" />
      <div className="skeleton h-7 w-16" />
    </div>
  )
}

export function StatCardGrid({
  loading,
  children,
}: {
  loading?: boolean
  children: React.ReactNode
}) {
  return <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 xl:grid-cols-5">{loading ? Array.from({ length: 5 }).map((_, i) => <StatCardSkeleton key={i} />) : children}</div>
}
