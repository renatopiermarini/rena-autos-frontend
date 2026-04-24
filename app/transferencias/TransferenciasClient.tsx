'use client'
import { useState, Fragment } from 'react'
import { useRouter } from 'next/navigation'
import { patchRecord, postRecord, deleteRecord } from '@/lib/kapso'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { toast } from 'sonner'
import { ChevronDownIcon, ChevronUpIcon, PlusIcon } from 'lucide-react'

const ESTADO_VARIANT: Record<string, 'default' | 'secondary' | 'outline' | 'destructive'> = {
  pendiente:  'secondary',
  en_proceso: 'default',
  completada: 'outline',
  cancelada:  'outline',
}

const ESTADOS: string[] = ['pendiente', 'en_proceso', 'completada', 'cancelada']

const nativeSelectCls =
  'h-9 w-full rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50'

function fmtFecha(iso: string | null | undefined) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit' })
}

function autoLabel(v: any): string {
  if (!v) return '—'
  const base = `${v.marca ?? ''} ${v.modelo ?? ''} ${v.año ?? ''}`.trim()
  return v.dominio ? `${base} (${v.dominio})` : base || `#${v.id}`
}

function vendedorDe(vehicle: any, clientes: any[]): string {
  if (!vehicle?.cliente_id) return '—'
  const c = clientes.find(c => c.id === vehicle.cliente_id)
  return c?.nombre || '—'
}

function montoDe(vehicle: any): number | null {
  if (!vehicle) return null
  const v = vehicle.precio_venta_final ?? vehicle.precio_publicado ?? null
  return v == null ? null : Number(v)
}

function isTruthy(v: any): boolean {
  return v === true || v === 1 || v === '1' || v === 'true'
}

function FField({ label, children, className = '' }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`space-y-1.5 ${className}`}>
      <Label className="text-xs text-muted-foreground uppercase tracking-wide">{label}</Label>
      {children}
    </div>
  )
}

function TransferenciaEdit({
  t, vehicle, clientes, vehicles, onDone,
}: {
  t: any; vehicle: any; clientes: any[]; vehicles: any[]; onDone: () => void
}) {
  const [vehicleId, setVehicleId] = useState<number | ''>(t.vehicle_id ?? '')
  const [compradorId, setCompradorId] = useState<number | ''>(t.comprador_id ?? '')
  const [compradorNombre, setCompradorNombre] = useState<string>(t.comprador_nombre ?? '')
  const [monto, setMonto] = useState<string>(montoDe(vehicle)?.toString() ?? '')
  const [medioPago, setMedioPago] = useState<string>(t.medio_pago ?? '')
  const [registro, setRegistro] = useState<string>(t.registro ?? '')
  const [ubicacion, setUbicacion] = useState<string>(t.ubicacion ?? '')
  const [precarga, setPrecarga] = useState<boolean>(isTruthy(t.precarga))
  const [fechaTurno, setFechaTurno] = useState<string>((t.fecha_turno ?? '').slice(0, 10))
  const [horario, setHorario] = useState<string>(t.horario ?? '')
  const [notas, setNotas] = useState<string>(t.notas ?? '')
  const [saving, setSaving] = useState(false)
  const [confirmDel, setConfirmDel] = useState(false)

  async function save() {
    setSaving(true)
    const veh = vehicles.find(v => v.id === vehicleId)
    const patchData: Record<string, any> = {
      vehicle_id: vehicleId || null,
      auto: veh ? autoLabel(veh) : t.auto,
      comprador_id: compradorId || null,
      comprador_nombre: compradorNombre,
      medio_pago: medioPago,
      registro: registro,
      ubicacion: ubicacion,
      precarga: precarga ? 1 : 0,
      fecha_turno: fechaTurno || null,
      horario: horario,
      notas: notas,
    }
    const ok = await patchRecord('transferencias', t.vehicle_id, patchData, 'vehicle_id')
    if (vehicleId && monto !== '' && !Number.isNaN(Number(monto))) {
      await patchRecord('vehicles', Number(vehicleId), { precio_venta_final: Number(monto) })
    }
    setSaving(false)
    if (ok) { toast.success('Transferencia actualizada'); onDone() }
    else toast.error('Error al guardar.')
  }

  async function cambiarEstado(est: string) {
    const ok = await patchRecord('transferencias', t.vehicle_id, { estado: est }, 'vehicle_id')
    if (est === 'completada' && t.vehicle_id) {
      await patchRecord('vehicles', t.vehicle_id, {
        estado: 'vendido',
        fecha_venta: new Date().toISOString().slice(0, 10),
      })
    }
    if (ok) { toast.success(`Estado: ${est.replace(/_/g, ' ')}`); onDone() }
    else toast.error('Error al cambiar estado.')
  }

  async function eliminar() {
    const ok = await deleteRecord('transferencias', t.vehicle_id, 'vehicle_id')
    setConfirmDel(false)
    if (ok) { toast.success('Transferencia eliminada'); onDone() }
    else toast.error('Error al eliminar.')
  }

  return (
    <div className="px-3 pb-4 pt-3 bg-muted/30 border-b space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-x-4 gap-y-3">
        <FField label="Vehículo">
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
        <FField label="Vendedor">
          <div className="h-9 flex items-center text-sm text-muted-foreground px-1">
            {vendedorDe(vehicles.find(v => v.id === vehicleId), clientes)}
          </div>
        </FField>
        <FField label="Comprador">
          <select
            value={compradorId}
            onChange={e => {
              const id = e.target.value ? Number(e.target.value) : ''
              setCompradorId(id)
              const c = clientes.find(c => c.id === id)
              if (c) setCompradorNombre(c.nombre ?? '')
            }}
            className={nativeSelectCls}
          >
            <option value="">— (escribir nombre abajo)</option>
            {clientes.map(c => (
              <option key={c.id} value={c.id}>{c.nombre}</option>
            ))}
          </select>
        </FField>
        <FField label="Nombre comprador">
          <Input
            type="text"
            value={compradorNombre}
            onChange={e => setCompradorNombre(e.target.value)}
            placeholder="Nombre"
          />
        </FField>

        <FField label="Monto (USD)">
          <Input type="number" value={monto} onChange={e => setMonto(e.target.value)} />
        </FField>
        <FField label="Medio de pago">
          <select value={medioPago} onChange={e => setMedioPago(e.target.value)} className={nativeSelectCls}>
            <option value="">—</option>
            <option>efectivo</option>
            <option>transferencia bancaria</option>
            <option>cheque</option>
            <option>mixto</option>
          </select>
        </FField>
        <FField label="Precarga digital">
          <label className="flex items-center gap-2 h-9">
            <input
              type="checkbox"
              checked={precarga}
              onChange={e => setPrecarga(e.target.checked)}
              className="size-4 rounded border-input"
            />
            <span className="text-sm text-muted-foreground">{precarga ? 'Sí' : 'No'}</span>
          </label>
        </FField>
        <FField label="Registro seccional">
          <Input type="text" value={registro} onChange={e => setRegistro(e.target.value)} />
        </FField>

        <FField label="Fecha del turno">
          <Input type="date" value={fechaTurno} onChange={e => setFechaTurno(e.target.value)} />
        </FField>
        <FField label="Hora">
          <Input type="time" value={horario} onChange={e => setHorario(e.target.value)} />
        </FField>
        <FField label="Ubicación" className="md:col-span-2">
          <Input type="text" value={ubicacion} onChange={e => setUbicacion(e.target.value)} />
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
              variant={t.estado === est ? 'default' : 'outline'}
              onClick={() => cambiarEstado(est)}
            >
              {est.replace(/_/g, ' ')}
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
            <DialogTitle>Eliminar transferencia</DialogTitle>
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

function NuevaTransferenciaDialog({
  open, onOpenChange, vehicles, clientes, onDone,
}: {
  open: boolean; onOpenChange: (o: boolean) => void;
  vehicles: any[]; clientes: any[]; onDone: () => void
}) {
  const [vehicleId, setVehicleId] = useState<number | ''>('')
  const [compradorId, setCompradorId] = useState<number | ''>('')
  const [compradorNombre, setCompradorNombre] = useState('')
  const [monto, setMonto] = useState('')
  const [fechaTurno, setFechaTurno] = useState('')
  const [horario, setHorario] = useState('')
  const [saving, setSaving] = useState(false)

  async function save() {
    if (!vehicleId) { toast.error('Elegí un vehículo'); return }
    if (!compradorNombre) { toast.error('Falta el comprador'); return }
    setSaving(true)
    const veh = vehicles.find(v => v.id === vehicleId)
    const payload: any = {
      vehicle_id: vehicleId,
      auto: veh ? autoLabel(veh) : '',
      comprador_id: compradorId || null,
      comprador_nombre: compradorNombre,
      estado: 'pendiente',
      fecha_turno: fechaTurno || null,
      horario: horario,
      precarga: 0,
    }
    const res = await postRecord('transferencias', payload)
    if (monto !== '' && !Number.isNaN(Number(monto))) {
      await patchRecord('vehicles', Number(vehicleId), { precio_venta_final: Number(monto) })
    }
    setSaving(false)
    if (res.ok) {
      toast.success('Transferencia creada')
      onOpenChange(false)
      setVehicleId(''); setCompradorId(''); setCompradorNombre('')
      setMonto(''); setFechaTurno(''); setHorario('')
      onDone()
    } else {
      toast.error('Error al crear.')
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Nueva transferencia</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <FField label="Vehículo">
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
          <FField label="Comprador (cliente)">
            <select
              value={compradorId}
              onChange={e => {
                const id = e.target.value ? Number(e.target.value) : ''
                setCompradorId(id)
                const c = clientes.find(c => c.id === id)
                if (c) setCompradorNombre(c.nombre ?? '')
              }}
              className={nativeSelectCls}
            >
              <option value="">—</option>
              {clientes.map(c => (
                <option key={c.id} value={c.id}>{c.nombre}</option>
              ))}
            </select>
          </FField>
          <FField label="Nombre del comprador" className="md:col-span-2">
            <Input
              type="text"
              value={compradorNombre}
              onChange={e => setCompradorNombre(e.target.value)}
              placeholder="Nombre"
            />
          </FField>
          <FField label="Monto (USD)">
            <Input type="number" value={monto} onChange={e => setMonto(e.target.value)} />
          </FField>
          <FField label="Fecha del turno">
            <Input type="date" value={fechaTurno} onChange={e => setFechaTurno(e.target.value)} />
          </FField>
          <FField label="Hora">
            <Input type="time" value={horario} onChange={e => setHorario(e.target.value)} />
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

export default function TransferenciasClient({
  transferencias, clientes, vehicles,
}: {
  transferencias: any[]; clientes: any[]; vehicles: any[]
}) {
  const router = useRouter()
  const [expanded, setExpanded] = useState<Set<number>>(new Set())
  const [filtro, setFiltro] = useState<'activas' | 'todas'>('activas')
  const [showNew, setShowNew] = useState(false)

  function toggle(id: number) {
    setExpanded(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const refresh = () => router.refresh()

  const activas = transferencias.filter(t => t.estado !== 'completada' && t.estado !== 'cancelada')
  const completadas = transferencias.filter(t => t.estado === 'completada')
  const mostrar = filtro === 'activas' ? activas : transferencias

  return (
    <div className="space-y-4">
      <div className="flex items-baseline justify-between">
        <div className="flex items-baseline gap-3">
          <h1 className="text-xl font-semibold">Transferencias</h1>
          <span className="text-sm text-muted-foreground">{activas.length} activas · {completadas.length} completadas</span>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" onClick={() => setShowNew(true)}>
            <PlusIcon className="size-4" /> Nueva
          </Button>
          <Tabs value={filtro} onValueChange={(v: any) => setFiltro(v as any)}>
            <TabsList>
              <TabsTrigger value="activas">Activas</TabsTrigger>
              <TabsTrigger value="todas">Todas</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </div>

      <NuevaTransferenciaDialog
        open={showNew}
        onOpenChange={setShowNew}
        vehicles={vehicles}
        clientes={clientes}
        onDone={refresh}
      />

      <Card size="sm">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/40 text-left">
                  <th className="px-3 py-2 font-medium text-muted-foreground text-xs">Auto</th>
                  <th className="px-3 py-2 font-medium text-muted-foreground text-xs">Vendedor</th>
                  <th className="px-3 py-2 font-medium text-muted-foreground text-xs">Comprador</th>
                  <th className="px-3 py-2 font-medium text-muted-foreground text-xs text-right">Monto</th>
                  <th className="px-3 py-2 font-medium text-muted-foreground text-xs">Turno</th>
                  <th className="px-3 py-2 font-medium text-muted-foreground text-xs">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {mostrar.map(t => {
                  const rowKey = t.id ?? t.vehicle_id
                  const isOpen = expanded.has(rowKey)
                  const vehicle = vehicles.find(v => v.id === t.vehicle_id)
                  const monto = montoDe(vehicle)
                  const vendedor = vendedorDe(vehicle, clientes)
                  return (
                    <Fragment key={rowKey}>
                      <tr
                        onClick={() => toggle(rowKey)}
                        className={`cursor-pointer transition-colors ${isOpen ? 'bg-muted/30' : 'hover:bg-muted/30'}`}
                      >
                        <td className="px-3 py-2.5">
                          <div className="flex items-center gap-1.5">
                            {isOpen
                              ? <ChevronUpIcon className="size-3 text-muted-foreground" />
                              : <ChevronDownIcon className="size-3 text-muted-foreground" />}
                            <span className="font-medium">{t.auto || '—'}</span>
                          </div>
                        </td>
                        <td className="px-3 py-2.5 text-muted-foreground">{vendedor}</td>
                        <td className="px-3 py-2.5 text-muted-foreground">{t.comprador_nombre || '—'}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums">
                          {monto != null ? `USD ${monto.toLocaleString('es-AR')}` : '—'}
                        </td>
                        <td className="px-3 py-2.5 text-muted-foreground text-xs tabular-nums">
                          {t.fecha_turno ? fmtFecha(t.fecha_turno) : '—'}
                          {t.horario ? ` ${t.horario}` : ''}
                        </td>
                        <td className="px-3 py-2.5">
                          <Badge variant={ESTADO_VARIANT[t.estado] ?? 'outline'}>
                            {t.estado?.replace(/_/g, ' ')}
                          </Badge>
                        </td>
                      </tr>
                      {isOpen && (
                        <tr>
                          <td colSpan={6} className="p-0">
                            <TransferenciaEdit
                              t={t}
                              vehicle={vehicle}
                              clientes={clientes}
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
                    <td colSpan={6} className="px-3 py-8 text-center text-muted-foreground">
                      Sin transferencias {filtro === 'activas' ? 'activas' : ''}.
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
