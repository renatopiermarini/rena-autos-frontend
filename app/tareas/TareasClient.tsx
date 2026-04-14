'use client'
import { useState } from 'react'

// ── Constants ─────────────────────────────────────────────────────────────────

const PRIORIDAD_RANK: Record<string, number> = { urgente: 0, alta: 1, media: 2, baja: 3 }

const PRIORIDAD_TEXT: Record<string, string> = {
  alta:    'text-red-600',
  media:   'text-yellow-600',
  baja:    'text-gray-400',
  urgente: 'text-red-700 font-semibold',
}

const PRIORIDAD_CARD: Record<string, string> = {
  urgente: 'bg-red-100 border-l-[3px] border-red-500 text-red-900',
  alta:    'bg-orange-50 border-l-[3px] border-orange-400 text-orange-900',
  media:   'bg-yellow-50 border-l-[3px] border-yellow-400 text-yellow-900',
  baja:    'bg-gray-50  border-l-[3px] border-gray-300   text-gray-600',
}

const ESTADO_COLOR: Record<string, string> = {
  pendiente: 'bg-yellow-100 text-yellow-800',
  en_curso:  'bg-blue-100 text-blue-800',
  completada:'bg-gray-100 text-gray-400',
}

const TIPO_LABEL: Record<string, string> = {
  lavado:      'Lavado',
  fotos:       'Fotos',
  publicacion: 'Publicación',
  tramite:     'Trámite',
  seguimiento: 'Seguimiento',
  otro:        'Otro',
}

const DIAS  = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb']
const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']

function fmtFecha(iso: string) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit' })
}

function fmtFechaLarga(isoDay: string) {
  return new Date(isoDay + 'T12:00:00').toLocaleDateString('es-AR', {
    weekday: 'long', day: 'numeric', month: 'long',
  })
}

// ── Shared TareaRow ───────────────────────────────────────────────────────────

function TareaRow({ t, autoNombre }: { t: any; autoNombre: (id: number | null) => string | null }) {
  const auto = autoNombre(t.vehicle_id)
  return (
    <div className="flex items-start justify-between px-4 py-3">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`text-xs font-medium ${PRIORIDAD_TEXT[t.prioridad] ?? 'text-gray-500'}`}>
            {(t.prioridad ?? 'baja').toUpperCase()}
          </span>
          {t.tipo && <span className="text-xs text-gray-400">{TIPO_LABEL[t.tipo] ?? t.tipo}</span>}
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

// ── List view ─────────────────────────────────────────────────────────────────

type SortMode = 'prioridad' | 'vence' | 'auto'

function ListView({ tareas, vehicles }: { tareas: any[]; vehicles: any[] }) {
  const [sort, setSort] = useState<SortMode>('prioridad')

  function autoNombre(id: number | null) {
    if (!id) return null
    const v = vehicles.find((v: any) => v.id === id)
    return v ? `${v.marca} ${v.modelo} ${v.año}` : null
  }

  const activas    = tareas.filter(t => t.estado !== 'completada')
  const completadas = tareas.filter(t => t.estado === 'completada')

  // ── Sort: prioridad ──────────────────────────────────────────────────────────
  const byPrioridad = () => {
    const grupos: Record<string, any[]> = { urgente: [], alta: [], media: [], baja: [] }
    for (const t of activas) {
      const p = t.prioridad ?? 'baja'
      ;(grupos[p] ?? (grupos['baja'])).push(t)
    }
    return Object.entries(grupos).filter(([, ts]) => ts.length > 0)
  }

  const PRIORIDAD_LABEL: Record<string, string> = {
    urgente: 'Urgente',
    alta:    'Alta prioridad',
    media:   'Media prioridad',
    baja:    'Baja prioridad',
  }
  const PRIORIDAD_BORDER: Record<string, string> = {
    urgente: 'border-red-200',
    alta:    'border-red-100',
    media:   'border-gray-200',
    baja:    'border-gray-200',
  }

  // ── Sort: vence antes ────────────────────────────────────────────────────────
  const byVence = () => {
    const conFecha = activas
      .filter(t => t.fecha_limite)
      .sort((a, b) => a.fecha_limite.localeCompare(b.fecha_limite))
    const sinFecha = activas.filter(t => !t.fecha_limite)
      .sort((a, b) => (PRIORIDAD_RANK[a.prioridad] ?? 3) - (PRIORIDAD_RANK[b.prioridad] ?? 3))
    return { conFecha, sinFecha }
  }

  // ── Sort: por auto ───────────────────────────────────────────────────────────
  const byAuto = () => {
    const grupos: Record<string, { label: string; tasks: any[] }> = {}
    for (const t of activas) {
      const key = String(t.vehicle_id ?? 'sin_auto')
      if (!grupos[key]) {
        grupos[key] = {
          label: autoNombre(t.vehicle_id) ?? 'Sin auto',
          tasks: [],
        }
      }
      grupos[key].tasks.push(t)
    }
    // Sort groups: named autos first, then "Sin auto"
    return Object.entries(grupos).sort(([ka], [kb]) => {
      if (ka === 'sin_auto') return 1
      if (kb === 'sin_auto') return -1
      return grupos[ka].label.localeCompare(grupos[kb].label)
    })
  }

  const SORT_OPTIONS: { key: SortMode; label: string }[] = [
    { key: 'prioridad', label: 'Prioridad' },
    { key: 'vence',     label: 'Vence antes' },
    { key: 'auto',      label: 'Por auto' },
  ]

  return (
    <div className="space-y-6">
      {/* Sort controls */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-gray-400 mr-1">Ordenar:</span>
        {SORT_OPTIONS.map(o => (
          <button
            key={o.key}
            onClick={() => setSort(o.key)}
            className={`text-xs px-3 py-1 rounded-full border transition-colors ${
              sort === o.key
                ? 'bg-gray-900 text-white border-gray-900'
                : 'border-gray-200 text-gray-500 hover:border-gray-400'
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>

      {/* Prioridad */}
      {sort === 'prioridad' && (
        <div className="space-y-8">
          {byPrioridad().map(([p, ts]) => (
            <section key={p}>
              <p className="text-xs text-gray-400 uppercase tracking-wide mb-3">
                {PRIORIDAD_LABEL[p] ?? p} ({ts.length})
              </p>
              <div className={`divide-y divide-gray-100 border rounded ${PRIORIDAD_BORDER[p]}`}>
                {ts.map(t => <TareaRow key={t.id} t={t} autoNombre={autoNombre} />)}
              </div>
            </section>
          ))}
          {activas.length === 0 && <p className="text-sm text-gray-400">Sin tareas pendientes.</p>}
        </div>
      )}

      {/* Vence antes */}
      {sort === 'vence' && (() => {
        const { conFecha, sinFecha } = byVence()
        return (
          <div className="space-y-8">
            {conFecha.length > 0 && (
              <section>
                <p className="text-xs text-gray-400 uppercase tracking-wide mb-3">Con fecha límite ({conFecha.length})</p>
                <div className="divide-y divide-gray-100 border border-gray-200 rounded">
                  {conFecha.map(t => <TareaRow key={t.id} t={t} autoNombre={autoNombre} />)}
                </div>
              </section>
            )}
            {sinFecha.length > 0 && (
              <section>
                <p className="text-xs text-gray-400 uppercase tracking-wide mb-3">Sin fecha límite ({sinFecha.length})</p>
                <div className="divide-y divide-gray-100 border border-gray-200 rounded">
                  {sinFecha.map(t => <TareaRow key={t.id} t={t} autoNombre={autoNombre} />)}
                </div>
              </section>
            )}
            {activas.length === 0 && <p className="text-sm text-gray-400">Sin tareas pendientes.</p>}
          </div>
        )
      })()}

      {/* Por auto */}
      {sort === 'auto' && (
        <div className="space-y-8">
          {byAuto().map(([key, { label, tasks }]) => (
            <section key={key}>
              <p className="text-xs text-gray-400 uppercase tracking-wide mb-3">{label} ({tasks.length})</p>
              <div className="divide-y divide-gray-100 border border-gray-200 rounded">
                {tasks
                  .sort((a, b) => (PRIORIDAD_RANK[a.prioridad] ?? 3) - (PRIORIDAD_RANK[b.prioridad] ?? 3))
                  .map(t => <TareaRow key={t.id} t={t} autoNombre={autoNombre} />)}
              </div>
            </section>
          ))}
          {activas.length === 0 && <p className="text-sm text-gray-400">Sin tareas pendientes.</p>}
        </div>
      )}

      {/* Completadas */}
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

const MAX_CARDS = 3 // cards shown in cell before "+N más"

function TaskCard({ t }: { t: any }) {
  const style = PRIORIDAD_CARD[t.prioridad] ?? PRIORIDAD_CARD['baja']
  return (
    <div className={`${style} rounded px-1.5 py-0.5 text-xs leading-snug truncate`} title={t.titulo}>
      {t.titulo}
    </div>
  )
}

function CalendarView({ tareas, vehicles }: { tareas: any[]; vehicles: any[] }) {
  const now = new Date()
  const [year, setYear]     = useState(now.getFullYear())
  const [month, setMonth]   = useState(now.getMonth())
  const [selected, setSelected] = useState<string | null>(null)
  const [expandedDays, setExpandedDays] = useState<Set<string>>(new Set())

  function autoNombre(id: number | null) {
    if (!id) return null
    const v = vehicles.find((v: any) => v.id === id)
    return v ? `${v.marca} ${v.modelo} ${v.año}` : null
  }

  const activas = tareas.filter(t => t.estado !== 'completada')

  const tasksByDay: Record<string, any[]> = {}
  const sinFecha: any[] = []
  for (const t of activas) {
    if (!t.fecha_limite) { sinFecha.push(t); continue }
    const key = t.fecha_limite.slice(0, 10)
    if (!tasksByDay[key]) tasksByDay[key] = []
    tasksByDay[key].push(t)
  }
  // Sort each day's tasks by priority
  for (const key of Object.keys(tasksByDay)) {
    tasksByDay[key].sort((a, b) => (PRIORIDAD_RANK[a.prioridad] ?? 3) - (PRIORIDAD_RANK[b.prioridad] ?? 3))
  }

  const firstDay     = new Date(year, month, 1).getDay()
  const daysInMonth  = new Date(year, month + 1, 0).getDate()

  const todayKey = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
  ].join('-')

  function dayKey(d: number) {
    return `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
  }

  function prevMonth() {
    if (month === 0) { setYear(y => y - 1); setMonth(11) } else setMonth(m => m - 1)
    setSelected(null); setExpandedDays(new Set())
  }
  function nextMonth() {
    if (month === 11) { setYear(y => y + 1); setMonth(0) } else setMonth(m => m + 1)
    setSelected(null); setExpandedDays(new Set())
  }

  function toggleExpand(key: string, e: React.MouseEvent) {
    e.stopPropagation()
    setExpandedDays(prev => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })
  }

  const cells: (number | null)[] = [
    ...Array(firstDay).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ]
  while (cells.length % 7 !== 0) cells.push(null)

  const selectedTasks = selected ? (tasksByDay[selected] ?? []) : []

  return (
    <div className="space-y-6">
      {/* Month nav */}
      <div className="flex items-center gap-3">
        <button
          onClick={prevMonth}
          className="text-gray-400 hover:text-gray-700 w-7 h-7 flex items-center justify-center rounded hover:bg-gray-100 transition-colors text-sm"
        >
          ←
        </button>
        <span className="text-sm font-medium w-44 text-center">{MESES[month]} {year}</span>
        <button
          onClick={nextMonth}
          className="text-gray-400 hover:text-gray-700 w-7 h-7 flex items-center justify-center rounded hover:bg-gray-100 transition-colors text-sm"
        >
          →
        </button>
        <button
          onClick={() => { setYear(now.getFullYear()); setMonth(now.getMonth()); setSelected(todayKey) }}
          className="ml-2 text-xs text-gray-400 hover:text-gray-700 px-2 py-1 rounded border border-gray-200 hover:border-gray-400 transition-colors"
        >
          Hoy
        </button>
      </div>

      {/* Grid */}
      <div className="border border-gray-200 rounded overflow-hidden">
        {/* Day name headers */}
        <div className="grid grid-cols-7 bg-gray-50 border-b border-gray-200">
          {DIAS.map(d => (
            <div key={d} className="py-2 text-center text-xs text-gray-500 font-medium">{d}</div>
          ))}
        </div>

        {/* Week rows */}
        <div className="divide-y divide-gray-100">
          {Array.from({ length: cells.length / 7 }, (_, row) => (
            <div key={row} className="grid grid-cols-7 divide-x divide-gray-100">
              {cells.slice(row * 7, row * 7 + 7).map((day, col) => {
                if (day === null) {
                  return (
                    <div
                      key={`empty-${row}-${col}`}
                      className="min-h-28 bg-gray-50/60 p-1"
                    />
                  )
                }
                const key      = dayKey(day)
                const dayTasks = tasksByDay[key] ?? []
                const isToday  = key === todayKey
                const isSelected = key === selected
                const isExpanded = expandedDays.has(key)
                const shown    = isExpanded ? dayTasks : dayTasks.slice(0, MAX_CARDS)
                const hidden   = dayTasks.length - MAX_CARDS

                return (
                  <div
                    key={key}
                    onClick={() => setSelected(isSelected ? null : key)}
                    className={`min-h-28 p-1.5 cursor-pointer transition-colors ${
                      isSelected
                        ? 'bg-gray-900/5 ring-1 ring-inset ring-gray-900'
                        : isToday
                        ? 'bg-blue-50/70'
                        : 'hover:bg-gray-50'
                    }`}
                  >
                    {/* Day number */}
                    <div className="mb-1 flex items-center justify-between">
                      <span
                        className={`text-xs font-semibold w-5 h-5 flex items-center justify-center rounded-full ${
                          isToday
                            ? 'bg-blue-600 text-white'
                            : isSelected
                            ? 'text-gray-900'
                            : 'text-gray-500'
                        }`}
                      >
                        {day}
                      </span>
                    </div>

                    {/* Task cards */}
                    <div className="space-y-0.5">
                      {shown.map(t => <TaskCard key={t.id} t={t} />)}
                      {!isExpanded && hidden > 0 && (
                        <button
                          onClick={(e) => toggleExpand(key, e)}
                          className="text-xs text-gray-400 hover:text-gray-700 pl-1 leading-snug"
                        >
                          +{hidden} más
                        </button>
                      )}
                      {isExpanded && hidden > 0 && (
                        <button
                          onClick={(e) => toggleExpand(key, e)}
                          className="text-xs text-gray-400 hover:text-gray-700 pl-1 leading-snug"
                        >
                          ver menos
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          ))}
        </div>
      </div>

      {/* Selected day detail */}
      {selected && (
        <div>
          <p className="text-xs text-gray-400 uppercase tracking-wide mb-3">
            {fmtFechaLarga(selected)}
            {selectedTasks.length > 0 && ` — ${selectedTasks.length} ${selectedTasks.length === 1 ? 'tarea' : 'tareas'}`}
          </p>
          {selectedTasks.length === 0 ? (
            <p className="text-sm text-gray-400">Sin tareas para este día.</p>
          ) : (
            <div className="divide-y divide-gray-100 border border-gray-200 rounded">
              {selectedTasks.map(t => <TareaRow key={t.id} t={t} autoNombre={autoNombre} />)}
            </div>
          )}
        </div>
      )}

      {/* Sin fecha */}
      {sinFecha.length > 0 && (
        <div>
          <p className="text-xs text-gray-400 uppercase tracking-wide mb-3">Sin fecha límite ({sinFecha.length})</p>
          <div className="divide-y divide-gray-100 border border-gray-200 rounded">
            {sinFecha.map(t => <TareaRow key={t.id} t={t} autoNombre={autoNombre} />)}
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
          <span className="text-sm text-gray-400">
            {pendientes.length} pendientes · {completadas.length} completadas
          </span>
        </div>

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
        ? <ListView  tareas={tareas} vehicles={vehicles} />
        : <CalendarView tareas={tareas} vehicles={vehicles} />
      }
    </div>
  )
}
