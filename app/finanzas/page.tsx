import { getBalances, getMovimientos, getPrestamos, getClientes } from '@/lib/kapso'

const TIPO_COLOR: Record<string, string> = {
  ingreso: 'text-green-600',
  egreso:  'text-red-500',
}

function fmt(n: number) {
  return `$${Number(n ?? 0).toLocaleString('es-AR')}`
}

function fmtFecha(iso: string) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit' })
}

export default async function Finanzas() {
  const [balances, movimientos, prestamos, clientes] = await Promise.all([
    getBalances(), getMovimientos(), getPrestamos(), getClientes(),
  ])

  const total = balances.reduce((s: number, b: any) => s + (b.saldo ?? 0), 0)
  const movRecientes = [...movimientos].sort((a: any, b: any) =>
    new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  ).slice(0, 25)

  const prestamosActivos = prestamos.filter((p: any) => p.estado === 'activo')
  const hoy = Date.now()

  function nombreCliente(id: number) {
    return clientes.find((c: any) => c.id === id)?.nombre ?? '—'
  }

  return (
    <div className="space-y-8">
      <h1 className="text-xl font-semibold">Finanzas</h1>

      {/* Balances */}
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

      {/* Préstamos activos */}
      {prestamosActivos.length > 0 && (
        <section>
          <p className="text-xs text-gray-400 uppercase tracking-wide mb-3">
            Préstamos activos ({prestamosActivos.length})
          </p>
          <div className="divide-y divide-gray-100 border border-gray-200 rounded">
            {prestamosActivos.map((p: any) => {
              const dias = p.fecha_vencimiento
                ? Math.ceil((new Date(p.fecha_vencimiento).getTime() - hoy) / 86400000)
                : null
              const alerta = dias !== null && dias <= 30
              return (
                <div key={p.id} className="flex items-center justify-between px-4 py-3">
                  <div>
                    <span className="text-sm font-medium">{nombreCliente(p.acreedor_id)}</span>
                    {alerta && (
                      <span className="ml-2 text-xs text-red-600">
                        {dias < 0 ? `vencido hace ${Math.abs(dias)}d` : `vence en ${dias}d`}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-6 text-sm">
                    <span className="text-gray-500">Capital: {fmt(p.monto_original)}</span>
                    <span>A devolver: {fmt(p.monto_a_devolver)}</span>
                    <span className="text-gray-400">{fmtFecha(p.fecha_vencimiento)}</span>
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      )}

      {/* Movimientos recientes */}
      <section>
        <p className="text-xs text-gray-400 uppercase tracking-wide mb-3">Últimos movimientos</p>
        <div className="divide-y divide-gray-100 border border-gray-200 rounded">
          {movRecientes.map((m: any) => (
            <div key={m.id} className="flex items-center justify-between px-4 py-3">
              <div className="flex items-center gap-3">
                <span className={`text-xs font-medium w-12 ${TIPO_COLOR[m.tipo] ?? ''}`}>
                  {m.tipo}
                </span>
                <span className="text-sm">{m.nota || m.categoria}</span>
                <span className="text-xs text-gray-400 capitalize">{m.cuenta}</span>
              </div>
              <div className="flex items-center gap-4">
                <span className={`text-sm font-medium ${TIPO_COLOR[m.tipo] ?? ''}`}>
                  {m.tipo === 'ingreso' ? '+' : '-'}{fmt(m.monto)}
                </span>
                <span className="text-xs text-gray-400">{fmtFecha(m.created_at)}</span>
              </div>
            </div>
          ))}
          {movRecientes.length === 0 && (
            <p className="px-4 py-3 text-sm text-gray-400">Sin movimientos registrados.</p>
          )}
        </div>
      </section>
    </div>
  )
}
