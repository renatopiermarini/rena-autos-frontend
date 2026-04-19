'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { patchRecord, postRecord, deleteRecord } from '@/lib/kapso'

const ESTADO_BADGE: Record<string, string> = {
  pendiente:  'bg-yellow-100 text-yellow-700',
  aceptada:   'bg-green-100 text-green-700',
  rechazada:  'bg-red-100 text-red-700',
  contraoferta: 'bg-blue-100 text-blue-700',
}

const inputCls = 'w-full border border-gray-200 rounded px-2 py-1.5 text-sm focus:outline-none focus:border-gray-400'
const labelCls = 'block text-xs text-gray-400 mb-1'

function fmtMoney(n: any) {
  if (n == null || n === '') return '—'
  return `USD ${Number(n).toLocaleString('es-AR')}`
}

function fmtDate(iso: string) {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' })
}

function OfertaRow({
  o, vehicleLabel, interesadoLabel,
}: { o: any; vehicleLabel: (id: any) => string; interesadoLabel: (id: any) => string }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [respuesta, setRespuesta] = useState(o.respuesta_propietario ?? '')
  const [saving, setSaving] = useState<string>('')

  async function setEstado(estado: string) {
    setSaving(estado)
    const payload: any = { estado, updated_at: new Date().toISOString() }
    if (estado === 'aceptada') payload.monto_aceptado = o.monto_ofrecido
    const ok = await patchRecord('ofertas', o.id, payload)
    setSaving('')
    if (ok) router.refresh()
  }

  async function saveRespuesta() {
    setSaving('respuesta')
    const ok = await patchRecord('ofertas', o.id, {
      respuesta_propietario: respuesta || null,
      fecha_respuesta: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    setSaving('')
    if (ok) router.refresh()
  }

  async function borrar() {
    if (!confirm(`¿Borrar oferta #${o.id}?`)) return
    setSaving('delete')
    const ok = await deleteRecord('ofertas', o.id)
    setSaving('')
    if (ok) router.refresh()
  }

  const estado = o.estado ?? 'pendiente'
  const badge = ESTADO_BADGE[estado] ?? 'bg-gray-100 text-gray-600'

  return (
    <div className="border-b border-gray-100 last:border-0">
      <div
        onClick={() => setOpen(v => !v)}
        className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-gray-300 text-xs shrink-0">{open ? '▲' : '▼'}</span>
          <span className="text-sm font-medium truncate">{vehicleLabel(o.vehicle_id)}</span>
          <span className="text-sm text-gray-500 whitespace-nowrap">— {fmtMoney(o.monto_ofrecido)}</span>
        </div>
        <div className="flex items-center gap-3 shrink-0 ml-4">
          {o.email_enviado ? (
            <span className="text-xs text-green-600" title="Mail enviado al propietario">✉ enviado</span>
          ) : (
            <span className="text-xs text-gray-400" title="Mail no enviado">✉ pendiente</span>
          )}
          <span className="text-xs text-gray-400">{interesadoLabel(o.interesado_id)}</span>
          <span className={`text-xs px-2 py-0.5 rounded-full ${badge}`}>{estado}</span>
          <span className="text-xs text-gray-400 tabular-nums">{fmtDate(o.created_at)}</span>
        </div>
      </div>

      {open && (
        <div className="px-10 py-4 bg-gray-50 space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-2">
            <div><p className="text-xs text-gray-400">Vehículo</p><p className="text-sm">{vehicleLabel(o.vehicle_id)}</p></div>
            <div><p className="text-xs text-gray-400">Interesado</p><p className="text-sm">{interesadoLabel(o.interesado_id)}</p></div>
            <div><p className="text-xs text-gray-400">Monto ofrecido</p><p className="text-sm">{fmtMoney(o.monto_ofrecido)}</p></div>
            {o.monto_aceptado && <div><p className="text-xs text-gray-400">Monto aceptado</p><p className="text-sm">{fmtMoney(o.monto_aceptado)}</p></div>}
            <div><p className="text-xs text-gray-400">Creada</p><p className="text-sm">{fmtDate(o.created_at)}</p></div>
            {o.fecha_respuesta && <div><p className="text-xs text-gray-400">Fecha respuesta</p><p className="text-sm">{fmtDate(o.fecha_respuesta)}</p></div>}
            {o.notas && <div className="col-span-full"><p className="text-xs text-gray-400">Notas</p><p className="text-sm">{o.notas}</p></div>}
          </div>

          <div>
            <label className={labelCls}>Respuesta del propietario</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={respuesta}
                onChange={e => setRespuesta(e.target.value)}
                placeholder="Ej: Acepta, Rechaza, Contraoferta USD 35000..."
                className={inputCls}
              />
              <button
                onClick={saveRespuesta}
                disabled={saving === 'respuesta'}
                className="px-3 py-1.5 bg-gray-900 text-white text-xs rounded hover:bg-gray-700 disabled:opacity-50 whitespace-nowrap"
              >
                {saving === 'respuesta' ? '…' : 'Guardar'}
              </button>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-gray-400 mr-1">Estado:</span>
            {(['pendiente','aceptada','rechazada','contraoferta'] as const).map(e => (
              <button
                key={e}
                onClick={() => setEstado(e)}
                disabled={saving === e || estado === e}
                className={`text-xs px-3 py-1 rounded border transition-colors ${
                  estado === e
                    ? 'bg-gray-900 text-white border-gray-900'
                    : 'border-gray-200 text-gray-600 hover:border-gray-400'
                } disabled:opacity-50`}
              >
                {saving === e ? '…' : e}
              </button>
            ))}
            <button
              onClick={borrar}
              disabled={saving === 'delete'}
              className="ml-auto text-xs text-gray-400 hover:text-red-600 px-3 py-1 rounded border border-gray-200 hover:border-red-300 disabled:opacity-50"
            >
              Borrar
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function NuevaOfertaForm({
  vehicles, interesados, onClose,
}: { vehicles: any[]; interesados: any[]; onClose: () => void }) {
  const router = useRouter()
  const [form, setForm] = useState({
    vehicle_id: '', interesado_id: '', monto_ofrecido: '', notas: '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function save() {
    if (!form.vehicle_id || !form.monto_ofrecido) {
      setError('Vehículo y monto son obligatorios.')
      return
    }
    setSaving(true)
    setError('')
    const payload: any = {
      vehicle_id: Number(form.vehicle_id),
      monto_ofrecido: Number(form.monto_ofrecido),
      estado: 'pendiente',
      email_enviado: 0,
      notas: form.notas || null,
      created_at: new Date().toISOString(),
    }
    if (form.interesado_id) payload.interesado_id = Number(form.interesado_id)
    const r = await postRecord('ofertas', payload)
    setSaving(false)
    if (r.ok) { onClose(); router.refresh() }
    else setError('Error al guardar.')
  }

  return (
    <div className="border border-gray-200 rounded p-4 bg-gray-50 space-y-4">
      <p className="text-sm font-medium text-gray-700">Nueva oferta</p>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-3">
        <div className="col-span-2">
          <label className={labelCls}>Vehículo *</label>
          <select value={form.vehicle_id} onChange={e => setForm(f => ({ ...f, vehicle_id: e.target.value }))} className={inputCls}>
            <option value="">—</option>
            {vehicles.filter(v => v.estado !== 'vendido').map(v => (
              <option key={v.id} value={v.id}>{v.marca} {v.modelo} {v.año} {v.dominio ? `(${v.dominio})` : ''}</option>
            ))}
          </select>
        </div>
        <div className="col-span-2">
          <label className={labelCls}>Interesado</label>
          <select value={form.interesado_id} onChange={e => setForm(f => ({ ...f, interesado_id: e.target.value }))} className={inputCls}>
            <option value="">— Sin identificar</option>
            {interesados.map(i => (
              <option key={i.id} value={i.id}>{i.nombre} {i.telefono ? `(${i.telefono})` : ''}</option>
            ))}
          </select>
        </div>
        <div className="col-span-2">
          <label className={labelCls}>Monto ofrecido (USD) *</label>
          <input
            type="number"
            value={form.monto_ofrecido}
            onChange={e => setForm(f => ({ ...f, monto_ofrecido: e.target.value }))}
            className={inputCls}
            placeholder="34000"
          />
        </div>
        <div className="col-span-2 sm:col-span-4">
          <label className={labelCls}>Notas</label>
          <input
            type="text"
            value={form.notas}
            onChange={e => setForm(f => ({ ...f, notas: e.target.value }))}
            className={inputCls}
          />
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
      <p className="text-xs text-gray-400">
        Al guardar, el sistema manda automáticamente un mail al propietario del auto con el monto de la oferta.
      </p>
    </div>
  )
}

export default function OfertasClient({
  ofertas, vehicles, interesados,
}: { ofertas: any[]; vehicles: any[]; interesados: any[] }) {
  const [showNueva, setShowNueva] = useState(false)
  const [filter, setFilter] = useState<'todas' | 'pendiente' | 'aceptada' | 'rechazada'>('todas')

  function vehicleLabel(id: any) {
    const v = vehicles.find(v => v.id === id)
    if (!v) return 'Sin vehículo'
    const auto = `${v.marca ?? ''} ${v.modelo ?? ''} ${v.año ?? ''}`.trim()
    return v.dominio ? `${auto} (${v.dominio})` : auto
  }

  function interesadoLabel(id: any) {
    if (!id) return 'sin identificar'
    const i = interesados.find(i => i.id === id)
    return i ? i.nombre : `interesado #${id}`
  }

  const filtradas = filter === 'todas' ? ofertas : ofertas.filter(o => o.estado === filter)
  const sorted = [...filtradas].sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''))

  const pendientes = ofertas.filter(o => o.estado === 'pendiente').length

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-baseline gap-3">
          <h1 className="text-xl font-semibold">Ofertas</h1>
          <span className="text-sm text-gray-400">{ofertas.length} totales · {pendientes} pendientes</span>
        </div>
        <button
          onClick={() => setShowNueva(v => !v)}
          className={`text-xs px-3 py-1.5 rounded border transition-colors ${
            showNueva ? 'bg-gray-900 text-white border-gray-900' : 'border-gray-200 text-gray-500 hover:border-gray-400'
          }`}
        >
          + Nueva oferta
        </button>
      </div>

      {showNueva && (
        <NuevaOfertaForm vehicles={vehicles} interesados={interesados} onClose={() => setShowNueva(false)} />
      )}

      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs text-gray-400 mr-1">Filtrar:</span>
        {(['todas','pendiente','aceptada','rechazada'] as const).map(k => (
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
        {sorted.map(o => (
          <OfertaRow key={o.id} o={o} vehicleLabel={vehicleLabel} interesadoLabel={interesadoLabel} />
        ))}
        {sorted.length === 0 && (
          <p className="px-4 py-6 text-sm text-gray-400 text-center">Sin ofertas.</p>
        )}
      </div>
    </div>
  )
}
