import hiregenIcon from "@/Assets/hiregen-icon.svg";
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
  const iconSizes = {
    sm: "h-8 w-10",
    md: "h-11 w-14",
    lg: "h-14 w-18",
    xl: "h-18 w-24",
  };

  const textSizes = {
    sm: "text-[16px]",
    md: "text-[20px]",
    lg: "text-[24px]",
    xl: "text-[28px]",
  };

  const subtextSizes = {
    sm: "text-[9.5px]",
    md: "text-[10.5px]",
    lg: "text-[12px]",
    xl: "text-[13px]",
  };

  return (
    <div className={cn("flex items-center gap-3 select-none", className)}>
      <div
        className={cn(
          "relative flex shrink-0 items-center justify-center transition-transform hover:scale-105 duration-200",
          iconSizes[size]
        )}
      >
        <img
          src={hiregenIcon}
          alt="Hiregen"
          className="h-full w-full object-contain filter drop-shadow-[0_2px_8px_rgba(37,99,235,0.25)]"
        />
      </div>
      {showText && (
        <div className="min-w-0 leading-tight">
          <p
            className={cn(
              "text-gradient font-black tracking-tight",
              textSizes[size]
            )}
          >
            Hiregen
          </p>
          <p
            className={cn(
              "font-bold uppercase tracking-[0.18em] text-muted-foreground",
              subtextSizes[size]
            )}
          >
            Career Engine
          </p>
        </div>
      )}
    </div>
  );
}
