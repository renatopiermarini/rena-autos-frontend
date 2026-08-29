// Single source of truth for vehicle `estado` → display label + Badge variant.
// Keeps status colors consistent across Inicio, Stock and any other view.

export type BadgeVariant =
  | 'default' | 'secondary' | 'outline' | 'ghost'
  | 'destructive' | 'success' | 'warning' | 'info'

// These name ESTADOS, never ownership. They used to read 'Consignación' and
// 'Propios', which are tipo_operacion values — so a propio car whose estado was
// confirmado showed a badge saying "Consignación". Ownership has its own
// grouping and its own badge; keep the two vocabularies apart.
//
// The five values below are the whole pipeline, in order. Six older estados
// (potencial, confirmado, en_stock, en_reparacion, va_a_pensarlo,
// necesita_follow_up) were retired — note en_preparacion (prep for sale) is a
// different word from the old en_reparacion (repair), not a rename of it.
const ESTADO_META: Record<string, { label: string; variant: BadgeVariant }> = {
  a_ingresar:     { label: 'A ingresar',        variant: 'info' },
  en_preparacion: { label: 'En preparación',    variant: 'warning' },
  publicado:      { label: 'Publicado',         variant: 'success' },
  reservado:      { label: 'Señado / Reservado', variant: 'warning' },
  vendido:        { label: 'Vendido',           variant: 'secondary' },
}

export function estadoMeta(estado?: string): { label: string; variant: BadgeVariant } {
  return (
    ESTADO_META[estado ?? ''] ??
    { label: (estado ?? '—').replace(/_/g, ' '), variant: 'outline' }
  )
}

// La otra mitad del vocabulario: tipo_operacion (de quién es la plata). Los
// slugs crudos ('propio', 'consignacion' sin acento) se veían tal cual en
// Finanzas › Por Vehículo.
const TIPO_OPERACION_LABEL: Record<string, string> = {
  propio:       'Propio',
  consignacion: 'Consignación',
}

export function tipoOperacionLabel(tipo?: string | null): string {
  if (!tipo) return '—'
  return TIPO_OPERACION_LABEL[tipo] ?? tipo
}
