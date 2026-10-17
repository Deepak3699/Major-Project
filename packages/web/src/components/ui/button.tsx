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
  size?: "default" | "sm" | "lg" | "icon" | "icon-sm"
  loading?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    { className, variant = "default", size = "default", asChild = false, loading = false, disabled, children, ...props },
    ref
  ) => {
    const base =
      "group relative inline-flex select-none items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium transition-all duration-200 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 active:scale-[0.98]"
    const variants: Record<string, string> = {
      default:
        "text-primary-foreground shadow-lg shadow-primary/25 hover:shadow-glow hover:-translate-y-px [--btn-bg:var(--grad-primary)] bg-[image:var(--btn-bg)] bg-[length:150%] hover:bg-[position:100%]",
      destructive:
        "bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90 hover:shadow-md",
      outline:
        "border border-border bg-surface text-foreground shadow-sm hover:border-border-strong hover:bg-accent",
      secondary:
        "bg-secondary text-secondary-foreground hover:bg-secondary/80 border border-transparent",
      ghost: "hover:bg-accent text-foreground hover:text-accent-foreground",
      link: "underline-offset-4 hover:underline text-primary p-0 h-auto",
      soft: "bg-primary-soft text-primary-hover hover:bg-primary/15",
      success: "bg-success text-success-foreground shadow-md shadow-success/20 hover:bg-success/90 hover:-translate-y-px",
      warning: "bg-warning text-warning-foreground shadow-md shadow-warning/20 hover:bg-warning/90",
    }
    const sizes: Record<string, string> = {
      default: "h-10 px-4 py-2",
      sm: "h-9 px-3 text-[13px]",
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