'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import { ChevronDownIcon, ChevronUpIcon } from 'lucide-react'

const TIPO_VARIANT: Record<string, 'default' | 'secondary' | 'outline' | 'destructive'> = {
  vendedor: 'secondary',
  comprador: 'default',
  ambos: 'outline',
}

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

function ClienteRow({ c }: { c: any }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)

  const [form, setForm] = useState({
    nombre: c.nombre ?? '',
    telefono: c.telefono ?? '',
    whatsapp: c.whatsapp ?? '',
    email: c.email ?? '',
    instagram: c.instagram ?? '',
    dni: c.dni ?? '',
    cuil: c.cuil ?? '',
    direccion: c.direccion ?? '',
    tipo: c.tipo ?? 'comprador',
    notas: c.notas ?? '',
    es_acreedor: c.es_acreedor ? '1' : '0',
  })

  function set(field: string) {
    return (val: string) => setForm(f => ({ ...f, [field]: val }))
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
      toast.success('Cliente actualizado')
      router.refresh()
    } else {
      toast.error('Error al guardar')
    }
  }

  return (
    <div className="border-b border-border last:border-0">
      <div
        onClick={() => !editing && setOpen(o => !o)}
        className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-muted/50 transition-colors"
      >
        <div className="flex items-center gap-2">
          {open ? <ChevronUpIcon className="size-3 text-muted-foreground" /> : <ChevronDownIcon className="size-3 text-muted-foreground" />}
          <span className="text-sm font-medium">{c.nombre}</span>
          {c.es_acreedor ? <Badge variant="destructive">acreedor</Badge> : null}
        </div>
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
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-6 gap-y-4">
            <div className="space-y-1.5">
              <Label>Nombre</Label>
              <Input value={form.nombre} onChange={e => set('nombre')(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Tipo</Label>
              <select value={form.tipo} onChange={e => set('tipo')(e.target.value)} className={nativeSelectCls}>
                <option value="comprador">comprador</option>
                <option value="vendedor">vendedor</option>
                <option value="ambos">ambos</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>Teléfono</Label>
              <Input value={form.telefono} onChange={e => set('telefono')(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>WhatsApp</Label>
              <Input value={form.whatsapp} onChange={e => set('whatsapp')(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Email</Label>
              <Input type="email" value={form.email} onChange={e => set('email')(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Instagram</Label>
              <Input value={form.instagram} onChange={e => set('instagram')(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>DNI</Label>
              <Input value={form.dni} onChange={e => set('dni')(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>CUIL</Label>
              <Input value={form.cuil} onChange={e => set('cuil')(e.target.value)} />
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label>Dirección</Label>
              <Input value={form.direccion} onChange={e => set('direccion')(e.target.value)} />
            </div>
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
            <Button variant="outline" onClick={() => setEditing(false)}>Cancelar</Button>
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
        <div className="flex items-center gap-2 min-w-0">
          {hasExtra && (open
            ? <ChevronUpIcon className="size-3 text-muted-foreground shrink-0" />
            : <ChevronDownIcon className="size-3 text-muted-foreground shrink-0" />
          )}
          <div className="min-w-0">
            <span className="text-sm font-medium">{i.nombre}</span>
            {(i.marca_buscada || i.modelo_buscado) && (
              <span className="text-xs text-muted-foreground ml-2">
                busca: {[i.marca_buscada, i.modelo_buscado, i.año_min && `desde ${i.año_min}`].filter(Boolean).join(' ')}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-4 shrink-0 ml-4">
          {i.presupuesto && (
            <span className="text-xs text-muted-foreground">${Number(i.presupuesto).toLocaleString('es-AR')}</span>
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
          <Field label="KM máx." value={i.km_max ? Number(i.km_max).toLocaleString('es-AR') : null} />
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

export default function ClientesClient({ clientes, interesados }: { clientes: any[]; interesados: any[] }) {
  const interesadosActivos = interesados.filter(i => i.estado !== 'compro' && i.estado !== 'perdido')

  return (
    <div className="space-y-8">
      <h1 className="text-xl font-semibold">Clientes</h1>

      <section>
        <p className="text-xs text-muted-foreground uppercase tracking-wide mb-3">
          Clientes ({clientes.length})
        </p>
        <Card size="sm">
          <CardContent className="p-0">
            {clientes.map(c => <ClienteRow key={c.id} c={c} />)}
            {clientes.length === 0 && (
              <p className="px-4 py-3 text-sm text-muted-foreground">Sin clientes registrados.</p>
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
