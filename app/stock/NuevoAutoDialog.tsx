'use client'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { postRecord } from '@/lib/kapso'
import { estadoMeta } from '@/lib/estados'
import { todayKey } from '@/lib/date'
import {
  validarAltaVehiculo, normalizarDominio, esErrorColumnaVersion, sinColumnaVersion,
  ESTADOS_VEHICULO, VEHICULO_FORM_VACIO, type AltaVehiculoForm, type AltaClienteForm,
} from '@/lib/alta'
import { aplicarSugerencia, limpiarSugerencias, marcarTocado, type CamposIa } from '@/lib/ia'
import {
  aplicarSugerenciaConDefaults, sugerenciaVehiculo, titularDe,
  type TitularExtraido, type VehiculoExtraido,
} from '@/lib/ia-formularios'
import { Button } from '@/components/ui/button'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
  useDirtyClose,
} from '@/components/ui/dialog'
import { formSucio } from '@/lib/dirty'
import { FField, FInput, FSelect, nativeSelectCls } from '@/components/form-fields'
import { IaDropzone } from '@/components/ia-dropzone'
import { IaChip, IaSugerenciasBar } from '@/components/ia-hint'
import NuevoClienteDialog from '@/app/clientes/NuevoClienteDialog'
import { UserPlusIcon } from 'lucide-react'
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
 *
 * IA: con backend, arriba del form hay un dropzone para la tarjeta verde /
 * cédula. Pre-llena marca, modelo, año, dominio, color, motor y chasis; si la
 * cédula trae un titular, sugiere "consignación" y ofrece crear ese titular
 * como cliente dueño (NuevoClienteDialog pre-llenado) y elegirlo. Todo queda
 * marcado como sugerido hasta que alguien lo toca (lib/ia.ts).
 */

const TIPO_OPERACION_OPTIONS = [
  { value: 'propio', label: 'Propio (lo compra la agencia)' },
  { value: 'consignacion', label: 'Consignación (es de un cliente)' },
]

const ESTADO_OPTIONS = ESTADOS_VEHICULO.map(e => ({ value: e, label: estadoMeta(e).label }))

// Los selects que arrancan con un valor: para la IA cuentan como vacíos.
const DEFAULTS: Partial<AltaVehiculoForm> = { tipo_operacion: VEHICULO_FORM_VACIO.tipo_operacion }

export default function NuevoAutoDialog({
  open, onOpenChange, clientes, ia = false,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  clientes: any[]
  /** ¿La instancia tiene backend? Sin él, el bloque de IA no existe. */
  ia?: boolean
}) {
  const router = useRouter()
  const [form, setForm] = useState<AltaVehiculoForm>(VEHICULO_FORM_VACIO)
  // Cómo quedó el form al ABRIRSE (con la fecha ya sembrada): contra esto se
  // decide si hay algo tipeado que se perdería al cerrar. Sembrar la fecha no
  // es ensuciar; lo que siembra la IA SÍ (son datos que se perderían).
  const [inicial, setInicial] = useState<AltaVehiculoForm>(VEHICULO_FORM_VACIO)
  const [camposIa, setCamposIa] = useState<CamposIa<AltaVehiculoForm>>(new Set())
  const [titular, setTitular] = useState<TitularExtraido | null>(null)
  const [showCliente, setShowCliente] = useState(false)
  // Clientes creados desde acá: el select los necesita antes del router.refresh().
  const [clientesNuevos, setClientesNuevos] = useState<any[]>([])
  const [saving, setSaving] = useState(false)
  // La respuesta de la IA llega segundos después de soltar el archivo: se
  // aplica sobre el form de ESE momento (lo que se tipeó mientras tanto no se pisa).
  const formRef = useRef(form)
  formRef.current = form

  // La fecha de hoy se calcula en el cliente (todayKey usa la hora LOCAL; en el
  // servidor, que corre en UTC, después de las 21:00 AR daría mañana).
  useEffect(() => {
    if (!open) return
    const sembrado = { ...VEHICULO_FORM_VACIO, fecha_ingreso: todayKey() }
    setForm(f => (f.fecha_ingreso ? f : sembrado))
    setInicial(f => (f.fecha_ingreso ? f : sembrado))
  }, [open])

  const set = (campo: keyof AltaVehiculoForm, valor: string) => {
    setForm(f => ({ ...f, [campo]: valor }))
    setCamposIa(c => marcarTocado(c, campo))
  }

  const esConsignacion = form.tipo_operacion === 'consignacion'
  const esIa = (campo: keyof AltaVehiculoForm) => camposIa.has(campo)

  function reset() {
    const sembrado = { ...VEHICULO_FORM_VACIO, fecha_ingreso: todayKey() }
    setForm(sembrado)
    setInicial(sembrado)
    setCamposIa(new Set())
    setTitular(null)
    setClientesNuevos([])
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

  const onTarjeta = useCallback((data: VehiculoExtraido) => {
    let r = aplicarSugerencia(formRef.current, sugerenciaVehiculo(data))
    let campos = r.camposIa
    const t = titularDe(data)
    if (t) {
      // Un titular en la cédula = casi seguro consignación. Sólo si el select
      // sigue en su default: si el usuario ya eligió, se respeta.
      const r2 = aplicarSugerenciaConDefaults(r.form, { tipo_operacion: 'consignacion' }, DEFAULTS)
      r = r2
      campos = new Set([...Array.from(campos), ...Array.from(r2.camposIa)])
    }
    setTitular(t)
    setForm(r.form)
    setCamposIa(c => new Set([...Array.from(c), ...Array.from(campos)]))
    if (campos.size === 0) toast.info('La cédula no trajo nada nuevo: los campos ya estaban cargados.')
  }, [])

  function limpiar() {
    const r = limpiarSugerencias(form, camposIa, inicial)
    setForm(r.form)
    setCamposIa(r.camposIa)
    setTitular(null)
  }

  // `inicial` del diálogo de cliente: memoizado, si no su useEffect lo
  // re-sembraría en cada render de este padre.
  const clienteInicial = useMemo<Partial<AltaClienteForm> | undefined>(
    () => titular
      ? { nombre: titular.nombre, dni: titular.dni, cuil: titular.cuil, direccion: titular.direccion, tipo: 'vendedor' }
      : undefined,
    [titular],
  )

  function onClienteCreado(c: any) {
    if (!c || c.id == null) return
    setClientesNuevos(x => [...x, c])
    setForm(f => ({ ...f, cliente_id: String(c.id) }))
    setCamposIa(x => marcarTocado(x, 'cliente_id'))
  }

  const listaClientes = clientesNuevos.length
    ? [...clientesNuevos, ...clientes.filter((c: any) => !clientesNuevos.some(n => n.id === c.id))]
    : clientes
  const duenoElegido = listaClientes.find((c: any) => String(c.id) === form.cliente_id)

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

        {ia && (
          <IaDropzone<VehiculoExtraido>
            accion="vehiculo-desde-documento"
            label="Tarjeta verde o cédula"
            hint="Soltá la foto o el PDF y la IA llena marca, modelo, año, dominio, motor y chasis · hasta 10 MB · también Ctrl+V"
            onResultado={onTarjeta}
            disabled={saving}
          />
        )}
        <IaSugerenciasBar cantidad={camposIa.size} onLimpiar={limpiar} />

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <FInput label="Marca *" value={form.marca} onChange={v => set('marca', v)} placeholder="Chevrolet" ia={esIa('marca')} />
          <FInput label="Modelo *" value={form.modelo} onChange={v => set('modelo', v)} placeholder="Cruze" ia={esIa('modelo')} />
          <FInput
            label="Versión"
            value={form.version}
            onChange={v => set('version', v)}
            placeholder="LTZ"
            hint="Un LT no es un LTZ: si la sabés, cargala."
            ia={esIa('version')}
          />
          <FInput label="Año" type="number" min="0" step="1" value={form.año} onChange={v => set('año', v)} ia={esIa('año')} />
          <FInput label="KM" type="number" min="0" step="1" value={form.km} onChange={v => set('km', v)} />
          <FInput
            label="Dominio"
            value={form.dominio}
            onChange={v => set('dominio', normalizarDominio(v))}
            placeholder="AB123CD"
            ia={esIa('dominio')}
          />
          <FInput label="Color" value={form.color} onChange={v => set('color', v)} ia={esIa('color')} />
          <FSelect
            label="Estado"
            value={form.estado}
            onChange={v => set('estado', v)}
            options={ESTADO_OPTIONS}
          />
          <FInput label="N° motor" value={form.numero_motor} onChange={v => set('numero_motor', v)} ia={esIa('numero_motor')} />
          <FInput label="N° chasis" value={form.numero_chasis} onChange={v => set('numero_chasis', v)} ia={esIa('numero_chasis')} />

          <FSelect
            label="Tipo de operación *"
            value={form.tipo_operacion}
            onChange={v => set('tipo_operacion', v)}
            options={TIPO_OPERACION_OPTIONS}
            className="md:col-span-2"
            ia={esIa('tipo_operacion')}
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
                {listaClientes.map((c: any) => (
                  <option key={c.id} value={c.id}>{c.nombre}</option>
                ))}
              </select>
            </FField>
          )}
          {titular && (
            <div className="md:col-span-2 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-info/30 bg-info/10 px-3 py-2 text-sm">
              <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
                <IaChip />
                <span>
                  <span className="text-muted-foreground">Titular: </span>
                  <span className="font-medium">{titular.nombre}</span>
                  {titular.dni && <span className="text-muted-foreground"> · DNI {titular.dni}</span>}
                </span>
              </span>
              {duenoElegido ? (
                <span className="text-xs text-success">Elegido como dueño: {duenoElegido.nombre}</span>
              ) : (
                <Button type="button" size="xs" variant="outline" onClick={() => setShowCliente(true)}>
                  <UserPlusIcon /> Crear cliente dueño
                </Button>
              )}
            </div>
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

        <NuevoClienteDialog
          open={showCliente}
          onOpenChange={setShowCliente}
          ia={ia}
          inicial={clienteInicial}
          onCreado={onClienteCreado}
        />
      </DialogContent>
    </Dialog>
  )
}
