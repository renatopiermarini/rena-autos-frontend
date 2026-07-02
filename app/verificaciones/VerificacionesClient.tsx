'use client'
import { useState, Fragment } from 'react'
import { useRouter } from 'next/navigation'
import { patchRecord, postRecord, deleteRecord } from '@/lib/kapso'
import { fmtDMY as fmtFecha, todayKey as today } from '@/lib/date'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { toast } from 'sonner'
import { ChevronDownIcon, ChevronUpIcon, PlusIcon, ClipboardCheckIcon } from 'lucide-react'
import { EmptyState } from '@/components/empty-state'

const ESTADO_VARIANT: Record<string, 'default' | 'secondary' | 'outline' | 'destructive' | 'success' | 'warning' | 'info'> = {
  pendiente: 'warning',
  hecha:     'info',
  pagada:    'success',
}

const ESTADOS: string[] = ['pendiente', 'hecha', 'pagada']

const nativeSelectCls =
  'h-9 w-full rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50'

function autoLabel(v: any): string {
  if (!v) return '—'
  const base = `${v.marca ?? ''} ${v.modelo ?? ''} ${v.año ?? ''}`.trim()
  return v.dominio ? `${base} (${v.dominio})` : base || `#${v.id}`
}

function FField({ label, children, className = '' }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`space-y-1.5 ${className}`}>
      <Label className="text-xs text-muted-foreground uppercase tracking-wide">{label}</Label>
      {children}
    </div>
  )
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
    const ok = await patchRecord('verificaciones_mecanicas', v.id, patchData)
    setSaving(false)
    if (ok) { toast.success('Verificación actualizada'); onDone() }
    else toast.error('Error al guardar.')
  }

  async function cambiarEstado(est: string) {
    const patch: Record<string, any> = { estado: est }
    if (est === 'pagada' && !fechaPago) {
      patch.fecha_pago = today()
      setFechaPago(patch.fecha_pago)
    }
    const ok = await patchRecord('verificaciones_mecanicas', v.id, patch)
    if (ok) { toast.success(`Estado: ${est}`); onDone() }
    else toast.error('Error al cambiar estado.')
  }

  async function eliminar() {
    const ok = await deleteRecord('verificaciones_mecanicas', v.id)
    setConfirmDel(false)
    if (ok) { toast.success('Verificación eliminada'); onDone() }
    else toast.error('Error al eliminar.')
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
              onClick={() => cambiarEstado(est)}
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
  const [vehicleId, setVehicleId] = useState<number | ''>('')
  const [mecanico, setMecanico] = useState('Maxi')
  const [monto, setMonto] = useState('')
  const [fechaVerificacion, setFechaVerificacion] = useState(today())
  const [notas, setNotas] = useState('')
  const [saving, setSaving] = useState(false)

  async function save() {
    if (!vehicleId) { toast.error('Elegí un vehículo'); return }
    setSaving(true)
    const payload: any = {
      vehicle_id: vehicleId,
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Nueva verificación</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <FField label="Vehículo" className="md:col-span-2">
            <select
              value={vehicleId}
              onChange={e => setVehicleId(e.target.value ? Number(e.target.value) : '')}
              className={nativeSelectCls}
            >
              <option value="">—</option>
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
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
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

  return (
    <div className="space-y-4">
      <div className="flex items-baseline justify-between">
        <div className="flex items-baseline gap-3">
          <h1 className="text-xl font-semibold">Verificaciones</h1>
          <span className="text-sm text-muted-foreground">
            {faltaPagar.length} falta pagar · {pagas.length} pagas
            {totalFaltaPagar > 0 ? ` · USD ${totalFaltaPagar.toLocaleString('es-AR')} por pagar` : ''}
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
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/40 text-left">
                  <th className="px-3 py-2 font-medium text-muted-foreground text-xs">Auto</th>
                  <th className="px-3 py-2 font-medium text-muted-foreground text-xs">Mecánico</th>
                  <th className="px-3 py-2 font-medium text-muted-foreground text-xs">Resultado</th>
                  <th className="px-3 py-2 font-medium text-muted-foreground text-xs text-right">Monto</th>
                  <th className="px-3 py-2 font-medium text-muted-foreground text-xs">Fecha verif.</th>
                  <th className="px-3 py-2 font-medium text-muted-foreground text-xs">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {mostrar.map(v => {
                  const isOpen = expanded.has(v.id)
                  const vehicle = vehicles.find(x => x.id === v.vehicle_id)
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
                        <td className="px-3 py-2.5">
                          <div className="flex items-center gap-1.5">
                            {isOpen
                              ? <ChevronUpIcon className="size-3 text-muted-foreground" />
                              : <ChevronDownIcon className="size-3 text-muted-foreground" />}
                            <span className="font-medium">{autoLabel(vehicle)}</span>
                          </div>
                        </td>
                        <td className="px-3 py-2.5 text-muted-foreground">{v.mecanico || '—'}</td>
                        <td className="px-3 py-2.5 text-muted-foreground max-w-md truncate">{resultadoCorto}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums">
                          {monto != null ? `USD ${monto.toLocaleString('es-AR')}` : '—'}
                        </td>
                        <td className="px-3 py-2.5 text-muted-foreground text-xs tabular-nums">
                          {fmtFecha(v.fecha_verificacion)}
                        </td>
                        <td className="px-3 py-2.5">
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
