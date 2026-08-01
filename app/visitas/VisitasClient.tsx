'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useDeepLinkId, useScrollToDeepLink } from '@/lib/deep-link'
import { patchRecordDetailed, postRecord, deleteRecordDetailed } from '@/lib/kapso'
import { fmtDateTime, fmtDM, toARInputValue, fromARInputValue } from '@/lib/date'
import { visitaConflict } from '@/lib/agenda'
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
  'h-8 w-full rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50'

const hhmm = (d: Date) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`

// True (and toasts) if the chosen datetime-local lands inside an active transferencia
// turno block — the same rule the bot enforces (lib/agenda + backend agenda_rules.py).
function visitaChocaConTurno(fechaInput: string, transferencias: any[]): boolean {
  if (!fechaInput) return false
  const hit = visitaConflict(fromARInputValue(fechaInput), transferencias)
  if (hit) {
    toast.error(`No se puede agendar: choca con el turno de transferencia de ${hit.auto} (${hhmm(hit.start)}–${hhmm(hit.end)}).`)
    return true
  }
  return false
}

function VisitaRow({
  v, vehicleLabel, interesadoLabel, transferencias, defaultOpen = false,
}: { v: any; vehicleLabel: (id: any) => string; interesadoLabel: (id: any) => string; transferencias: any[]; defaultOpen?: boolean }) {
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
    if (fecha && visitaChocaConTurno(fecha, transferencias)) return
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
        <div className="flex items-center gap-2 min-w-0">
          {open ? <ChevronUpIcon className="size-3 text-muted-foreground shrink-0" /> : <ChevronDownIcon className="size-3 text-muted-foreground shrink-0" />}
          <span className="text-sm font-medium truncate">{vehicleLabel(v.vehicle_id)}</span>
          <span className="text-sm text-muted-foreground whitespace-nowrap">— {interesadoLabel(v.interesado_id)}</span>
        </div>
        <div className="flex items-center gap-3 shrink-0 ml-4">
          <span className={`inline-flex items-center gap-1 text-xs ${v.email_enviado ? 'text-success' : 'text-muted-foreground'}`}>
            <MailIcon className="size-3" /> {v.email_enviado ? 'enviado' : 'pendiente'}
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

function NuevaVisitaForm({
  vehicles, interesados, transferencias, onClose,
}: { vehicles: any[]; interesados: any[]; transferencias: any[]; onClose: () => void }) {
  const router = useRouter()
  const [form, setForm] = useState({
    vehicle_id: '', interesado_id: '', fecha: '', notas: '',
  })
  const [saving, setSaving] = useState(false)

  async function save() {
    if (!form.vehicle_id || !form.interesado_id || !form.fecha) {
      toast.error('Vehículo, interesado y fecha son obligatorios')
      return
    }
    if (visitaChocaConTurno(form.fecha, transferencias)) return
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
    else toast.error('Error al guardar')
  }

  return (
    <Card size="sm" className="bg-muted/30">
      <CardContent className="space-y-4">
        <p className="text-sm font-medium">Nueva visita</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-3">
          <div className="col-span-2 space-y-1.5">
            <Label>Vehículo *</Label>
            <select
              value={form.vehicle_id}
              onChange={e => setForm(f => ({ ...f, vehicle_id: e.target.value }))}
              className={nativeSelectCls}
            >
              <option value="">—</option>
              {vehicles.filter(v => v.estado !== 'vendido').map(v => (
                <option key={v.id} value={v.id}>
                  {v.marca} {v.modelo} {v.año} {v.dominio ? `(${v.dominio})` : ''}
                </option>
              ))}
            </select>
          </div>
          <div className="col-span-2 space-y-1.5">
            <Label>Interesado *</Label>
            <select
              value={form.interesado_id}
              onChange={e => setForm(f => ({ ...f, interesado_id: e.target.value }))}
              className={nativeSelectCls}
            >
              <option value="">—</option>
              {interesados.map(i => (
                <option key={i.id} value={i.id}>
                  {i.nombre} {i.telefono ? `(${i.telefono})` : ''}
                </option>
              ))}
            </select>
          </div>
          <div className="col-span-2 space-y-1.5">
            <Label>Fecha y hora *</Label>
            <Input
              type="datetime-local"
              value={form.fecha}
              onChange={e => setForm(f => ({ ...f, fecha: e.target.value }))}
            />
          </div>
          <div className="col-span-2 sm:col-span-4 space-y-1.5">
            <Label>Notas</Label>
            <Input value={form.notas} onChange={e => setForm(f => ({ ...f, notas: e.target.value }))} />
          </div>
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
  visitas, vehicles, interesados, transferencias,
}: { visitas: any[]; vehicles: any[]; interesados: any[]; transferencias: any[] }) {
  const [showNueva, setShowNueva] = useState(false)
  const [filter, setFilter] = useState<Filtro>('proximas')

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
      <div className="flex items-center justify-between">
        <div className="flex items-baseline gap-3">
          <h1 className="text-xl font-semibold">Visitas</h1>
          <span className="text-sm text-muted-foreground">{visitas.length} totales · {proximasCount} próximas</span>
        </div>
        <Button size="sm" variant={showNueva ? 'default' : 'outline'} onClick={() => setShowNueva(v => !v)}>
          <PlusIcon /> Nueva visita
        </Button>
      </div>

      {showNueva && (
        <NuevaVisitaForm vehicles={vehicles} interesados={interesados} transferencias={transferencias} onClose={() => setShowNueva(false)} />
      )}

      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs text-muted-foreground mr-1">Filtrar:</span>
        {(['proximas','pasadas','todas', ...RESULTADOS] as const).map(k => (
          <Button
            key={k}
            size="xs"
            variant={filter === k ? 'default' : 'outline'}
            onClick={() => setFilter(k as Filtro)}
          >
            {k}
          </Button>
        ))}
      </div>

      <Card size="sm">
        <CardContent className="p-0">
          {sorted.map(v => (
            <VisitaRow key={v.id} v={v} vehicleLabel={vehicleLabel} interesadoLabel={interesadoLabel} transferencias={transferencias} defaultOpen={v.id === deepId} />
          ))}
          {sorted.length === 0 && (
            <EmptyState icon={CalendarClockIcon} title="Sin visitas" hint="Agendá una con “Nueva visita”." />
          )}
        </CardContent>
      </Card>
    </div>
  )
}
