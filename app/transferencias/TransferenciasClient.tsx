'use client'
import { useState, Fragment } from 'react'
import { useRouter } from 'next/navigation'
import { patchRecord, postRecord, deleteRecord } from '@/lib/kapso'

const ESTADO_COLOR: Record<string, string> = {
  pendiente:  'bg-yellow-100 text-yellow-800',
  en_proceso: 'bg-blue-100 text-blue-800',
  completada: 'bg-green-100 text-green-800',
  cancelada:  'bg-gray-100 text-gray-400',
}

const ESTADOS: string[] = ['pendiente', 'en_proceso', 'completada', 'cancelada']

function fmtFecha(iso: string | null | undefined) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit' })
}

function autoLabel(v: any): string {
  if (!v) return '—'
  const base = `${v.marca ?? ''} ${v.modelo ?? ''} ${v.año ?? ''}`.trim()
  return v.dominio ? `${base} (${v.dominio})` : base || `#${v.id}`
}

function vendedorDe(vehicle: any, clientes: any[]): string {
  if (!vehicle?.cliente_id) return '—'
  const c = clientes.find(c => c.id === vehicle.cliente_id)
  return c?.nombre || '—'
}

function montoDe(vehicle: any): number | null {
  if (!vehicle) return null
  const v = vehicle.precio_venta_final ?? vehicle.precio_publicado ?? null
  return v == null ? null : Number(v)
}

function isTruthy(v: any): boolean {
  return v === true || v === 1 || v === '1' || v === 'true'
}

function TransferenciaEdit({
  t,
  vehicle,
  clientes,
  vehicles,
  onDone,
}: {
  t: any
  vehicle: any
  clientes: any[]
  vehicles: any[]
  onDone: () => void
}) {
  const [vehicleId, setVehicleId] = useState<number | ''>(t.vehicle_id ?? '')
  const [compradorId, setCompradorId] = useState<number | ''>(t.comprador_id ?? '')
  const [compradorNombre, setCompradorNombre] = useState<string>(t.comprador_nombre ?? '')
  const [monto, setMonto] = useState<string>(montoDe(vehicle)?.toString() ?? '')
  const [medioPago, setMedioPago] = useState<string>(t.medio_pago ?? '')
  const [registro, setRegistro] = useState<string>(t.registro ?? '')
  const [ubicacion, setUbicacion] = useState<string>(t.ubicacion ?? '')
  const [precarga, setPrecarga] = useState<boolean>(isTruthy(t.precarga))
  const [fechaTurno, setFechaTurno] = useState<string>((t.fecha_turno ?? '').slice(0, 10))
  const [horario, setHorario] = useState<string>(t.horario ?? '')
  const [notas, setNotas] = useState<string>(t.notas ?? '')
  const [saving, setSaving] = useState(false)

  async function save() {
    setSaving(true)
    const veh = vehicles.find(v => v.id === vehicleId)
    const patchData: Record<string, any> = {
      vehicle_id: vehicleId || null,
      auto: veh ? autoLabel(veh) : t.auto,
      comprador_id: compradorId || null,
      comprador_nombre: compradorNombre,
      medio_pago: medioPago,
      registro: registro,
      ubicacion: ubicacion,
      precarga: precarga ? 1 : 0,
      fecha_turno: fechaTurno || null,
      horario: horario,
      notas: notas,
    }
    await patchRecord('transferencias', t.vehicle_id, patchData, 'vehicle_id')
    if (vehicleId && monto !== '' && !Number.isNaN(Number(monto))) {
      await patchRecord('vehicles', Number(vehicleId), { precio_venta_final: Number(monto) })
    }
    setSaving(false)
    onDone()
  }

  return (
    <div className="px-4 pb-5 pt-3 bg-gray-50 border-b border-gray-200 space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-3">
        <Field label="Vehículo">
          <select
            value={vehicleId}
            onChange={e => setVehicleId(e.target.value ? Number(e.target.value) : '')}
            className="input"
          >
            <option value="">—</option>
            {vehicles.map(v => (
              <option key={v.id} value={v.id}>{autoLabel(v)}</option>
            ))}
          </select>
        </Field>
        <Field label="Vendedor (propietario)">
          <div className="h-9 flex items-center text-sm text-gray-600">
            {vendedorDe(vehicles.find(v => v.id === vehicleId), clientes)}
          </div>
        </Field>
        <Field label="Comprador">
          <select
            value={compradorId}
            onChange={e => {
              const id = e.target.value ? Number(e.target.value) : ''
              setCompradorId(id)
              const c = clientes.find(c => c.id === id)
              if (c) setCompradorNombre(c.nombre ?? '')
            }}
            className="input"
          >
            <option value="">— (escribir nombre abajo)</option>
            {clientes.map(c => (
              <option key={c.id} value={c.id}>{c.nombre}</option>
            ))}
          </select>
          <input
            type="text"
            value={compradorNombre}
            onChange={e => setCompradorNombre(e.target.value)}
            placeholder="Nombre del comprador"
            className="input mt-1.5"
          />
        </Field>

        <Field label="Monto (USD)">
          <input type="number" value={monto} onChange={e => setMonto(e.target.value)} className="input" />
        </Field>
        <Field label="Medio de pago">
          <select value={medioPago} onChange={e => setMedioPago(e.target.value)} className="input">
            <option value="">—</option>
            <option>efectivo</option>
            <option>transferencia bancaria</option>
            <option>cheque</option>
            <option>mixto</option>
          </select>
        </Field>
        <Field label="Precarga digital">
          <label className="flex items-center gap-2 h-9">
            <input type="checkbox" checked={precarga} onChange={e => setPrecarga(e.target.checked)} />
            <span className="text-sm text-gray-600">{precarga ? 'Sí' : 'No'}</span>
          </label>
        </Field>

        <Field label="Fecha del turno">
          <input type="date" value={fechaTurno} onChange={e => setFechaTurno(e.target.value)} className="input" />
        </Field>
        <Field label="Hora">
          <input type="time" value={horario} onChange={e => setHorario(e.target.value)} className="input" />
        </Field>
        <Field label="Registro seccional">
          <input type="text" value={registro} onChange={e => setRegistro(e.target.value)} className="input" />
        </Field>

        <Field label="Ubicación" className="sm:col-span-2 lg:col-span-3">
          <input type="text" value={ubicacion} onChange={e => setUbicacion(e.target.value)} className="input" />
        </Field>
        <Field label="Notas" className="sm:col-span-2 lg:col-span-3">
          <textarea value={notas} onChange={e => setNotas(e.target.value)} rows={2} className="input" />
        </Field>
      </div>

      <div className="flex items-center justify-between pt-2 border-t border-gray-200">
        <div className="flex items-center gap-1">
          {ESTADOS.map(est => (
            <button
              key={est}
              onClick={async () => {
                await patchRecord('transferencias', t.vehicle_id, { estado: est }, 'vehicle_id')
                if (est === 'completada' && t.vehicle_id) {
                  await patchRecord('vehicles', t.vehicle_id, {
                    estado: 'vendido',
                    fecha_venta: new Date().toISOString().slice(0, 10),
                  })
                }
                onDone()
              }}
              className={`text-xs px-2 py-1 rounded ${t.estado === est
                ? 'bg-gray-900 text-white'
                : 'text-gray-500 hover:bg-gray-200'}`}
            >
              {est.replace(/_/g, ' ')}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <button
            onClick={async () => {
              if (confirm('Eliminar esta transferencia?')) {
                await deleteRecord('transferencias', t.vehicle_id, 'vehicle_id')
                onDone()
              }
            }}
            className="text-xs px-2 py-1 text-red-600 hover:bg-red-50 rounded"
          >
            Eliminar
          </button>
          <button
            onClick={save}
            disabled={saving}
            className="text-xs px-3 py-1 bg-gray-900 text-white rounded hover:bg-gray-700 disabled:bg-gray-400"
          >
            {saving ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </div>
      <style jsx>{`
        .input {
          width: 100%;
          border: 1px solid #e5e7eb;
          border-radius: 4px;
          padding: 6px 8px;
          font-size: 0.875rem;
          background: white;
        }
        .input:focus {
          outline: none;
          border-color: #9ca3af;
        }
      `}</style>
    </div>
  )
}

function Field({ label, children, className = '' }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <label className="text-xs text-gray-500 uppercase tracking-wide block mb-1">{label}</label>
      {children}
    </div>
  )
}

function NuevaTransferenciaForm({
  vehicles,
  clientes,
  onDone,
}: {
  vehicles: any[]
  clientes: any[]
  onDone: () => void
}) {
  const [open, setOpen] = useState(false)
  const [vehicleId, setVehicleId] = useState<number | ''>('')
  const [compradorId, setCompradorId] = useState<number | ''>('')
  const [compradorNombre, setCompradorNombre] = useState('')
  const [monto, setMonto] = useState('')
  const [fechaTurno, setFechaTurno] = useState('')
  const [horario, setHorario] = useState('')
  const [saving, setSaving] = useState(false)

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="text-sm text-gray-500 hover:text-gray-900 border border-dashed border-gray-300 rounded px-3 py-2 w-full"
      >
        + Nueva transferencia
      </button>
    )
  }

  async function save() {
    if (!vehicleId) { alert('Elegí un vehículo'); return }
    if (!compradorNombre) { alert('Falta el comprador'); return }
    setSaving(true)
    const veh = vehicles.find(v => v.id === vehicleId)
    const payload: any = {
      vehicle_id: vehicleId,
      auto: veh ? autoLabel(veh) : '',
      comprador_id: compradorId || null,
      comprador_nombre: compradorNombre,
      estado: 'pendiente',
      fecha_turno: fechaTurno || null,
      horario: horario,
      precarga: 0,
    }
    await postRecord('transferencias', payload)
    if (monto !== '' && !Number.isNaN(Number(monto))) {
      await patchRecord('vehicles', Number(vehicleId), { precio_venta_final: Number(monto) })
    }
    setSaving(false)
    setOpen(false)
    setVehicleId(''); setCompradorId(''); setCompradorNombre('')
    setMonto(''); setFechaTurno(''); setHorario('')
    onDone()
  }

  return (
    <div className="border border-gray-200 rounded p-4 space-y-3 bg-gray-50">
      <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide">Nueva transferencia</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        <Field label="Vehículo">
          <select
            value={vehicleId}
            onChange={e => setVehicleId(e.target.value ? Number(e.target.value) : '')}
            className="input"
          >
            <option value="">—</option>
            {vehicles.map(v => (
              <option key={v.id} value={v.id}>{autoLabel(v)}</option>
            ))}
          </select>
        </Field>
        <Field label="Comprador">
          <select
            value={compradorId}
            onChange={e => {
              const id = e.target.value ? Number(e.target.value) : ''
              setCompradorId(id)
              const c = clientes.find(c => c.id === id)
              if (c) setCompradorNombre(c.nombre ?? '')
            }}
            className="input"
          >
            <option value="">—</option>
            {clientes.map(c => (
              <option key={c.id} value={c.id}>{c.nombre}</option>
            ))}
          </select>
          <input
            type="text"
            value={compradorNombre}
            onChange={e => setCompradorNombre(e.target.value)}
            placeholder="Nombre del comprador"
            className="input mt-1.5"
          />
        </Field>
        <Field label="Monto (USD)">
          <input type="number" value={monto} onChange={e => setMonto(e.target.value)} className="input" />
        </Field>
        <Field label="Fecha del turno">
          <input type="date" value={fechaTurno} onChange={e => setFechaTurno(e.target.value)} className="input" />
        </Field>
        <Field label="Hora">
          <input type="time" value={horario} onChange={e => setHorario(e.target.value)} className="input" />
        </Field>
      </div>
      <div className="flex justify-end gap-2 pt-2">
        <button onClick={() => setOpen(false)} className="text-xs px-3 py-1 text-gray-500 hover:bg-gray-100 rounded">
          Cancelar
        </button>
        <button
          onClick={save}
          disabled={saving}
          className="text-xs px-3 py-1 bg-gray-900 text-white rounded hover:bg-gray-700 disabled:bg-gray-400"
        >
          {saving ? 'Guardando…' : 'Crear'}
        </button>
      </div>
      <style jsx>{`
        .input {
          width: 100%;
          border: 1px solid #e5e7eb;
          border-radius: 4px;
          padding: 6px 8px;
          font-size: 0.875rem;
          background: white;
        }
      `}</style>
    </div>
  )
}

export default function TransferenciasClient({
  transferencias,
  clientes,
  vehicles,
}: {
  transferencias: any[]
  clientes: any[]
  vehicles: any[]
}) {
  const router = useRouter()
  const [expanded, setExpanded] = useState<Set<number>>(new Set())
  const [filtro, setFiltro] = useState<'activas' | 'todas'>('activas')

  function toggle(id: number) {
    setExpanded(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const refresh = () => router.refresh()

  const activas = transferencias.filter(t => t.estado !== 'completada' && t.estado !== 'cancelada')
  const completadas = transferencias.filter(t => t.estado === 'completada')
  const mostrar = filtro === 'activas' ? activas : transferencias

  return (
    <div className="space-y-6">
      <div className="flex items-baseline justify-between">
        <h1 className="text-xl font-semibold">Transferencias</h1>
        <div className="flex items-center gap-4">
          <span className="text-sm text-gray-400">{activas.length} activas · {completadas.length} completadas</span>
          <div className="flex text-xs rounded overflow-hidden border border-gray-200">
            <button
              onClick={() => setFiltro('activas')}
              className={`px-3 py-1 transition-colors ${filtro === 'activas' ? 'bg-gray-900 text-white' : 'text-gray-500 hover:bg-gray-50'}`}
            >
              Activas
            </button>
            <button
              onClick={() => setFiltro('todas')}
              className={`px-3 py-1 transition-colors ${filtro === 'todas' ? 'bg-gray-900 text-white' : 'text-gray-500 hover:bg-gray-50'}`}
            >
              Todas
            </button>
          </div>
        </div>
      </div>

      <NuevaTransferenciaForm vehicles={vehicles} clientes={clientes} onDone={refresh} />

      <div className="border border-gray-200 rounded overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50 text-left">
              <th className="px-4 py-2 font-medium text-gray-500 text-xs">Auto</th>
              <th className="px-4 py-2 font-medium text-gray-500 text-xs">Vendedor</th>
              <th className="px-4 py-2 font-medium text-gray-500 text-xs">Comprador</th>
              <th className="px-4 py-2 font-medium text-gray-500 text-xs text-right">Monto</th>
              <th className="px-4 py-2 font-medium text-gray-500 text-xs">Turno</th>
              <th className="px-4 py-2 font-medium text-gray-500 text-xs">Estado</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {mostrar.map(t => {
              const rowKey = t.id ?? t.vehicle_id
              const isOpen = expanded.has(rowKey)
              const vehicle = vehicles.find(v => v.id === t.vehicle_id)
              const monto = montoDe(vehicle)
              const vendedor = vendedorDe(vehicle, clientes)
              return (
                <Fragment key={rowKey}>
                  <tr
                    onClick={() => toggle(rowKey)}
                    className={`cursor-pointer transition-colors ${isOpen ? 'bg-gray-50' : 'hover:bg-gray-50'}`}
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <span className="text-gray-400 text-xs">{isOpen ? '▲' : '▼'}</span>
                        <span className="font-medium">{t.auto || '—'}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-600">{vendedor}</td>
                    <td className="px-4 py-3 text-gray-600">{t.comprador_nombre || '—'}</td>
                    <td className="px-4 py-3 text-right text-gray-700 tabular-nums">
                      {monto != null ? `USD ${monto.toLocaleString('es-AR')}` : '—'}
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs tabular-nums">
                      {t.fecha_turno ? fmtFecha(t.fecha_turno) : '—'}
                      {t.horario ? ` ${t.horario}` : ''}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${ESTADO_COLOR[t.estado] ?? 'bg-gray-100 text-gray-600'}`}>
                        {t.estado?.replace(/_/g, ' ')}
                      </span>
                    </td>
                  </tr>
                  {isOpen && (
                    <tr>
                      <td colSpan={6} className="p-0">
                        <TransferenciaEdit
                          t={t}
                          vehicle={vehicle}
                          clientes={clientes}
                          vehicles={vehicles}
                          onDone={refresh}
                        />
                      </td>
                    </tr>
                  )}
                </Fragment>
              )
            })}
            {mostrar.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-gray-400">
                  Sin transferencias {filtro === 'activas' ? 'activas' : ''}.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
