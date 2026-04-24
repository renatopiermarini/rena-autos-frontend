import { getBalances, getTareas, getVehicles, getPrestamos, getOfertas, getVisitas } from '@/lib/kapso'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { AlertTriangleIcon } from 'lucide-react'

const ESTADO_VARIANT: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  en_stock: 'default',
  confirmado: 'secondary',
  vendido: 'outline',
  reservado: 'secondary',
  en_reparacion: 'destructive',
  a_ingresar: 'outline',
}

export default async function Inicio() {
  const [balances, tareas, vehicles, prestamos, ofertas, visitas] = await Promise.all([
    getBalances(), getTareas(), getVehicles(), getPrestamos(), getOfertas(), getVisitas(),
  ])

  const activos = vehicles.filter((v: any) => v.estado !== 'vendido' && v.estado !== 'potencial')
  const urgentes = tareas.filter((t: any) => t.prioridad === 'alta' && t.estado !== 'completada')
  const prestamosActivos = prestamos.filter((p: any) => p.estado === 'activo')
  const ofertasPendientes = ofertas.filter((o: any) => o.estado === 'pendiente')

  const hoy = new Date()
  const horizon48h = new Date(hoy.getTime() + 48 * 60 * 60 * 1000)
  const visitasProximas = visitas
    .filter((v: any) => {
      if (!v.fecha) return false
      if (v.resultado && v.resultado !== 'pendiente') return false
      const d = new Date(v.fecha)
      return d >= hoy && d <= horizon48h
    })
    .sort((a: any, b: any) => a.fecha.localeCompare(b.fecha))

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
  if (visitasProximas.length > 0) {
    alertas.push(`${visitasProximas.length} visita${visitasProximas.length === 1 ? '' : 's'} en las próximas 48h`)
  }

  function autoLabel(id: number) {
    const v = vehicles.find((v: any) => v.id === id)
    if (!v) return '—'
    const base = `${v.marca ?? ''} ${v.modelo ?? ''} ${v.año ?? ''}`.trim()
    return v.dominio ? `${base} (${v.dominio})` : base
  }

  function fmtVisitaDt(iso: string) {
    const d = new Date(iso)
    return d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' })
      + ' ' + d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
  }

  return (
    <div className="space-y-4">
      <div className="flex items-baseline justify-between">
        <h1 className="text-xl font-semibold">Inicio</h1>
        <p className="text-xs text-muted-foreground">
          {activos.length} autos activos · {ofertasPendientes.length} ofertas · {urgentes.length} tareas urgentes
        </p>
      </div>

      {alertas.length > 0 && (
        <Card className="border-destructive/30 bg-destructive/5 py-3">
          <CardContent className="space-y-1">
            <div className="flex items-center gap-2 text-destructive text-xs font-semibold uppercase tracking-wide mb-1">
              <AlertTriangleIcon className="size-4" /> Alertas
            </div>
            {alertas.map((a, i) => (
              <p key={i} className="text-sm text-destructive">{a}</p>
            ))}
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-6 gap-3">
        {balances.map((b: any) => (
          <Card key={b.id} size="sm">
            <CardContent>
              <p className="text-xs text-muted-foreground capitalize mb-1">{b.cuenta}</p>
              <p className="text-xl font-light tabular-nums">
                ${Number(b.saldo ?? 0).toLocaleString('es-AR')}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-4">
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
                  <Badge variant={ESTADO_VARIANT[v.estado] ?? 'outline'}>
                    {v.estado?.replace(/_/g, ' ')}
                  </Badge>
                </div>
              </div>
            ))}
            {activos.length === 0 && (
              <p className="px-3 py-2.5 text-sm text-muted-foreground">Sin autos activos.</p>
            )}
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
            {urgentes.length === 0 && (
              <p className="px-3 py-2.5 text-sm text-muted-foreground">Sin tareas urgentes.</p>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-2 gap-4">
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
                    <span className="text-sm text-muted-foreground tabular-nums">
                      USD {Number(o.monto_ofrecido).toLocaleString('es-AR')}
                    </span>
                    <Badge variant={o.email_enviado ? 'default' : 'outline'}>
                      {o.email_enviado ? 'enviado' : 'pendiente'}
                    </Badge>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {visitasProximas.length > 0 && (
          <Card size="sm">
            <CardHeader className="border-b py-3">
              <CardTitle className="text-sm">Visitas próximas 48h ({visitasProximas.length})</CardTitle>
            </CardHeader>
            <CardContent className="divide-y divide-border p-0">
              {visitasProximas.map((v: any) => (
                <div key={v.id} className="flex items-center justify-between px-3 py-2">
                  <span className="text-sm truncate">{autoLabel(v.vehicle_id)}</span>
                  <span className="text-xs text-muted-foreground tabular-nums shrink-0">
                    {fmtVisitaDt(v.fecha)}
                  </span>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
