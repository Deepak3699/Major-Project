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
    <div className="flex h-full min-h-[50vh] w-full flex-col items-center justify-center gap-3">
      <Spinner size="lg" />
      {label && <p className="eyebrow">{label}</p>}
    </div>
  )
}
