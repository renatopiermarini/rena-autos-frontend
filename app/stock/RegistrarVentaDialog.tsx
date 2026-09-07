'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { computeLiquidacionConsignacion } from '@/lib/kapso'
import { todayKey } from '@/lib/date'
import {
  planVenta, comisionVenta, autoLabelVenta, VENTA_FORM_VACIO, type VentaForm,
} from '@/lib/venta'
import { Button } from '@/components/ui/button'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
  useDirtyClose,
} from '@/components/ui/dialog'
import { formSucio } from '@/lib/dirty'
import { FField, FInput, FCheckbox, nativeSelectCls } from '@/components/form-fields'
import { toast } from 'sonner'
import { CopyIcon } from 'lucide-react'
import { money } from '@/lib/money'
import { copiarTexto } from '@/lib/clipboard'

/**
 * Registrar la venta de un auto desde su ficha en /stock.
 *
 * Escribe UNA fila: el PATCH del vehículo (estado=vendido + precio + comprador
 * + fecha). La plata NO se asienta desde acá: Finanzas es solo consulta y los
 * movimientos los carga Claude por SQL. Lo que el diálogo hace con la caja es
 * MOSTRAR el desglose ("Para registrar con Claude") y dejarlo copiar.
 *
 * La regla de plata (propio = precio entero, consignación = sólo la comisión)
 * vive en lib/venta.ts, que es lo que testean los tests. En una consignación el
 * usuario tiene que ver que a la caja entran $X y no los $Y que le pagó el
 * comprador.
 */

export default function RegistrarVentaDialog({
  open, onOpenChange, vehiculo, vehicles, movimientos, clientes, comisionPct,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  vehiculo: any
  vehicles: any[]
  movimientos: any[]
  clientes: any[]
  comisionPct: number
}) {
  const router = useRouter()
  const [form, setForm] = useState<VentaForm>(VENTA_FORM_VACIO)
  // El form tal cual quedó sembrado al abrir: es la referencia para saber si hay
  // algo tipeado que se perdería al cerrar (ver lib/dirty.ts).
  const [inicial, setInicial] = useState<VentaForm>(VENTA_FORM_VACIO)
  const [saving, setSaving] = useState(false)

  const esConsignacion = String(vehiculo?.tipo_operacion ?? '') === 'consignacion'
  // Los gastos adelantados salen de la MISMA liquidación que usa Finanzas
  // (client_expense del auto): no se recalculan acá. Sólo aplica a una
  // consignación — un auto propio no tiene dueño a quien reintegrarle nada.
  const gastosAdelantados = esConsignacion
    ? computeLiquidacionConsignacion(Number(vehiculo?.id), vehicles, movimientos, comisionPct).gastos_adelantados
    : 0

  // todayKey() usa la hora LOCAL: en el servidor (UTC) después de las 21:00 AR
  // daría mañana, así que la fecha se siembra en el cliente al abrir.
  useEffect(() => {
    if (!open) return
    const sembrado: VentaForm = {
      ...VENTA_FORM_VACIO,
      fecha_venta: todayKey(),
      // Si el auto ya tenía un precio de venta cargado se respeta; el publicado
      // NO se usa de default: es lo que se pedía, no lo que se cobró.
      precio_venta_final: vehiculo?.precio_venta_final ? String(vehiculo.precio_venta_final) : '',
      comprador_id: vehiculo?.comprador_id ? String(vehiculo.comprador_id) : '',
    }
    setForm(sembrado)
    setInicial(sembrado)
  }, [open, vehiculo?.id])

  const set = (campo: keyof VentaForm, valor: string | boolean) =>
    setForm(f => ({ ...f, [campo]: valor }) as VentaForm)

  // Desglose en vivo (no valida: sólo muestra). Si el precio todavía no es un
  // número usable, no hay nada que desglosar.
  const precioNum = Number((form.precio_venta_final ?? '').trim())
  const precioOk = Number.isFinite(precioNum) && precioNum > 0
  const comision = precioOk ? comisionVenta(precioNum, comisionPct) : 0
  const restoDueno = precioOk ? Math.round((precioNum - comision) * 100) / 100 : 0

  // El texto para Claude sale del MISMO plan que se va a confirmar: no hay una
  // segunda regla de plata acá. Sin precio usable no hay plan (y no hay texto).
  const planActual = planVenta(form, vehiculo, {
    comisionPct,
    gastosAdelantados,
    nowIso: '',
  })
  const paraClaude = planActual.ok ? planActual.paraClaude : null

  async function copiar() {
    if (!paraClaude) return
    if (await copiarTexto(paraClaude)) toast.success('Copiado — pegalo en Claude')
    else toast.error('No se pudo copiar: seleccioná el texto y copialo a mano.')
  }

  const { dialogProps, cerrar } = useDirtyClose({
    sucio: formSucio(form, inicial),
    onOpenChange,
  })

  async function confirmar() {
    const r = planVenta(form, vehiculo, {
      comisionPct,
      gastosAdelantados,
      nowIso: new Date().toISOString(),
    })
    if (!r.ok) { toast.error(r.error); return }

    setSaving(true)
    const patch = await fetch(`/api/db/vehicles?id=${vehiculo.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(r.patch),
    })
    setSaving(false)
    if (!patch.ok) {
      const json = await patch.json().catch(() => ({} as any))
      toast.error(json.message || json.error || 'No se pudo marcar el auto como vendido')
      return
    }
    toast.success('Auto marcado como vendido — la plata se registra con Claude')
    onOpenChange(false)
    router.refresh()
  }

  return (
    <Dialog open={open} {...dialogProps}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Registrar venta</DialogTitle>
          <DialogDescription>
            {autoLabelVenta(vehiculo)} — marca el auto como vendido. La plata no se asienta
            desde acá: se registra con Claude.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <FInput
            label="Precio de venta (USD) *"
            type="number" min="0" step="0.01"
            value={form.precio_venta_final}
            onChange={v => set('precio_venta_final', v)}
            hint={esConsignacion ? 'Lo que pagó el comprador, no la comisión.' : undefined}
          />
          <FInput
            label="Fecha de venta"
            type="date"
            value={form.fecha_venta}
            onChange={v => set('fecha_venta', v)}
          />
          <FField label="Comprador" hint="Opcional: queda vinculado a la ficha del auto.">
            <select
              value={form.comprador_id}
              onChange={e => set('comprador_id', e.target.value)}
              className={nativeSelectCls}
            >
              <option value="">—</option>
              {clientes.map((c: any) => (
                <option key={c.id} value={c.id}>{c.nombre}</option>
              ))}
            </select>
          </FField>
        </div>

        {esConsignacion && (
          <div className="rounded-lg border border-border p-3 space-y-3">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">
              Consignación — la plata no es de la agencia
            </p>
            {precioOk ? (
              <p className="text-sm">
                Comisión {comisionPct}% = <span className="font-medium">{money(comision)}</span>;
                los {money(restoDueno)} restantes son del dueño
                {vehiculo?.cliente_id
                  ? ` (${clientes.find((c: any) => c.id === vehiculo.cliente_id)?.nombre ?? `cliente #${vehiculo.cliente_id}`})`
                  : ''}
                . A la caja entra <span className="font-medium">sólo la comisión</span>.
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">
                Cargá el precio de venta para ver la comisión.
              </p>
            )}
            {gastosAdelantados > 0 && (
              <FCheckbox
                id="cobrar-gastos"
                label={`También cobrar gastos adelantados (${money(gastosAdelantados)})`}
                checked={form.cobrar_gastos}
                onChange={v => set('cobrar_gastos', v)}
                hint="Segundo ingreso, a cuenta del dueño: descuenta lo que la agencia puso por él."
              />
            )}
          </div>
        )}

        <div className="rounded-lg border border-border p-3 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <p className="text-2xs uppercase tracking-wide text-muted-foreground">
              Para registrar con Claude
            </p>
            <Button size="xs" variant="outline" onClick={copiar} disabled={!paraClaude}>
              <CopyIcon /> Copiar
            </Button>
          </div>
          {paraClaude ? (
            <pre className="whitespace-pre-wrap font-mono text-xs text-foreground">{paraClaude}</pre>
          ) : (
            <p className="text-sm text-muted-foreground">
              Cargá el precio de venta para ver qué hay que asentar.
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={cerrar} disabled={saving}>Cancelar</Button>
          <Button onClick={confirmar} disabled={saving}>
            {saving ? 'Registrando…' : 'Registrar venta'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
