import * as React from "react"
import { cn } from "@/components/ui/cn"

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  error?: boolean
  icon?: React.ReactNode
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, error, icon, ...props }, ref) => (
    <div className={cn("relative", className)}>
      {icon && (
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
          {icon}
        </span>
      )}
      <input
        ref={ref}
        className={cn(
          "input",
          icon && "pl-9",
          error && "border-destructive focus:border-destructive focus:ring-ring-error",
          className
        )}
        {...props}
      />
    </div>
  )
)
Input.displayName = "Input"

export { Input }