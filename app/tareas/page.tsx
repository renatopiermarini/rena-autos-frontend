export const dynamic = 'force-dynamic'
import { getTareas, getVehicles } from '@/lib/kapso'

const PRIORIDAD_COLOR: Record<string, string> = {
  alta:   'text-red-600',
  media:  'text-yellow-600',
  baja:   'text-gray-400',
  urgente: 'text-red-700 font-semibold',
}

const ESTADO_COLOR: Record<string, string> = {
  pendiente: 'bg-yellow-100 text-yellow-800',
  en_curso:  'bg-blue-100 text-blue-800',
  completada: 'bg-gray-100 text-gray-400',
}

const TIPO_LABEL: Record<string, string> = {
  lavado:     'Lavado',
  fotos:      'Fotos',
  publicacion: 'Publicación',
  tramite:    'Trámite',
  seguimiento: 'Seguimiento',
  otro:       'Otro',
}

function fmtFecha(iso: string) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit' })
}

export default async function Tareas() {
  const [tareas, vehicles] = await Promise.all([getTareas(), getVehicles()])

  function autoNombre(id: number | null) {
    if (!id) return null
    const v = vehicles.find((v: any) => v.id === id)
    return v ? `${v.marca} ${v.modelo} ${v.año}` : null
  }

  const pendientes = tareas.filter((t: any) => t.estado === 'pendiente' || t.estado === 'en_curso')
  const completadas = tareas.filter((t: any) => t.estado === 'completada')

  const altas    = pendientes.filter((t: any) => t.prioridad === 'alta' || t.prioridad === 'urgente')
  const medias   = pendientes.filter((t: any) => t.prioridad === 'media')
  const bajas    = pendientes.filter((t: any) => t.prioridad === 'baja' || !t.prioridad)

  function TareaRow({ t }: { t: any }) {
    const auto = autoNombre(t.vehicle_id)
    return (
      <div className="flex items-start justify-between px-4 py-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className={`text-xs font-medium ${PRIORIDAD_COLOR[t.prioridad] ?? 'text-gray-500'}`}>
              {(t.prioridad ?? 'baja').toUpperCase()}
            </span>
            {t.tipo && (
              <span className="text-xs text-gray-400">{TIPO_LABEL[t.tipo] ?? t.tipo}</span>
            )}
            <span className={`text-xs px-1.5 py-0.5 rounded ${ESTADO_COLOR[t.estado] ?? 'bg-gray-100 text-gray-600'}`}>
              {t.estado?.replace(/_/g, ' ')}
            </span>
          </div>
          <p className="text-sm mt-0.5">{t.titulo}</p>
          {auto && <p className="text-xs text-gray-400 mt-0.5">{auto}</p>}
        </div>
        <div className="flex items-center gap-4 ml-4 shrink-0 text-xs text-gray-400">
          {t.asignado && <span>{t.asignado}</span>}
          {t.fecha_limite && <span>{fmtFecha(t.fecha_limite)}</span>}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      <div className="flex items-baseline justify-between">
        <h1 className="text-xl font-semibold">Tareas</h1>
        <span className="text-sm text-gray-400">{pendientes.length} pendientes · {completadas.length} completadas</span>
      </div>

      {/* Urgentes / Alta prioridad */}
      {altas.length > 0 && (
        <section>
          <p className="text-xs text-gray-400 uppercase tracking-wide mb-3">Alta prioridad ({altas.length})</p>
          <div className="divide-y divide-gray-100 border border-red-100 rounded">
            {altas.map((t: any) => <TareaRow key={t.id} t={t} />)}
          </div>
        </section>
      )}

      {/* Media prioridad */}
      {medias.length > 0 && (
        <section>
          <p className="text-xs text-gray-400 uppercase tracking-wide mb-3">Media prioridad ({medias.length})</p>
          <div className="divide-y divide-gray-100 border border-gray-200 rounded">
            {medias.map((t: any) => <TareaRow key={t.id} t={t} />)}
          </div>
        </section>
      )}

      {/* Baja prioridad */}
      {bajas.length > 0 && (
        <section>
          <p className="text-xs text-gray-400 uppercase tracking-wide mb-3">Baja prioridad ({bajas.length})</p>
          <div className="divide-y divide-gray-100 border border-gray-200 rounded">
            {bajas.map((t: any) => <TareaRow key={t.id} t={t} />)}
          </div>
        </section>
      )}

      {pendientes.length === 0 && (
        <p className="text-sm text-gray-400">Sin tareas pendientes.</p>
      )}

      {/* Completadas recientes */}
      {completadas.length > 0 && (
        <section>
          <p className="text-xs text-gray-400 uppercase tracking-wide mb-3">Completadas recientes</p>
          <div className="divide-y divide-gray-100 border border-gray-200 rounded">
            {completadas.slice(0, 10).map((t: any) => (
              <div key={t.id} className="flex items-center justify-between px-4 py-2">
                <span className="text-sm text-gray-400 line-through">{t.titulo}</span>
                <div className="flex items-center gap-3 text-xs text-gray-400">
                  {t.completado_por && <span>{t.completado_por}</span>}
                  {t.fecha_completado && <span>{fmtFecha(t.fecha_completado)}</span>}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
