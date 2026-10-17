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
      <p className="text-[13px] text-muted-foreground">
        Showing <span className="font-medium text-foreground">{from}</span>–
        <span className="font-medium text-foreground">{to}</span> of{" "}
        <span className="font-medium text-foreground">{total}</span>
      </p>
      <div className="flex items-center gap-1">
        <button
          type="button"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
          className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border bg-surface text-foreground shadow-sm transition-colors duration-150 hover:bg-accent disabled:pointer-events-none disabled:opacity-40"
          aria-label="Previous page"
        >
          <ChevronLeft className="h-4 w-4" />
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
                "inline-flex h-8 min-w-8 items-center justify-center rounded-md px-2 text-[13px] font-medium transition-colors duration-150",
                active
                  ? "bg-primary text-primary-foreground shadow-sm"
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
          className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border bg-surface text-foreground shadow-sm transition-colors duration-150 hover:bg-accent disabled:pointer-events-none disabled:opacity-40"
          aria-label="Next page"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}