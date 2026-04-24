'use client'
import { useState, Fragment } from 'react'
import { useRouter } from 'next/navigation'
import { computeVehicleFinancials, computePrestamoStatus } from '@/lib/kapso'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import { ChevronDownIcon, ChevronUpIcon, CheckIcon, AlertCircleIcon } from 'lucide-react'

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

const ESTADO_VARIANT: Record<string, 'default' | 'secondary' | 'outline' | 'destructive'> = {
  en_stock: 'default',
  confirmado: 'secondary',
  vendido: 'outline',
  reservado: 'secondary',
  en_reparacion: 'destructive',
  a_ingresar: 'outline',
  va_a_pensarlo: 'outline',
  necesita_follow_up: 'destructive',
  potencial: 'outline',
}

const ESTADOS = [
  'potencial', 'a_ingresar', 'confirmado', 'en_stock',
  'en_reparacion', 'va_a_pensarlo', 'necesita_follow_up',
  'reservado', 'vendido',
]

const nativeSelectCls =
  'h-8 w-full rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50'

function ToggleCheck({ vehicleId, field, value }: { vehicleId: number; field: string; value: boolean }) {
  const [val, setVal] = useState(value)
  const [error, setError] = useState(false)

  async function toggle(e: React.MouseEvent) {
    e.stopPropagation()
    const next = !val
    setVal(next)
    setError(false)
    const res = await fetch(`/api/db/vehicles?id=${vehicleId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [field]: next ? 1 : 0, updated_at: new Date().toISOString() }),
    })
    if (!res.ok) { setVal(!next); setError(true) }
  }

  return (
    <button
      onClick={toggle}
      title={error ? 'Error al guardar' : val ? 'Marcar como pendiente' : 'Marcar como listo'}
      className={`transition-colors ${val ? 'text-emerald-600 hover:text-emerald-800' : 'text-muted-foreground/40 hover:text-muted-foreground'}`}
    >
      {error ? <AlertCircleIcon className="size-4 text-destructive" /> : <CheckIcon className="size-4" />}
    </button>
  )
}

function diasEnStock(fecha: string) {
  if (!fecha) return '—'
  const dias = Math.floor((Date.now() - new Date(fecha).getTime()) / 86400000)
  return `${dias}d`
}

function fmt(n: any) {
  if (n == null || n === '') return '—'
  return `$${Number(n).toLocaleString('es-AR')}`
}

function fmtN(n: any) {
  if (n == null || n === '') return '—'
  return Number(n).toLocaleString('es-AR')
}

function fmtFecha(iso: string) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit' })
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

function VehicleDetail({ v, clientes, vehicles, movimientos, prestamos }: {
  v: any; clientes: any[]; vehicles: any[]; movimientos: any[]; prestamos: any[]
}) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)

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
  })

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
    const res = await fetch(`/api/db/vehicles?id=${v.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    setSaving(false)
    if (res.ok) { setEditing(false); toast.success('Vehículo actualizado'); router.refresh() }
    else toast.error('Error al guardar')
  }

  const cliente = clientes.find((c: any) => c.id === v.cliente_id)
  const comprador = clientes.find((c: any) => c.id === v.comprador_id)
  const margen = v.precio_venta_final && v.costo_total
    ? Number(v.precio_venta_final) - Number(v.costo_total)
    : null
  const fin = computeVehicleFinancials(v.id, vehicles, movimientos, prestamos)
  const catEntries = Object.entries(fin.gastos_por_categoria).sort((a, b) => b[1] - a[1])

  if (editing) {
    return (
      <tr>
        <td colSpan={9} className="px-4 pb-5 pt-3 bg-muted/30 border-b border-border">
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
          </div>
          <div className="flex gap-2 mt-4">
            <Button onClick={save} disabled={saving}>{saving ? 'Guardando…' : 'Guardar'}</Button>
            <Button variant="outline" onClick={() => setEditing(false)}>Cancelar</Button>
          </div>
        </td>
      </tr>
    )
  }

  return (
    <tr>
      <td colSpan={9} className="px-4 pb-4 pt-0 bg-muted/30 border-b border-border">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-x-8 gap-y-3 pt-3">
          <Field label="Tipo operación" value={v.tipo_operacion} />
          <Field label="Color" value={v.color} />
          <Field label="KM" value={v.km ? fmtN(v.km) : null} />
          <Field label="N° motor" value={v.numero_motor} />
          <Field label="N° chasis" value={v.numero_chasis} />
          <Field label="Precio compra" value={v.precio_compra ? fmt(v.precio_compra) : null} />
          <Field label="Costo total" value={v.costo_total ? fmt(v.costo_total) : null} />
          <Field label="Precio objetivo" value={v.precio_venta_objetivo ? fmt(v.precio_venta_objetivo) : null} />
          <Field label="Precio publicado" value={v.precio_publicado ? fmt(v.precio_publicado) : null} />
          <Field label="Precio venta final" value={v.precio_venta_final ? fmt(v.precio_venta_final) : null} />
          {margen != null && (
            <div>
              <p className="text-xs text-muted-foreground">Margen</p>
              <p className={`text-sm font-medium ${margen >= 0 ? 'text-emerald-600' : 'text-destructive'}`}>
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
                      <span className={fin.margen_esperado >= 0 ? 'text-emerald-600' : 'text-destructive'}>
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
                    const st = computePrestamoStatus(p)
                    const acr = clientes.find((c: any) => c.id === p.acreedor_id)?.nombre ?? '?'
                    return (
                      <div key={p.id} className="text-sm flex items-center justify-between">
                        <span>{acr}</span>
                        <div className="flex items-center gap-2 text-xs">
                          <span className="text-muted-foreground">saldo {fmt(st.saldo_pendiente)}</span>
                          <span className={st.vencido ? 'text-destructive' : st.proximo ? 'text-amber-600' : 'text-muted-foreground'}>
                            {st.dias_vencimiento == null ? '—'
                              : st.vencido ? `vencido ${Math.abs(st.dias_vencimiento)}d`
                              : `${st.dias_vencimiento}d`}
                          </span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        <Button
          variant="outline"
          size="sm"
          onClick={e => { e.stopPropagation(); setEditing(true) }}
          className="mt-4"
        >
          Editar
        </Button>
      </td>
    </tr>
  )
}

function VehicleTable({
  vehicles, tareas, clientes, movimientos, prestamos, expanded, onToggle,
}: {
  vehicles: any[]; tareas: any[]; clientes: any[]; movimientos: any[]; prestamos: any[]
  expanded: Set<number>; onToggle: (id: number) => void
}) {
  function tareasAuto(vid: number) {
    return tareas.filter(t => t.vehicle_id === vid && t.estado !== 'completada')
  }

  if (vehicles.length === 0) {
    return <p className="py-6 text-center text-sm text-muted-foreground">Sin vehículos.</p>
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left">
            <th className="pb-2 px-3 font-medium text-muted-foreground text-xs">Auto</th>
            <th className="pb-2 px-3 font-medium text-muted-foreground text-xs">Patente</th>
            <th className="pb-2 px-3 font-medium text-muted-foreground text-xs">Estado</th>
            <th className="pb-2 px-3 font-medium text-muted-foreground text-xs">KM</th>
            <th className="pb-2 px-3 font-medium text-muted-foreground text-xs">Precio</th>
            <th className="pb-2 px-3 font-medium text-muted-foreground text-xs">Días</th>
            <th className="pb-2 px-3 font-medium text-muted-foreground text-xs text-center">Lav</th>
            <th className="pb-2 px-3 font-medium text-muted-foreground text-xs text-center">Fotos</th>
            <th className="pb-2 px-3 font-medium text-muted-foreground text-xs text-center">Pub</th>
          </tr>
        </thead>
        <tbody>
          {vehicles.map(v => {
            const pendientes = tareasAuto(v.id)
            const isOpen = expanded.has(v.id)
            return (
              <Fragment key={v.id}>
                <tr
                  onClick={() => onToggle(v.id)}
                  className={`cursor-pointer border-b border-border transition-colors ${isOpen ? 'bg-muted/50' : 'hover:bg-muted/30'}`}
                >
                  <td className="py-2.5 px-3">
                    <div className="flex items-center gap-1.5">
                      {isOpen ? <ChevronUpIcon className="size-3 text-muted-foreground" /> : <ChevronDownIcon className="size-3 text-muted-foreground" />}
                      <span className="font-medium">{v.marca} {v.modelo}</span>
                      <span className="text-muted-foreground">{v.año}</span>
                      {v.color && <span className="text-xs text-muted-foreground">· {v.color}</span>}
                      {pendientes.length > 0 && (
                        <Badge variant="destructive" className="ml-1">{pendientes.length} tarea{pendientes.length > 1 ? 's' : ''}</Badge>
                      )}
                    </div>
                  </td>
                  <td className="py-2.5 px-3 text-muted-foreground">{v.dominio || '—'}</td>
                  <td className="py-2.5 px-3">
                    <Badge variant={ESTADO_VARIANT[v.estado] ?? 'outline'}>
                      {v.estado === 'confirmado' ? 'Consignación' : v.estado === 'en_stock' ? 'Propios' : v.estado?.replace(/_/g, ' ')}
                    </Badge>
                  </td>
                  <td className="py-2.5 px-3 text-muted-foreground tabular-nums">{v.km ? fmtN(v.km) : '—'}</td>
                  <td className="py-2.5 px-3 tabular-nums">
                    {v.precio_publicado
                      ? `$${Number(v.precio_publicado).toLocaleString('es-AR')}`
                      : v.precio_venta_objetivo
                      ? <span className="text-muted-foreground">${Number(v.precio_venta_objetivo).toLocaleString('es-AR')}</span>
                      : '—'}
                  </td>
                  <td className="py-2.5 px-3 text-muted-foreground">{diasEnStock(v.fecha_ingreso)}</td>
                  <td className="py-2.5 px-3 text-center"><ToggleCheck vehicleId={v.id} field="lavado" value={!!v.lavado} /></td>
                  <td className="py-2.5 px-3 text-center"><ToggleCheck vehicleId={v.id} field="fotos_ok" value={!!v.fotos_ok} /></td>
                  <td className="py-2.5 px-3 text-center"><ToggleCheck vehicleId={v.id} field="publicado" value={!!v.publicado} /></td>
                </tr>
                {isOpen && <VehicleDetail v={v} clientes={clientes} vehicles={vehicles} movimientos={movimientos} prestamos={prestamos} />}
              </Fragment>
            )
          })}
        </tbody>
      </table>
    </div>
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

const ESTADO_ORDER = [
  'a_ingresar', 'confirmado', 'en_stock',
  'en_reparacion', 'va_a_pensarlo', 'necesita_follow_up', 'reservado',
]
const ESTADO_LABEL: Record<string, string> = {
  potencial: 'Potencial',
  a_ingresar: 'A ingresar',
  confirmado: 'Consignación',
  en_stock: 'Propios',
  en_reparacion: 'En reparación',
  va_a_pensarlo: 'Va a pensarlo',
  necesita_follow_up: 'Necesita follow-up',
  reservado: 'Reservado',
}

export default function StockClient({
  vehicles, tareas, clientes, movimientos = [], prestamos = [],
}: {
  vehicles: any[]; tareas: any[]; clientes: any[]; movimientos?: any[]; prestamos?: any[]
}) {
  const [expanded, setExpanded] = useState<Set<number>>(new Set())
  const [tipoFilter, setTipoFilter] = useState<TipoFilter>('todos')
  const [groupMode, setGroupMode] = useState<GroupMode>('estado')

  const activos = vehicles.filter(v => v.estado !== 'vendido' && v.estado !== 'potencial')
  const potenciales = vehicles.filter(v => v.estado === 'potencial')
  const vendidos = vehicles.filter(v => v.estado === 'vendido')

  const filtered = activos.filter(v => {
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
            ? { label: `${ESTADO_LABEL[estado] ?? estado} (${vs.length})`, vehicles: vs }
            : null
        })
        .filter(Boolean) as { label: string; vehicles: any[] }[]
    }
    return [{ label: '', vehicles: filtered }]
  }

  const groups = getGroups()

  return (
    <div className="space-y-6">
      <div className="flex items-baseline justify-between">
        <h1 className="text-xl font-semibold">Stock</h1>
        <span className="text-sm text-muted-foreground">
          {activos.length} activos · {potenciales.length} potenciales · {vendidos.length} vendidos
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-xs text-muted-foreground mr-0.5">Tipo:</span>
          {TIPO_FILTER_LABELS.map(({ key, label }) => (
            <Button
              key={key}
              size="xs"
              variant={tipoFilter === key ? 'default' : 'outline'}
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
                  />
                </CardContent>
              </Card>
            </section>
          ))}
          {filtered.length === 0 && (
            <p className="py-6 text-center text-sm text-muted-foreground">Sin vehículos para este filtro.</p>
          )}
        </div>
      )}

      {potenciales.length > 0 && (
        <section>
          <p className="text-xs text-muted-foreground uppercase tracking-wide mb-3">Potenciales ({potenciales.length})</p>
          <Card size="sm">
            <CardContent className="p-0">
              <table className="w-full text-sm">
                <tbody className="divide-y divide-border">
                  {potenciales.map(v => {
                    const isOpen = expanded.has(v.id)
                    const tipo = v.tipo_operacion
                    const badgeVariant: 'default' | 'secondary' | 'outline' =
                      tipo === 'propio' ? 'default' : tipo === 'consignacion' ? 'secondary' : 'outline'
                    const badgeLabel = tipo === 'propio' ? 'propio' : tipo === 'consignacion' ? 'consignación' : 'sin tipo'
                    return (
                      <Fragment key={v.id}>
                        <tr
                          onClick={() => toggle(v.id)}
                          className={`cursor-pointer transition-colors ${isOpen ? 'bg-muted/50' : 'hover:bg-muted/30'}`}
                        >
                          <td className="px-4 py-2.5">
                            <div className="flex items-center gap-1.5">
                              {isOpen ? <ChevronUpIcon className="size-3 text-muted-foreground" /> : <ChevronDownIcon className="size-3 text-muted-foreground" />}
                              <span>{v.marca} {v.modelo} {v.año}</span>
                              {v.color && <span className="text-xs text-muted-foreground">· {v.color}</span>}
                            </div>
                          </td>
                          <td className="px-4 py-2.5 text-right">
                            <Badge variant={badgeVariant}>{badgeLabel}</Badge>
                          </td>
                        </tr>
                        {isOpen && <VehicleDetail v={v} clientes={clientes} vehicles={vehicles} movimientos={movimientos} prestamos={prestamos} />}
                      </Fragment>
                    )
                  })}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </section>
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
                              {isOpen ? <ChevronUpIcon className="size-3 text-muted-foreground" /> : <ChevronDownIcon className="size-3 text-muted-foreground" />}
                              <span>{v.marca} {v.modelo} {v.año}</span>
                              {v.color && <span className="text-xs text-muted-foreground">· {v.color}</span>}
                              {v.tipo_operacion && (
                                <span className="text-xs text-muted-foreground">· {v.tipo_operacion}</span>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-2.5 text-right text-muted-foreground tabular-nums">
                            {v.precio_venta_final ? `$${Number(v.precio_venta_final).toLocaleString('es-AR')}` : '—'}
                          </td>
                          <td className="px-4 py-2.5 text-right text-xs text-muted-foreground">
                            {fmtFecha(v.fecha_venta)}
                          </td>
                        </tr>
                        {isOpen && <VehicleDetail v={v} clientes={clientes} vehicles={vehicles} movimientos={movimientos} prestamos={prestamos} />}
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
