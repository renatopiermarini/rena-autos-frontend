'use client'
import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { toast } from 'sonner'
import {
  CheckIcon, ChevronDownIcon, ChevronUpIcon, ClockIcon, Loader2Icon, MessagesSquareIcon,
  PencilIcon, PlusIcon, RotateCcwIcon, SearchIcon, SparklesIcon, TriangleAlertIcon, XIcon,
} from 'lucide-react'
import { patchRecordDetailed, postRecord } from '@/lib/kapso'
import {
  autoDe, clasificarVencimiento, ordenarPendientes, personaDe, posponer, resumenPendientes,
  ESTADO_LABEL, FUENTE_LABEL, type Seguimiento, type SeguimientoFuente,
} from '@/lib/seguimientos'
import { fmtDM, fmtDMY, fmtDateTime, todayKey } from '@/lib/date'
import { useDeepLinkId, useScrollToDeepLink } from '@/lib/deep-link'
import { postIa } from '@/lib/ia-cliente'
import { formSucio } from '@/lib/dirty'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent } from '@/components/ui/card'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, useDirtyClose,
} from '@/components/ui/dialog'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { FField, nativeSelectCls } from '@/components/form-fields'
import { IaSugerenciasBar } from '@/components/ia-hint'
import { EmptyState } from '@/components/empty-state'
import { Th, Td } from '@/components/table-cells'

/**
 * Seguimientos: la lista de charlas abiertas ordenada por urgencia (vencidos,
 * hoy, próximos, sin fecha), con el resumen y el próximo paso a la vista y
 * tres gestos de un click: Hecho, Posponer, Descartar. Editar y el alta van
 * por diálogo (con guardia de datos sin guardar).
 *
 * Optimista con rollback (patrón TableroClient.toggleTarea): la fila cambia
 * en el acto, el PATCH viaja atrás; si falla, vuelve y avisa. Los cambios se
 * guardan como `overrides` por id encima de las filas del server — así un
 * `router.refresh()` que trae la fila ya escrita no pisa nada, y una que
 * falló se descarta sin tocar el resto.
 */

type Filtro = 'pendientes' | 'hechos' | 'descartados' | 'todos'
const FILTROS: { key: Filtro; label: string }[] = [
  { key: 'pendientes', label: 'Pendientes' },
  { key: 'hechos', label: 'Hechos' },
  { key: 'descartados', label: 'Descartados' },
  { key: 'todos', label: 'Todos' },
]

const FUENTE_VARIANT: Record<SeguimientoFuente, 'info' | 'secondary' | 'outline'> = {
  crm: 'info',
  bot: 'secondary',
  ia: 'info',
  manual: 'outline',
}

const norm = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()

/** Fecha del seguimiento como chip: rojo vencido, ámbar hoy, muted futuro. */
function FechaChip({ fecha, hoy }: { fecha: string | null; hoy: string }) {
  const v = clasificarVencimiento(fecha, hoy)
  if (v === 'sin_fecha') return <span className="text-xs italic text-muted-foreground">sin fecha</span>
  if (v === 'vencido') return <Badge variant="destructive" className="font-mono tabular-nums">Venció {fmtDM(fecha)}</Badge>
  if (v === 'hoy') return <Badge variant="warning">Hoy</Badge>
  return <span className="text-xs font-mono tabular-nums text-muted-foreground">{fmtDMY(fecha)}</span>
}

export default function SeguimientosClient({
  seguimientos, interesados, clientes, vehicles, ia = false,
}: {
  /** `null` = la tabla no existe en esta instancia (modo Kapso). */
  seguimientos: Seguimiento[] | null
  interesados: any[]
  clientes: any[]
  vehicles: any[]
  /** ¿Hay backend de IA? Enciende "Resumir con IA" en el alta. */
  ia?: boolean
}) {
  const router = useRouter()
  const sinTabla = seguimientos === null
  const hoy = todayKey()

  const [filtro, setFiltro] = useState<Filtro>('pendientes')
  const [q, setQ] = useState('')
  const [abiertos, setAbiertos] = useState<Set<number>>(new Set())
  const [overrides, setOverrides] = useState<Record<number, Partial<Seguimiento>>>({})
  const [busy, setBusy] = useState<Record<number, boolean>>({})
  const [dialog, setDialog] = useState<{ modo: 'nuevo' } | { modo: 'editar'; seg: Seguimiento } | null>(null)
  // El diálogo se remonta por `key` al abrir (form fresco por fila); al cerrar
  // conserva la key para no cortar la animación de salida.
  const dialogKey = useRef('nuevo-0')
  const abrirNuevo = () => { dialogKey.current = `nuevo-${Date.now()}`; setDialog({ modo: 'nuevo' }) }
  const abrirEditar = (seg: Seguimiento) => { dialogKey.current = `editar-${seg.id}-${Date.now()}`; setDialog({ modo: 'editar', seg }) }

  // Deep link desde el Tablero / las fichas: la fila puede ser un hecho o un
  // descartado, así que se abre el filtro y se expande antes de scrollear.
  const deepId = useDeepLinkId()
  const filas = useMemo(
    () => (seguimientos ?? []).map(s => (overrides[s.id] ? { ...s, ...overrides[s.id] } : s)),
    [seguimientos, overrides],
  )
  useEffect(() => {
    if (deepId == null) return
    const s = filas.find(x => x.id === deepId)
    if (s && s.estado !== 'pendiente') setFiltro('todos')
    setAbiertos(a => new Set(a).add(deepId))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deepId])
  useScrollToDeepLink(deepId, 'seguimiento')

  const resumen = resumenPendientes(filas, hoy)

  const visibles = useMemo(() => {
    const porEstado = filas.filter(s =>
      filtro === 'todos' ? true
      : filtro === 'pendientes' ? s.estado === 'pendiente'
      : filtro === 'hechos' ? s.estado === 'hecho'
      : s.estado === 'descartado')
    const texto = norm(q.trim())
    const buscadas = texto
      ? porEstado.filter(s => {
        const persona = personaDe(s, interesados, clientes)?.nombre ?? ''
        const auto = autoDe(s.vehicle_id, vehicles)
        return norm(`${persona} ${auto} ${s.resumen ?? ''} ${s.proximo_paso ?? ''}`).includes(texto)
      })
      : porEstado
    if (filtro === 'pendientes') return ordenarPendientes(buscadas)
    // Cerrados: el más reciente arriba.
    return [...buscadas].sort((a, b) =>
      (b.hecho_at ?? b.updated_at ?? '').localeCompare(a.hecho_at ?? a.updated_at ?? '') || b.id - a.id)
  }, [filas, filtro, q, interesados, clientes, vehicles])

  function toggle(id: number) {
    setAbiertos(a => { const n = new Set(a); if (n.has(id)) n.delete(id); else n.add(id); return n })
  }

  /** PATCH optimista: pinta `local` ya, manda `body`, y si falla vuelve atrás. */
  async function aplicar(id: number, body: Partial<Seguimiento>, local: Partial<Seguimiento>, exito: string) {
    if (busy[id]) return
    const previo = overrides[id]
    setBusy(b => ({ ...b, [id]: true }))
    setOverrides(o => ({ ...o, [id]: { ...(o[id] ?? {}), ...local } }))
    const { ok, error } = await patchRecordDetailed('seguimientos', id, body)
    setBusy(b => ({ ...b, [id]: false }))
    if (ok) {
      toast.success(exito)
      router.refresh()
    } else {
      setOverrides(o => {
        const n = { ...o }
        if (previo) n[id] = previo; else delete n[id]
        return n
      })
      toast.error(error || 'No se pudo actualizar el seguimiento')
    }
  }

  const now = () => new Date().toISOString()
  const hecho = (s: Seguimiento) =>
    aplicar(s.id, { estado: 'hecho' }, { estado: 'hecho', hecho_at: now() }, 'Seguimiento hecho')
  const reabrir = (s: Seguimiento) =>
    aplicar(s.id, { estado: 'pendiente', hecho_at: null }, { estado: 'pendiente', hecho_at: null }, 'Seguimiento reabierto')
  const posponerDias = (s: Seguimiento, dias: number) => {
    const nueva = posponer(s.fecha_proximo, dias, hoy)
    return aplicar(s.id, { fecha_proximo: nueva }, { fecha_proximo: nueva }, `Pospuesto al ${fmtDM(nueva)}`)
  }
  function descartar(s: Seguimiento) {
    const quien = personaDe(s, interesados, clientes)?.nombre
    if (!confirm(`¿Descartar el seguimiento${quien ? ` de ${quien}` : ''}? Deja de aparecer en pendientes.`)) return
    return aplicar(s.id, { estado: 'descartado' }, { estado: 'descartado' }, 'Seguimiento descartado')
  }

  const vacioTitulo = q.trim()
    ? 'Sin resultados'
    : filtro === 'pendientes' ? 'Nada pendiente'
    : filtro === 'hechos' ? 'Sin seguimientos hechos'
    : filtro === 'descartados' ? 'Sin seguimientos descartados'
    : 'Sin seguimientos'

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-baseline gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">Seguimientos</h1>
          <span className="text-sm text-muted-foreground">
            {resumen.pendientes} pendiente{resumen.pendientes === 1 ? '' : 's'}
            {' · '}
            <span className={cn(resumen.vencidos > 0 && 'text-destructive')}>
              {resumen.vencidos} vencido{resumen.vencidos === 1 ? '' : 's'}
            </span>
          </span>
        </div>
        <Button size="sm" onClick={abrirNuevo}>
          <PlusIcon /> Nuevo seguimiento
        </Button>
      </div>

      {sinTabla && (
        <div role="status" className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-sm">
          <TriangleAlertIcon aria-hidden className="mt-0.5 size-4 shrink-0 text-warning" />
          <span>
            <span className="font-medium">Los seguimientos requieren la base Postgres.</span>
            {' '}Esta instancia todavía lee la base de Kapso, donde la tabla <code className="font-mono text-xs">seguimientos</code> no existe: la sección se activa con el cut-over. Mientras tanto siguen en Tareas.
          </span>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <span className="mr-1 text-xs text-muted-foreground">Filtrar:</span>
        {FILTROS.map(f => (
          <Button
            key={f.key}
            size="xs"
            variant={filtro === f.key ? 'default' : 'outline'}
            aria-pressed={filtro === f.key}
            onClick={() => setFiltro(f.key)}
          >
            {f.label}
          </Button>
        ))}
        <div className="relative ml-auto w-full sm:w-64">
          <SearchIcon aria-hidden className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="Buscar por persona o auto"
            aria-label="Buscar por persona o auto"
            className="h-8 pl-8"
          />
        </div>
      </div>

      <Card size="sm">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-border bg-muted/40">
                  <Th>Fecha</Th>
                  <Th>Persona</Th>
                  <Th>Auto</Th>
                  <Th>Resumen</Th>
                  <Th>Próximo paso</Th>
                  <Th>Fuente</Th>
                  <Th right><span className="sr-only">Acciones</span></Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {visibles.map(s => {
                  const isOpen = abiertos.has(s.id)
                  const persona = personaDe(s, interesados, clientes)
                  const auto = autoDe(s.vehicle_id, vehicles)
                  const ocupado = !!busy[s.id]
                  const pendiente = s.estado === 'pendiente'
                  return (
                    <Fragment key={s.id}>
                      <tr
                        id={`seguimiento-${s.id}`}
                        onClick={() => toggle(s.id)}
                        className={cn(
                          'cursor-pointer align-top transition-colors',
                          isOpen ? 'bg-muted/30' : 'hover:bg-muted/30',
                          deepId === s.id && 'bg-primary/5 ring-1 ring-inset ring-primary/30',
                          !pendiente && 'text-muted-foreground',
                        )}
                      >
                        <Td className="whitespace-nowrap">
                          {/* Botón real: la fila entera sigue clickeable con mouse, pero
                              teclado y lector llegan por acá (patrón de las otras tablas). */}
                          <button
                            type="button"
                            aria-expanded={isOpen}
                            onClick={e => { e.stopPropagation(); toggle(s.id) }}
                            className="flex items-center gap-1.5 rounded text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          >
                            {isOpen
                              ? <ChevronUpIcon className="size-3 text-muted-foreground" aria-hidden />
                              : <ChevronDownIcon className="size-3 text-muted-foreground" aria-hidden />}
                            {pendiente
                              ? <FechaChip fecha={s.fecha_proximo} hoy={hoy} />
                              : <Badge variant={s.estado === 'hecho' ? 'success' : 'outline'}>{ESTADO_LABEL[s.estado]}</Badge>}
                          </button>
                        </Td>
                        <Td className="whitespace-nowrap">
                          {persona
                            ? <Link href={persona.href} onClick={e => e.stopPropagation()} className="font-medium hover:underline underline-offset-2">{persona.nombre}</Link>
                            : <span className="italic text-muted-foreground">Sin persona</span>}
                          {s.nudges > 0 && (
                            <span className="ml-1.5 rounded-full bg-muted px-1.5 py-0.5 text-2xs font-mono tabular-nums text-muted-foreground" title="Veces que el CRM volvió a insistir">
                              ×{s.nudges}
                            </span>
                          )}
                        </Td>
                        <Td className="whitespace-nowrap text-muted-foreground">{auto || '—'}</Td>
                        <Td>
                          <p className={cn('max-w-prose', !isOpen && 'line-clamp-2')}>{s.resumen || <span className="italic text-muted-foreground">Sin resumen</span>}</p>
                        </Td>
                        <Td>
                          <p className={cn('max-w-xs', !isOpen && 'line-clamp-2')}>{s.proximo_paso || '—'}</p>
                        </Td>
                        <Td>
                          <Badge variant={FUENTE_VARIANT[s.fuente] ?? 'outline'}>{FUENTE_LABEL[s.fuente] ?? s.fuente}</Badge>
                        </Td>
                        <Td className="whitespace-nowrap text-right" onClick={e => e.stopPropagation()}>
                          {pendiente ? (
                            <div className="inline-flex items-center gap-1">
                              <Button size="xs" variant="outline" onClick={() => hecho(s)} disabled={ocupado} title="Marcar como hecho">
                                <CheckIcon /> Hecho
                              </Button>
                              <DropdownMenu>
                                <DropdownMenuTrigger disabled={ocupado} render={<Button size="xs" variant="outline" title="Posponer" />}>
                                  <ClockIcon /> Posponer
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="w-auto min-w-28">
                                  <DropdownMenuItem onClick={() => posponerDias(s, 1)}>+1 día</DropdownMenuItem>
                                  <DropdownMenuItem onClick={() => posponerDias(s, 3)}>+3 días</DropdownMenuItem>
                                  <DropdownMenuItem onClick={() => posponerDias(s, 7)}>+7 días</DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                              <Button size="icon-xs" variant="ghost" onClick={() => descartar(s)} disabled={ocupado} title="Descartar" aria-label="Descartar">
                                <XIcon />
                              </Button>
                            </div>
                          ) : (
                            <Button size="xs" variant="outline" onClick={() => reabrir(s)} disabled={ocupado}>
                              <RotateCcwIcon /> Reabrir
                            </Button>
                          )}
                        </Td>
                      </tr>
                      {isOpen && (
                        <tr className={cn(deepId === s.id && 'bg-primary/5')}>
                          <td colSpan={7} className="bg-muted/20 px-10 py-3">
                            <div className="grid gap-x-8 gap-y-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
                              <div>
                                <p className="text-2xs uppercase tracking-wide text-muted-foreground">Resumen</p>
                                <p className="mt-0.5 max-w-prose whitespace-pre-wrap text-sm">{s.resumen || '—'}</p>
                              </div>
                              <div>
                                <p className="text-2xs uppercase tracking-wide text-muted-foreground">Próximo paso</p>
                                <p className="mt-0.5 max-w-prose whitespace-pre-wrap text-sm">{s.proximo_paso || '—'}</p>
                                <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                                  <dt>Fuente</dt><dd>{FUENTE_LABEL[s.fuente] ?? s.fuente}{s.crm_chat_id ? ` · chat ${s.crm_chat_id}` : ''}</dd>
                                  {s.created_at && <><dt>Creado</dt><dd className="font-mono tabular-nums">{fmtDateTime(s.created_at)}</dd></>}
                                  {s.hecho_at && <><dt>Hecho</dt><dd className="font-mono tabular-nums">{fmtDateTime(s.hecho_at)}</dd></>}
                                  {s.nudges > 0 && <><dt>Insistencias</dt><dd className="font-mono tabular-nums">{s.nudges}</dd></>}
                                </dl>
                              </div>
                              <div className="flex items-start gap-1.5">
                                <Button size="xs" variant="outline" onClick={() => abrirEditar(s)} disabled={ocupado}>
                                  <PencilIcon /> Editar
                                </Button>
                                {pendiente && (
                                  <Button size="xs" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => descartar(s)} disabled={ocupado}>
                                    <XIcon /> Descartar
                                  </Button>
                                )}
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  )
                })}
                {visibles.length === 0 && (
                  <tr>
                    <td colSpan={7}>
                      <EmptyState
                        icon={MessagesSquareIcon}
                        title={vacioTitulo}
                        hint={q.trim()
                          ? 'Probá con otro nombre o dominio.'
                          : sinTabla
                            ? undefined
                            : filtro === 'pendientes'
                              ? 'Los seguimientos llegan del CRM, del bot y de los chats pegados en Interesados — o con “Nuevo seguimiento”.'
                              : undefined}
                      />
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <SeguimientoDialog
        key={dialogKey.current}
        open={dialog !== null}
        onOpenChange={o => { if (!o) setDialog(null) }}
        inicial={dialog?.modo === 'editar' ? dialog.seg : null}
        interesados={interesados}
        clientes={clientes}
        vehicles={vehicles}
        ia={ia}
        hoy={hoy}
      />
    </div>
  )
}

// ── Alta / edición ───────────────────────────────────────────────────────────

type SegForm = {
  /** "i:<id>" interesado, "c:<id>" cliente, "" sin persona. */
  persona: string
  vehicle_id: string
  resumen: string
  proximo_paso: string
  fecha_proximo: string
}

/** Lo que devuelve POST /api/ia/resumir-seguimiento. */
type SeguimientoResumen = {
  pendiente?: boolean | null
  resumen?: string | null
  proximo_paso?: string | null
  fecha_proximo?: string | null
  motivo?: string | null
}

const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/

function formDe(s: Seguimiento | null, hoy: string): SegForm {
  return {
    persona: s?.interesado_id != null ? `i:${s.interesado_id}` : s?.cliente_id != null ? `c:${s.cliente_id}` : '',
    vehicle_id: s?.vehicle_id != null ? String(s.vehicle_id) : '',
    resumen: s?.resumen ?? '',
    proximo_paso: s?.proximo_paso ?? '',
    fecha_proximo: s ? (s.fecha_proximo ?? '') : hoy,
  }
}

function SeguimientoDialog({
  open, onOpenChange, inicial, interesados, clientes, vehicles, ia, hoy,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  /** Fila a editar; null = alta. */
  inicial: Seguimiento | null
  interesados: any[]
  clientes: any[]
  vehicles: any[]
  ia: boolean
  hoy: string
}) {
  const router = useRouter()
  const base = useMemo(() => formDe(inicial, hoy), [inicial, hoy])
  const [form, setForm] = useState<SegForm>(base)
  const [camposIa, setCamposIa] = useState<Set<keyof SegForm>>(new Set())
  const [errores, setErrores] = useState<Partial<Record<keyof SegForm, string>>>({})
  const [saving, setSaving] = useState(false)
  const [buscar, setBuscar] = useState('')

  // ── Resumir con IA ──
  const [mostrarIa, setMostrarIa] = useState(false)
  const [chat, setChat] = useState('')
  const [leyendo, setLeyendo] = useState(false)
  const [errorIa, setErrorIa] = useState('')
  const [avisoIa, setAvisoIa] = useState('')
  const [vinoDeIa, setVinoDeIa] = useState(false)
  const formRef = useRef(form)
  formRef.current = form

  const { dialogProps, cerrar } = useDirtyClose({
    sucio: formSucio(form, base) || chat.trim() !== '',
    onOpenChange,
  })

  function set<K extends keyof SegForm>(campo: K, valor: SegForm[K]) {
    setForm(f => ({ ...f, [campo]: valor }))
    setCamposIa(c => { if (!c.has(campo)) return c; const n = new Set(c); n.delete(campo); return n })
    if (errores[campo]) setErrores(e => ({ ...e, [campo]: undefined }))
  }
  const esIa = (campo: keyof SegForm) => camposIa.has(campo)

  async function resumir() {
    const texto = chat.trim()
    if (!texto || leyendo) return
    setLeyendo(true)
    setErrorIa('')
    setAvisoIa('')
    const r = await postIa<SeguimientoResumen>('resumir-seguimiento', { texto: texto.slice(0, 8000), hoy })
    setLeyendo(false)
    if (!r.ok) {
      const linea = r.error.split('\n')[0]
      setErrorIa(linea)
      toast.error(linea)
      return
    }
    const d = r.data ?? {}
    const nuevos = new Set<keyof SegForm>()
    const f = { ...formRef.current }
    const resumen = (d.resumen ?? '').trim()
    const paso = (d.proximo_paso ?? '').trim()
    const fecha = (d.fecha_proximo ?? '').trim()
    if (resumen) { f.resumen = resumen; nuevos.add('resumen') }
    if (paso) { f.proximo_paso = paso; nuevos.add('proximo_paso') }
    if (FECHA_RE.test(fecha)) { f.fecha_proximo = fecha; nuevos.add('fecha_proximo') }
    setForm(f)
    setCamposIa(c => new Set([...Array.from(c), ...Array.from(nuevos)]))
    setErrores({})
    if (nuevos.size > 0) setVinoDeIa(true)
    if (d.pendiente === false) {
      setAvisoIa(`Según la IA no queda nada pendiente${d.motivo ? `: ${d.motivo}` : '.'} Podés guardarlo igual.`)
    } else if (nuevos.size === 0) {
      toast.info('La IA no sacó nada nuevo de ese texto.')
    }
  }

  function limpiarIa() {
    setForm(f => {
      const n = { ...f }
      for (const c of Array.from(camposIa)) n[c] = base[c]
      return n
    })
    setCamposIa(new Set())
    setVinoDeIa(false)
    setAvisoIa('')
  }

  function validar(): boolean {
    const e: Partial<Record<keyof SegForm, string>> = {}
    if (!form.persona) e.persona = 'Elegí de quién es el seguimiento.'
    if (!form.resumen.trim()) e.resumen = 'Contá en una línea de qué va la charla.'
    if (form.fecha_proximo && !FECHA_RE.test(form.fecha_proximo)) e.fecha_proximo = 'Fecha inválida.'
    setErrores(e)
    return Object.keys(e).length === 0
  }

  async function guardar() {
    if (!validar()) return
    setSaving(true)
    const [tipo, idStr] = form.persona.split(':')
    const personaId = Number(idStr)
    const campos = {
      interesado_id: tipo === 'i' ? personaId : null,
      cliente_id: tipo === 'c' ? personaId : null,
      vehicle_id: form.vehicle_id ? Number(form.vehicle_id) : null,
      resumen: form.resumen.trim(),
      proximo_paso: form.proximo_paso.trim() || null,
      fecha_proximo: form.fecha_proximo || null,
    }
    if (inicial) {
      const { ok, error } = await patchRecordDetailed('seguimientos', inicial.id, campos)
      setSaving(false)
      if (ok) { toast.success('Seguimiento guardado'); onOpenChange(false); router.refresh() }
      else toast.error(error || 'No se pudo guardar')
      return
    }
    const ahora = new Date().toISOString()
    const r = await postRecord('seguimientos', {
      ...campos,
      estado: 'pendiente',
      fuente: vinoDeIa ? 'ia' : 'manual',
      nudges: 0,
      created_at: ahora,
      updated_at: ahora,
    })
    setSaving(false)
    if (r.ok) { toast.success('Seguimiento creado'); onOpenChange(false); router.refresh() }
    else toast.error(r.error || 'No se pudo crear el seguimiento')
  }

  // Select agrupado con filtro por texto. La persona ya elegida se queda en la
  // lista aunque el filtro no la matchee: si no, el select la perdería.
  const texto = norm(buscar.trim())
  const pasa = (p: any, clave: string) => !texto || clave === form.persona || norm(String(p?.nombre ?? '')).includes(texto)
  const opcInteresados = interesados.filter(p => pasa(p, `i:${p.id}`))
  const opcClientes = clientes.filter(p => pasa(p, `c:${p.id}`))

  return (
    <Dialog open={open} {...dialogProps}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{inicial ? 'Editar seguimiento' : 'Nuevo seguimiento'}</DialogTitle>
          <DialogDescription>
            {inicial ? 'De quién es, por qué auto y cuál es el próximo paso.' : 'Una charla abierta: con quién, de qué va y cuándo hay que volver a escribir.'}
          </DialogDescription>
        </DialogHeader>

        {ia && !inicial && (
          <div className="space-y-2 rounded-lg border border-dashed border-border bg-background/60 p-3">
            {!mostrarIa ? (
              <div className="flex flex-wrap items-center gap-3">
                <Button type="button" size="sm" variant="outline" onClick={() => setMostrarIa(true)}>
                  <SparklesIcon /> Resumir con IA
                </Button>
                <span className="text-xs text-muted-foreground">Pegá la conversación y la IA llena resumen, próximo paso y fecha.</span>
              </div>
            ) : (
              <>
                <div className="flex items-center gap-2">
                  <SparklesIcon aria-hidden className="size-4 text-muted-foreground" />
                  <Label htmlFor="chat-seguimiento" className="text-sm font-medium">Pegá la conversación</Label>
                </div>
                <Textarea
                  id="chat-seguimiento"
                  value={chat}
                  onChange={e => { setChat(e.target.value); if (errorIa) setErrorIa('') }}
                  rows={4}
                  maxLength={8000}
                  placeholder={'[14:02] Marcos: ¿Sigue disponible el Golf?\n[14:05] Vos: Sí, ¿querés venir el jueves?'}
                  disabled={leyendo}
                />
                <div className="flex flex-wrap items-center gap-2">
                  <Button type="button" size="sm" variant="outline" onClick={resumir} disabled={leyendo || !chat.trim()}>
                    {leyendo
                      ? <><Loader2Icon className="animate-spin motion-reduce:animate-none" /> Resumiendo…</>
                      : <><SparklesIcon /> Resumir</>}
                  </Button>
                  <Button type="button" size="sm" variant="ghost" onClick={() => { setMostrarIa(false); setChat('') }} disabled={leyendo}>
                    Cerrar
                  </Button>
                </div>
                {errorIa && <p role="alert" className="text-xs text-destructive">{errorIa}</p>}
              </>
            )}
          </div>
        )}
        <IaSugerenciasBar cantidad={camposIa.size} onLimpiar={limpiarIa} />
        {avisoIa && (
          <p role="status" className="rounded-lg border border-info/30 bg-info/10 px-3 py-2 text-xs">{avisoIa}</p>
        )}

        <div className="grid grid-cols-2 gap-3">
          <FField label="Persona *" error={errores.persona} controlId="seg-persona" className="col-span-2">
            <div className="space-y-1.5">
              <Input
                value={buscar}
                onChange={e => setBuscar(e.target.value)}
                placeholder="Filtrar por nombre"
                aria-label="Filtrar personas por nombre"
                className="h-8"
              />
              <select
                id="seg-persona"
                value={form.persona}
                onChange={e => set('persona', e.target.value)}
                aria-invalid={errores.persona ? true : undefined}
                className={nativeSelectCls}
              >
                <option value="">— Elegí un interesado o un cliente</option>
                <optgroup label={`Interesados (${opcInteresados.length})`}>
                  {opcInteresados.map(p => (
                    <option key={`i:${p.id}`} value={`i:${p.id}`}>{p.nombre || `Interesado #${p.id}`}</option>
                  ))}
                </optgroup>
                <optgroup label={`Clientes (${opcClientes.length})`}>
                  {opcClientes.map(p => (
                    <option key={`c:${p.id}`} value={`c:${p.id}`}>{p.nombre || `Cliente #${p.id}`}</option>
                  ))}
                </optgroup>
              </select>
            </div>
          </FField>
          <FField label="Auto" className="col-span-2 sm:col-span-1">
            <select value={form.vehicle_id} onChange={e => set('vehicle_id', e.target.value)} className={nativeSelectCls}>
              <option value="">— Sin auto</option>
              {vehicles.map(v => (
                <option key={v.id} value={String(v.id)}>
                  {`${v.marca ?? ''} ${v.modelo ?? ''}`.trim() || `Auto #${v.id}`}{v.dominio ? ` · ${v.dominio}` : ''}{v.estado === 'vendido' ? ' (vendido)' : ''}
                </option>
              ))}
            </select>
          </FField>
          <FField label="Fecha del próximo paso" error={errores.fecha_proximo} ia={esIa('fecha_proximo')} className="col-span-2 sm:col-span-1">
            <Input type="date" value={form.fecha_proximo} onChange={e => set('fecha_proximo', e.target.value)} />
          </FField>
          <FField label="Resumen *" error={errores.resumen} ia={esIa('resumen')} className="col-span-2">
            <Textarea
              rows={3}
              value={form.resumen}
              onChange={e => set('resumen', e.target.value)}
              placeholder="Ej: Preguntó por el Golf, quiere verlo el jueves. Le pasé precio y ubicación."
            />
          </FField>
          <FField label="Próximo paso" ia={esIa('proximo_paso')} className="col-span-2">
            <Input
              value={form.proximo_paso}
              onChange={e => set('proximo_paso', e.target.value)}
              placeholder="Ej: Confirmar horario de la visita"
            />
          </FField>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={cerrar}>Cancelar</Button>
          <Button onClick={guardar} disabled={saving}>{saving ? 'Guardando…' : inicial ? 'Guardar' : 'Crear seguimiento'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
