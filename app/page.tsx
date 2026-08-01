import { getBalances, getTareas, getVehicles, getPrestamos, getOfertas, getVisitas, getTransferencias, getTurnos } from '@/lib/kapso'
import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { AlertTriangleIcon, CarIcon, CalendarClockIcon, ArrowLeftRightIcon, CircleAlertIcon } from 'lucide-react'
import { MiniWeek } from '@/components/calendar/MiniWeek'
import { transferenciaBlock, transferenciaBlocks, turnosBlocks } from '@/lib/agenda'
import { fmtDateTime } from '@/lib/date'
import { estadoMeta } from '@/lib/estados'

// Inicio in the patente world. See the direction contract in app/layout.tsx.
// A plate is a real object here: white field, blue head band, stamped edge. Data
// that identifies a car goes ON a plate; everything else is the body it mounts to.

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

/** A vehicle's dominio, set as an actual small plate. */
function Dominio({ dominio }: { dominio?: string | null }) {
  if (!dominio) {
    return (
      <span className="font-plate text-[11px] tracking-widest text-muted-foreground px-2 py-1">
        SIN DOMINIO
      </span>
    )
  }
  return (
    <span className="plate-sm inline-flex items-stretch overflow-hidden shrink-0">
      <span className="plate-band w-1.5" aria-hidden />
      <span className="font-plate font-bold text-[13px] leading-none tracking-[0.14em] px-2 py-1.5">
        {dominio.toUpperCase()}
      </span>
    </span>
  )
}

export default async function Inicio() {
  const [balances, tareas, vehicles, prestamos, ofertas, visitas, transferencias, turnos] = await Promise.all([
    getBalances(), getTareas(), getVehicles(), getPrestamos(), getOfertas(), getVisitas(), getTransferencias(), getTurnos(),
  ])

  function veh(id: number) {
    return vehicles.find((x: any) => x.id === id)
  }
  function autoLabel(id: number) {
    const v = veh(id)
    if (!v) return '—'
    return `${v.marca ?? ''} ${v.modelo ?? ''} ${v.año ?? ''}`.trim() || `Auto #${id}`
  }

  const activos = vehicles.filter((v: any) => v.estado !== 'vendido' && v.estado !== 'potencial')
  const urgentes = tareas.filter((t: any) => t.prioridad === 'alta' && t.estado !== 'completada')
  const prestamosActivos = prestamos.filter((p: any) => p.estado === 'activo')
  const ofertasPendientes = ofertas.filter((o: any) => o.estado === 'pendiente')
  const hoy = new Date()
  // Same definition as the "próximas" filter in VisitasClient: still pendiente AND not yet past.
  const visitasPendientes = visitas.filter((v: any) =>
    v.resultado === 'pendiente' && v.fecha && new Date(v.fecha) >= hoy)
  const horizon48h = new Date(hoy.getTime() + 48 * 60 * 60 * 1000)
  // Both sources, same as the agenda — counting only transferencias hid every turno
  // the bot wrote, so this metric disagreed with the calendar it links to.
  const turnosProximos = [...transferenciaBlocks(transferencias), ...turnosBlocks(turnos)]
    .filter(b => b.start >= hoy)

  // Próxima actividad (next 48h): visitas + turnos, merged + sorted.
  type Proximo = { kind: 'visita' | 'turno'; label: string; dominio?: string; when: Date; fechaIso: string }
  const proximos: Proximo[] = []
  for (const v of visitas) {
    if (!v.fecha || (v.resultado && v.resultado !== 'pendiente')) continue
    const d = new Date(v.fecha)
    if (d >= hoy && d <= horizon48h) {
      proximos.push({ kind: 'visita', label: autoLabel(v.vehicle_id), dominio: veh(v.vehicle_id)?.dominio, when: d, fechaIso: v.fecha })
    }
  }
  for (const t of transferencias) {
    if (t.estado === 'cancelada' || t.estado === 'completada') continue
    const b = transferenciaBlock(t)
    if (b && b.start >= hoy && b.start <= horizon48h) {
      proximos.push({ kind: 'turno', label: t.auto || autoLabel(t.vehicle_id), dominio: veh(t.vehicle_id)?.dominio, when: b.start, fechaIso: b.start.toISOString() })
    }
  }
  proximos.sort((a, b) => a.when.getTime() - b.when.getTime())

  const alertas: string[] = []
  const cash = balances.find((b: any) => b.cuenta === 'cash')
  if (cash && Number(cash.saldo ?? 0) < 500) alertas.push(`Cash bajo: $${cash.saldo ?? 0}`)
  prestamosActivos.forEach((p: any) => {
    if (!p.fecha_vencimiento) return
    const dias = Math.ceil((new Date(p.fecha_vencimiento).getTime() - hoy.getTime()) / 86400000)
    if (dias < 0) alertas.push(`Préstamo vencido hace ${Math.abs(dias)} días`)
    else if (dias <= 30) alertas.push(`Préstamo vence en ${dias} días`)
  })
  if (ofertasPendientes.length > 0) {
    alertas.push(`${ofertasPendientes.length} oferta${ofertasPendientes.length === 1 ? '' : 's'} pendiente${ofertasPendientes.length === 1 ? '' : 's'} de respuesta`)
  }

  const metrics = [
    { label: 'En el lote',   value: activos.length,           href: '/stock',          icon: CarIcon,            alert: false },
    { label: 'Visitas',      value: visitasPendientes.length, href: '/visitas',        icon: CalendarClockIcon,  alert: false },
    { label: 'Turnos',       value: turnosProximos.length,    href: '/transferencias', icon: ArrowLeftRightIcon, alert: false },
    { label: 'Urgentes',     value: urgentes.length,          href: '/tareas',         icon: AlertTriangleIcon,  alert: urgentes.length > 0 },
  ]

  const fecha = `${hoy.getDate()} ${MESES[hoy.getMonth()]} ${hoy.getFullYear()}`

  return (
    <div className="space-y-5">

      {/* THE PLATE. The whole first viewport is one, because the first thing this
          business needs to read is four numbers, at size, without hunting. */}
      <div className="plate-mount">
      <section className="plate overflow-hidden">
        <div className="plate-band flex items-center justify-between px-4 py-1.5">
          <span className="font-plate text-[11px] font-bold tracking-[0.3em] uppercase">
            Renato Piermarini Autos
          </span>
          <span className="font-plate text-[11px] font-semibold tracking-[0.18em] uppercase tabular-nums">
            {fecha}
          </span>
        </div>

        <div className="relative grid grid-cols-2 lg:grid-cols-4 divide-x divide-[color:var(--plate-ink)]/15">
          {metrics.map(m => {
            const Icon = m.icon
            return (
              <Link
                key={m.label}
                href={m.href}
                className="group px-4 py-5 lg:py-7 transition-colors hover:bg-[color:var(--plate-ink)]/[0.05] focus-visible:outline-none focus-visible:bg-[color:var(--plate-ink)]/[0.07]"
              >
                <span className="flex items-baseline gap-2">
                  <span
                    className={`font-plate font-bold tabular-nums leading-none text-5xl lg:text-6xl ${
                      m.alert ? 'text-[#a11208]' : 'text-[color:var(--plate-ink)]'
                    }`}
                  >
                    {m.value}
                  </span>
                  <Icon className={`size-4 shrink-0 ${m.alert ? 'text-[#a11208]' : 'text-[color:var(--plate-ink)]/45'}`} aria-hidden />
                </span>
                <span className="mt-2.5 block font-plate text-[11px] font-semibold uppercase tracking-[0.22em] text-[color:var(--plate-ink)]/65 group-hover:text-[color:var(--plate-ink)]">
                  {m.label}
                </span>
              </Link>
            )
          })}
        </div>
      </section>
      </div>

      {/* Alerts are the red sticker slapped across a plate — the one thing that
          overrides everything else on the surface. */}
      {alertas.length > 0 && (
        <section className="rounded-md border border-[#a11208]/45 bg-[#a11208]/12 overflow-hidden">
          <div className="flex items-center gap-2 bg-[#a11208] px-3 py-1.5 text-white">
            <CircleAlertIcon className="size-3.5 shrink-0" aria-hidden />
            <span className="font-plate text-[11px] font-bold uppercase tracking-[0.24em]">
              {alertas.length === 1 ? 'Atención' : `Atención · ${alertas.length}`}
            </span>
          </div>
          <ul className="divide-y divide-[#a11208]/20">
            {alertas.map((a, i) => (
              <li key={i} className="px-3 py-2 text-sm text-[#ff9d93]">{a}</li>
            ))}
          </ul>
        </section>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Próximas 48h — time set in plate numerals so the hour is the thing you catch. */}
        <section className="rounded-md border border-border bg-card overflow-hidden">
          <header className="flex items-baseline justify-between border-b border-border px-3 py-2">
            <h2 className="font-plate text-[11px] font-bold uppercase tracking-[0.22em]">Próximas 48 h</h2>
            <span className="font-plate text-xs tabular-nums text-muted-foreground">{proximos.length}</span>
          </header>
          {proximos.length === 0
            ? <p className="px-3 py-6 text-center text-sm text-muted-foreground">Nada agendado.</p>
            : (
              <ul className="divide-y divide-border">
                {proximos.slice(0, 7).map((p, i) => (
                  <li key={i} className="flex items-center gap-3 px-3 py-2">
                    <span
                      className={`w-1 self-stretch rounded-full shrink-0 ${p.kind === 'turno' ? 'bg-[color:var(--plate-blue)]' : 'bg-warning'}`}
                      aria-hidden
                    />
                    <span className="font-plate text-sm font-semibold tabular-nums shrink-0 w-[92px]">
                      {fmtDateTime(p.fechaIso)}
                    </span>
                    <span className="text-sm truncate flex-1">{p.label}</span>
                    <Dominio dominio={p.dominio} />
                  </li>
                ))}
              </ul>
            )}
        </section>

        <MiniWeek visitas={visitas} transferencias={transferencias} turnos={turnos} />
      </div>

      {/* The rack. Every active car as its own plate — this is the payoff of the world. */}
      <section className="rounded-md border border-border bg-card overflow-hidden">
        <header className="flex items-baseline justify-between border-b border-border px-3 py-2">
          <h2 className="font-plate text-[11px] font-bold uppercase tracking-[0.22em]">En el lote</h2>
          <Link href="/stock" className="font-plate text-xs tabular-nums text-muted-foreground hover:text-foreground">
            {activos.length} →
          </Link>
        </header>
        {activos.length === 0
          ? <p className="px-3 py-6 text-center text-sm text-muted-foreground">Sin autos activos.</p>
          : (
            <ul className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-px bg-border">
              {activos.slice(0, 12).map((v: any) => (
                <li key={v.id} className="flex items-center gap-3 bg-card px-3 py-2.5">
                  <Dominio dominio={v.dominio} />
                  <span className="text-sm truncate flex-1 min-w-0">
                    {`${v.marca ?? ''} ${v.modelo ?? ''}`.trim() || '—'}
                    {v.año && <span className="text-muted-foreground"> {v.año}</span>}
                  </span>
                  <Badge variant={estadoMeta(v.estado).variant}>{estadoMeta(v.estado).label}</Badge>
                </li>
              ))}
            </ul>
          )}
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <section className="rounded-md border border-border bg-card overflow-hidden">
          <header className="flex items-baseline justify-between border-b border-border px-3 py-2">
            <h2 className="font-plate text-[11px] font-bold uppercase tracking-[0.22em]">Tareas urgentes</h2>
            <span className="font-plate text-xs tabular-nums text-muted-foreground">{urgentes.length}</span>
          </header>
          {urgentes.length === 0
            ? <p className="px-3 py-6 text-center text-sm text-muted-foreground">Sin tareas urgentes.</p>
            : (
              <ul className="divide-y divide-border">
                {urgentes.slice(0, 8).map((t: any) => (
                  <li key={t.id} className="flex items-center justify-between gap-3 px-3 py-2">
                    <span className="text-sm truncate">{t.titulo || 'Sin título'}</span>
                    <span className="font-plate text-[11px] uppercase tracking-wider text-muted-foreground shrink-0">
                      {t.asignado}
                    </span>
                  </li>
                ))}
              </ul>
            )}
        </section>

        <section className="rounded-md border border-border bg-card overflow-hidden">
          <header className="flex items-baseline justify-between border-b border-border px-3 py-2">
            <h2 className="font-plate text-[11px] font-bold uppercase tracking-[0.22em]">Caja</h2>
          </header>
          <ul className="grid grid-cols-2 sm:grid-cols-3 gap-px bg-border">
            {balances.map((b: any) => {
              const saldo = Number(b.saldo ?? 0)
              const low = b.cuenta === 'cash' && saldo < 500
              return (
                <li key={b.id} className="bg-card px-3 py-2.5">
                  <p className="font-plate text-[10px] uppercase tracking-[0.2em] text-muted-foreground">{b.cuenta}</p>
                  <p className={`font-plate text-lg font-semibold tabular-nums mt-0.5 ${low ? 'text-destructive' : ''}`}>
                    ${saldo.toLocaleString('es-AR')}
                  </p>
                </li>
              )
            })}
            {balances.length === 0 && (
              <li className="col-span-full bg-card px-3 py-6 text-center text-sm text-muted-foreground">Sin saldos.</li>
            )}
          </ul>
        </section>
      </div>

      {ofertasPendientes.length > 0 && (
        <section className="rounded-md border border-border bg-card overflow-hidden">
          <header className="flex items-baseline justify-between border-b border-border px-3 py-2">
            <h2 className="font-plate text-[11px] font-bold uppercase tracking-[0.22em]">Ofertas pendientes</h2>
            <span className="font-plate text-xs tabular-nums text-muted-foreground">{ofertasPendientes.length}</span>
          </header>
          <ul className="divide-y divide-border">
            {ofertasPendientes.slice(0, 6).map((o: any) => (
              <li key={o.id} className="flex items-center gap-3 px-3 py-2">
                <Dominio dominio={veh(o.vehicle_id)?.dominio} />
                <span className="text-sm truncate flex-1">{autoLabel(o.vehicle_id)}</span>
                <span className="font-plate text-sm font-semibold tabular-nums shrink-0">
                  USD {(Number(o.monto_ofrecido) || 0).toLocaleString('es-AR')}
                </span>
                <Badge variant={o.email_enviado ? 'default' : 'outline'}>
                  {o.email_enviado ? 'enviado' : 'pendiente'}
                </Badge>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
