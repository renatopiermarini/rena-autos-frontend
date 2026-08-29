'use client'
import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  flagOn, activasOrdenadas, patchRecordDetailed, postRecord, deleteRecordDetailed,
  saldoDeCuenta,
} from '@/lib/kapso'
import { planAjuste } from '@/lib/ajuste'
import { isValidClave, CLAVE_RE } from '@/lib/routes-catalog'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
  useDirtyClose,
} from '@/components/ui/dialog'
import { formSucio } from '@/lib/dirty'
import { FInput, FCheckbox } from '@/components/form-fields'
import { ConfigMissingBanner, RestartNotice } from '@/components/config-banner'
import { EmptyState } from '@/components/empty-state'
import { toast } from 'sonner'
import { PlusIcon, PencilIcon, Trash2Icon, WalletIcon, ScaleIcon } from 'lucide-react'

type FormState = {
  clave: string
  label: string
  nota_es: string
  nota_en: string
  orden: string
  es_routing: boolean
  activa: boolean
}

function emptyForm(orden: number): FormState {
  return {
    clave: '', label: '', nota_es: '', nota_en: '',
    orden: String(orden), es_routing: false, activa: true,
  }
}

function rowToForm(c: any): FormState {
  return {
    clave: c.clave ?? '',
    label: c.label ?? '',
    nota_es: c.nota_es ?? '',
    nota_en: c.nota_en ?? '',
    orden: c.orden != null ? String(c.orden) : '0',
    es_routing: flagOn(c.es_routing, false),
    activa: flagOn(c.activa),
  }
}

function money(n: number): string {
  return `$${Number(n).toLocaleString('es-AR', { maximumFractionDigits: 2 })}`
}

export default function CuentasClient({
  cuentas, movimientos = [],
}: {
  cuentas: any[]
  // El ledger completo: el saldo por cuenta es DERIVADO (saldoDeCuenta), no hay
  // columna que leer.
  movimientos?: any[]
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<any | null>(null)
  const [form, setForm] = useState<FormState>(emptyForm(0))
  // Con qué contenido abrió el diálogo (alta vacía o la fila que se edita).
  const [inicial, setInicial] = useState<FormState>(emptyForm(0))
  const [saving, setSaving] = useState(false)
  const [borrar, setBorrar] = useState<any | null>(null)
  // Ajuste de saldo: la cuenta que se está cuadrando y el saldo real tipeado.
  const [ajustando, setAjustando] = useState<any | null>(null)
  const [saldoReal, setSaldoReal] = useState('')

  // Activas primero (en su orden), inactivas al final: la baja lógica no
  // esconde la fila, la manda abajo apagada.
  const ordenadas = useMemo(() => {
    const activas = activasOrdenadas(cuentas, 'activa')
    const inactivas = cuentas.filter(c => !flagOn(c.activa))
    return [...activas, ...inactivas]
  }, [cuentas])

  const proximoOrden = useMemo(
    () => cuentas.reduce((max, c) => Math.max(max, Number(c?.orden ?? 0) || 0), 0) + 1,
    [cuentas],
  )

  function abrirAlta() {
    setEditing(null)
    setForm(emptyForm(proximoOrden))
    setInicial(emptyForm(proximoOrden))
    setOpen(true)
  }

  function abrirEdicion(c: any) {
    setEditing(c)
    setForm(rowToForm(c))
    setInicial(rowToForm(c))
    setOpen(true)
  }

  async function guardar() {
    if (!isValidClave(form.clave)) {
      toast.error(`Clave inválida: debe cumplir ${CLAVE_RE.source} (ej: caja_chica).`)
      return
    }
    if (!form.label.trim()) {
      toast.error('El label es obligatorio.')
      return
    }
    const payload = {
      clave: form.clave.trim(),
      label: form.label.trim(),
      nota_es: form.nota_es.trim() || null,
      nota_en: form.nota_en.trim() || null,
      orden: Number(form.orden) || 0,
      es_routing: form.es_routing ? 1 : 0,
      activa: form.activa ? 1 : 0,
    }
    setSaving(true)
    const res = editing
      ? await patchRecordDetailed('cuentas', Number(editing.id), payload)
      : await postRecord('cuentas', payload)
    setSaving(false)
    if (!res.ok) {
      toast.error(res.error || 'Error al guardar')
      return
    }
    toast.success(editing ? 'Cuenta actualizada' : 'Cuenta creada')
    setOpen(false)
    router.refresh()
  }

  async function toggleActiva(c: any) {
    const next = !flagOn(c.activa)
    const { ok, error } = await patchRecordDetailed('cuentas', Number(c.id), { activa: next ? 1 : 0 })
    if (ok) {
      toast.success(next ? `"${c.clave}" activada` : `"${c.clave}" desactivada`)
      router.refresh()
    } else {
      toast.error(error || 'Error al guardar')
    }
  }

  async function confirmarBorrado() {
    if (!borrar) return
    const { ok, error } = await deleteRecordDetailed('cuentas', Number(borrar.id))
    if (ok) {
      toast.success('Cuenta eliminada')
      setBorrar(null)
      router.refresh()
    } else {
      // El proxy responde 409 con el conteo de movimientos y sugiere activa=0.
      toast.error(error || 'Error al eliminar')
    }
  }

  function abrirAjuste(c: any) {
    setAjustando(c)
    // Se siembra con el derivado: así el default es "no cambia nada" y el
    // usuario tiene que tipear a propósito el número que difiere.
    setSaldoReal(String(saldoDeCuenta(movimientos, String(c.clave ?? ''))))
  }

  async function confirmarAjuste() {
    if (!ajustando) return
    const clave = String(ajustando.clave ?? '')
    const derivado = saldoDeCuenta(movimientos, clave)
    const r = planAjuste(clave, derivado, saldoReal)
    if (!r.ok) { toast.error(r.error); return }
    if (r.movimiento === null) {
      // Diferencia 0: escribir un movimiento de $0 sería ruido en el ledger (y
      // validarMovimiento lo rechazaría igual, monto > 0).
      toast.success('La cuenta ya está cuadrada — no se escribió nada.')
      setAjustando(null)
      return
    }
    setSaving(true)
    // Por /api/finanzas/movimiento y no por el proxy: es la única puerta que
    // setea afecta_balance=1, sin el cual el ajuste no movería el saldo.
    const res = await fetch('/api/finanzas/movimiento', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(r.movimiento),
    })
    setSaving(false)
    if (!res.ok) {
      const json = await res.json().catch(() => ({} as any))
      toast.error(json.message || json.error || 'No se pudo registrar el ajuste')
      return
    }
    toast.success(
      `Ajuste registrado: ${r.diferencia > 0 ? 'ingreso' : 'egreso'} de ` +
      `${money(Math.abs(r.diferencia))} en "${clave}"`,
    )
    setAjustando(null)
    router.refresh()
  }

  const derivadoAjuste = ajustando ? saldoDeCuenta(movimientos, String(ajustando.clave ?? '')) : 0
  const previewAjuste = ajustando ? planAjuste(String(ajustando.clave ?? ''), derivadoAjuste, saldoReal) : null

  // Las dos puertas de "cerrar sin guardar": el form de la cuenta y el ajuste de
  // saldo. Ver lib/dirty.ts — el confirm sale también por Escape y por la X.
  const { dialogProps, cerrar } = useDirtyClose({
    sucio: formSucio(form, inicial),
    onOpenChange: setOpen,
  })
  const { dialogProps: ajusteDialogProps, cerrar: cerrarAjuste } = useDirtyClose({
    sucio: formSucio({ saldoReal }, { saldoReal: String(derivadoAjuste) }),
    onOpenChange: o => { if (!o) setAjustando(null) },
  })

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <h1 className="text-xl font-semibold">Cuentas</h1>
        <Button onClick={abrirAlta}><PlusIcon /> Nueva cuenta</Button>
      </div>

      {cuentas.length === 0 && <ConfigMissingBanner />}
      <RestartNotice>Los cambios en cuentas aplican al reiniciar el bot.</RestartNotice>

      <Card size="sm">
        <CardContent className="p-0">
          {ordenadas.map(c => {
            const activa = flagOn(c.activa)
            return (
              <div
                key={c.id}
                className={`flex items-center justify-between gap-4 px-4 py-3 border-b border-border last:border-0 ${activa ? '' : 'opacity-55'}`}
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium">{c.label || c.clave}</span>
                    <code className="text-xs text-muted-foreground font-mono">{c.clave}</code>
                    {flagOn(c.es_routing, false) && <Badge variant="info">routing</Badge>}
                    {!activa && <Badge variant="outline">inactiva</Badge>}
                  </div>
                  {(c.nota_es || c.nota_en) && (
                    <p className="text-xs text-muted-foreground mt-0.5 truncate max-w-[70ch]">
                      {c.nota_es || c.nota_en}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span
                    className="text-sm tabular-nums"
                    title="Saldo derivado del ledger (ingresos − egresos)"
                  >
                    {money(saldoDeCuenta(movimientos, String(c.clave ?? '')))}
                  </span>
                  <span className="text-xs text-muted-foreground tabular-nums">#{c.orden ?? 0}</span>
                  <FCheckbox
                    id={`activa-${c.id}`}
                    label="Activa"
                    checked={activa}
                    onChange={() => toggleActiva(c)}
                  />
                  {/* Sólo las activas: cuadrar una cuenta dada de baja dejaría
                      un movimiento en una caja que ya no se muestra. */}
                  {activa && (
                    <Button variant="outline" size="sm" onClick={() => abrirAjuste(c)}>
                      <ScaleIcon /> Ajustar saldo
                    </Button>
                  )}
                  <Button variant="outline" size="sm" onClick={() => abrirEdicion(c)}>
                    <PencilIcon /> Editar
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setBorrar(c)}>
                    <Trash2Icon />
                  </Button>
                </div>
              </div>
            )
          })}
          {cuentas.length === 0 && (
            <EmptyState
              icon={WalletIcon}
              title="Sin cuentas configuradas"
              hint="El bot usa las cuentas por defecto (cash, nexo, fiwind) hasta que se cree la tabla."
              className="py-8"
            />
          )}
        </CardContent>
      </Card>

      <Dialog open={open} {...dialogProps}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? 'Editar cuenta' : 'Nueva cuenta'}</DialogTitle>
            <DialogDescription>
              La clave es la que viaja a los movimientos contables: cambiarla en una cuenta con
              historial rompe el vínculo con lo ya registrado.
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-x-4 gap-y-3">
            <FInput
              label="Clave" value={form.clave}
              onChange={v => setForm(f => ({ ...f, clave: v }))}
              placeholder="caja_chica"
              hint="minúsculas, números y _"
            />
            <FInput
              label="Label" value={form.label}
              onChange={v => setForm(f => ({ ...f, label: v }))}
              placeholder="Caja chica"
            />
            <FInput
              label="Nota (es)" value={form.nota_es}
              onChange={v => setForm(f => ({ ...f, nota_es: v }))}
              className="col-span-2"
            />
            <FInput
              label="Nota (en)" value={form.nota_en}
              onChange={v => setForm(f => ({ ...f, nota_en: v }))}
              className="col-span-2"
              hint="Para el prompt del bot, que razona en inglés."
            />
            <FInput
              label="Orden" value={form.orden} type="number"
              onChange={v => setForm(f => ({ ...f, orden: v }))}
            />
            <div className="space-y-2 pt-6">
              <FCheckbox
                id="form-es-routing"
                label="Es cuenta de routing"
                checked={form.es_routing}
                onChange={v => setForm(f => ({ ...f, es_routing: v }))}
              />
              <FCheckbox
                id="form-activa"
                label="Activa"
                checked={form.activa}
                onChange={v => setForm(f => ({ ...f, activa: v }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={cerrar} disabled={saving}>Cancelar</Button>
            <Button onClick={guardar} disabled={saving}>{saving ? 'Guardando…' : 'Guardar'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={ajustando !== null} {...ajusteDialogProps}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Ajustar el saldo de &quot;{ajustando?.clave}&quot;</DialogTitle>
            <DialogDescription>
              El saldo no se escribe: se deriva del ledger. Poner el saldo real asienta la
              DIFERENCIA como un movimiento de categoría &quot;ajuste&quot;.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Saldo derivado hoy</span>
              <span className="tabular-nums font-medium">{money(derivadoAjuste)}</span>
            </div>
            <FInput
              label="Saldo real hoy"
              type="number"
              step="0.01"
              value={saldoReal}
              onChange={setSaldoReal}
              hint="Lo que hay de verdad en esa caja/cuenta."
            />
            {previewAjuste?.ok && previewAjuste.movimiento === null && (
              <p className="text-sm text-muted-foreground">
                La cuenta ya está cuadrada: no se va a escribir nada.
              </p>
            )}
            {previewAjuste?.ok && previewAjuste.movimiento && (
              <p className="text-sm">
                Se registra un{' '}
                <span className="font-medium">
                  {previewAjuste.movimiento.tipo} de {money(previewAjuste.movimiento.monto)}
                </span>{' '}
                {previewAjuste.diferencia > 0
                  ? '(falta plata en el ledger)'
                  : '(sobra plata en el ledger)'}
                .
              </p>
            )}
            {previewAjuste && !previewAjuste.ok && (
              <p className="text-sm text-destructive">{previewAjuste.error}</p>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={cerrarAjuste} disabled={saving}>
              Cancelar
            </Button>
            <Button onClick={confirmarAjuste} disabled={saving}>
              {saving ? 'Registrando…' : 'Registrar ajuste'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={borrar !== null} onOpenChange={o => !o && setBorrar(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>¿Eliminar la cuenta &quot;{borrar?.clave}&quot;?</DialogTitle>
            <DialogDescription>
              Si tiene movimientos contables el borrado se rechaza: en ese caso desactivala en vez
              de borrarla.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBorrar(null)}>Cancelar</Button>
            <Button variant="destructive" onClick={confirmarBorrado}>Eliminar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
