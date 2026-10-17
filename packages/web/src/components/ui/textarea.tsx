import * as React from "react"
import { cn } from "@/components/ui/cn"

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  error?: boolean
}

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, error, ...props }, ref) => (
    <textarea
      ref={ref}
      className={cn(
        "w-full rounded-md border border-input bg-surface px-3 py-2 text-sm text-foreground shadow-sm transition-colors duration-150 placeholder:text-muted-foreground/70 focus:border-primary focus:outline-none focus:ring-4 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
        error && "border-destructive focus:border-destructive focus:ring-ring-error",
        className
      )}
      {...props}
    />
  )
)
Textarea.displayName = "Textarea"

export { Textarea }