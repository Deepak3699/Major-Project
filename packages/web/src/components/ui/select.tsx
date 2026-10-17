import * as React from "react"
import { ChevronDown } from "lucide-react"
import { cn } from "@/components/ui/cn"

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  icon?: React.ReactNode
}

const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, icon, children, ...props }, ref) => (
    <div className={cn("relative", className)}>
      {icon && (
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
          {icon}
        </span>
      )}
      <select
        ref={ref}
        className={cn(
          "h-10 w-full appearance-none rounded-md border border-input bg-surface pl-3 pr-9 text-sm text-foreground shadow-sm transition-colors duration-150 focus:border-primary focus:outline-none focus:ring-4 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
          icon && "pl-9"
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
    </div>
  )
)
Select.displayName = "Select"

export { Select }