'use client'
import { Fragment, useMemo, useState } from 'react'
import Link from 'next/link'
import { computeVehicleFinancials, computePrestamoStatus } from '@/lib/kapso'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { ChevronDownIcon, ChevronUpIcon, AlertTriangleIcon } from 'lucide-react'

type Tab = 'resumen' | 'prestamos' | 'por_vehiculo' | 'movimientos'

const TABS: { key: Tab; label: string }[] = [
  { key: 'resumen',      label: 'Resumen'      },
  { key: 'prestamos',    label: 'Préstamos'    },
  { key: 'por_vehiculo', label: 'Por Vehículo' },
  { key: 'movimientos',  label: 'Movimientos'  },
]

const CAT_LABEL: Record<string, string> = {
  commission:          'Comisión',
  vehicle_purchase:    'Compra auto',
  vehicle_expense:     'Gasto auto',
  general_expense:     'Gasto general',
  marketing:           'Marketing',
  loan:                'Préstamo',
  refund:              'Reembolso',
  down_payment:        'Seña',
  personal_withdrawal: 'Retiro personal',
  investments:         'Inversión',
  other:               'Otro',
  sin_categoria:       'Sin categoría',
}

const nativeSelectCls =
  'h-8 rounded-lg border border-input bg-transparent px-2.5 py-1 text-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50'

function fmt(n: any) {
  const v = Number(n ?? 0)
  return `$${v.toLocaleString('es-AR')}`
}
function fmtFecha(iso?: string) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit' })
}
function autoLabel(v: any) {
  if (!v) return '—'
  const base = `${v.marca ?? ''} ${v.modelo ?? ''} ${v.año ?? ''}`.trim()
  return v.dominio ? `${base} (${v.dominio})` : base
}

function TipoAmount({ tipo, monto, size = 'sm' }: { tipo: string; monto: any; size?: 'sm' | 'xs' }) {
  const cls = tipo === 'ingreso' ? 'text-emerald-600' : 'text-destructive'
  const sign = tipo === 'ingreso' ? '+' : '-'
  return (
    <span className={`${size === 'sm' ? 'text-sm' : 'text-xs'} font-medium ${cls} tabular-nums`}>
      {sign}{fmt(monto)}
    </span>
  )
}

export default function FinanzasClient({
  balances, movimientos, prestamos, clientes, vehicles,
}: {
  balances: any[]; movimientos: any[]; prestamos: any[]; clientes: any[]; vehicles: any[]
}) {
  const [tab, setTab] = useState<Tab>('resumen')

  const today = new Date()
  const total = balances.reduce((s, b) => s + Number(b.saldo ?? 0), 0)
  const clientesById = useMemo(
    () => Object.fromEntries(clientes.map((c: any) => [c.id, c])),
    [clientes],
  )
  const vehiclesById = useMemo(
    () => Object.fromEntries(vehicles.map((v: any) => [v.id, v])),
    [vehicles],
  )

  const prestamosPendientes = prestamos.filter((p: any) => p.estado !== 'pagado')
  const prestamosVencidos = prestamosPendientes.filter((p: any) => computePrestamoStatus(p, today).vencido)

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Finanzas</h1>

      <Tabs value={tab} onValueChange={(v: any) => setTab(v as Tab)}>
        <TabsList variant="line">
          {TABS.map(({ key, label }) => (
            <TabsTrigger key={key} value={key}>{label}</TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="resumen" className="mt-4">
          <ResumenTab
            balances={balances}
            total={total}
            movimientos={movimientos}
            prestamosVencidos={prestamosVencidos}
            clientesById={clientesById}
            vehiclesById={vehiclesById}
          />
        </TabsContent>
        <TabsContent value="prestamos" className="mt-4">
          <PrestamosTab
            prestamos={prestamos}
            clientesById={clientesById}
            vehiclesById={vehiclesById}
            today={today}
          />
        </TabsContent>
        <TabsContent value="por_vehiculo" className="mt-4">
          <PorVehiculoTab
            vehicles={vehicles}
            movimientos={movimientos}
            prestamos={prestamos}
            clientesById={clientesById}
          />
        </TabsContent>
        <TabsContent value="movimientos" className="mt-4">
          <MovimientosTab
            movimientos={movimientos}
            vehiclesById={vehiclesById}
          />
        </TabsContent>
      </Tabs>
    </div>
  )
}

// ── Tab 1 · Resumen ───────────────────────────────────────────────────────────

function ResumenTab({
  balances, total, movimientos, prestamosVencidos, clientesById, vehiclesById,
}: {
  balances: any[]; total: number; movimientos: any[];
  prestamosVencidos: any[]; clientesById: any; vehiclesById: any
}) {
  const movRecientes = [...movimientos]
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 20)

  const cashBajo = balances.find((b: any) => b.cuenta === 'cash' && Number(b.saldo) < 500)
  const alertas: string[] = []
  if (cashBajo) alertas.push(`Cash bajo: $${cashBajo.saldo}`)
  for (const p of prestamosVencidos) {
    const acr = clientesById[p.acreedor_id]?.nombre ?? '?'
    const dias = Math.abs(Math.ceil((new Date(p.fecha_vencimiento).getTime() - Date.now()) / 86400000))
    alertas.push(`Préstamo de ${acr} vencido hace ${dias}d`)
  }

  return (
    <div className="space-y-4">
      {/* Cuentas */}
      <div className="grid grid-cols-6 gap-3">
        {balances.map((b: any) => (
          <Card key={b.id} size="sm">
            <CardContent>
              <p className="text-xs text-muted-foreground capitalize mb-1">{b.cuenta}</p>
              <p className="text-xl font-light tabular-nums">{fmt(b.saldo)}</p>
            </CardContent>
          </Card>
        ))}
        <Card size="sm" className="bg-muted/40">
          <CardContent>
            <p className="text-xs text-muted-foreground mb-1">Total</p>
            <p className="text-xl font-semibold tabular-nums">{fmt(total)}</p>
          </CardContent>
        </Card>
      </div>

      {/* Alertas */}
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

      {/* Últimos movimientos */}
      <Card size="sm">
        <CardHeader className="border-b py-3">
          <CardTitle className="text-sm">Últimos movimientos</CardTitle>
        </CardHeader>
        <CardContent className="divide-y divide-border p-0 max-h-[500px] overflow-y-auto">
          {movRecientes.map((m: any) => {
            const veh = m.vehicle_id ? vehiclesById[m.vehicle_id] : null
            return (
              <div key={m.id} className="flex items-center justify-between px-3 py-2">
                <div className="flex items-center gap-3 min-w-0">
                  <Badge variant={m.tipo === 'ingreso' ? 'default' : 'outline'} className="w-16 justify-center">
                    {m.tipo}
                  </Badge>
                  <span className="text-sm truncate">{m.nota || CAT_LABEL[m.categoria] || m.categoria}</span>
                  <span className="text-xs text-muted-foreground capitalize whitespace-nowrap">{m.cuenta}</span>
                  {veh && (
                    <span className="text-xs text-muted-foreground whitespace-nowrap">· {veh.marca} {veh.modelo}</span>
                  )}
                </div>
                <div className="flex items-center gap-4 shrink-0">
                  <TipoAmount tipo={m.tipo} monto={m.monto} />
                  <span className="text-xs text-muted-foreground tabular-nums">{fmtFecha(m.created_at)}</span>
                </div>
              </div>
            )
          })}
          {movRecientes.length === 0 && (
            <p className="px-3 py-2.5 text-sm text-muted-foreground">Sin movimientos registrados.</p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

// ── Tab 2 · Préstamos ─────────────────────────────────────────────────────────

function PrestamosTab({
  prestamos, clientesById, vehiclesById, today,
}: { prestamos: any[]; clientesById: any; vehiclesById: any; today: Date }) {
  const pendientes = prestamos.filter((p: any) => p.estado !== 'pagado')
  const pagados = prestamos.filter((p: any) => p.estado === 'pagado')

  const deudaTotal = pendientes.reduce((s, p) => s + computePrestamoStatus(p, today).saldo_pendiente, 0)
  const acreedoresUnicos = new Set(pendientes.map((p: any) => p.acreedor_id)).size

  return (
    <div className="space-y-4">
      <Card size="sm" className="bg-muted/40">
        <CardContent>
          <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Deuda si pagás hoy</p>
          <p className="text-2xl font-semibold tabular-nums">{fmt(deudaTotal)}</p>
          <p className="text-xs text-muted-foreground mt-1">
            {pendientes.length} préstamo{pendientes.length === 1 ? '' : 's'} pendiente{pendientes.length === 1 ? '' : 's'} · {acreedoresUnicos} acreedor{acreedoresUnicos === 1 ? '' : 'es'} · capital + interés devengado al día
          </p>
        </CardContent>
      </Card>

      <Card size="sm">
        <CardHeader className="border-b py-3">
          <CardTitle className="text-sm">Pendientes ({pendientes.length})</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <PrestamosTable
            prestamos={pendientes}
            clientesById={clientesById}
            vehiclesById={vehiclesById}
            today={today}
          />
        </CardContent>
      </Card>

      {pagados.length > 0 && (
        <Card size="sm">
          <CardHeader className="border-b py-3">
            <CardTitle className="text-sm">Pagados ({pagados.length})</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <PrestamosTable
              prestamos={pagados}
              clientesById={clientesById}
              vehiclesById={vehiclesById}
              today={today}
            />
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function PrestamosTable({
  prestamos, clientesById, vehiclesById, today,
}: { prestamos: any[]; clientesById: any; vehiclesById: any; today: Date }) {
  if (prestamos.length === 0) {
    return <p className="py-6 text-center text-sm text-muted-foreground">Sin préstamos.</p>
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-muted/40">
          <tr className="text-left">
            <th className="px-3 py-2 font-medium text-muted-foreground text-xs">Acreedor</th>
            <th className="px-3 py-2 font-medium text-muted-foreground text-xs text-right">Capital</th>
            <th className="px-3 py-2 font-medium text-muted-foreground text-xs text-right">Tasa</th>
            <th className="px-3 py-2 font-medium text-muted-foreground text-xs text-right">Días</th>
            <th className="px-3 py-2 font-medium text-muted-foreground text-xs text-right">Interés acum.</th>
            <th className="px-3 py-2 font-medium text-muted-foreground text-xs text-right">Pagado</th>
            <th className="px-3 py-2 font-medium text-muted-foreground text-xs text-right" title="Capital + interés devengado hasta hoy − pagado">Saldo hoy</th>
            <th className="px-3 py-2 font-medium text-muted-foreground text-xs">Vencimiento</th>
            <th className="px-3 py-2 font-medium text-muted-foreground text-xs">Destino</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {prestamos.map((p: any) => {
            const st = computePrestamoStatus(p, today)
            const acr = clientesById[p.acreedor_id]?.nombre ?? '?'
            const veh = p.vehicle_id ? vehiclesById[p.vehicle_id] : null
            const vencClass = st.vencido ? 'text-destructive font-medium'
              : st.proximo ? 'text-amber-600'
              : 'text-muted-foreground'
            const vencLabel = st.dias_vencimiento == null ? '—'
              : st.vencido ? `vencido hace ${Math.abs(st.dias_vencimiento)}d`
              : st.proximo ? `en ${st.dias_vencimiento}d`
              : fmtFecha(p.fecha_vencimiento)
            return (
              <tr key={p.id}>
                <td className="px-3 py-2.5 font-medium">{acr}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{fmt(st.capital)}</td>
                <td className="px-3 py-2.5 text-right text-muted-foreground text-xs">{st.tasa_anual_pct}%/año</td>
                <td className="px-3 py-2.5 text-right text-muted-foreground text-xs">{st.dias_transcurridos}d</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{fmt(st.interes_acumulado)}</td>
                <td className="px-3 py-2.5 text-right text-muted-foreground tabular-nums">{fmt(p.monto_pagado ?? 0)}</td>
                <td className="px-3 py-2.5 text-right font-medium tabular-nums">{fmt(st.saldo_pendiente)}</td>
                <td className={`px-3 py-2.5 text-xs ${vencClass}`}>{vencLabel}</td>
                <td className="px-3 py-2.5">
                  {veh ? (
                    <Link href="/stock" className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2">
                      {autoLabel(veh)}
                    </Link>
                  ) : (
                    <span className="text-xs text-muted-foreground">capital general</span>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ── Tab 3 · Por Vehículo ──────────────────────────────────────────────────────

function PorVehiculoTab({
  vehicles, movimientos, prestamos, clientesById,
}: { vehicles: any[]; movimientos: any[]; prestamos: any[]; clientesById: any }) {
  const activos = vehicles.filter((v: any) => v.estado !== 'vendido' && v.estado !== 'potencial')
  const filas = activos.map((v: any) => {
    const f = computeVehicleFinancials(v.id, vehicles, movimientos, prestamos)
    return { v, f }
  }).sort((a, b) => b.f.costo_total - a.f.costo_total)

  const [openId, setOpenId] = useState<number | null>(null)

  return (
    <Card size="sm">
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40">
              <tr className="text-left">
                <th className="px-3 py-2 font-medium text-muted-foreground text-xs">Auto</th>
                <th className="px-3 py-2 font-medium text-muted-foreground text-xs">Tipo</th>
                <th className="px-3 py-2 font-medium text-muted-foreground text-xs text-right">P. compra</th>
                <th className="px-3 py-2 font-medium text-muted-foreground text-xs text-right">Gastos</th>
                <th className="px-3 py-2 font-medium text-muted-foreground text-xs text-right">Costo total</th>
                <th className="px-3 py-2 font-medium text-muted-foreground text-xs text-right">Publicado</th>
                <th className="px-3 py-2 font-medium text-muted-foreground text-xs text-right">Margen</th>
                <th className="px-3 py-2 font-medium text-muted-foreground text-xs">Préstamo</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filas.map(({ v, f }) => {
                const isOpen = openId === v.id
                return (
                  <Fragment key={v.id}>
                    <tr
                      onClick={() => setOpenId(isOpen ? null : v.id)}
                      className={`cursor-pointer transition-colors ${isOpen ? 'bg-muted/30' : 'hover:bg-muted/30'}`}
                    >
                      <td className="px-3 py-2.5">
                        {isOpen
                          ? <ChevronUpIcon className="inline size-3 text-muted-foreground mr-1.5" />
                          : <ChevronDownIcon className="inline size-3 text-muted-foreground mr-1.5" />}
                        <span className="font-medium">{v.marca} {v.modelo}</span>
                        <span className="text-muted-foreground text-xs ml-1">{v.año}</span>
                        {v.dominio && <span className="text-xs text-muted-foreground ml-1">· {v.dominio}</span>}
                      </td>
                      <td className="px-3 py-2.5 text-xs text-muted-foreground">{v.tipo_operacion ?? '—'}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{fmt(f.precio_compra)}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{fmt(f.gastos_total)}</td>
                      <td className="px-3 py-2.5 text-right font-medium tabular-nums">{fmt(f.costo_total)}</td>
                      <td className="px-3 py-2.5 text-right text-muted-foreground tabular-nums">
                        {f.precio_publicado != null ? fmt(f.precio_publicado) : '—'}
                      </td>
                      <td className={`px-3 py-2.5 text-right font-medium tabular-nums ${
                        f.es_consignacion ? 'text-muted-foreground text-xs'
                        : f.margen_esperado == null ? 'text-muted-foreground'
                        : f.margen_esperado >= 0 ? 'text-emerald-600' : 'text-destructive'
                      }`}>
                        {f.es_consignacion ? 'consignación'
                          : f.margen_esperado == null ? '—'
                          : (f.margen_esperado >= 0 ? '+' : '') + fmt(f.margen_esperado)}
                      </td>
                      <td className="px-3 py-2.5 text-xs">
                        {f.prestamos_asociados.length > 0 ? (
                          <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">
                            {clientesById[f.prestamos_asociados[0].acreedor_id]?.nombre ?? 'sí'}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground/60">—</span>
                        )}
                      </td>
                    </tr>
                    {isOpen && (
                      <tr>
                        <td colSpan={8} className="px-3 pb-4 pt-0 bg-muted/30 border-b">
                          <VehicleFinancialDetail
                            v={v}
                            f={f}
                            movimientos={movimientos}
                            clientesById={clientesById}
                          />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
              {filas.length === 0 && (
                <tr><td colSpan={8} className="px-3 py-6 text-center text-sm text-muted-foreground">Sin vehículos activos.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  )
}

function VehicleFinancialDetail({
  v, f, movimientos, clientesById,
}: { v: any; f: ReturnType<typeof computeVehicleFinancials>; movimientos: any[]; clientesById: any }) {
  const movsAuto = movimientos
    .filter((m: any) => m.vehicle_id === v.id)
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

  const catEntries = Object.entries(f.gastos_por_categoria).sort((a, b) => b[1] - a[1])

  return (
    <div className="pt-3 grid grid-cols-1 xl:grid-cols-3 gap-4">
      <div>
        <p className="text-xs text-muted-foreground uppercase tracking-wide mb-2">Desglose de gastos</p>
        {catEntries.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sin gastos registrados.</p>
        ) : (
          <div className="border rounded-lg divide-y divide-border bg-background">
            {catEntries.map(([cat, monto]) => (
              <div key={cat} className="flex items-center justify-between px-3 py-2">
                <span className="text-sm">{CAT_LABEL[cat] ?? cat}</span>
                <span className="text-sm text-muted-foreground tabular-nums">{fmt(monto)}</span>
              </div>
            ))}
            <div className="flex items-center justify-between px-3 py-2 bg-muted/40 font-medium">
              <span className="text-sm">Total gastos</span>
              <span className="text-sm tabular-nums">{fmt(f.gastos_total)}</span>
            </div>
          </div>
        )}
      </div>
      {f.prestamos_asociados.length > 0 && (
        <div>
          <p className="text-xs text-muted-foreground uppercase tracking-wide mb-2">Préstamos financiando este auto</p>
          <div className="border rounded-lg divide-y divide-border bg-background">
            {f.prestamos_asociados.map((p: any) => {
              const st = computePrestamoStatus(p)
              const acr = clientesById[p.acreedor_id]?.nombre ?? '?'
              return (
                <div key={p.id} className="flex items-center justify-between px-3 py-2">
                  <span className="text-sm">{acr}</span>
                  <div className="flex items-center gap-3 text-xs">
                    <span className="text-muted-foreground">saldo {fmt(st.saldo_pendiente)} ({st.dias_transcurridos}d · {st.tasa_anual_pct}%)</span>
                    <span className={st.vencido ? 'text-destructive' : st.proximo ? 'text-amber-600' : 'text-muted-foreground'}>
                      {st.dias_vencimiento == null ? '—'
                        : st.vencido ? `vencido ${Math.abs(st.dias_vencimiento)}d`
                        : `${st.dias_vencimiento}d`}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
      <div>
        <p className="text-xs text-muted-foreground uppercase tracking-wide mb-2">Movimientos del auto ({movsAuto.length})</p>
        {movsAuto.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sin movimientos vinculados.</p>
        ) : (
          <div className="border rounded-lg divide-y divide-border bg-background max-h-80 overflow-y-auto">
            {movsAuto.map((m: any) => (
              <div key={m.id} className="flex items-center justify-between px-3 py-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className={`text-xs ${m.tipo === 'ingreso' ? 'text-emerald-600' : 'text-destructive'}`}>{m.tipo}</span>
                  <span className="text-sm truncate">{m.nota || CAT_LABEL[m.categoria] || m.categoria}</span>
                </div>
                <div className="flex items-center gap-2 text-xs whitespace-nowrap shrink-0">
                  <TipoAmount tipo={m.tipo} monto={m.monto} size="xs" />
                  <span className="text-muted-foreground tabular-nums">{fmtFecha(m.created_at)}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Tab 4 · Movimientos (con filtros) ─────────────────────────────────────────

function MovimientosTab({
  movimientos, vehiclesById,
}: { movimientos: any[]; vehiclesById: any }) {
  const [cats, setCats]         = useState<Set<string>>(new Set())
  const [cuenta, setCuenta]     = useState<string>('')
  const [tipo, setTipo]         = useState<string>('')
  const [vehId, setVehId]       = useState<string>('')
  const [desde, setDesde]       = useState<string>('')
  const [hasta, setHasta]       = useState<string>('')

  const categoriasDisponibles = useMemo(() => {
    const s = new Set<string>()
    for (const m of movimientos) if (m.categoria) s.add(m.categoria)
    return Array.from(s).sort()
  }, [movimientos])

  const vehiclesConMovs = useMemo(() => {
    const ids = new Set<number>()
    for (const m of movimientos) if (m.vehicle_id) ids.add(m.vehicle_id)
    return Array.from(ids)
      .map(id => vehiclesById[id])
      .filter(Boolean)
      .sort((a, b) => (a.marca ?? '').localeCompare(b.marca ?? ''))
  }, [movimientos, vehiclesById])

  const filtered = movimientos.filter((m: any) => {
    if (cats.size > 0 && !cats.has(m.categoria)) return false
    if (cuenta && m.cuenta !== cuenta) return false
    if (tipo && m.tipo !== tipo) return false
    if (vehId && String(m.vehicle_id ?? '') !== vehId) return false
    if (desde && m.created_at < desde) return false
    if (hasta && m.created_at > hasta + 'T23:59:59') return false
    return true
  }).sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

  const totalIngresos = filtered.filter(m => m.tipo === 'ingreso').reduce((s, m) => s + Number(m.monto ?? 0), 0)
  const totalEgresos  = filtered.filter(m => m.tipo === 'egreso').reduce((s, m) => s + Number(m.monto ?? 0), 0)

  function toggleCat(c: string) {
    setCats(prev => {
      const next = new Set(prev)
      next.has(c) ? next.delete(c) : next.add(c)
      return next
    })
  }

  const hasFilters = cats.size || cuenta || tipo || vehId || desde || hasta

  return (
    <div className="space-y-4">
      <Card size="sm">
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-1.5 items-center">
            <span className="text-xs text-muted-foreground mr-1">Categoría:</span>
            {categoriasDisponibles.map(c => (
              <Button
                key={c}
                size="xs"
                variant={cats.has(c) ? 'default' : 'outline'}
                onClick={() => toggleCat(c)}
              >
                {CAT_LABEL[c] ?? c}
              </Button>
            ))}
          </div>
          <div className="flex flex-wrap gap-2 items-center">
            <select className={nativeSelectCls} value={tipo} onChange={e => setTipo(e.target.value)}>
              <option value="">Tipo: todos</option>
              <option value="ingreso">Ingreso</option>
              <option value="egreso">Egreso</option>
            </select>
            <select className={nativeSelectCls} value={cuenta} onChange={e => setCuenta(e.target.value)}>
              <option value="">Cuenta: todas</option>
              <option value="cash">Cash</option>
              <option value="nexo">Nexo</option>
              <option value="fiwind">Fiwind</option>
            </select>
            <select className={nativeSelectCls} value={vehId} onChange={e => setVehId(e.target.value)}>
              <option value="">Auto: todos</option>
              {vehiclesConMovs.map((v: any) => (
                <option key={v.id} value={v.id}>{autoLabel(v)}</option>
              ))}
            </select>
            <Input type="date" className="h-8 w-auto text-xs" value={desde} onChange={e => setDesde(e.target.value)} />
            <Input type="date" className="h-8 w-auto text-xs" value={hasta} onChange={e => setHasta(e.target.value)} />
            {hasFilters ? (
              <Button
                size="xs"
                variant="ghost"
                onClick={() => { setCats(new Set()); setCuenta(''); setTipo(''); setVehId(''); setDesde(''); setHasta('') }}
              >
                Limpiar
              </Button>
            ) : null}
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center gap-6 text-sm px-1">
        <span className="text-muted-foreground">{filtered.length} movimiento{filtered.length === 1 ? '' : 's'}</span>
        <span className="text-emerald-600 tabular-nums">+{fmt(totalIngresos)}</span>
        <span className="text-destructive tabular-nums">-{fmt(totalEgresos)}</span>
        <span className="text-foreground font-medium tabular-nums">
          Neto: {totalIngresos - totalEgresos >= 0 ? '+' : ''}{fmt(totalIngresos - totalEgresos)}
        </span>
      </div>

      <Card size="sm">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40">
                <tr className="text-left">
                  <th className="px-3 py-2 font-medium text-muted-foreground text-xs">Fecha</th>
                  <th className="px-3 py-2 font-medium text-muted-foreground text-xs">Tipo</th>
                  <th className="px-3 py-2 font-medium text-muted-foreground text-xs">Categoría</th>
                  <th className="px-3 py-2 font-medium text-muted-foreground text-xs">Cuenta</th>
                  <th className="px-3 py-2 font-medium text-muted-foreground text-xs">Auto</th>
                  <th className="px-3 py-2 font-medium text-muted-foreground text-xs">Nota</th>
                  <th className="px-3 py-2 font-medium text-muted-foreground text-xs text-right">Monto</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map((m: any) => {
                  const veh = m.vehicle_id ? vehiclesById[m.vehicle_id] : null
                  return (
                    <tr key={m.id}>
                      <td className="px-3 py-2 text-xs text-muted-foreground whitespace-nowrap tabular-nums">{fmtFecha(m.created_at)}</td>
                      <td className={`px-3 py-2 text-xs ${m.tipo === 'ingreso' ? 'text-emerald-600' : 'text-destructive'}`}>{m.tipo}</td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">{CAT_LABEL[m.categoria] ?? m.categoria}</td>
                      <td className="px-3 py-2 text-xs text-muted-foreground capitalize">{m.cuenta}</td>
                      <td className="px-3 py-2 text-xs">
                        {veh ? `${veh.marca} ${veh.modelo}` : <span className="text-muted-foreground/60">—</span>}
                      </td>
                      <td className="px-3 py-2 text-sm truncate max-w-xs">{m.nota || ''}</td>
                      <td className={`px-3 py-2 text-sm font-medium text-right whitespace-nowrap tabular-nums ${m.tipo === 'ingreso' ? 'text-emerald-600' : 'text-destructive'}`}>
                        {m.tipo === 'ingreso' ? '+' : '-'}{fmt(m.monto)}
                      </td>
                    </tr>
                  )
                })}
                {filtered.length === 0 && (
                  <tr><td colSpan={7} className="px-3 py-6 text-center text-sm text-muted-foreground">Sin movimientos para este filtro.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
