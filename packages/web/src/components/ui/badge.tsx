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
}

const Badge = React.forwardRef<HTMLSpanElement, BadgeProps>(
  ({ className, variant = "default", ...props }, ref) => {
    const variants: Record<string, string> = {
      default: "bg-foreground text-background",
      primary: "bg-primary-soft text-primary-hover border border-primary/20",
      success: "bg-success-soft text-success border border-success/20",
      warning: "bg-warning-soft text-warning border border-warning/20",
      danger: "bg-destructive-soft text-destructive border border-destructive/20",
      info: "bg-info-soft text-info border border-info/20",
      outline: "border border-border text-muted-foreground",
      muted: "bg-muted text-muted-foreground border border-border",
    }
    return (
      <span
        ref={ref}
        className={cn(
          "inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium",
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