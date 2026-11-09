import { ChevronLeft, ChevronRight } from "lucide-react"
import { cn } from "@/components/ui/cn"
import type { Pagination as PaginationType } from "@/lib/types"

export interface PaginationProps {
  pagination: PaginationType
  onPageChange: (page: number) => void
  className?: string
}

export function Pagination({ pagination, onPageChange, className }: PaginationProps) {
  const { page, limit, total, pages } = pagination;
  if (total === 0) return null;
  const from = total === 0 ? 0 : (page - 1) * limit + 1;
  const to = Math.min(page * limit, total);

  return (
    <div
      className={cn(
        "flex flex-col items-center justify-between gap-3 px-5 py-3.5 sm:flex-row",
        className
      )}
    >
      <p className="font-mono text-[11px] uppercase tracking-[0.06em] text-muted-foreground">
        <span className="text-foreground">{from}</span>–
        <span className="text-foreground">{to}</span> / <span className="text-foreground">{total}</span>
      </p>
      <div className="flex items-center gap-1">
        <button
          type="button"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
          className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-border bg-surface text-foreground transition-colors duration-150 hover:bg-accent disabled:pointer-events-none disabled:opacity-40"
          aria-label="Previous page"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
        </button>
        {Array.from({ length: Math.min(pages, 7) }, (_, i) => {
          let label = i + 1;
          if (pages > 7 && page > 4) {
            label = page - 3 + i;
            if (label > pages) label = pages - (6 - i);
          }
          const active = label === page;
          return (
            <button
              key={label}
              type="button"
              onClick={() => onPageChange(label)}
              className={cn(
                "inline-flex h-7 min-w-7 items-center justify-center rounded-md px-1.5 font-mono text-[12px] transition-colors duration-150",
                active
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground"
              )}
            >
              {label}
            </button>
          );
        })}
        <button
          type="button"
          disabled={page >= pages}
          onClick={() => onPageChange(page + 1)}
          className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-border bg-surface text-foreground transition-colors duration-150 hover:bg-accent disabled:pointer-events-none disabled:opacity-40"
          aria-label="Next page"
        >
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  )
}
