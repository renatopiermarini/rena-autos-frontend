import { getClientes, getInteresados } from '@/lib/kapso'

const TIPO_COLOR: Record<string, string> = {
  vendedor:  'bg-blue-100 text-blue-700',
  comprador: 'bg-green-100 text-green-700',
  ambos:     'bg-purple-100 text-purple-700',
}

const ESTADO_COLOR: Record<string, string> = {
  activo:     'text-green-600',
  contactado: 'text-blue-600',
  reservo:    'text-yellow-600',
  compro:     'text-gray-400',
  perdido:    'text-red-400',
}

export default async function Clientes() {
  const [clientes, interesados] = await Promise.all([getClientes(), getInteresados()])
  const interesadosActivos = interesados.filter((i: any) => i.estado !== 'compro' && i.estado !== 'perdido')

  return (
    <div className="space-y-10">
      <h1 className="text-xl font-semibold">Clientes</h1>

      {/* Clientes */}
      <section>
        <p className="text-xs text-gray-400 uppercase tracking-wide mb-3">
          Clientes ({clientes.length})
        </p>
        <div className="divide-y divide-gray-100 border border-gray-200 rounded">
          {clientes.map((c: any) => (
            <div key={c.id} className="flex items-center justify-between px-4 py-3">
              <div>
                <span className="text-sm font-medium">{c.nombre}</span>
                {c.es_acreedor ? <span className="ml-2 text-xs text-orange-600">acreedor</span> : null}
              </div>
              <div className="flex items-center gap-4">
                {c.telefono && <span className="text-xs text-gray-400">{c.telefono}</span>}
                {c.email && <span className="text-xs text-gray-400">{c.email}</span>}
                <span className={`text-xs px-2 py-0.5 rounded-full ${TIPO_COLOR[c.tipo] ?? 'bg-gray-100 text-gray-600'}`}>
                  {c.tipo}
                </span>
              </div>
            </div>
          ))}
          {clientes.length === 0 && (
            <p className="px-4 py-3 text-sm text-gray-400">Sin clientes registrados.</p>
          )}
        </div>
      </section>

      {/* Interesados */}
      <section>
        <p className="text-xs text-gray-400 uppercase tracking-wide mb-3">
          Interesados activos ({interesadosActivos.length})
        </p>
        <div className="divide-y divide-gray-100 border border-gray-200 rounded">
          {interesadosActivos.map((i: any) => (
            <div key={i.id} className="flex items-center justify-between px-4 py-3">
              <div>
                <span className="text-sm font-medium">{i.nombre}</span>
                {(i.marca_buscada || i.modelo_buscado) && (
                  <span className="text-xs text-gray-400 ml-2">
                    busca: {[i.marca_buscada, i.modelo_buscado, i.año_min && `desde ${i.año_min}`].filter(Boolean).join(' ')}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-4">
                {i.presupuesto && (
                  <span className="text-xs text-gray-500">${Number(i.presupuesto).toLocaleString('es-AR')}</span>
                )}
                {i.telefono && <span className="text-xs text-gray-400">{i.telefono}</span>}
                <span className={`text-xs ${ESTADO_COLOR[i.estado] ?? 'text-gray-500'}`}>
                  {i.estado}
                </span>
              </div>
            </div>
          ))}
          {interesadosActivos.length === 0 && (
            <p className="px-4 py-3 text-sm text-gray-400">Sin interesados activos.</p>
          )}
        </div>
      </section>
    </div>
  )
}
