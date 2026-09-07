'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { postRecord } from '@/lib/kapso'
import { estadoMeta } from '@/lib/estados'
import { todayKey } from '@/lib/date'
import {
  validarAltaVehiculo, normalizarDominio, esErrorColumnaVersion, sinColumnaVersion,
  ESTADOS_VEHICULO, VEHICULO_FORM_VACIO, type AltaVehiculoForm,
} from '@/lib/alta'
import { Button } from '@/components/ui/button'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
  useDirtyClose,
} from '@/components/ui/dialog'
import { formSucio } from '@/lib/dirty'
import { FField, FInput, FSelect, nativeSelectCls } from '@/components/form-fields'
import { toast } from 'sonner'

/**
 * Alta de vehículo desde el dashboard.
 *
 * Vive en su propio archivo y no dentro de StockClient porque StockClient tiene
 * su propia copia local de FInput/FSelect (con otra firma que las compartidas):
 * meter el diálogo ahí obligaba a renombrar una de las dos.
 *
 * Escribe UNA fila: el vehículo (proxy /api/db/vehicles). El egreso de la
 * compra NO se asienta desde acá: Finanzas es solo consulta y la plata la carga
 * Claude por SQL sobre la base (ver PRODUCT.md).
 */

const TIPO_OPERACION_OPTIONS = [
  { value: 'propio', label: 'Propio (lo compra la agencia)' },
  { value: 'consignacion', label: 'Consignación (es de un cliente)' },
]

const ESTADO_OPTIONS = ESTADOS_VEHICULO.map(e => ({ value: e, label: estadoMeta(e).label }))

export default function NuevoAutoDialog({
  open, onOpenChange, clientes,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  clientes: any[]
}) {
  const router = useRouter()
  const [form, setForm] = useState<AltaVehiculoForm>(VEHICULO_FORM_VACIO)
  // Cómo quedó el form al ABRIRSE (con la fecha ya sembrada): contra esto se
  // decide si hay algo tipeado que se perdería al cerrar. Sembrar no es ensuciar.
  const [inicial, setInicial] = useState<AltaVehiculoForm>(VEHICULO_FORM_VACIO)
  const [saving, setSaving] = useState(false)

  // La fecha de hoy se calcula en el cliente (todayKey usa la hora LOCAL; en el
  // servidor, que corre en UTC, después de las 21:00 AR daría mañana).
  useEffect(() => {
    if (!open) return
    const sembrado = { ...VEHICULO_FORM_VACIO, fecha_ingreso: todayKey() }
    setForm(f => (f.fecha_ingreso ? f : sembrado))
    setInicial(f => (f.fecha_ingreso ? f : sembrado))
  }, [open])

  const set = (campo: keyof AltaVehiculoForm, valor: string) =>
    setForm(f => ({ ...f, [campo]: valor }))

  const esConsignacion = form.tipo_operacion === 'consignacion'

  function reset() {
    const sembrado = { ...VEHICULO_FORM_VACIO, fecha_ingreso: todayKey() }
    setForm(sembrado)
    setInicial(sembrado)
  }

  // Cerrar es cerrar: por el botón, por Escape o clickeando afuera, el form
  // vuelve a cero. Si no, el próximo "Nuevo auto" abre con lo tipeado antes.
  // Pero ANTES se pregunta si había algo cargado: doce campos tipeados no se
  // tiran por un roce fuera del modal (ver lib/dirty.ts).
  const sucio = formSucio(form, inicial)
  const { dialogProps, cerrar } = useDirtyClose({
    sucio,
    onOpenChange: o => { onOpenChange(o); if (!o) reset() },
  })

  async function crear() {
    const validado = validarAltaVehiculo(form, new Date().toISOString())
    if (!validado.ok) { toast.error(validado.error); return }

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

    if (versionPegada) {
      toast.success('Auto creado (la versión quedó dentro del modelo)')
    } else {
      toast.success('Auto creado')
    }

    setSaving(false)
    onOpenChange(false)
    reset()
    router.refresh()
  }

  return (
    <Dialog open={open} {...dialogProps}>
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

        <DialogFooter>
          <Button variant="outline" onClick={cerrar}>Cancelar</Button>
          <Button onClick={crear} disabled={saving}>{saving ? 'Creando…' : 'Crear auto'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
