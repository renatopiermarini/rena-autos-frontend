'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { toast } from 'sonner'
import {
  CheckCircle2Icon, CircleAlertIcon, ExternalLinkIcon, Loader2Icon, PlusIcon, SearchIcon,
  TriangleAlertIcon, XIcon,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { EmptyState } from '@/components/empty-state'
import { FCheckbox, FInput, FSelect } from '@/components/form-fields'
import { Th, Td } from '@/components/table-cells'
import NuevoClienteDialog from '@/app/clientes/NuevoClienteDialog'
import { estadoMeta } from '@/lib/estados'
import { fmtDMY, todayKey } from '@/lib/date'
import { money } from '@/lib/money'
import { useDeepLinkParam } from '@/lib/deep-link'
import {
  DOCUMENTO_FORM_VACIO, TIPOS_DOC, autosParaDocumentos, documentosGenerados, filenameDeDisposition,
  filenameFallback, filtrarAutos, filtrarClientes, pidePrecioTotal, pideValorEstimado, planDocumento,
  tipoDoc, tipoDocumentoLabel, traducirErrorBackend, traducirPreparar, valorDeVehiculo,
  type DocumentoForm, type DocumentoMeta, type DocumentoTipo, type ErrorDocumento,
} from '@/lib/documentos'
import { cn } from '@/lib/utils'

/**
 * La sección Documentos: generar un contrato en tres pasos y verlo guardado.
 *
 * Izquierda, las cuatro plantillas con "cuándo se usa". Derecha, una card con
 * tres bloques: el auto (buscador), el cliente según el rol que pide la
 * plantilla (buscador + alta inline) y los campos que el backend no puede
 * saber solo (montos, plazo, fecha, formato, guardar o no).
 *
 * El panel de faltantes se actualiza EN VIVO: con plantilla + auto + cliente
 * se le pregunta al backend (`/preparar`, debounce 400 ms) qué le falta y se
 * muestra traducido (lib/documentos), con el link a la ficha donde se arregla.
 * "Generar" recién se habilita cuando el backend dice `ok`. Antes el 422 se
 * veía después de apretar Generar; ahora se ve mientras se elige.
 *
 * LO QUE ESTA PANTALLA NO PIDE, A PROPÓSITO: los datos personales del cliente
 * (DNI, CUIL, domicilio…). Viven en `clientes`; tipearlos acá los duplicaría
 * sin guardarlos. El panel manda a la ficha con `?id=&dni=1` (abre el dropzone
 * del DNI) y se vuelve.
 *
 * "Guardar en la documentación del auto" (default sí): el backend persiste el
 * archivo en `documentos` con origen 'generado' y aparece en el historial de
 * abajo y en la tab Documentación de la ficha.
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

const MAX_RESULTADOS = 8

function autoNombre(v: any): string {
  return `${v?.marca ?? ''} ${v?.modelo ?? ''}`.trim() || `Auto #${v?.id}`
}

function AutoLinea({ v }: { v: any }) {
  const anio = v?.año || v?.anio
  return (
    <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
      <span className="font-medium">{autoNombre(v)}</span>
      {anio && <span className="text-muted-foreground">{anio}</span>}
      {v?.dominio && <span className="font-mono text-xs text-muted-foreground">{v.dominio}</span>}
      <Badge variant={estadoMeta(v?.estado).variant} className="text-2xs">{estadoMeta(v?.estado).label}</Badge>
    </span>
  )
}

function ClienteLinea({ c }: { c: any }) {
  return (
    <span className="flex min-w-0 flex-wrap items-center gap-x-2">
      <span className="font-medium">{c?.nombre || `Cliente #${c?.id}`}</span>
      {c?.dni && <span className="font-mono text-xs text-muted-foreground">DNI {c.dni}</span>}
      {c?.tipo && <span className="text-xs text-muted-foreground capitalize">{String(c.tipo)}</span>}
    </span>
  )
}

/** Un bloque del wizard: número, título y contenido. */
function Bloque({ n, titulo, hint, children }: {
  n: number; titulo: string; hint?: string; children: React.ReactNode
}) {
  return (
    <section className="space-y-2">
      <div className="flex items-baseline gap-2">
        <span className="grid size-5 shrink-0 place-items-center rounded-full bg-muted font-mono text-2xs tabular-nums text-muted-foreground">
          {n}
        </span>
        <h2 className="text-sm font-medium">{titulo}</h2>
        {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
      </div>
      {children}
    </section>
  )
}

/** Buscador + lista de resultados; al elegir, muestra el elegido con "Cambiar". */
function Selector<T extends { id: any }>({
  placeholder, items, filtrar, seleccionado, onElegir, render, vacio, accion,
}: {
  placeholder: string
  items: T[]
  filtrar: (items: T[], q: string) => T[]
  seleccionado: T | null
  onElegir: (item: T | null) => void
  render: (item: T) => React.ReactNode
  vacio: string
  /** Un botón extra al lado del buscador ("Nuevo cliente"). */
  accion?: React.ReactNode
}) {
  const [q, setQ] = useState('')
  const resultados = useMemo(() => filtrar(items, q), [items, filtrar, q])
  const visibles = resultados.slice(0, MAX_RESULTADOS)
  const ocultos = resultados.length - visibles.length

  if (seleccionado) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-lg border border-primary/40 bg-primary/5 px-3 py-2 text-sm">
        {render(seleccionado)}
        <Button type="button" variant="ghost" size="xs" onClick={() => onElegir(null)}>
          Cambiar
        </Button>
      </div>
    )
  }
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <SearchIcon aria-hidden className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder={placeholder}
            className="pl-8"
            aria-label={placeholder}
          />
          {q && (
            <button
              type="button"
              aria-label="Limpiar búsqueda"
              onClick={() => setQ('')}
              className="absolute top-1/2 right-2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <XIcon className="size-3.5" />
            </button>
          )}
        </div>
        {accion}
      </div>
      {visibles.length === 0 ? (
        <p className="px-1 text-xs text-muted-foreground">{vacio}</p>
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border">
          {visibles.map(item => (
            <li key={String(item.id)}>
              <button
                type="button"
                onClick={() => onElegir(item)}
                className="flex w-full items-center px-3 py-2 text-left text-sm hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-none"
              >
                {render(item)}
              </button>
            </li>
          ))}
          {ocultos > 0 && (
            <li className="px-3 py-1.5 text-xs text-muted-foreground">
              {ocultos} más — afiná la búsqueda.
            </li>
          )}
        </ul>
      )}
    </div>
  )
}

type Prep =
  | { estado: 'idle' }
  | { estado: 'cargando' }
  | { estado: 'ok' }
  /** `nivel` warning = faltan datos (se arregla en una ficha); destructive = el backend no contesta o rechazó. */
  | { estado: 'error'; error: ErrorDocumento; nivel: 'warning' | 'destructive' }

export default function DocumentosClient({
  vehicles, clientes, documentos,
}: {
  vehicles: any[]; clientes: any[]; documentos: DocumentoMeta[]
}) {
  const router = useRouter()
  const [form, setForm] = useState<DocumentoForm>(DOCUMENTO_FORM_VACIO)
  const [vehicleId, setVehicleId] = useState<number | null>(null)
  const [guardar, setGuardar] = useState(true)
  const [prep, setPrep] = useState<Prep>({ estado: 'idle' })
  const [generando, setGenerando] = useState(false)
  const [showNuevoCliente, setShowNuevoCliente] = useState(false)
  // Clientes creados desde acá, hasta que el router.refresh los traiga de la DB.
  const [clientesNuevos, setClientesNuevos] = useState<any[]>([])

  // todayKey() usa la hora LOCAL: sembrar la fecha en el cliente evita el
  // "mañana" que daría el servidor en UTC después de las 21:00 AR.
  const [hoy, setHoy] = useState('')
  useEffect(() => {
    const h = todayKey()
    setHoy(h)
    setForm(f => (f.fecha ? f : { ...f, fecha: h }))
  }, [])

  const autos = useMemo(() => autosParaDocumentos(vehicles, hoy || todayKey()), [vehicles, hoy])
  const todosClientes = useMemo(() => {
    const ids = new Set(clientes.map((c: any) => Number(c.id)))
    return [...clientesNuevos.filter(c => !ids.has(Number(c.id))), ...clientes]
  }, [clientes, clientesNuevos])

  const vehiculo = useMemo(
    () => (vehicleId == null ? null : vehicles.find((v: any) => Number(v.id) === vehicleId) ?? null),
    [vehicles, vehicleId],
  )
  const clienteId = Number(form.cliente_id) || null
  const cliente = useMemo(
    () => (clienteId == null ? null : todosClientes.find((c: any) => Number(c.id) === clienteId) ?? null),
    [todosClientes, clienteId],
  )
  const meta = tipoDoc(form.tipo)

  // `?vehicle_id=` (desde la tab Documentación de la ficha): el auto ya viene elegido.
  const deepVehicle = useDeepLinkParam('vehicle_id')
  useEffect(() => {
    if (!deepVehicle) return
    const n = Number(deepVehicle)
    if (vehicles.some((v: any) => Number(v.id) === n)) setVehicleId(n)
  }, [deepVehicle, vehicles])

  const set = (campo: keyof DocumentoForm, valor: string) =>
    setForm(f => ({ ...f, [campo]: valor }) as DocumentoForm)

  /**
   * Elegir plantilla o auto precarga lo que ya sabemos: el dueño del auto para
   * el mandato, el comprador para el resto, y el precio de la ficha como precio
   * total. Nunca pisa un cliente ya elegido a mano ni un precio tipeado.
   */
  function elegirTipo(tipo: DocumentoTipo) {
    setForm(f => ({ ...f, tipo, cliente_id: f.cliente_id || sugerirCliente(tipo, vehiculo) }))
  }
  function elegirAuto(v: any | null) {
    setVehicleId(v ? Number(v.id) : null)
    setForm(f => ({
      ...f,
      cliente_id: v && f.tipo ? (f.cliente_id || sugerirCliente(f.tipo, v)) : f.cliente_id,
      precio_total: v ? (f.precio_total || (valorDeVehiculo(v) ? String(valorDeVehiculo(v)) : '')) : f.precio_total,
    }))
  }
  function sugerirCliente(tipo: string, v: any | null): string {
    if (!v) return ''
    const id = tipo === 'mandato' ? v.cliente_id : v.comprador_id
    return id ? String(id) : ''
  }

  // ── Faltantes en vivo ──────────────────────────────────────────────────────
  // Cada cambio del form dispara /preparar con debounce; `serie` descarta la
  // respuesta de un pedido viejo que llegue después del nuevo.
  const serie = useRef(0)
  const formKey = JSON.stringify({ ...form, vehicleId })
  useEffect(() => {
    const n = ++serie.current
    if (!form.tipo || !vehiculo || !clienteId) { setPrep({ estado: 'idle' }); return }
    const plan = planDocumento(form, vehiculo)
    if (!plan.ok) {
      setPrep({ estado: 'error', nivel: 'warning', error: { titulo: plan.error, items: [], linkClientes: false } })
      return
    }
    setPrep({ estado: 'cargando' })
    const t = setTimeout(async () => {
      let res: Response
      try {
        res = await fetch('/api/documentos/preparar', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(plan.body),
          cache: 'no-store',
        })
      } catch {
        if (n !== serie.current) return
        setPrep({
          estado: 'error', nivel: 'destructive',
          error: { titulo: 'Sin conexión. Revisá la red y probá de nuevo.', items: [], linkClientes: false },
        })
        return
      }
      const json = await res.json().catch(() => null)
      if (n !== serie.current) return
      if (!res.ok) {
        setPrep({ estado: 'error', nivel: 'destructive', error: traducirErrorBackend(res.status, json) })
        return
      }
      const err = traducirPreparar(json)
      setPrep(err ? { estado: 'error', nivel: 'warning', error: err } : { estado: 'ok' })
    }, 400)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formKey])

  // ── Generar ────────────────────────────────────────────────────────────────
  async function generar() {
    if (!vehiculo || prep.estado !== 'ok') return
    const plan = planDocumento(form, vehiculo)
    if (!plan.ok) { toast.error(plan.error); return }

    setGenerando(true)
    let res: Response
    try {
      res = await fetch('/api/documentos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...plan.body, guardar }),
      })
    } catch {
      setGenerando(false)
      toast.error('No se pudo conectar para generar el documento. Fijate la conexión y probá de nuevo.')
      return
    }
    if (!res.ok) {
      const json = await res.json().catch(() => ({} as any))
      setGenerando(false)
      setPrep({ estado: 'error', nivel: res.status === 422 ? 'warning' : 'destructive', error: traducirErrorBackend(res.status, json) })
      return
    }
    const blob = await res.blob()
    descargar(
      blob,
      filenameDeDisposition(res.headers.get('content-disposition'), filenameFallback(plan.body.tipo, vehiculo, plan.body.formato)),
    )
    setGenerando(false)
    const guardado = guardar && res.headers.get('x-documento-id')
    toast.success(guardado ? 'Documento generado y guardado en el auto' : 'Documento generado')
    if (guardado) router.refresh()
  }

  const necesitaValor = pideValorEstimado(form.tipo, vehiculo)
  const necesitaPrecio = pidePrecioTotal(form.tipo, vehiculo)
  const precioFicha = valorDeVehiculo(vehiculo)
  const historial = useMemo(() => documentosGenerados(documentos), [documentos])
  const vehIndex = useMemo(() => new Map(vehicles.map((v: any) => [Number(v.id), v])), [vehicles])
  const cliIndex = useMemo(() => new Map(todosClientes.map((c: any) => [Number(c.id), c])), [todosClientes])

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Documentos</h1>
        <span className="text-sm text-muted-foreground">
          Contratos con las plantillas legales; se bajan al toque y quedan guardados en el auto.
        </span>
      </div>

      <div className="grid gap-6 lg:grid-cols-[300px_minmax(0,1fr)]">
        {/* ── Plantillas ── */}
        <aside className="space-y-2" aria-label="Plantillas">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Qué documento</p>
          {TIPOS_DOC.map(t => {
            const activo = form.tipo === t.tipo
            return (
              <button
                key={t.tipo}
                type="button"
                onClick={() => elegirTipo(t.tipo)}
                aria-pressed={activo}
                className={cn(
                  'block w-full rounded-lg border p-3 text-left transition-colors',
                  activo ? 'border-primary bg-primary/5' : 'border-border bg-card hover:bg-muted/50',
                )}
              >
                <span className="block text-sm font-medium">{t.titulo}</span>
                <span className="mt-0.5 block text-xs text-muted-foreground">{t.descripcion}</span>
              </button>
            )
          })}
        </aside>

        {/* ── Wizard ── */}
        <Card>
          <CardContent className="space-y-6">
            <Bloque n={1} titulo="Auto" hint="los que están en stock y los vendidos de los últimos 90 días">
              <Selector
                placeholder="Buscar por marca, modelo o patente"
                items={autos}
                filtrar={filtrarAutos}
                seleccionado={vehiculo}
                onElegir={elegirAuto}
                render={v => <AutoLinea v={v} />}
                vacio="Ningún auto coincide."
              />
            </Bloque>

            <Bloque
              n={2}
              titulo={meta ? meta.rolCliente : 'Cliente'}
              hint={meta ? meta.hintCliente : 'elegí primero qué documento'}
            >
              {meta ? (
                <Selector
                  placeholder="Buscar por nombre o DNI"
                  items={todosClientes}
                  filtrar={filtrarClientes}
                  seleccionado={cliente}
                  onElegir={c => set('cliente_id', c ? String(c.id) : '')}
                  render={c => <ClienteLinea c={c} />}
                  vacio="Ningún cliente coincide. Creálo con «Nuevo cliente»."
                  accion={
                    <Button type="button" variant="outline" size="sm" onClick={() => setShowNuevoCliente(true)}>
                      <PlusIcon /> Nuevo cliente
                    </Button>
                  }
                />
              ) : (
                <p className="text-sm text-muted-foreground">
                  El rol depende de la plantilla: el dueño para el mandato, el comprador para los demás.
                </p>
              )}
            </Bloque>

            <Bloque n={3} titulo="Campos" hint={meta ? 'lo que el backend no puede saber solo' : undefined}>
              {meta ? (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
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

                  {form.tipo === 'recibo_pago' && (
                    <>
                      <FInput
                        label="Monto pagado *" type="number" min="0" step="0.01"
                        value={form.monto_pagado} onChange={v => set('monto_pagado', v)}
                        hint="Lo que pagan en este recibo."
                      />
                      <FInput
                        label="Pagos previos" type="number" min="0" step="0.01"
                        value={form.pagos_previos} onChange={v => set('pagos_previos', v)}
                        hint="Seña u otros pagos ya hechos. 0 si no hubo."
                      />
                      <FInput
                        label="Concepto" value={form.concepto} onChange={v => set('concepto', v)}
                        placeholder="saldo total, segunda cuota…"
                      />
                      {necesitaPrecio ? (
                        <FInput
                          label="Precio total *" type="number" min="0" step="0.01"
                          value={form.precio_total} onChange={v => set('precio_total', v)}
                          hint="El auto no tiene precio cargado en la ficha."
                        />
                      ) : (
                        <div className="space-y-1.5">
                          <p className="text-xs uppercase tracking-wide text-muted-foreground">Precio total</p>
                          <p className="font-mono text-sm tabular-nums">{money(precioFicha)}</p>
                          <p className="text-xs text-muted-foreground">De la ficha del auto; el backend calcula el saldo.</p>
                        </div>
                      )}
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
                      hint="El auto no tiene precio cargado en la ficha y el mandato lo necesita."
                    />
                  )}

                  <FInput label="Fecha" type="date" value={form.fecha} onChange={v => set('fecha', v)} />
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
                  <div className="sm:col-span-2 lg:col-span-3">
                    <FCheckbox
                      id="guardar-doc"
                      label="Guardar en la documentación del auto"
                      checked={guardar}
                      onChange={setGuardar}
                      hint="Queda en la tab Documentación de la ficha y en el historial de abajo."
                    />
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Los campos dependen de la plantilla.</p>
              )}
            </Bloque>

            {/* ── Faltantes en vivo ── */}
            <div
              aria-live="polite"
              className={cn(
                'rounded-lg border px-3 py-2.5 text-sm',
                prep.estado === 'ok' && 'border-success/40 bg-success/5',
                prep.estado === 'error' && prep.nivel === 'warning' && 'border-warning/40 bg-warning/5',
                prep.estado === 'error' && prep.nivel === 'destructive' && 'border-destructive/40 bg-destructive/5',
                (prep.estado === 'idle' || prep.estado === 'cargando') && 'border-border',
              )}
            >
              {prep.estado === 'idle' && (
                <p className="text-muted-foreground">
                  Elegí plantilla, auto y {meta ? meta.rolCliente.toLowerCase() : 'cliente'}: acá se ve qué falta antes de generar.
                </p>
              )}
              {prep.estado === 'cargando' && (
                <p className="flex items-center gap-2 text-muted-foreground">
                  <Loader2Icon aria-hidden className="size-4 animate-spin motion-reduce:animate-none" />
                  Verificando con el backend…
                </p>
              )}
              {prep.estado === 'ok' && (
                <p className="flex items-center gap-2 font-medium text-success">
                  <CheckCircle2Icon aria-hidden className="size-4" />
                  Todo listo: se puede generar.
                </p>
              )}
              {prep.estado === 'error' && (
                <div className="space-y-1.5">
                  <p className="flex items-start gap-2 font-medium">
                    {prep.nivel === 'warning'
                      ? <TriangleAlertIcon aria-hidden className="mt-0.5 size-4 shrink-0 text-warning" />
                      : <CircleAlertIcon aria-hidden className="mt-0.5 size-4 shrink-0 text-destructive" />}
                    <span>{prep.error.titulo}</span>
                  </p>
                  {prep.error.items.length > 0 && (
                    <ul className="list-disc space-y-0.5 pl-9 text-muted-foreground">
                      {prep.error.items.map((it, i) => <li key={i}>{it}</li>)}
                    </ul>
                  )}
                  {(prep.error.linkClientes || prep.error.linkAuto) && (
                    <p className="flex flex-wrap gap-x-4 gap-y-1 pl-6 text-xs">
                      {prep.error.linkClientes && clienteId && (
                        <Link
                          href={`/clientes?id=${clienteId}&dni=1`}
                          className="inline-flex items-center gap-1 text-primary underline-offset-2 hover:underline"
                        >
                          Completar la ficha de {cliente?.nombre || 'el cliente'} <ExternalLinkIcon aria-hidden className="size-3" />
                        </Link>
                      )}
                      {prep.error.linkAuto && vehicleId && (
                        <Link
                          href={`/stock?id=${vehicleId}`}
                          className="inline-flex items-center gap-1 text-primary underline-offset-2 hover:underline"
                        >
                          Abrir la ficha del auto <ExternalLinkIcon aria-hidden className="size-3" />
                        </Link>
                      )}
                    </p>
                  )}
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2">
              <Button onClick={generar} disabled={generando || prep.estado !== 'ok'}>
                {generando ? 'Generando…' : 'Generar'}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── Historial ── */}
      <section className="space-y-2">
        <h2 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Generados ({historial.length})
        </h2>
        <Card>
          <CardContent className="p-0">
            {historial.length === 0 ? (
              <EmptyState
                title="Todavía no se generó ningún documento"
                hint="Los que generes con «Guardar en la documentación del auto» quedan acá y en la ficha del auto."
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-[13px]">
                  <thead>
                    <tr className="border-b border-border">
                      <Th>Documento</Th>
                      <Th>Auto</Th>
                      <Th>Cliente</Th>
                      <Th>Fecha</Th>
                      <Th className="sr-only">Descargar</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {historial.map(d => {
                      const v = d.vehicle_id != null ? vehIndex.get(Number(d.vehicle_id)) : null
                      const c = d.cliente_id != null ? cliIndex.get(Number(d.cliente_id)) : null
                      return (
                        <tr key={d.id} className="border-b border-border last:border-b-0">
                          <Td className="font-medium">
                            {tipoDocumentoLabel(d.tipo)}
                            <span className="block max-w-[22rem] truncate text-xs text-muted-foreground" title={d.nombre}>
                              {d.nombre}
                            </span>
                          </Td>
                          <Td>
                            {v ? (
                              <span>{autoNombre(v)}{v.dominio && <span className="ml-1.5 font-mono text-xs text-muted-foreground">{v.dominio}</span>}</span>
                            ) : <span className="text-muted-foreground">—</span>}
                          </Td>
                          <Td>{c?.nombre ?? <span className="text-muted-foreground">—</span>}</Td>
                          <Td className="whitespace-nowrap font-mono tabular-nums text-muted-foreground">{fmtDMY(d.created_at)}</Td>
                          <Td className="whitespace-nowrap text-right">
                            <a
                              href={`/api/documentos/${d.id}/descargar`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-primary underline-offset-2 hover:underline"
                            >
                              Descargar <ExternalLinkIcon aria-hidden className="size-3" />
                            </a>
                          </Td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </section>

      <NuevoClienteDialog
        open={showNuevoCliente}
        onOpenChange={setShowNuevoCliente}
        ia
        onCreado={c => {
          if (!c?.id) return
          setClientesNuevos(xs => [c, ...xs])
          set('cliente_id', String(c.id))
        }}
      />
    </div>
  )
}
