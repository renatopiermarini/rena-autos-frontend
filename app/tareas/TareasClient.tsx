'use client'
import { useState } from 'react'

// ── Constants ─────────────────────────────────────────────────────────────────

const PRIORIDAD_COLOR: Record<string, string> = {
  alta:    'text-red-600',
  media:   'text-yellow-600',
  baja:    'text-gray-400',
  urgente: 'text-red-700 font-semibold',
}

const PRIORIDAD_DOT: Record<string, string> = {
  urgente: 'bg-red-600',
  alta:    'bg-red-400',
  media:   'bg-yellow-400',
  baja:    'bg-gray-300',
}

const ESTADO_COLOR: Record<string, string> = {
  pendiente:  'bg-yellow-100 text-yellow-800',
  en_curso:   'bg-blue-100 text-blue-800',
  completada: 'bg-gray-100 text-gray-400',
}

const TIPO_LABEL: Record<string, string> = {
  lavado:      'Lavado',
  fotos:       'Fotos',
  publicacion: 'Publicación',
  tramite:     'Trámite',
  seguimiento: 'Seguimiento',
  otro:        'Otro',
}

const DIAS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']
const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']

function fmtFecha(iso: string) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit' })
}

// ── List view ─────────────────────────────────────────────────────────────────

function TareaRow({ t, autoNombre }: { t: any; autoNombre: (id: number | null) => string | null }) {
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

function ListView({ tareas, vehicles }: { tareas: any[]; vehicles: any[] }) {
  function autoNombre(id: number | null) {
    if (!id) return null
    const v = vehicles.find((v: any) => v.id === id)
    return v ? `${v.marca} ${v.modelo} ${v.año}` : null
  }

  const pendientes  = tareas.filter(t => t.estado === 'pendiente' || t.estado === 'en_curso')
  const completadas = tareas.filter(t => t.estado === 'completada')

  const altas  = pendientes.filter(t => t.prioridad === 'alta' || t.prioridad === 'urgente')
  const medias = pendientes.filter(t => t.prioridad === 'media')
  const bajas  = pendientes.filter(t => t.prioridad === 'baja' || !t.prioridad)

  return (
    <div className="space-y-8">
      {altas.length > 0 && (
        <section>
          <p className="text-xs text-gray-400 uppercase tracking-wide mb-3">Alta prioridad ({altas.length})</p>
          <div className="divide-y divide-gray-100 border border-red-100 rounded">
            {altas.map(t => <TareaRow key={t.id} t={t} autoNombre={autoNombre} />)}
          </div>
        </section>
      )}
      {medias.length > 0 && (
        <section>
          <p className="text-xs text-gray-400 uppercase tracking-wide mb-3">Media prioridad ({medias.length})</p>
          <div className="divide-y divide-gray-100 border border-gray-200 rounded">
            {medias.map(t => <TareaRow key={t.id} t={t} autoNombre={autoNombre} />)}
          </div>
        </section>
      )}
      {bajas.length > 0 && (
        <section>
          <p className="text-xs text-gray-400 uppercase tracking-wide mb-3">Baja prioridad ({bajas.length})</p>
          <div className="divide-y divide-gray-100 border border-gray-200 rounded">
            {bajas.map(t => <TareaRow key={t.id} t={t} autoNombre={autoNombre} />)}
          </div>
        </section>
      )}
      {pendientes.length === 0 && (
        <p className="text-sm text-gray-400">Sin tareas pendientes.</p>
      )}
      {completadas.length > 0 && (
        <section>
          <p className="text-xs text-gray-400 uppercase tracking-wide mb-3">Completadas recientes</p>
          <div className="divide-y divide-gray-100 border border-gray-200 rounded">
            {completadas.slice(0, 10).map(t => (
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

// ── Calendar view ─────────────────────────────────────────────────────────────

function CalendarView({ tareas, vehicles }: { tareas: any[]; vehicles: any[] }) {
  const now = new Date()
  const [year, setYear]   = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth()) // 0-based
  const [selected, setSelected] = useState<string | null>(null) // 'YYYY-MM-DD'

  function autoNombre(id: number | null) {
    if (!id) return null
    const v = vehicles.find((v: any) => v.id === id)
    return v ? `${v.marca} ${v.modelo} ${v.año}` : null
  }

  const activas = tareas.filter(t => t.estado !== 'completada')

  // Build day → tasks map
  const tasksByDay: Record<string, any[]> = {}
  const sinFecha: any[] = []
  for (const t of activas) {
    if (!t.fecha_limite) { sinFecha.push(t); continue }
    const key = t.fecha_limite.slice(0, 10) // 'YYYY-MM-DD'
    tasksByDay[key] = tasksByDay[key] ? [...tasksByDay[key], t] : [t]
  }

  // Calendar grid
  const firstDay = new Date(year, month, 1).getDay() // 0=Sun
  const daysInMonth = new Date(year, month + 1, 0).getDate()

  function prevMonth() {
    if (month === 0) { setYear(y => y - 1); setMonth(11) }
    else setMonth(m => m - 1)
    setSelected(null)
  }
  function nextMonth() {
    if (month === 11) { setYear(y => y + 1); setMonth(0) }
    else setMonth(m => m + 1)
    setSelected(null)
  }

  function dayKey(d: number) {
    return `${year}-${String(month + 1).padStart(2,'0')}-${String(d).padStart(2,'0')}`
  }

  const todayKey = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`
  const selectedTasks = selected ? (tasksByDay[selected] ?? []) : []

  // Cells: leading empty + day cells
  const cells: (number | null)[] = [
    ...Array(firstDay).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ]
  // Pad to full rows
  while (cells.length % 7 !== 0) cells.push(null)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button onClick={prevMonth} className="text-gray-400 hover:text-gray-700 px-2 py-1 rounded hover:bg-gray-100 transition-colors">←</button>
        <span className="text-sm font-medium w-40 text-center">{MESES[month]} {year}</span>
        <button onClick={nextMonth} className="text-gray-400 hover:text-gray-700 px-2 py-1 rounded hover:bg-gray-100 transition-colors">→</button>
      </div>

      {/* Grid */}
      <div className="border border-gray-200 rounded overflow-hidden">
        {/* Day headers */}
        <div className="grid grid-cols-7 border-b border-gray-200">
          {DIAS.map(d => (
            <div key={d} className="py-2 text-center text-xs text-gray-400 font-medium">{d}</div>
          ))}
        </div>

        {/* Weeks */}
        <div className="grid grid-cols-7 divide-x divide-gray-100">
          {cells.map((day, i) => {
            if (day === null) {
              return <div key={`empty-${i}`} className="min-h-16 bg-gray-50/50 border-b border-gray-100" />
            }
            const key = dayKey(day)
            const dayTasks = tasksByDay[key] ?? []
            const isToday = key === todayKey
            const isSelected = key === selected

            return (
              <div
                key={key}
                onClick={() => setSelected(isSelected ? null : key)}
                className={`min-h-16 p-1.5 border-b border-gray-100 cursor-pointer transition-colors ${
                  isSelected ? 'bg-gray-900' : isToday ? 'bg-blue-50' : 'hover:bg-gray-50'
                }`}
              >
                <span className={`text-xs font-medium block mb-1 ${
                  isSelected ? 'text-white' : isToday ? 'text-blue-600' : 'text-gray-600'
                }`}>
                  {day}
                </span>
                <div className="flex flex-wrap gap-0.5">
                  {dayTasks.slice(0, 4).map(t => (
                    <span
                      key={t.id}
                      className={`w-2 h-2 rounded-full ${PRIORIDAD_DOT[t.prioridad] ?? 'bg-gray-300'}`}
                      title={t.titulo}
                    />
                  ))}
                  {dayTasks.length > 4 && (
                    <span className={`text-xs ${isSelected ? 'text-gray-300' : 'text-gray-400'}`}>+{dayTasks.length - 4}</span>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Selected day tasks */}
      {selected && (
        <div>
          <p className="text-xs text-gray-400 uppercase tracking-wide mb-3">
            {new Date(selected + 'T12:00:00').toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' })}
            {' '}({selectedTasks.length} {selectedTasks.length === 1 ? 'tarea' : 'tareas'})
          </p>
          {selectedTasks.length === 0 ? (
            <p className="text-sm text-gray-400">Sin tareas para este día.</p>
          ) : (
            <div className="divide-y divide-gray-100 border border-gray-200 rounded">
              {selectedTasks.map(t => (
                <TareaRow key={t.id} t={t} autoNombre={autoNombre} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Sin fecha */}
      {sinFecha.length > 0 && (
        <div>
          <p className="text-xs text-gray-400 uppercase tracking-wide mb-3">Sin fecha límite ({sinFecha.length})</p>
          <div className="divide-y divide-gray-100 border border-gray-200 rounded">
            {sinFecha.map(t => (
              <TareaRow key={t.id} t={t} autoNombre={autoNombre} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Main export ───────────────────────────────────────────────────────────────

export default function TareasClient({ tareas, vehicles }: { tareas: any[]; vehicles: any[] }) {
  const [view, setView] = useState<'lista' | 'calendario'>('lista')

  const pendientes  = tareas.filter(t => t.estado === 'pendiente' || t.estado === 'en_curso')
  const completadas = tareas.filter(t => t.estado === 'completada')

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-baseline gap-3">
          <h1 className="text-xl font-semibold">Tareas</h1>
          <span className="text-sm text-gray-400">{pendientes.length} pendientes · {completadas.length} completadas</span>
        </div>

        {/* Toggle */}
        <div className="flex border border-gray-200 rounded overflow-hidden">
          <button
            onClick={() => setView('lista')}
            className={`px-3 py-1.5 text-xs transition-colors ${
              view === 'lista' ? 'bg-gray-900 text-white' : 'text-gray-500 hover:bg-gray-50'
            }`}
          >
            Lista
          </button>
          <button
            onClick={() => setView('calendario')}
            className={`px-3 py-1.5 text-xs transition-colors border-l border-gray-200 ${
              view === 'calendario' ? 'bg-gray-900 text-white' : 'text-gray-500 hover:bg-gray-50'
            }`}
          >
            Calendario
          </button>
        </div>
      </div>

      {view === 'lista'
        ? <ListView tareas={tareas} vehicles={vehicles} />
        : <CalendarView tareas={tareas} vehicles={vehicles} />
      }
    </div>
  )
}
