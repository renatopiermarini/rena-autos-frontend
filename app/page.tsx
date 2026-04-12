import { getBalances, getTareas, getVehicles, getPrestamos } from '@/lib/kapso'

function estadoColor(estado: string) {
  const map: Record<string, string> = {
    en_stock: 'bg-green-100 text-green-800',
    confirmado: 'bg-blue-100 text-blue-800',
    vendido: 'bg-gray-100 text-gray-500',
    reservado: 'bg-yellow-100 text-yellow-800',
    en_reparacion: 'bg-orange-100 text-orange-800',
    a_ingresar: 'bg-purple-100 text-purple-700',
  }
  return map[estado] ?? 'bg-gray-100 text-gray-600'
}

export default async function Inicio() {
  const [balances, tareas, vehicles, prestamos] = await Promise.all([
    getBalances(), getTareas(), getVehicles(), getPrestamos(),
  ])

  const activos = vehicles.filter((v: any) => v.estado !== 'vendido')
  const urgentes = tareas.filter((t: any) => t.prioridad === 'alta' && t.estado !== 'completada')
  const prestamosActivos = prestamos.filter((p: any) => p.estado === 'activo')

  const hoy = new Date()
  const alertas: string[] = []

  const cash = balances.find((b: any) => b.cuenta === 'cash')
  if (cash && cash.saldo < 500) alertas.push(`Cash bajo: $${cash.saldo}`)

  prestamosActivos.forEach((p: any) => {
    if (!p.fecha_vencimiento) return
    const dias = Math.ceil((new Date(p.fecha_vencimiento).getTime() - hoy.getTime()) / 86400000)
    if (dias < 0) alertas.push(`Préstamo vencido hace ${Math.abs(dias)} días`)
    else if (dias <= 30) alertas.push(`Préstamo vence en ${dias} días`)
  })

  return (
    <div className="space-y-8">
      <h1 className="text-xl font-semibold">Inicio</h1>

      {/* Alertas */}
      {alertas.length > 0 && (
        <div className="border border-red-200 bg-red-50 rounded p-4 space-y-1">
          <p className="text-xs font-semibold text-red-700 uppercase tracking-wide mb-2">Alertas</p>
          {alertas.map((a, i) => <p key={i} className="text-sm text-red-700">⚠ {a}</p>)}
        </div>
      )}

      {/* Balances */}
      <section>
        <p className="text-xs text-gray-400 uppercase tracking-wide mb-3">Cuentas</p>
        <div className="grid grid-cols-3 gap-4">
          {balances.map((b: any) => (
            <div key={b.id} className="border border-gray-200 rounded p-4">
              <p className="text-xs text-gray-500 capitalize mb-1">{b.cuenta}</p>
              <p className="text-2xl font-light">${Number(b.saldo ?? 0).toLocaleString('es-AR')}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Stock resumen */}
      <section>
        <p className="text-xs text-gray-400 uppercase tracking-wide mb-3">Stock ({activos.length} activos)</p>
        <div className="divide-y divide-gray-100 border border-gray-200 rounded">
          {activos.slice(0, 8).map((v: any) => (
            <div key={v.id} className="flex items-center justify-between px-4 py-3">
              <span className="text-sm">{v.marca} {v.modelo} {v.año}</span>
              <div className="flex items-center gap-3">
                {v.dominio && <span className="text-xs text-gray-400">{v.dominio}</span>}
                <span className={`text-xs px-2 py-0.5 rounded-full ${estadoColor(v.estado)}`}>
                  {v.estado?.replace(/_/g, ' ')}
                </span>
              </div>
            </div>
          ))}
          {activos.length === 0 && (
            <p className="px-4 py-3 text-sm text-gray-400">Sin autos activos.</p>
          )}
        </div>
      </section>

      {/* Tareas urgentes */}
      <section>
        <p className="text-xs text-gray-400 uppercase tracking-wide mb-3">
          Tareas urgentes ({urgentes.length})
        </p>
        <div className="divide-y divide-gray-100 border border-gray-200 rounded">
          {urgentes.slice(0, 8).map((t: any) => (
            <div key={t.id} className="flex items-center justify-between px-4 py-3">
              <span className="text-sm">{t.titulo}</span>
              <span className="text-xs text-gray-400">{t.asignado}</span>
            </div>
          ))}
          {urgentes.length === 0 && (
            <p className="px-4 py-3 text-sm text-gray-400">Sin tareas urgentes.</p>
          )}
        </div>
      </section>
    </div>
  )
}
