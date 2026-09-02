'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { type CuentaInfo } from '@/lib/kapso'
import { fmtDMY as fmtFecha } from '@/lib/date'
import { estadoMeta } from '@/lib/estados'
import { diasEnStock, tarjetaVehiculo } from '@/lib/stock'
import { verificacionPaga } from '@/lib/verificaciones'
import { DEFAULT_ASSIGNEE } from '@/lib/equipo'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import { CheckIcon, AlertCircleIcon, SearchIcon, XIcon, CarIcon, PlusIcon } from 'lucide-react'
import { EmptyState } from '@/components/empty-state'
import NuevoAutoDialog from './NuevoAutoDialog'
import VehicleDialog from './VehicleDialog'
import { COMISION_PCT_DEFAULT } from '@/lib/venta'
import { money, fmtN } from '@/lib/money'

// Mapeo del flag del vehículo → tipo de tarea que se debe completar
// cuando se tilda el check en la tabla.
const TIPO_FOR_FIELD: Record<string, string> = {
  lavado:    'lavado',
  fotos_ok:  'fotos',
  publicado: 'publicacion',
}

function ToggleCheck({
  vehicleId, field, value, pendingTareaIds = [], defAssignee,
}: {
  vehicleId: number; field: string; value: boolean; pendingTareaIds?: number[]
  defAssignee: string
}) {
  const router = useRouter()
  const [val, setVal] = useState(value)
  const [error, setError] = useState(false)
  const [busy, setBusy] = useState(false)

  async function toggle(e: React.MouseEvent) {
    e.stopPropagation()
    if (busy) return                          // double-toggle race
    setBusy(true)
    const next = !val
    setVal(next)
    setError(false)
    const res = await fetch(`/api/db/vehicles?id=${vehicleId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [field]: next ? 1 : 0, updated_at: new Date().toISOString() }),
    })
    if (!res.ok) { setVal(!next); setError(true); setBusy(false); return }

    // Al tildar como hecho, completamos también las tareas pendientes del mismo tipo
    // (lavado→lavado, fotos_ok→fotos, publicado→publicacion). No revertimos al destildar.
    if (next && pendingTareaIds.length > 0) {
      const now = new Date().toISOString()
      const results = await Promise.all(pendingTareaIds.map(id =>
        fetch(`/api/db/tareas?id=${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            estado: 'completada',
            completado_por: defAssignee,
            fecha_completado: now,
            updated_at: now,
          }),
        })
      ))
      const failed = results.filter(r => !r.ok).length
      if (failed > 0) toast.error(`${failed} tarea(s) vinculada(s) no se pudieron completar`)
    }
    setBusy(false)
    router.refresh()
  }

  return (
    <button
      onClick={toggle}
      title={error ? 'Error al guardar' : val ? 'Marcar como pendiente' : 'Marcar como listo'}
      aria-label={error ? 'Error al guardar' : val ? 'Marcar como pendiente' : 'Marcar como listo'}
      aria-pressed={val}
      className={`transition-colors ${val ? 'text-success hover:text-success/80' : 'text-muted-foreground/40 hover:text-muted-foreground'}`}
    >
      {error ? <AlertCircleIcon className="size-4 text-destructive" /> : <CheckIcon className="size-4" />}
    </button>
  )
}

function diasEnStockCorto(fecha: string) {
  const dias = diasEnStock(fecha)
  return dias === null ? '—' : `${dias}d`
}


function VehicleTable({
  vehicles, tareas, onOpen, defAssignee, verificaciones,
}: {
  vehicles: any[]; tareas: any[]
  /** Abre el modal de detalle del auto. */
  onOpen: (id: number) => void
  defAssignee: string
  verificaciones: any[]
}) {
  function tareasAuto(vid: number) {
    return tareas.filter(t => t.vehicle_id === vid && t.estado !== 'completada')
  }

  if (vehicles.length === 0) {
    return <EmptyState icon={CarIcon} title="Sin vehículos" className="py-6" />
  }

  return (
    <>
    {/* Móvil (< md): tarjetas. En 375px la tabla cortaba el precio a la mitad y
        escondía patente y días — justo los tres datos por los que se abre esta
        pantalla. Cada auto es ahora una tarjeta de tres líneas: qué es, cómo se
        identifica, y cuánto vale / en qué estado / hace cuánto está parado.
        Tocarla abre el modal de detalle. */}
    <ul className="divide-y divide-border md:hidden">
      {vehicles.map(v => {
        const pendientes = tareasAuto(v.id)
        const t = tarjetaVehiculo(v)
        return (
          <li key={v.id}>
            <button
              type="button"
              onClick={() => onOpen(v.id)}
              aria-haspopup="dialog"
              className="w-full px-3 py-3 text-left"
            >
              <span className="flex items-start justify-between gap-2">
                {/* spans y no <p>/<div>: adentro de un <button> sólo va contenido
                    de frase, y este botón es toda la tarjeta (el área de toque). */}
                <span className="min-w-0">
                  <span className="block truncate font-medium leading-snug">{t.titulo}</span>
                  <span className="mt-0.5 block truncate text-xs text-muted-foreground">{t.detalle}</span>
                </span>
              </span>
              <span className="mt-2 flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
                <span className={`text-lg font-semibold font-mono tabular-nums ${t.precioEstimado ? 'text-muted-foreground' : ''}`}>
                  {t.precio}
                </span>
                <Badge variant={t.estadoVariant}>{t.estadoLabel}</Badge>
                {t.diasLabel && (
                  <span className={`text-xs font-mono tabular-nums ${t.diasAlerta ? 'font-medium text-destructive' : 'text-muted-foreground'}`}>
                    {t.diasLabel} en stock
                  </span>
                )}
                {Number(v.uso_personal ?? 0) > 0 && <Badge variant="outline">en uso</Badge>}
                {pendientes.length > 0 && (
                  <Badge variant="destructive">{pendientes.length} tarea{pendientes.length > 1 ? 's' : ''}</Badge>
                )}
              </span>
            </button>
          </li>
        )
      })}
    </ul>

    {/* Escritorio (md+): la tabla de siempre, sin cambios. */}
    <div className="hidden md:block overflow-x-auto">
      <table className="w-full text-[13px]">
        <thead>
          <tr className="border-b border-border text-left">
            <th className="px-3 py-2 text-2xs font-medium uppercase tracking-wide text-muted-foreground">Auto</th>
            <th className="px-3 py-2 text-2xs font-medium uppercase tracking-wide text-muted-foreground hidden sm:table-cell">Patente</th>
            <th className="px-3 py-2 text-2xs font-medium uppercase tracking-wide text-muted-foreground">Estado</th>
            <th className="px-3 py-2 text-2xs font-medium uppercase tracking-wide text-muted-foreground hidden md:table-cell">KM</th>
            <th className="px-3 py-2 text-2xs font-medium uppercase tracking-wide text-muted-foreground">Precio</th>
            <th className="px-3 py-2 text-2xs font-medium uppercase tracking-wide text-muted-foreground hidden md:table-cell">Días</th>
            <th className="px-3 py-2 text-2xs font-medium uppercase tracking-wide text-muted-foreground text-center hidden sm:table-cell" title="Lavado">Lav</th>
            <th className="px-3 py-2 text-2xs font-medium uppercase tracking-wide text-muted-foreground text-center hidden sm:table-cell">Fotos</th>
            <th className="px-3 py-2 text-2xs font-medium uppercase tracking-wide text-muted-foreground text-center hidden sm:table-cell" title="Publicado">Pub</th>
            <th className="px-3 py-2 text-2xs font-medium uppercase tracking-wide text-muted-foreground text-center hidden sm:table-cell" title="Verificación paga">Verif. paga</th>
          </tr>
        </thead>
        <tbody>
          {vehicles.map(v => {
            const pendientes = tareasAuto(v.id)
            const pendientesPorTipo = (tipo: string) =>
              pendientes.filter(t => t.tipo === tipo).map(t => t.id)
            const verifPaga = verificacionPaga(verificaciones, v.id)
            return (
                <tr
                  key={v.id}
                  onClick={() => onOpen(v.id)}
                  className="cursor-pointer border-b border-border transition-colors hover:bg-muted/30"
                >
                  <td className="py-2 px-3">
                    <div className="flex items-center gap-1.5">
                      {/* Botón real para teclado/lector; la fila entera sigue
                          clickeable con mouse (mismo patrón que la tarjeta móvil). */}
                      <button
                        type="button"
                        aria-haspopup="dialog"
                        onClick={e => { e.stopPropagation(); onOpen(v.id) }}
                        className="flex items-center gap-1.5 rounded text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <span className="font-medium">{v.marca} {v.modelo}</span>
                        <span className="text-muted-foreground">{v.año}</span>
                      </button>
                      {v.color && <span className="text-xs text-muted-foreground">· {v.color}</span>}
                      {Number(v.uso_personal ?? 0) > 0 && (
                        <Badge variant="outline" className="ml-1" title="Auto de uso propio — es patrimonio pero no está a la venta">
                          en uso
                        </Badge>
                      )}
                      {pendientes.length > 0 && (
                        <Badge variant="destructive" className="ml-1">{pendientes.length} tarea{pendientes.length > 1 ? 's' : ''}</Badge>
                      )}
                    </div>
                  </td>
                  <td className="py-2 px-3 text-muted-foreground hidden sm:table-cell">{v.dominio || '—'}</td>
                  <td className="py-2 px-3">
                    <Badge variant={estadoMeta(v.estado).variant}>{estadoMeta(v.estado).label}</Badge>
                  </td>
                  <td className="py-2 px-3 text-muted-foreground font-mono tabular-nums hidden md:table-cell">{v.km ? fmtN(v.km) : '—'}</td>
                  <td className="py-2 px-3 font-mono tabular-nums">
                    {v.precio_publicado
                      ? money(v.precio_publicado)
                      : v.precio_venta_objetivo
                      ? <span className="text-muted-foreground">{money(v.precio_venta_objetivo)}</span>
                      : '—'}
                  </td>
                  <td className="py-2 px-3 text-muted-foreground hidden md:table-cell">{diasEnStockCorto(v.fecha_ingreso)}</td>
                  <td className="py-2 px-3 text-center hidden sm:table-cell"><ToggleCheck vehicleId={v.id} field="lavado"    value={!!v.lavado}    pendingTareaIds={pendientesPorTipo('lavado')} defAssignee={defAssignee} /></td>
                  <td className="py-2 px-3 text-center hidden sm:table-cell"><ToggleCheck vehicleId={v.id} field="fotos_ok"  value={!!v.fotos_ok}  pendingTareaIds={pendientesPorTipo('fotos')} defAssignee={defAssignee} /></td>
                  <td className="py-2 px-3 text-center hidden sm:table-cell"><ToggleCheck vehicleId={v.id} field="publicado" value={!!v.publicado} pendingTareaIds={pendientesPorTipo('publicacion')} defAssignee={defAssignee} /></td>
                  {/* Sólo lectura: la verificación se marca paga desde /verificaciones
                      (estado + fecha_pago), no con un toggle sobre el auto. */}
                  <td className="py-2 px-3 text-center hidden sm:table-cell">
                    {verifPaga == null
                      ? <span className="text-muted-foreground/40" title="Sin verificación registrada">—</span>
                      : verifPaga === 'paga'
                      ? <span className="text-success font-medium" title="Verificación paga">Sí</span>
                      : <span className="text-destructive font-medium" title="Verificación sin pagar">No</span>}
                  </td>
                </tr>
            )
          })}
        </tbody>
      </table>
    </div>
    </>
  )
}

type TipoFilter = 'todos' | 'propio' | 'consignacion'
type GroupMode = 'ninguno' | 'tipo' | 'estado'

const TIPO_FILTER_LABELS: { key: TipoFilter; label: string }[] = [
  { key: 'todos', label: 'Todos' },
  { key: 'propio', label: 'Propios' },
  { key: 'consignacion', label: 'Consignación' },
]

const GROUP_LABELS: { key: GroupMode; label: string }[] = [
  { key: 'ninguno', label: 'Sin agrupar' },
  { key: 'tipo', label: 'Por tipo' },
  { key: 'estado', label: 'Por estado' },
]

// Pipeline order for the "Por estado" grouping. `vendido` is deliberately absent
// — sold cars render in their own section further down the page.
const ESTADO_ORDER = [
  'a_ingresar', 'en_preparacion', 'publicado', 'reservado',
]
// Group headings reuse lib/estados.ts so there is exactly ONE estado→label map.
// There used to be a second copy right here, and the two drifted: the headings
// were corrected while the row badges kept rendering the old wording, so a car
// could sit under "Propios" with a badge reading "Consignación".

export default function StockClient({
  vehicles, tareas, clientes, movimientos = [], prestamos = [], defAssignee = DEFAULT_ASSIGNEE,
  cuentas = [], comisionPct = COMISION_PCT_DEFAULT, documentosHabilitado = false,
  verificaciones = [],
}: {
  vehicles: any[]; tareas: any[]; clientes: any[]; movimientos?: any[]; prestamos?: any[]
  // Filas crudas de verificaciones_mecanicas: de acá sale el "Verificación
  // paga sí/no" por auto (derivado, se edita en /verificaciones).
  verificaciones?: any[]
  // A quién se le anota haber completado una tarea al tildar el check. Sale de
  // config_negocio.default_assignee; sin la tabla, 'rena' como siempre.
  defAssignee?: string
  // Cajas de la contabilidad, para el egreso opcional del alta y para el ingreso
  // de la venta. Sin tabla `cuentas`, cuentasInfo cae en DEFAULT_CUENTAS.
  cuentas?: CuentaInfo[]
  // % de comisión de consignación (config_negocio.comision_consignacion_pct).
  // Sin la tabla, el 5 de siempre.
  comisionPct?: number
  // ¿Esta instancia tiene backend de contratos (BACKEND_URL + BACKEND_API_KEY)?
  // Lo resuelve el server component: sin las dos env el botón "Generar
  // documento" no se dibuja. Ver app/stock/page.tsx.
  documentosHabilitado?: boolean
}) {
  // Auto abierto en el modal de detalle (null = cerrado). Reemplaza a la fila
  // expandible: el detalle vive en VehicleDialog, full-screen con tabs.
  const [openId, setOpenId] = useState<number | null>(null)
  const [showNew, setShowNew] = useState(false)
  const [tipoFilter, setTipoFilter] = useState<TipoFilter>('todos')
  // Default to ownership, not estado: "is this car mine or on consignment?" is
  // the question this page gets opened to answer, and grouping by estado made a
  // propio car sit under a heading that read like consignación.
  const [groupMode, setGroupMode] = useState<GroupMode>('tipo')
  const [query, setQuery] = useState('')

  const q = query.trim().toLowerCase()
  const matchesQuery = (v: any) =>
    !q || [v.marca, v.modelo, v.año, v.dominio, v.color]
      .filter(Boolean).join(' ').toLowerCase().includes(q)

  const activos = vehicles.filter(v => v.estado !== 'vendido')
  const vendidosAll = vehicles.filter(v => v.estado === 'vendido')
  const vendidos = vendidosAll.filter(matchesQuery)

  const filtered = activos.filter(v => {
    if (!matchesQuery(v)) return false
    if (tipoFilter === 'todos') return true
    return v.tipo_operacion === tipoFilter
  })

  function getGroups(): { label: string; vehicles: any[] }[] {
    if (groupMode === 'tipo') {
      const propios = filtered.filter(v => v.tipo_operacion === 'propio')
      const consig = filtered.filter(v => v.tipo_operacion === 'consignacion')
      const otros = filtered.filter(v => !v.tipo_operacion || (v.tipo_operacion !== 'propio' && v.tipo_operacion !== 'consignacion'))
      return [
        propios.length > 0 ? { label: `Propios (${propios.length})`, vehicles: propios } : null,
        consig.length > 0 ? { label: `Consignación (${consig.length})`, vehicles: consig } : null,
        otros.length > 0 ? { label: `Otros (${otros.length})`, vehicles: otros } : null,
      ].filter(Boolean) as { label: string; vehicles: any[] }[]
    }
    if (groupMode === 'estado') {
      return ESTADO_ORDER
        .map(estado => {
          const vs = filtered.filter(v => v.estado === estado)
          return vs.length > 0
            ? { label: `${estadoMeta(estado).label} (${vs.length})`, vehicles: vs }
            : null
        })
        .filter(Boolean) as { label: string; vehicles: any[] }[]
    }
    return [{ label: '', vehicles: filtered }]
  }

  const groups = getGroups()

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-baseline gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">Stock</h1>
          <span className="text-sm text-muted-foreground">
            {activos.length} activos · {vendidosAll.length} vendidos
          </span>
        </div>
        <Button onClick={() => setShowNew(true)}><PlusIcon /> Nuevo auto</Button>
      </div>

      <NuevoAutoDialog
        open={showNew}
        onOpenChange={setShowNew}
        clientes={clientes}
        cuentas={cuentas}
      />

      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        <div className="relative w-full sm:w-64">
          <SearchIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
          <Input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Buscar marca, modelo, patente…"
            aria-label="Buscar vehículo"
            className="h-8 pl-8 pr-8"
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              aria-label="Limpiar búsqueda"
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <XIcon className="size-4" />
            </button>
          )}
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-xs text-muted-foreground mr-0.5">Tipo:</span>
          {TIPO_FILTER_LABELS.map(({ key, label }) => (
            <Button
              key={key}
              size="xs"
              variant={tipoFilter === key ? 'default' : 'outline'}
              aria-pressed={tipoFilter === key}
              onClick={() => setTipoFilter(key)}
            >
              {label}
            </Button>
          ))}
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-xs text-muted-foreground mr-0.5">Agrupar:</span>
          {GROUP_LABELS.map(({ key, label }) => (
            <Button
              key={key}
              size="xs"
              variant={groupMode === key ? 'default' : 'outline'}
              aria-pressed={groupMode === key}
              onClick={() => setGroupMode(key)}
            >
              {label}
            </Button>
          ))}
        </div>
      </div>

      {groupMode === 'ninguno' ? (
        <Card size="sm">
          <CardContent className="p-0">
            <VehicleTable
              vehicles={filtered}
              tareas={tareas}
              onOpen={setOpenId}
              defAssignee={defAssignee}
              verificaciones={verificaciones}
            />
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {groups.map(group => (
            <section key={group.label}>
              <p className="text-xs text-muted-foreground uppercase tracking-wide mb-3">{group.label}</p>
              <Card size="sm">
                <CardContent className="p-0">
                  <VehicleTable
                    vehicles={group.vehicles}
                    tareas={tareas}
                    onOpen={setOpenId}
                    defAssignee={defAssignee}
                    verificaciones={verificaciones}
                  />
                </CardContent>
              </Card>
            </section>
          ))}
          {filtered.length === 0 && (
            <EmptyState
              icon={CarIcon}
              title={q ? `Sin resultados para “${query.trim()}”` : 'Sin vehículos para este filtro'}
              hint="Probá cambiar la búsqueda o los filtros."
            />
          )}
        </div>
      )}

      {vendidos.length > 0 && (
        <section>
          <p className="text-xs text-muted-foreground uppercase tracking-wide mb-3">Vendidos ({vendidos.length})</p>
          <Card size="sm">
            <CardContent className="p-0">
              <table className="w-full text-[13px]">
                <tbody className="divide-y divide-border">
                  {vendidos.map(v => (
                        <tr
                          key={v.id}
                          onClick={() => setOpenId(v.id)}
                          className="cursor-pointer transition-colors hover:bg-muted/30"
                        >
                          <td className="px-4 py-2">
                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                aria-haspopup="dialog"
                                onClick={e => { e.stopPropagation(); setOpenId(v.id) }}
                                className="flex items-center gap-1.5 rounded text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                              >
                                <span>{v.marca} {v.modelo} {v.año}</span>
                              </button>
                              {v.color && <span className="text-xs text-muted-foreground">· {v.color}</span>}
                              {v.tipo_operacion && (
                                <span className="text-xs text-muted-foreground">· {v.tipo_operacion}</span>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-2 text-right text-muted-foreground font-mono tabular-nums">
                            {v.precio_venta_final ? money(v.precio_venta_final) : '—'}
                          </td>
                          <td className="px-4 py-2 text-right text-xs text-muted-foreground">
                            {fmtFecha(v.fecha_venta)}
                          </td>
                        </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </section>
      )}

      <VehicleDialog
        v={vehicles.find((x: any) => x.id === openId) ?? null}
        onOpenChange={o => { if (!o) setOpenId(null) }}
        clientes={clientes}
        vehicles={vehicles}
        movimientos={movimientos}
        prestamos={prestamos}
        tareas={tareas}
        verificaciones={verificaciones}
        cuentas={cuentas}
        comisionPct={comisionPct}
        documentosHabilitado={documentosHabilitado}
      />
    </div>
  )
}
