// Transferencia "block of hours" + visita/transferencia conflict logic.
//
// A transferencia turno (fecha_turno + horario) blocks a fixed window so a visita
// can't be scheduled on top of it. This is the TS half of a rule that is duplicated
// in the backend (rena-autos-api `flows/agenda_rules.py`) because the dashboard writes
// to Kapso directly while the bot writes through its tools — both must enforce it.
// KEEP IN SYNC: BLOCK_HOURS, the half-open overlap, and the "active" estado rule must
// match the Python helper. The shared test vector guards against drift.

import { AR_OFFSET, parseInstant } from '@/lib/date'
import type { CalendarBlock } from '@/components/calendar/types'

export const BLOCK_HOURS = 2

// A transferencia blocks the calendar unless it's already done or called off.
const NOT_BLOCKING = new Set(['cancelada', 'completada'])

export function isActiveTransferencia(t: any): boolean {
  return !NOT_BLOCKING.has(String(t?.estado ?? ''))
}

/** A transferencia turno → its blocked window {start, end}, or null if unscheduled. */
export function transferenciaBlock(t: any): { start: Date; end: Date } | null {
  if (!t?.fecha_turno) return null
  const raw = String(t.horario ?? '').trim()
  const horario = /^\d{1,2}:\d{2}$/.test(raw) ? raw.padStart(5, '0') : '00:00'
  const start = parseInstant(`${t.fecha_turno}T${horario}:00${AR_OFFSET}`)
  if (!start) return null
  return { start, end: new Date(start.getTime() + BLOCK_HOURS * 3600_000) }
}

/** Half-open overlap: start <= instant < end. */
export function inBlock(instant: Date, b: { start: Date; end: Date }): boolean {
  return b.start.getTime() <= instant.getTime() && instant.getTime() < b.end.getTime()
}

export type Conflict = { auto: string; start: Date; end: Date }

/** First active transferencia whose block contains the visita instant, or null. */
export function visitaConflict(fechaIso: string, transferencias: any[]): Conflict | null {
  const inst = parseInstant(fechaIso)
  if (!inst) return null
  for (const t of transferencias ?? []) {
    if (!isActiveTransferencia(t)) continue
    const b = transferenciaBlock(t)
    if (b && inBlock(inst, b)) {
      return { auto: t.auto || `#${t.vehicle_id ?? t.id}`, start: b.start, end: b.end }
    }
  }
  return null
}

/** Map active, scheduled transferencias to calendar blocks for the week grid. */
export function transferenciaBlocks(transferencias: any[]): CalendarBlock[] {
  const out: CalendarBlock[] = []
  for (const t of transferencias ?? []) {
    if (!isActiveTransferencia(t)) continue
    const b = transferenciaBlock(t)
    if (!b) continue
    out.push({
      id: t.id,
      title: t.auto || `Transferencia #${t.id}`,
      start: b.start,
      end: b.end,
      kind: 'transferencia',
      subtitle: t.comprador_nombre || undefined,
      meta: t,
    })
  }
  return out
}
