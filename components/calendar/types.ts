// Shared types for the calendar components.

/** A point-in-time item (a visita) — rendered as a pill at its time. */
export type CalendarEvent = {
  id: string | number
  title: string
  start: Date
  kind: 'visita'
  subtitle?: string
  href?: string
  meta?: any
}

/** A span (a transferencia turno) — rendered as a shaded block over its hours. */
export type CalendarBlock = {
  id: string | number
  title: string
  start: Date
  end: Date
  kind: 'transferencia'
  subtitle?: string
  meta?: any
}
