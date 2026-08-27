'use client'
import { createContext, useContext, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { patchRecordDetailed, postRecord } from '@/lib/kapso'
import {
  DEFAULT_EQUIPO, DEFAULT_ASSIGNEE, DEFAULT_DESTACADOS, ordenSecciones, miembroPorClave,
  type MiembroEquipo,
} from '@/lib/equipo'
import { fmtDM as fmtFecha, fmtHora, localDayKey, parseAny } from '@/lib/date'
import { MonthGrid } from '@/components/calendar/MonthGrid'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, useDirtyClose } from '@/components/ui/dialog'
import { formSucio } from '@/lib/dirty'
import { toast } from 'sonner'
import { CheckIcon, PlusIcon } from 'lucide-react'

// ── Team config ───────────────────────────────────────────────────────────────
// Quién existe, cómo se lo pinta y en qué orden: sale de la tabla `equipo`
// (lib/equipo.ts), que cae a DEFAULT_EQUIPO —los mismos rena/fran/marshiot que
// estaban acá escritos a mano— cuando la tabla no existe. Las claves son las que
// guarda la columna `asignado` de la DB.
//
// Viaja por contexto y no por prop: el equipo lo necesitan hojas hondas del
// árbol (el badge de cada tarea, la inicial de cada chip del calendario) y
// enhebrar la prop por cada nivel era todo ruido.
type EquipoCtxValue = { equipo: MiembroEquipo[]; defAssignee: string; destacados: string[] }

const EquipoCtx = createContext<EquipoCtxValue>({
  equipo: DEFAULT_EQUIPO,
  defAssignee: DEFAULT_ASSIGNEE,
  destacados: DEFAULT_DESTACADOS,
})

const useEquipo = () => useContext(EquipoCtx)

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
  urgente: 'bg-red-50 border-l-[3px] border-red-500 text-red-900 dark:bg-red-950/50 dark:text-red-100',
  alta:    'bg-orange-50 border-l-[3px] border-orange-400 text-orange-900 dark:bg-orange-950/50 dark:text-orange-100',
  media:   'bg-yellow-50 border-l-[3px] border-yellow-400 text-yellow-900 dark:bg-yellow-950/50 dark:text-yellow-100',
  baja:    'bg-muted/50 border-l-[3px] border-border text-muted-foreground',
}

const ESTADO_VARIANT: Record<string, 'default' | 'secondary' | 'outline' | 'success' | 'warning' | 'info'> = {
  pendiente: 'warning',
  en_curso:  'info',
}

const TIPO_LABEL: Record<string, string> = {
  lavado:      'Lavado',
  fotos:       'Fotos',
  publicacion: 'Publicación',
  tramite:     'Trámite',
  seguimiento: 'Seguimiento',
  otro:        'Otro',
}


const nativeSelectCls =
  'h-9 w-full rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50'

function horaDeTarea(t: any): string {
  // El agente guarda fecha_vencimiento como DATE (YYYY-MM-DD) y prefija la hora
  // en descripcion como "Hora: HH:MM. ...". Soportamos ambos formatos.
  const fromIso = fmtHora(t?.fecha_vencimiento)
  if (fromIso) return fromIso
  const m = (t?.descripcion ?? '').match(/^Hora:\s*(\d{1,2}:\d{2})/i)
  return m ? m[1].padStart(5, '0') : ''
}

function AsignadoBadge({ nombre, size = 'sm' }: { nombre: string; size?: 'sm' | 'xs' }) {
  const { equipo } = useEquipo()
  if (!nombre) return null
  const persona = miembroPorClave(equipo, nombre)
  const style = persona ? persona.badge : 'bg-muted text-muted-foreground'
  const pad = size === 'xs' ? 'px-1.5 py-0 text-[10px]' : 'px-2 py-0.5 text-xs'
  return (
    <span className={`${style} ${pad} rounded-full font-medium capitalize leading-tight whitespace-nowrap`}>
      {persona ? persona.label : nombre}
    </span>
  )
}

function TareaRow({ t, autoNombre }: { t: any; autoNombre: (id: number | null) => string | null }) {
  const router = useRouter()
  const { defAssignee } = useEquipo()
  const [completing, setCompleting] = useState(false)

  const auto   = autoNombre(t.vehicle_id)
  const left   = PRIORIDAD_BORDER[t.prioridad] ?? PRIORIDAD_BORDER['baja']
  const dot    = PRIORIDAD_DOT[t.prioridad]    ?? PRIORIDAD_DOT['baja']
  const isPendiente = t.estado !== 'completada'

  async function completar(e: React.MouseEvent) {
    e.stopPropagation()
    setCompleting(true)
    const { ok, error } = await patchRecordDetailed('tareas', t.id, {
      estado: 'completada',
      completado_por: defAssignee,
      fecha_completado: new Date().toISOString(),
    })
    setCompleting(false)
    if (ok) { toast.success('Tarea completada'); router.refresh() }
    else toast.error(error || 'Error al completar.')
  }

  return (
    <div className={`flex items-start justify-between px-3 py-2.5 ${left}`}>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full shrink-0 ${dot}`} />
          <p className="text-sm font-medium leading-snug">{t.titulo || 'Sin título'}</p>
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
        {(t.fecha_vencimiento || horaDeTarea(t)) && (
          <span className="text-xs text-muted-foreground tabular-nums">
            {t.fecha_vencimiento && fmtFecha(t.fecha_vencimiento)}
            {horaDeTarea(t) && `${t.fecha_vencimiento ? ' ' : ''}${horaDeTarea(t)}`}
          </span>
        )}
        {isPendiente && (
          <Button
            size="icon-xs"
            variant="ghost"
            onClick={completar}
            disabled={completing}
            title="Marcar como completada"
            aria-label="Marcar como completada"
            className="text-muted-foreground hover:text-success"
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
  // Grouped by person by default. The team shares this dashboard with no per-user
  // login, so "whose is it" is the question being asked; priority is a filter you
  // reach for, not the shape of the list.
  const [sort, setSort] = useState<SortMode>('persona')
  const { equipo, defAssignee, destacados } = useEquipo()
  const seccionOrden = useMemo(
    () => ordenSecciones(equipo, defAssignee, destacados),
    [equipo, defAssignee, destacados],
  )

  function autoNombre(id: number | null) {
    if (!id) return null
    const v = vehicles.find((v: any) => v.id === id)
    return v ? `${v.marca ?? ''} ${v.modelo ?? ''} ${v.año ?? ''}`.trim() || null : null
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
    // Initialize a bucket for every teammate so the section ordering stays
    // stable even when a person has no open tasks.
    const grupos: Record<string, any[]> = { sin_asignar: [] }
    for (const p of seccionOrden) grupos[p] = []

    for (const t of activas) {
      const persona = miembroPorClave(equipo, t.asignado)
      if (persona) grupos[persona.clave].push(t)
      else grupos['sin_asignar'].push(t)
    }

    const entries = seccionOrden
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

function TaskCard({ t }: { t: any }) {
  const { equipo } = useEquipo()
  const style   = PRIORIDAD_CARD[t.prioridad] ?? PRIORIDAD_CARD['baja']
  const persona = miembroPorClave(equipo, t.asignado)
  const initStyle = persona ? persona.avatar : 'bg-background/60 text-muted-foreground'

  const hora = horaDeTarea(t)
  return (
    <div className={`${style} rounded px-1.5 py-0.5 text-xs leading-snug flex items-center gap-1`} title={t.titulo}>
      {hora && <span className="font-semibold shrink-0 tabular-nums">{hora}</span>}
      <span className="truncate flex-1">{t.titulo || 'Sin título'}</span>
      {t.asignado && (
        <span className={`${initStyle} rounded-full w-3.5 h-3.5 flex items-center justify-center text-[9px] font-bold shrink-0`}>
          {t.asignado[0].toUpperCase()}
        </span>
      )}
    </div>
  )
}

export function CalendarView({ tareas, vehicles }: { tareas: any[]; vehicles: any[] }) {
  function autoNombre(id: number | null) {
    if (!id) return null
    const v = vehicles.find((v: any) => v.id === id)
    return v ? `${v.marca ?? ''} ${v.modelo ?? ''} ${v.año ?? ''}`.trim() || null : null
  }
  const activas = tareas.filter(t => t.estado !== 'completada')
  // Within a day: timed tasks first (by HH:MM), then by priority.
  const sortDay = (a: any, b: any) => {
    const ha = horaDeTarea(a), hb = horaDeTarea(b)
    if (ha && hb) return ha.localeCompare(hb)
    if (ha) return -1
    if (hb) return 1
    return (PRIORIDAD_RANK[a.prioridad] ?? 3) - (PRIORIDAD_RANK[b.prioridad] ?? 3)
  }
  return (
    <MonthGrid
      items={activas}
      // fecha_vencimiento is date-only: instantDayKey parsed it as UTC midnight
      // → previous day in AR (tasks landed one calendar cell early).
      dayKeyOf={t => { const d = parseAny(t.fecha_vencimiento); return d ? localDayKey(d) : null }}
      itemKey={t => t.id}
      renderChip={t => <TaskCard t={t} />}
      renderDetail={t => <TareaRow t={t} autoNombre={autoNombre} />}
      sortDay={sortDay}
      noun="tarea"
      sinFechaLabel="Sin fecha límite"
    />
  )
}

// ── Nueva Tarea dialog ────────────────────────────────────────────────────────

function NuevaTareaDialog({
  open, onOpenChange, vehicles,
}: { open: boolean; onOpenChange: (o: boolean) => void; vehicles: any[] }) {
  const router = useRouter()
  const { equipo, defAssignee } = useEquipo()
  const [saving, setSaving] = useState(false)
  const vacio = {
    titulo: '',
    descripcion: '',
    tipo: 'otro',
    prioridad: 'media',
    asignado: defAssignee,
    vehicle_id: '',
    fecha_vencimiento: '',
  }
  const [form, setForm] = useState(vacio)
  // Escape / click afuera / X / Cancelar preguntan antes de tirar lo cargado.
  const { dialogProps, cerrar } = useDirtyClose({ sucio: formSucio(form, vacio), onOpenChange })

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
      setForm(vacio)
      router.refresh()
    } else {
      toast.error('Error al guardar.')
    }
  }

  return (
    <Dialog open={open} {...dialogProps}>
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
              {equipo.map(m => (
                <option key={m.clave} value={m.clave}>{m.label}</option>
              ))}
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
          <Button variant="outline" onClick={cerrar}>Cancelar</Button>
          <Button onClick={save} disabled={saving}>{saving ? 'Guardando…' : 'Guardar'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function TareasClient({
  tareas, vehicles, equipo = DEFAULT_EQUIPO, defAssignee = DEFAULT_ASSIGNEE,
  destacados = DEFAULT_DESTACADOS,
}: {
  tareas: any[]; vehicles: any[]
  // Vienen del server (tabla `equipo` + config_negocio). Los defaults son la red
  // de seguridad: si la page no los pasa, se ve lo de siempre.
  equipo?: MiembroEquipo[]; defAssignee?: string; destacados?: string[]
}) {
  const [view, setView] = useState<'lista' | 'calendario'>('lista')
  const [showNueva, setShowNueva] = useState(false)
  const ctx = useMemo(
    () => ({ equipo, defAssignee, destacados }),
    [equipo, defAssignee, destacados],
  )

  const pendientes  = tareas.filter(t => t.estado === 'pendiente' || t.estado === 'en_curso')
  const completadas = tareas.filter(t => t.estado === 'completada')

  return (
    <EquipoCtx.Provider value={ctx}>
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
    </EquipoCtx.Provider>
  )
}
