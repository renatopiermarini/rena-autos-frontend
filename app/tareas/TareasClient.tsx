'use client'
import { useState, Fragment } from 'react'
import { useRouter } from 'next/navigation'

// ── Constants ─────────────────────────────────────────────────────────────────

const PRIORIDAD_RANK: Record<string, number> = { urgente: 0, alta: 1, media: 2, baja: 3 }

const PRIORIDAD_LEFT: Record<string, string> = {
  urgente: 'border-l-[3px] border-red-500',
  alta:    'border-l-[3px] border-orange-400',
  media:   'border-l-[3px] border-yellow-400',
  baja:    'border-l-[3px] border-gray-200',
}

const PRIORIDAD_DOT: Record<string, string> = {
  urgente: 'bg-red-500',
  alta:    'bg-orange-400',
  media:   'bg-yellow-400',
  baja:    'bg-gray-300',
}

const PRIORIDAD_CARD: Record<string, string> = {
  urgente: 'bg-red-50 border-l-[3px] border-red-500 text-red-900',
  alta:    'bg-orange-50 border-l-[3px] border-orange-400 text-orange-900',
  media:   'bg-yellow-50 border-l-[3px] border-yellow-400 text-yellow-900',
  baja:    'bg-gray-50 border-l-[3px] border-gray-300 text-gray-600',
}

const ESTADO_BADGE: Record<string, string> = {
  pendiente: 'bg-yellow-100 text-yellow-700',
  en_curso:  'bg-blue-100 text-blue-700',
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
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' })
}
function fmtHora(iso: string) {
  if (!iso || !iso.includes('T')) return ''
  const [, time] = iso.split('T')
  if (!time) return ''
  const [h, m] = time.split(':')
  return `${h}:${m}`
}
function fmtFechaLarga(isoDay: string) {
  return new Date(isoDay + 'T12:00:00').toLocaleDateString('es-AR', {
    weekday: 'long', day: 'numeric', month: 'long',
  })
}

// ── Asignado badge ────────────────────────────────────────────────────────────

function AsignadoBadge({ nombre, size = 'sm' }: { nombre: string; size?: 'sm' | 'xs' }) {
  if (!nombre) return null
  const isRena = nombre.toLowerCase() === 'rena'
  const isFran = nombre.toLowerCase() === 'fran'
  const style = isRena
    ? 'bg-gray-900 text-white'
    : isFran
    ? 'bg-blue-600 text-white'
    : 'bg-gray-200 text-gray-700'
  const pad = size === 'xs' ? 'px-1.5 py-0 text-[10px]' : 'px-2 py-0.5 text-xs'
  return (
    <span className={`${style} ${pad} rounded-full font-medium capitalize leading-tight`}>
      {nombre}
    </span>
  )
}

// ── TareaRow ──────────────────────────────────────────────────────────────────

function TareaRow({ t, autoNombre }: { t: any; autoNombre: (id: number | null) => string | null }) {
  const router  = useRouter()
  const [completing, setCompleting] = useState(false)

  const auto   = autoNombre(t.vehicle_id)
  const left   = PRIORIDAD_LEFT[t.prioridad] ?? PRIORIDAD_LEFT['baja']
  const dot    = PRIORIDAD_DOT[t.prioridad]  ?? PRIORIDAD_DOT['baja']
  const estado = t.estado !== 'completada' ? ESTADO_BADGE[t.estado] : null
  const isPendiente = t.estado !== 'completada'

  async function completar(e: React.MouseEvent) {
    e.stopPropagation()
    setCompleting(true)
    const res = await fetch(`/api/db/tareas?id=${t.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        estado: 'completada',
        completado_por: 'rena',
        fecha_completado: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }),
    })
    setCompleting(false)
    if (res.ok) router.refresh()
  }

  return (
    <div className={`flex items-start justify-between px-4 py-3 ${left}`}>
      <div className="flex-1 min-w-0">
        {/* Top row: dot + título */}
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full shrink-0 ${dot}`} />
          <p className="text-sm font-medium leading-snug">{t.titulo}</p>
        </div>
        {/* Bottom row: tipo + estado + auto */}
        <div className="flex items-center gap-2 mt-1 flex-wrap pl-4">
          {t.tipo && (
            <span className="text-xs text-gray-400">{TIPO_LABEL[t.tipo] ?? t.tipo}</span>
          )}
          {estado && (
            <span className={`text-xs px-1.5 py-0 rounded-full ${estado}`}>
              {t.estado.replace(/_/g, ' ')}
            </span>
          )}
          {auto && <span className="text-xs text-gray-400 truncate">{auto}</span>}
        </div>
      </div>
      {/* Right: asignado + fecha + completar */}
      <div className="flex items-center gap-2 ml-4 shrink-0">
        {t.asignado && <AsignadoBadge nombre={t.asignado} />}
        {t.fecha_vencimiento && (
          <span className="text-xs text-gray-400 tabular-nums">
            {fmtFecha(t.fecha_vencimiento)}{fmtHora(t.fecha_vencimiento) && ` ${fmtHora(t.fecha_vencimiento)}`}
          </span>
        )}
        {isPendiente && (
          <button
            onClick={completar}
            disabled={completing}
            title="Marcar como completada"
            className="text-gray-300 hover:text-green-600 transition-colors text-base disabled:opacity-50"
          >
            {completing ? '…' : '✓'}
          </button>
        )}
      </div>
    </div>
  )
}

// ── List view ─────────────────────────────────────────────────────────────────

type SortMode = 'prioridad' | 'vence' | 'auto' | 'persona'

function ListView({ tareas, vehicles }: { tareas: any[]; vehicles: any[] }) {
  const [sort, setSort] = useState<SortMode>('prioridad')

  function autoNombre(id: number | null) {
    if (!id) return null
    const v = vehicles.find((v: any) => v.id === id)
    return v ? `${v.marca} ${v.modelo} ${v.año}` : null
  }

  const activas     = tareas.filter(t => t.estado !== 'completada')
  const completadas = tareas.filter(t => t.estado === 'completada')

  // prioridad
  const byPrioridad = () => {
    const grupos: Record<string, any[]> = { urgente: [], alta: [], media: [], baja: [] }
    for (const t of activas) {
      const p = t.prioridad ?? 'baja'
      ;(grupos[p] ?? grupos['baja']).push(t)
    }
    return Object.entries(grupos).filter(([, ts]) => ts.length > 0)
  }
  const PRIORIDAD_LABEL: Record<string, string> = {
    urgente: 'Urgente', alta: 'Alta', media: 'Media', baja: 'Baja',
  }
  const PRIORIDAD_BORDER: Record<string, string> = {
    urgente: 'border-red-200', alta: 'border-orange-100', media: 'border-gray-200', baja: 'border-gray-200',
  }

  // vence antes
  const byVence = () => ({
    conFecha: activas.filter(t => t.fecha_vencimiento).sort((a, b) => a.fecha_vencimiento.localeCompare(b.fecha_vencimiento)),
    sinFecha: activas.filter(t => !t.fecha_vencimiento).sort((a, b) => (PRIORIDAD_RANK[a.prioridad] ?? 3) - (PRIORIDAD_RANK[b.prioridad] ?? 3)),
  })

  // por auto
  const byAuto = () => {
    const grupos: Record<string, { label: string; tasks: any[] }> = {}
    for (const t of activas) {
      const key = String(t.vehicle_id ?? 'sin_auto')
      if (!grupos[key]) grupos[key] = { label: autoNombre(t.vehicle_id) ?? 'Sin auto', tasks: [] }
      grupos[key].tasks.push(t)
    }
    return Object.entries(grupos).sort(([ka], [kb]) => {
      if (ka === 'sin_auto') return 1
      if (kb === 'sin_auto') return -1
      return grupos[ka].label.localeCompare(grupos[kb].label)
    })
  }

  // por persona
  const byPersona = () => {
    const orden = ['rena', 'fran']
    const grupos: Record<string, any[]> = { rena: [], fran: [], sin_asignar: [] }
    for (const t of activas) {
      const a = (t.asignado ?? '').toLowerCase()
      if (a === 'rena') grupos['rena'].push(t)
      else if (a === 'fran') grupos['fran'].push(t)
      else grupos['sin_asignar'].push(t)
    }
    const entries = orden
      .filter(k => grupos[k].length > 0)
      .map(k => [k, grupos[k]] as [string, any[]])
    if (grupos['sin_asignar'].length > 0) entries.push(['sin_asignar', grupos['sin_asignar']])
    return entries
  }

  const PERSONA_LABEL: Record<string, string> = {
    rena: 'Rena', fran: 'Fran', sin_asignar: 'Sin asignar',
  }
  const PERSONA_HEADER: Record<string, string> = {
    rena: 'text-gray-900',
    fran: 'text-blue-600',
    sin_asignar: 'text-gray-400',
  }

  const SORT_OPTIONS: { key: SortMode; label: string }[] = [
    { key: 'prioridad', label: 'Prioridad' },
    { key: 'vence',     label: 'Vence antes' },
    { key: 'auto',      label: 'Por auto' },
    { key: 'persona',   label: 'Por persona' },
  ]

  return (
    <div className="space-y-6">
      {/* Sort controls */}
      <div className="flex items-center gap-2 flex-wrap">
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
        <div className="space-y-6">
          {byPrioridad().map(([p, ts]) => (
            <section key={p}>
              <p className="text-xs text-gray-400 uppercase tracking-wide mb-2">
                {PRIORIDAD_LABEL[p]} ({ts.length})
              </p>
              <div className={`divide-y divide-gray-100 border rounded overflow-hidden ${PRIORIDAD_BORDER[p]}`}>
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
          <div className="space-y-6">
            {conFecha.length > 0 && (
              <section>
                <p className="text-xs text-gray-400 uppercase tracking-wide mb-2">Con fecha límite ({conFecha.length})</p>
                <div className="divide-y divide-gray-100 border border-gray-200 rounded overflow-hidden">
                  {conFecha.map(t => <TareaRow key={t.id} t={t} autoNombre={autoNombre} />)}
                </div>
              </section>
            )}
            {sinFecha.length > 0 && (
              <section>
                <p className="text-xs text-gray-400 uppercase tracking-wide mb-2">Sin fecha ({sinFecha.length})</p>
                <div className="divide-y divide-gray-100 border border-gray-200 rounded overflow-hidden">
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
        <div className="space-y-6">
          {byAuto().map(([key, { label, tasks }]) => (
            <section key={key}>
              <p className="text-xs text-gray-400 uppercase tracking-wide mb-2">{label} ({tasks.length})</p>
              <div className="divide-y divide-gray-100 border border-gray-200 rounded overflow-hidden">
                {tasks
                  .sort((a, b) => (PRIORIDAD_RANK[a.prioridad] ?? 3) - (PRIORIDAD_RANK[b.prioridad] ?? 3))
                  .map(t => <TareaRow key={t.id} t={t} autoNombre={autoNombre} />)}
              </div>
            </section>
          ))}
          {activas.length === 0 && <p className="text-sm text-gray-400">Sin tareas pendientes.</p>}
        </div>
      )}

      {/* Por persona */}
      {sort === 'persona' && (
        <div className="space-y-6">
          {byPersona().map(([persona, tasks]) => (
            <section key={persona}>
              <div className="flex items-center gap-2 mb-2">
                {persona !== 'sin_asignar'
                  ? <AsignadoBadge nombre={persona} />
                  : <span className="text-xs text-gray-400 uppercase tracking-wide">Sin asignar</span>
                }
                <span className={`text-xs ${PERSONA_HEADER[persona]}`}>({tasks.length})</span>
              </div>
              <div className="divide-y divide-gray-100 border border-gray-200 rounded overflow-hidden">
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
          <p className="text-xs text-gray-400 uppercase tracking-wide mb-2">Completadas recientes</p>
          <div className="divide-y divide-gray-100 border border-gray-200 rounded overflow-hidden">
            {completadas.slice(0, 10).map(t => (
              <div key={t.id} className="flex items-center justify-between px-4 py-2 border-l-[3px] border-gray-100">
                <span className="text-sm text-gray-400 line-through">{t.titulo}</span>
                <div className="flex items-center gap-2 text-xs text-gray-400">
                  {t.completado_por && <AsignadoBadge nombre={t.completado_por} size="xs" />}
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

// ── Calendar ──────────────────────────────────────────────────────────────────

const MAX_CARDS = 3

function TaskCard({ t }: { t: any }) {
  const style  = PRIORIDAD_CARD[t.prioridad] ?? PRIORIDAD_CARD['baja']
  const isRena = t.asignado?.toLowerCase() === 'rena'
  const isFran = t.asignado?.toLowerCase() === 'fran'
  const initStyle = isRena
    ? 'bg-gray-900 text-white'
    : isFran
    ? 'bg-blue-600 text-white'
    : 'bg-white/60 text-gray-500'

  const hora = fmtHora(t.fecha_vencimiento)
  return (
    <div className={`${style} rounded px-1.5 py-0.5 text-xs leading-snug flex items-center gap-1`} title={t.titulo}>
      {hora && <span className="font-semibold shrink-0">{hora}</span>}
      <span className="truncate flex-1">{t.titulo}</span>
      {t.asignado && (
        <span className={`${initStyle} rounded-full w-3.5 h-3.5 flex items-center justify-center text-[9px] font-bold shrink-0`}>
          {t.asignado[0].toUpperCase()}
        </span>
      )}
    </div>
  )
}

function CalendarView({ tareas, vehicles }: { tareas: any[]; vehicles: any[] }) {
  const now = new Date()
  const [year, setYear]         = useState(now.getFullYear())
  const [month, setMonth]       = useState(now.getMonth())
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
    if (!t.fecha_vencimiento) { sinFecha.push(t); continue }
    const key = t.fecha_vencimiento.slice(0, 10)
    if (!tasksByDay[key]) tasksByDay[key] = []
    tasksByDay[key].push(t)
  }
  for (const key of Object.keys(tasksByDay)) {
    tasksByDay[key].sort((a, b) => (PRIORIDAD_RANK[a.prioridad] ?? 3) - (PRIORIDAD_RANK[b.prioridad] ?? 3))
  }

  const firstDay    = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const todayKey    = [now.getFullYear(), String(now.getMonth()+1).padStart(2,'0'), String(now.getDate()).padStart(2,'0')].join('-')

  function dayKey(d: number) {
    return `${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`
  }
  function prevMonth() {
    if (month === 0) { setYear(y => y-1); setMonth(11) } else setMonth(m => m-1)
    setSelected(null); setExpandedDays(new Set())
  }
  function nextMonth() {
    if (month === 11) { setYear(y => y+1); setMonth(0) } else setMonth(m => m+1)
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
      <div className="flex items-center gap-3">
        <button onClick={prevMonth} className="text-gray-400 hover:text-gray-700 w-7 h-7 flex items-center justify-center rounded hover:bg-gray-100 transition-colors text-sm">←</button>
        <span className="text-sm font-medium w-44 text-center">{MESES[month]} {year}</span>
        <button onClick={nextMonth} className="text-gray-400 hover:text-gray-700 w-7 h-7 flex items-center justify-center rounded hover:bg-gray-100 transition-colors text-sm">→</button>
        <button
          onClick={() => { setYear(now.getFullYear()); setMonth(now.getMonth()); setSelected(todayKey) }}
          className="ml-2 text-xs text-gray-400 hover:text-gray-700 px-2 py-1 rounded border border-gray-200 hover:border-gray-400 transition-colors"
        >Hoy</button>
      </div>

      <div className="border border-gray-200 rounded overflow-hidden">
        <div className="grid grid-cols-7 bg-gray-50 border-b border-gray-200">
          {DIAS.map(d => <div key={d} className="py-2 text-center text-xs text-gray-500 font-medium">{d}</div>)}
        </div>
        <div className="divide-y divide-gray-100">
          {Array.from({ length: cells.length / 7 }, (_, row) => (
            <div key={row} className="grid grid-cols-7 divide-x divide-gray-100">
              {cells.slice(row*7, row*7+7).map((day, col) => {
                if (day === null) return <div key={`empty-${row}-${col}`} className="min-h-28 bg-gray-50/60 p-1" />
                const key       = dayKey(day)
                const dayTasks  = tasksByDay[key] ?? []
                const isToday   = key === todayKey
                const isSel     = key === selected
                const isExp     = expandedDays.has(key)
                const shown     = isExp ? dayTasks : dayTasks.slice(0, MAX_CARDS)
                const hidden    = dayTasks.length - MAX_CARDS
                return (
                  <div
                    key={key}
                    onClick={() => setSelected(isSel ? null : key)}
                    className={`min-h-28 p-1.5 cursor-pointer transition-colors ${
                      isSel ? 'bg-gray-900/5 ring-1 ring-inset ring-gray-900' : isToday ? 'bg-blue-50/70' : 'hover:bg-gray-50'
                    }`}
                  >
                    <div className="mb-1">
                      <span className={`text-xs font-semibold w-5 h-5 flex items-center justify-center rounded-full ${
                        isToday ? 'bg-blue-600 text-white' : isSel ? 'text-gray-900' : 'text-gray-500'
                      }`}>{day}</span>
                    </div>
                    <div className="space-y-0.5">
                      {shown.map(t => <TaskCard key={t.id} t={t} />)}
                      {!isExp && hidden > 0 && (
                        <button onClick={e => toggleExpand(key, e)} className="text-xs text-gray-400 hover:text-gray-700 pl-1">
                          +{hidden} más
                        </button>
                      )}
                      {isExp && hidden > 0 && (
                        <button onClick={e => toggleExpand(key, e)} className="text-xs text-gray-400 hover:text-gray-700 pl-1">
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

      {selected && (
        <div>
          <p className="text-xs text-gray-400 uppercase tracking-wide mb-3">
            {fmtFechaLarga(selected)}
            {selectedTasks.length > 0 && ` — ${selectedTasks.length} tarea${selectedTasks.length !== 1 ? 's' : ''}`}
          </p>
          {selectedTasks.length === 0
            ? <p className="text-sm text-gray-400">Sin tareas para este día.</p>
            : <div className="divide-y divide-gray-100 border border-gray-200 rounded overflow-hidden">
                {selectedTasks.map(t => <TareaRow key={t.id} t={t} autoNombre={autoNombre} />)}
              </div>
          }
        </div>
      )}

      {sinFecha.length > 0 && (
        <div>
          <p className="text-xs text-gray-400 uppercase tracking-wide mb-2">Sin fecha límite ({sinFecha.length})</p>
          <div className="divide-y divide-gray-100 border border-gray-200 rounded overflow-hidden">
            {sinFecha.map(t => <TareaRow key={t.id} t={t} autoNombre={autoNombre} />)}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Nueva Tarea form ──────────────────────────────────────────────────────────

const inputCls = 'w-full border border-gray-200 rounded px-2 py-1.5 text-sm focus:outline-none focus:border-gray-400'
const labelCls = 'block text-xs text-gray-400 mb-1'

function NuevaTareaForm({ vehicles, onClose }: { vehicles: any[]; onClose: () => void }) {
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState('')
  const [form, setForm] = useState({
    titulo:       '',
    descripcion:  '',
    tipo:         'otro',
    prioridad:    'media',
    asignado:     'rena',
    vehicle_id:   '',
    fecha_vencimiento: '',
  })

  function set(field: string) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setForm(f => ({ ...f, [field]: e.target.value }))
  }

  async function save() {
    if (!form.titulo.trim()) { setError('El título es requerido.'); return }
    setSaving(true)
    setError('')
    const payload: Record<string, any> = {
      titulo:      form.titulo.trim(),
      tipo:        form.tipo,
      prioridad:   form.prioridad,
      asignado:    form.asignado || null,
      estado:      'pendiente',
      created_at:  new Date().toISOString(),
      updated_at:  new Date().toISOString(),
    }
    if (form.descripcion.trim()) payload.descripcion  = form.descripcion.trim()
    if (form.vehicle_id)         payload.vehicle_id   = Number(form.vehicle_id)
    if (form.fecha_vencimiento)       payload.fecha_vencimiento = form.fecha_vencimiento
    const res = await fetch('/api/db/tareas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    setSaving(false)
    if (res.ok) { onClose(); router.refresh() }
    else setError('Error al guardar. Intentá de nuevo.')
  }

  return (
    <div className="border border-gray-200 rounded p-4 bg-gray-50 space-y-4">
      <p className="text-sm font-medium text-gray-700">Nueva tarea</p>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-3">
        <div className="col-span-2 sm:col-span-3">
          <label className={labelCls}>Título *</label>
          <input type="text" value={form.titulo} onChange={set('titulo')} className={inputCls} placeholder="Ej: Lavar el Audi A3" />
        </div>
        <div>
          <label className={labelCls}>Tipo</label>
          <select value={form.tipo} onChange={set('tipo')} className={inputCls}>
            <option value="lavado">Lavado</option>
            <option value="fotos">Fotos</option>
            <option value="publicacion">Publicación</option>
            <option value="tramite">Trámite</option>
            <option value="seguimiento">Seguimiento</option>
            <option value="otro">Otro</option>
          </select>
        </div>
        <div>
          <label className={labelCls}>Prioridad</label>
          <select value={form.prioridad} onChange={set('prioridad')} className={inputCls}>
            <option value="urgente">Urgente</option>
            <option value="alta">Alta</option>
            <option value="media">Media</option>
            <option value="baja">Baja</option>
          </select>
        </div>
        <div>
          <label className={labelCls}>Asignado</label>
          <select value={form.asignado} onChange={set('asignado')} className={inputCls}>
            <option value="rena">Rena</option>
            <option value="fran">Fran</option>
            <option value="">Sin asignar</option>
          </select>
        </div>
        <div>
          <label className={labelCls}>Auto (opcional)</label>
          <select value={form.vehicle_id} onChange={set('vehicle_id')} className={inputCls}>
            <option value="">—</option>
            {vehicles
              .filter(v => v.estado !== 'vendido')
              .map(v => (
                <option key={v.id} value={v.id}>
                  {v.marca} {v.modelo} {v.año}
                </option>
              ))}
          </select>
        </div>
        <div>
          <label className={labelCls}>Fecha límite (opcional)</label>
          <input type="date" value={form.fecha_vencimiento} onChange={set('fecha_vencimiento')} className={inputCls} />
        </div>
        <div className="col-span-2 sm:col-span-3">
          <label className={labelCls}>Descripción (opcional)</label>
          <textarea value={form.descripcion} onChange={set('descripcion')} rows={2} className={`${inputCls} resize-none`} />
        </div>
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
      <div className="flex gap-2">
        <button
          onClick={save}
          disabled={saving}
          className="px-4 py-1.5 bg-gray-900 text-white text-sm rounded hover:bg-gray-700 disabled:opacity-50 transition-colors"
        >
          {saving ? 'Guardando…' : 'Guardar'}
        </button>
        <button
          onClick={onClose}
          className="px-4 py-1.5 border border-gray-200 text-sm rounded hover:bg-gray-100 transition-colors"
        >
          Cancelar
        </button>
      </div>
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function TareasClient({ tareas, vehicles }: { tareas: any[]; vehicles: any[] }) {
  const [view,        setView]        = useState<'lista' | 'calendario'>('lista')
  const [showNueva,   setShowNueva]   = useState(false)

  const pendientes  = tareas.filter(t => t.estado === 'pendiente' || t.estado === 'en_curso')
  const completadas = tareas.filter(t => t.estado === 'completada')

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-baseline gap-3">
          <h1 className="text-xl font-semibold">Tareas</h1>
          <span className="text-sm text-gray-400">{pendientes.length} pendientes · {completadas.length} completadas</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowNueva(v => !v)}
            className={`text-xs px-3 py-1.5 rounded border transition-colors ${
              showNueva ? 'bg-gray-900 text-white border-gray-900' : 'border-gray-200 text-gray-500 hover:border-gray-400'
            }`}
          >
            + Nueva tarea
          </button>
          <div className="flex border border-gray-200 rounded overflow-hidden">
            <button
              onClick={() => setView('lista')}
              className={`px-3 py-1.5 text-xs transition-colors ${view === 'lista' ? 'bg-gray-900 text-white' : 'text-gray-500 hover:bg-gray-50'}`}
            >Lista</button>
            <button
              onClick={() => setView('calendario')}
              className={`px-3 py-1.5 text-xs transition-colors border-l border-gray-200 ${view === 'calendario' ? 'bg-gray-900 text-white' : 'text-gray-500 hover:bg-gray-50'}`}
            >Calendario</button>
          </div>
        </div>
      </div>

      {showNueva && (
        <NuevaTareaForm vehicles={vehicles} onClose={() => setShowNueva(false)} />
      )}

      {view === 'lista'
        ? <ListView tareas={tareas} vehicles={vehicles} />
        : <CalendarView tareas={tareas} vehicles={vehicles} />
      }
    </div>
  )
}
