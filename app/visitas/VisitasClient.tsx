'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { patchRecord, postRecord, deleteRecord } from '@/lib/kapso'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import { ChevronDownIcon, ChevronUpIcon, MailIcon, PlusIcon } from 'lucide-react'

const RESULTADO_VARIANT: Record<string, 'default' | 'secondary' | 'outline' | 'destructive'> = {
  pendiente: 'secondary',
  concretada: 'default',
  cancelada: 'destructive',
  no_show: 'outline',
}

const RESULTADOS = ['pendiente', 'concretada', 'cancelada', 'no_show'] as const

const nativeSelectCls =
  'h-8 w-full rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50'

function fmtDateTime(iso: string) {
  if (!iso) return ''
  const d = new Date(iso)
  return d.toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

function fmtDate(iso: string) {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' })
}

function isoToLocalInput(iso: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function localInputToIso(local: string): string {
  if (!local) return ''
  return new Date(local).toISOString()
}

function VisitaRow({
  v, vehicleLabel, interesadoLabel,
}: { v: any; vehicleLabel: (id: any) => string; interesadoLabel: (id: any) => string }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [notas, setNotas] = useState(v.notas ?? '')
  const [fecha, setFecha] = useState(isoToLocalInput(v.fecha))
  const [saving, setSaving] = useState<string>('')

  async function setResultado(resultado: string) {
    setSaving(resultado)
    const ok = await patchRecord('visitas', v.id, { resultado })
    setSaving('')
    if (ok) { toast.success(`Visita ${resultado}`); router.refresh() }
  }

  async function saveDetalles() {
    setSaving('detalles')
    const payload: any = { notas: notas || null }
    if (fecha) payload.fecha = localInputToIso(fecha)
    const ok = await patchRecord('visitas', v.id, payload)
    setSaving('')
    if (ok) { toast.success('Cambios guardados'); router.refresh() }
  }

  async function borrar() {
    if (!confirm(`¿Borrar visita #${v.id}?`)) return
    setSaving('delete')
    const ok = await deleteRecord('visitas', v.id)
    setSaving('')
    if (ok) { toast.success('Visita borrada'); router.refresh() }
  }

  const resultado = v.resultado ?? 'pendiente'

  return (
    <div className="border-b border-border last:border-0">
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
          <span className={`inline-flex items-center gap-1 text-xs ${v.email_enviado ? 'text-emerald-600' : 'text-muted-foreground'}`}>
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
            <div><p className="text-xs text-muted-foreground">Creada</p><p className="text-sm">{fmtDate(v.created_at)}</p></div>
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
  vehicles, interesados, onClose,
}: { vehicles: any[]; interesados: any[]; onClose: () => void }) {
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
    setSaving(true)
    const payload: any = {
      vehicle_id: Number(form.vehicle_id),
      interesado_id: Number(form.interesado_id),
      fecha: localInputToIso(form.fecha),
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
  visitas, vehicles, interesados,
}: { visitas: any[]; vehicles: any[]; interesados: any[] }) {
  const [showNueva, setShowNueva] = useState(false)
  const [filter, setFilter] = useState<Filtro>('proximas')

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
        <NuevaVisitaForm vehicles={vehicles} interesados={interesados} onClose={() => setShowNueva(false)} />
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
            <VisitaRow key={v.id} v={v} vehicleLabel={vehicleLabel} interesadoLabel={interesadoLabel} />
          ))}
          {sorted.length === 0 && (
            <p className="px-4 py-6 text-sm text-muted-foreground text-center">Sin visitas.</p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
