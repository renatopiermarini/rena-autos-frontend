'use client'
import { useState, Fragment } from 'react'

const ESTADO_COLOR: Record<string, string> = {
  en_stock:           'bg-green-100 text-green-800',
  confirmado:         'bg-blue-100 text-blue-800',
  vendido:            'bg-gray-100 text-gray-400',
  reservado:          'bg-yellow-100 text-yellow-800',
  en_reparacion:      'bg-orange-100 text-orange-800',
  a_ingresar:         'bg-purple-100 text-purple-700',
  va_a_pensarlo:      'bg-gray-100 text-gray-600',
  necesita_follow_up: 'bg-red-100 text-red-700',
  potencial:          'bg-gray-100 text-gray-500',
}

function Check({ ok }: { ok: boolean }) {
  return <span className={ok ? 'text-green-600' : 'text-gray-300'}>✓</span>
}

function diasEnStock(fecha: string) {
  if (!fecha) return '—'
  const dias = Math.floor((Date.now() - new Date(fecha).getTime()) / 86400000)
  return `${dias}d`
}

function fmt(n: any) {
  if (n == null || n === '') return '—'
  return `$${Number(n).toLocaleString('es-AR')}`
}

function fmtN(n: any) {
  if (n == null || n === '') return '—'
  return Number(n).toLocaleString('es-AR')
}

function fmtFecha(iso: string) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit' })
}

function Field({ label, value }: { label: string; value: any }) {
  if (value == null || value === '' || value === 0 && label !== 'KM') return null
  return (
    <div>
      <p className="text-xs text-gray-400">{label}</p>
      <p className="text-sm text-gray-700">{value}</p>
    </div>
  )
}

function VehicleDetail({ v, clientes }: { v: any; clientes: any[] }) {
  const cliente = clientes.find((c: any) => c.id === v.cliente_id)
  const comprador = clientes.find((c: any) => c.id === v.comprador_id)

  const margen = v.precio_venta_final && v.costo_total
    ? Number(v.precio_venta_final) - Number(v.costo_total)
    : null

  return (
    <tr>
      <td colSpan={9} className="px-4 pb-4 pt-0 bg-gray-50 border-b border-gray-200">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-8 gap-y-3 pt-3">
          <Field label="Tipo operación" value={v.tipo_operacion} />
          <Field label="Color" value={v.color} />
          <Field label="KM" value={v.km ? fmtN(v.km) : null} />
          <Field label="N° motor" value={v.numero_motor} />
          <Field label="N° chasis" value={v.numero_chasis} />
          <Field label="Precio compra" value={v.precio_compra ? fmt(v.precio_compra) : null} />
          <Field label="Costo total" value={v.costo_total ? fmt(v.costo_total) : null} />
          <Field label="Precio objetivo" value={v.precio_venta_objetivo ? fmt(v.precio_venta_objetivo) : null} />
          <Field label="Precio publicado" value={v.precio_publicado ? fmt(v.precio_publicado) : null} />
          <Field label="Precio venta final" value={v.precio_venta_final ? fmt(v.precio_venta_final) : null} />
          {margen != null && (
            <div>
              <p className="text-xs text-gray-400">Margen</p>
              <p className={`text-sm font-medium ${margen >= 0 ? 'text-green-700' : 'text-red-600'}`}>
                {margen >= 0 ? '+' : ''}{fmt(margen)}
              </p>
            </div>
          )}
          <Field label="Fecha ingreso" value={fmtFecha(v.fecha_ingreso)} />
          <Field label="Fecha venta" value={fmtFecha(v.fecha_venta)} />
          <Field label="Propietario/consignante" value={cliente?.nombre} />
          <Field label="Comprador" value={comprador?.nombre} />
          {v.notas && (
            <div className="col-span-2 lg:col-span-4">
              <p className="text-xs text-gray-400">Notas</p>
              <p className="text-sm text-gray-600">{v.notas}</p>
            </div>
          )}
        </div>
      </td>
    </tr>
  )
}

export default function StockClient({
  vehicles,
  tareas,
  clientes,
}: {
  vehicles: any[]
  tareas: any[]
  clientes: any[]
}) {
  const [expanded, setExpanded] = useState<Set<number>>(new Set())

  const activos  = vehicles.filter(v => v.estado !== 'vendido')
  const vendidos = vehicles.filter(v => v.estado === 'vendido')

  function toggle(id: number) {
    setExpanded(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function tareasAuto(vid: number) {
    return tareas.filter(t => t.vehicle_id === vid && t.estado !== 'completada')
  }

  return (
    <div className="space-y-8">
      <div className="flex items-baseline justify-between">
        <h1 className="text-xl font-semibold">Stock</h1>
        <span className="text-sm text-gray-400">{activos.length} activos · {vendidos.length} vendidos</span>
      </div>

      {/* Tabla activos */}
      <section>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left">
                <th className="pb-2 font-medium text-gray-500 text-xs pr-4">Auto</th>
                <th className="pb-2 font-medium text-gray-500 text-xs pr-4">Patente</th>
                <th className="pb-2 font-medium text-gray-500 text-xs pr-4">Estado</th>
                <th className="pb-2 font-medium text-gray-500 text-xs pr-4">KM</th>
                <th className="pb-2 font-medium text-gray-500 text-xs pr-4">Precio</th>
                <th className="pb-2 font-medium text-gray-500 text-xs pr-4">Días</th>
                <th className="pb-2 font-medium text-gray-500 text-xs pr-1 text-center">Lav</th>
                <th className="pb-2 font-medium text-gray-500 text-xs pr-1 text-center">Fotos</th>
                <th className="pb-2 font-medium text-gray-500 text-xs text-center">Pub</th>
              </tr>
            </thead>
            <tbody>
              {activos.map(v => {
                const pendientes = tareasAuto(v.id)
                const isOpen = expanded.has(v.id)
                return (
                  <Fragment key={v.id}>
                    <tr
                      onClick={() => toggle(v.id)}
                      className={`cursor-pointer border-b border-gray-100 transition-colors ${isOpen ? 'bg-gray-50' : 'hover:bg-gray-50'}`}
                    >
                      <td className="py-3 pr-4">
                        <div className="flex items-center gap-1.5">
                          <span className="text-gray-400 text-xs">{isOpen ? '▲' : '▼'}</span>
                          <span className="font-medium">{v.marca} {v.modelo}</span>
                          <span className="text-gray-400">{v.año}</span>
                          {v.color && <span className="text-xs text-gray-400">· {v.color}</span>}
                          {pendientes.length > 0 && (
                            <span className="text-xs text-orange-500">{pendientes.length} tarea{pendientes.length > 1 ? 's' : ''}</span>
                          )}
                        </div>
                      </td>
                      <td className="py-3 pr-4 text-gray-500">{v.dominio || '—'}</td>
                      <td className="py-3 pr-4">
                        <span className={`text-xs px-2 py-0.5 rounded-full ${ESTADO_COLOR[v.estado] ?? 'bg-gray-100 text-gray-600'}`}>
                          {v.estado?.replace(/_/g, ' ')}
                        </span>
                      </td>
                      <td className="py-3 pr-4 text-gray-500">
                        {v.km ? fmtN(v.km) : '—'}
                      </td>
                      <td className="py-3 pr-4">
                        {v.precio_publicado
                          ? `$${Number(v.precio_publicado).toLocaleString('es-AR')}`
                          : v.precio_venta_objetivo
                          ? <span className="text-gray-400">${Number(v.precio_venta_objetivo).toLocaleString('es-AR')}</span>
                          : '—'}
                      </td>
                      <td className="py-3 pr-4 text-gray-400">{diasEnStock(v.fecha_ingreso)}</td>
                      <td className="py-3 pr-1 text-center"><Check ok={!!v.lavado} /></td>
                      <td className="py-3 pr-1 text-center"><Check ok={!!v.fotos_ok} /></td>
                      <td className="py-3 text-center"><Check ok={!!v.publicado} /></td>
                    </tr>
                    {isOpen && <VehicleDetail v={v} clientes={clientes} />}
                  </Fragment>
                )
              })}
              {activos.length === 0 && (
                <tr><td colSpan={9} className="py-8 text-center text-gray-400">Sin autos activos.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Vendidos */}
      {vendidos.length > 0 && (
        <section>
          <p className="text-xs text-gray-400 uppercase tracking-wide mb-3">Vendidos</p>
          <div className="border border-gray-200 rounded overflow-hidden">
            <table className="w-full text-sm">
              <tbody className="divide-y divide-gray-100">
                {vendidos.map(v => {
                  const isOpen = expanded.has(v.id)
                  return (
                    <Fragment key={v.id}>
                      <tr
                        onClick={() => toggle(v.id)}
                        className={`cursor-pointer transition-colors ${isOpen ? 'bg-gray-50' : 'hover:bg-gray-50'}`}
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1.5">
                            <span className="text-gray-400 text-xs">{isOpen ? '▲' : '▼'}</span>
                            <span className="text-gray-600">{v.marca} {v.modelo} {v.año}</span>
                            {v.color && <span className="text-xs text-gray-400">· {v.color}</span>}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right text-gray-500">
                          {v.precio_venta_final ? `$${Number(v.precio_venta_final).toLocaleString('es-AR')}` : '—'}
                        </td>
                        <td className="px-4 py-3 text-right text-xs text-gray-400">
                          {fmtFecha(v.fecha_venta)}
                        </td>
                      </tr>
                      {isOpen && <VehicleDetail v={v} clientes={clientes} />}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  )
}
