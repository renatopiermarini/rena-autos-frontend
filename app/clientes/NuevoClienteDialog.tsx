'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { postRecord } from '@/lib/kapso'
import {
  validarAltaCliente, TIPOS_CLIENTE, CLIENTE_FORM_VACIO, type AltaClienteForm,
} from '@/lib/alta'
import { Button } from '@/components/ui/button'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { FInput, FSelect, FTextarea } from '@/components/form-fields'
import { toast } from 'sonner'

/**
 * Alta de cliente desde el dashboard. La pantalla ya sabía EDITAR filas pero no
 * crearlas: en la instancia de Renato los clientes los da de alta el bot por
 * WhatsApp, en la instancia nueva no hay bot y no había otra puerta.
 *
 * El alta con tipo='acreedor' escribe además es_acreedor=1 — ver la nota de
 * esAcreedor() en app/config/inversores/InversoresClient.tsx.
 */

const TIPO_OPTIONS = TIPOS_CLIENTE.map(t => ({
  value: t,
  label: { comprador: 'Comprador', vendedor: 'Vendedor', acreedor: 'Acreedor (inversor)' }[t],
}))

export default function NuevoClienteDialog({
  open, onOpenChange,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
}) {
  const router = useRouter()
  const [form, setForm] = useState<AltaClienteForm>(CLIENTE_FORM_VACIO)
  const [saving, setSaving] = useState(false)

  const set = (campo: keyof AltaClienteForm, valor: string) =>
    setForm(f => ({ ...f, [campo]: valor }))

  // Cerrar es cerrar, por el botón o por Escape: el form vuelve a cero.
  function cerrar() { onOpenChange(false); setForm(CLIENTE_FORM_VACIO) }

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
    onOpenChange(false)
    setForm(CLIENTE_FORM_VACIO)
    router.refresh()
  }

  return (
    <Dialog open={open} onOpenChange={o => (o ? onOpenChange(true) : cerrar())}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nuevo cliente</DialogTitle>
          <DialogDescription>
            El mismo registro que usan las consignaciones y los préstamos.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <FInput label="Nombre *" value={form.nombre} onChange={v => set('nombre', v)} />
          <FSelect
            label="Tipo"
            value={form.tipo}
            onChange={v => set('tipo', v)}
            options={TIPO_OPTIONS}
            hint={form.tipo === 'acreedor' ? 'Queda marcado como acreedor y aparece en Inversores.' : undefined}
          />
          <FInput label="Teléfono" value={form.telefono} onChange={v => set('telefono', v)} type="tel" />
          <FInput label="WhatsApp" value={form.whatsapp} onChange={v => set('whatsapp', v)} type="tel" />
          <FInput label="Email" value={form.email} onChange={v => set('email', v)} type="email" />
          <FInput label="DNI" value={form.dni} onChange={v => set('dni', v)} />
          <FInput label="CUIL" value={form.cuil} onChange={v => set('cuil', v)} />
          <FInput label="Dirección" value={form.direccion} onChange={v => set('direccion', v)} />
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
