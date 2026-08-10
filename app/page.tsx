import { getTareas, getVehicles, getPrestamos, getVisitas, getTransferencias, getTurnos, getInteresados, getBalances } from '@/lib/kapso'
import TableroClient from './TableroClient'
import { transferenciaBlocks, turnosBlocks, blockConflicts, eventConflicts } from '@/lib/agenda'
import { parseInstant, localDayKey } from '@/lib/date'
import type { BoardItem } from '@/components/calendar/MonthBoard'

const hhmm = (d: Date) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`

export default async function Tablero() {
  const [tareas, vehicles, prestamos, visitas, transferencias, turnos, interesados, balances] = await Promise.all([
    getTareas(), getVehicles(), getPrestamos(), getVisitas(), getTransferencias(), getTurnos(), getInteresados(), getBalances(),
  ])

  const vehLabel = (id: any) => {
    const v = vehicles.find((x: any) => x.id === id)
    return v ? (`${v.marca ?? ''} ${v.modelo ?? ''}`.trim() || `Auto #${id}`) : '—'
  }
  const interLabel = (id: any) => interesados.find((x: any) => x.id === id)?.nombre ?? ''

  const items: BoardItem[] = []
  const visitaInstants: { id: number; start: Date }[] = []

  for (const v of visitas) {
    if (!v.fecha || (v.resultado && v.resultado !== 'pendiente')) continue
    const d = parseInstant(v.fecha)
    if (!d) continue
    visitaInstants.push({ id: v.id, start: d })
    items.push({
      id: v.id,
      kind: 'visita',
      hora: hhmm(d),
      // Person first: nobody here thinks in vehicles-at-times.
      title: interLabel(v.interesado_id) || vehLabel(v.vehicle_id),
      subtitle: interLabel(v.interesado_id) ? vehLabel(v.vehicle_id) : undefined,
      href: `/visitas?id=${v.id}`,
      dayKey: localDayKey(d),
    })
  }

  for (const b of [...transferenciaBlocks(transferencias), ...turnosBlocks(turnos)]) {
    items.push({
      id: b.id,
      kind: 'turno',
      hora: hhmm(b.start),
      title: b.title,
      subtitle: b.subtitle,
      href: b.href,
      dayKey: localDayKey(b.start),
    })
  }

  // Seguimientos are the bot's CRM follow-ups. There are hundreds of them and they
  // drowned the tablero — on one day they were 38 of 38 items. They stay in /tareas
  // and the agent still messages about them; this screen is for what a human has to
  // look at. `tipo` is the real field, the title check catches rows the bot wrote
  // before it started setting it.
  const esSeguimiento = (t: any) =>
    String(t?.tipo ?? '').toLowerCase() === 'seguimiento' ||
    /^\s*seguimiento\b/i.test(String(t?.titulo ?? ''))

  // Double-booking detection. This used to live in the calendario's week grid; with
  // that screen gone the tablero is the only place a human can catch a clash the
  // validators never rejected, so the display-layer check moves here. Still NOT the
  // write rule mirrored in flows/agenda_rules.py — see lib/agenda.ts.
  const allBlocks = [...transferenciaBlocks(transferencias), ...turnosBlocks(turnos)]
  const blockClashes = blockConflicts(allBlocks)
  const visitaClashes = eventConflicts(
    visitaInstants.map(v => ({ id: v.id, start: v.start })),
    allBlocks,
  )
  const clashLabel = (others: { title: string }[]) =>
    `Choca con ${others[0].title}${others.length > 1 ? ` +${others.length - 1}` : ''}`

  for (const it of items) {
    if (it.kind === 'visita') {
      const hits = visitaClashes.get(it.id)
      if (hits?.length) it.conflict = clashLabel(hits)
    } else if (it.kind === 'turno') {
      const hits = blockClashes.get(it.id)
      if (hits?.length) it.conflict = clashLabel(hits)
    }
  }

  const sinFecha: { id: number; titulo: string; asignado?: string; urgent: boolean }[] = []
  for (const t of tareas) {
    if (t.estado === 'completada') continue
    if (esSeguimiento(t)) continue
    const urgent = t.prioridad === 'alta'
    // `fecha_vencimiento` is a DATE column. Slice it rather than parsing, so a
    // date-only value never gets pulled a day backwards through UTC.
    const raw = t.fecha_vencimiento ? String(t.fecha_vencimiento).slice(0, 10) : null
    if (!raw || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
      sinFecha.push({ id: t.id, titulo: t.titulo || 'Sin título', asignado: t.asignado, urgent })
      continue
    }
    items.push({
      id: t.id,
      kind: 'tarea',
      hora: null,
      title: t.titulo || 'Sin título',
      subtitle: t.asignado || undefined,
      done: false,
      urgent,
      dayKey: raw,
    })
  }
  sinFecha.sort((a, b) => Number(b.urgent) - Number(a.urgent))

  const hoy = new Date()
  const alertas: string[] = []
  const cash = balances.find((b: any) => b.cuenta === 'cash')
  if (cash && Number(cash.saldo ?? 0) < 500) alertas.push(`Cash bajo: $${cash.saldo ?? 0}`)
  prestamos.filter((p: any) => p.estado === 'activo').forEach((p: any) => {
    if (!p.fecha_vencimiento) return
    const dias = Math.ceil((new Date(p.fecha_vencimiento).getTime() - hoy.getTime()) / 86400000)
    if (dias < 0) alertas.push(`Préstamo vencido hace ${Math.abs(dias)} días`)
    else if (dias <= 30) alertas.push(`Préstamo vence en ${dias} días`)
  })

  // Autos en circulación con datos faltantes — banner permanente del Tablero
  // (reemplaza al aviso diario por WhatsApp, pedido del usuario 2026-08-10).
  // Misma regla que check_vehicles_incomplete del backend: a_ingresar tiene
  // campos mínimos permitidos a propósito; vendido ya está cerrado.
  const CAMPOS_AUTO: [string, string][] = [
    ['dominio', 'patente'], ['numero_motor', 'n° motor'], ['numero_chasis', 'n° chasis'],
    ['color', 'color'], ['km', 'km'], ['precio_publicado', 'precio publicado'],
  ]
  const datosFaltantes = vehicles
    .filter((v: any) => v.estado !== 'vendido' && v.estado !== 'a_ingresar')
    .map((v: any) => ({
      label: `${v.marca ?? ''} ${v.modelo ?? ''}`.trim() + (v.dominio ? ` (${v.dominio})` : ''),
      faltan: CAMPOS_AUTO.filter(([campo]) => !v[campo]).map(([, nombre]) => nombre),
    }))
    .filter((v: { faltan: string[] }) => v.faltan.length > 0)

  return <TableroClient items={items} alertas={alertas} sinFecha={sinFecha} datosFaltantes={datosFaltantes} />
}
