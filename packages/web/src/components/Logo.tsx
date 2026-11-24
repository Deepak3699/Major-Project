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
  // A quiet, confident wordmark: ember square + tight-tracked name.
  const markSizes = {
    sm: "h-2.5 w-2.5",
    md: "h-3 w-3",
    lg: "h-3.5 w-3.5",
    xl: "h-4 w-4",
  };

  const textSizes = {
    sm: "text-[15px]",
    md: "text-[18px]",
    lg: "text-[21px]",
    xl: "text-[25px]",
  };

  return (
    <div className={cn("flex items-center gap-2.5 select-none", className)}>
      {showText && (
        <div className="flex min-w-0 items-baseline gap-2">
          <span
            aria-hidden
            className={cn("shrink-0 rounded-[3px] bg-signal translate-y-[-2px]", markSizes[size])}
          />
          <span
            className={cn(
              "font-semibold leading-none tracking-[-0.032em] text-current",
              textSizes[size]
            )}
          >
            Hiregen
          </span>
        </div>
      )}
      {!showText && (
        <span
          aria-hidden
          className={cn("shrink-0 rounded-[4px] bg-current", markSizes[size])}
        />
      )}
    </div>
  );
}
