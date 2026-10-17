import * as React from "react"
import { createPortal } from "react-dom"
import { cn } from "./cn"

// Renders the dropdown in a body portal at fixed coordinates computed from the
// trigger, with edge-flip/clamp. Because it lives outside the trigger's
// ancestors, it can never be clipped by an `overflow:auto`/`hidden` container
// (e.g. the scrollable leads table) nor spill past the viewport.

export interface MenuItem {
  label: string
  onSelect: () => void
  icon?: React.ReactNode
  disabled?: boolean
  checked?: boolean
  danger?: boolean
  hint?: string
}

interface MenuProps {
  trigger: React.ReactNode
  items: MenuItem[]
  align?: "start" | "end"
  triggerClassName?: string
  panelClassName?: string
  ariaLabel?: string
}

const GAP = 6, MARGIN = 8, EST_H = 320

export function Menu({ trigger, items, align = "start", triggerClassName, panelClassName, ariaLabel }: MenuProps) {
  const [open, setOpen] = React.useState(false)
  const [pos, setPos] = React.useState<{ top: number; left: number }>({ top: 0, left: 0 })
  const trigRef = React.useRef<HTMLDivElement>(null)
  const panelRef = React.useRef<HTMLDivElement>(null)

  const place = React.useCallback(() => {
    const t = trigRef.current?.getBoundingClientRect()
    if (!t) return
    const p = panelRef.current
    const w = p?.offsetWidth ?? 200
    const h = p?.offsetHeight ?? EST_H
    let left = align === "end" ? t.right - w : t.left
    left = Math.min(Math.max(MARGIN, left), window.innerWidth - w - MARGIN)
    let top = t.bottom + GAP
    if (top + h > window.innerHeight - MARGIN) {
      const above = t.top - GAP - h
      top = above >= MARGIN ? above : Math.max(MARGIN, window.innerHeight - h - MARGIN)
    }
    setPos({ top, left })
  }, [align])

  React.useLayoutEffect(() => { if (open) place() }, [open, place])

  React.useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => {
      if (trigRef.current?.contains(e.target as Node) || panelRef.current?.contains(e.target as Node)) return
      setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false) }
    const onReflow = () => place()
    document.addEventListener("mousedown", close)
    document.addEventListener("keydown", onKey)
    window.addEventListener("resize", onReflow)
    window.addEventListener("scroll", onReflow, true)
    return () => {
      document.removeEventListener("mousedown", close)
      document.removeEventListener("keydown", onKey)
      window.removeEventListener("resize", onReflow)
      window.removeEventListener("scroll", onReflow, true)
    }
  }, [open, place])

  return (
    <>
      <div ref={trigRef} onClick={(e) => { e.stopPropagation(); setOpen((o) => !o) }} className={cn("cursor-pointer", triggerClassName)} role="button" aria-label={ariaLabel} aria-haspopup="menu" aria-expanded={open}>
        {trigger}
      </div>
      {open && createPortal(
        <div
          ref={panelRef}
          role="menu"
          style={{ position: "fixed", top: pos.top, left: pos.left }}
          className={cn("z-dropdown min-w-[190px] max-w-[calc(100vw-16px)] overflow-hidden rounded-xl border border-border bg-surface/95 p-1 shadow-card backdrop-blur-xl animate-scale-in", panelClassName)}
        >
          {items.map((it, i) => (
            <button
              key={i}
              role="menuitem"
              disabled={it.disabled}
              onClick={(e) => { e.stopPropagation(); setOpen(false); if (!it.disabled) it.onSelect(); }}
              className={cn(
                "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] font-medium transition-colors disabled:opacity-40",
                it.danger ? "text-destructive hover:bg-destructive/10" : "text-foreground hover:bg-accent",
              )}
            >
              {it.icon && <span className="shrink-0 text-muted-foreground [&_svg]:h-4 [&_svg]:w-4">{it.icon}</span>}
              <span className="flex-1 truncate">{it.label}</span>
              {it.hint && <span className="shrink-0 text-[11px] text-muted-foreground">{it.hint}</span>}
              {it.checked && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />}
            </button>
          ))}
        </div>,
        document.body,
      )}
    </>
  )
}
