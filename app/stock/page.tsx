export const dynamic = 'force-dynamic'
import { getVehicles, getTareas } from '@/lib/kapso'

const ESTADO_COLOR: Record<string, string> = {
  en_stock:      'bg-green-100 text-green-800',
  confirmado:    'bg-blue-100 text-blue-800',
  vendido:       'bg-gray-100 text-gray-400',
  reservado:     'bg-yellow-100 text-yellow-800',
  en_reparacion: 'bg-orange-100 text-orange-800',
  a_ingresar:    'bg-purple-100 text-purple-700',
  va_a_pensarlo: 'bg-gray-100 text-gray-600',
  necesita_follow_up: 'bg-red-100 text-red-700',
}

function Check({ ok }: { ok: boolean }) {
  return <span className={ok ? 'text-green-600' : 'text-gray-300'}>{'✓'}</span>
}

function diasEnStock(fecha: string) {
  if (!fecha) return '—'
  const dias = Math.floor((Date.now() - new Date(fecha).getTime()) / 86400000)
  return `${dias}d`
}

export default async function Stock() {
  const [vehicles, tareas] = await Promise.all([getVehicles(), getTareas()])

  const activos = vehicles.filter((v: any) => v.estado !== 'vendido')
  const vendidos = vehicles.filter((v: any) => v.estado === 'vendido')

  function tareasAuto(vid: number) {
    return tareas.filter((t: any) => t.vehicle_id === vid && t.estado !== 'completada')
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
            <tbody className="divide-y divide-gray-100">
              {activos.map((v: any) => {
                const pendientes = tareasAuto(v.id)
                return (
                  <tr key={v.id} className="hover:bg-gray-50 transition-colors">
                    <td className="py-3 pr-4">
                      <span className="font-medium">{v.marca} {v.modelo}</span>
                      <span className="text-gray-400 ml-1">{v.año}</span>
                      {pendientes.length > 0 && (
                        <span className="ml-2 text-xs text-orange-500">{pendientes.length} tarea{pendientes.length > 1 ? 's' : ''}</span>
                      )}
                    </td>
                    <td className="py-3 pr-4 text-gray-500">{v.dominio || '—'}</td>
                    <td className="py-3 pr-4">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${ESTADO_COLOR[v.estado] ?? 'bg-gray-100 text-gray-600'}`}>
                        {v.estado?.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td className="py-3 pr-4 text-gray-500">
                      {v.km ? Number(v.km).toLocaleString('es-AR') : '—'}
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
                )
              })}
              {activos.length === 0 && (
                <tr><td colSpan={9} className="py-8 text-center text-gray-400">Sin autos activos.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Vendidos recientes */}
      {vendidos.length > 0 && (
        <section>
          <p className="text-xs text-gray-400 uppercase tracking-wide mb-3">Vendidos recientes</p>
          <div className="divide-y divide-gray-100 border border-gray-200 rounded">
            {vendidos.slice(0, 5).map((v: any) => (
              <div key={v.id} className="flex items-center justify-between px-4 py-3">
                <span className="text-sm text-gray-500">{v.marca} {v.modelo} {v.año}</span>
                <span className="text-sm">
                  {v.precio_venta_final ? `$${Number(v.precio_venta_final).toLocaleString('es-AR')}` : '—'}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
