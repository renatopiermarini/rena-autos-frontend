// Single source of truth for date parsing + formatting across the dashboard.
//
// Storage convention: an INSTANT (a thing with a time of day, e.g. `visita.fecha`)
// is stored as AR-local wall-clock with an explicit `-03:00` offset — Argentina has
// no DST, so `-03:00` is correct year-round. DATE-ONLY fields (`tareas.fecha_vencimiento`,
// `transferencias.fecha_turno`) stay `"YYYY-MM-DD"`; `transferencias.horario` stays `"HH:MM"`.
//
// Two rules that kill the off-by-one bugs:
//   1. Never `new Date("YYYY-MM-DD")` — that's UTC midnight and renders the previous
//      day in UTC-3. Use parseLocalDate (local noon).
//   2. Never `.slice(0, 10)` an instant string to bucket it by day — a late-night
//      AR time stored as `…Z` slices to the next day. Use localDayKey(parseInstant(...)).

export const AR_OFFSET = '-03:00'

export const MESES_ES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]
// Sunday-first short names, indexed by Date.getDay() — for the month-grid header.
export const DIAS_CORTOS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']
// Monday-first short names — for the week-grid columns.
export const DIAS_SEMANA = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']

// ── Parsing ────────────────────────────────────────────────────────────────────

/** Date-only "YYYY-MM-DD" → local noon Date (noon avoids the UTC-3 day rollover). */
export function parseLocalDate(dateOnly: string): Date {
  return new Date(dateOnly + 'T12:00:00')
}

/** Full ISO instant (with `-03:00` OR legacy `Z`) → Date; null on empty/invalid. */
export function parseInstant(iso?: string | null): Date | null {
  if (!iso) return null
  const d = new Date(iso)
  return isNaN(d.getTime()) ? null : d
}

/** Parse either shape: date-only → local noon; instant (has "T") → as-is. */
export function parseAny(s?: string | null): Date | null {
  if (!s) return null
  const d = s.includes('T') ? new Date(s) : new Date(s + 'T12:00:00')
  return isNaN(d.getTime()) ? null : d
}

// ── Day bucketing (calendar grouping) ──────────────────────────────────────────

/** A Date → "YYYY-MM-DD" in LOCAL time. The ONLY correct way to bucket by day. */
export function localDayKey(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

/** Convenience: bucket an instant string by its local day. Replaces `.slice(0,10)`. */
export function instantDayKey(iso?: string | null): string {
  const d = parseInstant(iso)
  return d ? localDayKey(d) : ''
}

/** Today as "YYYY-MM-DD" in LOCAL time. Use instead of `new Date().toISOString().slice(0,10)`,
 *  which is UTC and rolls over to tomorrow after ~21:00 AR. Call only client-side. */
export function todayKey(): string {
  return localDayKey(new Date())
}

// ── <input type="datetime-local"> round-trip ───────────────────────────────────

/** Stored instant → datetime-local value "YYYY-MM-DDTHH:MM" (local wall-clock). */
export function toARInputValue(iso?: string | null): string {
  const d = parseInstant(iso)
  if (!d) return ''
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}

/**
 * datetime-local "YYYY-MM-DDTHH:MM" → stored AR string "…:00-03:00".
 * THE BUG FIX: the input is already AR wall-clock, so we just stamp the offset —
 * no timezone math. The old `new Date(local).toISOString()` shifted it to UTC and
 * stored a `…Z` value, which then mismatched the bot's `-03:00` writes.
 */
export function fromARInputValue(local: string): string {
  if (!local) return ''
  const m = local.trim().match(/^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?/)
  if (!m) return local
  const [, date, hh, mm, ss] = m
  return `${date}T${hh}:${mm}:${ss ?? '00'}${AR_OFFSET}`
}

// ── Formatters ─────────────────────────────────────────────────────────────────
// Names are unambiguous about whether they include the year, because the old
// per-file `fmtFecha` meant "DD/MM" in some files and "DD/MM/YY" in others.

/** "DD/MM" — date-only or instant. */
export function fmtDM(s?: string | null): string {
  const d = parseAny(s)
  return d ? d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' }) : ''
}

/** "DD/MM/YY" — date-only or instant. */
export function fmtDMY(s?: string | null): string {
  const d = parseAny(s)
  return d ? d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit' }) : ''
}

/** "lunes 27 de junio" — for a selected-day header. */
export function fmtFechaLarga(s?: string | null): string {
  const d = parseAny(s)
  return d ? d.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' }) : ''
}

// Pin the AR timezone so an instant formats to the same wall-clock whether this runs
// on the server (Vercel = UTC) or in the browser — correct times + no hydration drift.
const AR_TZ_NAME = 'America/Argentina/Buenos_Aires'

/** "HH:MM" for an instant; "" for a date-only value (no time of day). */
export function fmtHora(iso?: string | null): string {
  if (!iso || !iso.includes('T')) return ''
  const d = parseInstant(iso)
  if (!d) return ''
  return d.toLocaleTimeString('es-AR', { timeZone: AR_TZ_NAME, hour: '2-digit', minute: '2-digit', hour12: false })
}

/** "DD/MM HH:MM" for an instant. */
export function fmtDateTime(iso?: string | null): string {
  const d = parseInstant(iso)
  if (!d) return ''
  return d.toLocaleString('es-AR', { timeZone: AR_TZ_NAME, day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}
