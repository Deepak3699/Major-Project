import { cn } from "@/components/ui/cn";

export function Logo({
  className,
  showText = true,
  size = "md",
}: {
  className?: string;
  showText?: boolean;
  size?: "sm" | "md" | "lg" | "xl";
}) {
  const markSizes = {
    sm: "h-3 w-3 rounded-[4px]",
    md: "h-3.5 w-3.5 rounded-[4px]",
    lg: "h-4 w-4 rounded-[5px]",
    xl: "h-[18px] w-[18px] rounded-[5px]",
  };

  const textSizes = {
    sm: "text-[16px]",
    md: "text-[19px]",
    lg: "text-[22px]",
    xl: "text-[26px]",
  };

  return (
    <div className={cn("inline-flex items-center gap-2.5 select-none", className)}>
      <span
        aria-hidden
        className={cn(
          "grid shrink-0 place-items-center bg-signal text-signal-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.25)]",
          markSizes[size]
        )}
      >
        <svg viewBox="0 0 16 16" className="h-[70%] w-[70%]" fill="none" aria-hidden>
          <path d="M8 2.5L12.8 12.5H11L10 10.4H6L5 12.5H3.2L8 2.5Z" fill="currentColor" />
          <path d="M7 9H9L8 6.8L7 9Z" fill="currentColor" opacity="0.28" />
          <path d="M12 2.2L12.45 3.3L13.55 3.75L12.45 4.2L12 5.3L11.55 4.2L10.45 3.75L11.55 3.3L12 2.2Z" fill="currentColor" />
        </svg>
      </span>
      {showText && (
        <span
          className={cn(
            "font-bold leading-none tracking-[-0.04em] text-current",
            textSizes[size]
          )}
        >
          <span className="text-signal">Hire</span>Gen
        </span>
      )}
    </div>
  );
}
