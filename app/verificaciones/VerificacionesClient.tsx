'use client'
import { useState, Fragment } from 'react'
import { useRouter } from 'next/navigation'
import { deleteRecordDetailed, patchRecordDetailed, postRecord } from '@/lib/kapso'
import { fmtDMY as fmtFecha, todayKey as today } from '@/lib/date'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { FField, nativeSelectCls } from '@/components/form-fields'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, useDirtyClose } from '@/components/ui/dialog'
import { formSucio } from '@/lib/dirty'
import { toast } from 'sonner'
import { ChevronDownIcon, ChevronUpIcon, PlusIcon, ClipboardCheckIcon } from 'lucide-react'
import { EmptyState } from '@/components/empty-state'
import { esExterna, sinAuto } from '@/lib/verificaciones'
import { money } from '@/lib/money'

const ESTADO_VARIANT: Record<string, 'default' | 'secondary' | 'outline' | 'destructive' | 'success' | 'warning' | 'info'> = {
  pendiente: 'warning',
  hecha:     'info',
  pagada:    'success',
}

const ESTADOS: string[] = ['pendiente', 'hecha', 'pagada']

function autoLabel(v: any): string {
  if (!v) return '—'
  const base = `${v.marca ?? ''} ${v.modelo ?? ''} ${v.año ?? ''}`.trim()
  return v.dominio ? `${base} (${v.dominio})` : base || `#${v.id}`
}

function VerificacionEdit({
  v, vehicles, onDone,
}: {
  v: any; vehicles: any[]; onDone: () => void
}) {
  const [vehicleId, setVehicleId] = useState<number | ''>(v.vehicle_id ?? '')
  const [mecanico, setMecanico] = useState<string>(v.mecanico ?? 'Maxi')
  const [resultado, setResultado] = useState<string>(v.resultado ?? '')
  const [monto, setMonto] = useState<string>(v.monto != null ? String(v.monto) : '')
  const [fechaVerificacion, setFechaVerificacion] = useState<string>((v.fecha_verificacion ?? '').slice(0, 10))
  const [fechaPago, setFechaPago] = useState<string>((v.fecha_pago ?? '').slice(0, 10))
  const [notas, setNotas] = useState<string>(v.notas ?? '')
  const [saving, setSaving] = useState(false)
  const [confirmDel, setConfirmDel] = useState(false)

  async function save() {
    setSaving(true)
    const patchData: Record<string, any> = {
      vehicle_id: vehicleId || null,
      mecanico,
      resultado,
      monto: monto !== '' && !Number.isNaN(Number(monto)) ? Number(monto) : null,
      fecha_verificacion: fechaVerificacion || null,
      fecha_pago: fechaPago || null,
      notas,
    }
    const { ok, error } = await patchRecordDetailed('verificaciones_mecanicas', v.id, patchData)
    setSaving(false)
    if (ok) { toast.success('Verificación actualizada'); onDone() }
    else toast.error(error || 'Error al guardar.')
  }

  async function cambiarEstado(est: string) {
    if (saving) return                        // double-click = duplicate PATCH
    setSaving(true)
    const patch: Record<string, any> = { estado: est }
    if (est === 'pagada' && !fechaPago) {
      patch.fecha_pago = today()
      setFechaPago(patch.fecha_pago)
    }
    const { ok, error } = await patchRecordDetailed('verificaciones_mecanicas', v.id, patch)
    setSaving(false)
    if (ok) { toast.success(`Estado: ${est}`); onDone() }
    else toast.error(error || 'Error al cambiar estado.')
  }

  async function eliminar() {
    const { ok, error } = await deleteRecordDetailed('verificaciones_mecanicas', v.id)
    setConfirmDel(false)
    if (ok) { toast.success('Verificación eliminada'); onDone() }
    else toast.error(error || 'Error al eliminar.')
  }

  return (
    <div className="px-3 pb-4 pt-3 bg-muted/30 border-b space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-x-4 gap-y-3">
        <FField label="Vehículo" className="md:col-span-2">
          <select
            value={vehicleId}
            onChange={e => setVehicleId(e.target.value ? Number(e.target.value) : '')}
            className={nativeSelectCls}
          >
            <option value="">—</option>
            {vehicles.map(veh => (
              <option key={veh.id} value={veh.id}>{autoLabel(veh)}</option>
            ))}
          </select>
        </FField>
        <FField label="Mecánico">
          <Input type="text" value={mecanico} onChange={e => setMecanico(e.target.value)} />
        </FField>
        <FField label="Monto (USD)">
          <Input type="number" value={monto} onChange={e => setMonto(e.target.value)} />
        </FField>

        <FField label="Fecha verificación">
          <Input type="date" value={fechaVerificacion} onChange={e => setFechaVerificacion(e.target.value)} />
        </FField>
        <FField label="Fecha pago">
          <Input type="date" value={fechaPago} onChange={e => setFechaPago(e.target.value)} />
        </FField>

        <FField label="Resultado (transcripción)" className="md:col-span-2 xl:col-span-4">
          <Textarea value={resultado} onChange={e => setResultado(e.target.value)} rows={4} />
        </FField>
        <FField label="Notas" className="md:col-span-2 xl:col-span-4">
          <Textarea value={notas} onChange={e => setNotas(e.target.value)} rows={2} />
        </FField>
      </div>

      <div className="flex items-center justify-between pt-3 border-t">
        <div className="flex items-center gap-1.5 flex-wrap">
          {ESTADOS.map(est => (
            <Button
              key={est}
              size="xs"
              variant={v.estado === est ? 'default' : 'outline'}
              aria-pressed={v.estado === est}
              onClick={() => cambiarEstado(est)}
              disabled={saving}
            >
              {est}
            </Button>
          ))}
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="ghost" onClick={() => setConfirmDel(true)} className="text-destructive hover:text-destructive">
            Eliminar
          </Button>
          <Button size="sm" onClick={save} disabled={saving}>
            {saving ? 'Guardando…' : 'Guardar'}
          </Button>
        </div>
      </div>

      <Dialog open={confirmDel} onOpenChange={setConfirmDel}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Eliminar verificación</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">Esta acción no se puede deshacer.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDel(false)}>Cancelar</Button>
            <Button variant="destructive" onClick={eliminar}>Eliminar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function NuevaVerificacionDialog({
  open, onOpenChange, vehicles, onDone,
}: {
  open: boolean; onOpenChange: (o: boolean) => void;
  vehicles: any[]; onDone: () => void
}) {
  // 'sin_auto' es la opción explícita "todavía no sé de qué auto es" (persiste
  // vehicle_id null); el '' del placeholder sigue siendo error, así una omisión
  // accidental no crea filas huérfanas.
  const [vehicleId, setVehicleId] = useState<number | '' | 'sin_auto'>('')
  const [mecanico, setMecanico] = useState('Maxi')
  const [monto, setMonto] = useState('')
  const [fechaVerificacion, setFechaVerificacion] = useState(today())
  const [notas, setNotas] = useState('')
  const [saving, setSaving] = useState(false)
  const [errVehiculo, setErrVehiculo] = useState('')

  // Los campos no viven en un objeto `form`, así que la comparación se arma acá.
  // El inicial es el sembrado: mecánico "Maxi" y la fecha de hoy no son cambios.
  const { dialogProps, cerrar } = useDirtyClose({
    sucio: formSucio(
      { vehicleId, mecanico, monto, fechaVerificacion, notas },
      { vehicleId: '', mecanico: 'Maxi', monto: '', fechaVerificacion: today(), notas: '' },
    ),
    onOpenChange,
  })

  async function save() {
    if (!vehicleId) { setErrVehiculo('Elegí un vehículo'); toast.error('Elegí un vehículo'); return }
    setErrVehiculo('')
    setSaving(true)
    const payload: any = {
      vehicle_id: vehicleId === 'sin_auto' ? null : vehicleId,
      estado: 'pendiente',
      mecanico,
      fecha_verificacion: fechaVerificacion || null,
      notas,
    }
    if (monto !== '' && !Number.isNaN(Number(monto))) payload.monto = Number(monto)
    const res = await postRecord('verificaciones_mecanicas', payload)
    setSaving(false)
    if (res.ok) {
      toast.success('Verificación creada')
      onOpenChange(false)
      setVehicleId(''); setMecanico('Maxi'); setMonto('')
      setFechaVerificacion(today()); setNotas('')
      onDone()
    } else {
      toast.error('Error al crear.')
    }
  }

  return (
    <Dialog open={open} {...dialogProps}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Nueva verificación</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <FField label="Vehículo" error={errVehiculo} className="md:col-span-2">
            <select
              value={vehicleId}
              onChange={e => {
                const val = e.target.value
                setVehicleId(val === '' ? '' : val === 'sin_auto' ? 'sin_auto' : Number(val))
                if (val) setErrVehiculo('')
              }}
              className={nativeSelectCls}
            >
              <option value="">—</option>
              <option value="sin_auto">Sin auto asignado (elegir después)</option>
              {vehicles.map(v => (
                <option key={v.id} value={v.id}>{autoLabel(v)}</option>
              ))}
            </select>
          </FField>
          <FField label="Mecánico">
            <Input type="text" value={mecanico} onChange={e => setMecanico(e.target.value)} />
          </FField>
          <FField label="Monto (USD)">
            <Input type="number" value={monto} onChange={e => setMonto(e.target.value)} />
          </FField>
          <FField label="Fecha verificación" className="md:col-span-2">
            <Input type="date" value={fechaVerificacion} onChange={e => setFechaVerificacion(e.target.value)} />
          </FField>
          <FField label="Notas" className="md:col-span-2">
            <Textarea value={notas} onChange={e => setNotas(e.target.value)} rows={2} />
          </FField>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={cerrar}>Cancelar</Button>
          <Button onClick={save} disabled={saving}>{saving ? 'Creando…' : 'Crear'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default function VerificacionesClient({
  verificaciones, vehicles,
}: {
  verificaciones: any[]; vehicles: any[]
}) {
  const router = useRouter()
  const [expanded, setExpanded] = useState<Set<number>>(new Set())
  const [filtro, setFiltro] = useState<'falta_pagar' | 'pagas'>('falta_pagar')
  const [showNew, setShowNew] = useState(false)

  function toggle(id: number) {
    setExpanded(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const refresh = () => router.refresh()

  const faltaPagar = verificaciones.filter(v => v.estado === 'pendiente' || v.estado === 'hecha')
  const pagas = verificaciones.filter(v => v.estado === 'pagada')
  const mostrar = filtro === 'falta_pagar' ? faltaPagar : pagas

  const totalFaltaPagar = faltaPagar.reduce((s, v) => s + Number(v.monto ?? 0), 0)
  const cantSinAuto = faltaPagar.filter(sinAuto).length

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="flex items-baseline gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">Verificaciones</h1>
          <span className="text-sm text-muted-foreground">
            {faltaPagar.length} falta pagar · {pagas.length} pagas
            {totalFaltaPagar > 0 ? ` · ${money(totalFaltaPagar)} por pagar` : ''}
            {cantSinAuto > 0 && (
              <span className="text-warning"> · {cantSinAuto} sin auto</span>
            )}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" onClick={() => setShowNew(true)}>
            <PlusIcon className="size-4" /> Nueva
          </Button>
          <Tabs value={filtro} onValueChange={(v: any) => setFiltro(v as any)}>
            <TabsList>
              <TabsTrigger value="falta_pagar">Falta pagar</TabsTrigger>
              <TabsTrigger value="pagas">Pagas</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </div>

      <NuevaVerificacionDialog
        open={showNew}
        onOpenChange={setShowNew}
        vehicles={vehicles}
        onDone={refresh}
      />

      <Card size="sm">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b bg-muted/40 text-left">
                  <th className="px-3 py-2 text-2xs font-medium uppercase tracking-wide text-muted-foreground">Auto</th>
                  <th className="px-3 py-2 text-2xs font-medium uppercase tracking-wide text-muted-foreground">Mecánico</th>
                  <th className="px-3 py-2 text-2xs font-medium uppercase tracking-wide text-muted-foreground">Resultado</th>
                  <th className="px-3 py-2 text-2xs font-medium uppercase tracking-wide text-muted-foreground text-right">Monto</th>
                  <th className="px-3 py-2 text-2xs font-medium uppercase tracking-wide text-muted-foreground">Fecha verif.</th>
                  <th className="px-3 py-2 text-2xs font-medium uppercase tracking-wide text-muted-foreground">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {mostrar.map(v => {
                  const isOpen = expanded.has(v.id)
                  // Number() en ambos lados: en modo Kapso/D1 la FK puede venir
                  // como string y el === estricto no matchearía (incidente 130i).
                  const vehicle = v.vehicle_id != null && v.vehicle_id !== ''
                    ? vehicles.find(x => Number(x.id) === Number(v.vehicle_id))
                    : undefined
                  const monto = v.monto != null ? Number(v.monto) : null
                  const resultadoCorto = v.resultado
                    ? (v.resultado.length > 80 ? v.resultado.slice(0, 80) + '…' : v.resultado)
                    : '—'
                  return (
                    <Fragment key={v.id}>
                      <tr
                        onClick={() => toggle(v.id)}
                        className={`cursor-pointer transition-colors ${isOpen ? 'bg-muted/30' : 'hover:bg-muted/30'}`}
                      >
                        <td className="px-3 py-2">
                          {/* Botón real: la fila entera sigue clickeable con mouse, pero
                              teclado y lector llegan por acá (mismo patrón que Stock móvil). */}
                          <button
                            type="button"
                            aria-expanded={isOpen}
                            onClick={e => { e.stopPropagation(); toggle(v.id) }}
                            className="flex items-center gap-1.5 rounded text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          >
                            {isOpen
                              ? <ChevronUpIcon className="size-3 text-muted-foreground" aria-hidden />
                              : <ChevronDownIcon className="size-3 text-muted-foreground" aria-hidden />}
                            {/* Sin vehículo resuelto: externa (no alerta), sin
                                asignar (badge ámbar) o vehicle_id de un auto
                                borrado (queda el '—' de siempre). */}
                            {vehicle
                              ? <span className="font-medium">{autoLabel(vehicle)}</span>
                              : esExterna(v)
                                ? <Badge variant="secondary">Externo</Badge>
                                : sinAuto(v)
                                  ? <Badge variant="warning">Sin auto</Badge>
                                  : <span className="font-medium">—</span>}
                          </button>
                        </td>
                        <td className="px-3 py-2 text-muted-foreground">{v.mecanico || '—'}</td>
                        <td className="px-3 py-2 text-muted-foreground max-w-md truncate">{resultadoCorto}</td>
                        <td className="px-3 py-2 text-right font-mono tabular-nums">
                          {money(monto)}
                        </td>
                        <td className="px-3 py-2 text-muted-foreground text-xs font-mono tabular-nums">
                          {fmtFecha(v.fecha_verificacion)}
                        </td>
                        <td className="px-3 py-2">
                          <Badge variant={ESTADO_VARIANT[v.estado] ?? 'outline'}>
                            {v.estado}
                          </Badge>
                        </td>
                      </tr>
                      {isOpen && (
                        <tr>
                          <td colSpan={6} className="p-0">
                            <VerificacionEdit
                              v={v}
                              vehicles={vehicles}
                              onDone={refresh}
                            />
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  )
                })}
                {mostrar.length === 0 && (
                  <tr>
                    <td colSpan={6}>
                      <EmptyState
                        icon={ClipboardCheckIcon}
                        title={`Sin verificaciones ${filtro === 'falta_pagar' ? 'por pagar' : 'pagas'}`}
                      />
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
