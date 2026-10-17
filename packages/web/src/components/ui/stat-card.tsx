import * as React from "react"
import { motion } from "framer-motion"
import type { LucideIcon } from "lucide-react"
import { cn } from "@/components/ui/cn"
import { Spinner } from "@/components/ui/spinner"

export type StatTone = "primary" | "success" | "warning" | "danger" | "info" | "muted"

const toneMap: Record<StatTone, string> = {
  primary: "bg-gradient-to-br from-primary/25 to-info/20 text-primary-hover shadow-glow-sm",
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning",
  danger: "bg-hot-soft text-hot",
  info: "bg-info-soft text-info",
  muted: "bg-muted text-muted-foreground",
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
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      className={cn(
        "card group relative flex items-start gap-phi2 overflow-hidden rounded-2xl p-phi3 transition-all duration-300 hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-glow-sm",
        className
      )}
    >
      <div
        className={cn(
          "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl transition-transform duration-300 group-hover:scale-110",
          toneMap[tone]
        )}
      >
        <Icon className="h-[21px] w-[21px]" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-medium leading-tight text-muted-foreground">{label}</p>
        <div className="mt-0.5 flex items-baseline gap-1.5">
          {loading ? (
            <div className="skeleton h-7 w-16" />
          ) : (
            <span className="text-gradient text-2xl font-semibold tracking-tight tabular-nums">
              {isNum ? counted.toLocaleString() : value ?? "—"}
            </span>
          )}
        </div>
        {suffix && !loading && (
          <p className="mt-0.5 truncate text-xs font-medium tabular-nums text-success">{suffix}</p>
        )}
        {hint && <p className="mt-1 truncate text-xs text-muted-foreground">{hint}</p>}
      </div>
    </motion.div>
  )
}

export function StatCardSkeleton() {
  return (
    <div className="card flex items-start gap-4 p-5">
      <div className="skeleton h-11 w-11 rounded-xl" />
      <div className="flex-1 space-y-2.5">
        <div className="skeleton h-3.5 w-24" />
        <div className="skeleton h-7 w-16" />
      </div>
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
  return <div className="grid grid-cols-2 gap-phi3 lg:grid-cols-4 xl:grid-cols-5">{loading ? Array.from({ length: 5 }).map((_, i) => <StatCardSkeleton key={i} />) : children}</div>
}
