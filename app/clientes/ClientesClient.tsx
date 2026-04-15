'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

const TIPO_COLOR: Record<string, string> = {
  vendedor:  'bg-blue-100 text-blue-700',
  comprador: 'bg-green-100 text-green-700',
  ambos:     'bg-purple-100 text-purple-700',
}

const ESTADO_COLOR: Record<string, string> = {
  activo:     'text-green-600',
  contactado: 'text-blue-600',
  reservo:    'text-yellow-600',
  compro:     'text-gray-400',
  perdido:    'text-red-400',
}

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

function ClienteRow({ c }: { c: any }) {
  const router  = useRouter()
  const [open,    setOpen]    = useState(false)
  const [editing, setEditing] = useState(false)
  const [saving,  setSaving]  = useState(false)
  const [error,   setError]   = useState('')
  const hasExtra = c.whatsapp || c.instagram || c.dni || c.cuil || c.direccion || c.notas

  const [form, setForm] = useState({
    nombre:      c.nombre      ?? '',
    telefono:    c.telefono    ?? '',
    whatsapp:    c.whatsapp    ?? '',
    email:       c.email       ?? '',
    instagram:   c.instagram   ?? '',
    dni:         c.dni         ?? '',
    cuil:        c.cuil        ?? '',
    direccion:   c.direccion   ?? '',
    tipo:        c.tipo        ?? 'comprador',
    notas:       c.notas       ?? '',
    es_acreedor: c.es_acreedor ? '1' : '0',
  })

  function set(field: string) {
    return (val: string) => setForm(f => ({ ...f, [field]: val }))
  }

  async function save() {
    setSaving(true)
    setError('')
    const payload: Record<string, any> = {
      ...form,
      es_acreedor: form.es_acreedor === '1' ? 1 : 0,
      updated_at: new Date().toISOString(),
    }
    // clean up empty strings to null
    for (const k of Object.keys(payload)) {
      if (payload[k] === '' && k !== 'nombre') payload[k] = null
    }
    const res = await fetch(`/api/db/clientes?id=${c.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    setSaving(false)
    if (res.ok) { setEditing(false); router.refresh() }
    else setError('Error al guardar. Intentá de nuevo.')
  }

  return (
    <div className="border-b border-gray-100 last:border-0">
      {/* Header row */}
      <div
        onClick={() => !editing && (hasExtra || true) && setOpen(o => !o)}
        className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className="text-gray-300 text-xs">{open ? '▲' : '▼'}</span>
          <span className="text-sm font-medium">{c.nombre}</span>
          {c.es_acreedor ? <span className="text-xs text-orange-600">acreedor</span> : null}
        </div>
        <div className="flex items-center gap-4 flex-wrap justify-end">
          {c.telefono && <span className="text-xs text-gray-400">{c.telefono}</span>}
          {c.email    && <span className="text-xs text-gray-400">{c.email}</span>}
          <span className={`text-xs px-2 py-0.5 rounded-full ${TIPO_COLOR[c.tipo] ?? 'bg-gray-100 text-gray-600'}`}>
            {c.tipo}
          </span>
        </div>
      </div>

      {/* Expanded: view or edit */}
      {open && !editing && (
        <div className="px-10 pb-4 pt-1 bg-gray-50">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-8 gap-y-3">
            <Field label="WhatsApp"  value={c.whatsapp} />
            <Field label="Instagram" value={c.instagram} />
            <Field label="DNI"       value={c.dni} />
            <Field label="CUIL"      value={c.cuil} />
            <Field label="Dirección" value={c.direccion} />
            {c.notas && (
              <div className="col-span-2 lg:col-span-4">
                <p className="text-xs text-gray-400">Notas</p>
                <p className="text-sm text-gray-600">{c.notas}</p>
              </div>
            )}
          </div>
          <button
            onClick={e => { e.stopPropagation(); setEditing(true) }}
            className="mt-3 text-xs text-gray-400 hover:text-gray-700 border border-gray-200 hover:border-gray-400 px-3 py-1 rounded transition-colors"
          >
            Editar
          </button>
        </div>
      )}

      {open && editing && (
        <div className="px-10 pb-5 pt-3 bg-gray-50">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-6 gap-y-4">
            <div>
              <label className={labelCls}>Nombre</label>
              <input type="text" value={form.nombre} onChange={e => set('nombre')(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Tipo</label>
              <select value={form.tipo} onChange={e => set('tipo')(e.target.value)} className={inputCls}>
                <option value="comprador">comprador</option>
                <option value="vendedor">vendedor</option>
                <option value="ambos">ambos</option>
              </select>
            </div>
            <div>
              <label className={labelCls}>Teléfono</label>
              <input type="text" value={form.telefono} onChange={e => set('telefono')(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>WhatsApp</label>
              <input type="text" value={form.whatsapp} onChange={e => set('whatsapp')(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Email</label>
              <input type="email" value={form.email} onChange={e => set('email')(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Instagram</label>
              <input type="text" value={form.instagram} onChange={e => set('instagram')(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>DNI</label>
              <input type="text" value={form.dni} onChange={e => set('dni')(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>CUIL</label>
              <input type="text" value={form.cuil} onChange={e => set('cuil')(e.target.value)} className={inputCls} />
            </div>
            <div className="col-span-2">
              <label className={labelCls}>Dirección</label>
              <input type="text" value={form.direccion} onChange={e => set('direccion')(e.target.value)} className={inputCls} />
            </div>
            <div className="flex items-center gap-2 pt-4">
              <input
                type="checkbox"
                id={`acreedor-${c.id}`}
                checked={form.es_acreedor === '1'}
                onChange={e => set('es_acreedor')(e.target.checked ? '1' : '0')}
                className="rounded"
              />
              <label htmlFor={`acreedor-${c.id}`} className="text-xs text-gray-600">Es acreedor</label>
            </div>
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
        </div>
      )}
    </div>
  )
}

function InteresadoRow({ i }: { i: any }) {
  const [open, setOpen] = useState(false)
  const hasExtra = i.email || i.instagram || i.fuente || i.año_max || i.km_max || i.forma_pago || i.notas || i.fecha_ultimo_contacto

  return (
    <div className="border-b border-gray-100 last:border-0">
      <div
        onClick={() => hasExtra && setOpen(o => !o)}
        className={`flex items-center justify-between px-4 py-3 ${hasExtra ? 'cursor-pointer hover:bg-gray-50' : ''} transition-colors`}
      >
        <div className="flex items-center gap-2 min-w-0">
          {hasExtra && <span className="text-gray-300 text-xs shrink-0">{open ? '▲' : '▼'}</span>}
          <div className="min-w-0">
            <span className="text-sm font-medium">{i.nombre}</span>
            {(i.marca_buscada || i.modelo_buscado) && (
              <span className="text-xs text-gray-400 ml-2">
                busca: {[i.marca_buscada, i.modelo_buscado, i.año_min && `desde ${i.año_min}`].filter(Boolean).join(' ')}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-4 shrink-0 ml-4">
          {i.presupuesto && (
            <span className="text-xs text-gray-500">${Number(i.presupuesto).toLocaleString('es-AR')}</span>
          )}
          {i.telefono && <span className="text-xs text-gray-400">{i.telefono}</span>}
          <span className={`text-xs ${ESTADO_COLOR[i.estado] ?? 'text-gray-500'}`}>{i.estado}</span>
        </div>
      </div>

      {open && (
        <div className="px-10 pb-4 pt-1 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-8 gap-y-3 bg-gray-50">
          <Field label="Email"           value={i.email} />
          <Field label="Instagram"       value={i.instagram} />
          <Field label="Fuente"          value={i.fuente} />
          <Field label="Forma de pago"   value={i.forma_pago} />
          <Field label="Año máx."        value={i.año_max} />
          <Field label="KM máx."         value={i.km_max ? Number(i.km_max).toLocaleString('es-AR') : null} />
          <Field label="Último contacto" value={i.fecha_ultimo_contacto ? new Date(i.fecha_ultimo_contacto).toLocaleDateString('es-AR') : null} />
          {i.notas && (
            <div className="col-span-2 lg:col-span-4">
              <p className="text-xs text-gray-400">Notas</p>
              <p className="text-sm text-gray-600">{i.notas}</p>
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
    <div className="space-y-10">
      <h1 className="text-xl font-semibold">Clientes</h1>

      <section>
        <p className="text-xs text-gray-400 uppercase tracking-wide mb-3">
          Clientes ({clientes.length})
        </p>
        <div className="border border-gray-200 rounded">
          {clientes.map(c => <ClienteRow key={c.id} c={c} />)}
          {clientes.length === 0 && (
            <p className="px-4 py-3 text-sm text-gray-400">Sin clientes registrados.</p>
          )}
        </div>
      </section>

      <section>
        <p className="text-xs text-gray-400 uppercase tracking-wide mb-3">
          Interesados activos ({interesadosActivos.length})
        </p>
        <div className="border border-gray-200 rounded">
          {interesadosActivos.map(i => <InteresadoRow key={i.id} i={i} />)}
          {interesadosActivos.length === 0 && (
            <p className="px-4 py-3 text-sm text-gray-400">Sin interesados activos.</p>
          )}
        </div>
      </section>
    </div>
  )
}
