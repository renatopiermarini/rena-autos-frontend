'use client'
import { Fragment, useMemo, useState } from 'react'
import Link from 'next/link'
import { computeVehicleFinancials, computePrestamoStatus } from '@/lib/kapso'

type Tab = 'resumen' | 'prestamos' | 'por_vehiculo' | 'movimientos'

const TABS: { key: Tab; label: string }[] = [
  { key: 'resumen',      label: 'Resumen'      },
  { key: 'prestamos',    label: 'Préstamos'    },
  { key: 'por_vehiculo', label: 'Por Vehículo' },
  { key: 'movimientos',  label: 'Movimientos'  },
]

const TIPO_COLOR: Record<string, string> = {
  ingreso: 'text-green-600',
  egreso:  'text-red-500',
}

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
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Finanzas</h1>

      {/* Tabs */}
      <div className="flex items-center gap-1.5 border-b border-gray-200">
        {TABS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`text-sm px-4 py-2 -mb-px border-b-2 transition-colors ${
              tab === key
                ? 'border-gray-900 text-gray-900 font-medium'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'resumen' && (
        <ResumenTab
          balances={balances}
          total={total}
          movimientos={movimientos}
          prestamosVencidos={prestamosVencidos}
          clientesById={clientesById}
          vehiclesById={vehiclesById}
        />
      )}
      {tab === 'prestamos' && (
        <PrestamosTab
          prestamos={prestamos}
          clientesById={clientesById}
          vehiclesById={vehiclesById}
          today={today}
        />
      )}
      {tab === 'por_vehiculo' && (
        <PorVehiculoTab
          vehicles={vehicles}
          movimientos={movimientos}
          prestamos={prestamos}
          clientesById={clientesById}
        />
      )}
      {tab === 'movimientos' && (
        <MovimientosTab
          movimientos={movimientos}
          vehiclesById={vehiclesById}
        />
      )}
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
    .slice(0, 15)

  const cashBajo = balances.find((b: any) => b.cuenta === 'cash' && Number(b.saldo) < 500)
  const alertas: string[] = []
  if (cashBajo) alertas.push(`Cash bajo: $${cashBajo.saldo}`)
  for (const p of prestamosVencidos) {
    const acr = clientesById[p.acreedor_id]?.nombre ?? '?'
    const dias = Math.abs(Math.ceil((new Date(p.fecha_vencimiento).getTime() - Date.now()) / 86400000))
    alertas.push(`Préstamo de ${acr} vencido hace ${dias}d`)
  }

  return (
    <div className="space-y-8">
      {/* Cuentas */}
      <section>
        <p className="text-xs text-gray-400 uppercase tracking-wide mb-3">Cuentas</p>
        <div className="grid grid-cols-4 gap-4">
          {balances.map((b: any) => (
            <div key={b.id} className="border border-gray-200 rounded p-4">
              <p className="text-xs text-gray-500 capitalize mb-1">{b.cuenta}</p>
              <p className="text-xl font-light">{fmt(b.saldo)}</p>
            </div>
          ))}
          <div className="border border-gray-200 rounded p-4 bg-gray-50">
            <p className="text-xs text-gray-500 mb-1">Total</p>
            <p className="text-xl font-semibold">{fmt(total)}</p>
          </div>
        </div>
      </section>

      {/* Alertas */}
      {alertas.length > 0 && (
        <section className="border border-red-200 bg-red-50 rounded p-4 space-y-1">
          <p className="text-xs font-semibold text-red-700 uppercase tracking-wide mb-2">Alertas</p>
          {alertas.map((a, i) => <p key={i} className="text-sm text-red-700">⚠ {a}</p>)}
        </section>
      )}

      {/* Últimos movimientos */}
      <section>
        <p className="text-xs text-gray-400 uppercase tracking-wide mb-3">Últimos movimientos</p>
        <div className="divide-y divide-gray-100 border border-gray-200 rounded">
          {movRecientes.map((m: any) => {
            const veh = m.vehicle_id ? vehiclesById[m.vehicle_id] : null
            return (
              <div key={m.id} className="flex items-center justify-between px-4 py-3">
                <div className="flex items-center gap-3 min-w-0">
                  <span className={`text-xs font-medium w-12 ${TIPO_COLOR[m.tipo] ?? ''}`}>{m.tipo}</span>
                  <span className="text-sm truncate">{m.nota || CAT_LABEL[m.categoria] || m.categoria}</span>
                  <span className="text-xs text-gray-400 capitalize whitespace-nowrap">{m.cuenta}</span>
                  {veh && (
                    <span className="text-xs text-gray-400 whitespace-nowrap">· {veh.marca} {veh.modelo}</span>
                  )}
                </div>
                <div className="flex items-center gap-4">
                  <span className={`text-sm font-medium ${TIPO_COLOR[m.tipo] ?? ''}`}>
                    {m.tipo === 'ingreso' ? '+' : '-'}{fmt(m.monto)}
                  </span>
                  <span className="text-xs text-gray-400">{fmtFecha(m.created_at)}</span>
                </div>
              </div>
            )
          })}
          {movRecientes.length === 0 && (
            <p className="px-4 py-3 text-sm text-gray-400">Sin movimientos registrados.</p>
          )}
        </div>
      </section>
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
    <div className="space-y-8">
      <section className="border border-gray-200 rounded p-4 bg-gray-50">
        <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Deuda si pagás hoy</p>
        <p className="text-2xl font-semibold">{fmt(deudaTotal)}</p>
        <p className="text-xs text-gray-400 mt-1">
          {pendientes.length} préstamo{pendientes.length === 1 ? '' : 's'} pendiente{pendientes.length === 1 ? '' : 's'} · {acreedoresUnicos} acreedor{acreedoresUnicos === 1 ? '' : 'es'} · capital + interés devengado al día
        </p>
      </section>

      <section>
        <p className="text-xs text-gray-400 uppercase tracking-wide mb-3">Pendientes ({pendientes.length})</p>
        <PrestamosTable
          prestamos={pendientes}
          clientesById={clientesById}
          vehiclesById={vehiclesById}
          today={today}
        />
      </section>

      {pagados.length > 0 && (
        <section>
          <p className="text-xs text-gray-400 uppercase tracking-wide mb-3">Pagados ({pagados.length})</p>
          <PrestamosTable
            prestamos={pagados}
            clientesById={clientesById}
            vehiclesById={vehiclesById}
            today={today}
          />
        </section>
      )}
    </div>
  )
}

function PrestamosTable({
  prestamos, clientesById, vehiclesById, today,
}: { prestamos: any[]; clientesById: any; vehiclesById: any; today: Date }) {
  if (prestamos.length === 0) {
    return <p className="py-6 text-center text-sm text-gray-400">Sin préstamos.</p>
  }
  return (
    <div className="overflow-x-auto border border-gray-200 rounded">
      <table className="w-full text-sm">
        <thead className="bg-gray-50">
          <tr className="text-left">
            <th className="px-4 py-2 font-medium text-gray-500 text-xs">Acreedor</th>
            <th className="px-4 py-2 font-medium text-gray-500 text-xs text-right">Capital</th>
            <th className="px-4 py-2 font-medium text-gray-500 text-xs text-right">Tasa</th>
            <th className="px-4 py-2 font-medium text-gray-500 text-xs text-right">Días</th>
            <th className="px-4 py-2 font-medium text-gray-500 text-xs text-right">Interés acum.</th>
            <th className="px-4 py-2 font-medium text-gray-500 text-xs text-right">Pagado</th>
            <th className="px-4 py-2 font-medium text-gray-500 text-xs text-right" title="Capital + interés devengado hasta hoy − pagado">Saldo hoy</th>
            <th className="px-4 py-2 font-medium text-gray-500 text-xs">Vencimiento</th>
            <th className="px-4 py-2 font-medium text-gray-500 text-xs">Destino</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {prestamos.map((p: any) => {
            const st = computePrestamoStatus(p, today)
            const acr = clientesById[p.acreedor_id]?.nombre ?? '?'
            const veh = p.vehicle_id ? vehiclesById[p.vehicle_id] : null
            const vencClass = st.vencido ? 'text-red-600 font-medium'
              : st.proximo ? 'text-amber-600'
              : 'text-gray-500'
            const vencLabel = st.dias_vencimiento == null ? '—'
              : st.vencido ? `vencido hace ${Math.abs(st.dias_vencimiento)}d`
              : st.proximo ? `en ${st.dias_vencimiento}d`
              : fmtFecha(p.fecha_vencimiento)
            return (
              <tr key={p.id}>
                <td className="px-4 py-3 font-medium">{acr}</td>
                <td className="px-4 py-3 text-right text-gray-600">{fmt(st.capital)}</td>
                <td className="px-4 py-3 text-right text-gray-500 text-xs">{st.tasa_anual_pct}%/año</td>
                <td className="px-4 py-3 text-right text-gray-500 text-xs">{st.dias_transcurridos}d</td>
                <td className="px-4 py-3 text-right text-gray-600">{fmt(st.interes_acumulado)}</td>
                <td className="px-4 py-3 text-right text-gray-500">{fmt(p.monto_pagado ?? 0)}</td>
                <td className="px-4 py-3 text-right font-medium">{fmt(st.saldo_pendiente)}</td>
                <td className={`px-4 py-3 text-xs ${vencClass}`}>{vencLabel}</td>
                <td className="px-4 py-3">
                  {veh ? (
                    <Link href="/stock" className="text-xs text-gray-600 hover:text-gray-900 underline underline-offset-2">
                      {autoLabel(veh)}
                    </Link>
                  ) : (
                    <span className="text-xs text-gray-400">capital general</span>
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
    <div className="overflow-x-auto border border-gray-200 rounded">
      <table className="w-full text-sm">
        <thead className="bg-gray-50">
          <tr className="text-left">
            <th className="px-4 py-2 font-medium text-gray-500 text-xs">Auto</th>
            <th className="px-4 py-2 font-medium text-gray-500 text-xs">Tipo</th>
            <th className="px-4 py-2 font-medium text-gray-500 text-xs text-right">P. compra</th>
            <th className="px-4 py-2 font-medium text-gray-500 text-xs text-right">Gastos</th>
            <th className="px-4 py-2 font-medium text-gray-500 text-xs text-right">Costo total</th>
            <th className="px-4 py-2 font-medium text-gray-500 text-xs text-right">Publicado</th>
            <th className="px-4 py-2 font-medium text-gray-500 text-xs text-right">Margen</th>
            <th className="px-4 py-2 font-medium text-gray-500 text-xs">Préstamo</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {filas.map(({ v, f }) => {
            const isOpen = openId === v.id
            return (
              <Fragment key={v.id}>
                <tr
                  onClick={() => setOpenId(isOpen ? null : v.id)}
                  className={`cursor-pointer transition-colors ${isOpen ? 'bg-gray-50' : 'hover:bg-gray-50'}`}
                >
                  <td className="px-4 py-3">
                    <span className="text-gray-400 text-xs mr-1.5">{isOpen ? '▲' : '▼'}</span>
                    <span className="font-medium">{v.marca} {v.modelo}</span>
                    <span className="text-gray-400 text-xs ml-1">{v.año}</span>
                    {v.dominio && <span className="text-xs text-gray-400 ml-1">· {v.dominio}</span>}
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500">{v.tipo_operacion ?? '—'}</td>
                  <td className="px-4 py-3 text-right text-gray-600">{fmt(f.precio_compra)}</td>
                  <td className="px-4 py-3 text-right text-gray-600">{fmt(f.gastos_total)}</td>
                  <td className="px-4 py-3 text-right font-medium">{fmt(f.costo_total)}</td>
                  <td className="px-4 py-3 text-right text-gray-500">
                    {f.precio_publicado != null ? fmt(f.precio_publicado) : '—'}
                  </td>
                  <td className={`px-4 py-3 text-right font-medium ${
                    f.es_consignacion ? 'text-gray-400 text-xs'
                    : f.margen_esperado == null ? 'text-gray-400'
                    : f.margen_esperado >= 0 ? 'text-green-700' : 'text-red-600'
                  }`}>
                    {f.es_consignacion ? 'consignación'
                      : f.margen_esperado == null ? '—'
                      : (f.margen_esperado >= 0 ? '+' : '') + fmt(f.margen_esperado)}
                  </td>
                  <td className="px-4 py-3 text-xs">
                    {f.prestamos_asociados.length > 0 ? (
                      <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">
                        {clientesById[f.prestamos_asociados[0].acreedor_id]?.nombre ?? 'sí'}
                      </span>
                    ) : (
                      <span className="text-gray-300">—</span>
                    )}
                  </td>
                </tr>
                {isOpen && (
                  <tr>
                    <td colSpan={8} className="px-4 pb-4 pt-0 bg-gray-50 border-b border-gray-200">
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
            <tr><td colSpan={8} className="px-4 py-6 text-center text-sm text-gray-400">Sin vehículos activos.</td></tr>
          )}
        </tbody>
      </table>
    </div>
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
    <div className="pt-3 grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div>
        <p className="text-xs text-gray-400 uppercase tracking-wide mb-2">Desglose de gastos</p>
        {catEntries.length === 0 ? (
          <p className="text-sm text-gray-400">Sin gastos registrados.</p>
        ) : (
          <div className="border border-gray-200 rounded divide-y divide-gray-100 bg-white">
            {catEntries.map(([cat, monto]) => (
              <div key={cat} className="flex items-center justify-between px-3 py-2">
                <span className="text-sm">{CAT_LABEL[cat] ?? cat}</span>
                <span className="text-sm text-gray-600">{fmt(monto)}</span>
              </div>
            ))}
            <div className="flex items-center justify-between px-3 py-2 bg-gray-50 font-medium">
              <span className="text-sm">Total gastos</span>
              <span className="text-sm">{fmt(f.gastos_total)}</span>
            </div>
          </div>
        )}
        {f.prestamos_asociados.length > 0 && (
          <>
            <p className="text-xs text-gray-400 uppercase tracking-wide mt-4 mb-2">Préstamos financiando este auto</p>
            <div className="border border-gray-200 rounded divide-y divide-gray-100 bg-white">
              {f.prestamos_asociados.map((p: any) => {
                const st = computePrestamoStatus(p)
                const acr = clientesById[p.acreedor_id]?.nombre ?? '?'
                return (
                  <div key={p.id} className="flex items-center justify-between px-3 py-2">
                    <span className="text-sm">{acr}</span>
                    <div className="flex items-center gap-3 text-xs">
                      <span className="text-gray-500">saldo {fmt(st.saldo_pendiente)} ({st.dias_transcurridos}d · {st.tasa_anual_pct}%)</span>
                      <span className={st.vencido ? 'text-red-600' : st.proximo ? 'text-amber-600' : 'text-gray-400'}>
                        {st.dias_vencimiento == null ? '—'
                          : st.vencido ? `vencido ${Math.abs(st.dias_vencimiento)}d`
                          : `${st.dias_vencimiento}d`}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          </>
        )}
      </div>
      <div>
        <p className="text-xs text-gray-400 uppercase tracking-wide mb-2">Movimientos del auto ({movsAuto.length})</p>
        {movsAuto.length === 0 ? (
          <p className="text-sm text-gray-400">Sin movimientos vinculados.</p>
        ) : (
          <div className="border border-gray-200 rounded divide-y divide-gray-100 bg-white max-h-80 overflow-y-auto">
            {movsAuto.map((m: any) => (
              <div key={m.id} className="flex items-center justify-between px-3 py-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className={`text-xs ${TIPO_COLOR[m.tipo] ?? ''}`}>{m.tipo}</span>
                  <span className="text-sm truncate">{m.nota || CAT_LABEL[m.categoria] || m.categoria}</span>
                </div>
                <div className="flex items-center gap-2 text-xs whitespace-nowrap">
                  <span className={TIPO_COLOR[m.tipo] ?? ''}>
                    {m.tipo === 'ingreso' ? '+' : '-'}{fmt(m.monto)}
                  </span>
                  <span className="text-gray-400">{fmtFecha(m.created_at)}</span>
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

  const selectCls = 'border border-gray-200 rounded px-2 py-1 text-xs focus:outline-none focus:border-gray-400'

  return (
    <div className="space-y-4">
      {/* Filtros */}
      <div className="space-y-3 border border-gray-200 rounded p-4 bg-gray-50">
        <div className="flex flex-wrap gap-2 items-center">
          <span className="text-xs text-gray-500 mr-1">Categoría:</span>
          {categoriasDisponibles.map(c => (
            <button
              key={c}
              onClick={() => toggleCat(c)}
              className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                cats.has(c)
                  ? 'bg-gray-900 text-white border-gray-900'
                  : 'border-gray-200 text-gray-500 hover:border-gray-400 bg-white'
              }`}
            >
              {CAT_LABEL[c] ?? c}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-3 items-center">
          <select className={selectCls} value={tipo} onChange={e => setTipo(e.target.value)}>
            <option value="">Tipo: todos</option>
            <option value="ingreso">Ingreso</option>
            <option value="egreso">Egreso</option>
          </select>
          <select className={selectCls} value={cuenta} onChange={e => setCuenta(e.target.value)}>
            <option value="">Cuenta: todas</option>
            <option value="cash">Cash</option>
            <option value="nexo">Nexo</option>
            <option value="fiwind">Fiwind</option>
          </select>
          <select className={selectCls} value={vehId} onChange={e => setVehId(e.target.value)}>
            <option value="">Auto: todos</option>
            {vehiclesConMovs.map((v: any) => (
              <option key={v.id} value={v.id}>{autoLabel(v)}</option>
            ))}
          </select>
          <input
            type="date"
            className={selectCls}
            value={desde}
            onChange={e => setDesde(e.target.value)}
            placeholder="desde"
          />
          <input
            type="date"
            className={selectCls}
            value={hasta}
            onChange={e => setHasta(e.target.value)}
            placeholder="hasta"
          />
          {(cats.size || cuenta || tipo || vehId || desde || hasta) ? (
            <button
              onClick={() => { setCats(new Set()); setCuenta(''); setTipo(''); setVehId(''); setDesde(''); setHasta('') }}
              className="text-xs text-gray-500 hover:text-gray-900 underline underline-offset-2"
            >
              Limpiar
            </button>
          ) : null}
        </div>
      </div>

      {/* Totales del filtro */}
      <div className="flex items-center gap-6 text-sm">
        <span className="text-gray-500">{filtered.length} movimiento{filtered.length === 1 ? '' : 's'}</span>
        <span className="text-green-600">+{fmt(totalIngresos)}</span>
        <span className="text-red-500">-{fmt(totalEgresos)}</span>
        <span className="text-gray-600 font-medium">
          Neto: {totalIngresos - totalEgresos >= 0 ? '+' : ''}{fmt(totalIngresos - totalEgresos)}
        </span>
      </div>

      {/* Tabla */}
      <div className="overflow-x-auto border border-gray-200 rounded">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr className="text-left">
              <th className="px-4 py-2 font-medium text-gray-500 text-xs">Fecha</th>
              <th className="px-4 py-2 font-medium text-gray-500 text-xs">Tipo</th>
              <th className="px-4 py-2 font-medium text-gray-500 text-xs">Categoría</th>
              <th className="px-4 py-2 font-medium text-gray-500 text-xs">Cuenta</th>
              <th className="px-4 py-2 font-medium text-gray-500 text-xs">Auto</th>
              <th className="px-4 py-2 font-medium text-gray-500 text-xs">Nota</th>
              <th className="px-4 py-2 font-medium text-gray-500 text-xs text-right">Monto</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filtered.map((m: any) => {
              const veh = m.vehicle_id ? vehiclesById[m.vehicle_id] : null
              return (
                <tr key={m.id}>
                  <td className="px-4 py-2 text-xs text-gray-400 whitespace-nowrap">{fmtFecha(m.created_at)}</td>
                  <td className={`px-4 py-2 text-xs ${TIPO_COLOR[m.tipo] ?? ''}`}>{m.tipo}</td>
                  <td className="px-4 py-2 text-xs text-gray-500">{CAT_LABEL[m.categoria] ?? m.categoria}</td>
                  <td className="px-4 py-2 text-xs text-gray-500 capitalize">{m.cuenta}</td>
                  <td className="px-4 py-2 text-xs text-gray-600">
                    {veh ? `${veh.marca} ${veh.modelo}` : <span className="text-gray-300">—</span>}
                  </td>
                  <td className="px-4 py-2 text-sm text-gray-700 truncate max-w-xs">{m.nota || ''}</td>
                  <td className={`px-4 py-2 text-sm font-medium text-right whitespace-nowrap ${TIPO_COLOR[m.tipo] ?? ''}`}>
                    {m.tipo === 'ingreso' ? '+' : '-'}{fmt(m.monto)}
                  </td>
                </tr>
              )
            })}
            {filtered.length === 0 && (
              <tr><td colSpan={7} className="px-4 py-6 text-center text-sm text-gray-400">Sin movimientos para este filtro.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
