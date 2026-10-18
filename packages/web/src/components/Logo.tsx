import { BriefcaseBusiness } from "lucide-react";
import { cn } from "@/components/ui/cn";

export function Logo({
  className,
  showText = true,
}: {
  className?: string;
  showText?: boolean;
}) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <div className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground">
        <BriefcaseBusiness className="h-5 w-5" strokeWidth={2} />
      </div>
      {showText && (
        <div className="min-w-0 leading-tight">
          <p className="text-gradient text-[15px] font-bold tracking-tight">
            JobPilot
          </p>
          <p className="text-[10.5px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
            Career workspace
          </p>
        </div>
      )}
    </div>
  );
}
