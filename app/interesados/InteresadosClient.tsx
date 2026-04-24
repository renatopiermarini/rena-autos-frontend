'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { patchRecord, postRecord, deleteRecord } from '@/lib/kapso'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import { ChevronDownIcon, ChevronUpIcon, PlusIcon } from 'lucide-react'

const ESTADO_VARIANT: Record<string, 'default' | 'secondary' | 'outline' | 'destructive'> = {
  activo: 'default',
  contactado: 'secondary',
  reservo: 'secondary',
  compro: 'outline',
  perdido: 'destructive',
}

const ESTADOS = ['activo', 'contactado', 'reservo', 'compro', 'perdido'] as const

const nativeSelectCls =
  'h-8 w-full rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50'

function Field({ label, value }: { label: string; value: any }) {
  if (!value && value !== 0) return null
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm">{value}</p>
    </div>
  )
}

function InteresadoRow({
  i, vehicleLabel, ofertas,
}: { i: any; vehicleLabel: (id: any) => string; ofertas: any[] }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    nombre: i.nombre ?? '',
    telefono: i.telefono ?? '',
    email: i.email ?? '',
    instagram: i.instagram ?? '',
    fuente: i.fuente ?? 'otro',
    vehicle_id: i.vehicle_id ? String(i.vehicle_id) : '',
    marca_buscada: i.marca_buscada ?? '',
    modelo_buscado: i.modelo_buscado ?? '',
    año_min: i.año_min ?? '',
    año_max: i.año_max ?? '',
    km_max: i.km_max ?? '',
    presupuesto: i.presupuesto ?? '',
    forma_pago: i.forma_pago ?? 'contado',
    estado: i.estado ?? 'activo',
    notas: i.notas ?? '',
  })

  async function setEstadoQuick(estado: string) {
    setSaving(true)
    const ok = await patchRecord('interesados', i.id, {
      estado,
      updated_at: new Date().toISOString(),
    })
    setSaving(false)
    if (ok) { toast.success(`Estado: ${estado}`); router.refresh() }
  }

  async function save() {
    setSaving(true)
    const payload: any = { ...form, updated_at: new Date().toISOString() }
    for (const k of ['año_min','año_max','km_max','presupuesto']) {
      payload[k] = payload[k] === '' ? null : Number(payload[k])
    }
    payload.vehicle_id = form.vehicle_id ? Number(form.vehicle_id) : null
    for (const k of Object.keys(payload)) {
      if (payload[k] === '' && k !== 'nombre') payload[k] = null
    }
    const ok = await patchRecord('interesados', i.id, payload)
    setSaving(false)
    if (ok) { setEditing(false); toast.success('Guardado'); router.refresh() }
  }

  async function borrar() {
    if (!confirm(`¿Borrar interesado ${i.nombre}?`)) return
    setSaving(true)
    const ok = await deleteRecord('interesados', i.id)
    setSaving(false)
    if (ok) { toast.success('Borrado'); router.refresh() }
  }

  const ofertasDeEste = ofertas.filter(o => o.interesado_id === i.id)

  return (
    <div className="border-b border-border last:border-0">
      <div
        onClick={() => !editing && setOpen(v => !v)}
        className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-muted/50 transition-colors"
      >
        <div className="flex items-center gap-2 min-w-0">
          {open ? <ChevronUpIcon className="size-3 text-muted-foreground shrink-0" /> : <ChevronDownIcon className="size-3 text-muted-foreground shrink-0" />}
          <span className="text-sm font-medium">{i.nombre}</span>
          {i.vehicle_id && (
            <span className="text-xs text-muted-foreground">— {vehicleLabel(i.vehicle_id)}</span>
          )}
        </div>
        <div className="flex items-center gap-3 shrink-0 ml-4">
          {i.presupuesto && <span className="text-xs text-muted-foreground tabular-nums">USD {Number(i.presupuesto).toLocaleString('es-AR')}</span>}
          {i.telefono && <span className="text-xs text-muted-foreground">{i.telefono}</span>}
          <Badge variant={ESTADO_VARIANT[i.estado] ?? 'outline'}>{i.estado}</Badge>
        </div>
      </div>

      {open && !editing && (
        <div className="px-10 py-4 bg-muted/30 space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-6 gap-y-3">
            <Field label="Email" value={i.email} />
            <Field label="Instagram" value={i.instagram} />
            <Field label="Fuente" value={i.fuente} />
            <Field label="Auto de interés" value={i.vehicle_id ? vehicleLabel(i.vehicle_id) : null} />
            <Field label="Busca" value={[i.marca_buscada, i.modelo_buscado].filter(Boolean).join(' ') || null} />
            <Field label="Año mín." value={i.año_min} />
            <Field label="Año máx." value={i.año_max} />
            <Field label="KM máx." value={i.km_max ? Number(i.km_max).toLocaleString('es-AR') : null} />
            <Field label="Presupuesto" value={i.presupuesto ? `USD ${Number(i.presupuesto).toLocaleString('es-AR')}` : null} />
            <Field label="Forma de pago" value={i.forma_pago} />
            <Field label="Último contacto" value={i.fecha_ultimo_contacto ? new Date(i.fecha_ultimo_contacto).toLocaleDateString('es-AR') : null} />
            {i.notas && <div className="col-span-full"><p className="text-xs text-muted-foreground">Notas</p><p className="text-sm">{i.notas}</p></div>}
          </div>

          {ofertasDeEste.length > 0 && (
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wide mb-2">Ofertas ({ofertasDeEste.length})</p>
              <div className="space-y-1">
                {ofertasDeEste.map(o => (
                  <div key={o.id} className="text-sm flex items-center gap-3">
                    <span>{vehicleLabel(o.vehicle_id)}</span>
                    <span className="text-muted-foreground tabular-nums">USD {Number(o.monto_ofrecido).toLocaleString('es-AR')}</span>
                    <Badge variant="outline">{o.estado}</Badge>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-muted-foreground mr-1">Estado rápido:</span>
            {ESTADOS.map(e => (
              <Button
                key={e}
                size="xs"
                variant={i.estado === e ? 'default' : 'outline'}
                onClick={() => setEstadoQuick(e)}
                disabled={saving || i.estado === e}
              >
                {e}
              </Button>
            ))}
            <Button size="xs" variant="outline" onClick={() => setEditing(true)} className="ml-auto">Editar</Button>
            <Button size="xs" variant="destructive" onClick={borrar} disabled={saving}>Borrar</Button>
          </div>
        </div>
      )}

      {open && editing && (
        <EditForm form={form} setForm={setForm} saving={saving} onSave={save} onCancel={() => setEditing(false)} />
      )}
    </div>
  )
}

function EditForm({
  form, setForm, saving, onSave, onCancel,
}: {
  form: any; setForm: (f: any) => void;
  saving: boolean; onSave: () => void; onCancel: () => void;
}) {
  function set(field: string) {
    return (e: any) => setForm({ ...form, [field]: e.target.value })
  }
  return (
    <div className="px-10 py-4 bg-muted/30 space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-4 gap-y-3">
        <div className="space-y-1.5"><Label>Nombre</Label><Input value={form.nombre} onChange={set('nombre')} /></div>
        <div className="space-y-1.5"><Label>Teléfono</Label><Input value={form.telefono} onChange={set('telefono')} /></div>
        <div className="space-y-1.5"><Label>Email</Label><Input type="email" value={form.email} onChange={set('email')} /></div>
        <div className="space-y-1.5"><Label>Instagram</Label><Input value={form.instagram} onChange={set('instagram')} /></div>
        <div className="space-y-1.5">
          <Label>Fuente</Label>
          <select value={form.fuente} onChange={set('fuente')} className={nativeSelectCls}>
            <option value="whatsapp">whatsapp</option>
            <option value="instagram">instagram</option>
            <option value="mercadolibre">mercadolibre</option>
            <option value="referido">referido</option>
            <option value="otro">otro</option>
          </select>
        </div>
        <div className="space-y-1.5">
          <Label>Estado</Label>
          <select value={form.estado} onChange={set('estado')} className={nativeSelectCls}>
            {ESTADOS.map(e => <option key={e} value={e}>{e}</option>)}
          </select>
        </div>
        <div className="space-y-1.5"><Label>Marca buscada</Label><Input value={form.marca_buscada} onChange={set('marca_buscada')} /></div>
        <div className="space-y-1.5"><Label>Modelo buscado</Label><Input value={form.modelo_buscado} onChange={set('modelo_buscado')} /></div>
        <div className="space-y-1.5"><Label>Presupuesto USD</Label><Input type="number" value={form.presupuesto} onChange={set('presupuesto')} /></div>
        <div className="space-y-1.5"><Label>Año mín.</Label><Input type="number" value={form.año_min} onChange={set('año_min')} /></div>
        <div className="space-y-1.5"><Label>Año máx.</Label><Input type="number" value={form.año_max} onChange={set('año_max')} /></div>
        <div className="space-y-1.5"><Label>KM máx.</Label><Input type="number" value={form.km_max} onChange={set('km_max')} /></div>
        <div className="space-y-1.5">
          <Label>Forma de pago</Label>
          <select value={form.forma_pago} onChange={set('forma_pago')} className={nativeSelectCls}>
            <option value="contado">contado</option>
            <option value="financiado">financiado</option>
            <option value="permuta">permuta</option>
            <option value="mixto">mixto</option>
          </select>
        </div>
        <div className="col-span-2 sm:col-span-3 lg:col-span-4 space-y-1.5">
          <Label>Notas</Label>
          <Textarea value={form.notas} onChange={set('notas')} rows={2} />
        </div>
      </div>
      <div className="flex gap-2">
        <Button onClick={onSave} disabled={saving}>{saving ? 'Guardando…' : 'Guardar'}</Button>
        <Button variant="outline" onClick={onCancel}>Cancelar</Button>
      </div>
    </div>
  )
}

function NuevoInteresadoForm({
  vehicles, onClose,
}: { vehicles: any[]; onClose: () => void }) {
  const router = useRouter()
  const [form, setForm] = useState({
    nombre: '', telefono: '', email: '', instagram: '',
    fuente: 'otro', vehicle_id: '', marca_buscada: '', modelo_buscado: '',
    presupuesto: '', forma_pago: 'contado',
  })
  const [saving, setSaving] = useState(false)

  function set(field: string) {
    return (e: any) => setForm(f => ({ ...f, [field]: e.target.value }))
  }

  async function save() {
    if (!form.nombre.trim()) { toast.error('El nombre es requerido'); return }
    setSaving(true)
    const payload: any = {
      nombre: form.nombre.trim(),
      telefono: form.telefono || null,
      email: form.email || null,
      instagram: form.instagram || null,
      fuente: form.fuente,
      forma_pago: form.forma_pago,
      estado: 'activo',
      created_at: new Date().toISOString(),
    }
    if (form.vehicle_id) payload.vehicle_id = Number(form.vehicle_id)
    if (form.marca_buscada) payload.marca_buscada = form.marca_buscada
    if (form.modelo_buscado) payload.modelo_buscado = form.modelo_buscado
    if (form.presupuesto) payload.presupuesto = Number(form.presupuesto)
    const r = await postRecord('interesados', payload)
    setSaving(false)
    if (r.ok) { toast.success('Interesado creado'); onClose(); router.refresh() }
    else toast.error('Error al guardar')
  }

  return (
    <Card size="sm" className="bg-muted/30">
      <CardContent className="space-y-4">
        <p className="text-sm font-medium">Nuevo interesado</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-4 gap-y-3">
          <div className="space-y-1.5"><Label>Nombre *</Label><Input value={form.nombre} onChange={set('nombre')} /></div>
          <div className="space-y-1.5"><Label>Teléfono</Label><Input value={form.telefono} onChange={set('telefono')} /></div>
          <div className="space-y-1.5"><Label>Email</Label><Input type="email" value={form.email} onChange={set('email')} /></div>
          <div className="space-y-1.5"><Label>Instagram</Label><Input value={form.instagram} onChange={set('instagram')} /></div>
          <div className="space-y-1.5">
            <Label>Fuente</Label>
            <select value={form.fuente} onChange={set('fuente')} className={nativeSelectCls}>
              <option value="whatsapp">whatsapp</option>
              <option value="instagram">instagram</option>
              <option value="mercadolibre">mercadolibre</option>
              <option value="referido">referido</option>
              <option value="otro">otro</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <Label>Auto de interés</Label>
            <select value={form.vehicle_id} onChange={set('vehicle_id')} className={nativeSelectCls}>
              <option value="">— Sin auto específico</option>
              {vehicles.filter(v => v.estado !== 'vendido').map(v => (
                <option key={v.id} value={v.id}>{v.marca} {v.modelo} {v.año}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5"><Label>Marca buscada</Label><Input value={form.marca_buscada} onChange={set('marca_buscada')} /></div>
          <div className="space-y-1.5"><Label>Modelo buscado</Label><Input value={form.modelo_buscado} onChange={set('modelo_buscado')} /></div>
          <div className="space-y-1.5"><Label>Presupuesto USD</Label><Input type="number" value={form.presupuesto} onChange={set('presupuesto')} /></div>
          <div className="space-y-1.5">
            <Label>Forma de pago</Label>
            <select value={form.forma_pago} onChange={set('forma_pago')} className={nativeSelectCls}>
              <option value="contado">contado</option>
              <option value="financiado">financiado</option>
              <option value="permuta">permuta</option>
              <option value="mixto">mixto</option>
            </select>
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

export default function InteresadosClient({
  interesados, vehicles, ofertas,
}: { interesados: any[]; vehicles: any[]; ofertas: any[] }) {
  const [showNuevo, setShowNuevo] = useState(false)
  const [filter, setFilter] = useState<'todos' | typeof ESTADOS[number]>('todos')

  function vehicleLabel(id: any) {
    const v = vehicles.find(v => v.id === id)
    if (!v) return '—'
    const auto = `${v.marca ?? ''} ${v.modelo ?? ''} ${v.año ?? ''}`.trim()
    return v.dominio ? `${auto} (${v.dominio})` : auto
  }

  const filtrados = filter === 'todos' ? interesados : interesados.filter(i => i.estado === filter)
  const sorted = [...filtrados].sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''))
  const activos = interesados.filter(i => i.estado === 'activo').length

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-baseline gap-3">
          <h1 className="text-xl font-semibold">Interesados</h1>
          <span className="text-sm text-muted-foreground">{interesados.length} totales · {activos} activos</span>
        </div>
        <Button size="sm" variant={showNuevo ? 'default' : 'outline'} onClick={() => setShowNuevo(v => !v)}>
          <PlusIcon /> Nuevo interesado
        </Button>
      </div>

      {showNuevo && (
        <NuevoInteresadoForm vehicles={vehicles} onClose={() => setShowNuevo(false)} />
      )}

      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs text-muted-foreground mr-1">Filtrar:</span>
        {(['todos', ...ESTADOS] as const).map(k => (
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
          {sorted.map(i => (
            <InteresadoRow key={i.id} i={i} vehicleLabel={vehicleLabel} ofertas={ofertas} />
          ))}
          {sorted.length === 0 && (
            <p className="px-4 py-6 text-sm text-muted-foreground text-center">Sin interesados.</p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
