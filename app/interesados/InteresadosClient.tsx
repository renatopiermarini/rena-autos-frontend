'use client'
import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { patchRecordDetailed, postRecord, deleteRecordDetailed } from '@/lib/kapso'
import { limpiarSugerencias, marcarTocado, type CamposIa } from '@/lib/ia'
import { postIa } from '@/lib/ia-cliente'
import {
  aplicarSugerenciaConDefaults, notasConSeguimiento, sugerenciaInteresado, textoSeguimiento,
  type InteresadoExtraido, type InteresadoForm, type SeguimientoPropuesto,
} from '@/lib/ia-formularios'
import { todayKey } from '@/lib/date'
import { CAMPO_IA_CLS, IaChip, IaSugerenciasBar } from '@/components/ia-hint'
import { FCheckbox } from '@/components/form-fields'
import { cn } from '@/lib/utils'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import { ChevronDownIcon, ChevronUpIcon, Loader2Icon, PlusIcon, SparklesIcon, UsersIcon } from 'lucide-react'
import { EmptyState } from '@/components/empty-state'
import NuevaOfertaDialog from './NuevaOfertaDialog'
import { money, fmtN } from '@/lib/money'

const ESTADO_VARIANT: Record<string, 'default' | 'secondary' | 'outline' | 'destructive' | 'success' | 'warning' | 'info'> = {
  activo: 'info',
  contactado: 'secondary',
  reservo: 'warning',
  compro: 'success',
  perdido: 'destructive',
}

const ESTADOS = ['activo', 'contactado', 'reservo', 'compro', 'perdido'] as const

// `interesados.forma_pago` no está validada en el proxy: "señado" (dejó seña)
// es lo que la IA distingue de "contado" y vale la pena guardarlo tal cual.
const FORMAS_PAGO = ['contado', 'financiado', 'señado', 'permuta', 'mixto'] as const
const FUENTES = ['whatsapp', 'instagram', 'mercadolibre', 'referido', 'otro'] as const

const nativeSelectCls =
  'h-8 w-full rounded-lg border border-input bg-transparent px-2.5 py-1 text-base md:text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50'

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
  i, vehicleLabel, ofertas, vehicles,
}: { i: any; vehicleLabel: (id: any) => string; ofertas: any[]; vehicles: any[] }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [showOferta, setShowOferta] = useState(false)
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
    const { ok, error } = await patchRecordDetailed('interesados', i.id, {
      estado,
      updated_at: new Date().toISOString(),
    })
    setSaving(false)
    if (ok) { toast.success(`Estado: ${estado}`); router.refresh() }
    else toast.error(error || 'Error al actualizar')
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
    const { ok, error } = await patchRecordDetailed('interesados', i.id, payload)
    setSaving(false)
    if (ok) { setEditing(false); toast.success('Guardado'); router.refresh() }
    else toast.error(error || 'Error al guardar')
  }

  async function borrar() {
    if (!confirm(`¿Borrar interesado ${i.nombre}?`)) return
    setSaving(true)
    const { ok, error } = await deleteRecordDetailed('interesados', i.id)
    setSaving(false)
    if (ok) { toast.success('Borrado'); router.refresh() }
    else toast.error(error || 'Error al borrar')
  }

  const ofertasDeEste = ofertas.filter(o => o.interesado_id === i.id)

  return (
    <div className="border-b border-border last:border-0">
      <div
        onClick={() => !editing && setOpen(v => !v)}
        className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-muted/50 transition-colors"
      >
        {/* Botón real para teclado/lector; la fila entera sigue clickeable con mouse. */}
        <button
          type="button"
          aria-expanded={open}
          onClick={e => { e.stopPropagation(); if (!editing) setOpen(v => !v) }}
          className="flex items-center gap-2 min-w-0 rounded text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {open ? <ChevronUpIcon className="size-3 text-muted-foreground shrink-0" aria-hidden /> : <ChevronDownIcon className="size-3 text-muted-foreground shrink-0" aria-hidden />}
          <span className="text-sm font-medium">{i.nombre}</span>
          {i.vehicle_id && (
            <span className="text-xs text-muted-foreground">— {vehicleLabel(i.vehicle_id)}</span>
          )}
        </button>
        <div className="flex items-center gap-3 shrink-0 ml-4">
          {i.presupuesto && <span className="text-xs text-muted-foreground font-mono tabular-nums">{money(i.presupuesto)}</span>}
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
            <Field label="KM máx." value={i.km_max ? fmtN(i.km_max) : null} />
            <Field label="Presupuesto" value={i.presupuesto ? money(i.presupuesto) : null} />
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
                    <span className="text-muted-foreground font-mono tabular-nums">{money(o.monto_ofrecido)}</span>
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
                aria-pressed={i.estado === e}
                onClick={() => setEstadoQuick(e)}
                disabled={saving || i.estado === e}
              >
                {e}
              </Button>
            ))}
            <Button size="xs" variant="outline" onClick={() => setShowOferta(true)} className="ml-auto">
              Registrar oferta
            </Button>
            <Button size="xs" variant="outline" onClick={() => setEditing(true)}>Editar</Button>
            <Button size="xs" variant="destructive" onClick={borrar} disabled={saving}>Borrar</Button>
          </div>

          <NuevaOfertaDialog
            open={showOferta}
            onOpenChange={setShowOferta}
            interesado={i}
            vehicles={vehicles}
          />
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
            {FUENTES.map(f => <option key={f} value={f}>{f}</option>)}
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
            {FORMAS_PAGO.map(f => <option key={f} value={f}>{f}</option>)}
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

const INTERESADO_VACIO: InteresadoForm = {
  nombre: '', telefono: '', email: '', instagram: '',
  fuente: 'otro', vehicle_id: '', marca_buscada: '', modelo_buscado: '',
  'año_min': '', 'año_max': '', km_max: '',
  presupuesto: '', forma_pago: 'contado', notas: '',
}
// Los selects que arrancan con un valor: para la IA cuentan como vacíos.
const DEFAULTS: Partial<InteresadoForm> = { fuente: 'otro', forma_pago: 'contado' }

function NuevoInteresadoForm({
  vehicles, onClose, ia = false,
}: { vehicles: any[]; onClose: () => void; ia?: boolean }) {
  const router = useRouter()
  const [form, setForm] = useState<InteresadoForm>(INTERESADO_VACIO)
  const [camposIa, setCamposIa] = useState<CamposIa<InteresadoForm>>(new Set())
  const [saving, setSaving] = useState(false)
  // La IA contesta segundos después: se aplica sobre el form de ese momento.
  const formRef = useRef(form)
  formRef.current = form

  // ── Chat pegado → IA ──
  const [chat, setChat] = useState('')
  const [leyendo, setLeyendo] = useState(false)
  const [errorIa, setErrorIa] = useState('')
  // El seguimiento propuesto (resumen + próximo paso + fecha). Por ahora sólo se
  // muestra y, si se deja tildado, va al final de las notas.
  // TODO(Fase 5): crear la fila en `seguimientos` junto con el interesado
  // (fuente='ia') en vez de pegarlo a las notas.
  const [seguimiento, setSeguimiento] = useState<SeguimientoPropuesto | null>(null)
  const [agregarANotas, setAgregarANotas] = useState(true)

  function set(field: keyof InteresadoForm) {
    return (e: any) => {
      const v = e.target.value
      setForm(f => ({ ...f, [field]: v }))
      setCamposIa(c => marcarTocado(c, field))
    }
  }
  const esIa = (field: keyof InteresadoForm) => camposIa.has(field)

  async function leerChat() {
    const texto = chat.trim()
    if (!texto || leyendo) return
    setLeyendo(true)
    setErrorIa('')
    const r = await postIa<InteresadoExtraido>('interesado-desde-chat', { texto: texto.slice(0, 8000), hoy: todayKey() })
    setLeyendo(false)
    if (!r.ok) {
      const linea = r.error.split('\n')[0]
      setErrorIa(linea)
      toast.error(linea)
      return
    }
    const { campos, seguimiento: seg } = sugerenciaInteresado(r.data, vehicles)
    const aplicado = aplicarSugerenciaConDefaults(formRef.current, campos, DEFAULTS)
    setForm(aplicado.form)
    setCamposIa(c => new Set([...Array.from(c), ...Array.from(aplicado.camposIa)]))
    setSeguimiento(seg)
    if (aplicado.camposIa.size === 0 && !seg) toast.info('La IA no sacó nada nuevo de ese chat.')
  }

  function limpiarIa() {
    const r = limpiarSugerencias(form, camposIa, INTERESADO_VACIO)
    setForm(r.form)
    setCamposIa(r.camposIa)
    setSeguimiento(null)
  }

  async function save() {
    if (!form.nombre.trim()) { toast.error('El nombre es requerido'); return }
    setSaving(true)
    const notas = agregarANotas ? notasConSeguimiento(form.notas, seguimiento) : form.notas.trim()
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
    if (form['año_min']) payload['año_min'] = Number(form['año_min'])
    if (form['año_max']) payload['año_max'] = Number(form['año_max'])
    if (form.km_max) payload.km_max = Number(form.km_max)
    if (notas) payload.notas = notas
    const r = await postRecord('interesados', payload)
    setSaving(false)
    if (r.ok) { toast.success('Interesado creado'); onClose(); router.refresh() }
    else toast.error(r.error || 'Error al guardar')
  }

  const inputIa = (field: keyof InteresadoForm) => cn(esIa(field) && CAMPO_IA_CLS)

  return (
    <Card size="sm" className="bg-muted/30">
      <CardContent className="space-y-4">
        <p className="text-sm font-medium">Nuevo interesado</p>

        {ia && (
          <div className="space-y-2 rounded-lg border border-dashed border-border bg-background/60 p-3">
            <div className="flex items-center gap-2">
              <SparklesIcon aria-hidden className="size-4 text-muted-foreground" />
              <Label htmlFor="chat-interesado" className="text-sm font-medium">
                Pegá la conversación de WhatsApp/Instagram
              </Label>
            </div>
            <Textarea
              id="chat-interesado"
              value={chat}
              onChange={e => { setChat(e.target.value); if (errorIa) setErrorIa('') }}
              rows={4}
              maxLength={8000}
              placeholder={'[14:02] Marcos: Hola, vi el Golf en Instagram, ¿sigue disponible?\n[14:05] Vos: Sí! ¿Querés venir a verlo?'}
              disabled={leyendo}
            />
            <div className="flex flex-wrap items-center gap-3">
              <Button type="button" size="sm" variant="outline" onClick={leerChat} disabled={leyendo || !chat.trim()}>
                {leyendo
                  ? <><Loader2Icon className="animate-spin motion-reduce:animate-none" /> Leyendo…</>
                  : <><SparklesIcon /> Leer con IA</>}
              </Button>
              <span className="text-xs text-muted-foreground">
                Llena nombre, teléfono, fuente, qué busca, presupuesto y propone el seguimiento.
              </span>
            </div>
            {errorIa && <p role="alert" className="text-xs text-destructive">{errorIa}</p>}
          </div>
        )}
        <IaSugerenciasBar cantidad={camposIa.size} onLimpiar={limpiarIa} />

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-4 gap-y-3">
          <Campo label="Nombre *" ia={esIa('nombre')}><Input value={form.nombre} onChange={set('nombre')} className={inputIa('nombre')} /></Campo>
          <Campo label="Teléfono" ia={esIa('telefono')}><Input value={form.telefono} onChange={set('telefono')} className={inputIa('telefono')} /></Campo>
          <Campo label="Email" ia={esIa('email')}><Input type="email" value={form.email} onChange={set('email')} className={inputIa('email')} /></Campo>
          <Campo label="Instagram" ia={esIa('instagram')}><Input value={form.instagram} onChange={set('instagram')} className={inputIa('instagram')} /></Campo>
          <Campo label="Fuente" ia={esIa('fuente')}>
            <select value={form.fuente} onChange={set('fuente')} className={cn(nativeSelectCls, inputIa('fuente'))}>
              {FUENTES.map(f => <option key={f} value={f}>{f}</option>)}
            </select>
          </Campo>
          <Campo label="Auto de interés" ia={esIa('vehicle_id')}>
            <select value={form.vehicle_id} onChange={set('vehicle_id')} className={cn(nativeSelectCls, inputIa('vehicle_id'))}>
              <option value="">— Sin auto específico</option>
              {vehicles.filter(v => v.estado !== 'vendido').map(v => (
                <option key={v.id} value={v.id}>{v.marca} {v.modelo} {v.año}</option>
              ))}
            </select>
          </Campo>
          <Campo label="Marca buscada" ia={esIa('marca_buscada')}><Input value={form.marca_buscada} onChange={set('marca_buscada')} className={inputIa('marca_buscada')} /></Campo>
          <Campo label="Modelo buscado" ia={esIa('modelo_buscado')}><Input value={form.modelo_buscado} onChange={set('modelo_buscado')} className={inputIa('modelo_buscado')} /></Campo>
          <Campo label="Presupuesto USD" ia={esIa('presupuesto')}><Input type="number" value={form.presupuesto} onChange={set('presupuesto')} className={inputIa('presupuesto')} /></Campo>
          <Campo label="Año mín." ia={esIa('año_min')}><Input type="number" value={form['año_min']} onChange={set('año_min')} className={inputIa('año_min')} /></Campo>
          <Campo label="Año máx." ia={esIa('año_max')}><Input type="number" value={form['año_max']} onChange={set('año_max')} className={inputIa('año_max')} /></Campo>
          <Campo label="KM máx." ia={esIa('km_max')}><Input type="number" value={form.km_max} onChange={set('km_max')} className={inputIa('km_max')} /></Campo>
          <Campo label="Forma de pago" ia={esIa('forma_pago')}>
            <select value={form.forma_pago} onChange={set('forma_pago')} className={cn(nativeSelectCls, inputIa('forma_pago'))}>
              {FORMAS_PAGO.map(f => <option key={f} value={f}>{f}</option>)}
            </select>
          </Campo>
          <Campo label="Notas" ia={esIa('notas')} className="col-span-2 sm:col-span-3 lg:col-span-4">
            <Textarea value={form.notas} onChange={set('notas')} rows={2} className={inputIa('notas')} />
          </Campo>
        </div>

        {seguimiento && (
          <div className="space-y-2 rounded-lg border border-info/30 bg-info/10 px-3 py-2 text-sm">
            <p className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
              <SparklesIcon aria-hidden className="size-3.5 text-info" /> Seguimiento propuesto
            </p>
            {seguimiento.resumen && <p>{seguimiento.resumen}</p>}
            {(seguimiento.proximo_paso || seguimiento.fecha_sugerida) && (
              <p>
                <span className="text-muted-foreground">Próximo paso: </span>
                {seguimiento.proximo_paso || '—'}
                {seguimiento.fecha_sugerida && (
                  <span className="ml-1.5 font-mono text-xs tabular-nums text-muted-foreground">{seguimiento.fecha_sugerida}</span>
                )}
              </p>
            )}
            <FCheckbox
              id="seguimiento-a-notas"
              label="Agregar a notas"
              checked={agregarANotas}
              onChange={setAgregarANotas}
              hint={agregarANotas ? `Se guarda como: "${textoSeguimiento(seguimiento)}"` : 'Sólo se muestra acá; no se guarda.'}
            />
          </div>
        )}

        <div className="flex gap-2">
          <Button onClick={save} disabled={saving}>{saving ? 'Guardando…' : 'Guardar'}</Button>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
        </div>
      </CardContent>
    </Card>
  )
}

export default function InteresadosClient({
  interesados, vehicles, ofertas, ia = false,
}: {
  interesados: any[]; vehicles: any[]; ofertas: any[]
  /** ¿Hay backend de IA? Enciende "Pegá la conversación" en el alta. */
  ia?: boolean
}) {
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
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-baseline gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">Interesados</h1>
          <span className="text-sm text-muted-foreground">{interesados.length} totales · {activos} activos</span>
        </div>
        <Button size="sm" variant={showNuevo ? 'default' : 'outline'} aria-expanded={showNuevo} onClick={() => setShowNuevo(v => !v)}>
          <PlusIcon /> Nuevo interesado
        </Button>
      </div>

      {showNuevo && (
        <NuevoInteresadoForm vehicles={vehicles} onClose={() => setShowNuevo(false)} ia={ia} />
      )}

      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs text-muted-foreground mr-1">Filtrar:</span>
        {(['todos', ...ESTADOS] as const).map(k => (
          <Button
            key={k}
            size="xs"
            variant={filter === k ? 'default' : 'outline'}
            aria-pressed={filter === k}
            onClick={() => setFilter(k)}
          >
            {k}
          </Button>
        ))}
      </div>

      <Card size="sm">
        <CardContent className="p-0">
          {sorted.map(i => (
            <InteresadoRow key={i.id} i={i} vehicleLabel={vehicleLabel} ofertas={ofertas} vehicles={vehicles} />
          ))}
          {sorted.length === 0 && (
            <EmptyState icon={UsersIcon} title="Sin interesados" hint="Sumá uno con “Nuevo interesado”." />
          )}
        </CardContent>
      </Card>
    </div>
  )
}
