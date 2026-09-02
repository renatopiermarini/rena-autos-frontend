'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { computeVehicleFinancials, computeLoanPosition, type CuentaInfo } from '@/lib/kapso'
import { fmtDMY as fmtFecha, fmtDM as fmtFechaCorta } from '@/lib/date'
import { estadoMeta } from '@/lib/estados'
import { diasEnStock } from '@/lib/stock'
import { verificacionPaga } from '@/lib/verificaciones'
import { money, fmtN } from '@/lib/money'
import { COMISION_PCT_DEFAULT } from '@/lib/venta'
import { formSucio, MENSAJE_DESCARTAR } from '@/lib/dirty'
import {
  Dialog, DialogContent, DialogClose, DialogTitle, useDirtyClose,
} from '@/components/ui/dialog'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { toast } from 'sonner'
import { XIcon, FileTextIcon } from 'lucide-react'
import RegistrarVentaDialog from './RegistrarVentaDialog'
import DocumentoDialog from './DocumentoDialog'

/**
 * Detalle de un auto como modal full-screen con tabs (Datos · Negocio ·
 * Papeles · Gastos). Reemplaza a la fila expandible de la tabla: el detalle
 * mezclaba papeles, plata y tareas en una sola grilla y se volvía ilegible.
 *
 * Los papeles acá se tildan DIRECTO (PATCH por ítem, optimista) — antes había
 * que entrar a "Editar" para tocar un checkbox.
 */

const CAT_LABEL_FIN: Record<string, string> = {
  vehicle_purchase: 'Compra',
  vehicle_expense: 'Gasto auto',
  commission: 'Comisión',
  general_expense: 'Gasto general',
  marketing: 'Marketing',
  loan: 'Préstamo',
  refund: 'Reembolso',
  down_payment: 'Seña',
  sin_categoria: 'Sin categoría',
}

// Options for the estado <select> in the edit form. Same five values as
// lib/estados.ts, in pipeline order; the API whitelist rejects anything else.
const ESTADOS = [
  'a_ingresar', 'en_preparacion', 'publicado', 'reservado', 'vendido',
]

// Checklist de papeles por auto — espejo de tools/documentacion_tools.py ITEMS
// en rena-autos-api (columnas doc_* de vehicles; 0/1). Cambiar ahí y acá.
const DOC_ITEMS: { key: string; label: string }[] = [
  { key: 'doc_formulario_08', label: 'Formulario 08 firmado y certificado' },
  { key: 'doc_cedulas', label: 'Cédulas titular y autorizados' },
  { key: 'doc_titulo', label: 'Título automotor' },
  { key: 'doc_informe_dominio', label: 'Informe de dominio' },
  { key: 'doc_verificacion_policial', label: 'Verificación policial' },
  { key: 'doc_libre_deudas', label: 'Libre de deudas y patentes' },
]
const docOk = (v: any, key: string) => Number(v?.[key] ?? 0) === 1

const nativeSelectCls =
  'h-8 w-full rounded-lg border border-input bg-transparent px-2.5 py-1 text-base md:text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50'

const fmt = money

function horaDeTarea(t: any): string {
  // El agente guarda la hora en `fecha_vencimiento` (si es ISO) o como
  // "Hora: HH:MM. ..." dentro de `descripcion`. Idéntica lógica que en TareasClient.
  const iso = t?.fecha_vencimiento ?? ''
  if (typeof iso === 'string' && iso.includes('T')) {
    const time = iso.split('T')[1] ?? ''
    const [h, m] = time.split(':')
    if (h && m) return `${h}:${m}`
  }
  const m = (t?.descripcion ?? '').match(/^Hora:\s*(\d{1,2}:\d{2})/i)
  return m ? m[1].padStart(5, '0') : ''
}

const TIPO_TAREA_LABEL: Record<string, string> = {
  lavado: 'Lavado', fotos: 'Fotos', publicacion: 'Publicación',
  tramite: 'Trámite', seguimiento: 'Seguimiento', otro: 'Otro',
}

function Dato({ label, value }: { label: string; value: any }) {
  if (value == null || value === '' || (value === 0 && label !== 'KM')) return null
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm">{value}</p>
    </div>
  )
}

function FInput({ label, value, onChange, type = 'text' }: {
  label: string; value: string; onChange: (v: string) => void; type?: string
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Input type={type} value={value} onChange={e => onChange(e.target.value)} />
    </div>
  )
}

function FSelect({ label, value, onChange, options }: {
  label: string; value: string; onChange: (v: string) => void; options: string[]
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <select value={value} onChange={e => onChange(e.target.value)} className={nativeSelectCls}>
        <option value="">—</option>
        {options.map(o => <option key={o} value={o}>{o.replace(/_/g, ' ')}</option>)}
      </select>
    </div>
  )
}

export type VehicleDialogProps = {
  v: any | null
  onOpenChange: (open: boolean) => void
  clientes: any[]; vehicles: any[]; movimientos: any[]; prestamos: any[]; tareas?: any[]
  /** Filas de verificaciones_mecanicas — para el "Verificación paga sí/no". */
  verificaciones?: any[]
  cuentas?: CuentaInfo[]; comisionPct?: number
  /** ¿La instancia tiene backend de contratos? Sin él, no hay botón. */
  documentosHabilitado?: boolean
}

export default function VehicleDialog(props: VehicleDialogProps) {
  // key={v.id}: al cambiar de auto, el body arranca de cero (form, tab activa,
  // estado optimista de papeles) sin useEffects de sincronización. El <Dialog>
  // vive ADENTRO del body porque el guard de cierre sucio (useDirtyClose)
  // necesita el estado del form, que vive ahí.
  if (!props.v) return null
  return <VehicleDialogBody key={props.v.id} {...props} />
}

function VehicleDialogBody({
  v, onOpenChange, clientes, vehicles, movimientos, prestamos, tareas = [],
  verificaciones = [], cuentas = [], comisionPct = COMISION_PCT_DEFAULT,
  documentosHabilitado = false,
}: VehicleDialogProps) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [showVenta, setShowVenta] = useState(false)
  const [showDoc, setShowDoc] = useState(false)

  const inicial = {
    estado: v.estado ?? '',
    km: String(v.km ?? ''),
    color: v.color ?? '',
    dominio: v.dominio ?? '',
    numero_motor: v.numero_motor ?? '',
    numero_chasis: v.numero_chasis ?? '',
    precio_compra: String(v.precio_compra ?? ''),
    precio_venta_objetivo: String(v.precio_venta_objetivo ?? ''),
    precio_publicado: String(v.precio_publicado ?? ''),
    precio_venta_final: String(v.precio_venta_final ?? ''),
    fecha_ingreso: v.fecha_ingreso ? v.fecha_ingreso.slice(0, 10) : '',
    fecha_venta: v.fecha_venta ? v.fecha_venta.slice(0, 10) : '',
    notas: v.notas ?? '',
    drive_url: v.drive_url ?? '',
  }
  const [form, setForm] = useState(inicial)

  // Papeles: estado optimista por ítem (se tildan directo, sin pasar por Editar).
  const [docs, setDocs] = useState<Record<string, boolean>>(
    Object.fromEntries(DOC_ITEMS.map(d => [d.key, docOk(v, d.key)]))
  )
  const [docBusy, setDocBusy] = useState<string | null>(null)

  const { dialogProps } = useDirtyClose({
    sucio: editing && formSucio(form, inicial),
    onOpenChange,
  })

  function set(field: string) {
    return (val: string) => setForm(f => ({ ...f, [field]: val }))
  }

  // "Cancelar" con cambios: misma pregunta que las puertas del diálogo, pero
  // sólo sale de la edición (el modal queda abierto en modo lectura).
  function cancelarEdicion() {
    if (formSucio(form, inicial) && !window.confirm(MENSAJE_DESCARTAR)) return
    setForm(inicial)
    setEditing(false)
  }

  async function save() {
    setSaving(true)
    const payload: Record<string, any> = { updated_at: new Date().toISOString() }
    for (const [k, val] of Object.entries(form)) {
      if (val === '') { payload[k] = null; continue }
      if (['km', 'precio_compra', 'precio_venta_objetivo', 'precio_publicado', 'precio_venta_final'].includes(k)) {
        payload[k] = Number(val)
      } else {
        payload[k] = val
      }
    }
    const res = await fetch(`/api/db/vehicles?id=${v.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    setSaving(false)
    if (res.ok) { setEditing(false); toast.success('Vehículo actualizado'); router.refresh() }
    else {
      const err = await res.json().catch(() => ({} as any))
      toast.error(err.message || err.error || 'Error al guardar')
    }
  }

  async function toggleDoc(key: string) {
    if (docBusy) return
    const next = !docs[key]
    setDocBusy(key)
    setDocs(o => ({ ...o, [key]: next }))
    const res = await fetch(`/api/db/vehicles?id=${v.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      // Papeles: D1 guarda 0/1 (INTEGER), nunca booleanos.
      body: JSON.stringify({ [key]: next ? 1 : 0, updated_at: new Date().toISOString() }),
    })
    setDocBusy(null)
    if (!res.ok) {
      setDocs(o => ({ ...o, [key]: !next }))
      toast.error('No se pudo guardar el papel')
      return
    }
    router.refresh()
  }

  const cliente = clientes.find((c: any) => c.id === v.cliente_id)
  const comprador = clientes.find((c: any) => c.id === v.comprador_id)
  // Costo DERIVADO del ledger (fin.costo_total), no la columna cacheada
  // v.costo_total — la cache se desincroniza (incidente 130i: 2.368 vs 16.722)
  // y el margen salía de ahí.
  const fin = computeVehicleFinancials(v.id, vehicles, movimientos, prestamos)
  const margen = v.precio_venta_final && fin.costo_total
    ? Number(v.precio_venta_final) - fin.costo_total
    : null
  const catEntries = Object.entries(fin.gastos_por_categoria).sort((a, b) => b[1] - a[1])
  const verifPaga = verificacionPaga(verificaciones, v.id)
  const pendientes = tareas
    .filter(t => t.vehicle_id === v.id && t.estado !== 'completada')
    .sort((a, b) => {
      const fa = a.fecha_vencimiento || ''
      const fb = b.fecha_vencimiento || ''
      if (fa !== fb) return fa.localeCompare(fb)
      return (horaDeTarea(a) || '').localeCompare(horaDeTarea(b) || '')
    })
  const dias = diasEnStock(v.fecha_ingreso)
  const papelesOk = DOC_ITEMS.filter(d => docs[d.key]).length

  return (
    <Dialog open {...dialogProps}>
    <DialogContent
      showCloseButton={false}
      // Full-screen: pisa el centrado + max-w del DialogContent base. p-0/gap-0
      // porque el layout interno (header fijo + cuerpo con scroll propio) maneja
      // sus paddings.
      className="top-0 left-0 h-dvh max-h-dvh w-screen max-w-none translate-x-0 translate-y-0 grid-rows-[auto_1fr] gap-0 overflow-hidden rounded-none border-0 p-0 sm:max-w-none"
    >
      {/* ── Header ── */}
      <div className="border-b border-border">
        <div className="mx-auto flex w-full max-w-4xl flex-wrap items-start justify-between gap-x-4 gap-y-2 px-4 py-3 md:px-8">
          <div className="min-w-0">
            <DialogTitle className="text-lg font-semibold tracking-tight">
              {v.marca} {v.modelo} <span className="font-normal text-muted-foreground">{v.año || v.anio}</span>
            </DialogTitle>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-muted-foreground">
              {v.dominio && <span className="font-mono">{v.dominio}</span>}
              {v.color && <span>{v.color}</span>}
              <Badge variant={estadoMeta(v.estado).variant}>{estadoMeta(v.estado).label}</Badge>
              {Number(v.uso_personal ?? 0) > 0 && (
                <Badge variant="outline" title="Auto de uso propio — es patrimonio pero no está a la venta">en uso</Badge>
              )}
              {pendientes.length > 0 && (
                <Badge variant="destructive">{pendientes.length} tarea{pendientes.length > 1 ? 's' : ''}</Badge>
              )}
              {dias != null && v.estado !== 'vendido' && (
                <span className="font-mono tabular-nums">{dias}d en stock</span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {!editing && (
              <>
                <Button variant="outline" size="sm" onClick={() => setEditing(true)}>Editar</Button>
                {/* Un auto ya vendido no se vuelve a vender: para corregir el
                    precio está "Editar" (que no toca la caja). */}
                {v.estado !== 'vendido' && (
                  <Button size="sm" onClick={() => setShowVenta(true)}>Registrar venta</Button>
                )}
                {documentosHabilitado && (
                  <Button variant="outline" size="sm" onClick={() => setShowDoc(true)}>
                    <FileTextIcon /> Documento
                  </Button>
                )}
              </>
            )}
            <DialogClose
              render={<Button variant="ghost" size="icon-sm" aria-label="Cerrar" />}
            >
              <XIcon />
            </DialogClose>
          </div>
        </div>
      </div>

      {/* ── Cuerpo ── */}
      {editing ? (
        <div className="min-h-0 overflow-y-auto">
          <div className="mx-auto w-full max-w-4xl px-4 py-5 md:px-8">
            <div className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3 lg:grid-cols-4">
              <div className="col-span-2 sm:col-span-3 lg:col-span-4">
                <FSelect label="Estado" value={form.estado} onChange={set('estado')} options={ESTADOS} />
              </div>
              <FInput label="KM" value={form.km} onChange={set('km')} type="number" />
              <FInput label="Color" value={form.color} onChange={set('color')} />
              <FInput label="Dominio" value={form.dominio} onChange={set('dominio')} />
              <FInput label="N° motor" value={form.numero_motor} onChange={set('numero_motor')} />
              <FInput label="N° chasis" value={form.numero_chasis} onChange={set('numero_chasis')} />
              <FInput label="Precio compra" value={form.precio_compra} onChange={set('precio_compra')} type="number" />
              <FInput label="Precio objetivo" value={form.precio_venta_objetivo} onChange={set('precio_venta_objetivo')} type="number" />
              <FInput label="Precio publicado" value={form.precio_publicado} onChange={set('precio_publicado')} type="number" />
              <FInput label="Precio venta final" value={form.precio_venta_final} onChange={set('precio_venta_final')} type="number" />
              <FInput label="Fecha ingreso" value={form.fecha_ingreso} onChange={set('fecha_ingreso')} type="date" />
              <FInput label="Fecha venta" value={form.fecha_venta} onChange={set('fecha_venta')} type="date" />
              <div className="col-span-2 space-y-1.5 sm:col-span-3 lg:col-span-4">
                <Label>Notas</Label>
                <Textarea value={form.notas} onChange={e => set('notas')(e.target.value)} rows={2} />
              </div>
              <div className="col-span-2 sm:col-span-3 lg:col-span-4">
                <FInput label="Carpeta de Drive (link)" value={form.drive_url} onChange={set('drive_url')} type="url" />
              </div>
            </div>
            <div className="mt-4 flex gap-2">
              <Button onClick={save} disabled={saving}>{saving ? 'Guardando…' : 'Guardar'}</Button>
              <Button variant="outline" onClick={cancelarEdicion}>Cancelar</Button>
            </div>
          </div>
        </div>
      ) : (
        <Tabs defaultValue="datos" className="min-h-0 gap-0">
          <div className="shrink-0 border-b border-border">
            <div className="mx-auto w-full max-w-4xl px-4 md:px-8">
              <TabsList variant="line" className="h-10">
                <TabsTrigger value="datos">Datos</TabsTrigger>
                <TabsTrigger value="negocio">Negocio</TabsTrigger>
                <TabsTrigger value="papeles">
                  Papeles
                  <span className={`font-mono tabular-nums text-xs ${papelesOk === DOC_ITEMS.length ? 'text-success' : 'text-muted-foreground'}`}>
                    {papelesOk}/{DOC_ITEMS.length}
                  </span>
                </TabsTrigger>
                <TabsTrigger value="gastos">Gastos</TabsTrigger>
              </TabsList>
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            <div className="mx-auto w-full max-w-4xl px-4 py-5 md:px-8">

              <TabsContent value="datos">
                <div className="grid grid-cols-2 gap-x-8 gap-y-4 sm:grid-cols-3">
                  <Dato label="Color" value={v.color} />
                  <Dato label="KM" value={v.km ? fmtN(v.km) : null} />
                  <Dato label="Dominio" value={v.dominio} />
                  <Dato label="N° motor" value={v.numero_motor} />
                  <Dato label="N° chasis" value={v.numero_chasis} />
                  <Dato label="Fecha ingreso" value={fmtFecha(v.fecha_ingreso)} />
                  {/* Derivado de verificaciones_mecanicas: se paga desde /verificaciones. */}
                  {verifPaga != null && (
                    <div>
                      <p className="text-xs text-muted-foreground">Verificación paga</p>
                      <p className={`text-sm font-medium ${verifPaga === 'paga' ? 'text-success' : 'text-destructive'}`}>
                        {verifPaga === 'paga' ? 'Sí' : 'No'}
                      </p>
                    </div>
                  )}
                  {v.notas && (
                    <div className="col-span-2 sm:col-span-3">
                      <p className="text-xs text-muted-foreground">Notas</p>
                      <p className="text-sm">{v.notas}</p>
                    </div>
                  )}
                </div>

                {pendientes.length > 0 && (
                  <div className="mt-5 border-t border-border pt-4">
                    <p className="mb-2 text-xs uppercase tracking-wide text-muted-foreground">
                      Tareas pendientes ({pendientes.length})
                    </p>
                    <div className="space-y-1">
                      {pendientes.map(t => {
                        const hora = horaDeTarea(t)
                        const fecha = fmtFechaCorta(t.fecha_vencimiento)
                        const cuando = [fecha, hora].filter(Boolean).join(' ')
                        return (
                          <div key={t.id} className="flex items-center justify-between gap-3 text-sm">
                            <div className="flex min-w-0 items-center gap-2">
                              {t.tipo && (
                                <Badge variant="outline" className="shrink-0 text-2xs">
                                  {TIPO_TAREA_LABEL[t.tipo] ?? t.tipo}
                                </Badge>
                              )}
                              <span className="truncate">{t.titulo}</span>
                            </div>
                            <div className="flex shrink-0 items-center gap-2 font-mono text-xs tabular-nums text-muted-foreground">
                              {t.asignado && <span className="capitalize">{t.asignado}</span>}
                              {cuando && <span>{cuando}</span>}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="negocio">
                <div className="grid grid-cols-2 gap-x-8 gap-y-4 sm:grid-cols-3">
                  <Dato label="Tipo operación" value={v.tipo_operacion} />
                  <Dato label="Propietario" value={cliente?.nombre} />
                  <Dato label="Comprador" value={comprador?.nombre} />
                  <Dato label="Precio compra" value={v.precio_compra ? fmt(v.precio_compra) : null} />
                  <Dato label="Precio objetivo" value={v.precio_venta_objetivo ? fmt(v.precio_venta_objetivo) : null} />
                  <Dato label="Precio publicado" value={v.precio_publicado ? fmt(v.precio_publicado) : null} />
                  <Dato label="Precio venta final" value={v.precio_venta_final ? fmt(v.precio_venta_final) : null} />
                  <Dato label="Fecha venta" value={fmtFecha(v.fecha_venta)} />
                  {margen != null && (
                    <div>
                      <p className="text-xs text-muted-foreground">Margen</p>
                      <p className={`text-sm font-medium ${margen >= 0 ? 'text-success' : 'text-destructive'}`}>
                        {margen >= 0 ? '+' : ''}{fmt(margen)}
                      </p>
                    </div>
                  )}
                </div>
              </TabsContent>

              <TabsContent value="papeles">
                <div className="mb-3 flex items-center gap-3">
                  <p className="text-xs text-muted-foreground">
                    Se guardan al tildar — no hace falta pasar por Editar.
                  </p>
                  {v.drive_url ? (
                    <a
                      href={v.drive_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-primary underline underline-offset-2"
                    >
                      Abrir carpeta de Drive ↗
                    </a>
                  ) : (
                    <span className="text-xs text-muted-foreground/70">sin carpeta de Drive</span>
                  )}
                </div>
                <ul className="grid grid-cols-1 gap-x-6 gap-y-1.5 sm:grid-cols-2">
                  {DOC_ITEMS.map(d => (
                    <li key={d.key}>
                      <label className={`flex cursor-pointer items-center gap-2 text-sm ${docs[d.key] ? '' : 'text-muted-foreground'}`}>
                        <input
                          type="checkbox"
                          className="size-4 accent-primary"
                          checked={!!docs[d.key]}
                          disabled={docBusy === d.key}
                          onChange={() => toggleDoc(d.key)}
                        />
                        {d.label}
                      </label>
                    </li>
                  ))}
                </ul>
              </TabsContent>

              <TabsContent value="gastos">
                {fin.gastos_total > 0 || fin.prestamos_asociados.length > 0 ? (
                  <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                    <div>
                      <p className="mb-2 text-xs uppercase tracking-wide text-muted-foreground">
                        Gastos del auto · {fmt(fin.gastos_total)}
                      </p>
                      <div className="space-y-1">
                        {catEntries.map(([cat, monto]) => (
                          <div key={cat} className="flex items-center justify-between text-sm">
                            <span className="text-muted-foreground">{CAT_LABEL_FIN[cat] ?? cat}</span>
                            <span className="font-mono tabular-nums">{fmt(monto)}</span>
                          </div>
                        ))}
                        <div className="flex items-center justify-between border-t border-border pt-1 text-sm">
                          <span className="text-muted-foreground">Precio compra</span>
                          <span className="font-mono tabular-nums">{fmt(fin.precio_compra)}</span>
                        </div>
                        <div className="flex items-center justify-between text-sm font-medium">
                          <span>Costo total</span>
                          <span className="font-mono tabular-nums">{fmt(fin.costo_total)}</span>
                        </div>
                        {fin.es_consignacion ? (
                          <div className="flex items-center justify-between text-sm">
                            <span className="text-muted-foreground">Margen esperado</span>
                            <span className="text-xs text-muted-foreground">consignación — comisión manual</span>
                          </div>
                        ) : fin.margen_esperado != null && (
                          <div className="flex items-center justify-between text-sm">
                            <span className="text-muted-foreground">Margen esperado</span>
                            <span className={`font-mono tabular-nums ${fin.margen_esperado >= 0 ? 'text-success' : 'text-destructive'}`}>
                              {(fin.margen_esperado >= 0 ? '+' : '') + fmt(fin.margen_esperado)}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                    {fin.prestamos_asociados.length > 0 && (
                      <div>
                        <p className="mb-2 text-xs uppercase tracking-wide text-muted-foreground">
                          Préstamos financiando este auto
                        </p>
                        <div className="space-y-1.5">
                          {fin.prestamos_asociados.map((p: any) => {
                            const pos = computeLoanPosition(p, movimientos)
                            const acr = clientes.find((c: any) => c.id === p.acreedor_id)?.nombre ?? '?'
                            return (
                              <div key={p.id} className="flex items-center justify-between text-sm">
                                <span>{acr}</span>
                                <div className="flex items-center gap-2 text-xs">
                                  <span className="text-muted-foreground">
                                    deuda {fmt(pos.deuda_total)} · {pos.modalidad === 'mensual' ? `${fmt(pos.interes_mensual)}/mes` : 'se salda al final'}
                                  </span>
                                  {pos.vencido && <span className="text-destructive">vencido</span>}
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Sin gastos registrados para este auto. El costo hasta acá es el precio de
                    compra{fin.precio_compra ? ` (${fmt(fin.precio_compra)})` : ''}.
                  </p>
                )}
              </TabsContent>

            </div>
          </div>
        </Tabs>
      )}

      <RegistrarVentaDialog
        open={showVenta}
        onOpenChange={setShowVenta}
        vehiculo={v}
        vehicles={vehicles}
        movimientos={movimientos}
        clientes={clientes}
        cuentas={cuentas}
        comisionPct={comisionPct}
      />

      {documentosHabilitado && (
        <DocumentoDialog
          open={showDoc}
          onOpenChange={setShowDoc}
          vehiculo={v}
          clientes={clientes}
        />
      )}
    </DialogContent>
    </Dialog>
  )
}
