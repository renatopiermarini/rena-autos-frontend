'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { capFirst, computeLiquidacionConsignacion, type CuentaInfo } from '@/lib/kapso'
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
import { FField, FInput, FSelect, FCheckbox, nativeSelectCls } from '@/components/form-fields'
import { toast } from 'sonner'

/**
 * Registrar la venta de un auto desde su ficha en /stock.
 *
 * Escribe hasta TRES filas y ninguna transacción las envuelve: el PATCH del
 * vehículo (estado=vendido + precio + comprador) y uno o dos movimientos por
 * /api/finanzas/movimiento (la única puerta que setea afecta_balance=1). Si el
 * ledger falla después de que el auto quedó vendido se dice EXACTAMENTE qué
 * quedó hecho y qué no — mismo criterio que NuevoAutoDialog.
 *
 * La regla de plata (propio = precio entero, consignación = sólo la comisión)
 * vive en lib/venta.ts, que es lo que testean los tests. Acá sólo se muestra el
 * desglose ANTES de confirmar: en una consignación el usuario tiene que ver que
 * a la caja entran $X y no los $Y que le pagó el comprador.
 */

function money(n: number): string {
  return `$${Number(n).toLocaleString('es-AR', { maximumFractionDigits: 2 })}`
}

export default function RegistrarVentaDialog({
  open, onOpenChange, vehiculo, vehicles, movimientos, clientes, cuentas, comisionPct,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  vehiculo: any
  vehicles: any[]
  movimientos: any[]
  clientes: any[]
  cuentas: CuentaInfo[]
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
      cuenta: cuentas[0]?.clave ?? '',
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
    if (!patch.ok) {
      const json = await patch.json().catch(() => ({} as any))
      setSaving(false)
      // Nada quedó escrito: el ledger ni se tocó.
      toast.error(json.message || json.error || 'No se pudo marcar el auto como vendido')
      return
    }
    toast.success('Auto marcado como vendido')

    // Los movimientos van de a uno y en orden (comisión primero, reintegro
    // después): si el segundo falla el primero ya está y hay que decirlo.
    const hechos: string[] = []
    for (const mov of r.movimientos) {
      const etiqueta = mov.categoria === 'commission'
        ? 'la comisión'
        : mov.categoria === 'client_repayment'
          ? 'el reintegro de gastos'
          : 'el ingreso de la venta'
      const res = await fetch('/api/finanzas/movimiento', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(mov),
      })
      if (res.ok) { hechos.push(etiqueta); continue }
      const json = await res.json().catch(() => ({} as any))
      const yaHecho = hechos.length > 0 ? ` (${hechos.join(' y ')} sí)` : ''
      toast.error(
        `La venta quedó marcada, ${etiqueta} no${yaHecho} — cargalo desde Finanzas. ` +
        `(${json.message || json.error || `Error ${res.status}`})`,
        { duration: 12000 },
      )
      setSaving(false)
      onOpenChange(false)
      router.refresh()
      return
    }
    if (hechos.length > 0) {
      toast.success(`Entró a caja ${hechos.join(' y ')}`)
    }

    setSaving(false)
    onOpenChange(false)
    router.refresh()
  }

  return (
    <Dialog open={open} {...dialogProps}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Registrar venta</DialogTitle>
          <DialogDescription>
            {autoLabelVenta(vehiculo)} — marca el auto como vendido y asienta lo que entra a la
            caja.
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
          <FSelect
            label="Entra a *"
            value={form.cuenta}
            onChange={v => set('cuenta', v)}
            options={cuentas.map(c => ({ value: c.clave, label: capFirst(c.label) }))}
          />
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
