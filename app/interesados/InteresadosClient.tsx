'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { patchRecord, postRecord, deleteRecord } from '@/lib/kapso'

const ESTADO_COLOR: Record<string, string> = {
  activo:     'bg-green-100 text-green-700',
  contactado: 'bg-blue-100 text-blue-700',
  reservo:    'bg-yellow-100 text-yellow-700',
  compro:     'bg-gray-100 text-gray-500',
  perdido:    'bg-red-100 text-red-500',
}

const ESTADOS = ['activo', 'contactado', 'reservo', 'compro', 'perdido'] as const

const inputCls = 'w-full border border-gray-200 rounded px-2 py-1.5 text-sm focus:outline-none focus:border-gray-400'
const labelCls = 'block text-xs text-gray-400 mb-1'

function Field({ label, value }: { label: string; value: any }) {
  if (!value && value !== 0) return null
  return (
    <div>
      <p className="text-xs text-gray-400">{label}</p>
      <p className="text-sm text-gray-700">{value}</p>
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
    nombre:       i.nombre       ?? '',
    telefono:     i.telefono     ?? '',
    email:        i.email        ?? '',
    instagram:    i.instagram    ?? '',
    fuente:       i.fuente       ?? 'otro',
    vehicle_id:   i.vehicle_id   ? String(i.vehicle_id) : '',
    marca_buscada:  i.marca_buscada  ?? '',
    modelo_buscado: i.modelo_buscado ?? '',
    año_min:      i.año_min      ?? '',
    año_max:      i.año_max      ?? '',
    km_max:       i.km_max       ?? '',
    presupuesto:  i.presupuesto  ?? '',
    forma_pago:   i.forma_pago   ?? 'contado',
    estado:       i.estado       ?? 'activo',
    notas:        i.notas        ?? '',
  })

  async function setEstadoQuick(estado: string) {
    setSaving(true)
    const ok = await patchRecord('interesados', i.id, {
      estado,
      updated_at: new Date().toISOString(),
    })
    setSaving(false)
    if (ok) router.refresh()
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
    if (ok) { setEditing(false); router.refresh() }
  }

  async function borrar() {
    if (!confirm(`¿Borrar interesado ${i.nombre}?`)) return
    setSaving(true)
    const ok = await deleteRecord('interesados', i.id)
    setSaving(false)
    if (ok) router.refresh()
  }

  const ofertasDeEste = ofertas.filter(o => o.interesado_id === i.id)
  const badge = ESTADO_COLOR[i.estado] ?? 'bg-gray-100 text-gray-500'

  return (
    <div className="border-b border-gray-100 last:border-0">
      <div
        onClick={() => !editing && setOpen(v => !v)}
        className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-gray-300 text-xs shrink-0">{open ? '▲' : '▼'}</span>
          <span className="text-sm font-medium">{i.nombre}</span>
          {i.vehicle_id && (
            <span className="text-xs text-gray-400">— {vehicleLabel(i.vehicle_id)}</span>
          )}
        </div>
        <div className="flex items-center gap-3 shrink-0 ml-4">
          {i.presupuesto && <span className="text-xs text-gray-500">USD {Number(i.presupuesto).toLocaleString('es-AR')}</span>}
          {i.telefono && <span className="text-xs text-gray-400">{i.telefono}</span>}
          <span className={`text-xs px-2 py-0.5 rounded-full ${badge}`}>{i.estado}</span>
        </div>
      </div>

      {open && !editing && (
        <div className="px-10 py-4 bg-gray-50 space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-6 gap-y-3">
            <Field label="Email"         value={i.email} />
            <Field label="Instagram"     value={i.instagram} />
            <Field label="Fuente"        value={i.fuente} />
            <Field label="Auto de interés" value={i.vehicle_id ? vehicleLabel(i.vehicle_id) : null} />
            <Field label="Busca"         value={[i.marca_buscada, i.modelo_buscado].filter(Boolean).join(' ') || null} />
            <Field label="Año mín."      value={i.año_min} />
            <Field label="Año máx."      value={i.año_max} />
            <Field label="KM máx."       value={i.km_max ? Number(i.km_max).toLocaleString('es-AR') : null} />
            <Field label="Presupuesto"   value={i.presupuesto ? `USD ${Number(i.presupuesto).toLocaleString('es-AR')}` : null} />
            <Field label="Forma de pago" value={i.forma_pago} />
            <Field label="Último contacto" value={i.fecha_ultimo_contacto ? new Date(i.fecha_ultimo_contacto).toLocaleDateString('es-AR') : null} />
            {i.notas && <div className="col-span-full"><p className="text-xs text-gray-400">Notas</p><p className="text-sm text-gray-700">{i.notas}</p></div>}
          </div>

          {ofertasDeEste.length > 0 && (
            <div>
              <p className="text-xs text-gray-400 uppercase tracking-wide mb-2">Ofertas ({ofertasDeEste.length})</p>
              <div className="space-y-1">
                {ofertasDeEste.map(o => (
                  <div key={o.id} className="text-sm flex items-center gap-3">
                    <span>{vehicleLabel(o.vehicle_id)}</span>
                    <span className="text-gray-500">USD {Number(o.monto_ofrecido).toLocaleString('es-AR')}</span>
                    <span className="text-xs text-gray-400">{o.estado}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-gray-400 mr-1">Estado rápido:</span>
            {ESTADOS.map(e => (
              <button
                key={e}
                onClick={() => setEstadoQuick(e)}
                disabled={saving || i.estado === e}
                className={`text-xs px-3 py-1 rounded border transition-colors ${
                  i.estado === e
                    ? 'bg-gray-900 text-white border-gray-900'
                    : 'border-gray-200 text-gray-600 hover:border-gray-400'
                } disabled:opacity-50`}
              >
                {e}
              </button>
            ))}
            <button
              onClick={() => setEditing(true)}
              className="ml-auto text-xs text-gray-500 hover:text-gray-900 border border-gray-200 hover:border-gray-400 px-3 py-1 rounded"
            >
              Editar
            </button>
            <button
              onClick={borrar}
              disabled={saving}
              className="text-xs text-gray-400 hover:text-red-600 border border-gray-200 hover:border-red-300 px-3 py-1 rounded disabled:opacity-50"
            >
              Borrar
            </button>
          </div>
        </div>
      )}

      {open && editing && (
        <EditForm
          form={form}
          setForm={setForm}
          saving={saving}
          onSave={save}
          onCancel={() => setEditing(false)}
        />
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
    <div className="px-10 py-4 bg-gray-50 space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-3">
        <div><label className={labelCls}>Nombre</label><input type="text" value={form.nombre} onChange={set('nombre')} className={inputCls} /></div>
        <div><label className={labelCls}>Teléfono</label><input type="text" value={form.telefono} onChange={set('telefono')} className={inputCls} /></div>
        <div><label className={labelCls}>Email</label><input type="email" value={form.email} onChange={set('email')} className={inputCls} /></div>
        <div><label className={labelCls}>Instagram</label><input type="text" value={form.instagram} onChange={set('instagram')} className={inputCls} /></div>
        <div>
          <label className={labelCls}>Fuente</label>
          <select value={form.fuente} onChange={set('fuente')} className={inputCls}>
            <option value="whatsapp">whatsapp</option><option value="instagram">instagram</option>
            <option value="mercadolibre">mercadolibre</option><option value="referido">referido</option>
            <option value="otro">otro</option>
          </select>
        </div>
        <div>
          <label className={labelCls}>Estado</label>
          <select value={form.estado} onChange={set('estado')} className={inputCls}>
            {ESTADOS.map(e => <option key={e} value={e}>{e}</option>)}
          </select>
        </div>
        <div><label className={labelCls}>Marca buscada</label><input type="text" value={form.marca_buscada} onChange={set('marca_buscada')} className={inputCls} /></div>
        <div><label className={labelCls}>Modelo buscado</label><input type="text" value={form.modelo_buscado} onChange={set('modelo_buscado')} className={inputCls} /></div>
        <div><label className={labelCls}>Presupuesto USD</label><input type="number" value={form.presupuesto} onChange={set('presupuesto')} className={inputCls} /></div>
        <div><label className={labelCls}>Año mín.</label><input type="number" value={form.año_min} onChange={set('año_min')} className={inputCls} /></div>
        <div><label className={labelCls}>Año máx.</label><input type="number" value={form.año_max} onChange={set('año_max')} className={inputCls} /></div>
        <div><label className={labelCls}>KM máx.</label><input type="number" value={form.km_max} onChange={set('km_max')} className={inputCls} /></div>
        <div>
          <label className={labelCls}>Forma de pago</label>
          <select value={form.forma_pago} onChange={set('forma_pago')} className={inputCls}>
            <option value="contado">contado</option><option value="financiado">financiado</option>
            <option value="permuta">permuta</option><option value="mixto">mixto</option>
          </select>
        </div>
        <div className="col-span-2 sm:col-span-3"><label className={labelCls}>Notas</label><textarea value={form.notas} onChange={set('notas')} rows={2} className={`${inputCls} resize-none`} /></div>
      </div>
      <div className="flex gap-2">
        <button onClick={onSave} disabled={saving}
          className="px-4 py-1.5 bg-gray-900 text-white text-sm rounded hover:bg-gray-700 disabled:opacity-50">
          {saving ? 'Guardando…' : 'Guardar'}
        </button>
        <button onClick={onCancel}
          className="px-4 py-1.5 border border-gray-200 text-sm rounded hover:bg-gray-100">
          Cancelar
        </button>
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
  const [error, setError] = useState('')

  function set(field: string) {
    return (e: any) => setForm(f => ({ ...f, [field]: e.target.value }))
  }

  async function save() {
    if (!form.nombre.trim()) { setError('El nombre es requerido.'); return }
    setSaving(true)
    setError('')
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
    if (r.ok) { onClose(); router.refresh() }
    else setError('Error al guardar.')
  }

  return (
    <div className="border border-gray-200 rounded p-4 bg-gray-50 space-y-4">
      <p className="text-sm font-medium text-gray-700">Nuevo interesado</p>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-3">
        <div><label className={labelCls}>Nombre *</label><input type="text" value={form.nombre} onChange={set('nombre')} className={inputCls} /></div>
        <div><label className={labelCls}>Teléfono</label><input type="text" value={form.telefono} onChange={set('telefono')} className={inputCls} /></div>
        <div><label className={labelCls}>Email</label><input type="email" value={form.email} onChange={set('email')} className={inputCls} /></div>
        <div><label className={labelCls}>Instagram</label><input type="text" value={form.instagram} onChange={set('instagram')} className={inputCls} /></div>
        <div>
          <label className={labelCls}>Fuente</label>
          <select value={form.fuente} onChange={set('fuente')} className={inputCls}>
            <option value="whatsapp">whatsapp</option><option value="instagram">instagram</option>
            <option value="mercadolibre">mercadolibre</option><option value="referido">referido</option>
            <option value="otro">otro</option>
          </select>
        </div>
        <div>
          <label className={labelCls}>Auto de interés</label>
          <select value={form.vehicle_id} onChange={set('vehicle_id')} className={inputCls}>
            <option value="">— Sin auto específico</option>
            {vehicles.filter(v => v.estado !== 'vendido').map(v => (
              <option key={v.id} value={v.id}>{v.marca} {v.modelo} {v.año}</option>
            ))}
          </select>
        </div>
        <div><label className={labelCls}>Marca buscada</label><input type="text" value={form.marca_buscada} onChange={set('marca_buscada')} className={inputCls} /></div>
        <div><label className={labelCls}>Modelo buscado</label><input type="text" value={form.modelo_buscado} onChange={set('modelo_buscado')} className={inputCls} /></div>
        <div><label className={labelCls}>Presupuesto USD</label><input type="number" value={form.presupuesto} onChange={set('presupuesto')} className={inputCls} /></div>
        <div>
          <label className={labelCls}>Forma de pago</label>
          <select value={form.forma_pago} onChange={set('forma_pago')} className={inputCls}>
            <option value="contado">contado</option><option value="financiado">financiado</option>
            <option value="permuta">permuta</option><option value="mixto">mixto</option>
          </select>
        </div>
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
      <div className="flex gap-2">
        <button onClick={save} disabled={saving}
          className="px-4 py-1.5 bg-gray-900 text-white text-sm rounded hover:bg-gray-700 disabled:opacity-50">
          {saving ? 'Guardando…' : 'Guardar'}
        </button>
        <button onClick={onClose}
          className="px-4 py-1.5 border border-gray-200 text-sm rounded hover:bg-gray-100">
          Cancelar
        </button>
      </div>
    </div>
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
          <span className="text-sm text-gray-400">{interesados.length} totales · {activos} activos</span>
        </div>
        <button
          onClick={() => setShowNuevo(v => !v)}
          className={`text-xs px-3 py-1.5 rounded border transition-colors ${
            showNuevo ? 'bg-gray-900 text-white border-gray-900' : 'border-gray-200 text-gray-500 hover:border-gray-400'
          }`}
        >
          + Nuevo interesado
        </button>
      </div>

      {showNuevo && (
        <NuevoInteresadoForm vehicles={vehicles} onClose={() => setShowNuevo(false)} />
      )}

      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs text-gray-400 mr-1">Filtrar:</span>
        {(['todos', ...ESTADOS] as const).map(k => (
          <button
            key={k}
            onClick={() => setFilter(k)}
            className={`text-xs px-3 py-1 rounded-full border transition-colors ${
              filter === k
                ? 'bg-gray-900 text-white border-gray-900'
                : 'border-gray-200 text-gray-500 hover:border-gray-400'
            }`}
          >
            {k}
          </button>
        ))}
      </div>

      <div className="border border-gray-200 rounded">
        {sorted.map(i => (
          <InteresadoRow key={i.id} i={i} vehicleLabel={vehicleLabel} ofertas={ofertas} />
        ))}
        {sorted.length === 0 && (
          <p className="px-4 py-6 text-sm text-gray-400 text-center">Sin interesados.</p>
        )}
      </div>
    </div>
  )
}
