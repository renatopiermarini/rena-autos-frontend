'use client'
import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { useDeepLinkId, useDeepLinkParam, useScrollToDeepLink } from '@/lib/deep-link'
import { marcarTocado, type CamposIa } from '@/lib/ia'
import { sugerenciaVisita, type AgendaParseada, type VisitaForm } from '@/lib/ia-formularios'
import { catalogoInteresados, catalogoVehiculos } from '@/lib/ia-match'
import { AgregarRapido } from '@/components/agregar-rapido'
import { CAMPO_IA_CLS, IaAdvertencias, IaChip, IaSugerenciasBar } from '@/components/ia-hint'
import { cn } from '@/lib/utils'
import { patchRecordDetailed, postRecord, deleteRecordDetailed } from '@/lib/kapso'
import { fmtDateTime, fmtDM, toARInputValue, fromARInputValue } from '@/lib/date'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import { ChevronDownIcon, ChevronUpIcon, MailIcon, PlusIcon, CalendarClockIcon } from 'lucide-react'
import { EmptyState } from '@/components/empty-state'

const RESULTADO_VARIANT: Record<string, 'default' | 'secondary' | 'outline' | 'destructive' | 'success' | 'warning' | 'info'> = {
  pendiente: 'info',
  concretada: 'success',
  cancelada: 'destructive',
  no_compro: 'warning',
}

// Must match the server enum (proxy route.ts / bot ENUMS): no_compro, not no_show.
const RESULTADOS = ['pendiente', 'concretada', 'cancelada', 'no_compro'] as const

const nativeSelectCls =
  'h-8 w-full rounded-lg border border-input bg-transparent px-2.5 py-1 text-base md:text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50'

function VisitaRow({
  v, vehicleLabel, interesadoLabel, defaultOpen = false,
}: { v: any; vehicleLabel: (id: any) => string; interesadoLabel: (id: any) => string; defaultOpen?: boolean }) {
  const router = useRouter()
  const [open, setOpen] = useState(defaultOpen)
  const [notas, setNotas] = useState(v.notas ?? '')
  const [fecha, setFecha] = useState(toARInputValue(v.fecha))
  const [saving, setSaving] = useState<string>('')

  async function setResultado(resultado: string) {
    setSaving(resultado)
    const { ok, error } = await patchRecordDetailed('visitas', v.id, { resultado })
    setSaving('')
    if (ok) { toast.success(`Visita ${resultado}`); router.refresh() }
    else toast.error(error || 'Error al actualizar')
  }

  async function saveDetalles() {
    setSaving('detalles')
    const payload: any = { notas: notas || null }
    if (fecha) payload.fecha = fromARInputValue(fecha)
    const { ok, error } = await patchRecordDetailed('visitas', v.id, payload)
    setSaving('')
    if (ok) { toast.success('Cambios guardados'); router.refresh() }
    else toast.error(error || 'Error al guardar')
  }

  async function borrar() {
    if (!confirm(`¿Borrar visita #${v.id}?`)) return
    setSaving('delete')
    const { ok, error } = await deleteRecordDetailed('visitas', v.id)
    setSaving('')
    if (ok) { toast.success('Visita borrada'); router.refresh() }
    else toast.error(error || 'Error al borrar')
  }

  const resultado = v.resultado ?? 'pendiente'

  return (
    <div id={`visita-${v.id}`} className={`border-b border-border last:border-0 ${defaultOpen ? 'bg-primary/5 ring-1 ring-inset ring-primary/30' : ''}`}>
      <div
        onClick={() => setOpen(o => !o)}
        className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-muted/50 transition-colors"
      >
        {/* Botón real para teclado/lector; la fila entera sigue clickeable con mouse. */}
        <button
          type="button"
          aria-expanded={open}
          onClick={e => { e.stopPropagation(); setOpen(o => !o) }}
          className="flex items-center gap-2 min-w-0 rounded text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {open ? <ChevronUpIcon className="size-3 text-muted-foreground shrink-0" aria-hidden /> : <ChevronDownIcon className="size-3 text-muted-foreground shrink-0" aria-hidden />}
          <span className="text-sm font-medium truncate">{vehicleLabel(v.vehicle_id)}</span>
          <span className="text-sm text-muted-foreground whitespace-nowrap">— {interesadoLabel(v.interesado_id)}</span>
        </button>
        <div className="flex items-center gap-3 shrink-0 ml-4">
          {/* "pendiente" a secas al lado del pill de resultado "pendiente" leía
              como un duplicado; el texto dice de qué es el estado. */}
          <span
            className={`inline-flex items-center gap-1 text-xs ${v.email_enviado ? 'text-success' : 'text-muted-foreground'}`}
            title={v.email_enviado ? 'Recordatorio por mail enviado' : 'Recordatorio por mail sin enviar'}
          >
            <MailIcon className="size-3" aria-hidden /> {v.email_enviado ? 'mail enviado' : 'sin mail'}
          </span>
          <Badge variant={RESULTADO_VARIANT[resultado] ?? 'outline'}>{resultado}</Badge>
          <span className="text-xs text-muted-foreground tabular-nums">{fmtDateTime(v.fecha)}</span>
        </div>
      </div>

      {open && (
        <div className="px-10 py-4 bg-muted/30 space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-2">
            <div><p className="text-xs text-muted-foreground">Vehículo</p><p className="text-sm">{vehicleLabel(v.vehicle_id)}</p></div>
            <div><p className="text-xs text-muted-foreground">Interesado</p><p className="text-sm">{interesadoLabel(v.interesado_id)}</p></div>
            <div><p className="text-xs text-muted-foreground">Creada</p><p className="text-sm">{fmtDM(v.created_at)}</p></div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-x-4 gap-y-3 items-end">
            <div className="space-y-1.5">
              <Label>Fecha y hora</Label>
              <Input type="datetime-local" value={fecha} onChange={e => setFecha(e.target.value)} />
            </div>
            <div className="sm:col-span-2 space-y-1.5">
              <Label>Notas</Label>
              <Input
                value={notas}
                onChange={e => setNotas(e.target.value)}
                placeholder="Detalles, condiciones, recordatorios…"
              />
            </div>
          </div>
          <div>
            <Button size="sm" onClick={saveDetalles} disabled={saving === 'detalles'}>
              {saving === 'detalles' ? '…' : 'Guardar cambios'}
            </Button>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-muted-foreground mr-1">Resultado:</span>
            {RESULTADOS.map(r => (
              <Button
                key={r}
                size="xs"
                variant={resultado === r ? 'default' : 'outline'}
                aria-pressed={resultado === r}
                onClick={() => setResultado(r)}
                disabled={saving === r || resultado === r}
              >
                {saving === r ? '…' : r}
              </Button>
            ))}
            <Button size="xs" variant="destructive" onClick={borrar} disabled={saving === 'delete'} className="ml-auto">
              Borrar
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

const VISITA_VACIA: VisitaForm = { vehicle_id: '', interesado_id: '', fecha: '', notas: '' }

/** Un campo del alta; `ia` = lo puso la IA y nadie lo tocó (chip + borde info). */
function Campo({ label, ia, children, className }: {
  label: string; ia?: boolean; children: React.ReactNode; className?: string
}) {
  return (
    <div className={cn('space-y-1.5', className)}>
      <span className="flex items-center gap-2">
        <Label>{label}</Label>
        {ia && <IaChip />}
      </span>
      {children}
    </div>
  )
}

function NuevaVisitaForm({
  vehicles, interesados, onClose, inicial, advertencias = [],
}: {
  vehicles: any[]; interesados: any[]; onClose: () => void
  /** Lo que "Agregar rápido" entendió: se siembra como sugerido (borde info + chip). */
  inicial?: Partial<VisitaForm>
  /** Lo que la IA no pudo resolver ("no encontré a Juan"). */
  advertencias?: string[]
}) {
  const router = useRouter()
  // El padre remonta este form (key) cada vez que hay una semilla nueva, así
  // que alcanza con leer `inicial` una vez.
  const [form, setForm] = useState<VisitaForm>({ ...VISITA_VACIA, ...inicial })
  const [camposIa, setCamposIa] = useState<CamposIa<VisitaForm>>(
    new Set(Object.keys(inicial ?? {}) as (keyof VisitaForm)[]),
  )
  const [saving, setSaving] = useState(false)

  function set(field: keyof VisitaForm, value: string) {
    setForm(f => ({ ...f, [field]: value }))
    setCamposIa(c => marcarTocado(c, field))
  }
  const esIa = (field: keyof VisitaForm) => camposIa.has(field)

  function limpiarIa() {
    setForm(f => {
      const next = { ...f }
      camposIa.forEach(k => { next[k] = VISITA_VACIA[k] })
      return next
    })
    setCamposIa(new Set())
  }

  async function save() {
    if (!form.vehicle_id || !form.interesado_id || !form.fecha) {
      toast.error('Vehículo, interesado y fecha son obligatorios')
      return
    }
    setSaving(true)
    const payload: any = {
      vehicle_id: Number(form.vehicle_id),
      interesado_id: Number(form.interesado_id),
      fecha: fromARInputValue(form.fecha),
      resultado: 'pendiente',
      email_enviado: 0,
      notas: form.notas || null,
      created_at: new Date().toISOString(),
    }
    const r = await postRecord('visitas', payload)
    setSaving(false)
    if (r.ok) { toast.success('Visita creada'); onClose(); router.refresh() }
    else toast.error(r.error || 'Error al guardar')
  }

  return (
    <Card size="sm" className="bg-muted/30">
      <CardContent className="space-y-4">
        <p className="text-sm font-medium">Nueva visita</p>
        <IaSugerenciasBar cantidad={camposIa.size} onLimpiar={limpiarIa} />
        <IaAdvertencias items={advertencias} />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-3">
          <Campo label="Vehículo *" ia={esIa('vehicle_id')} className="col-span-2">
            <select
              value={form.vehicle_id}
              onChange={e => set('vehicle_id', e.target.value)}
              className={cn(nativeSelectCls, esIa('vehicle_id') && CAMPO_IA_CLS)}
            >
              <option value="">—</option>
              {vehicles.filter(v => v.estado !== 'vendido').map(v => (
                <option key={v.id} value={v.id}>
                  {v.marca} {v.modelo} {v.año} {v.dominio ? `(${v.dominio})` : ''}
                </option>
              ))}
            </select>
          </Campo>
          <Campo label="Interesado *" ia={esIa('interesado_id')} className="col-span-2">
            <select
              value={form.interesado_id}
              onChange={e => set('interesado_id', e.target.value)}
              className={cn(nativeSelectCls, esIa('interesado_id') && CAMPO_IA_CLS)}
            >
              <option value="">—</option>
              {interesados.map(i => (
                <option key={i.id} value={i.id}>
                  {i.nombre} {i.telefono ? `(${i.telefono})` : ''}
                </option>
              ))}
            </select>
          </Campo>
          <Campo label="Fecha y hora *" ia={esIa('fecha')} className="col-span-2">
            <Input
              type="datetime-local"
              value={form.fecha}
              onChange={e => set('fecha', e.target.value)}
              className={cn(esIa('fecha') && CAMPO_IA_CLS)}
            />
          </Campo>
          <Campo label="Notas" ia={esIa('notas')} className="col-span-2 sm:col-span-4">
            <Input
              value={form.notas}
              onChange={e => set('notas', e.target.value)}
              className={cn(esIa('notas') && CAMPO_IA_CLS)}
            />
          </Campo>
        </div>
        <div className="flex gap-2">
          <Button onClick={save} disabled={saving}>{saving ? 'Guardando…' : 'Guardar'}</Button>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
        </div>
      </CardContent>
    </Card>
  )
}

type Filtro = 'todas' | 'proximas' | 'pasadas' | typeof RESULTADOS[number]

export default function VisitasClient({
  visitas, vehicles, interesados, ia = false,
}: {
  visitas: any[]; vehicles: any[]; interesados: any[]
  /** ¿Hay backend de IA? Enciende "Agregar rápido" arriba de la lista. */
  ia?: boolean
}) {
  const [showNueva, setShowNueva] = useState(false)
  // La semilla de "Agregar rápido": cada una remonta el form (key) para que
  // arranque con lo sugerido. Cancelar y volver a abrir a mano arranca vacío.
  const [semilla, setSemilla] = useState<{ key: number; campos: Partial<VisitaForm>; advertencias: string[] } | null>(null)
  const catalogos = useMemo(() => ({
    vehicles: catalogoVehiculos(vehicles),
    interesados: catalogoInteresados(interesados),
    // Esta pantalla no carga el equipo; con la lista vacía el backend no valida `asignado`.
    equipo: [] as string[],
  }), [vehicles, interesados])
  // `?rapido=<texto>` desde Tareas ("eso parece una visita"): se ejecuta al montar.
  const rapidoInicial = useDeepLinkParam('rapido')

  function onRapido(data: AgendaParseada) {
    const { campos, advertencias } = sugerenciaVisita(data)
    setSemilla(s => ({ key: (s?.key ?? 0) + 1, campos, advertencias }))
    setShowNueva(true)
  }

  function cerrarNueva() {
    setShowNueva(false)
    setSemilla(null)
  }
  // "proximas" es el default útil… salvo cuando no hay ninguna: abrir la
  // pantalla en "Sin visitas" con 47 visitas cargadas lee como pantalla rota.
  const [filter, setFilter] = useState<Filtro>(() => {
    const ahora = Date.now()
    const hayProximas = visitas.some(v =>
      v.fecha && new Date(v.fecha).getTime() >= ahora && v.resultado === 'pendiente')
    return hayProximas ? 'proximas' : 'todas'
  })

  // Arriving from the agenda with ?id=. The default "proximas" filter excludes past
  // visitas, so a click on a past one would land on a list that does not contain it —
  // widen to "todas" so the deep-linked row is always present, then open and scroll to it.
  const deepId = useDeepLinkId()
  useEffect(() => { if (deepId != null) setFilter('todas') }, [deepId])
  useScrollToDeepLink(deepId, 'visita')

  function vehicleLabel(id: any) {
    const v = vehicles.find(v => v.id === id)
    if (!v) return 'Sin vehículo'
    const auto = `${v.marca ?? ''} ${v.modelo ?? ''} ${v.año ?? ''}`.trim()
    return v.dominio ? `${auto} (${v.dominio})` : auto
  }

  function interesadoLabel(id: any) {
    if (!id) return 'sin identificar'
    const i = interesados.find(i => i.id === id)
    return i ? i.nombre : `interesado #${id}`
  }

  const ahora = Date.now()
  const filtradas = visitas.filter(v => {
    if (filter === 'todas') return true
    if (filter === 'proximas') return v.fecha && new Date(v.fecha).getTime() >= ahora && v.resultado === 'pendiente'
    if (filter === 'pasadas')  return v.fecha && new Date(v.fecha).getTime() <  ahora
    return v.resultado === filter
  })

  const sorted = [...filtradas].sort((a, b) => {
    const at = a.fecha ? new Date(a.fecha).getTime() : 0
    const bt = b.fecha ? new Date(b.fecha).getTime() : 0
    return filter === 'proximas' ? at - bt : bt - at
  })

  const proximasCount = visitas.filter(v =>
    v.fecha && new Date(v.fecha).getTime() >= ahora && v.resultado === 'pendiente'
  ).length

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-baseline gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">Visitas</h1>
          <span className="text-sm text-muted-foreground">{visitas.length} totales · {proximasCount} próximas</span>
        </div>
        <Button size="sm" variant={showNueva ? 'default' : 'outline'} aria-expanded={showNueva} onClick={() => (showNueva ? cerrarNueva() : setShowNueva(true))}>
          <PlusIcon /> Nueva visita
        </Button>
      </div>

      {ia && (
        <AgregarRapido
          pantalla="visita"
          catalogos={catalogos}
          onResultado={onRapido}
          textoInicial={rapidoInicial}
          placeholder="Agregar rápido: “visita de Juan mañana 15hs por el Golf”"
        />
      )}

      {showNueva && (
        <NuevaVisitaForm
          key={semilla?.key ?? 0}
          vehicles={vehicles}
          interesados={interesados}
          onClose={cerrarNueva}
          inicial={semilla?.campos}
          advertencias={semilla?.advertencias}
        />
      )}

      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs text-muted-foreground mr-1">Filtrar:</span>
        {(['proximas','pasadas','todas', ...RESULTADOS] as const).map(k => (
          <Button
            key={k}
            size="xs"
            variant={filter === k ? 'default' : 'outline'}
            aria-pressed={filter === k}
            onClick={() => setFilter(k as Filtro)}
          >
            {k}
          </Button>
        ))}
      </div>

      <Card size="sm">
        <CardContent className="p-0">
          {sorted.map(v => (
            <VisitaRow key={v.id} v={v} vehicleLabel={vehicleLabel} interesadoLabel={interesadoLabel} defaultOpen={v.id === deepId} />
          ))}
          {sorted.length === 0 && (
            <EmptyState icon={CalendarClockIcon} title="Sin visitas" hint="Agendá una con “Nueva visita”." />
          )}
        </CardContent>
      </Card>
    </div>
  )
}
