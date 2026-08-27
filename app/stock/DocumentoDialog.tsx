'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { todayKey } from '@/lib/date'
import { autoLabelVenta } from '@/lib/venta'
import {
  DOCUMENTO_FORM_VACIO, TIPOS_DOC, filenameDeDisposition, filenameFallback,
  pideValorEstimado, planDocumento, tipoDoc, traducirErrorBackend, valorDeVehiculo,
  type DocumentoForm, type DocumentoTipo, type ErrorDocumento,
} from '@/lib/documentos'
import { Button } from '@/components/ui/button'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
  useDirtyClose,
} from '@/components/ui/dialog'
import { formSucio } from '@/lib/dirty'
import { FField, FInput, FSelect, nativeSelectCls } from '@/components/form-fields'
import { toast } from 'sonner'

/**
 * Generar un contrato (recibo de seña / mandato / boleto) desde la ficha del auto.
 *
 * El documento lo arma el backend con las plantillas legales; acá se elige QUÉ
 * documento y CON QUIÉN, y se baja el archivo. Dos pasos en un solo diálogo:
 * primero el tipo (son tres cosas distintas y el que las usa no habla en
 * "recibo_sena"), después lo mínimo que el backend no puede saber solo — el
 * cliente y los números.
 *
 * LO QUE ESTA PANTALLA NO PIDE, A PROPÓSITO: los datos personales del cliente
 * (DNI, CUIL, domicilio, estado civil, ocupación, fecha de nacimiento). Esos
 * viven en `clientes` y son la ficha del cliente, no un campo de este form:
 * tipearlos acá los duplicaría sin guardarlos (el endpoint NO hace upsert de
 * partes). Si faltan, el backend contesta 422 con la lista y la mostramos
 * traducida, con el link a /clientes para ir a cargarlos una vez y para siempre.
 *
 * El armado del body y la traducción de los errores viven en lib/documentos.ts
 * (puro, con tests). Acá sólo está el fetch y la descarga.
 */

/** Dispara la descarga del blob con el nombre que mandó el backend. */
function descargar(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  // Se libera después del click: revocar en el mismo tick cancela la descarga.
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

export default function DocumentoDialog({
  open, onOpenChange, vehiculo, clientes,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  vehiculo: any
  clientes: any[]
}) {
  const [form, setForm] = useState<DocumentoForm>(DOCUMENTO_FORM_VACIO)
  const [inicial, setInicial] = useState<DocumentoForm>(DOCUMENTO_FORM_VACIO)
  const [generando, setGenerando] = useState(false)
  const [error, setError] = useState<ErrorDocumento | null>(null)

  // todayKey() usa la hora LOCAL: sembrar la fecha en el cliente al abrir evita
  // el "mañana" que daría el servidor en UTC después de las 21:00 AR.
  useEffect(() => {
    if (!open) return
    const sembrado: DocumentoForm = { ...DOCUMENTO_FORM_VACIO, fecha: todayKey() }
    setForm(sembrado)
    setInicial(sembrado)
    setError(null)
  }, [open, vehiculo?.id])

  const set = (campo: keyof DocumentoForm, valor: string) =>
    setForm(f => ({ ...f, [campo]: valor }) as DocumentoForm)

  /**
   * Elegir el tipo también precarga lo que ya sabemos: el dueño del auto para
   * el mandato, el comprador para el recibo/boleto, y el precio de la ficha
   * como precio total. Nunca pisa algo ya tipeado.
   */
  function elegirTipo(tipo: DocumentoTipo) {
    setError(null)
    setForm(f => {
      const sugerido = tipo === 'mandato' ? vehiculo?.cliente_id : vehiculo?.comprador_id
      const precio = valorDeVehiculo(vehiculo)
      return {
        ...f,
        tipo,
        cliente_id: f.cliente_id || (sugerido ? String(sugerido) : ''),
        precio_total: f.precio_total || (precio ? String(precio) : ''),
      }
    })
  }

  const meta = tipoDoc(form.tipo)
  const necesitaValor = pideValorEstimado(form.tipo, vehiculo)

  const { dialogProps, cerrar } = useDirtyClose({
    sucio: formSucio(form, inicial),
    onOpenChange,
  })

  async function generar() {
    const plan = planDocumento(form, vehiculo)
    if (!plan.ok) { setError({ titulo: plan.error, items: [], linkClientes: false }); return }

    setGenerando(true)
    setError(null)
    let res: Response
    try {
      res = await fetch('/api/documentos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(plan.body),
      })
    } catch {
      setGenerando(false)
      setError({
        titulo: 'No se pudo conectar para generar el documento. Fijate la conexión y probá de nuevo.',
        items: [], linkClientes: false,
      })
      return
    }

    if (!res.ok) {
      const json = await res.json().catch(() => ({} as any))
      setGenerando(false)
      setError(traducirErrorBackend(res.status, json))
      return
    }

    const blob = await res.blob()
    descargar(
      blob,
      filenameDeDisposition(
        res.headers.get('content-disposition'),
        filenameFallback(plan.body.tipo, vehiculo, plan.body.formato),
      ),
    )
    setGenerando(false)
    toast.success('Documento generado')
    // Cierre por la vía cruda: guardar bien nunca pregunta si descartar.
    onOpenChange(false)
  }

  return (
    <Dialog open={open} {...dialogProps}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Generar documento</DialogTitle>
          <DialogDescription>
            {autoLabelVenta(vehiculo) || 'Este auto'} — se arma con las plantillas legales y se
            baja al toque.
          </DialogDescription>
        </DialogHeader>

        {/* Paso 1: qué documento. Tres tarjetas, en criollo. */}
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground uppercase tracking-wide">Qué documento</p>
          <div className="grid grid-cols-1 gap-2">
            {TIPOS_DOC.map(t => {
              const activo = form.tipo === t.tipo
              return (
                <button
                  key={t.tipo}
                  type="button"
                  onClick={() => elegirTipo(t.tipo)}
                  aria-pressed={activo}
                  className={`rounded-lg border p-3 text-left transition-colors ${
                    activo
                      ? 'border-primary bg-primary/5 ring-1 ring-primary/30'
                      : 'border-border hover:bg-muted/50'
                  }`}
                >
                  <span className="block text-sm font-medium">{t.titulo}</span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">{t.descripcion}</span>
                </button>
              )
            })}
          </div>
        </div>

        {/* Paso 2: con quién y los números. Sólo lo que pide ESTE documento. */}
        {meta && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <FField
              label={`${meta.rolCliente} *`}
              hint={meta.hintCliente}
              className="sm:col-span-2"
            >
              <select
                value={form.cliente_id}
                onChange={e => set('cliente_id', e.target.value)}
                className={nativeSelectCls}
              >
                <option value="">— Elegí un cliente —</option>
                {clientes.map((c: any) => (
                  <option key={c.id} value={c.id}>{c.nombre}</option>
                ))}
              </select>
            </FField>

            {form.tipo === 'recibo_sena' && (
              <>
                <FInput
                  label="Seña *" type="number" min="0" step="0.01"
                  value={form.monto_sena} onChange={v => set('monto_sena', v)}
                  hint="La plata que te dejaron para reservar."
                />
                <FInput
                  label="Precio total *" type="number" min="0" step="0.01"
                  value={form.precio_total} onChange={v => set('precio_total', v)}
                />
              </>
            )}

            {form.tipo === 'boleto' && (
              <>
                <FInput
                  label="Precio total *" type="number" min="0" step="0.01"
                  value={form.precio_total} onChange={v => set('precio_total', v)}
                />
                <FInput
                  label="Plazo de transferencia (días) *" type="number" min="1" step="1"
                  value={form.plazo_transferencia_dias}
                  onChange={v => set('plazo_transferencia_dias', v)}
                  hint="En cuántos días se hace la transferencia."
                />
              </>
            )}

            {necesitaValor && (
              <FInput
                label="Valor estimado de venta (USD) *" type="number" min="0" step="0.01"
                value={form.valor_usd} onChange={v => set('valor_usd', v)}
                className="sm:col-span-2"
                hint="El auto no tiene precio cargado en la ficha y el mandato lo necesita."
              />
            )}

            <FInput
              label="Fecha" type="date"
              value={form.fecha} onChange={v => set('fecha', v)}
            />
            {form.tipo !== 'mandato' && (
              <FSelect
                label="Moneda"
                value={form.moneda}
                onChange={v => set('moneda', v)}
                options={[{ value: 'USD', label: 'USD' }, { value: 'ARS', label: 'Pesos' }]}
              />
            )}
            <FSelect
              label="Formato"
              value={form.formato}
              onChange={v => set('formato', v)}
              options={[{ value: 'pdf', label: 'PDF' }, { value: 'docx', label: 'Word (.docx)' }]}
            />
          </div>
        )}

        {error && (
          <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 space-y-1.5">
            <p className="text-sm font-medium">{error.titulo}</p>
            {error.items.length > 0 && (
              <ul className="list-disc pl-4 space-y-0.5 text-sm text-muted-foreground">
                {error.items.map((it, i) => <li key={i}>{it}</li>)}
              </ul>
            )}
            {error.linkClientes && (
              <p className="text-sm text-muted-foreground">
                Cargalos en{' '}
                <Link href="/clientes" className="underline underline-offset-2 hover:text-foreground">
                  Clientes
                </Link>{' '}
                y volvé a intentar.
              </p>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={cerrar} disabled={generando}>Cancelar</Button>
          <Button onClick={generar} disabled={generando || !meta}>
            {generando ? 'Generando…' : 'Generar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
