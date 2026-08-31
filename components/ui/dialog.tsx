"use client"

import * as React from "react"
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { MENSAJE_DESCARTAR } from "@/lib/dirty"
import { XIcon } from "lucide-react"

function Dialog({ ...props }: DialogPrimitive.Root.Props) {
  return <DialogPrimitive.Root data-slot="dialog" {...props} />
}

/**
 * Guardia "confirmar si está sucio" para CUALQUIER diálogo con formulario.
 *
 * Se adopta en dos líneas y no hay que tocar botón por botón:
 *
 *   const { dialogProps, cerrar } = useDirtyClose({
 *     sucio: formSucio(form, inicial),
 *     onOpenChange,
 *   })
 *   <Dialog open={open} {...dialogProps}>       // Escape, click afuera y la X
 *     ...
 *     <Button variant="outline" onClick={cerrar}>Cancelar</Button>
 *   </Dialog>
 *
 * Por qué también "Cancelar" y la X: ver la nota de decisión en lib/dirty.ts.
 * Las rutas de guardado exitoso siguen llamando al `onOpenChange` crudo, así que
 * cerrar después de guardar NUNCA pregunta.
 *
 * El aviso es un `confirm()` nativo a propósito: no agrega layout (el modal ya
 * está ocupando la pantalla del celular), es síncrono — lo que permite abortar
 * el cierre en el mismo handler — y en un teléfono sale como diálogo del sistema,
 * imposible de no ver.
 */
function useDirtyClose({
  sucio,
  onOpenChange,
  mensaje = MENSAJE_DESCARTAR,
}: {
  /** ¿Hay algo tipeado que se perdería? Normalmente `formSucio(form, inicial)`. */
  sucio: boolean
  /** El setter del padre: el mismo que se le pasaba antes a `<Dialog onOpenChange>`. */
  onOpenChange: (open: boolean) => void
  mensaje?: string
}) {
  const puedeCerrar = React.useCallback(() => {
    if (!sucio) return true
    // En SSR no hay window; este código sólo corre desde handlers del browser.
    if (typeof window === "undefined") return true
    return window.confirm(mensaje)
  }, [sucio, mensaje])

  // Para <Dialog {...dialogProps}>: cubre Escape, click afuera y la X del header.
  // `details.cancel()` corta el manejo interno de Base UI (DialogStore.setOpen
  // sale antes de propagar el cierre), así que el diálogo queda abierto tal cual.
  const handleOpenChange = React.useCallback(
    (open: boolean, details?: { cancel?: () => void }) => {
      if (open) { onOpenChange(true); return }
      if (puedeCerrar()) { onOpenChange(false); return }
      details?.cancel?.()
    },
    [onOpenChange, puedeCerrar],
  )

  // Para el botón "Cancelar", que no pasa por Base UI (llama al setter del padre).
  const cerrar = React.useCallback(() => {
    if (puedeCerrar()) onOpenChange(false)
  }, [onOpenChange, puedeCerrar])

  return { dialogProps: { onOpenChange: handleOpenChange }, cerrar, puedeCerrar }
}

function DialogTrigger({ ...props }: DialogPrimitive.Trigger.Props) {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />
}

function DialogPortal({ ...props }: DialogPrimitive.Portal.Props) {
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />
}

function DialogClose({ ...props }: DialogPrimitive.Close.Props) {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />
}

function DialogOverlay({
  className,
  ...props
}: DialogPrimitive.Backdrop.Props) {
  return (
    <DialogPrimitive.Backdrop
      data-slot="dialog-overlay"
      className={cn(
        "fixed inset-0 isolate z-50 bg-black/30 duration-100 supports-backdrop-filter:backdrop-blur-xs data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0",
        className
      )}
      {...props}
    />
  )
}

function DialogContent({
  className,
  children,
  showCloseButton = true,
  ...props
}: DialogPrimitive.Popup.Props & {
  showCloseButton?: boolean
}) {
  return (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Popup
        data-slot="dialog-content"
        className={cn(
          // max-h + overflow: sin esto, un formulario más alto que el viewport se
          // recorta por AMBOS bordes (está centrado con -translate-y-1/2) y el
          // footer con Guardar queda inalcanzable en móvil. dvh y no vh: el vh de
          // iOS incluye la barra de Safari oculta.
          "fixed top-1/2 left-1/2 z-50 grid w-full max-w-[calc(100%-2rem)] max-h-[calc(100dvh-2rem)] overflow-y-auto -translate-x-1/2 -translate-y-1/2 gap-4 rounded-lg border border-border bg-popover p-4 text-sm text-popover-foreground duration-100 outline-none sm:max-w-sm data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
          className
        )}
        {...props}
      >
        {children}
        {showCloseButton && (
          <DialogPrimitive.Close
            data-slot="dialog-close"
            render={
              <Button
                variant="ghost"
                className="absolute top-2 right-2"
                size="icon-sm"
              />
            }
          >
            <XIcon
            />
            <span className="sr-only">Cerrar</span>
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Popup>
    </DialogPortal>
  )
}

function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-header"
      className={cn("flex flex-col gap-2", className)}
      {...props}
    />
  )
}

function DialogFooter({
  className,
  showCloseButton = false,
  children,
  ...props
}: React.ComponentProps<"div"> & {
  showCloseButton?: boolean
}) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn(
        "-mx-4 -mb-4 flex flex-col-reverse gap-2 rounded-b-lg border-t bg-muted/50 p-4 sm:flex-row sm:justify-end",
        className
      )}
      {...props}
    >
      {children}
      {showCloseButton && (
        <DialogPrimitive.Close render={<Button variant="outline" />}>
          Close
        </DialogPrimitive.Close>
      )}
    </div>
  )
}

function DialogTitle({ className, ...props }: DialogPrimitive.Title.Props) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn(
        "font-heading text-base leading-none font-medium",
        className
      )}
      {...props}
    />
  )
}

function DialogDescription({
  className,
  ...props
}: DialogPrimitive.Description.Props) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn(
        "text-sm text-muted-foreground *:[a]:underline *:[a]:underline-offset-3 *:[a]:hover:text-foreground",
        className
      )}
      {...props}
    />
  )
}

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
  useDirtyClose,
}
