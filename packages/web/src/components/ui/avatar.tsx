import * as React from "react"
import { cn } from "@/components/ui/cn"
import { initials } from "@/lib/format"

export interface AvatarProps extends React.HTMLAttributes<HTMLDivElement> {
  name?: string | null
  src?: string | null
  size?: "sm" | "default" | "lg"
}

const sizeMap = {
  sm: "h-7 w-7 text-[11px]",
  default: "h-8 w-8 text-[12px]",
  lg: "h-11 w-11 text-sm",
}

const Avatar = React.forwardRef<HTMLDivElement, AvatarProps>(
  ({ className, name, src, size = "default", ...props }, ref) => {
    if (src) {
      return (
        <div
          ref={ref}
          className={cn(
            "inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted ring-1 ring-border",
            sizeMap[size],
            className
          )}
          {...props}
        >
          <img src={src} alt={name ?? ""} className="h-full w-full object-cover" />
        </div>
      )
    }
    return (
      <div
        ref={ref}
        className={cn(
          "inline-flex shrink-0 select-none items-center justify-center rounded-full border border-border bg-surface font-mono font-medium uppercase text-foreground",
          sizeMap[size],
          className
        )}
        {...props}
      >
        {initials(name)}
      </div>
    )
  }
)
Avatar.displayName = "Avatar"

export { Avatar }
