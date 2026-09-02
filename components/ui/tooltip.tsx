"use client"

import { Tooltip as TooltipPrimitive } from "@base-ui/react/tooltip"
import { Popover as PopoverPrimitive } from "@base-ui/react/popover"
import { InfoIcon } from "lucide-react"

import { cn } from "@/lib/utils"

function TooltipProvider(props: TooltipPrimitive.Provider.Props) {
  return <TooltipPrimitive.Provider delay={150} {...props} />
}

function Tooltip(props: TooltipPrimitive.Root.Props) {
  return <TooltipPrimitive.Root {...props} />
}

function TooltipTrigger(props: TooltipPrimitive.Trigger.Props) {
  return <TooltipPrimitive.Trigger data-slot="tooltip-trigger" {...props} />
}

function TooltipContent({
  className,
  side = "top",
  children,
  ...props
}: TooltipPrimitive.Popup.Props & { side?: "top" | "bottom" | "left" | "right" }) {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Positioner side={side} sideOffset={6} className="z-50">
        <TooltipPrimitive.Popup
          data-slot="tooltip-content"
          className={cn(
            "max-w-72 rounded-lg border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-overlay",
            "data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0",
            className
          )}
          {...props}
        >
          {children}
        </TooltipPrimitive.Popup>
      </TooltipPrimitive.Positioner>
    </TooltipPrimitive.Portal>
  )
}

// Icono ⓘ con explicación al pasar el mouse O AL HACER CLICK. El dashboard lo
// comparten tres personas no técnicas: cada número derivado lleva uno de estos
// contando de dónde sale (PRODUCT.md: "anything only Renato would understand
// is a defect"). Es un Popover con openOnHover y no un Tooltip: el tooltip
// sólo abría con hover, y un botón que al click no hace nada lee como roto
// (QA 2026-09-02) — además de no servir en touch.
function InfoTip({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <PopoverPrimitive.Root>
      <PopoverPrimitive.Trigger
        aria-label="Explicación"
        openOnHover
        delay={150}
        className={cn("inline-flex align-middle text-muted-foreground/70 hover:text-foreground transition-colors", className)}
      >
        <InfoIcon className="size-3.5" />
      </PopoverPrimitive.Trigger>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Positioner side="top" sideOffset={6} className="z-50">
          <PopoverPrimitive.Popup
            className={cn(
              "max-w-72 rounded-lg border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-overlay",
              "data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0",
            )}
          >
            {children}
          </PopoverPrimitive.Popup>
        </PopoverPrimitive.Positioner>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  )
}

export { Tooltip, TooltipProvider, TooltipTrigger, TooltipContent, InfoTip }
