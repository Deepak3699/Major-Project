import * as React from "react"
import type { LucideIcon } from "lucide-react"
import { cn } from "@/components/ui/cn"

export interface EmptyStateProps {
  icon: LucideIcon
  title: string
  description?: string
  action?: React.ReactNode
  className?: string
}

export function EmptyState({ icon: Icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-2 px-6 py-14 text-center animate-fade-in",
        className
      )}
    >
      <div className="flex h-11 w-11 items-center justify-center rounded-lg border border-dashed border-border-strong">
        <Icon className="h-[18px] w-[18px] text-muted-foreground" strokeWidth={1.75} />
      </div>
      <div className="mt-1 space-y-1">
        <h3 className="text-[14px] font-semibold">{title}</h3>
        {description && (
          <p className="mx-auto max-w-sm text-[13px] leading-relaxed text-muted-foreground">
            {description}
          </p>
        )}
      </div>
      {action}
    </div>
  )
}
