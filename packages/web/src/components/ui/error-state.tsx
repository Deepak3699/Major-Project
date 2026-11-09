import * as React from "react"
import { AlertCircle, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"

export interface ErrorStateProps {
  title?: string
  message?: string
  onRetry?: () => void
  retryLabel?: string
  className?: string
}

export function ErrorState({
  title = "Something went wrong",
  message = "We couldn't load this data. Please try again.",
  onRetry,
  retryLabel = "Retry",
  className,
}: ErrorStateProps) {
  return (
    <div
      className={`flex flex-col items-center justify-center gap-2 px-6 py-14 text-center animate-fade-in ${className ?? ""}`}
    >
      <div className="flex h-11 w-11 items-center justify-center rounded-lg border border-destructive/25 bg-destructive-soft">
        <AlertCircle className="h-[18px] w-[18px] text-destructive" strokeWidth={1.75} />
      </div>
      <div className="mt-1 space-y-1">
        <h3 className="text-[14px] font-semibold">{title}</h3>
        <p className="mx-auto max-w-sm text-[13px] leading-relaxed text-muted-foreground">
          {message}
        </p>
      </div>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry} className="mt-2">
          <RefreshCw className="h-3.5 w-3.5" />
          {retryLabel}
        </Button>
      )}
    </div>
  )
}
