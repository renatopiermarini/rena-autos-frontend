'use client'
import { useState, Fragment } from 'react'
import { useRouter } from 'next/navigation'

const ESTADO_COLOR: Record<string, string> = {
  en_stock:           'bg-green-100 text-green-800',
  confirmado:         'bg-blue-100 text-blue-800',
  vendido:            'bg-gray-100 text-gray-400',
  reservado:          'bg-yellow-100 text-yellow-800',
  en_reparacion:      'bg-orange-100 text-orange-800',
  a_ingresar:         'bg-purple-100 text-purple-700',
  va_a_pensarlo:      'bg-gray-100 text-gray-600',
  necesita_follow_up: 'bg-red-100 text-red-700',
  potencial:          'bg-gray-100 text-gray-500',
}

const ESTADOS = [
  'potencial', 'a_ingresar', 'confirmado', 'en_stock',
  'en_reparacion', 'va_a_pensarlo', 'necesita_follow_up',
  'reservado', 'vendido',
]

// ── ToggleCheck ───────────────────────────────────────────────────────────────

function ToggleCheck({ vehicleId, field, value }: { vehicleId: number; field: string; value: boolean }) {
  const [val, setVal]     = useState(value)
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
      className={`text-base transition-colors ${val ? 'text-green-600 hover:text-green-800' : 'text-gray-300 hover:text-gray-500'}`}
    >
      {error ? '⚠' : '✓'}
    </button>
  )
}

// ── Helpers ───────────────────────────────────────────────────────────────────

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
  if (value == null || value === '' || value === 0 && label !== 'KM') return null
  return (
    <div>
      <p className="text-xs text-gray-400">{label}</p>
      <p className="text-sm text-gray-700">{value}</p>
    </div>
  )
}

// ── Input helpers ─────────────────────────────────────────────────────────────

const inputCls = 'w-full border border-gray-200 rounded px-2 py-1.5 text-sm focus:outline-none focus:border-gray-400'
const labelCls = 'block text-xs text-gray-400 mb-1'

function FInput({ label, value, onChange, type = 'text', placeholder }: {
  label: string; value: string; onChange: (v: string) => void; type?: string; placeholder?: string
}) {
  return (
    <div>
      <label className={labelCls}>{label}</label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className={inputCls}
      />
    </div>
  )
}

function FSelect({ label, value, onChange, options }: {
  label: string; value: string; onChange: (v: string) => void; options: string[]
}) {
  return (
    <div>
      <label className={labelCls}>{label}</label>
      <select value={value} onChange={e => onChange(e.target.value)} className={inputCls}>
        <option value="">—</option>
        {options.map(o => <option key={o} value={o}>{o.replace(/_/g, ' ')}</option>)}
      </select>
    </div>
  )
}

// ── VehicleDetail ─────────────────────────────────────────────────────────────

function VehicleDetail({ v, clientes }: { v: any; clientes: any[] }) {
  const router   = useRouter()
  const [editing, setEditing] = useState(false)
  const [saving,  setSaving]  = useState(false)
  const [error,   setError]   = useState('')

  const [form, setForm] = useState({
    estado:                v.estado              ?? '',
    km:                    String(v.km           ?? ''),
    color:                 v.color               ?? '',
    dominio:               v.dominio             ?? '',
    numero_motor:          v.numero_motor        ?? '',
    numero_chasis:         v.numero_chasis       ?? '',
    precio_compra:         String(v.precio_compra         ?? ''),
    precio_venta_objetivo: String(v.precio_venta_objetivo ?? ''),
    precio_publicado:      String(v.precio_publicado      ?? ''),
    precio_venta_final:    String(v.precio_venta_final    ?? ''),
    fecha_ingreso:         v.fecha_ingreso ? v.fecha_ingreso.slice(0, 10) : '',
    fecha_venta:           v.fecha_venta   ? v.fecha_venta.slice(0, 10)   : '',
    notas:                 v.notas               ?? '',
  })

  function set(field: string) {
    return (val: string) => setForm(f => ({ ...f, [field]: val }))
  }

  async function save() {
    setSaving(true)
    setError('')
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
    if (res.ok) { setEditing(false); router.refresh() }
    else setError('Error al guardar. Intentá de nuevo.')
  }

  const cliente  = clientes.find((c: any) => c.id === v.cliente_id)
  const comprador = clientes.find((c: any) => c.id === v.comprador_id)
  const margen = v.precio_venta_final && v.costo_total
    ? Number(v.precio_venta_final) - Number(v.costo_total)
    : null

  if (editing) {
    return (
      <tr>
        <td colSpan={9} className="px-4 pb-5 pt-3 bg-gray-50 border-b border-gray-200">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-6 gap-y-4">
            <div className="col-span-2 sm:col-span-3 lg:col-span-4">
              <FSelect label="Estado" value={form.estado} onChange={set('estado')} options={ESTADOS} />
            </div>
            <FInput label="KM"            value={form.km}            onChange={set('km')}            type="number" />
            <FInput label="Color"         value={form.color}         onChange={set('color')} />
            <FInput label="Dominio"       value={form.dominio}       onChange={set('dominio')} />
            <FInput label="N° motor"      value={form.numero_motor}  onChange={set('numero_motor')} />
            <FInput label="N° chasis"     value={form.numero_chasis} onChange={set('numero_chasis')} />
            <FInput label="Precio compra"         value={form.precio_compra}         onChange={set('precio_compra')}         type="number" />
            <FInput label="Precio objetivo"       value={form.precio_venta_objetivo} onChange={set('precio_venta_objetivo')} type="number" />
            <FInput label="Precio publicado"      value={form.precio_publicado}      onChange={set('precio_publicado')}      type="number" />
            <FInput label="Precio venta final"    value={form.precio_venta_final}    onChange={set('precio_venta_final')}    type="number" />
            <FInput label="Fecha ingreso" value={form.fecha_ingreso} onChange={set('fecha_ingreso')} type="date" />
            <FInput label="Fecha venta"   value={form.fecha_venta}   onChange={set('fecha_venta')}   type="date" />
            <div className="col-span-2 sm:col-span-3 lg:col-span-4">
              <label className={labelCls}>Notas</label>
              <textarea
                value={form.notas}
                onChange={e => set('notas')(e.target.value)}
                rows={2}
                className={`${inputCls} resize-none`}
              />
            </div>
          </div>
          {error && <p className="text-xs text-red-600 mt-2">{error}</p>}
          <div className="flex gap-2 mt-4">
            <button
              onClick={save}
              disabled={saving}
              className="px-4 py-1.5 bg-gray-900 text-white text-sm rounded hover:bg-gray-700 disabled:opacity-50 transition-colors"
            >
              {saving ? 'Guardando…' : 'Guardar'}
            </button>
            <button
              onClick={() => { setEditing(false); setError('') }}
              className="px-4 py-1.5 border border-gray-200 text-sm rounded hover:bg-gray-100 transition-colors"
            >
              Cancelar
            </button>
          </div>
        </td>
      </tr>
    )
  }

  return (
    <tr>
      <td colSpan={9} className="px-4 pb-4 pt-0 bg-gray-50 border-b border-gray-200">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-8 gap-y-3 pt-3">
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
              <p className="text-xs text-gray-400">Margen</p>
              <p className={`text-sm font-medium ${margen >= 0 ? 'text-green-700' : 'text-red-600'}`}>
                {margen >= 0 ? '+' : ''}{fmt(margen)}
              </p>
            </div>
          )}
          <Field label="Fecha ingreso" value={fmtFecha(v.fecha_ingreso)} />
          <Field label="Fecha venta" value={fmtFecha(v.fecha_venta)} />
          <Field label="Propietario/consignante" value={cliente?.nombre} />
          <Field label="Comprador" value={comprador?.nombre} />
          {v.notas && (
            <div className="col-span-2 lg:col-span-4">
              <p className="text-xs text-gray-400">Notas</p>
              <p className="text-sm text-gray-600">{v.notas}</p>
            </div>
          )}
        </div>
        <button
          onClick={e => { e.stopPropagation(); setEditing(true) }}
          className="mt-4 text-xs text-gray-400 hover:text-gray-700 border border-gray-200 hover:border-gray-400 px-3 py-1 rounded transition-colors"
        >
          Editar
        </button>
      </td>
    </tr>
  )
}

// ── VehicleTable ──────────────────────────────────────────────────────────────

function VehicleTable({
  vehicles,
  tareas,
  clientes,
  expanded,
  onToggle,
}: {
  vehicles: any[]
  tareas: any[]
  clientes: any[]
  expanded: Set<number>
  onToggle: (id: number) => void
}) {
  function tareasAuto(vid: number) {
    return tareas.filter(t => t.vehicle_id === vid && t.estado !== 'completada')
  }

  if (vehicles.length === 0) {
    return <p className="py-6 text-center text-sm text-gray-400">Sin vehículos.</p>
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-200 text-left">
            <th className="pb-2 font-medium text-gray-500 text-xs pr-4">Auto</th>
            <th className="pb-2 font-medium text-gray-500 text-xs pr-4">Patente</th>
            <th className="pb-2 font-medium text-gray-500 text-xs pr-4">Estado</th>
            <th className="pb-2 font-medium text-gray-500 text-xs pr-4">KM</th>
            <th className="pb-2 font-medium text-gray-500 text-xs pr-4">Precio</th>
            <th className="pb-2 font-medium text-gray-500 text-xs pr-4">Días</th>
            <th className="pb-2 font-medium text-gray-500 text-xs pr-1 text-center">Lav</th>
            <th className="pb-2 font-medium text-gray-500 text-xs pr-1 text-center">Fotos</th>
            <th className="pb-2 font-medium text-gray-500 text-xs text-center">Pub</th>
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
                  className={`cursor-pointer border-b border-gray-100 transition-colors ${isOpen ? 'bg-gray-50' : 'hover:bg-gray-50'}`}
                >
                  <td className="py-3 pr-4">
                    <div className="flex items-center gap-1.5">
                      <span className="text-gray-400 text-xs">{isOpen ? '▲' : '▼'}</span>
                      <span className="font-medium">{v.marca} {v.modelo}</span>
                      <span className="text-gray-400">{v.año}</span>
                      {v.color && <span className="text-xs text-gray-400">· {v.color}</span>}
                      {pendientes.length > 0 && (
                        <span className="text-xs text-orange-500">{pendientes.length} tarea{pendientes.length > 1 ? 's' : ''}</span>
                      )}
                    </div>
                  </td>
                  <td className="py-3 pr-4 text-gray-500">{v.dominio || '—'}</td>
                  <td className="py-3 pr-4">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${ESTADO_COLOR[v.estado] ?? 'bg-gray-100 text-gray-600'}`}>
                      {v.estado === 'confirmado' ? 'Consignación' : v.estado === 'en_stock' ? 'Propios' : v.estado?.replace(/_/g, ' ')}
                    </span>
                  </td>
                  <td className="py-3 pr-4 text-gray-500">{v.km ? fmtN(v.km) : '—'}</td>
                  <td className="py-3 pr-4">
                    {v.precio_publicado
                      ? `$${Number(v.precio_publicado).toLocaleString('es-AR')}`
                      : v.precio_venta_objetivo
                      ? <span className="text-gray-400">${Number(v.precio_venta_objetivo).toLocaleString('es-AR')}</span>
                      : '—'}
                  </td>
                  <td className="py-3 pr-4 text-gray-400">{diasEnStock(v.fecha_ingreso)}</td>
                  <td className="py-3 pr-1 text-center">
                    <ToggleCheck vehicleId={v.id} field="lavado"    value={!!v.lavado} />
                  </td>
                  <td className="py-3 pr-1 text-center">
                    <ToggleCheck vehicleId={v.id} field="fotos_ok"  value={!!v.fotos_ok} />
                  </td>
                  <td className="py-3 text-center">
                    <ToggleCheck vehicleId={v.id} field="publicado" value={!!v.publicado} />
                  </td>
                </tr>
                {isOpen && <VehicleDetail v={v} clientes={clientes} />}
              </Fragment>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────

type TipoFilter  = 'todos' | 'propio' | 'consignacion'
type GroupMode   = 'ninguno' | 'tipo' | 'estado'

const TIPO_FILTER_LABELS: { key: TipoFilter; label: string }[] = [
  { key: 'todos',        label: 'Todos'        },
  { key: 'propio',       label: 'Propios'      },
  { key: 'consignacion', label: 'Consignación' },
]

const GROUP_LABELS: { key: GroupMode; label: string }[] = [
  { key: 'ninguno',      label: 'Sin agrupar'  },
  { key: 'tipo',         label: 'Por tipo'     },
  { key: 'estado',       label: 'Por estado'   },
]

const ESTADO_ORDER = [
  'potencial', 'a_ingresar', 'confirmado', 'en_stock',
  'en_reparacion', 'va_a_pensarlo', 'necesita_follow_up', 'reservado',
]
const ESTADO_LABEL: Record<string, string> = {
  potencial:          'Potencial',
  a_ingresar:         'A ingresar',
  confirmado:         'Consignación',
  en_stock:           'Propios',
  en_reparacion:      'En reparación',
  va_a_pensarlo:      'Va a pensarlo',
  necesita_follow_up: 'Necesita follow-up',
  reservado:          'Reservado',
}

export default function StockClient({
  vehicles,
  tareas,
  clientes,
}: {
  vehicles: any[]
  tareas: any[]
  clientes: any[]
}) {
  const [expanded,   setExpanded]   = useState<Set<number>>(new Set())
  const [tipoFilter, setTipoFilter] = useState<TipoFilter>('todos')
  const [groupMode,  setGroupMode]  = useState<GroupMode>('ninguno')

  const activos  = vehicles.filter(v => v.estado !== 'vendido')
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

  // Build groups for groupMode
  function getGroups(): { label: string; vehicles: any[] }[] {
    if (groupMode === 'tipo') {
      const propios = filtered.filter(v => v.tipo_operacion === 'propio')
      const consig  = filtered.filter(v => v.tipo_operacion === 'consignacion')
      const otros   = filtered.filter(v => !v.tipo_operacion || (v.tipo_operacion !== 'propio' && v.tipo_operacion !== 'consignacion'))
      return [
        propios.length  > 0 ? { label: `Propios (${propios.length})`,       vehicles: propios } : null,
        consig.length   > 0 ? { label: `Consignación (${consig.length})`,   vehicles: consig  } : null,
        otros.length    > 0 ? { label: `Otros (${otros.length})`,           vehicles: otros   } : null,
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
      {/* Header */}
      <div className="flex items-baseline justify-between">
        <h1 className="text-xl font-semibold">Stock</h1>
        <span className="text-sm text-gray-400">{activos.length} activos · {vendidos.length} vendidos</span>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-xs text-gray-400 mr-0.5">Tipo:</span>
          {TIPO_FILTER_LABELS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setTipoFilter(key)}
              className={`text-xs px-3 py-1 rounded-full border transition-colors ${
                tipoFilter === key
                  ? 'bg-gray-900 text-white border-gray-900'
                  : 'border-gray-200 text-gray-500 hover:border-gray-400'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-xs text-gray-400 mr-0.5">Agrupar:</span>
          {GROUP_LABELS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setGroupMode(key)}
              className={`text-xs px-3 py-1 rounded-full border transition-colors ${
                groupMode === key
                  ? 'bg-gray-900 text-white border-gray-900'
                  : 'border-gray-200 text-gray-500 hover:border-gray-400'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Active vehicles */}
      {groupMode === 'ninguno' ? (
        <section>
          <VehicleTable
            vehicles={filtered}
            tareas={tareas}
            clientes={clientes}
            expanded={expanded}
            onToggle={toggle}
          />
        </section>
      ) : (
        <div className="space-y-8">
          {groups.map(group => (
            <section key={group.label}>
              <p className="text-xs text-gray-400 uppercase tracking-wide mb-3">{group.label}</p>
              <VehicleTable
                vehicles={group.vehicles}
                tareas={tareas}
                clientes={clientes}
                expanded={expanded}
                onToggle={toggle}
              />
            </section>
          ))}
          {filtered.length === 0 && (
            <p className="py-6 text-center text-sm text-gray-400">Sin vehículos para este filtro.</p>
          )}
        </div>
      )}

      {/* Vendidos */}
      {vendidos.length > 0 && (
        <section>
          <p className="text-xs text-gray-400 uppercase tracking-wide mb-3">Vendidos ({vendidos.length})</p>
          <div className="border border-gray-200 rounded overflow-hidden">
            <table className="w-full text-sm">
              <tbody className="divide-y divide-gray-100">
                {vendidos.map(v => {
                  const isOpen = expanded.has(v.id)
                  return (
                    <Fragment key={v.id}>
                      <tr
                        onClick={() => toggle(v.id)}
                        className={`cursor-pointer transition-colors ${isOpen ? 'bg-gray-50' : 'hover:bg-gray-50'}`}
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1.5">
                            <span className="text-gray-400 text-xs">{isOpen ? '▲' : '▼'}</span>
                            <span className="text-gray-600">{v.marca} {v.modelo} {v.año}</span>
                            {v.color && <span className="text-xs text-gray-400">· {v.color}</span>}
                            {v.tipo_operacion && (
                              <span className="text-xs text-gray-400">· {v.tipo_operacion}</span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right text-gray-500">
                          {v.precio_venta_final ? `$${Number(v.precio_venta_final).toLocaleString('es-AR')}` : '—'}
                        </td>
                        <td className="px-4 py-3 text-right text-xs text-gray-400">
                          {fmtFecha(v.fecha_venta)}
                        </td>
                      </tr>
                      {isOpen && <VehicleDetail v={v} clientes={clientes} />}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  )
}
