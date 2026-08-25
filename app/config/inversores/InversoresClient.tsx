'use client'
import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { coerceId, tasaPct, postRecord, flagOn } from '@/lib/kapso'
import { fmtDMY } from '@/lib/date'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { FInput, FTextarea } from '@/components/form-fields'
import { EmptyState } from '@/components/empty-state'
import { toast } from 'sonner'
import { PlusIcon, HandCoinsIcon } from 'lucide-react'

/**
 * Un cliente es acreedor si lo dice CUALQUIERA de los dos campos: `es_acreedor`
 * (el flag que muestra el badge en /clientes) o `tipo='acreedor'` (el select del
 * mismo form). Están desincronizados en filas viejas — cargadas por el bot con
 * uno y por el dashboard con el otro — y filtrar por uno solo escondería
 * inversores reales. El alta setea los dos para no seguir sumando filas mixtas.
 */
export function esAcreedor(c: any): boolean {
  return flagOn(c?.es_acreedor, false) || c?.tipo === 'acreedor'
}

function fmtMonto(n: any) {
  if (n == null || n === '') return '—'
  return `$${Number(n).toLocaleString('es-AR')}`
}

const MODALIDAD_LABEL: Record<string, string> = {
  mensual: 'interés mensual',
  al_final: 'interés al final',
}

export default function InversoresClient({
  clientes, prestamos,
}: {
  clientes: any[]; prestamos: any[]
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    nombre: '', telefono: '', email: '', dni: '', cuil: '', direccion: '', notas: '',
  })

  const acreedores = useMemo(() => clientes.filter(esAcreedor), [clientes])

  const prestamosPorAcreedor = useMemo(() => {
    const out = new Map<number, any[]>()
    for (const p of prestamos) {
      const aid = coerceId(p.acreedor_id)
      if (aid === null) continue
      const list = out.get(aid) ?? []
      list.push(p)
      out.set(aid, list)
    }
    return out
  }, [prestamos])

  async function crear() {
    if (!form.nombre.trim()) {
      toast.error('El nombre es obligatorio.')
      return
    }
    const now = new Date().toISOString()
    const payload: Record<string, any> = {
      nombre: form.nombre.trim(),
      telefono: form.telefono.trim() || null,
      email: form.email.trim() || null,
      dni: form.dni.trim() || null,
      cuil: form.cuil.trim() || null,
      direccion: form.direccion.trim() || null,
      notas: form.notas.trim() || null,
      tipo: 'acreedor',
      es_acreedor: 1,
      created_at: now,
      updated_at: now,
    }
    setSaving(true)
    const res = await postRecord('clientes', payload)
    setSaving(false)
    if (!res.ok) {
      toast.error(res.error || 'Error al guardar')
      return
    }
    toast.success('Inversor creado')
    setForm({ nombre: '', telefono: '', email: '', dni: '', cuil: '', direccion: '', notas: '' })
    setOpen(false)
    router.refresh()
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-xl font-semibold">Inversores</h1>
        <Button onClick={() => setOpen(true)}><PlusIcon /> Nuevo inversor</Button>
      </div>
      <p className="text-sm text-muted-foreground">
        Los inversores son clientes marcados como acreedores: se editan también desde Clientes y
        sus préstamos salen de Finanzas.
      </p>

      <Card size="sm">
        <CardContent className="p-0">
          {acreedores.map(c => {
            const suyos = prestamosPorAcreedor.get(coerceId(c.id) ?? -1) ?? []
            const activos = suyos.filter(p => p.estado === 'activo')
            return (
              <div key={c.id} className="px-4 py-3 border-b border-border last:border-0">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium">{c.nombre}</span>
                    <Badge variant="destructive">acreedor</Badge>
                    {c.tipo && c.tipo !== 'acreedor' && (
                      <Badge variant="outline">tipo: {c.tipo}</Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-4 text-xs text-muted-foreground">
                    {c.telefono && <span>{c.telefono}</span>}
                    {c.email && <span>{c.email}</span>}
                  </div>
                </div>

                {activos.length > 0 ? (
                  <ul className="mt-2 space-y-1">
                    {activos.map(p => (
                      <li key={p.id} className="flex items-center gap-3 text-xs text-muted-foreground">
                        <Badge variant="warning">activo</Badge>
                        <span className="text-foreground tabular-nums">{fmtMonto(p.monto_original)}</span>
                        <span>{tasaPct(p.tasa_interes_anual)}% anual</span>
                        <span>{MODALIDAD_LABEL[p.modalidad] ?? p.modalidad ?? '—'}</span>
                        {p.fecha_inicio && <span>desde {fmtDMY(p.fecha_inicio)}</span>}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-1 text-xs text-muted-foreground">Sin préstamos activos.</p>
                )}
              </div>
            )
          })}
          {acreedores.length === 0 && (
            <EmptyState
              icon={HandCoinsIcon}
              title="Sin inversores cargados"
              hint="Un inversor es un cliente marcado como acreedor; sus préstamos se registran en Finanzas."
              className="py-8"
            />
          )}
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Nuevo inversor</DialogTitle>
            <DialogDescription>
              Se crea como cliente con tipo &quot;acreedor&quot;. Los préstamos se cargan después
              desde Finanzas.
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-x-4 gap-y-3">
            <FInput
              label="Nombre" value={form.nombre} className="col-span-2"
              onChange={v => setForm(f => ({ ...f, nombre: v }))}
            />
            <FInput
              label="Teléfono" value={form.telefono} type="tel"
              onChange={v => setForm(f => ({ ...f, telefono: v }))}
            />
            <FInput
              label="Email" value={form.email} type="email"
              onChange={v => setForm(f => ({ ...f, email: v }))}
            />
            <FInput label="DNI" value={form.dni} onChange={v => setForm(f => ({ ...f, dni: v }))} />
            <FInput label="CUIL" value={form.cuil} onChange={v => setForm(f => ({ ...f, cuil: v }))} />
            <FInput
              label="Dirección" value={form.direccion} className="col-span-2"
              onChange={v => setForm(f => ({ ...f, direccion: v }))}
            />
            <FTextarea
              label="Notas" value={form.notas} className="col-span-2" rows={2}
              onChange={v => setForm(f => ({ ...f, notas: v }))}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>Cancelar</Button>
            <Button onClick={crear} disabled={saving}>{saving ? 'Guardando…' : 'Crear'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
