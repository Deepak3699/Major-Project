import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { Loader2 } from "lucide-react"
import { cn } from "@/components/ui/cn"

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  asChild?: boolean
  variant?:
    | "default"
    | "destructive"
    | "outline"
    | "secondary"
    | "ghost"
    | "link"
    | "soft"
    | "success"
    | "warning"
    | "signal"
  size?: "default" | "sm" | "lg" | "icon" | "icon-sm"
  loading?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    { className, variant = "default", size = "default", asChild = false, loading = false, disabled, children, ...props },
    ref
  ) => {
    const base =
      "group relative inline-flex select-none items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium tracking-[-0.01em] transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 active:scale-[0.985]"
    const variants: Record<string, string> = {
      // Ink / paper primary — flat, weighty, no gradient glow.
      default:
        "bg-primary text-primary-foreground hover:bg-primary-hover active:saturate-[1.1]",
      destructive:
        "bg-destructive text-destructive-foreground hover:bg-destructive/90",
      outline:
        "border border-border bg-surface text-foreground hover:border-border-strong hover:bg-accent",
      secondary:
        "bg-secondary text-secondary-foreground hover:bg-secondary/70 border border-transparent",
      ghost: "text-muted-foreground hover:bg-accent hover:text-foreground",
      link: "underline-offset-4 hover:underline text-foreground p-0 h-auto",
      soft: "bg-primary-soft text-foreground hover:bg-primary/15",
      signal: "bg-signal text-signal-foreground hover:hsl(var(--signal)) hover:brightness-110 font-semibold",
      success: "bg-success text-success-foreground hover:bg-success/90",
      warning: "bg-warning text-warning-foreground hover:bg-warning/90",
    }
    const sizes: Record<string, string> = {
      default: "h-10 px-4 py-2",
      sm: "h-8 px-3 text-[13px]",
      lg: "h-11 px-6 text-[15px]",
      icon: "h-10 w-10",
      "icon-sm": "h-8 w-8",
    }
    const Comp = asChild ? Slot : "button"
    return (
      <Comp
        className={cn(base, variants[variant], sizes[size], className)}
        ref={ref}
        disabled={disabled || loading}
        {...props}
      >
        {loading && <Loader2 className="h-4 w-4 animate-spin" />}
        {children}
      </Comp>
    )
  }
)
Button.displayName = "Button"

export { Button }
