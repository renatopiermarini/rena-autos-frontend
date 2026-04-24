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

const ESTADO_VARIANT: Record<string, 'default' | 'secondary' | 'outline' | 'destructive'> = {
  pendiente: 'secondary',
  aceptada: 'default',
  rechazada: 'destructive',
  contraoferta: 'outline',
}

const nativeSelectCls =
  'h-8 w-full rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50'

function fmtMoney(n: any) {
  if (n == null || n === '') return '—'
  return `USD ${Number(n).toLocaleString('es-AR')}`
}

function fmtDate(iso: string) {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' })
}

function OfertaRow({
  o, vehicleLabel, interesadoLabel,
}: { o: any; vehicleLabel: (id: any) => string; interesadoLabel: (id: any) => string }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [respuesta, setRespuesta] = useState(o.respuesta_propietario ?? '')
  const [saving, setSaving] = useState<string>('')

  async function setEstado(estado: string) {
    setSaving(estado)
    const payload: any = { estado, updated_at: new Date().toISOString() }
    if (estado === 'aceptada') payload.monto_aceptado = o.monto_ofrecido
    const ok = await patchRecord('ofertas', o.id, payload)
    setSaving('')
    if (ok) { toast.success(`Oferta ${estado}`); router.refresh() }
  }

  async function saveRespuesta() {
    setSaving('respuesta')
    const ok = await patchRecord('ofertas', o.id, {
      respuesta_propietario: respuesta || null,
      fecha_respuesta: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    setSaving('')
    if (ok) { toast.success('Respuesta guardada'); router.refresh() }
  }

  async function borrar() {
    if (!confirm(`¿Borrar oferta #${o.id}?`)) return
    setSaving('delete')
    const ok = await deleteRecord('ofertas', o.id)
    setSaving('')
    if (ok) { toast.success('Oferta borrada'); router.refresh() }
  }

  const estado = o.estado ?? 'pendiente'

  return (
    <div className="border-b border-border last:border-0">
      <div
        onClick={() => setOpen(v => !v)}
        className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-muted/50 transition-colors"
      >
        <div className="flex items-center gap-2 min-w-0">
          {open ? <ChevronUpIcon className="size-3 text-muted-foreground shrink-0" /> : <ChevronDownIcon className="size-3 text-muted-foreground shrink-0" />}
          <span className="text-sm font-medium truncate">{vehicleLabel(o.vehicle_id)}</span>
          <span className="text-sm text-muted-foreground whitespace-nowrap">— {fmtMoney(o.monto_ofrecido)}</span>
        </div>
        <div className="flex items-center gap-3 shrink-0 ml-4">
          <span className={`inline-flex items-center gap-1 text-xs ${o.email_enviado ? 'text-emerald-600' : 'text-muted-foreground'}`}>
            <MailIcon className="size-3" /> {o.email_enviado ? 'enviado' : 'pendiente'}
          </span>
          <span className="text-xs text-muted-foreground">{interesadoLabel(o.interesado_id)}</span>
          <Badge variant={ESTADO_VARIANT[estado] ?? 'outline'}>{estado}</Badge>
          <span className="text-xs text-muted-foreground tabular-nums">{fmtDate(o.created_at)}</span>
        </div>
      </div>

      {open && (
        <div className="px-10 py-4 bg-muted/30 space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-2">
            <div><p className="text-xs text-muted-foreground">Vehículo</p><p className="text-sm">{vehicleLabel(o.vehicle_id)}</p></div>
            <div><p className="text-xs text-muted-foreground">Interesado</p><p className="text-sm">{interesadoLabel(o.interesado_id)}</p></div>
            <div><p className="text-xs text-muted-foreground">Monto ofrecido</p><p className="text-sm">{fmtMoney(o.monto_ofrecido)}</p></div>
            {o.monto_aceptado && <div><p className="text-xs text-muted-foreground">Monto aceptado</p><p className="text-sm">{fmtMoney(o.monto_aceptado)}</p></div>}
            <div><p className="text-xs text-muted-foreground">Creada</p><p className="text-sm">{fmtDate(o.created_at)}</p></div>
            {o.fecha_respuesta && <div><p className="text-xs text-muted-foreground">Respuesta</p><p className="text-sm">{fmtDate(o.fecha_respuesta)}</p></div>}
            {o.notas && <div className="col-span-full"><p className="text-xs text-muted-foreground">Notas</p><p className="text-sm">{o.notas}</p></div>}
          </div>

          <div className="space-y-1.5">
            <Label>Respuesta del propietario</Label>
            <div className="flex gap-2">
              <Input
                value={respuesta}
                onChange={e => setRespuesta(e.target.value)}
                placeholder="Ej: Acepta, Rechaza, Contraoferta USD 35000..."
              />
              <Button size="sm" onClick={saveRespuesta} disabled={saving === 'respuesta'}>
                {saving === 'respuesta' ? '…' : 'Guardar'}
              </Button>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-muted-foreground mr-1">Estado:</span>
            {(['pendiente','aceptada','rechazada','contraoferta'] as const).map(e => (
              <Button
                key={e}
                size="xs"
                variant={estado === e ? 'default' : 'outline'}
                onClick={() => setEstado(e)}
                disabled={saving === e || estado === e}
              >
                {saving === e ? '…' : e}
              </Button>
            ))}
            <Button
              size="xs"
              variant="destructive"
              onClick={borrar}
              disabled={saving === 'delete'}
              className="ml-auto"
            >
              Borrar
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

function NuevaOfertaForm({
  vehicles, interesados, onClose,
}: { vehicles: any[]; interesados: any[]; onClose: () => void }) {
  const router = useRouter()
  const [form, setForm] = useState({
    vehicle_id: '', interesado_id: '', monto_ofrecido: '', notas: '',
  })
  const [saving, setSaving] = useState(false)

  async function save() {
    if (!form.vehicle_id || !form.monto_ofrecido) {
      toast.error('Vehículo y monto son obligatorios')
      return
    }
    setSaving(true)
    const payload: any = {
      vehicle_id: Number(form.vehicle_id),
      monto_ofrecido: Number(form.monto_ofrecido),
      estado: 'pendiente',
      email_enviado: 0,
      notas: form.notas || null,
      created_at: new Date().toISOString(),
    }
    if (form.interesado_id) payload.interesado_id = Number(form.interesado_id)
    const r = await postRecord('ofertas', payload)
    setSaving(false)
    if (r.ok) { toast.success('Oferta creada'); onClose(); router.refresh() }
    else toast.error('Error al guardar')
  }

  return (
    <Card size="sm" className="bg-muted/30">
      <CardContent className="space-y-4">
        <p className="text-sm font-medium">Nueva oferta</p>
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
            <Label>Interesado</Label>
            <select
              value={form.interesado_id}
              onChange={e => setForm(f => ({ ...f, interesado_id: e.target.value }))}
              className={nativeSelectCls}
            >
              <option value="">— Sin identificar</option>
              {interesados.map(i => (
                <option key={i.id} value={i.id}>
                  {i.nombre} {i.telefono ? `(${i.telefono})` : ''}
                </option>
              ))}
            </select>
          </div>
          <div className="col-span-2 space-y-1.5">
            <Label>Monto ofrecido (USD) *</Label>
            <Input
              type="number"
              value={form.monto_ofrecido}
              onChange={e => setForm(f => ({ ...f, monto_ofrecido: e.target.value }))}
              placeholder="34000"
            />
          </div>
          <div className="col-span-2 sm:col-span-4 space-y-1.5">
            <Label>Notas</Label>
            <Input
              value={form.notas}
              onChange={e => setForm(f => ({ ...f, notas: e.target.value }))}
            />
          </div>
        </div>
        <div className="flex gap-2">
          <Button onClick={save} disabled={saving}>
            {saving ? 'Guardando…' : 'Guardar'}
          </Button>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Al guardar, el sistema manda un mail al propietario del auto con el monto de la oferta.
        </p>
      </CardContent>
    </Card>
  )
}

export default function OfertasClient({
  ofertas, vehicles, interesados,
}: { ofertas: any[]; vehicles: any[]; interesados: any[] }) {
  const [showNueva, setShowNueva] = useState(false)
  const [filter, setFilter] = useState<'todas' | 'pendiente' | 'aceptada' | 'rechazada'>('todas')

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

  const filtradas = filter === 'todas' ? ofertas : ofertas.filter(o => o.estado === filter)
  const sorted = [...filtradas].sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''))
  const pendientes = ofertas.filter(o => o.estado === 'pendiente').length

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-baseline gap-3">
          <h1 className="text-xl font-semibold">Ofertas</h1>
          <span className="text-sm text-muted-foreground">
            {ofertas.length} totales · {pendientes} pendientes
          </span>
        </div>
        <Button size="sm" variant={showNueva ? 'default' : 'outline'} onClick={() => setShowNueva(v => !v)}>
          <PlusIcon /> Nueva oferta
        </Button>
      </div>

      {showNueva && (
        <NuevaOfertaForm vehicles={vehicles} interesados={interesados} onClose={() => setShowNueva(false)} />
      )}

      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs text-muted-foreground mr-1">Filtrar:</span>
        {(['todas','pendiente','aceptada','rechazada'] as const).map(k => (
          <Button
            key={k}
            size="xs"
            variant={filter === k ? 'default' : 'outline'}
            onClick={() => setFilter(k)}
          >
            {k}
          </Button>
        ))}
      </div>

      <Card size="sm">
        <CardContent className="p-0">
          {sorted.map(o => (
            <OfertaRow key={o.id} o={o} vehicleLabel={vehicleLabel} interesadoLabel={interesadoLabel} />
          ))}
          {sorted.length === 0 && (
            <p className="px-4 py-6 text-sm text-muted-foreground text-center">Sin ofertas.</p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
