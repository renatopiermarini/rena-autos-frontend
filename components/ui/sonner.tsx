"use client"

import { useTheme } from "next-themes"
import { Toaster as Sonner, type ToasterProps } from "sonner"
import { CircleCheckIcon, InfoIcon, TriangleAlertIcon, OctagonXIcon, Loader2Icon } from "lucide-react"

const Toaster = ({ ...props }: ToasterProps) => {
  // resolvedTheme y no theme: antes de montar, theme es undefined y el fallback
  // "system" hacía que el primer toast siguiera al SO en vez del dark forzado.
  const { resolvedTheme = "dark" } = useTheme()

  return (
    <Sonner
      theme={resolvedTheme as ToasterProps["theme"]}
      className="toaster group"
      icons={{
        success: (
          <CircleCheckIcon className="size-4" />
        ),
        info: (
          <InfoIcon className="size-4" />
        ),
        warning: (
          <TriangleAlertIcon className="size-4" />
        ),
        error: (
          <OctagonXIcon className="size-4" />
        ),
        loading: (
          <Loader2Icon className="size-4 animate-spin" />
        ),
      }}
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          "--border-radius": "var(--radius)",
          // richColors sin esto usa la paleta interna de Sonner: el verde/rojo
          // de los toasts (la superficie de estado más frecuente de la app) era
          // el único que no salía de los tokens. Mismo idioma que los Badge:
          // tinte del color sobre popover + texto en el color pleno.
          "--success-bg": "color-mix(in oklab, var(--success) 12%, var(--popover))",
          "--success-text": "var(--success)",
          "--success-border": "color-mix(in oklab, var(--success) 35%, transparent)",
          "--error-bg": "color-mix(in oklab, var(--destructive) 12%, var(--popover))",
          "--error-text": "var(--destructive)",
          "--error-border": "color-mix(in oklab, var(--destructive) 35%, transparent)",
          "--warning-bg": "color-mix(in oklab, var(--warning) 12%, var(--popover))",
          "--warning-text": "var(--warning)",
          "--warning-border": "color-mix(in oklab, var(--warning) 35%, transparent)",
          "--info-bg": "color-mix(in oklab, var(--info) 12%, var(--popover))",
          "--info-text": "var(--info)",
          "--info-border": "color-mix(in oklab, var(--info) 35%, transparent)",
        } as React.CSSProperties
      }
      {...props}
    />
  )
}

export { Toaster }
