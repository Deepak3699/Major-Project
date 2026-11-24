import * as React from "react"
import { cn } from "@/components/ui/cn"

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?:
  | "default"
  | "primary"
  | "success"
  | "warning"
  | "danger"
  | "info"
  | "outline"
  | "muted"
  | "secondary"
  | "signal"
}

const Badge = React.forwardRef<HTMLSpanElement, BadgeProps>(
  ({ className, variant = "default", ...props }, ref) => {
    const variants: Record<string, string> = {
      default: "bg-foreground text-background",
      primary: "bg-primary-soft text-foreground border border-border",
      success: "bg-success-soft text-success border border-success/25",
      warning: "bg-warning-soft text-warning border border-warning/25",
      danger: "bg-destructive-soft text-destructive border border-destructive/25",
      info: "bg-info-soft text-info border border-info/25",
      signal: "bg-signal-soft text-signal border border-signal/25",
      outline: "border border-border text-muted-foreground",
      muted: "bg-muted text-muted-foreground border border-border",
      secondary: "bg-secondary text-secondary-foreground border border-transparent",
    }
    return (
      <span
        ref={ref}
        className={cn(
          "inline-flex items-center gap-1 whitespace-nowrap rounded-lg px-2.5 py-1 text-[11px] font-medium tracking-[0.01em]",
          variants[variant],
          className
        )}
        {...props}
      />
    )
  }
)
Badge.displayName = "Badge"

export { Badge }
