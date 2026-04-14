'use client'
import { useState } from 'react'

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
  const [open, setOpen] = useState(false)
  const hasExtra = c.whatsapp || c.instagram || c.dni || c.cuil || c.direccion || c.notas

  return (
    <div className="border-b border-gray-100 last:border-0">
      <div
        onClick={() => hasExtra && setOpen(o => !o)}
        className={`flex items-center justify-between px-4 py-3 ${hasExtra ? 'cursor-pointer hover:bg-gray-50' : ''} transition-colors`}
      >
        <div className="flex items-center gap-2">
          {hasExtra && <span className="text-gray-300 text-xs">{open ? '▲' : '▼'}</span>}
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

      {open && (
        <div className="px-10 pb-4 pt-1 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-8 gap-y-3 bg-gray-50">
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
