import { Radar } from "lucide-react";
import { motion } from "framer-motion";
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
      <div className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[image:var(--grad-primary)] shadow-glow-sm">
        <motion.span
          animate={{ rotate: 360 }}
          transition={{ duration: 8, repeat: Infinity, ease: "linear" }}
          className="text-white"
        >
          <Radar className="h-5 w-5" strokeWidth={2.2} />
        </motion.span>
      </div>
      {showText && (
        <div className="min-w-0 leading-tight">
          <p className="text-gradient text-[15px] font-bold tracking-tight">
            Take It
          </p>
          <p className="text-[10.5px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
            Lead Intelligence
          </p>
        </div>
      )}
    </div>
  );
}
