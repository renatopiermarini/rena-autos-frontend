// Single source of truth for vehicle `estado` → display label + Badge variant.
// Keeps status colors consistent across Inicio, Stock and any other view.

export type BadgeVariant =
  | 'default' | 'secondary' | 'outline' | 'ghost'
  | 'destructive' | 'success' | 'warning' | 'info'

const ESTADO_META: Record<string, { label: string; variant: BadgeVariant }> = {
  potencial:          { label: 'Potencial',          variant: 'outline' },
  a_ingresar:         { label: 'A ingresar',         variant: 'info' },
  // These name ESTADOS, never ownership. They used to read 'Consignación' and
  // 'Propios', which are tipo_operacion values — so a propio car whose estado
  // was confirmado showed a badge saying "Consignación". Ownership has its own
  // grouping and its own badge; keep the two vocabularies apart.
  confirmado:         { label: 'Confirmado',         variant: 'info' },
  en_stock:           { label: 'En stock',           variant: 'success' },
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
