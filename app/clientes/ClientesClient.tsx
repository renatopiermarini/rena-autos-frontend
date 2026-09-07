'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useDeepLinkFlag, useDeepLinkId, useScrollToDeepLink } from '@/lib/deep-link'
import { aplicarSugerencia, limpiarSugerencias, marcarTocado, type CamposIa } from '@/lib/ia'
import { sugerenciaCliente, type ClienteExtraido } from '@/lib/ia-formularios'
import { IaDropzone } from '@/components/ia-dropzone'
import { CAMPO_IA_CLS, IaChip, IaSugerenciasBar } from '@/components/ia-hint'
import { cn } from '@/lib/utils'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import { ChevronDownIcon, ChevronUpIcon, ContactIcon, PlusIcon } from 'lucide-react'
import { EmptyState } from '@/components/empty-state'
import NuevoClienteDialog from './NuevoClienteDialog'
import { money, fmtN } from '@/lib/money'

const TIPO_VARIANT: Record<string, 'default' | 'secondary' | 'outline' | 'destructive'> = {
  vendedor: 'secondary',
  comprador: 'default',
  acreedor: 'destructive',
}

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

/** Un campo de la edición inline; `ia` = lo puso la IA y nadie lo tocó (chip + borde info). */
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

function ClienteRow({ c, ia = false, deepLink = false, abrirDni = false }: {
  c: any
  ia?: boolean
  /** Llegó por `?id=`: abre la ficha y la resalta. */
  deepLink?: boolean
  /** `?id=&dni=1` (desde el error de un contrato): abre directo en edición, con el dropzone del DNI a la vista. */
  abrirDni?: boolean
}) {
  const router = useRouter()
  const [open, setOpen] = useState(deepLink)
  const [editing, setEditing] = useState(deepLink && abrirDni && ia)
  const [saving, setSaving] = useState(false)

  const inicial = {
    nombre: c.nombre ?? '',
    telefono: c.telefono ?? '',
    whatsapp: c.whatsapp ?? '',
    email: c.email ?? '',
    instagram: c.instagram ?? '',
    dni: c.dni ?? '',
    cuil: c.cuil ?? '',
    direccion: c.direccion ?? '',
    fecha_nacimiento: c.fecha_nacimiento ?? '',
    tipo: c.tipo ?? 'comprador',
    notas: c.notas ?? '',
    es_acreedor: c.es_acreedor ? '1' : '0',
  }
  type FormEdicion = typeof inicial
  const [form, setForm] = useState<FormEdicion>(inicial)
  const [camposIa, setCamposIa] = useState<CamposIa<FormEdicion>>(new Set())
  // La IA contesta segundos después: se aplica sobre el form de ese momento.
  const formRef = useRef(form)
  formRef.current = form

  // Los deep links se leen después de montar (lib/deep-link): abrir cuando llegan.
  useEffect(() => {
    if (!deepLink) return
    setOpen(true)
    if (abrirDni && ia) setEditing(true)
  }, [deepLink, abrirDni, ia])

  function set(field: keyof FormEdicion) {
    return (val: string) => {
      setForm(f => ({ ...f, [field]: val }))
      setCamposIa(x => marcarTocado(x, field))
    }
  }
  const esIa = (field: keyof FormEdicion) => camposIa.has(field)

  // El DNI llena SÓLO lo que está vacío en la ficha (aplicarSugerencia sin pisar).
  const onDni = useCallback((data: ClienteExtraido) => {
    const r = aplicarSugerencia(formRef.current, sugerenciaCliente(data))
    setForm(r.form)
    setCamposIa(x => new Set([...Array.from(x), ...Array.from(r.camposIa)]))
    if (r.camposIa.size === 0) toast.info('El DNI no trajo nada que faltara en la ficha.')
  }, [])

  function limpiarIa() {
    const r = limpiarSugerencias(form, camposIa, inicial)
    setForm(r.form)
    setCamposIa(r.camposIa)
  }

  function cancelarEdicion() {
    setForm(inicial)
    setCamposIa(new Set())
    setEditing(false)
  }

  async function save() {
    setSaving(true)
    const payload: Record<string, any> = {
      ...form,
      es_acreedor: form.es_acreedor === '1' ? 1 : 0,
      updated_at: new Date().toISOString(),
    }
    for (const k of Object.keys(payload)) {
      if (payload[k] === '' && k !== 'nombre') payload[k] = null
    }
    const res = await fetch(`/api/db/clientes?id=${c.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    setSaving(false)
    if (res.ok) {
      setEditing(false)
      setCamposIa(new Set())
      toast.success('Cliente actualizado')
      router.refresh()
    } else {
      const err = await res.json().catch(() => ({} as any))
      toast.error(err.message || err.error || 'Error al guardar')
    }
  }

  return (
    <div
      id={`cliente-${c.id}`}
      className={cn('border-b border-border last:border-0', deepLink && 'bg-primary/5 ring-1 ring-inset ring-primary/30')}
    >
      <div
        onClick={() => !editing && setOpen(o => !o)}
        className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-muted/50 transition-colors"
      >
        {/* Botón real para teclado/lector; la fila entera sigue clickeable con mouse. */}
        <button
          type="button"
          aria-expanded={open}
          onClick={e => { e.stopPropagation(); if (!editing) setOpen(o => !o) }}
          className="flex items-center gap-2 rounded text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {open ? <ChevronUpIcon className="size-3 text-muted-foreground" aria-hidden /> : <ChevronDownIcon className="size-3 text-muted-foreground" aria-hidden />}
          {/* Filas sin nombre (el bot guardó sólo el teléfono): placeholder
              visible en vez de una fila que parece vacía/rota. */}
          {c.nombre?.trim()
            ? <span className="text-sm font-medium">{c.nombre}</span>
            : <span className="text-sm italic text-muted-foreground">Sin nombre{c.telefono ? '' : ` · #${c.id}`}</span>}
          {c.es_acreedor ? <Badge variant="destructive">acreedor</Badge> : null}
        </button>
        <div className="flex items-center gap-4 flex-wrap justify-end">
          {c.telefono && <span className="text-xs text-muted-foreground">{c.telefono}</span>}
          {c.email && <span className="text-xs text-muted-foreground">{c.email}</span>}
          <Badge variant={TIPO_VARIANT[c.tipo] ?? 'outline'}>{c.tipo}</Badge>
        </div>
      </div>

      {open && !editing && (
        <div className="px-10 pb-4 pt-1 bg-muted/30">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-8 gap-y-3">
            <Field label="WhatsApp" value={c.whatsapp} />
            <Field label="Instagram" value={c.instagram} />
            <Field label="DNI" value={c.dni} />
            <Field label="CUIL" value={c.cuil} />
            <Field label="Fecha de nacimiento" value={c.fecha_nacimiento} />
            <Field label="Dirección" value={c.direccion} />
            {c.notas && (
              <div className="col-span-2 lg:col-span-4">
                <p className="text-xs text-muted-foreground">Notas</p>
                <p className="text-sm">{c.notas}</p>
              </div>
            )}
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={e => { e.stopPropagation(); setEditing(true) }}
            className="mt-3"
          >
            Editar
          </Button>
        </div>
      )}

      {open && editing && (
        <div className="px-10 pb-5 pt-3 bg-muted/30">
          {ia && (
            <IaDropzone<ClienteExtraido>
              accion="cliente-desde-dni"
              campos={['frente', 'dorso']}
              label="Completar desde el DNI"
              hint="Soltá una o dos fotos (primero el frente): se llenan sólo los datos que faltan · hasta 10 MB · también Ctrl+V"
              onResultado={onDni}
              disabled={saving}
              className="mb-4"
            />
          )}
          <IaSugerenciasBar cantidad={camposIa.size} onLimpiar={limpiarIa} className="mb-4" />
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-6 gap-y-4">
            <Campo label="Nombre" ia={esIa('nombre')}>
              <Input value={form.nombre} onChange={e => set('nombre')(e.target.value)} className={cn(esIa('nombre') && CAMPO_IA_CLS)} />
            </Campo>
            <Campo label="Tipo">
              <select value={form.tipo} onChange={e => set('tipo')(e.target.value)} className={nativeSelectCls}>
                <option value="comprador">comprador</option>
                <option value="vendedor">vendedor</option>
                <option value="acreedor">acreedor</option>
              </select>
            </Campo>
            <Campo label="Teléfono">
              <Input value={form.telefono} onChange={e => set('telefono')(e.target.value)} />
            </Campo>
            <Campo label="WhatsApp">
              <Input value={form.whatsapp} onChange={e => set('whatsapp')(e.target.value)} />
            </Campo>
            <Campo label="Email">
              <Input type="email" value={form.email} onChange={e => set('email')(e.target.value)} />
            </Campo>
            <Campo label="Instagram">
              <Input value={form.instagram} onChange={e => set('instagram')(e.target.value)} />
            </Campo>
            <Campo label="DNI" ia={esIa('dni')}>
              <Input value={form.dni} onChange={e => set('dni')(e.target.value)} className={cn(esIa('dni') && CAMPO_IA_CLS)} />
            </Campo>
            <Campo label="CUIL" ia={esIa('cuil')}>
              <Input value={form.cuil} onChange={e => set('cuil')(e.target.value)} className={cn(esIa('cuil') && CAMPO_IA_CLS)} />
            </Campo>
            <Campo label="Fecha de nacimiento" ia={esIa('fecha_nacimiento')}>
              <Input
                value={form.fecha_nacimiento}
                onChange={e => set('fecha_nacimiento')(e.target.value)}
                placeholder="DD/MM/AAAA"
                className={cn(esIa('fecha_nacimiento') && CAMPO_IA_CLS)}
              />
            </Campo>
            <Campo label="Dirección" ia={esIa('direccion')} className="col-span-2">
              <Input value={form.direccion} onChange={e => set('direccion')(e.target.value)} className={cn(esIa('direccion') && CAMPO_IA_CLS)} />
            </Campo>
            <div className="flex items-center gap-2 pt-6">
              <input
                type="checkbox"
                id={`acreedor-${c.id}`}
                checked={form.es_acreedor === '1'}
                onChange={e => set('es_acreedor')(e.target.checked ? '1' : '0')}
                className="rounded border-input"
              />
              <Label htmlFor={`acreedor-${c.id}`} className="text-xs">Es acreedor</Label>
            </div>
            <div className="col-span-2 sm:col-span-3 lg:col-span-4 space-y-1.5">
              <Label>Notas</Label>
              <Textarea value={form.notas} onChange={e => set('notas')(e.target.value)} rows={2} />
            </div>
          </div>
          <div className="flex gap-2 mt-4">
            <Button onClick={save} disabled={saving}>
              {saving ? 'Guardando…' : 'Guardar'}
            </Button>
            <Button variant="outline" onClick={cancelarEdicion}>Cancelar</Button>
          </div>
        </div>
      )}
    </div>
  )
}

function InteresadoRow({ i }: { i: any }) {
  const [open, setOpen] = useState(false)
  const hasExtra = i.email || i.instagram || i.fuente || i.año_max || i.km_max || i.forma_pago || i.notas || i.fecha_ultimo_contacto

  return (
    <div className="border-b border-border last:border-0">
      <div
        onClick={() => hasExtra && setOpen(o => !o)}
        className={`flex items-center justify-between px-4 py-3 ${hasExtra ? 'cursor-pointer hover:bg-muted/50' : ''} transition-colors`}
      >
        <button
          type="button"
          aria-expanded={open}
          disabled={!hasExtra}
          onClick={e => { e.stopPropagation(); if (hasExtra) setOpen(o => !o) }}
          className="flex items-center gap-2 min-w-0 rounded text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {hasExtra && (open
            ? <ChevronUpIcon className="size-3 text-muted-foreground shrink-0" aria-hidden />
            : <ChevronDownIcon className="size-3 text-muted-foreground shrink-0" aria-hidden />
          )}
          <span className="min-w-0 block">
            {i.nombre?.trim()
              ? <span className="text-sm font-medium">{i.nombre}</span>
              : <span className="text-sm italic text-muted-foreground">Sin nombre{i.telefono ? '' : ` · #${i.id}`}</span>}
            {(i.marca_buscada || i.modelo_buscado) && (
              <span className="text-xs text-muted-foreground ml-2">
                busca: {[i.marca_buscada, i.modelo_buscado, i.año_min && `desde ${i.año_min}`].filter(Boolean).join(' ')}
              </span>
            )}
          </span>
        </button>
        <div className="flex items-center gap-4 shrink-0 ml-4">
          {i.presupuesto && (
            <span className="text-xs text-muted-foreground">{money(i.presupuesto)}</span>
          )}
          {i.telefono && <span className="text-xs text-muted-foreground">{i.telefono}</span>}
          <Badge variant="outline">{i.estado}</Badge>
        </div>
      </div>

      {open && (
        <div className="px-10 pb-4 pt-1 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-8 gap-y-3 bg-muted/30">
          <Field label="Email" value={i.email} />
          <Field label="Instagram" value={i.instagram} />
          <Field label="Fuente" value={i.fuente} />
          <Field label="Forma de pago" value={i.forma_pago} />
          <Field label="Año máx." value={i.año_max} />
          <Field label="KM máx." value={i.km_max ? fmtN(i.km_max) : null} />
          <Field label="Último contacto" value={i.fecha_ultimo_contacto ? new Date(i.fecha_ultimo_contacto).toLocaleDateString('es-AR') : null} />
          {i.notas && (
            <div className="col-span-2 lg:col-span-4">
              <p className="text-xs text-muted-foreground">Notas</p>
              <p className="text-sm">{i.notas}</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default function ClientesClient({
  clientes, interesados, ia = false,
}: {
  clientes: any[]; interesados: any[]
  /** ¿Hay backend de IA? Enciende el dropzone del DNI (alta y edición). */
  ia?: boolean
}) {
  const interesadosActivos = interesados.filter(i => i.estado !== 'compro' && i.estado !== 'perdido')
  const [showNew, setShowNew] = useState(false)
  // `?id=<cliente>` abre la ficha; `&dni=1` (desde el error de un contrato que
  // pide DNI/CUIL/domicilio) la abre directo en edición con el dropzone del DNI.
  const deepId = useDeepLinkId()
  const abrirDni = useDeepLinkFlag('dni')
  useScrollToDeepLink(deepId, 'cliente')

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Clientes</h1>
        <Button onClick={() => setShowNew(true)}><PlusIcon /> Nuevo cliente</Button>
      </div>

      <NuevoClienteDialog open={showNew} onOpenChange={setShowNew} ia={ia} />

      <section>
        <p className="text-xs text-muted-foreground uppercase tracking-wide mb-3">
          Clientes ({clientes.length})
        </p>
        <Card size="sm">
          <CardContent className="p-0">
            {clientes.map(c => (
              <ClienteRow key={c.id} c={c} ia={ia} deepLink={c.id === deepId} abrirDni={abrirDni} />
            ))}
            {clientes.length === 0 && (
              <EmptyState icon={ContactIcon} title="Sin clientes registrados" className="py-6" />
            )}
          </CardContent>
        </Card>
      </section>

      <section>
        <p className="text-xs text-muted-foreground uppercase tracking-wide mb-3">
          Interesados activos ({interesadosActivos.length})
        </p>
        <Card size="sm">
          <CardContent className="p-0">
            {interesadosActivos.map(i => <InteresadoRow key={i.id} i={i} />)}
            {interesadosActivos.length === 0 && (
              <p className="px-4 py-3 text-sm text-muted-foreground">Sin interesados activos.</p>
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  )
}
