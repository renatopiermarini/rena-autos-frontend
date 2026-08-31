import * as React from 'react'
import { cn } from '@/lib/utils'

// Receta única de celdas para las tablas del dashboard (ver DESIGN.md):
// headers 11px uppercase muted, celdas 13px py-2, plata en mono tabular a la
// derecha. Las tablas son <table> crudas — estos helpers (o sus clases
// exportadas, para markup condicional) son la única fuente del estilo.

export const thCls = 'px-3 py-2 text-left text-2xs font-medium uppercase tracking-wide text-muted-foreground'
export const tdCls = 'px-3 py-2'
export const tdMoneyCls = 'px-3 py-2 text-right font-mono tabular-nums'

export function Th({
  right,
  className,
  children,
  ...props
}: React.ThHTMLAttributes<HTMLTableCellElement> & { right?: boolean }) {
  return (
    <th className={cn(thCls, right && 'text-right', className)} {...props}>
      {children}
    </th>
  )
}

export function Td({ className, ...props }: React.TdHTMLAttributes<HTMLTableCellElement>) {
  return <td className={cn(tdCls, className)} {...props} />
}

export function TdMoney({ className, ...props }: React.TdHTMLAttributes<HTMLTableCellElement>) {
  return <td className={cn(tdMoneyCls, className)} {...props} />
}
