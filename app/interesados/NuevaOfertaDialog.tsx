'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { postRecord } from '@/lib/kapso'
import {
  validarAltaOferta, ESTADOS_OFERTA, OFERTA_FORM_VACIO, type AltaOfertaForm,
} from '@/lib/alta'
import { Button } from '@/components/ui/button'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
  useDirtyClose,
} from '@/components/ui/dialog'
import { formSucio } from '@/lib/dirty'
import { FField, FInput, FSelect, FTextarea, nativeSelectCls } from '@/components/form-fields'
import { toast } from 'sonner'

/**
 * Registrar una oferta desde la ficha de un interesado.
 *
 * Una sola fila (`ofertas`, ya en el ALLOWED del proxy) y ningún movimiento de
 * caja: una oferta es una intención, no plata que entró. La seña sí es plata y
 * va por Finanzas (categoría down_payment) — no se dispara desde acá.
 *
 * El interesado NO se elige: es el dueño de la fila desde la que se abre el
 * diálogo. Los estados son los de ENUMS.ofertas del proxy.
 */

const ESTADO_OPTIONS = ESTADOS_OFERTA.map(e => ({ value: e, label: e }))

export default function NuevaOfertaDialog({
  open, onOpenChange, interesado, vehicles,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  interesado: any
  vehicles: any[]
}) {
  const router = useRouter()
  const [form, setForm] = useState<AltaOfertaForm>(OFERTA_FORM_VACIO)
  // El form tal cual quedó sembrado al abrir (ver lib/dirty.ts).
  const [inicial, setInicial] = useState<AltaOfertaForm>(OFERTA_FORM_VACIO)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    const sembrado: AltaOfertaForm = {
      ...OFERTA_FORM_VACIO,
      // El auto que ya venía mirando el interesado, si tiene uno.
      vehicle_id: interesado?.vehicle_id ? String(interesado.vehicle_id) : '',
    }
    setForm(sembrado)
    setInicial(sembrado)
  }, [open, interesado?.id])

  const set = (campo: keyof AltaOfertaForm, valor: string) =>
    setForm(f => ({ ...f, [campo]: valor }))

  const { dialogProps, cerrar } = useDirtyClose({
    sucio: formSucio(form, inicial),
    onOpenChange,
  })

  async function crear() {
    const validado = validarAltaOferta(form, interesado?.id, new Date().toISOString())
    if (!validado.ok) { toast.error(validado.error); return }
    setSaving(true)
    const res = await postRecord('ofertas', validado.row)
    setSaving(false)
    if (!res.ok) {
      toast.error(res.error || 'No se pudo registrar la oferta')
      return
    }
    toast.success('Oferta registrada')
    onOpenChange(false)
    router.refresh()
  }

  // Los vendidos no se ofertan; el que ya venía vinculado se deja igual para no
  // esconder el auto de una oferta que se está cargando tarde.
  const opciones = vehicles.filter(
    v => v.estado !== 'vendido' || String(v.id) === form.vehicle_id,
  )

  return (
    <Dialog open={open} {...dialogProps}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Registrar oferta</DialogTitle>
          <DialogDescription>
            De {interesado?.nombre ?? 'este interesado'}. Queda en su ficha; no toca la caja.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <FField label="Auto *" className="sm:col-span-2">
            <select
              value={form.vehicle_id}
              onChange={e => set('vehicle_id', e.target.value)}
              className={nativeSelectCls}
            >
              <option value="">—</option>
              {opciones.map((v: any) => (
                <option key={v.id} value={v.id}>
                  {[v.marca, v.modelo, v.año].filter(Boolean).join(' ')}
                  {v.dominio ? ` (${v.dominio})` : ''}
                </option>
              ))}
            </select>
          </FField>
          <FInput
            label="Monto ofrecido (USD) *"
            type="number" min="0" step="0.01"
            value={form.monto_ofrecido}
            onChange={v => set('monto_ofrecido', v)}
          />
          <FSelect
            label="Estado"
            value={form.estado}
            onChange={v => set('estado', v)}
            options={ESTADO_OPTIONS}
          />
          {form.estado === 'aceptada' && (
            <FInput
              label="Monto aceptado (USD)"
              type="number" min="0" step="0.01"
              value={form.monto_aceptado}
              onChange={v => set('monto_aceptado', v)}
              className="sm:col-span-2"
              hint="Si se cerró por otro número que el ofrecido."
            />
          )}
          <FTextarea
            label="Notas"
            value={form.notas}
            onChange={v => set('notas', v)}
            className="sm:col-span-2"
            rows={2}
          />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={cerrar} disabled={saving}>Cancelar</Button>
          <Button onClick={crear} disabled={saving}>
            {saving ? 'Registrando…' : 'Registrar oferta'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
