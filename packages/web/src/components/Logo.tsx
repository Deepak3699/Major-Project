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
        className={cn("shrink-0 bg-signal shadow-[inset_0_1px_0_rgba(255,255,255,0.22)]", markSizes[size])}
      />
      {showText && (
        <span
          className={cn(
            "font-bold leading-none tracking-[-0.035em] text-current",
            textSizes[size]
          )}
        >
          Hire<span className="text-signal">gen</span>
        </span>
      )}
    </div>
  );
}
