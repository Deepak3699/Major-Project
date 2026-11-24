import * as React from "react";
import { cn } from "@/components/ui/cn";

export interface PageHeaderProps {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  className?: string;
}

export function PageHeader({ title, description, actions, className }: PageHeaderProps) {
  return (
    <div
      className={cn(
        "flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between",
        className,
      )}
    >
      <div className="min-w-0 space-y-1.5">
        <h1 className="text-[28px] font-semibold leading-tight tracking-[-0.025em] text-foreground text-balance sm:text-[32px]">{title}</h1>
        {description && (
          <p className="max-w-2xl text-[13.5px] leading-relaxed text-muted-foreground text-pretty sm:text-sm">{description}</p>
        )}
      </div>
      {actions && (
        <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>
      )}
    </div>
  );
}
