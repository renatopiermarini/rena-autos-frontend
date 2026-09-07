'use client'
import { SparklesIcon, TriangleAlertIcon } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

/**
 * Las marcas de "esto lo puso la IA" en un formulario.
 *
 * La IA propone y el humano confirma (lib/ia.ts): para que eso sea verdad, lo
 * sugerido tiene que VERSE distinto de lo tipeado hasta que alguien lo toque.
 * Tres piezas, todas en `info` (azul = en curso, DESIGN.md):
 *
 *   · `CAMPO_IA_CLS`      clases para el control (borde `info`);
 *   · `IaChip`            "Sugerido por IA" al lado del label;
 *   · `IaSugerenciasBar`  arriba del form: cuántos campos y "Limpiar";
 *   · `IaAdvertencias`    lo que la IA no pudo resolver ("no encontré a Juan"),
 *                         en `warning` (ámbar = esperando a alguien).
 */

/** Para el `className` del Input/select mientras el campo está en `camposIa`. */
export const CAMPO_IA_CLS = 'border-info focus-visible:border-info focus-visible:ring-info/30'

export function IaChip({ className }: { className?: string }) {
  return (
    <Badge variant="info" className={cn('h-4 gap-1 px-1.5 text-2xs', className)}>
      <SparklesIcon aria-hidden className="size-2.5!" />
      Sugerido por IA
    </Badge>
  )
}

export function IaSugerenciasBar({
  cantidad,
  onLimpiar,
  className,
}: {
  cantidad: number
  onLimpiar: () => void
  className?: string
}) {
  if (cantidad <= 0) return null
  return (
    <div
      role="status"
      className={cn(
        'flex flex-wrap items-center justify-between gap-2 rounded-lg border border-info/30 bg-info/10 px-3 py-2 text-sm',
        className,
      )}
    >
      <span className="inline-flex items-center gap-2">
        <SparklesIcon aria-hidden className="size-4 shrink-0 text-info" />
        <span>
          <span className="font-medium">
            {cantidad === 1 ? '1 campo sugerido' : `${cantidad} campos sugeridos`} por IA
          </span>
          {' '}— revisalos antes de guardar
        </span>
      </span>
      <Button type="button" variant="ghost" size="xs" onClick={onLimpiar}>
        Limpiar sugerencias
      </Button>
    </div>
  )
}

export function IaAdvertencias({ items, className }: { items: string[]; className?: string }) {
  if (!items || items.length === 0) return null
  return (
    <ul
      role="alert"
      className={cn(
        'space-y-1 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-xs',
        className,
      )}
    >
      {items.map((a, i) => (
        <li key={`${i}-${a}`} className="flex items-start gap-2">
          <TriangleAlertIcon aria-hidden className="mt-0.5 size-3.5 shrink-0 text-warning" />
          <span>{a}</span>
        </li>
      ))}
    </ul>
  )
}
