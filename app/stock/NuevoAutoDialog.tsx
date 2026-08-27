'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { postRecord, capFirst, type CuentaInfo } from '@/lib/kapso'
import { estadoMeta } from '@/lib/estados'
import { todayKey } from '@/lib/date'
import {
  validarAltaVehiculo, ofreceRegistrarCompra, movimientoCompra,
  normalizarDominio, esErrorColumnaVersion, sinColumnaVersion,
  ESTADOS_VEHICULO, VEHICULO_FORM_VACIO, type AltaVehiculoForm,
} from '@/lib/alta'
import { Button } from '@/components/ui/button'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { FField, FInput, FSelect, FCheckbox, nativeSelectCls } from '@/components/form-fields'
import { toast } from 'sonner'

/**
 * Alta de vehículo desde el dashboard.
 *
 * Vive en su propio archivo y no dentro de StockClient porque StockClient tiene
 * su propia copia local de FInput/FSelect (con otra firma que las compartidas):
 * meter el diálogo ahí obligaba a renombrar una de las dos.
 *
 * Escribe hasta DOS filas: el vehículo (proxy /api/db/vehicles) y, si se tilda
 * el check, el egreso de la compra (/api/finanzas/movimiento, la única puerta
 * que setea afecta_balance=1). No hay transacción entre las dos, así que si la
 * segunda falla se dice EXACTAMENTE qué quedó hecho y qué no.
 */

const TIPO_OPERACION_OPTIONS = [
  { value: 'propio', label: 'Propio (lo compra la agencia)' },
  { value: 'consignacion', label: 'Consignación (es de un cliente)' },
]

const ESTADO_OPTIONS = ESTADOS_VEHICULO.map(e => ({ value: e, label: estadoMeta(e).label }))

export default function NuevoAutoDialog({
  open, onOpenChange, clientes, cuentas,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  clientes: any[]
  cuentas: CuentaInfo[]
}) {
  const router = useRouter()
  const [form, setForm] = useState<AltaVehiculoForm>(VEHICULO_FORM_VACIO)
  const [registrarCompra, setRegistrarCompra] = useState(true)
  const [cuenta, setCuenta] = useState(cuentas[0]?.clave ?? '')
  const [saving, setSaving] = useState(false)

  // La fecha de hoy se calcula en el cliente (todayKey usa la hora LOCAL; en el
  // servidor, que corre en UTC, después de las 21:00 AR daría mañana).
  useEffect(() => {
    if (open) setForm(f => (f.fecha_ingreso ? f : { ...f, fecha_ingreso: todayKey() }))
  }, [open])

  const set = (campo: keyof AltaVehiculoForm, valor: string) =>
    setForm(f => ({ ...f, [campo]: valor }))

  const esConsignacion = form.tipo_operacion === 'consignacion'
  const ofreceCompra = ofreceRegistrarCompra(form)

  function reset() {
    setForm({ ...VEHICULO_FORM_VACIO, fecha_ingreso: todayKey() })
    setRegistrarCompra(true)
    setCuenta(cuentas[0]?.clave ?? '')
  }

  // Cerrar es cerrar: por el botón, por Escape o clickeando afuera, el form
  // vuelve a cero. Si no, el próximo "Nuevo auto" abre con lo tipeado antes.
  function cerrar() { onOpenChange(false); reset() }

  async function crear() {
    const validado = validarAltaVehiculo(form, new Date().toISOString())
    if (!validado.ok) { toast.error(validado.error); return }
    if (ofreceCompra && registrarCompra && !cuenta) {
      toast.error('Elegí de qué cuenta sale la compra.')
      return
    }

    setSaving(true)
    let res = await postRecord('vehicles', validado.row)
    let versionPegada = false
    // Reintento único: la D1 de Renato puede no tener `vehicles.version`.
    if (!res.ok && validado.row.version && esErrorColumnaVersion(res.error)) {
      res = await postRecord('vehicles', sinColumnaVersion(validado.row))
      versionPegada = res.ok
    }
    if (!res.ok) {
      setSaving(false)
      toast.error(res.error || 'No se pudo crear el auto')
      return
    }

    const vehicleId = Number(res.data?.data?.id ?? res.data?.id)
    if (versionPegada) {
      toast.success('Auto creado (la versión quedó dentro del modelo)')
    } else {
      toast.success('Auto creado')
    }

    if (ofreceCompra && registrarCompra) {
      if (!Number.isInteger(vehicleId) || vehicleId <= 0) {
        // Sin id no hay a qué colgarle el egreso, y un movimiento de
        // vehicle_purchase sin auto lo rechaza la route igual.
        toast.error('El auto se creó, pero no se pudo leer su id: la compra en caja no se registró. Cargala desde Finanzas.')
      } else {
        const r = await fetch('/api/finanzas/movimiento', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(movimientoCompra(form, vehicleId, cuenta)),
        })
        const json = await r.json().catch(() => ({} as any))
        if (r.ok) {
          toast.success('Compra registrada en caja')
        } else {
          toast.error(
            `El auto se creó, la compra en caja no — cargala desde Finanzas. (${json.message || json.error || `Error ${r.status}`})`,
            { duration: 12000 },
          )
        }
      }
    }

    setSaving(false)
    onOpenChange(false)
    reset()
    router.refresh()
  }

  return (
    <Dialog open={open} onOpenChange={o => (o ? onOpenChange(true) : cerrar())}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nuevo auto</DialogTitle>
          <DialogDescription>
            Entra al stock igual que si lo hubiera cargado el bot. Después se completa
            desde la fila (papeles, fotos, precios).
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <FInput label="Marca *" value={form.marca} onChange={v => set('marca', v)} placeholder="Chevrolet" />
          <FInput label="Modelo *" value={form.modelo} onChange={v => set('modelo', v)} placeholder="Cruze" />
          <FInput
            label="Versión"
            value={form.version}
            onChange={v => set('version', v)}
            placeholder="LTZ"
            hint="Un LT no es un LTZ: si la sabés, cargala."
          />
          <FInput label="Año" type="number" min="0" step="1" value={form.año} onChange={v => set('año', v)} />
          <FInput label="KM" type="number" min="0" step="1" value={form.km} onChange={v => set('km', v)} />
          <FInput
            label="Dominio"
            value={form.dominio}
            onChange={v => set('dominio', normalizarDominio(v))}
            placeholder="AB123CD"
          />
          <FInput label="Color" value={form.color} onChange={v => set('color', v)} />
          <FSelect
            label="Estado"
            value={form.estado}
            onChange={v => set('estado', v)}
            options={ESTADO_OPTIONS}
          />

          <FSelect
            label="Tipo de operación *"
            value={form.tipo_operacion}
            onChange={v => set('tipo_operacion', v)}
            options={TIPO_OPERACION_OPTIONS}
            className="md:col-span-2"
          />
          {esConsignacion && (
            <FField
              label="Cliente dueño *"
              hint="Sin dueño el auto después no se puede liquidar."
              className="md:col-span-2"
            >
              <select
                value={form.cliente_id}
                onChange={e => set('cliente_id', e.target.value)}
                className={nativeSelectCls}
              >
                <option value="">—</option>
                {clientes.map((c: any) => (
                  <option key={c.id} value={c.id}>{c.nombre}</option>
                ))}
              </select>
            </FField>
          )}

          <FInput label="Precio compra (USD)" type="number" min="0" step="0.01" value={form.precio_compra} onChange={v => set('precio_compra', v)} />
          <FInput label="Precio publicado (USD)" type="number" min="0" step="0.01" value={form.precio_publicado} onChange={v => set('precio_publicado', v)} />
          <FInput label="Precio objetivo (USD)" type="number" min="0" step="0.01" value={form.precio_venta_objetivo} onChange={v => set('precio_venta_objetivo', v)} />
          <FInput label="Fecha de ingreso" type="date" value={form.fecha_ingreso} onChange={v => set('fecha_ingreso', v)} />
        </div>

        {ofreceCompra && (
          <div className="rounded-lg border border-border p-3 space-y-3">
            <FCheckbox
              id="registrar-compra"
              label="Registrar la compra en caja"
              checked={registrarCompra}
              onChange={setRegistrarCompra}
              hint="Asienta el egreso en el ledger, con el auto vinculado, para que el costo del vehículo sea real."
            />
            {registrarCompra && (
              <FSelect
                label="Sale de"
                value={cuenta}
                onChange={setCuenta}
                options={cuentas.map(c => ({ value: c.clave, label: capFirst(c.label) }))}
              />
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={cerrar}>Cancelar</Button>
          <Button onClick={crear} disabled={saving}>{saving ? 'Creando…' : 'Crear auto'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
