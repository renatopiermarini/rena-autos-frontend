'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { postRecord } from '@/lib/kapso'
import {
  validarAltaCliente, TIPOS_CLIENTE, CLIENTE_FORM_VACIO, type AltaClienteForm,
} from '@/lib/alta'
import { aplicarSugerencia, limpiarSugerencias, marcarTocado, type CamposIa } from '@/lib/ia'
import { aplicarSugerenciaConDefaults, sugerenciaCliente, type ClienteExtraido } from '@/lib/ia-formularios'
import { Button } from '@/components/ui/button'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
  useDirtyClose,
} from '@/components/ui/dialog'
import { formSucio } from '@/lib/dirty'
import { FInput, FSelect, FTextarea } from '@/components/form-fields'
import { IaDropzone } from '@/components/ia-dropzone'
import { IaSugerenciasBar } from '@/components/ia-hint'
import { toast } from 'sonner'

/**
 * Alta de cliente desde el dashboard. La pantalla ya sabía EDITAR filas pero no
 * crearlas: en la instancia de Renato los clientes los da de alta el bot por
 * WhatsApp, en la instancia nueva no hay bot y no había otra puerta.
 *
 * El alta con tipo='acreedor' escribe además es_acreedor=1 — ver la nota de
 * esAcreedor() en app/config/inversores/InversoresClient.tsx.
 *
 * IA: con backend, arriba del form hay un dropzone para el DNI (frente y
 * dorso) que pre-llena nombre, DNI, CUIL, fecha de nacimiento y dirección —
 * los campos que los contratos reclaman. `inicial` es la otra puerta: Nuevo
 * auto lo abre con el titular de la cédula ya cargado, y `onCreado` le
 * devuelve la fila para que lo seleccione como dueño.
 */

const TIPO_OPTIONS = TIPOS_CLIENTE.map(t => ({
  value: t,
  label: { comprador: 'Comprador', vendedor: 'Vendedor', acreedor: 'Acreedor (inversor)' }[t],
}))

// Los selects que arrancan con un valor: para la IA cuentan como vacíos.
const DEFAULTS: Partial<AltaClienteForm> = { tipo: CLIENTE_FORM_VACIO.tipo }

export default function NuevoClienteDialog({
  open, onOpenChange, ia = false, inicial, onCreado,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  /** ¿La instancia tiene backend? Sin él, el bloque de IA no existe. */
  ia?: boolean
  /** Valores con los que abrir (el titular de una cédula): se marcan como sugeridos. */
  inicial?: Partial<AltaClienteForm>
  /** La fila creada, para que el que abrió el diálogo la use (elegirla como dueño). */
  onCreado?: (cliente: any) => void
}) {
  const router = useRouter()
  const [form, setForm] = useState<AltaClienteForm>(CLIENTE_FORM_VACIO)
  const [camposIa, setCamposIa] = useState<CamposIa<AltaClienteForm>>(new Set())
  const [saving, setSaving] = useState(false)
  // La respuesta de la IA llega segundos después de soltar el archivo: se
  // aplica sobre el form de ESE momento (lo que se tipeó mientras tanto no se pisa).
  const formRef = useRef(form)
  formRef.current = form

  // Al abrir con `inicial`, se siembra como sugerencia: borde info + chip, y
  // el guard de cierre lo cuenta como "hay datos" (inicial del guard = vacío).
  useEffect(() => {
    if (!open || !inicial) return
    const r = aplicarSugerenciaConDefaults(CLIENTE_FORM_VACIO, inicial, DEFAULTS)
    setForm(r.form)
    setCamposIa(r.camposIa)
  }, [open, inicial])

  const set = (campo: keyof AltaClienteForm, valor: string) => {
    setForm(f => ({ ...f, [campo]: valor }))
    setCamposIa(c => marcarTocado(c, campo))
  }

  function reset() {
    setForm(CLIENTE_FORM_VACIO)
    setCamposIa(new Set())
  }

  // Cerrar es cerrar, por el botón o por Escape: el form vuelve a cero — pero
  // antes se pregunta si había algo tipeado (ver lib/dirty.ts).
  const { dialogProps, cerrar } = useDirtyClose({
    sucio: formSucio(form, CLIENTE_FORM_VACIO),
    onOpenChange: o => { onOpenChange(o); if (!o) reset() },
  })

  const onDni = useCallback((data: ClienteExtraido) => {
    const r = aplicarSugerencia(formRef.current, sugerenciaCliente(data))
    setForm(r.form)
    setCamposIa(c => new Set([...Array.from(c), ...Array.from(r.camposIa)]))
    if (r.camposIa.size === 0) toast.info('El DNI no trajo nada nuevo: los campos ya estaban cargados.')
  }, [])

  function limpiar() {
    const r = limpiarSugerencias(form, camposIa, CLIENTE_FORM_VACIO)
    setForm(r.form)
    setCamposIa(r.camposIa)
  }

  async function crear() {
    const validado = validarAltaCliente(form, new Date().toISOString())
    if (!validado.ok) { toast.error(validado.error); return }

    setSaving(true)
    const res = await postRecord('clientes', validado.row)
    setSaving(false)
    if (!res.ok) {
      toast.error(res.error || 'No se pudo crear el cliente')
      return
    }
    toast.success('Cliente creado')
    // El proxy devuelve { data: fila } (app/api/db/[table]/route.ts writeResponse).
    const fila = res.data?.data ?? res.data
    onCreado?.(fila)
    onOpenChange(false)
    reset()
    router.refresh()
  }

  const esIa = (campo: keyof AltaClienteForm) => camposIa.has(campo)

  return (
    <Dialog open={open} {...dialogProps}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nuevo cliente</DialogTitle>
          <DialogDescription>
            El mismo registro que usan las consignaciones y los préstamos.
          </DialogDescription>
        </DialogHeader>

        {ia && (
          <IaDropzone<ClienteExtraido>
            accion="cliente-desde-dni"
            campos={['frente', 'dorso']}
            label="DNI: frente y dorso"
            hint="Soltá una o dos fotos (primero el frente) · JPG, PNG, WebP o PDF · hasta 10 MB · también Ctrl+V"
            onResultado={onDni}
            disabled={saving}
          />
        )}
        <IaSugerenciasBar cantidad={camposIa.size} onLimpiar={limpiar} />

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <FInput label="Nombre *" value={form.nombre} onChange={v => set('nombre', v)} ia={esIa('nombre')} />
          <FSelect
            label="Tipo"
            value={form.tipo}
            onChange={v => set('tipo', v)}
            options={TIPO_OPTIONS}
            ia={esIa('tipo')}
            hint={form.tipo === 'acreedor' ? 'Queda marcado como acreedor y aparece en Inversores.' : undefined}
          />
          <FInput label="Teléfono" value={form.telefono} onChange={v => set('telefono', v)} type="tel" />
          <FInput label="WhatsApp" value={form.whatsapp} onChange={v => set('whatsapp', v)} type="tel" />
          <FInput label="Email" value={form.email} onChange={v => set('email', v)} type="email" />
          <FInput label="DNI" value={form.dni} onChange={v => set('dni', v)} ia={esIa('dni')} />
          <FInput label="CUIL" value={form.cuil} onChange={v => set('cuil', v)} ia={esIa('cuil')} />
          <FInput
            label="Fecha de nacimiento"
            value={form.fecha_nacimiento}
            onChange={v => set('fecha_nacimiento', v)}
            placeholder="DD/MM/AAAA"
            ia={esIa('fecha_nacimiento')}
          />
          <FInput
            label="Dirección"
            value={form.direccion}
            onChange={v => set('direccion', v)}
            className="md:col-span-2"
            ia={esIa('direccion')}
          />
          <FTextarea
            label="Notas"
            value={form.notas}
            onChange={v => set('notas', v)}
            rows={2}
            className="md:col-span-2"
          />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={cerrar}>Cancelar</Button>
          <Button onClick={crear} disabled={saving}>{saving ? 'Creando…' : 'Crear cliente'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
