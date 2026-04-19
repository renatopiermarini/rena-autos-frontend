'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { patchRecord, postRecord, deleteRecord } from '@/lib/kapso'

const RESULTADO_BADGE: Record<string, string> = {
  pendiente:  'bg-yellow-100 text-yellow-700',
  concretada: 'bg-green-100 text-green-700',
  cancelada:  'bg-red-100 text-red-700',
  no_show:    'bg-gray-200 text-gray-600',
}

const RESULTADOS = ['pendiente', 'concretada', 'cancelada', 'no_show'] as const

const inputCls = 'w-full border border-gray-200 rounded px-2 py-1.5 text-sm focus:outline-none focus:border-gray-400'
const labelCls = 'block text-xs text-gray-400 mb-1'

function fmtDateTime(iso: string) {
  if (!iso) return ''
  const d = new Date(iso)
  return d.toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

function fmtDate(iso: string) {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' })
}

// datetime-local needs YYYY-MM-DDTHH:MM in local time
function isoToLocalInput(iso: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function localInputToIso(local: string): string {
  // Treat datetime-local value as local time and convert to ISO with offset
  if (!local) return ''
  return new Date(local).toISOString()
}

function VisitaRow({
  v, vehicleLabel, interesadoLabel,
}: { v: any; vehicleLabel: (id: any) => string; interesadoLabel: (id: any) => string }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [notas, setNotas] = useState(v.notas ?? '')
  const [fecha, setFecha] = useState(isoToLocalInput(v.fecha))
  const [saving, setSaving] = useState<string>('')

  async function setResultado(resultado: string) {
    setSaving(resultado)
    const ok = await patchRecord('visitas', v.id, { resultado })
    setSaving('')
    if (ok) router.refresh()
  }

  async function saveDetalles() {
    setSaving('detalles')
    const payload: any = { notas: notas || null }
    if (fecha) payload.fecha = localInputToIso(fecha)
    const ok = await patchRecord('visitas', v.id, payload)
    setSaving('')
    if (ok) router.refresh()
  }

  async function borrar() {
    if (!confirm(`¿Borrar visita #${v.id}?`)) return
    setSaving('delete')
    const ok = await deleteRecord('visitas', v.id)
    setSaving('')
    if (ok) router.refresh()
  }

  const resultado = v.resultado ?? 'pendiente'
  const badge = RESULTADO_BADGE[resultado] ?? 'bg-gray-100 text-gray-600'

  return (
    <div className="border-b border-gray-100 last:border-0">
      <div
        onClick={() => setOpen(o => !o)}
        className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-gray-300 text-xs shrink-0">{open ? '▲' : '▼'}</span>
          <span className="text-sm font-medium truncate">{vehicleLabel(v.vehicle_id)}</span>
          <span className="text-sm text-gray-500 whitespace-nowrap">— {interesadoLabel(v.interesado_id)}</span>
        </div>
        <div className="flex items-center gap-3 shrink-0 ml-4">
          {v.email_enviado ? (
            <span className="text-xs text-green-600" title="Mail enviado al interesado">✉ enviado</span>
          ) : (
            <span className="text-xs text-gray-400" title="Mail no enviado">✉ pendiente</span>
          )}
          <span className={`text-xs px-2 py-0.5 rounded-full ${badge}`}>{resultado}</span>
          <span className="text-xs text-gray-400 tabular-nums">{fmtDateTime(v.fecha)}</span>
        </div>
      </div>

      {open && (
        <div className="px-10 py-4 bg-gray-50 space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-2">
            <div><p className="text-xs text-gray-400">Vehículo</p><p className="text-sm">{vehicleLabel(v.vehicle_id)}</p></div>
            <div><p className="text-xs text-gray-400">Interesado</p><p className="text-sm">{interesadoLabel(v.interesado_id)}</p></div>
            <div><p className="text-xs text-gray-400">Creada</p><p className="text-sm">{fmtDate(v.created_at)}</p></div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-x-4 gap-y-3 items-end">
            <div className="sm:col-span-1">
              <label className={labelCls}>Fecha y hora</label>
              <input
                type="datetime-local"
                value={fecha}
                onChange={e => setFecha(e.target.value)}
                className={inputCls}
              />
            </div>
            <div className="sm:col-span-2">
              <label className={labelCls}>Notas</label>
              <input
                type="text"
                value={notas}
                onChange={e => setNotas(e.target.value)}
                placeholder="Detalles, condiciones, recordatorios…"
                className={inputCls}
              />
            </div>
          </div>
          <div>
            <button
              onClick={saveDetalles}
              disabled={saving === 'detalles'}
              className="px-3 py-1.5 bg-gray-900 text-white text-xs rounded hover:bg-gray-700 disabled:opacity-50"
            >
              {saving === 'detalles' ? '…' : 'Guardar cambios'}
            </button>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-gray-400 mr-1">Resultado:</span>
            {RESULTADOS.map(r => (
              <button
                key={r}
                onClick={() => setResultado(r)}
                disabled={saving === r || resultado === r}
                className={`text-xs px-3 py-1 rounded border transition-colors ${
                  resultado === r
                    ? 'bg-gray-900 text-white border-gray-900'
                    : 'border-gray-200 text-gray-600 hover:border-gray-400'
                } disabled:opacity-50`}
              >
                {saving === r ? '…' : r}
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

function NuevaVisitaForm({
  vehicles, interesados, onClose,
}: { vehicles: any[]; interesados: any[]; onClose: () => void }) {
  const router = useRouter()
  const [form, setForm] = useState({
    vehicle_id: '', interesado_id: '', fecha: '', notas: '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function save() {
    if (!form.vehicle_id || !form.interesado_id || !form.fecha) {
      setError('Vehículo, interesado y fecha son obligatorios.')
      return
    }
    setSaving(true)
    setError('')
    const payload: any = {
      vehicle_id: Number(form.vehicle_id),
      interesado_id: Number(form.interesado_id),
      fecha: localInputToIso(form.fecha),
      resultado: 'pendiente',
      email_enviado: 0,
      notas: form.notas || null,
      created_at: new Date().toISOString(),
    }
    const r = await postRecord('visitas', payload)
    setSaving(false)
    if (r.ok) { onClose(); router.refresh() }
    else setError('Error al guardar.')
  }

  return (
    <div className="border border-gray-200 rounded p-4 bg-gray-50 space-y-4">
      <p className="text-sm font-medium text-gray-700">Nueva visita</p>
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
          <label className={labelCls}>Interesado *</label>
          <select value={form.interesado_id} onChange={e => setForm(f => ({ ...f, interesado_id: e.target.value }))} className={inputCls}>
            <option value="">—</option>
            {interesados.map(i => (
              <option key={i.id} value={i.id}>{i.nombre} {i.telefono ? `(${i.telefono})` : ''}</option>
            ))}
          </select>
        </div>
        <div className="col-span-2">
          <label className={labelCls}>Fecha y hora *</label>
          <input
            type="datetime-local"
            value={form.fecha}
            onChange={e => setForm(f => ({ ...f, fecha: e.target.value }))}
            className={inputCls}
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
    </div>
  )
}

type Filtro = 'todas' | 'proximas' | 'pasadas' | typeof RESULTADOS[number]

export default function VisitasClient({
  visitas, vehicles, interesados,
}: { visitas: any[]; vehicles: any[]; interesados: any[] }) {
  const [showNueva, setShowNueva] = useState(false)
  const [filter, setFilter] = useState<Filtro>('proximas')

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

  const ahora = Date.now()
  const filtradas = visitas.filter(v => {
    if (filter === 'todas') return true
    if (filter === 'proximas') return v.fecha && new Date(v.fecha).getTime() >= ahora && v.resultado === 'pendiente'
    if (filter === 'pasadas')  return v.fecha && new Date(v.fecha).getTime() <  ahora
    return v.resultado === filter
  })

  // Próximas: orden ascendente por fecha. Pasadas / resto: descendente.
  const sorted = [...filtradas].sort((a, b) => {
    const at = a.fecha ? new Date(a.fecha).getTime() : 0
    const bt = b.fecha ? new Date(b.fecha).getTime() : 0
    return filter === 'proximas' ? at - bt : bt - at
  })

  const proximasCount = visitas.filter(v =>
    v.fecha && new Date(v.fecha).getTime() >= ahora && v.resultado === 'pendiente'
  ).length

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-baseline gap-3">
          <h1 className="text-xl font-semibold">Visitas</h1>
          <span className="text-sm text-gray-400">{visitas.length} totales · {proximasCount} próximas</span>
        </div>
        <button
          onClick={() => setShowNueva(v => !v)}
          className={`text-xs px-3 py-1.5 rounded border transition-colors ${
            showNueva ? 'bg-gray-900 text-white border-gray-900' : 'border-gray-200 text-gray-500 hover:border-gray-400'
          }`}
        >
          + Nueva visita
        </button>
      </div>

      {showNueva && (
        <NuevaVisitaForm vehicles={vehicles} interesados={interesados} onClose={() => setShowNueva(false)} />
      )}

      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs text-gray-400 mr-1">Filtrar:</span>
        {(['proximas','pasadas','todas', ...RESULTADOS] as const).map(k => (
          <button
            key={k}
            onClick={() => setFilter(k as Filtro)}
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
        {sorted.map(v => (
          <VisitaRow key={v.id} v={v} vehicleLabel={vehicleLabel} interesadoLabel={interesadoLabel} />
        ))}
        {sorted.length === 0 && (
          <p className="px-4 py-6 text-sm text-gray-400 text-center">Sin visitas.</p>
        )}
      </div>
    </div>
  )
}
