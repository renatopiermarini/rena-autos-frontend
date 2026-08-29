'use client'
import { useState, Fragment } from 'react'
import { useRouter } from 'next/navigation'
import { computeVehicleFinancials, computeLoanPosition, type CuentaInfo } from '@/lib/kapso'
import { fmtDMY as fmtFecha, fmtDM as fmtFechaCorta } from '@/lib/date'
import { estadoMeta } from '@/lib/estados'
import { diasEnStock, tarjetaVehiculo } from '@/lib/stock'
import { DEFAULT_ASSIGNEE } from '@/lib/equipo'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import { ChevronDownIcon, ChevronUpIcon, CheckIcon, AlertCircleIcon, SearchIcon, XIcon, CarIcon, PlusIcon, FileTextIcon } from 'lucide-react'
import { EmptyState } from '@/components/empty-state'
import NuevoAutoDialog from './NuevoAutoDialog'
import RegistrarVentaDialog from './RegistrarVentaDialog'
import DocumentoDialog from './DocumentoDialog'
import { COMISION_PCT_DEFAULT } from '@/lib/venta'
import { money } from '@/lib/money'

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

// Mapeo del flag del vehículo → tipo de tarea que se debe completar
// cuando se tilda el check en la tabla.
const TIPO_FOR_FIELD: Record<string, string> = {
  lavado:    'lavado',
  fotos_ok:  'fotos',
  publicado: 'publicacion',
}

function ToggleCheck({
  vehicleId, field, value, pendingTareaIds = [], defAssignee,
}: {
  vehicleId: number; field: string; value: boolean; pendingTareaIds?: number[]
  defAssignee: string
}) {
  const router = useRouter()
  const [val, setVal] = useState(value)
  const [error, setError] = useState(false)
  const [busy, setBusy] = useState(false)

  async function toggle(e: React.MouseEvent) {
    e.stopPropagation()
    if (busy) return                          // double-toggle race
    setBusy(true)
    const next = !val
    setVal(next)
    setError(false)
    const res = await fetch(`/api/db/vehicles?id=${vehicleId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [field]: next ? 1 : 0, updated_at: new Date().toISOString() }),
    })
    if (!res.ok) { setVal(!next); setError(true); setBusy(false); return }

    // Al tildar como hecho, completamos también las tareas pendientes del mismo tipo
    // (lavado→lavado, fotos_ok→fotos, publicado→publicacion). No revertimos al destildar.
    if (next && pendingTareaIds.length > 0) {
      const now = new Date().toISOString()
      const results = await Promise.all(pendingTareaIds.map(id =>
        fetch(`/api/db/tareas?id=${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            estado: 'completada',
            completado_por: defAssignee,
            fecha_completado: now,
            updated_at: now,
          }),
        })
      ))
      const failed = results.filter(r => !r.ok).length
      if (failed > 0) toast.error(`${failed} tarea(s) vinculada(s) no se pudieron completar`)
    }
    setBusy(false)
    router.refresh()
  }

  return (
    <button
      onClick={toggle}
      title={error ? 'Error al guardar' : val ? 'Marcar como pendiente' : 'Marcar como listo'}
      aria-label={error ? 'Error al guardar' : val ? 'Marcar como pendiente' : 'Marcar como listo'}
      aria-pressed={val}
      className={`transition-colors ${val ? 'text-success hover:text-success/80' : 'text-muted-foreground/40 hover:text-muted-foreground'}`}
    >
      {error ? <AlertCircleIcon className="size-4 text-destructive" /> : <CheckIcon className="size-4" />}
    </button>
  )
}

function diasEnStockCorto(fecha: string) {
  const dias = diasEnStock(fecha)
  return dias === null ? '—' : `${dias}d`
}

const fmt = money

function fmtN(n: any) {
  if (n == null || n === '') return '—'
  return Number(n).toLocaleString('es-AR')
}

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

function Field({ label, value }: { label: string; value: any }) {
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

type VehicleDetailProps = {
  v: any; clientes: any[]; vehicles: any[]; movimientos: any[]; prestamos: any[]; tareas?: any[]
  cuentas?: CuentaInfo[]; comisionPct?: number
  /** ¿La instancia tiene backend de contratos? Sin él, no hay botón. */
  documentosHabilitado?: boolean
}

/**
 * El detalle expandible de un auto, SIN envoltorio de tabla.
 *
 * Se separó del `<tr>` porque en móvil el stock ya no es una tabla sino una
 * lista de tarjetas (un `<tr>` adentro de un `<li>` no es HTML válido): el mismo
 * detalle, exactamente igual, se usa desde los dos lados.
 */
function VehicleDetailBody({
  v, clientes, vehicles, movimientos, prestamos, tareas = [],
  cuentas = [], comisionPct = COMISION_PCT_DEFAULT, documentosHabilitado = false,
}: VehicleDetailProps) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [showVenta, setShowVenta] = useState(false)
  const [showDoc, setShowDoc] = useState(false)

  const [form, setForm] = useState({
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
  })
  const [docs, setDocs] = useState<Record<string, boolean>>(
    Object.fromEntries(DOC_ITEMS.map(d => [d.key, docOk(v, d.key)]))
  )

  function set(field: string) {
    return (val: string) => setForm(f => ({ ...f, [field]: val }))
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
    // Papeles: D1 guarda 0/1 (INTEGER), nunca booleanos.
    for (const d of DOC_ITEMS) payload[d.key] = docs[d.key] ? 1 : 0
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

  if (editing) {
    return (
      <div className="px-4 pb-5 pt-3">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-6 gap-y-4">
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
            <div className="col-span-2 sm:col-span-3 lg:col-span-4 space-y-1.5">
              <Label>Notas</Label>
              <Textarea value={form.notas} onChange={e => set('notas')(e.target.value)} rows={2} />
            </div>
            <div className="col-span-2 sm:col-span-3 lg:col-span-4 space-y-1.5">
              <Label>Papeles</Label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5">
                {DOC_ITEMS.map(d => (
                  <label key={d.key} className="flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      type="checkbox"
                      className="size-4 accent-primary"
                      checked={!!docs[d.key]}
                      onChange={e => setDocs(o => ({ ...o, [d.key]: e.target.checked }))}
                    />
                    {d.label}
                  </label>
                ))}
              </div>
            </div>
            <div className="col-span-2 sm:col-span-3 lg:col-span-4">
              <FInput label="Carpeta de Drive (link)" value={form.drive_url} onChange={set('drive_url')} type="url" />
            </div>
          </div>
          <div className="flex gap-2 mt-4">
            <Button onClick={save} disabled={saving}>{saving ? 'Guardando…' : 'Guardar'}</Button>
            <Button variant="outline" onClick={() => setEditing(false)}>Cancelar</Button>
          </div>
      </div>
    )
  }

  return (
    <div className="px-4 pb-4 pt-0">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-x-8 gap-y-3 pt-3">
          <Field label="Tipo operación" value={v.tipo_operacion} />
          <Field label="Color" value={v.color} />
          <Field label="KM" value={v.km ? fmtN(v.km) : null} />
          <Field label="N° motor" value={v.numero_motor} />
          <Field label="N° chasis" value={v.numero_chasis} />
          <Field label="Precio compra" value={v.precio_compra ? fmt(v.precio_compra) : null} />
          <Field label="Costo total" value={fin.costo_total ? fmt(fin.costo_total) : null} />
          <Field label="Precio objetivo" value={v.precio_venta_objetivo ? fmt(v.precio_venta_objetivo) : null} />
          <Field label="Precio publicado" value={v.precio_publicado ? fmt(v.precio_publicado) : null} />
          <Field label="Precio venta final" value={v.precio_venta_final ? fmt(v.precio_venta_final) : null} />
          {margen != null && (
            <div>
              <p className="text-xs text-muted-foreground">Margen</p>
              <p className={`text-sm font-medium ${margen >= 0 ? 'text-success' : 'text-destructive'}`}>
                {margen >= 0 ? '+' : ''}{fmt(margen)}
              </p>
            </div>
          )}
          <Field label="Fecha ingreso" value={fmtFecha(v.fecha_ingreso)} />
          <Field label="Fecha venta" value={fmtFecha(v.fecha_venta)} />
          <Field label="Propietario" value={cliente?.nombre} />
          <Field label="Comprador" value={comprador?.nombre} />
          {v.notas && (
            <div className="col-span-2 lg:col-span-4 xl:col-span-6">
              <p className="text-xs text-muted-foreground">Notas</p>
              <p className="text-sm">{v.notas}</p>
            </div>
          )}
          <div className="col-span-2 lg:col-span-4 xl:col-span-6">
            <div className="flex items-center gap-3 mb-1.5">
              <p className="text-xs text-muted-foreground">
                Papeles · {DOC_ITEMS.filter(d => docOk(v, d.key)).length}/{DOC_ITEMS.length}
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
            <ul className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-x-6 gap-y-0.5">
              {DOC_ITEMS.map(d => {
                const ok = docOk(v, d.key)
                return (
                  <li key={d.key} className={`text-sm flex items-center gap-1.5 ${ok ? '' : 'text-muted-foreground'}`}>
                    <span className={ok ? 'text-success' : ''}>{ok ? '✓' : '□'}</span>
                    {d.label}
                  </li>
                )
              })}
            </ul>
          </div>
        </div>

        {(fin.gastos_total > 0 || fin.prestamos_asociados.length > 0) && (
          <div className="mt-4 border-t border-border pt-3 grid grid-cols-1 md:grid-cols-2 gap-4">
            {fin.gastos_total > 0 && (
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide mb-2">
                  Gastos del auto · {fmt(fin.gastos_total)}
                </p>
                <div className="space-y-1">
                  {catEntries.map(([cat, monto]) => (
                    <div key={cat} className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">{CAT_LABEL_FIN[cat] ?? cat}</span>
                      <span>{fmt(monto)}</span>
                    </div>
                  ))}
                  <div className="flex items-center justify-between text-sm pt-1 border-t border-border">
                    <span className="text-muted-foreground">Precio compra</span>
                    <span>{fmt(fin.precio_compra)}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm font-medium">
                    <span>Costo total</span>
                    <span>{fmt(fin.costo_total)}</span>
                  </div>
                  {fin.es_consignacion ? (
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Margen esperado</span>
                      <span className="text-muted-foreground text-xs">consignación — comisión manual</span>
                    </div>
                  ) : fin.margen_esperado != null && (
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Margen esperado</span>
                      <span className={fin.margen_esperado >= 0 ? 'text-success' : 'text-destructive'}>
                        {(fin.margen_esperado >= 0 ? '+' : '') + fmt(fin.margen_esperado)}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )}
            {fin.prestamos_asociados.length > 0 && (
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide mb-2">
                  Préstamos financiando este auto
                </p>
                <div className="space-y-1.5">
                  {fin.prestamos_asociados.map((p: any) => {
                    const pos = computeLoanPosition(p, movimientos)
                    const acr = clientes.find((c: any) => c.id === p.acreedor_id)?.nombre ?? '?'
                    return (
                      <div key={p.id} className="text-sm flex items-center justify-between">
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
        )}

        {(() => {
          const pendientes = tareas.filter(t => t.vehicle_id === v.id && t.estado !== 'completada')
          if (pendientes.length === 0) return null
          pendientes.sort((a, b) => {
            const fa = a.fecha_vencimiento || ''
            const fb = b.fecha_vencimiento || ''
            if (fa !== fb) return fa.localeCompare(fb)
            return (horaDeTarea(a) || '').localeCompare(horaDeTarea(b) || '')
          })
          return (
            <div className="mt-4 border-t border-border pt-3">
              <p className="text-xs text-muted-foreground uppercase tracking-wide mb-2">
                Tareas pendientes ({pendientes.length})
              </p>
              <div className="space-y-1">
                {pendientes.map(t => {
                  const hora = horaDeTarea(t)
                  const fecha = fmtFechaCorta(t.fecha_vencimiento)
                  const cuando = [fecha, hora].filter(Boolean).join(' ')
                  return (
                    <div key={t.id} className="flex items-center justify-between text-sm gap-3">
                      <div className="flex items-center gap-2 min-w-0">
                        {t.tipo && (
                          <Badge variant="outline" className="text-[10px] shrink-0">
                            {TIPO_TAREA_LABEL[t.tipo] ?? t.tipo}
                          </Badge>
                        )}
                        <span className="truncate">{t.titulo}</span>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground shrink-0 tabular-nums">
                        {t.asignado && <span className="capitalize">{t.asignado}</span>}
                        {cuando && <span>{cuando}</span>}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })()}

        <div className="flex flex-wrap gap-2 mt-4">
          <Button
            variant="outline"
            size="sm"
            onClick={e => { e.stopPropagation(); setEditing(true) }}
          >
            Editar
          </Button>
          {/* Un auto ya vendido no se vuelve a vender: para corregir el precio
              está "Editar" (que no toca la caja). */}
          {v.estado !== 'vendido' && (
            <Button
              size="sm"
              onClick={e => { e.stopPropagation(); setShowVenta(true) }}
            >
              Registrar venta
            </Button>
          )}
          {/* Los contratos los arma el backend del bot. Sin esas env el botón no
              se dibuja — la feature simplemente no existe en esa instancia. */}
          {documentosHabilitado && (
            <Button
              variant="outline"
              size="sm"
              onClick={e => { e.stopPropagation(); setShowDoc(true) }}
            >
              <FileTextIcon /> Generar documento
            </Button>
          )}
        </div>

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
    </div>
  )
}

/** El mismo detalle, envuelto en la fila que necesita la tabla de escritorio. */
function VehicleDetailRow(props: VehicleDetailProps) {
  return (
    <tr>
      <td colSpan={9} className="p-0 bg-muted/30 border-b border-border">
        <VehicleDetailBody {...props} />
      </td>
    </tr>
  )
}

function VehicleTable({
  vehicles, tareas, clientes, movimientos, prestamos, expanded, onToggle, defAssignee,
  cuentas, comisionPct, documentosHabilitado,
}: {
  vehicles: any[]; tareas: any[]; clientes: any[]; movimientos: any[]; prestamos: any[]
  expanded: Set<number>; onToggle: (id: number) => void; defAssignee: string
  cuentas: CuentaInfo[]; comisionPct: number; documentosHabilitado: boolean
}) {
  function tareasAuto(vid: number) {
    return tareas.filter(t => t.vehicle_id === vid && t.estado !== 'completada')
  }

  if (vehicles.length === 0) {
    return <EmptyState icon={CarIcon} title="Sin vehículos" className="py-6" />
  }

  return (
    <>
    {/* Móvil (< md): tarjetas. En 375px la tabla cortaba el precio a la mitad y
        escondía patente y días — justo los tres datos por los que se abre esta
        pantalla. Cada auto es ahora una tarjeta de tres líneas: qué es, cómo se
        identifica, y cuánto vale / en qué estado / hace cuánto está parado.
        Tocarla abre EL MISMO detalle expandible de siempre. */}
    <ul className="divide-y divide-border md:hidden">
      {vehicles.map(v => {
        const pendientes = tareasAuto(v.id)
        const isOpen = expanded.has(v.id)
        const t = tarjetaVehiculo(v)
        return (
          <li key={v.id} className={isOpen ? 'bg-muted/50' : undefined}>
            <button
              type="button"
              onClick={() => onToggle(v.id)}
              aria-expanded={isOpen}
              className="w-full px-3 py-3 text-left"
            >
              <span className="flex items-start justify-between gap-2">
                {/* spans y no <p>/<div>: adentro de un <button> sólo va contenido
                    de frase, y este botón es toda la tarjeta (el área de toque). */}
                <span className="min-w-0">
                  <span className="block truncate font-medium leading-snug">{t.titulo}</span>
                  <span className="mt-0.5 block truncate text-xs text-muted-foreground">{t.detalle}</span>
                </span>
                {isOpen
                  ? <ChevronUpIcon className="mt-1 size-4 shrink-0 text-muted-foreground" />
                  : <ChevronDownIcon className="mt-1 size-4 shrink-0 text-muted-foreground" />}
              </span>
              <span className="mt-2 flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
                <span className={`text-lg font-semibold tabular-nums ${t.precioEstimado ? 'text-muted-foreground' : ''}`}>
                  {t.precio}
                </span>
                <Badge variant={t.estadoVariant}>{t.estadoLabel}</Badge>
                {t.diasLabel && (
                  <span className={`text-xs tabular-nums ${t.diasAlerta ? 'font-medium text-destructive' : 'text-muted-foreground'}`}>
                    {t.diasLabel} en stock
                  </span>
                )}
                {Number(v.uso_personal ?? 0) > 0 && <Badge variant="outline">en uso</Badge>}
                {pendientes.length > 0 && (
                  <Badge variant="destructive">{pendientes.length} tarea{pendientes.length > 1 ? 's' : ''}</Badge>
                )}
              </span>
            </button>
            {isOpen && (
              <VehicleDetailBody
                v={v} clientes={clientes} vehicles={vehicles} movimientos={movimientos}
                prestamos={prestamos} tareas={tareas} cuentas={cuentas} comisionPct={comisionPct}
                documentosHabilitado={documentosHabilitado}
              />
            )}
          </li>
        )
      })}
    </ul>

    {/* Escritorio (md+): la tabla de siempre, sin cambios. */}
    <div className="hidden md:block overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left">
            <th className="pb-2 px-3 font-medium text-muted-foreground text-xs">Auto</th>
            <th className="pb-2 px-3 font-medium text-muted-foreground text-xs hidden sm:table-cell">Patente</th>
            <th className="pb-2 px-3 font-medium text-muted-foreground text-xs">Estado</th>
            <th className="pb-2 px-3 font-medium text-muted-foreground text-xs hidden md:table-cell">KM</th>
            <th className="pb-2 px-3 font-medium text-muted-foreground text-xs">Precio</th>
            <th className="pb-2 px-3 font-medium text-muted-foreground text-xs hidden md:table-cell">Días</th>
            <th className="pb-2 px-3 font-medium text-muted-foreground text-xs text-center hidden sm:table-cell" title="Lavado">Lav</th>
            <th className="pb-2 px-3 font-medium text-muted-foreground text-xs text-center hidden sm:table-cell">Fotos</th>
            <th className="pb-2 px-3 font-medium text-muted-foreground text-xs text-center hidden sm:table-cell" title="Publicado">Pub</th>
          </tr>
        </thead>
        <tbody>
          {vehicles.map(v => {
            const pendientes = tareasAuto(v.id)
            const pendientesPorTipo = (tipo: string) =>
              pendientes.filter(t => t.tipo === tipo).map(t => t.id)
            const isOpen = expanded.has(v.id)
            return (
              <Fragment key={v.id}>
                <tr
                  onClick={() => onToggle(v.id)}
                  className={`cursor-pointer border-b border-border transition-colors ${isOpen ? 'bg-muted/50' : 'hover:bg-muted/30'}`}
                >
                  <td className="py-2.5 px-3">
                    <div className="flex items-center gap-1.5">
                      {/* Botón real para teclado/lector; la fila entera sigue
                          clickeable con mouse (mismo patrón que la tarjeta móvil). */}
                      <button
                        type="button"
                        aria-expanded={isOpen}
                        onClick={e => { e.stopPropagation(); onToggle(v.id) }}
                        className="flex items-center gap-1.5 rounded text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        {isOpen ? <ChevronUpIcon className="size-3 text-muted-foreground" aria-hidden /> : <ChevronDownIcon className="size-3 text-muted-foreground" aria-hidden />}
                        <span className="font-medium">{v.marca} {v.modelo}</span>
                        <span className="text-muted-foreground">{v.año}</span>
                      </button>
                      {v.color && <span className="text-xs text-muted-foreground">· {v.color}</span>}
                      {Number(v.uso_personal ?? 0) > 0 && (
                        <Badge variant="outline" className="ml-1" title="Auto de uso propio — es patrimonio pero no está a la venta">
                          en uso
                        </Badge>
                      )}
                      {pendientes.length > 0 && (
                        <Badge variant="destructive" className="ml-1">{pendientes.length} tarea{pendientes.length > 1 ? 's' : ''}</Badge>
                      )}
                    </div>
                  </td>
                  <td className="py-2.5 px-3 text-muted-foreground hidden sm:table-cell">{v.dominio || '—'}</td>
                  <td className="py-2.5 px-3">
                    <Badge variant={estadoMeta(v.estado).variant}>{estadoMeta(v.estado).label}</Badge>
                  </td>
                  <td className="py-2.5 px-3 text-muted-foreground tabular-nums hidden md:table-cell">{v.km ? fmtN(v.km) : '—'}</td>
                  <td className="py-2.5 px-3 tabular-nums">
                    {v.precio_publicado
                      ? money(v.precio_publicado)
                      : v.precio_venta_objetivo
                      ? <span className="text-muted-foreground">{money(v.precio_venta_objetivo)}</span>
                      : '—'}
                  </td>
                  <td className="py-2.5 px-3 text-muted-foreground hidden md:table-cell">{diasEnStockCorto(v.fecha_ingreso)}</td>
                  <td className="py-2.5 px-3 text-center hidden sm:table-cell"><ToggleCheck vehicleId={v.id} field="lavado"    value={!!v.lavado}    pendingTareaIds={pendientesPorTipo('lavado')} defAssignee={defAssignee} /></td>
                  <td className="py-2.5 px-3 text-center hidden sm:table-cell"><ToggleCheck vehicleId={v.id} field="fotos_ok"  value={!!v.fotos_ok}  pendingTareaIds={pendientesPorTipo('fotos')} defAssignee={defAssignee} /></td>
                  <td className="py-2.5 px-3 text-center hidden sm:table-cell"><ToggleCheck vehicleId={v.id} field="publicado" value={!!v.publicado} pendingTareaIds={pendientesPorTipo('publicacion')} defAssignee={defAssignee} /></td>
                </tr>
                {isOpen && <VehicleDetailRow v={v} clientes={clientes} vehicles={vehicles} movimientos={movimientos} prestamos={prestamos} tareas={tareas} cuentas={cuentas} comisionPct={comisionPct} documentosHabilitado={documentosHabilitado} />}
              </Fragment>
            )
          })}
        </tbody>
      </table>
    </div>
    </>
  )
}

type TipoFilter = 'todos' | 'propio' | 'consignacion'
type GroupMode = 'ninguno' | 'tipo' | 'estado'

const TIPO_FILTER_LABELS: { key: TipoFilter; label: string }[] = [
  { key: 'todos', label: 'Todos' },
  { key: 'propio', label: 'Propios' },
  { key: 'consignacion', label: 'Consignación' },
]

const GROUP_LABELS: { key: GroupMode; label: string }[] = [
  { key: 'ninguno', label: 'Sin agrupar' },
  { key: 'tipo', label: 'Por tipo' },
  { key: 'estado', label: 'Por estado' },
]

// Pipeline order for the "Por estado" grouping. `vendido` is deliberately absent
// — sold cars render in their own section further down the page.
const ESTADO_ORDER = [
  'a_ingresar', 'en_preparacion', 'publicado', 'reservado',
]
// Group headings reuse lib/estados.ts so there is exactly ONE estado→label map.
// There used to be a second copy right here, and the two drifted: the headings
// were corrected while the row badges kept rendering the old wording, so a car
// could sit under "Propios" with a badge reading "Consignación".

export default function StockClient({
  vehicles, tareas, clientes, movimientos = [], prestamos = [], defAssignee = DEFAULT_ASSIGNEE,
  cuentas = [], comisionPct = COMISION_PCT_DEFAULT, documentosHabilitado = false,
}: {
  vehicles: any[]; tareas: any[]; clientes: any[]; movimientos?: any[]; prestamos?: any[]
  // A quién se le anota haber completado una tarea al tildar el check. Sale de
  // config_negocio.default_assignee; sin la tabla, 'rena' como siempre.
  defAssignee?: string
  // Cajas de la contabilidad, para el egreso opcional del alta y para el ingreso
  // de la venta. Sin tabla `cuentas`, cuentasInfo cae en DEFAULT_CUENTAS.
  cuentas?: CuentaInfo[]
  // % de comisión de consignación (config_negocio.comision_consignacion_pct).
  // Sin la tabla, el 5 de siempre.
  comisionPct?: number
  // ¿Esta instancia tiene backend de contratos (BACKEND_URL + BACKEND_API_KEY)?
  // Lo resuelve el server component: sin las dos env el botón "Generar
  // documento" no se dibuja. Ver app/stock/page.tsx.
  documentosHabilitado?: boolean
}) {
  const [expanded, setExpanded] = useState<Set<number>>(new Set())
  const [showNew, setShowNew] = useState(false)
  const [tipoFilter, setTipoFilter] = useState<TipoFilter>('todos')
  // Default to ownership, not estado: "is this car mine or on consignment?" is
  // the question this page gets opened to answer, and grouping by estado made a
  // propio car sit under a heading that read like consignación.
  const [groupMode, setGroupMode] = useState<GroupMode>('tipo')
  const [query, setQuery] = useState('')

  const q = query.trim().toLowerCase()
  const matchesQuery = (v: any) =>
    !q || [v.marca, v.modelo, v.año, v.dominio, v.color]
      .filter(Boolean).join(' ').toLowerCase().includes(q)

  const activos = vehicles.filter(v => v.estado !== 'vendido')
  const vendidosAll = vehicles.filter(v => v.estado === 'vendido')
  const vendidos = vendidosAll.filter(matchesQuery)

  const filtered = activos.filter(v => {
    if (!matchesQuery(v)) return false
    if (tipoFilter === 'todos') return true
    return v.tipo_operacion === tipoFilter
  })

  function toggle(id: number) {
    setExpanded(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function getGroups(): { label: string; vehicles: any[] }[] {
    if (groupMode === 'tipo') {
      const propios = filtered.filter(v => v.tipo_operacion === 'propio')
      const consig = filtered.filter(v => v.tipo_operacion === 'consignacion')
      const otros = filtered.filter(v => !v.tipo_operacion || (v.tipo_operacion !== 'propio' && v.tipo_operacion !== 'consignacion'))
      return [
        propios.length > 0 ? { label: `Propios (${propios.length})`, vehicles: propios } : null,
        consig.length > 0 ? { label: `Consignación (${consig.length})`, vehicles: consig } : null,
        otros.length > 0 ? { label: `Otros (${otros.length})`, vehicles: otros } : null,
      ].filter(Boolean) as { label: string; vehicles: any[] }[]
    }
    if (groupMode === 'estado') {
      return ESTADO_ORDER
        .map(estado => {
          const vs = filtered.filter(v => v.estado === estado)
          return vs.length > 0
            ? { label: `${estadoMeta(estado).label} (${vs.length})`, vehicles: vs }
            : null
        })
        .filter(Boolean) as { label: string; vehicles: any[] }[]
    }
    return [{ label: '', vehicles: filtered }]
  }

  const groups = getGroups()

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-baseline gap-3">
          <h1 className="text-xl font-semibold">Stock</h1>
          <span className="text-sm text-muted-foreground">
            {activos.length} activos · {vendidosAll.length} vendidos
          </span>
        </div>
        <Button onClick={() => setShowNew(true)}><PlusIcon /> Nuevo auto</Button>
      </div>

      <NuevoAutoDialog
        open={showNew}
        onOpenChange={setShowNew}
        clientes={clientes}
        cuentas={cuentas}
      />

      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        <div className="relative w-full sm:w-64">
          <SearchIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
          <Input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Buscar marca, modelo, patente…"
            aria-label="Buscar vehículo"
            className="h-8 pl-8 pr-8"
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              aria-label="Limpiar búsqueda"
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <XIcon className="size-4" />
            </button>
          )}
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-xs text-muted-foreground mr-0.5">Tipo:</span>
          {TIPO_FILTER_LABELS.map(({ key, label }) => (
            <Button
              key={key}
              size="xs"
              variant={tipoFilter === key ? 'default' : 'outline'}
              aria-pressed={tipoFilter === key}
              onClick={() => setTipoFilter(key)}
            >
              {label}
            </Button>
          ))}
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-xs text-muted-foreground mr-0.5">Agrupar:</span>
          {GROUP_LABELS.map(({ key, label }) => (
            <Button
              key={key}
              size="xs"
              variant={groupMode === key ? 'default' : 'outline'}
              aria-pressed={groupMode === key}
              onClick={() => setGroupMode(key)}
            >
              {label}
            </Button>
          ))}
        </div>
      </div>

      {groupMode === 'ninguno' ? (
        <Card size="sm">
          <CardContent className="p-0">
            <VehicleTable
              vehicles={filtered}
              tareas={tareas}
              clientes={clientes}
              movimientos={movimientos}
              prestamos={prestamos}
              expanded={expanded}
              onToggle={toggle}
              defAssignee={defAssignee}
              cuentas={cuentas}
              comisionPct={comisionPct}
              documentosHabilitado={documentosHabilitado}
            />
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {groups.map(group => (
            <section key={group.label}>
              <p className="text-xs text-muted-foreground uppercase tracking-wide mb-3">{group.label}</p>
              <Card size="sm">
                <CardContent className="p-0">
                  <VehicleTable
                    vehicles={group.vehicles}
                    tareas={tareas}
                    clientes={clientes}
                    movimientos={movimientos}
                    prestamos={prestamos}
                    expanded={expanded}
                    onToggle={toggle}
                    defAssignee={defAssignee}
                    cuentas={cuentas}
                    comisionPct={comisionPct}
                    documentosHabilitado={documentosHabilitado}
                  />
                </CardContent>
              </Card>
            </section>
          ))}
          {filtered.length === 0 && (
            <EmptyState
              icon={CarIcon}
              title={q ? `Sin resultados para “${query.trim()}”` : 'Sin vehículos para este filtro'}
              hint="Probá cambiar la búsqueda o los filtros."
            />
          )}
        </div>
      )}

      {vendidos.length > 0 && (
        <section>
          <p className="text-xs text-muted-foreground uppercase tracking-wide mb-3">Vendidos ({vendidos.length})</p>
          <Card size="sm">
            <CardContent className="p-0">
              <table className="w-full text-sm">
                <tbody className="divide-y divide-border">
                  {vendidos.map(v => {
                    const isOpen = expanded.has(v.id)
                    return (
                      <Fragment key={v.id}>
                        <tr
                          onClick={() => toggle(v.id)}
                          className={`cursor-pointer transition-colors ${isOpen ? 'bg-muted/50' : 'hover:bg-muted/30'}`}
                        >
                          <td className="px-4 py-2.5">
                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                aria-expanded={isOpen}
                                onClick={e => { e.stopPropagation(); toggle(v.id) }}
                                className="flex items-center gap-1.5 rounded text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                              >
                                {isOpen ? <ChevronUpIcon className="size-3 text-muted-foreground" aria-hidden /> : <ChevronDownIcon className="size-3 text-muted-foreground" aria-hidden />}
                                <span>{v.marca} {v.modelo} {v.año}</span>
                              </button>
                              {v.color && <span className="text-xs text-muted-foreground">· {v.color}</span>}
                              {v.tipo_operacion && (
                                <span className="text-xs text-muted-foreground">· {v.tipo_operacion}</span>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-2.5 text-right text-muted-foreground tabular-nums">
                            {v.precio_venta_final ? money(v.precio_venta_final) : '—'}
                          </td>
                          <td className="px-4 py-2.5 text-right text-xs text-muted-foreground">
                            {fmtFecha(v.fecha_venta)}
                          </td>
                        </tr>
                        {isOpen && <VehicleDetailRow v={v} clientes={clientes} vehicles={vehicles} movimientos={movimientos} prestamos={prestamos} tareas={tareas} cuentas={cuentas} comisionPct={comisionPct} documentosHabilitado={documentosHabilitado} />}
                      </Fragment>
                    )
                  })}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </section>
      )}
    </div>
  )
}
