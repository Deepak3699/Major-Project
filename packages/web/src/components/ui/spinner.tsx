import { Loader2 } from "lucide-react"
import { cn } from "@/components/ui/cn"

export interface SpinnerProps {
  className?: string
  size?: "sm" | "default" | "lg"
}

const sizeMap = {
  sm: "h-4 w-4",
  default: "h-5 w-5",
  lg: "h-7 w-7",
}

export function Spinner({ className, size = "default" }: SpinnerProps) {
  return (
    <Loader2 className={cn("animate-spin text-muted-foreground", sizeMap[size], className)} />
  )
}

export function PageLoader({ label }: { label?: string }) {
  return (
    <div className="flex h-full min-h-[50vh] w-full flex-col items-center justify-center gap-4 animate-fade-in">
      <div className="relative h-14 w-14">
        <div className="absolute inset-0 rounded-full border-2 border-border" />
        <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-signal animate-spin" />
        <div className="absolute inset-2 rounded-full border-2 border-transparent border-t-primary/40 animate-spin [animation-direction:reverse] [animation-duration:1.2s]" />
      </div>
      {label && <p className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-muted-foreground">{label}</p>}
    </div>
  )
}
