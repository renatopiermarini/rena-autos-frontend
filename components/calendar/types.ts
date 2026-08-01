// Shared types for the calendar components.

/** A point-in-time item (a visita) — rendered as a pill at its time. */
export type CalendarEvent = {
  id: string | number
  title: string
  start: Date
  kind: 'visita'
  subtitle?: string
  /** Where clicking this lands. Absent = no dashboard record to open. */
  href?: string
  meta?: any
}

/**
 * A span — rendered as a shaded block over its hours.
 *
 * `transferencia` rows come from the `transferencias` table and have a page.
 * `turno` rows come from the bot's `turnos` table, which no page renders, so
 * they carry no `href` and must not be routed anywhere. Keeping them a distinct
 * kind is what stops the calendar from sending people to a list that cannot
 * contain the thing they clicked.
 */
export type CalendarBlock = {
  id: string | number
  title: string
  start: Date
  end: Date
  kind: 'transferencia' | 'turno'
  subtitle?: string
  /** Where clicking this lands. Absent = no dashboard record to open. */
  href?: string
  meta?: any
}
