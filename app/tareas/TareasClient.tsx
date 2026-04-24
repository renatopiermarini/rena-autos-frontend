'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { patchRecord, postRecord } from '@/lib/kapso'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { toast } from 'sonner'
import { CheckIcon, ChevronLeftIcon, ChevronRightIcon, PlusIcon } from 'lucide-react'

const PRIORIDAD_RANK: Record<string, number> = { urgente: 0, alta: 1, media: 2, baja: 3 }

const PRIORIDAD_DOT: Record<string, string> = {
  urgente: 'bg-red-500',
  alta:    'bg-orange-400',
  media:   'bg-yellow-400',
  baja:    'bg-muted-foreground/40',
}

const PRIORIDAD_BORDER: Record<string, string> = {
  urgente: 'border-l-[3px] border-l-red-500',
  alta:    'border-l-[3px] border-l-orange-400',
  media:   'border-l-[3px] border-l-yellow-400',
  baja:    'border-l-[3px] border-l-border',
}

const PRIORIDAD_CARD: Record<string, string> = {
  urgente: 'bg-red-50 border-l-[3px] border-red-500 text-red-900',
  alta:    'bg-orange-50 border-l-[3px] border-orange-400 text-orange-900',
  media:   'bg-yellow-50 border-l-[3px] border-yellow-400 text-yellow-900',
  baja:    'bg-muted/50 border-l-[3px] border-border text-muted-foreground',
}

const ESTADO_VARIANT: Record<string, 'default' | 'secondary' | 'outline'> = {
  pendiente: 'secondary',
  en_curso:  'default',
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

const nativeSelectCls =
  'h-9 w-full rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50'

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

function AsignadoBadge({ nombre, size = 'sm' }: { nombre: string; size?: 'sm' | 'xs' }) {
  if (!nombre) return null
  const isRena = nombre.toLowerCase() === 'rena'
  const isFran = nombre.toLowerCase() === 'fran'
  const style = isRena
    ? 'bg-foreground text-background'
    : isFran
    ? 'bg-blue-600 text-white'
    : 'bg-muted text-muted-foreground'
  const pad = size === 'xs' ? 'px-1.5 py-0 text-[10px]' : 'px-2 py-0.5 text-xs'
  return (
    <span className={`${style} ${pad} rounded-full font-medium capitalize leading-tight whitespace-nowrap`}>
      {nombre}
    </span>
  )
}

function TareaRow({ t, autoNombre }: { t: any; autoNombre: (id: number | null) => string | null }) {
  const router = useRouter()
  const [completing, setCompleting] = useState(false)

  const auto   = autoNombre(t.vehicle_id)
  const left   = PRIORIDAD_BORDER[t.prioridad] ?? PRIORIDAD_BORDER['baja']
  const dot    = PRIORIDAD_DOT[t.prioridad]    ?? PRIORIDAD_DOT['baja']
  const isPendiente = t.estado !== 'completada'

  async function completar(e: React.MouseEvent) {
    e.stopPropagation()
    setCompleting(true)
    const ok = await patchRecord('tareas', t.id, {
      estado: 'completada',
      completado_por: 'rena',
      fecha_completado: new Date().toISOString(),
    })
    setCompleting(false)
    if (ok) { toast.success('Tarea completada'); router.refresh() }
    else toast.error('Error al completar.')
  }

  return (
    <div className={`flex items-start justify-between px-3 py-2.5 ${left}`}>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full shrink-0 ${dot}`} />
          <p className="text-sm font-medium leading-snug">{t.titulo}</p>
        </div>
        <div className="flex items-center gap-2 mt-1 flex-wrap pl-4">
          {t.tipo && (
            <span className="text-xs text-muted-foreground">{TIPO_LABEL[t.tipo] ?? t.tipo}</span>
          )}
          {isPendiente && ESTADO_VARIANT[t.estado] && (
            <Badge variant={ESTADO_VARIANT[t.estado]} className="text-[10px]">
              {t.estado.replace(/_/g, ' ')}
            </Badge>
          )}
          {auto && <span className="text-xs text-muted-foreground truncate">{auto}</span>}
        </div>
      </div>
      <div className="flex items-center gap-2 ml-3 shrink-0">
        {t.asignado && <AsignadoBadge nombre={t.asignado} />}
        {t.fecha_vencimiento && (
          <span className="text-xs text-muted-foreground tabular-nums">
            {fmtFecha(t.fecha_vencimiento)}{fmtHora(t.fecha_vencimiento) && ` ${fmtHora(t.fecha_vencimiento)}`}
          </span>
        )}
        {isPendiente && (
          <Button
            size="icon-xs"
            variant="ghost"
            onClick={completar}
            disabled={completing}
            title="Marcar como completada"
            className="text-muted-foreground hover:text-emerald-600"
          >
            <CheckIcon className="size-4" />
          </Button>
        )}
      </div>
    </div>
  )
}

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

  const PRIORIDAD_LABEL: Record<string, string> = {
    urgente: 'Urgente', alta: 'Alta', media: 'Media', baja: 'Baja',
  }

  const byPrioridad = () => {
    const grupos: Record<string, any[]> = { urgente: [], alta: [], media: [], baja: [] }
    for (const t of activas) {
      const p = t.prioridad ?? 'baja'
      ;(grupos[p] ?? grupos['baja']).push(t)
    }
    return Object.entries(grupos).filter(([, ts]) => ts.length > 0)
  }

  const byVence = () => ({
    conFecha: activas.filter(t => t.fecha_vencimiento).sort((a, b) => a.fecha_vencimiento.localeCompare(b.fecha_vencimiento)),
    sinFecha: activas.filter(t => !t.fecha_vencimiento).sort((a, b) => (PRIORIDAD_RANK[a.prioridad] ?? 3) - (PRIORIDAD_RANK[b.prioridad] ?? 3)),
  })

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

  const SORT_OPTIONS: { key: SortMode; label: string }[] = [
    { key: 'prioridad', label: 'Prioridad' },
    { key: 'vence',     label: 'Vence antes' },
    { key: 'auto',      label: 'Por auto' },
    { key: 'persona',   label: 'Por persona' },
  ]

  const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <Card size="sm">
      <CardHeader className="border-b py-2.5">
        <CardTitle className="text-xs text-muted-foreground uppercase tracking-wide font-medium">{title}</CardTitle>
      </CardHeader>
      <CardContent className="divide-y divide-border p-0">{children}</CardContent>
    </Card>
  )

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className="text-xs text-muted-foreground mr-1">Ordenar:</span>
        {SORT_OPTIONS.map(o => (
          <Button
            key={o.key}
            size="xs"
            variant={sort === o.key ? 'default' : 'outline'}
            onClick={() => setSort(o.key)}
          >
            {o.label}
          </Button>
        ))}
      </div>

      {sort === 'prioridad' && (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          {byPrioridad().map(([p, ts]) => (
            <Section key={p} title={`${PRIORIDAD_LABEL[p]} (${ts.length})`}>
              {ts.map(t => <TareaRow key={t.id} t={t} autoNombre={autoNombre} />)}
            </Section>
          ))}
          {activas.length === 0 && <p className="text-sm text-muted-foreground">Sin tareas pendientes.</p>}
        </div>
      )}

      {sort === 'vence' && (() => {
        const { conFecha, sinFecha } = byVence()
        return (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            {conFecha.length > 0 && (
              <Section title={`Con fecha límite (${conFecha.length})`}>
                {conFecha.map(t => <TareaRow key={t.id} t={t} autoNombre={autoNombre} />)}
              </Section>
            )}
            {sinFecha.length > 0 && (
              <Section title={`Sin fecha (${sinFecha.length})`}>
                {sinFecha.map(t => <TareaRow key={t.id} t={t} autoNombre={autoNombre} />)}
              </Section>
            )}
            {activas.length === 0 && <p className="text-sm text-muted-foreground">Sin tareas pendientes.</p>}
          </div>
        )
      })()}

      {sort === 'auto' && (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          {byAuto().map(([key, { label, tasks }]) => (
            <Section key={key} title={`${label} (${tasks.length})`}>
              {tasks
                .sort((a, b) => (PRIORIDAD_RANK[a.prioridad] ?? 3) - (PRIORIDAD_RANK[b.prioridad] ?? 3))
                .map(t => <TareaRow key={t.id} t={t} autoNombre={autoNombre} />)}
            </Section>
          ))}
          {activas.length === 0 && <p className="text-sm text-muted-foreground">Sin tareas pendientes.</p>}
        </div>
      )}

      {sort === 'persona' && (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          {byPersona().map(([persona, tasks]) => (
            <Card key={persona} size="sm">
              <CardHeader className="border-b py-2.5">
                <div className="flex items-center gap-2">
                  {persona !== 'sin_asignar'
                    ? <AsignadoBadge nombre={persona} />
                    : <span className="text-xs text-muted-foreground uppercase tracking-wide">Sin asignar</span>
                  }
                  <span className="text-xs text-muted-foreground">({tasks.length})</span>
                </div>
              </CardHeader>
              <CardContent className="divide-y divide-border p-0">
                {tasks
                  .sort((a, b) => (PRIORIDAD_RANK[a.prioridad] ?? 3) - (PRIORIDAD_RANK[b.prioridad] ?? 3))
                  .map(t => <TareaRow key={t.id} t={t} autoNombre={autoNombre} />)}
              </CardContent>
            </Card>
          ))}
          {activas.length === 0 && <p className="text-sm text-muted-foreground">Sin tareas pendientes.</p>}
        </div>
      )}

      {completadas.length > 0 && (
        <Section title="Completadas recientes">
          {completadas.slice(0, 10).map(t => (
            <div key={t.id} className="flex items-center justify-between px-3 py-2 border-l-[3px] border-l-transparent">
              <span className="text-sm text-muted-foreground line-through">{t.titulo}</span>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                {t.completado_por && <AsignadoBadge nombre={t.completado_por} size="xs" />}
                {t.fecha_completado && <span className="tabular-nums">{fmtFecha(t.fecha_completado)}</span>}
              </div>
            </div>
          ))}
        </Section>
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
    ? 'bg-foreground text-background'
    : isFran
    ? 'bg-blue-600 text-white'
    : 'bg-white/60 text-muted-foreground'

  const hora = fmtHora(t.fecha_vencimiento)
  return (
    <div className={`${style} rounded px-1.5 py-0.5 text-xs leading-snug flex items-center gap-1`} title={t.titulo}>
      {hora && <span className="font-semibold shrink-0 tabular-nums">{hora}</span>}
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
    tasksByDay[key].sort((a, b) => {
      const ha = fmtHora(a.fecha_vencimiento)
      const hb = fmtHora(b.fecha_vencimiento)
      if (ha && hb) return ha.localeCompare(hb)
      if (ha) return -1
      if (hb) return 1
      return (PRIORIDAD_RANK[a.prioridad] ?? 3) - (PRIORIDAD_RANK[b.prioridad] ?? 3)
    })
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
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Button size="icon-sm" variant="ghost" onClick={prevMonth}><ChevronLeftIcon className="size-4" /></Button>
        <span className="text-sm font-medium w-44 text-center">{MESES[month]} {year}</span>
        <Button size="icon-sm" variant="ghost" onClick={nextMonth}><ChevronRightIcon className="size-4" /></Button>
        <Button
          size="xs"
          variant="outline"
          onClick={() => { setYear(now.getFullYear()); setMonth(now.getMonth()); setSelected(todayKey) }}
          className="ml-2"
        >Hoy</Button>
      </div>

      <Card size="sm">
        <CardContent className="p-0">
          <div className="grid grid-cols-7 bg-muted/40 border-b">
            {DIAS.map(d => <div key={d} className="py-2 text-center text-xs text-muted-foreground font-medium">{d}</div>)}
          </div>
          <div className="divide-y divide-border">
            {Array.from({ length: cells.length / 7 }, (_, row) => (
              <div key={row} className="grid grid-cols-7 divide-x divide-border">
                {cells.slice(row*7, row*7+7).map((day, col) => {
                  if (day === null) return <div key={`empty-${row}-${col}`} className="min-h-28 bg-muted/20 p-1" />
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
                        isSel ? 'bg-accent ring-1 ring-inset ring-ring' : isToday ? 'bg-blue-50/70' : 'hover:bg-muted/40'
                      }`}
                    >
                      <div className="mb-1">
                        <span className={`text-xs font-semibold w-5 h-5 flex items-center justify-center rounded-full ${
                          isToday ? 'bg-blue-600 text-white' : isSel ? 'text-foreground' : 'text-muted-foreground'
                        }`}>{day}</span>
                      </div>
                      <div className="space-y-0.5">
                        {shown.map(t => <TaskCard key={t.id} t={t} />)}
                        {!isExp && hidden > 0 && (
                          <button onClick={e => toggleExpand(key, e)} className="text-xs text-muted-foreground hover:text-foreground pl-1">
                            +{hidden} más
                          </button>
                        )}
                        {isExp && hidden > 0 && (
                          <button onClick={e => toggleExpand(key, e)} className="text-xs text-muted-foreground hover:text-foreground pl-1">
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
        </CardContent>
      </Card>

      {selected && (
        <Card size="sm">
          <CardHeader className="border-b py-2.5">
            <CardTitle className="text-sm">
              {fmtFechaLarga(selected)}
              {selectedTasks.length > 0 && <span className="text-muted-foreground font-normal ml-2">— {selectedTasks.length} tarea{selectedTasks.length !== 1 ? 's' : ''}</span>}
            </CardTitle>
          </CardHeader>
          <CardContent className="divide-y divide-border p-0">
            {selectedTasks.length === 0
              ? <p className="px-3 py-2.5 text-sm text-muted-foreground">Sin tareas para este día.</p>
              : selectedTasks.map(t => <TareaRow key={t.id} t={t} autoNombre={autoNombre} />)
            }
          </CardContent>
        </Card>
      )}

      {sinFecha.length > 0 && (
        <Card size="sm">
          <CardHeader className="border-b py-2.5">
            <CardTitle className="text-sm">Sin fecha límite ({sinFecha.length})</CardTitle>
          </CardHeader>
          <CardContent className="divide-y divide-border p-0">
            {sinFecha.map(t => <TareaRow key={t.id} t={t} autoNombre={autoNombre} />)}
          </CardContent>
        </Card>
      )}
    </div>
  )
}

// ── Nueva Tarea dialog ────────────────────────────────────────────────────────

function NuevaTareaDialog({
  open, onOpenChange, vehicles,
}: { open: boolean; onOpenChange: (o: boolean) => void; vehicles: any[] }) {
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    titulo: '',
    descripcion: '',
    tipo: 'otro',
    prioridad: 'media',
    asignado: 'rena',
    vehicle_id: '',
    fecha_vencimiento: '',
  })

  function set(field: string, value: string) {
    setForm(f => ({ ...f, [field]: value }))
  }

  async function save() {
    if (!form.titulo.trim()) { toast.error('El título es requerido.'); return }
    setSaving(true)
    const payload: Record<string, any> = {
      titulo:    form.titulo.trim(),
      tipo:      form.tipo,
      prioridad: form.prioridad,
      asignado:  form.asignado || null,
      estado:    'pendiente',
    }
    if (form.descripcion.trim())  payload.descripcion = form.descripcion.trim()
    if (form.vehicle_id)          payload.vehicle_id  = Number(form.vehicle_id)
    if (form.fecha_vencimiento)   payload.fecha_vencimiento = form.fecha_vencimiento
    const res = await postRecord('tareas', payload)
    setSaving(false)
    if (res.ok) {
      toast.success('Tarea creada')
      onOpenChange(false)
      setForm({ titulo: '', descripcion: '', tipo: 'otro', prioridad: 'media', asignado: 'rena', vehicle_id: '', fecha_vencimiento: '' })
      router.refresh()
    } else {
      toast.error('Error al guardar.')
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Nueva tarea</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2 space-y-1.5">
            <Label>Título *</Label>
            <Input value={form.titulo} onChange={e => set('titulo', e.target.value)} placeholder="Ej: Lavar el Audi A3" />
          </div>
          <div className="space-y-1.5">
            <Label>Tipo</Label>
            <select className={nativeSelectCls} value={form.tipo} onChange={e => set('tipo', e.target.value)}>
              <option value="lavado">Lavado</option>
              <option value="fotos">Fotos</option>
              <option value="publicacion">Publicación</option>
              <option value="tramite">Trámite</option>
              <option value="seguimiento">Seguimiento</option>
              <option value="otro">Otro</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <Label>Prioridad</Label>
            <select className={nativeSelectCls} value={form.prioridad} onChange={e => set('prioridad', e.target.value)}>
              <option value="urgente">Urgente</option>
              <option value="alta">Alta</option>
              <option value="media">Media</option>
              <option value="baja">Baja</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <Label>Asignado</Label>
            <select className={nativeSelectCls} value={form.asignado} onChange={e => set('asignado', e.target.value)}>
              <option value="rena">Rena</option>
              <option value="fran">Fran</option>
              <option value="">Sin asignar</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <Label>Auto (opcional)</Label>
            <select className={nativeSelectCls} value={form.vehicle_id} onChange={e => set('vehicle_id', e.target.value)}>
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
          <div className="col-span-2 space-y-1.5">
            <Label>Fecha límite (opcional)</Label>
            <Input type="date" value={form.fecha_vencimiento} onChange={e => set('fecha_vencimiento', e.target.value)} />
          </div>
          <div className="col-span-2 space-y-1.5">
            <Label>Descripción (opcional)</Label>
            <Textarea rows={3} value={form.descripcion} onChange={e => set('descripcion', e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={save} disabled={saving}>{saving ? 'Guardando…' : 'Guardar'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function TareasClient({ tareas, vehicles }: { tareas: any[]; vehicles: any[] }) {
  const [view, setView] = useState<'lista' | 'calendario'>('lista')
  const [showNueva, setShowNueva] = useState(false)

  const pendientes  = tareas.filter(t => t.estado === 'pendiente' || t.estado === 'en_curso')
  const completadas = tareas.filter(t => t.estado === 'completada')

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-baseline gap-3">
          <h1 className="text-xl font-semibold">Tareas</h1>
          <span className="text-sm text-muted-foreground">{pendientes.length} pendientes · {completadas.length} completadas</span>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" onClick={() => setShowNueva(true)}>
            <PlusIcon className="size-4" /> Nueva tarea
          </Button>
          <Tabs value={view} onValueChange={(v: any) => setView(v as any)}>
            <TabsList>
              <TabsTrigger value="lista">Lista</TabsTrigger>
              <TabsTrigger value="calendario">Calendario</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </div>

      <NuevaTareaDialog open={showNueva} onOpenChange={setShowNueva} vehicles={vehicles} />

      {view === 'lista'
        ? <ListView tareas={tareas} vehicles={vehicles} />
        : <CalendarView tareas={tareas} vehicles={vehicles} />
      }
    </div>
  )
}
