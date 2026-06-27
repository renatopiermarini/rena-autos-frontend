// Single source of truth for vehicle `estado` → display label + Badge variant.
// Keeps status colors consistent across Inicio, Stock and any other view.

export type BadgeVariant =
  | 'default' | 'secondary' | 'outline' | 'ghost'
  | 'destructive' | 'success' | 'warning' | 'info'

const ESTADO_META: Record<string, { label: string; variant: BadgeVariant }> = {
  potencial:          { label: 'Potencial',          variant: 'outline' },
  a_ingresar:         { label: 'A ingresar',         variant: 'info' },
  confirmado:         { label: 'Consignación',       variant: 'info' },
  en_stock:           { label: 'Propios',            variant: 'success' },
  en_reparacion:      { label: 'En reparación',      variant: 'warning' },
  va_a_pensarlo:      { label: 'Va a pensarlo',      variant: 'outline' },
  necesita_follow_up: { label: 'Necesita follow-up', variant: 'destructive' },
  reservado:          { label: 'Reservado',          variant: 'warning' },
  vendido:            { label: 'Vendido',            variant: 'secondary' },
}

export function estadoMeta(estado?: string): { label: string; variant: BadgeVariant } {
  return (
    ESTADO_META[estado ?? ''] ??
    { label: (estado ?? '—').replace(/_/g, ' '), variant: 'outline' }
  )
}
