"use client"

import { Tooltip as TooltipPrimitive } from "@base-ui/react/tooltip"
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

// Icono ⓘ con explicación al pasar el mouse (o al tocarlo, en mobile). El
// dashboard lo comparten tres personas no técnicas: cada número derivado lleva
// uno de estos contando de dónde sale (PRODUCT.md: "anything only Renato would
// understand is a defect").
function InfoTip({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <Tooltip>
      <TooltipTrigger
        aria-label="Explicación"
        className={cn("inline-flex align-middle text-muted-foreground/70 hover:text-foreground transition-colors", className)}
      >
        <InfoIcon className="size-3.5" />
      </TooltipTrigger>
      <TooltipContent>{children}</TooltipContent>
    </Tooltip>
  )
}

export { Tooltip, TooltipProvider, TooltipTrigger, TooltipContent, InfoTip }
