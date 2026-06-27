import { getBalances, getTareas, getVehicles, getPrestamos, getOfertas, getVisitas, getTransferencias } from '@/lib/kapso'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { AlertTriangleIcon, CarIcon, CalendarClockIcon, ArrowLeftRightIcon } from 'lucide-react'
import { MiniWeek } from '@/components/calendar/MiniWeek'
import { transferenciaBlock, transferenciaBlocks } from '@/lib/agenda'
import { fmtDateTime } from '@/lib/date'
import { estadoMeta } from '@/lib/estados'

// Tone → icon-chip classes (literal strings so Tailwind picks them up).
const TONE: Record<string, string> = {
  primary: 'bg-primary/10 text-primary',
  info: 'bg-info/10 text-info',
  warning: 'bg-warning/10 text-warning',
  destructive: 'bg-destructive/10 text-destructive',
  muted: 'bg-muted text-muted-foreground',
}

export default async function Inicio() {
  const [balances, tareas, vehicles, prestamos, ofertas, visitas, transferencias] = await Promise.all([
    getBalances(), getTareas(), getVehicles(), getPrestamos(), getOfertas(), getVisitas(), getTransferencias(),
  ])

  function autoLabel(id: number) {
    const v = vehicles.find((x: any) => x.id === id)
    if (!v) return '—'
    const base = `${v.marca ?? ''} ${v.modelo ?? ''} ${v.año ?? ''}`.trim()
    return v.dominio ? `${base} (${v.dominio})` : base
  }

  const activos = vehicles.filter((v: any) => v.estado !== 'vendido' && v.estado !== 'potencial')
  const urgentes = tareas.filter((t: any) => t.prioridad === 'alta' && t.estado !== 'completada')
  const prestamosActivos = prestamos.filter((p: any) => p.estado === 'activo')
  const ofertasPendientes = ofertas.filter((o: any) => o.estado === 'pendiente')
  const visitasPendientes = visitas.filter((v: any) => v.resultado === 'pendiente')

  const hoy = new Date()
  const horizon48h = new Date(hoy.getTime() + 48 * 60 * 60 * 1000)
  const turnosProximos = transferenciaBlocks(transferencias).filter(b => b.start >= hoy)

  // Próxima actividad (next 48h): visitas + turnos, merged + sorted.
  type Proximo = { kind: 'visita' | 'turno'; label: string; when: Date; fechaIso: string }
  const proximos: Proximo[] = []
  for (const v of visitas) {
    if (!v.fecha || (v.resultado && v.resultado !== 'pendiente')) continue
    const d = new Date(v.fecha)
    if (d >= hoy && d <= horizon48h) proximos.push({ kind: 'visita', label: autoLabel(v.vehicle_id), when: d, fechaIso: v.fecha })
  }
  for (const t of transferencias) {
    if (t.estado === 'cancelada' || t.estado === 'completada') continue
    const b = transferenciaBlock(t)
    if (b && b.start >= hoy && b.start <= horizon48h) {
      proximos.push({ kind: 'turno', label: t.auto || autoLabel(t.vehicle_id), when: b.start, fechaIso: b.start.toISOString() })
    }
  }
  proximos.sort((a, b) => a.when.getTime() - b.when.getTime())

  const alertas: string[] = []
  const cash = balances.find((b: any) => b.cuenta === 'cash')
  if (cash && cash.saldo < 500) alertas.push(`Cash bajo: $${cash.saldo}`)
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
    { label: 'Stock activo',       value: activos.length,            href: '/stock',          icon: CarIcon,             tone: 'primary' },
    { label: 'Visitas pendientes', value: visitasPendientes.length,  href: '/visitas',        icon: CalendarClockIcon,   tone: visitasPendientes.length ? 'info' : 'muted' },
    { label: 'Turnos próximos',    value: turnosProximos.length,     href: '/transferencias', icon: ArrowLeftRightIcon,  tone: turnosProximos.length ? 'warning' : 'muted' },
    { label: 'Tareas urgentes',    value: urgentes.length,           href: '/tareas',         icon: AlertTriangleIcon,   tone: urgentes.length ? 'destructive' : 'muted' },
  ]

  return (
    <div className="space-y-4">
      <div className="flex items-baseline justify-between">
        <h1 className="text-xl font-semibold">Inicio</h1>
        <p className="text-xs text-muted-foreground">
          {activos.length} autos activos · {visitasPendientes.length} visitas · {urgentes.length} tareas urgentes
        </p>
      </div>

      {alertas.length > 0 && (
        <Card className="border-destructive/30 bg-destructive/5 py-3">
          <CardContent className="space-y-1">
            <div className="flex items-center gap-2 text-destructive text-xs font-semibold uppercase tracking-wide mb-1">
              <AlertTriangleIcon className="size-4" /> Alertas
            </div>
            {alertas.map((a, i) => <p key={i} className="text-sm text-destructive">{a}</p>)}
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
        {balances.map((b: any) => {
          const saldo = Number(b.saldo ?? 0)
          const low = b.cuenta === 'cash' && saldo < 500
          return (
            <Card key={b.id} size="sm">
              <CardContent>
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">{b.cuenta}</p>
                <p className={`text-xl font-light tabular-nums ${low ? 'text-destructive' : ''}`}>
                  ${saldo.toLocaleString('es-AR')}
                </p>
              </CardContent>
            </Card>
          )
        })}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {metrics.map(m => {
          const Icon = m.icon
          return (
            <Link key={m.label} href={m.href}>
              <Card size="sm" className="hover:bg-muted/40 hover:ring-foreground/20 transition-colors">
                <CardContent className="py-3 flex items-center gap-3">
                  <span className={`grid size-9 shrink-0 place-items-center rounded-lg ${TONE[m.tone]}`}>
                    <Icon className="size-[18px]" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-2xl font-light tabular-nums leading-none">{m.value}</p>
                    <p className="text-xs text-muted-foreground mt-1 truncate">{m.label}</p>
                  </div>
                </CardContent>
              </Card>
            </Link>
          )
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <MiniWeek visitas={visitas} transferencias={transferencias} />

        <Card size="sm">
          <CardHeader className="border-b py-3">
            <CardTitle className="text-sm">Próximas 48 h ({proximos.length})</CardTitle>
          </CardHeader>
          <CardContent className="divide-y divide-border p-0">
            {proximos.length === 0
              ? <p className="px-3 py-2.5 text-sm text-muted-foreground">Nada agendado.</p>
              : proximos.slice(0, 8).map((p, i) => (
                <div key={i} className="flex items-center justify-between px-3 py-2">
                  <span className="inline-flex items-center gap-2 text-sm truncate">
                    <span className={`inline-block w-1.5 h-1.5 rounded-full shrink-0 ${p.kind === 'turno' ? 'bg-amber-500' : 'bg-blue-600'}`} />
                    <span className="truncate">{p.kind === 'turno' ? 'Turno · ' : ''}{p.label}</span>
                  </span>
                  <span className="text-xs text-muted-foreground tabular-nums shrink-0 ml-2">{fmtDateTime(p.fechaIso)}</span>
                </div>
              ))}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card size="sm">
          <CardHeader className="border-b py-3">
            <CardTitle className="text-sm">Stock activo ({activos.length})</CardTitle>
          </CardHeader>
          <CardContent className="divide-y divide-border p-0 max-h-[420px] overflow-y-auto">
            {activos.slice(0, 12).map((v: any) => (
              <div key={v.id} className="flex items-center justify-between px-3 py-2">
                <span className="text-sm">{v.marca} {v.modelo} {v.año}</span>
                <div className="flex items-center gap-2">
                  {v.dominio && <span className="text-xs text-muted-foreground">{v.dominio}</span>}
                  <Badge variant={estadoMeta(v.estado).variant}>{estadoMeta(v.estado).label}</Badge>
                </div>
              </div>
            ))}
            {activos.length === 0 && <p className="px-3 py-2.5 text-sm text-muted-foreground">Sin autos activos.</p>}
          </CardContent>
        </Card>

        <Card size="sm">
          <CardHeader className="border-b py-3">
            <CardTitle className="text-sm">Tareas urgentes ({urgentes.length})</CardTitle>
          </CardHeader>
          <CardContent className="divide-y divide-border p-0 max-h-[420px] overflow-y-auto">
            {urgentes.slice(0, 12).map((t: any) => (
              <div key={t.id} className="flex items-center justify-between px-3 py-2">
                <span className="text-sm">{t.titulo}</span>
                <span className="text-xs text-muted-foreground">{t.asignado}</span>
              </div>
            ))}
            {urgentes.length === 0 && <p className="px-3 py-2.5 text-sm text-muted-foreground">Sin tareas urgentes.</p>}
          </CardContent>
        </Card>
      </div>

      {ofertasPendientes.length > 0 && (
        <Card size="sm">
          <CardHeader className="border-b py-3">
            <CardTitle className="text-sm">Ofertas pendientes ({ofertasPendientes.length})</CardTitle>
          </CardHeader>
          <CardContent className="divide-y divide-border p-0">
            {ofertasPendientes.slice(0, 6).map((o: any) => (
              <div key={o.id} className="flex items-center justify-between px-3 py-2">
                <span className="text-sm truncate">{autoLabel(o.vehicle_id)}</span>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-sm text-muted-foreground tabular-nums">USD {Number(o.monto_ofrecido).toLocaleString('es-AR')}</span>
                  <Badge variant={o.email_enviado ? 'default' : 'outline'}>{o.email_enviado ? 'enviado' : 'pendiente'}</Badge>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
