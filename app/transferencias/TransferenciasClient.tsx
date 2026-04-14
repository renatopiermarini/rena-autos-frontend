'use client'
import { useState, Fragment } from 'react'

const DOCS_LABELS: Record<string, string> = {
  formulario_08:        'Formulario 08 firmado y certificado',
  cedulas_titular:      'Cédulas titular y autorizados',
  titulo:               'Título automotor',
  informe_dominio:      'Informe de dominio',
  verificacion_policial:'Verificación policial',
  libre_deudas:         'Libre de deudas y patentes',
}

const DOC_ORDER = [
  'formulario_08',
  'cedulas_titular',
  'titulo',
  'informe_dominio',
  'verificacion_policial',
  'libre_deudas',
]

const ESTADO_COLOR: Record<string, string> = {
  pendiente:   'bg-yellow-100 text-yellow-800',
  en_proceso:  'bg-blue-100 text-blue-800',
  completada:  'bg-green-100 text-green-800',
  cancelada:   'bg-gray-100 text-gray-400',
}

function fmtFecha(iso: string) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit' })
}

function parseDocs(t: any): { id: string; label: string; estado: string }[] {
  const raw = t.docs_json
  if (!raw) return DOC_ORDER.map(id => ({ id, label: DOCS_LABELS[id] ?? id, estado: 'pendiente' }))
  try {
    const parsed = JSON.parse(raw)
    // ensure all 6 docs are present
    return DOC_ORDER.map(id => {
      const found = parsed.find((d: any) => d.id === id)
      return { id, label: DOCS_LABELS[id] ?? id, estado: found?.estado ?? 'pendiente' }
    })
  } catch {
    return DOC_ORDER.map(id => ({ id, label: DOCS_LABELS[id] ?? id, estado: 'pendiente' }))
  }
}

function DocChecklist({ docs }: { docs: { id: string; label: string; estado: string }[] }) {
  return (
    <div className="space-y-1.5">
      {docs.map(doc => (
        <div key={doc.id} className="flex items-center gap-2">
          <span className={doc.estado === 'ok' ? 'text-green-600 text-sm' : 'text-gray-300 text-sm'}>
            {doc.estado === 'ok' ? '✓' : '○'}
          </span>
          <span className={`text-sm ${doc.estado === 'ok' ? 'text-gray-700' : 'text-gray-400'}`}>
            {doc.label}
          </span>
        </div>
      ))}
    </div>
  )
}

function TransferenciaDetail({ t, clientes, vehicles }: { t: any; clientes: any[]; vehicles: any[] }) {
  const docs = parseDocs(t)
  const docsPend = docs.filter(d => d.estado !== 'ok')
  const docsOk = docs.filter(d => d.estado === 'ok')

  return (
    <div className="px-4 pb-5 pt-2 bg-gray-50 border-b border-gray-200">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-8 gap-y-3 mb-4">
        {t.ubicacion && (
          <div>
            <p className="text-xs text-gray-400">Ubicación</p>
            <p className="text-sm text-gray-700">{t.ubicacion}</p>
          </div>
        )}
        {t.registro && (
          <div>
            <p className="text-xs text-gray-400">Registro</p>
            <p className="text-sm text-gray-700">{t.registro}</p>
          </div>
        )}
        {t.medio_pago && (
          <div>
            <p className="text-xs text-gray-400">Medio de pago</p>
            <p className="text-sm text-gray-700">{t.medio_pago}</p>
          </div>
        )}
        {t.fecha_turno && (
          <div>
            <p className="text-xs text-gray-400">Turno</p>
            <p className="text-sm text-gray-700">
              {fmtFecha(t.fecha_turno)}{t.horario ? ` · ${t.horario}` : ''}
            </p>
          </div>
        )}
        <div>
          <p className="text-xs text-gray-400">Precarga</p>
          <p className="text-sm text-gray-700">{t.precarga ? 'Sí' : 'No'}</p>
        </div>
        {t.notas && (
          <div className="col-span-2 lg:col-span-4">
            <p className="text-xs text-gray-400">Notas</p>
            <p className="text-sm text-gray-600">{t.notas}</p>
          </div>
        )}
      </div>

      {/* Documentos */}
      <div className="border-t border-gray-200 pt-3">
        <p className="text-xs text-gray-400 uppercase tracking-wide mb-2">
          Documentos — {docsOk.length}/{docs.length} recibidos
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-1">
          {docs.map(doc => (
            <div key={doc.id} className="flex items-center gap-2 py-0.5">
              <span className={`text-sm font-medium ${doc.estado === 'ok' ? 'text-green-600' : 'text-gray-300'}`}>
                {doc.estado === 'ok' ? '✓' : '○'}
              </span>
              <span className={`text-sm ${doc.estado === 'ok' ? 'text-gray-700' : 'text-gray-500'}`}>
                {doc.label}
              </span>
            </div>
          ))}
        </div>
      </div>
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
  const [expanded, setExpanded] = useState<Set<number>>(new Set())
  const [filtro, setFiltro] = useState<'activas' | 'todas'>('activas')

  function toggle(id: number) {
    setExpanded(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const activas = transferencias.filter(t => t.estado !== 'completada' && t.estado !== 'cancelada')
  const completadas = transferencias.filter(t => t.estado === 'completada')
  const mostrar = filtro === 'activas' ? activas : transferencias

  return (
    <div className="space-y-8">
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

      <div className="border border-gray-200 rounded overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50 text-left">
              <th className="px-4 py-2 font-medium text-gray-500 text-xs">Auto</th>
              <th className="px-4 py-2 font-medium text-gray-500 text-xs">Comprador</th>
              <th className="px-4 py-2 font-medium text-gray-500 text-xs">Estado</th>
              <th className="px-4 py-2 font-medium text-gray-500 text-xs">Turno</th>
              <th className="px-4 py-2 font-medium text-gray-500 text-xs text-center">Docs</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {mostrar.map(t => {
              const isOpen = expanded.has(t.id)
              const docs = parseDocs(t)
              const pend = docs.filter(d => d.estado !== 'ok').length
              const allOk = pend === 0
              return (
                <Fragment key={t.id}>
                  <tr
                    onClick={() => toggle(t.id)}
                    className={`cursor-pointer transition-colors ${isOpen ? 'bg-gray-50' : 'hover:bg-gray-50'}`}
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <span className="text-gray-400 text-xs">{isOpen ? '▲' : '▼'}</span>
                        <span className="font-medium">{t.auto || '—'}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-600">{t.comprador_nombre || '—'}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${ESTADO_COLOR[t.estado] ?? 'bg-gray-100 text-gray-600'}`}>
                        {t.estado?.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-400 text-xs">
                      {t.fecha_turno ? fmtFecha(t.fecha_turno) : '—'}
                      {t.horario ? ` ${t.horario}` : ''}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {allOk
                        ? <span className="text-green-600 text-xs font-medium">✓ completo</span>
                        : <span className="text-orange-500 text-xs">{pend} pend.</span>
                      }
                    </td>
                  </tr>
                  {isOpen && (
                    <tr>
                      <td colSpan={5} className="p-0">
                        <TransferenciaDetail t={t} clientes={clientes} vehicles={vehicles} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              )
            })}
            {mostrar.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-gray-400">
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
