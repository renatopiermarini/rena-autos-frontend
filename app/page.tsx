import { getTareas, getVehicles, getPrestamos, getVisitas, getTransferencias, getTurnos, getInteresados, getBalances } from '@/lib/kapso'
import TableroClient from './TableroClient'
import { transferenciaBlocks, turnosBlocks } from '@/lib/agenda'
import { parseInstant, localDayKey } from '@/lib/date'
import type { StripItem } from '@/components/calendar/DayStrip'

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

  const items: StripItem[] = []

  for (const v of visitas) {
    if (!v.fecha || (v.resultado && v.resultado !== 'pendiente')) continue
    const d = parseInstant(v.fecha)
    if (!d) continue
    items.push({
      id: v.id,
      kind: 'visita',
      hora: hhmm(d),
      // Person first, same as the calendario: nobody thinks in vehicles-at-times.
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

  const sinFecha: { id: number; titulo: string; asignado?: string; urgent: boolean }[] = []
  for (const t of tareas) {
    if (t.estado === 'completada') continue
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

  return <TableroClient items={items} alertas={alertas} sinFecha={sinFecha} />
}
