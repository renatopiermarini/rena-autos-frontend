'use client'
import { Fragment, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  computeVehicleFinancials, computeLoanPosition, computePatrimonio,
  computeLiquidacionConsignacion, affectsBalance, postRecord, capFirst,
  type CuentaInfo,
} from '@/lib/kapso'
import {
  validarMovimiento, CATEGORIAS_ELEGIBLES, CAT_VEHICLE_LINKED, CAT_LOAN_TIPO,
  CAT_CLIENTE_LINKED,
} from '@/lib/movimiento'
import { fmtDMY as fmtFecha, todayKey } from '@/lib/date'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { TooltipProvider, InfoTip } from '@/components/ui/tooltip'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { FField, FInput, FTextarea, nativeSelectCls as fieldSelectCls } from '@/components/form-fields'
import { toast } from 'sonner'
import { ChevronDownIcon, ChevronUpIcon, AlertTriangleIcon, PlusIcon } from 'lucide-react'

type Tab = 'resumen' | 'patrimonio' | 'prestamos' | 'por_vehiculo' | 'movimientos'

const TABS: { key: Tab; label: string }[] = [
  { key: 'resumen',      label: 'Resumen'      },
  { key: 'patrimonio',   label: 'Patrimonio'   },
  { key: 'prestamos',    label: 'Préstamos'    },
  { key: 'por_vehiculo', label: 'Por Vehículo' },
  { key: 'movimientos',  label: 'Movimientos'  },
]

const CAT_LABEL: Record<string, string> = {
  commission:          'Comisión',
  vehicle_purchase:    'Compra auto',
  vehicle_expense:     'Gasto auto',
  general_expense:     'Gasto general',
  marketing:           'Marketing',
  loan:                'Préstamo',
  loan_disbursement:   'Préstamo recibido',
  loan_interest:       'Interés préstamo',
  loan_repayment:      'Devolución préstamo',
  client_expense:      'Por cuenta del cliente',
  client_repayment:    'Cliente devolvió',
  refund:              'Reembolso',
  down_payment:        'Seña',
  personal_withdrawal: 'Retiro personal',
  investments:         'Inversión',
  venta:               'Venta',
  apertura:            'Apertura',
  ajuste:              'Ajuste',
  other:               'Otro',
  sin_categoria:       'Sin categoría',
}

const nativeSelectCls =
  'h-8 rounded-lg border border-input bg-transparent px-2.5 py-1 text-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50'

function fmt(n: any) {
  const v = Number(n ?? 0)
  return `$${v.toLocaleString('es-AR')}`
}
function autoLabel(v: any) {
  if (!v) return '—'
  const base = `${v.marca ?? ''} ${v.modelo ?? ''} ${v.año ?? ''}`.trim()
  return v.dominio ? `${base} (${v.dominio})` : base
}

function TipoAmount({ tipo, monto, size = 'sm' }: { tipo: string; monto: any; size?: 'sm' | 'xs' }) {
  const cls = tipo === 'ingreso' ? 'text-success' : 'text-destructive'
  const sign = tipo === 'ingreso' ? '+' : '-'
  return (
    <span className={`${size === 'sm' ? 'text-sm' : 'text-xs'} font-medium ${cls} tabular-nums`}>
      {sign}{fmt(monto)}
    </span>
  )
}

export default function FinanzasClient({
  balances, movimientos, prestamos, clientes, vehicles, cuentas, umbralCaja = 500,
}: {
  balances: any[]; movimientos: any[]; prestamos: any[]; clientes: any[]; vehicles: any[]
  // Las cajas del perfil (tabla `cuentas`) y el umbral de la alerta. Sin las
  // tablas de config llegan cash/nexo/fiwind y 500: lo de siempre.
  cuentas: CuentaInfo[]; umbralCaja?: number
}) {
  const [tab, setTab] = useState<Tab>('resumen')
  const [nuevoMov, setNuevoMov] = useState(false)
  const [nuevoPrestamo, setNuevoPrestamo] = useState(false)
  const cuentaKeys = useMemo(() => cuentas.map(c => c.clave), [cuentas])

  const clientesById = useMemo(
    () => Object.fromEntries(clientes.map((c: any) => [c.id, c])),
    [clientes],
  )
  const vehiclesById = useMemo(
    () => Object.fromEntries(vehicles.map((v: any) => [v.id, v])),
    [vehicles],
  )

  // Una sola pasada deriva TODO el patrimonio del ledger (misma matemática que
  // el bot: analisis_db(patrimonio) del backend).
  const patrimonio = useMemo(
    () => computePatrimonio(movimientos, vehicles, prestamos, clientes, undefined, cuentaKeys),
    [movimientos, vehicles, prestamos, clientes, cuentaKeys],
  )

  return (
    <TooltipProvider>
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold">Finanzas</h1>
        <div className="flex items-center gap-2">
          <Button size="sm" onClick={() => setNuevoMov(true)}>
            <PlusIcon className="size-4" /> Nuevo movimiento
          </Button>
          <Button size="sm" variant="outline" onClick={() => setNuevoPrestamo(true)}>
            <PlusIcon className="size-4" /> Nuevo préstamo
          </Button>
        </div>
      </div>

      <NuevoMovimientoDialog
        open={nuevoMov}
        onOpenChange={setNuevoMov}
        cuentas={cuentas}
        vehicles={vehicles}
        clientes={clientes}
        prestamos={prestamos}
      />
      <NuevoPrestamoDialog
        open={nuevoPrestamo}
        onOpenChange={setNuevoPrestamo}
        clientes={clientes}
        vehicles={vehicles}
      />

      <Tabs value={tab} onValueChange={(v: any) => setTab(v as Tab)}>
        <TabsList variant="line">
          {TABS.map(({ key, label }) => (
            <TabsTrigger key={key} value={key}>{label}</TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="resumen" className="mt-4">
          <ResumenTab
            patrimonio={patrimonio}
            movimientos={movimientos}
            clientesById={clientesById}
            vehiclesById={vehiclesById}
            cuentas={cuentas}
            umbralCaja={umbralCaja}
          />
        </TabsContent>
        <TabsContent value="patrimonio" className="mt-4">
          <PatrimonioTab patrimonio={patrimonio} clientesById={clientesById} cuentas={cuentas} />
        </TabsContent>
        <TabsContent value="prestamos" className="mt-4">
          <PrestamosTab
            prestamos={prestamos}
            movimientos={movimientos}
            patrimonio={patrimonio}
            clientesById={clientesById}
            vehiclesById={vehiclesById}
          />
        </TabsContent>
        <TabsContent value="por_vehiculo" className="mt-4">
          <PorVehiculoTab
            vehicles={vehicles}
            movimientos={movimientos}
            prestamos={prestamos}
            clientesById={clientesById}
          />
        </TabsContent>
        <TabsContent value="movimientos" className="mt-4">
          <MovimientosTab
            movimientos={movimientos}
            vehiclesById={vehiclesById}
            cuentas={cuentas}
          />
        </TabsContent>
      </Tabs>
    </div>
    </TooltipProvider>
  )
}

// ── Tab 1 · Resumen ───────────────────────────────────────────────────────────

function StatCard({
  label, value, sub, tip, tone = 'default',
}: {
  label: string; value: string; sub?: React.ReactNode; tip: React.ReactNode;
  tone?: 'default' | 'hero' | 'positive' | 'negative'
}) {
  return (
    <Card size="sm" className={tone === 'hero' ? 'bg-muted/40' : undefined}>
      <CardContent>
        <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1 flex items-center gap-1.5">
          {label} <InfoTip>{tip}</InfoTip>
        </p>
        <p className={`text-2xl tabular-nums ${
          tone === 'hero' ? 'font-semibold'
          : tone === 'positive' ? 'font-medium text-success'
          : tone === 'negative' ? 'font-medium text-destructive'
          : 'font-medium'
        }`}>{value}</p>
        {sub && <div className="text-xs text-muted-foreground mt-1">{sub}</div>}
      </CardContent>
    </Card>
  )
}

function ResumenTab({
  patrimonio, movimientos, clientesById, vehiclesById, cuentas, umbralCaja,
}: {
  patrimonio: ReturnType<typeof computePatrimonio>;
  movimientos: any[]; clientesById: any; vehiclesById: any
  cuentas: CuentaInfo[]; umbralCaja: number
}) {
  const movRecientes = [...movimientos]
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 20)

  const impagos = patrimonio.posiciones.filter(p => p.modalidad === 'mensual' && p.interes_mensual > 0 && p.interes_adeudado > 0)
  const alertas: string[] = []
  // La caja principal es la PRIMERA del perfil (la tabla `cuentas` manda el
  // orden) y el umbral sale de config_negocio. Sin config: cash y 500.
  const principal = cuentas[0]
  const saldoPrincipal = principal ? (patrimonio.cajas[principal.clave] ?? 0) : 0
  if (principal && saldoPrincipal < umbralCaja) {
    alertas.push(`${capFirst(principal.label)} bajo: ${fmt(saldoPrincipal)}`)
  }
  for (const p of patrimonio.posiciones.filter(p => p.vencido)) {
    alertas.push(`Préstamo #${p.id} marcado vencido — deuda ${fmt(p.deuda_total)}`)
  }
  for (const p of impagos) {
    alertas.push(`Interés del mes sin pagar: ${fmt(p.interes_adeudado)} (préstamo #${p.id}) — venció el 1`)
  }

  const pat = patrimonio
  return (
    <div className="space-y-4">
      {/* Patrimonio — la foto real de la plata, derivada del ledger */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        <StatCard
          tone="hero"
          label="Cajas"
          value={fmt(pat.cajas.total)}
          sub={cuentas.map(c => `${c.label} ${fmt(pat.cajas[c.clave] ?? 0)}`).join(' · ')}
          tip={<>Dinero físico y en cuentas, derivado como <b>suma de ingresos − egresos</b> del ledger (solo movimientos que afectan saldo). Incluye plata prestada: por eso solo, este número sobreestima lo que es tuyo.</>}
        />
        <StatCard
          label="Capital propio"
          value={fmt(pat.capital_propio)}
          sub="lo que queda si hoy cobrás y pagás todo"
          tip={<>La plata que es realmente tuya: <b>cajas {fmt(pat.cajas.total)}</b> + <b>stock {fmt(pat.stock.total)}</b>{pat.en_uso.total > 0 && <> + <b>auto en uso {fmt(pat.en_uso.total)}</b></>} + <b>por cobrar {fmt(pat.por_cobrar.total)}</b> − <b>deudas {fmt(pat.deuda_total)}</b>. Las cajas mezclan plata propia y prestada — este número es el que las separa. Todo sale del ledger de movimientos, no hay ningún saldo cargado a mano.</>}
        />
        <StatCard
          label="Stock a la venta"
          value={fmt(pat.stock.total)}
          sub={<>invertido {fmt(pat.stock.costo_invertido)} · <span className={pat.stock.ganancia_esperada >= 0 ? 'text-success' : 'text-destructive'}>ganancia esp. {pat.stock.ganancia_esperada >= 0 ? '+' : ''}{fmt(pat.stock.ganancia_esperada)}</span>{pat.en_uso.autos.length > 0 && <> · en uso: {pat.en_uso.autos.map(a => `${a.label} ${fmt(a.valor)}`).join(', ')}</>}</>}
          tip={<>Autos <b>propios sin vender</b> que están a la venta, valuados a lo que se espera obtener por cada uno (precio objetivo cargado en la ficha; sin dato, el costo invertido — nunca se inventa una valuación). Las consignaciones no cuentan (no son nuestras) y el <b>auto en uso</b> va aparte: es patrimonio pero no está a la venta. <b>Ganancia esperada</b> = valor de venta esperado − costo invertido (compra + gastos según el ledger): la ganancia que ya está &quot;adentro&quot; de los autos si se venden al precio previsto.{pat.stock.autos.length > 0 && <><br /><br />{pat.stock.autos.map(a => `${a.label}: ${fmt(a.valor)} (costo ${fmt(a.costo)})`).join(' · ')}</>}</>}
        />
        <StatCard
          label="Por cobrar"
          value={fmt(pat.por_cobrar.total)}
          sub={[
            ...pat.por_cobrar.clientes.map(c => `${c.nombre} ${fmt(c.saldo)}`),
            ...(pat.por_cobrar.comisiones_consignaciones.total > 0
              ? [`comisiones consig. ${fmt(pat.por_cobrar.comisiones_consignaciones.total)}`] : []),
          ].join(' · ') || 'nada por cobrar'}
          tip={<>Dos cosas: (1) plata nuestra en manos de clientes — gastos que adelantamos por su cuenta menos lo devuelto; (2) <b>comisiones esperadas de consignaciones</b>: nuestro 5% del precio objetivo de cada auto en consignación, que se cobra al venderlo.{pat.por_cobrar.comisiones_consignaciones.autos.length > 0 && <><br /><br />{pat.por_cobrar.comisiones_consignaciones.autos.map(a => `${a.label}: 5% de ${fmt(a.precio_base)} = ${fmt(a.comision)}`).join(' · ')}</>}</>}
        />
        <StatCard
          tone="negative"
          label="Deudas"
          value={fmt(pat.deuda_total)}
          sub={`interés mensual ${fmt(pat.interes_mensual_total)}/mes`}
          tip={<>Todo lo que debemos a acreedores: <b>capital vivo + interés devengado impago</b> de cada préstamo activo, calculado desde el ledger. Los préstamos con interés mensual pagan capital × tasa ÷ 12 el 1 de cada mes; los &quot;a saldar al final&quot; acumulan interés por día hasta que se cancelan (p. ej. con la venta del auto que financian). El detalle está en la pestaña Préstamos.</>}
        />
      </div>

      {/* Alertas */}
      {alertas.length > 0 && (
        <Card className="border-destructive/30 bg-destructive/5 py-3">
          <CardContent className="space-y-1">
            <div className="flex items-center gap-2 text-destructive text-xs font-semibold uppercase tracking-wide mb-1">
              <AlertTriangleIcon className="size-4" /> Alertas
            </div>
            {alertas.map((a, i) => (
              <p key={i} className="text-sm text-destructive">{a}</p>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Últimos movimientos */}
      <Card size="sm">
        <CardHeader className="border-b py-3">
          <CardTitle className="text-sm">Últimos movimientos</CardTitle>
        </CardHeader>
        <CardContent className="divide-y divide-border p-0 max-h-[500px] overflow-y-auto">
          {movRecientes.map((m: any) => {
            const veh = m.vehicle_id ? vehiclesById[m.vehicle_id] : null
            return (
              <div key={m.id} className="flex items-center justify-between px-3 py-2">
                <div className="flex items-center gap-3 min-w-0">
                  <Badge variant={m.tipo === 'ingreso' ? 'default' : 'outline'} className="w-16 justify-center">
                    {m.tipo}
                  </Badge>
                  <span className="text-sm truncate">{m.nota || CAT_LABEL[m.categoria] || m.categoria}</span>
                  <span className="text-xs text-muted-foreground capitalize whitespace-nowrap">{m.cuenta}</span>
                  {veh && (
                    <span className="text-xs text-muted-foreground whitespace-nowrap">· {veh.marca} {veh.modelo}</span>
                  )}
                </div>
                <div className="flex items-center gap-4 shrink-0">
                  <TipoAmount tipo={m.tipo} monto={m.monto} />
                  <span className="text-xs text-muted-foreground tabular-nums">{fmtFecha(m.created_at)}</span>
                </div>
              </div>
            )
          })}
          {movRecientes.length === 0 && (
            <p className="px-3 py-2.5 text-sm text-muted-foreground">Sin movimientos registrados.</p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

// ── Tab 2 · Patrimonio (el desglose completo) ─────────────────────────────────

function SectionTable({
  title, tip, children,
}: { title: string; tip: React.ReactNode; children: React.ReactNode }) {
  return (
    <Card size="sm">
      <CardHeader className="border-b py-3">
        <CardTitle className="text-sm flex items-center gap-1.5">{title} <InfoTip>{tip}</InfoTip></CardTitle>
      </CardHeader>
      <CardContent className="p-0">{children}</CardContent>
    </Card>
  )
}

function PatrimonioTab({
  patrimonio: pat, clientesById, cuentas,
}: {
  patrimonio: ReturnType<typeof computePatrimonio>; clientesById: any; cuentas: CuentaInfo[]
}) {
  const terms: { label: string; monto: number; sign: '+' | '−'; tip: React.ReactNode }[] = [
    { label: 'Cajas', monto: pat.cajas.total, sign: '+',
      tip: <>Suma de ingresos − egresos del ledger por cuenta: {cuentas.map(c => `${c.label} ${fmt(pat.cajas[c.clave] ?? 0)}`).join(', ')}.</> },
    { label: 'Stock a la venta', monto: pat.stock.total, sign: '+',
      tip: <>Autos propios sin vender, a valor esperado de venta (precio objetivo de la ficha; sin dato, el costo invertido).</> },
    ...(pat.en_uso.total > 0 ? [{
      label: 'Auto en uso', monto: pat.en_uso.total, sign: '+' as const,
      tip: <>El auto que usamos ({pat.en_uso.autos.map(a => a.label).join(', ')}): es patrimonio, pero no está a la venta — el &quot;disponible&quot; lo descuenta.</>,
    }] : []),
    { label: 'Por cobrar', monto: pat.por_cobrar.total, sign: '+',
      tip: <>Plata nuestra en manos de clientes: gastos adelantados por su cuenta menos lo devuelto.</> },
    { label: 'Deudas', monto: pat.deuda_total, sign: '−',
      tip: <>Capital vivo + interés devengado impago de cada préstamo activo.</> },
    ...(pat.parte_socios.total > 0 ? [{
      label: 'Parte de socios', monto: pat.parte_socios.total, sign: '−' as const,
      tip: <>Autos comprados a medias: el <b>capital</b> del socio ya está arriba en Deudas (entró como préstamo), pero la <b>mitad de la ganancia</b> tampoco es nuestra y antes se contaba como propia.<br /><br />{pat.parte_socios.autos.map(a => `${a.label}: ${a.pct}% de ${fmt(a.margen)} = ${fmt(a.parte)}${a.socio ? ` (${a.socio})` : ''}`).join(' · ')}</>,
    }] : []),
  ]

  return (
    <div className="space-y-4">
      {/* La ecuación completa */}
      <Card size="sm" className="bg-muted/40">
        <CardContent>
          <p className="text-xs text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1.5">
            Cómo se llega al capital propio
            <InfoTip>Todos los números se derivan del ledger de movimientos y de las fichas de los autos — nada se carga a mano. Si registrás un pago, una venta o un gasto por el bot, esta cuenta se actualiza sola.</InfoTip>
          </p>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            {terms.map((t, i) => (
              <Fragment key={t.label}>
                {i > 0 && <span className="text-muted-foreground text-lg">{t.sign === '−' ? '−' : '+'}</span>}
                <div>
                  <p className="text-[11px] text-muted-foreground flex items-center gap-1">{t.label} <InfoTip>{t.tip}</InfoTip></p>
                  <p className={`text-lg font-medium tabular-nums ${t.sign === '−' ? 'text-destructive' : ''}`}>{fmt(t.monto)}</p>
                </div>
              </Fragment>
            ))}
            <span className="text-muted-foreground text-lg">=</span>
            <div>
              <p className="text-[11px] text-muted-foreground">Capital propio</p>
              <p className="text-xl font-semibold tabular-nums">{fmt(pat.capital_propio)}</p>
            </div>
          </div>
          {pat.en_uso.total > 0 && (
            <p className="text-xs text-muted-foreground mt-2">
              Disponible sin vender el auto en uso: <span className="font-medium text-foreground tabular-nums">{fmt(pat.capital_propio_disponible)}</span>
            </p>
          )}
        </CardContent>
      </Card>

      {/* Stock a la venta + en uso, auto por auto */}
      <SectionTable
        title={`Stock (${pat.stock.autos.length + pat.en_uso.autos.length})`}
        tip={<>Cada auto propio sin vender, con su <b>costo invertido</b> (compra + gastos según el ledger), su <b>valor esperado</b> de venta y la <b>ganancia esperada</b> (valor − costo) que queda &quot;adentro&quot; si se vende al precio previsto.</>}
      >
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40">
              <tr className="text-left">
                <Th>Auto</Th>
                <Th right tip={<>Compra + gastos, derivado del ledger de movimientos.</>}>Costo invertido</Th>
                <Th right tip={<>Lo que se espera obtener: el precio objetivo de la ficha; si no hay, el costo (no se inventa valuación).</>}>Valor esperado</Th>
                <Th right tip={<>Valor esperado − costo invertido.</>}>Ganancia esp.</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {[...pat.stock.autos, ...pat.en_uso.autos.map(a => ({ ...a, enUso: true }))].map((a: any) => (
                <tr key={a.vehicle_id}>
                  <td className="px-3 py-2.5 font-medium">
                    {a.label}
                    {a.enUso && <Badge variant="outline" className="ml-2" title="Es patrimonio pero no está a la venta">en uso</Badge>}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">{fmt(a.costo)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{fmt(a.valor)}</td>
                  <td className={`px-3 py-2.5 text-right tabular-nums font-medium ${a.valor - a.costo >= 0 ? 'text-success' : 'text-destructive'}`}>
                    {a.valor - a.costo >= 0 ? '+' : ''}{fmt(a.valor - a.costo)}
                  </td>
                </tr>
              ))}
              <tr className="bg-muted/40 font-medium">
                <td className="px-3 py-2.5">Total (a la venta {fmt(pat.stock.total)}{pat.en_uso.total > 0 ? ` · en uso ${fmt(pat.en_uso.total)}` : ''})</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{fmt(pat.stock.costo_invertido + pat.en_uso.autos.reduce((s, a) => s + a.costo, 0))}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{fmt(pat.stock.total + pat.en_uso.total)}</td>
                <td className={`px-3 py-2.5 text-right tabular-nums ${pat.stock.ganancia_esperada >= 0 ? 'text-success' : 'text-destructive'}`}>
                  {pat.stock.ganancia_esperada >= 0 ? '+' : ''}{fmt(pat.stock.ganancia_esperada + pat.en_uso.autos.reduce((s, a) => s + (a.valor - a.costo), 0))}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </SectionTable>

      {/* Cuentas por cobrar */}
      <SectionTable
        title={`Por cobrar (${pat.por_cobrar.clientes.length + pat.por_cobrar.comisiones_consignaciones.autos.length})`}
        tip={<>Dos fuentes: gastos adelantados por cuenta de clientes (menos lo devuelto — al vender su auto se descuentan solos de la liquidación) y las <b>comisiones esperadas</b> de las consignaciones activas (5% del precio objetivo, se cobran al vender).</>}
      >
        {pat.por_cobrar.total <= 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Nada por cobrar.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40">
                <tr className="text-left">
                  <Th>Quién / qué</Th>
                  <Th tip={<><b>Deuda de cliente</b>: gastos adelantados por su cuenta. <b>Comisión consignación</b>: nuestro 5% del precio objetivo, esperado — se cobra al vender.</>}>Concepto</Th>
                  <Th right>Detalle</Th>
                  <Th right tip={<>Deuda de cliente: adelantado − devuelto. Comisión: 5% del precio objetivo.</>}>Monto</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {pat.por_cobrar.clientes.map(c => (
                  <tr key={`c${c.cliente_id}`}>
                    <td className="px-3 py-2.5 font-medium">{c.nombre}</td>
                    <td className="px-3 py-2.5 text-xs text-muted-foreground">deuda de cliente</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-xs text-muted-foreground">
                      adelantado {fmt(c.adelantado)} − devuelto {fmt(c.devuelto)}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums font-medium">{fmt(c.saldo)}</td>
                  </tr>
                ))}
                {pat.por_cobrar.comisiones_consignaciones.autos.map(a => (
                  <tr key={`v${a.vehicle_id}`}>
                    <td className="px-3 py-2.5 font-medium">{a.label}</td>
                    <td className="px-3 py-2.5 text-xs text-muted-foreground">comisión consignación (esperada)</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-xs text-muted-foreground">
                      5% de {fmt(a.precio_base)}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums font-medium">{fmt(a.comision)}</td>
                  </tr>
                ))}
                <tr className="bg-muted/40 font-medium">
                  <td className="px-3 py-2.5">Total</td>
                  <td className="px-3 py-2.5" colSpan={2} />
                  <td className="px-3 py-2.5 text-right tabular-nums">{fmt(pat.por_cobrar.total)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </SectionTable>

      {/* Deudas, préstamo por préstamo */}
      <SectionTable
        title={`Deudas (${pat.posiciones.length})`}
        tip={<>Cada préstamo activo con su deuda al día: capital vivo + interés devengado impago. El detalle completo (cuotas, modalidad, vencimientos) está en la pestaña Préstamos.</>}
      >
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40">
              <tr className="text-left">
                <Th>Acreedor</Th>
                <Th>Modalidad</Th>
                <Th right>Capital vivo</Th>
                <Th right>Interés adeudado</Th>
                <Th right>Deuda hoy</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {pat.posiciones.map(p => (
                <tr key={p.id}>
                  <td className="px-3 py-2.5 font-medium">
                    {clientesById[p.acreedor_id as any]?.nombre ?? `Préstamo #${p.id}`}
                  </td>
                  <td className="px-3 py-2.5 text-xs text-muted-foreground">
                    {p.modalidad === 'mensual'
                      ? `mensual · ${fmt(p.interes_mensual)}/mes (${p.tasa_pct}%)`
                      : `al final (${p.tasa_pct}% por día)`}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{fmt(p.capital_vivo)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">{fmt(p.interes_adeudado)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums font-medium">{fmt(p.deuda_total)}</td>
                </tr>
              ))}
              <tr className="bg-muted/40 font-medium">
                <td className="px-3 py-2.5">Total · interés mensual {fmt(pat.interes_mensual_total)}/mes</td>
                <td className="px-3 py-2.5" colSpan={3} />
                <td className="px-3 py-2.5 text-right tabular-nums text-destructive">{fmt(pat.deuda_total)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </SectionTable>
    </div>
  )
}

// ── Tab 3 · Préstamos ─────────────────────────────────────────────────────────

function PrestamosTab({
  prestamos, movimientos, patrimonio, clientesById, vehiclesById,
}: {
  prestamos: any[]; movimientos: any[]; patrimonio: ReturnType<typeof computePatrimonio>;
  clientesById: any; vehiclesById: any
}) {
  const pendientes = prestamos.filter((p: any) => p.estado !== 'pagado')
  const pagados = prestamos.filter((p: any) => p.estado === 'pagado')
  const acreedoresUnicos = new Set(pendientes.map((p: any) => p.acreedor_id)).size
  const mensuales = patrimonio.posiciones.filter(p => p.modalidad === 'mensual' && p.interes_mensual > 0)
  const alFinal = patrimonio.posiciones.filter(p => p.modalidad === 'al_final')

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <StatCard
          tone="hero"
          label="Deuda total hoy"
          value={fmt(patrimonio.deuda_total)}
          sub={`${pendientes.length} préstamo${pendientes.length === 1 ? '' : 's'} · ${acreedoresUnicos} acreedor${acreedoresUnicos === 1 ? '' : 'es'}`}
          tip={<>Lo que costaría cancelar todo hoy: <b>capital vivo</b> (lo prestado menos lo ya devuelto) + <b>interés devengado impago</b> de cada préstamo activo. Los pagos se descuentan solos porque salen del ledger, vinculados a cada préstamo.</>}
        />
        <StatCard
          label="Interés mensual"
          value={`${fmt(patrimonio.interes_mensual_total)}/mes`}
          sub="vence el 1 de cada mes"
          tip={<>Suma de las cuotas de interés de los préstamos con pago mensual: <b>capital × tasa anual ÷ 12</b>. El capital no baja con estas cuotas — solo se paga el interés del mes; el capital se devuelve aparte. El bot avisa por WhatsApp cada día 1.</>}
        />
        <StatCard
          label="Se saldan al final"
          value={fmt(round0(alFinal.reduce((s, p) => s + p.deuda_total, 0)))}
          sub={alFinal.length > 0 ? `${alFinal.length} préstamo${alFinal.length === 1 ? '' : 's'} acumulando interés por día` : 'ninguno'}
          tip={<>Préstamos que no pagan interés mes a mes: el interés se <b>acumula por día</b> (capital × tasa × días ÷ 365) y se cancela todo junto con el capital — típicamente con la venta del auto que financian.</>}
        />
      </div>

      <Card size="sm">
        <CardHeader className="border-b py-3">
          <CardTitle className="text-sm">Pendientes ({pendientes.length})</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <PrestamosTable
            prestamos={pendientes}
            movimientos={movimientos}
            clientesById={clientesById}
            vehiclesById={vehiclesById}
          />
        </CardContent>
      </Card>

      {pagados.length > 0 && (
        <Card size="sm">
          <CardHeader className="border-b py-3">
            <CardTitle className="text-sm">Pagados ({pagados.length})</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <PrestamosTable
              prestamos={pagados}
              movimientos={movimientos}
              clientesById={clientesById}
              vehiclesById={vehiclesById}
            />
          </CardContent>
        </Card>
      )}
      {mensuales.length > 0 && (
        <p className="text-xs text-muted-foreground px-1">
          Los intereses mensuales se registran por el bot como &quot;Interés préstamo&quot; vinculados a cada préstamo — al pagarlos, la columna &quot;Mes&quot; pasa a ✓ sola.
        </p>
      )}
    </div>
  )
}

function round0(n: number) { return Math.round(n * 100) / 100 }

function Th({ children, tip, right }: { children: React.ReactNode; tip?: React.ReactNode; right?: boolean }) {
  return (
    <th className={`px-3 py-2 font-medium text-muted-foreground text-xs ${right ? 'text-right' : ''}`}>
      <span className="inline-flex items-center gap-1">{children}{tip && <InfoTip>{tip}</InfoTip>}</span>
    </th>
  )
}

function PrestamosTable({
  prestamos, movimientos, clientesById, vehiclesById,
}: { prestamos: any[]; movimientos: any[]; clientesById: any; vehiclesById: any }) {
  if (prestamos.length === 0) {
    return <p className="py-6 text-center text-sm text-muted-foreground">Sin préstamos.</p>
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-muted/40">
          <tr className="text-left">
            <Th>Acreedor</Th>
            <Th right tip={<>Lo prestado menos lo ya devuelto (las devoluciones salen del ledger, vinculadas al préstamo). Las cuotas de interés NO bajan el capital.</>}>Capital vivo</Th>
            <Th right>Tasa</Th>
            <Th tip={<><b>Mensual</b>: paga capital × tasa ÷ 12 el 1 de cada mes. <b>Al final</b>: el interés se acumula por día y se salda junto con el capital.</>}>Modalidad</Th>
            <Th right tip={<>Para modalidad mensual, la cuota fija del mes. Para &quot;al final&quot;, el interés acumulado por día desde el desembolso (neto de repagos parciales).</>}>Interés</Th>
            <Th right tip={<>Interés devengado que todavía no se pagó. En modalidad mensual, cuotas vencidas (el 1 de cada mes) sin registrar.</>}>Adeudado</Th>
            <Th right tip={<>Capital vivo + interés adeudado: lo que costaría cancelar este préstamo hoy.</>}>Deuda hoy</Th>
            <Th tip={<>Solo modalidad mensual: si la cuota del mes corriente ya se registró. Venció el 1; a partir del 5 sin pagar, el bot lo reclama.</>}>Mes</Th>
            <Th>Destino</Th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {prestamos.map((p: any) => {
            const pos = computeLoanPosition(p, movimientos)
            const acr = clientesById[p.acreedor_id]?.nombre ?? '?'
            const veh = p.vehicle_id ? vehiclesById[p.vehicle_id] : null
            const esPagado = p.estado === 'pagado'
            return (
              <tr key={p.id} className={esPagado ? 'opacity-60' : ''}>
                <td className="px-3 py-2.5 font-medium">
                  {acr}
                  {pos.vencido && <Badge variant="destructive" className="ml-2">vencido</Badge>}
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums">{fmt(pos.capital_vivo)}</td>
                <td className="px-3 py-2.5 text-right text-muted-foreground text-xs">{pos.tasa_pct ? `${pos.tasa_pct}%/año` : '—'}</td>
                <td className="px-3 py-2.5 text-xs text-muted-foreground">
                  {pos.modalidad === 'mensual' ? 'mensual' : 'al final'}
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums text-xs">
                  {pos.modalidad === 'mensual'
                    ? (pos.interes_mensual > 0 ? `${fmt(pos.interes_mensual)}/mes` : '—')
                    : `${fmt(pos.interes_devengado)} acum.`}
                </td>
                <td className={`px-3 py-2.5 text-right tabular-nums ${pos.interes_adeudado > 0 && pos.modalidad === 'mensual' ? 'text-destructive font-medium' : 'text-muted-foreground'}`}>
                  {fmt(pos.interes_adeudado)}
                </td>
                <td className="px-3 py-2.5 text-right font-medium tabular-nums">{fmt(pos.deuda_total)}</td>
                <td className="px-3 py-2.5 text-xs">
                  {esPagado || pos.modalidad !== 'mensual' || pos.interes_mensual <= 0 ? (
                    <span className="text-muted-foreground/60">—</span>
                  ) : pos.interes_mes_pagado ? (
                    <span className="text-success">pagado ✓</span>
                  ) : pos.interes_adeudado > 0 ? (
                    <span className="text-destructive font-medium">impago</span>
                  ) : (
                    <span className="text-muted-foreground">vence {pos.proximo_vencimiento ? fmtFecha(pos.proximo_vencimiento) : 'el 1'}</span>
                  )}
                </td>
                <td className="px-3 py-2.5">
                  {veh ? (
                    <Link href="/stock" className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2">
                      {autoLabel(veh)}
                    </Link>
                  ) : (
                    <span className="text-xs text-muted-foreground">capital general</span>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ── Tab 3 · Por Vehículo ──────────────────────────────────────────────────────

function PorVehiculoTab({
  vehicles, movimientos, prestamos, clientesById,
}: { vehicles: any[]; movimientos: any[]; prestamos: any[]; clientesById: any }) {
  const activos = vehicles.filter((v: any) => v.estado !== 'vendido')
  const filas = activos.map((v: any) => {
    const f = computeVehicleFinancials(v.id, vehicles, movimientos, prestamos)
    return { v, f }
  }).sort((a, b) => b.f.costo_total - a.f.costo_total)

  const [openId, setOpenId] = useState<number | null>(null)

  return (
    <Card size="sm">
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40">
              <tr className="text-left">
                <th className="px-3 py-2 font-medium text-muted-foreground text-xs">Auto</th>
                <th className="px-3 py-2 font-medium text-muted-foreground text-xs">Tipo</th>
                <th className="px-3 py-2 font-medium text-muted-foreground text-xs text-right">P. compra</th>
                <th className="px-3 py-2 font-medium text-muted-foreground text-xs text-right">Gastos</th>
                <th className="px-3 py-2 font-medium text-muted-foreground text-xs text-right">Costo total</th>
                <th className="px-3 py-2 font-medium text-muted-foreground text-xs text-right">Publicado</th>
                <th className="px-3 py-2 font-medium text-muted-foreground text-xs text-right">Margen</th>
                <th className="px-3 py-2 font-medium text-muted-foreground text-xs">Préstamo</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filas.map(({ v, f }) => {
                const isOpen = openId === v.id
                return (
                  <Fragment key={v.id}>
                    <tr
                      onClick={() => setOpenId(isOpen ? null : v.id)}
                      className={`cursor-pointer transition-colors ${isOpen ? 'bg-muted/30' : 'hover:bg-muted/30'}`}
                    >
                      <td className="px-3 py-2.5">
                        {isOpen
                          ? <ChevronUpIcon className="inline size-3 text-muted-foreground mr-1.5" />
                          : <ChevronDownIcon className="inline size-3 text-muted-foreground mr-1.5" />}
                        <span className="font-medium">{v.marca} {v.modelo}</span>
                        <span className="text-muted-foreground text-xs ml-1">{v.año}</span>
                        {v.dominio && <span className="text-xs text-muted-foreground ml-1">· {v.dominio}</span>}
                      </td>
                      <td className="px-3 py-2.5 text-xs text-muted-foreground">{v.tipo_operacion ?? '—'}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums" title={f.fuente_compra === 'vehicle_purchase' ? 'Compra tomada de los movimientos del ledger (la ficha no tiene precio de compra)' : undefined}>
                        {fmt(f.compra)}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{fmt(f.gastos_total)}</td>
                      <td className="px-3 py-2.5 text-right font-medium tabular-nums">{fmt(f.costo_total)}</td>
                      <td className="px-3 py-2.5 text-right text-muted-foreground tabular-nums">
                        {f.precio_publicado != null ? fmt(f.precio_publicado) : '—'}
                      </td>
                      <td className={`px-3 py-2.5 text-right font-medium tabular-nums ${
                        f.es_consignacion ? 'text-muted-foreground text-xs'
                        : f.margen_esperado == null ? 'text-muted-foreground'
                        : f.margen_esperado >= 0 ? 'text-success' : 'text-destructive'
                      }`}>
                        {f.es_consignacion ? 'consignación'
                          : f.margen_esperado == null ? '—'
                          : (f.margen_esperado >= 0 ? '+' : '') + fmt(f.margen_esperado)}
                      </td>
                      <td className="px-3 py-2.5 text-xs">
                        {f.prestamos_asociados.length > 0 ? (
                          <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900">
                            {clientesById[f.prestamos_asociados[0].acreedor_id]?.nombre ?? 'sí'}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground/60">—</span>
                        )}
                      </td>
                    </tr>
                    {isOpen && (
                      <tr>
                        <td colSpan={8} className="px-3 pb-4 pt-0 bg-muted/30 border-b">
                          <VehicleFinancialDetail
                            v={v}
                            f={f}
                            movimientos={movimientos}
                            clientesById={clientesById}
                          />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
              {filas.length === 0 && (
                <tr><td colSpan={8} className="px-3 py-6 text-center text-sm text-muted-foreground">Sin vehículos activos.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  )
}

function VehicleFinancialDetail({
  v, f, movimientos, clientesById,
}: { v: any; f: ReturnType<typeof computeVehicleFinancials>; movimientos: any[]; clientesById: any }) {
  const movsAuto = movimientos
    .filter((m: any) => m.vehicle_id === v.id)
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

  const catEntries = Object.entries(f.gastos_por_categoria).sort((a, b) => b[1] - a[1])

  return (
    <div className="pt-3 grid grid-cols-1 xl:grid-cols-3 gap-4">
      <div>
        <p className="text-xs text-muted-foreground uppercase tracking-wide mb-2">Desglose de gastos</p>
        {catEntries.length === 0 && f.gastos_cliente <= 0 ? (
          <p className="text-sm text-muted-foreground">Sin gastos registrados.</p>
        ) : (
          <div className="border rounded-lg divide-y divide-border bg-background">
            {catEntries.map(([cat, monto]) => (
              <div key={cat} className="flex items-center justify-between px-3 py-2">
                <span className="text-sm">{CAT_LABEL[cat] ?? cat}</span>
                <span className="text-sm text-muted-foreground tabular-nums">{fmt(monto)}</span>
              </div>
            ))}
            <div className="flex items-center justify-between px-3 py-2 bg-muted/40 font-medium">
              <span className="text-sm">Total gastos nuestros</span>
              <span className="text-sm tabular-nums">{fmt(f.gastos_total + f.otros_egresos)}</span>
            </div>
            {f.gastos_cliente > 0 && (
              <div className="flex items-center justify-between px-3 py-2 text-muted-foreground">
                <span className="text-sm flex items-center gap-1.5">
                  Por cuenta del cliente
                  <InfoTip>Gastos que adelantamos por cuenta del dueño del auto (recuperables): NO son costo nuestro ni entran en el costo total — el cliente los debe, y en una consignación se descuentan de su liquidación al vender.</InfoTip>
                </span>
                <span className="text-sm tabular-nums">{fmt(f.gastos_cliente)}</span>
              </div>
            )}
          </div>
        )}
      </div>
      {f.es_consignacion && (() => {
        const liq = computeLiquidacionConsignacion(v.id, [v], movimientos)
        return (
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1.5">
              Liquidación al dueño{liq.estimada ? ' (estimada)' : ''}
              <InfoTip>Lo que le corresponde al dueño de la consignación: precio de venta − nuestra comisión del {liq.comision_pct}% − los gastos que adelantamos por su cuenta.{liq.estimada && <> Como el auto todavía no se vendió, se estima con el precio publicado/objetivo de la ficha.</>}</InfoTip>
            </p>
            {liq.fuente_precio === 'sin_precio' ? (
              <p className="text-sm text-muted-foreground">Sin precio de venta ni precio publicado — no se puede estimar.</p>
            ) : (
              <div className="border rounded-lg divide-y divide-border bg-background">
                <div className="flex items-center justify-between px-3 py-2">
                  <span className="text-sm">Precio de venta{liq.estimada ? ' (estimado)' : ''}</span>
                  <span className="text-sm tabular-nums">{fmt(liq.precio_venta)}</span>
                </div>
                <div className="flex items-center justify-between px-3 py-2 text-muted-foreground">
                  <span className="text-sm">− Comisión {liq.comision_pct}%</span>
                  <span className="text-sm tabular-nums">−{fmt(liq.comision)}</span>
                </div>
                {liq.gastos_adelantados > 0 && (
                  <div className="flex items-center justify-between px-3 py-2 text-muted-foreground">
                    <span className="text-sm">− Gastos adelantados por su cuenta</span>
                    <span className="text-sm tabular-nums">−{fmt(liq.gastos_adelantados)}</span>
                  </div>
                )}
                <div className="flex items-center justify-between px-3 py-2 bg-muted/40 font-medium">
                  <span className="text-sm">Neto al dueño</span>
                  <span className="text-sm tabular-nums">{fmt(liq.neto_al_cliente)}</span>
                </div>
              </div>
            )}
          </div>
        )
      })()}
      {f.prestamos_asociados.length > 0 && (
        <div>
          <p className="text-xs text-muted-foreground uppercase tracking-wide mb-2">Préstamos financiando este auto</p>
          <div className="border rounded-lg divide-y divide-border bg-background">
            {f.prestamos_asociados.map((p: any) => {
              const pos = computeLoanPosition(p, movimientos)
              const acr = clientesById[p.acreedor_id]?.nombre ?? '?'
              return (
                <div key={p.id} className="flex items-center justify-between px-3 py-2">
                  <span className="text-sm">{acr}</span>
                  <div className="flex items-center gap-3 text-xs">
                    <span className="text-muted-foreground">
                      deuda {fmt(pos.deuda_total)} ({pos.tasa_pct}% · {pos.modalidad === 'mensual' ? `${fmt(pos.interes_mensual)}/mes` : 'se salda al final'})
                    </span>
                    {pos.vencido && <span className="text-destructive">vencido</span>}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
      <div>
        <p className="text-xs text-muted-foreground uppercase tracking-wide mb-2">Movimientos del auto ({movsAuto.length})</p>
        {movsAuto.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sin movimientos vinculados.</p>
        ) : (
          <div className="border rounded-lg divide-y divide-border bg-background max-h-80 overflow-y-auto">
            {movsAuto.map((m: any) => (
              <div key={m.id} className="flex items-center justify-between px-3 py-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className={`text-xs ${m.tipo === 'ingreso' ? 'text-success' : 'text-destructive'}`}>{m.tipo}</span>
                  <span className="text-sm truncate">{m.nota || CAT_LABEL[m.categoria] || m.categoria}</span>
                </div>
                <div className="flex items-center gap-2 text-xs whitespace-nowrap shrink-0">
                  <TipoAmount tipo={m.tipo} monto={m.monto} size="xs" />
                  <span className="text-muted-foreground tabular-nums">{fmtFecha(m.created_at)}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Tab 4 · Movimientos (con filtros) ─────────────────────────────────────────

const PAGE_SIZE_OPTIONS = [25, 50, 100, 200] as const

function MovimientosTab({
  movimientos, vehiclesById, cuentas,
}: { movimientos: any[]; vehiclesById: any; cuentas: CuentaInfo[] }) {
  const [cats, setCats]         = useState<Set<string>>(new Set())
  const [cuenta, setCuenta]     = useState<string>('')
  const [tipo, setTipo]         = useState<string>('')
  const [vehId, setVehId]       = useState<string>('')
  const [desde, setDesde]       = useState<string>('')
  const [hasta, setHasta]       = useState<string>('')
  const [pageSize, setPageSize] = useState<number>(25)
  const [page, setPage]         = useState<number>(1)

  const categoriasDisponibles = useMemo(() => {
    const s = new Set<string>()
    for (const m of movimientos) if (m.categoria) s.add(m.categoria)
    return Array.from(s).sort()
  }, [movimientos])

  const vehiclesConMovs = useMemo(() => {
    const ids = new Set<number>()
    for (const m of movimientos) if (m.vehicle_id) ids.add(m.vehicle_id)
    return Array.from(ids)
      .map(id => vehiclesById[id])
      .filter(Boolean)
      .sort((a, b) => (a.marca ?? '').localeCompare(b.marca ?? ''))
  }, [movimientos, vehiclesById])

  const filtered = useMemo(() => movimientos.filter((m: any) => {
    if (cats.size > 0 && !cats.has(m.categoria)) return false
    if (cuenta && m.cuenta !== cuenta) return false
    if (tipo && m.tipo !== tipo) return false
    if (vehId && String(m.vehicle_id ?? '') !== vehId) return false
    if (desde && m.created_at < desde) return false
    if (hasta && m.created_at > hasta + 'T23:59:59') return false
    return true
  }).sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()),
  [movimientos, cats, cuenta, tipo, vehId, desde, hasta])

  // Totales: separar movimientos reales (afecta_balance) de asientos contables
  // off-balance (deuda anotada, gastos adelantados por un acreedor, etc). Los
  // off-balance NO son cash flow real y mezclarlos en el "Neto" infla los
  // números. affectsBalance = columna explícita 1/0 con fallback legacy a
  // saldo_post (misma regla que el backend).
  const cashIngresos = filtered.filter(m => m.tipo === 'ingreso' && affectsBalance(m)).reduce((s, m) => s + Number(m.monto ?? 0), 0)
  const cashEgresos  = filtered.filter(m => m.tipo === 'egreso'  && affectsBalance(m)).reduce((s, m) => s + Number(m.monto ?? 0), 0)
  const offIngresos  = filtered.filter(m => m.tipo === 'ingreso' && !affectsBalance(m)).reduce((s, m) => s + Number(m.monto ?? 0), 0)
  const offEgresos   = filtered.filter(m => m.tipo === 'egreso'  && !affectsBalance(m)).reduce((s, m) => s + Number(m.monto ?? 0), 0)
  const cashNeto     = cashIngresos - cashEgresos

  // Pagination: clamp page to range whenever filtered length or pageSize change.
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize))
  const safePage = Math.min(page, totalPages)
  const startIdx = (safePage - 1) * pageSize
  const visible = filtered.slice(startIdx, startIdx + pageSize)
  useEffect(() => {
    if (page > totalPages) setPage(totalPages)
  }, [page, totalPages])

  function toggleCat(c: string) {
    setCats(prev => {
      const next = new Set(prev)
      next.has(c) ? next.delete(c) : next.add(c)
      return next
    })
    setPage(1)
  }

  const hasFilters = cats.size || cuenta || tipo || vehId || desde || hasta

  return (
    <div className="space-y-4">
      <Card size="sm">
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-1.5 items-center">
            <span className="text-xs text-muted-foreground mr-1">Categoría:</span>
            {categoriasDisponibles.map(c => (
              <Button
                key={c}
                size="xs"
                variant={cats.has(c) ? 'default' : 'outline'}
                onClick={() => toggleCat(c)}
              >
                {CAT_LABEL[c] ?? c}
              </Button>
            ))}
          </div>
          <div className="flex flex-wrap gap-2 items-center">
            <select className={nativeSelectCls} value={tipo} onChange={e => { setTipo(e.target.value); setPage(1) }}>
              <option value="">Tipo: todos</option>
              <option value="ingreso">Ingreso</option>
              <option value="egreso">Egreso</option>
            </select>
            <select className={nativeSelectCls} value={cuenta} onChange={e => { setCuenta(e.target.value); setPage(1) }}>
              <option value="">Cuenta: todas</option>
              {cuentas.map(c => (
                <option key={c.clave} value={c.clave}>{capFirst(c.label)}</option>
              ))}
            </select>
            <select className={nativeSelectCls} value={vehId} onChange={e => { setVehId(e.target.value); setPage(1) }}>
              <option value="">Auto: todos</option>
              {vehiclesConMovs.map((v: any) => (
                <option key={v.id} value={v.id}>{autoLabel(v)}</option>
              ))}
            </select>
            <Input type="date" className="h-8 w-auto text-xs" value={desde} onChange={e => { setDesde(e.target.value); setPage(1) }} />
            <Input type="date" className="h-8 w-auto text-xs" value={hasta} onChange={e => { setHasta(e.target.value); setPage(1) }} />
            {hasFilters ? (
              <Button
                size="xs"
                variant="ghost"
                onClick={() => { setCats(new Set()); setCuenta(''); setTipo(''); setVehId(''); setDesde(''); setHasta(''); setPage(1) }}
              >
                Limpiar
              </Button>
            ) : null}
          </div>
        </CardContent>
      </Card>

      <div className="space-y-1 px-1">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-sm">
          <span className="text-muted-foreground">{filtered.length} movimiento{filtered.length === 1 ? '' : 's'}</span>
          <span className="text-success tabular-nums">+{fmt(cashIngresos)}</span>
          <span className="text-destructive tabular-nums">-{fmt(cashEgresos)}</span>
          <span className="text-foreground font-medium tabular-nums">
            Neto: {cashNeto >= 0 ? '+' : ''}{fmt(cashNeto)}
          </span>
        </div>
        {(offIngresos > 0 || offEgresos > 0) && (
          <div className="flex flex-wrap items-center gap-x-3 text-xs text-muted-foreground">
            <span title="Préstamos recibidos, vehicle_purchase pagados por terceros, etc. — registros contables sin impacto en saldo de cuenta">
              + asientos sin impacto en saldo:
            </span>
            <span className="text-success/70 tabular-nums">+{fmt(offIngresos)}</span>
            <span className="text-destructive/70 tabular-nums">-{fmt(offEgresos)}</span>
          </div>
        )}
      </div>

      <Card size="sm">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40">
                <tr className="text-left">
                  <th className="px-3 py-2 font-medium text-muted-foreground text-xs">Fecha</th>
                  <th className="px-3 py-2 font-medium text-muted-foreground text-xs">Tipo</th>
                  <th className="px-3 py-2 font-medium text-muted-foreground text-xs">Categoría</th>
                  <th className="px-3 py-2 font-medium text-muted-foreground text-xs">Cuenta</th>
                  <th className="px-3 py-2 font-medium text-muted-foreground text-xs">Auto</th>
                  <th className="px-3 py-2 font-medium text-muted-foreground text-xs">Nota</th>
                  <th className="px-3 py-2 font-medium text-muted-foreground text-xs text-right">Monto</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {visible.map((m: any) => {
                  const veh = m.vehicle_id ? vehiclesById[m.vehicle_id] : null
                  return (
                    <tr key={m.id}>
                      <td className="px-3 py-2 text-xs text-muted-foreground whitespace-nowrap tabular-nums">{fmtFecha(m.created_at)}</td>
                      <td className={`px-3 py-2 text-xs ${m.tipo === 'ingreso' ? 'text-success' : 'text-destructive'}`}>{m.tipo}</td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">{CAT_LABEL[m.categoria] ?? m.categoria}</td>
                      <td className="px-3 py-2 text-xs text-muted-foreground capitalize">{m.cuenta}</td>
                      <td className="px-3 py-2 text-xs">
                        {veh ? `${veh.marca} ${veh.modelo}` : <span className="text-muted-foreground/60">—</span>}
                      </td>
                      <td className="px-3 py-2 text-sm truncate max-w-xs">{m.nota || ''}</td>
                      <td className={`px-3 py-2 text-sm font-medium text-right whitespace-nowrap tabular-nums ${m.tipo === 'ingreso' ? 'text-success' : 'text-destructive'}`}>
                        {m.tipo === 'ingreso' ? '+' : '-'}{fmt(m.monto)}
                      </td>
                    </tr>
                  )
                })}
                {filtered.length === 0 && (
                  <tr><td colSpan={7} className="px-3 py-6 text-center text-sm text-muted-foreground">Sin movimientos para este filtro.</td></tr>
                )}
              </tbody>
            </table>
          </div>

          {filtered.length > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-3 border-t px-3 py-2 text-xs">
              <div className="flex items-center gap-2 text-muted-foreground">
                <span>
                  {startIdx + 1}–{Math.min(startIdx + pageSize, filtered.length)} de {filtered.length}
                </span>
                <span className="opacity-50">·</span>
                <label className="flex items-center gap-1.5">
                  Por página:
                  <select
                    className={nativeSelectCls}
                    value={pageSize}
                    onChange={e => { setPageSize(Number(e.target.value)); setPage(1) }}
                  >
                    {PAGE_SIZE_OPTIONS.map(n => <option key={n} value={n}>{n}</option>)}
                  </select>
                </label>
              </div>
              <div className="flex items-center gap-1.5">
                <Button size="xs" variant="outline" disabled={safePage <= 1} onClick={() => setPage(1)}>«</Button>
                <Button size="xs" variant="outline" disabled={safePage <= 1} onClick={() => setPage(p => Math.max(1, p - 1))}>‹</Button>
                <span className="px-2 tabular-nums text-muted-foreground">
                  {safePage} / {totalPages}
                </span>
                <Button size="xs" variant="outline" disabled={safePage >= totalPages} onClick={() => setPage(p => Math.min(totalPages, p + 1))}>›</Button>
                <Button size="xs" variant="outline" disabled={safePage >= totalPages} onClick={() => setPage(totalPages)}>»</Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

// ── Altas: movimiento y préstamo ──────────────────────────────────────────────
//
// Hasta ahora todo lo de plata se cargaba por WhatsApp. Estos dos diálogos son
// la MISMA escritura desde el dashboard: el movimiento va por una route propia
// (/api/finanzas/movimiento) que valida como el bot y setea afecta_balance=1; el
// préstamo va por el proxy genérico, que ya tiene `prestamos` con sus enums.

const TIPO_OPTIONS = [
  { value: 'egreso', label: 'Egreso (sale plata)' },
  { value: 'ingreso', label: 'Ingreso (entra plata)' },
]

function NuevoMovimientoDialog({
  open, onOpenChange, cuentas, vehicles, clientes, prestamos,
}: {
  open: boolean; onOpenChange: (o: boolean) => void
  cuentas: CuentaInfo[]; vehicles: any[]; clientes: any[]; prestamos: any[]
}) {
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const vacio = {
    tipo: 'egreso', cuenta: cuentas[0]?.clave ?? '', monto: '',
    categoria: 'general_expense', fecha: '', descripcion: '',
    vehicle_id: '', cliente_id: '', prestamo_id: '',
  }
  const [form, setForm] = useState(vacio)
  const set = (campo: keyof typeof vacio, valor: string) => setForm(f => ({ ...f, [campo]: valor }))

  // Qué vínculos pide cada categoría: las mismas reglas que valida la route y
  // que valida el bot. Los selects que la categoría no necesita no se muestran.
  const pideAuto = CAT_VEHICLE_LINKED.has(form.categoria) || form.categoria === 'client_expense'
  const pideCliente = CAT_CLIENTE_LINKED.has(form.categoria)
  const pidePrestamo = form.categoria in CAT_LOAN_TIPO

  function setCategoria(valor: string) {
    setForm(f => ({
      ...f,
      categoria: valor,
      // Una categoría de préstamo tiene dirección fija (un pago de interés es
      // un egreso, siempre): se acomoda sola en vez de rebotar al guardar.
      tipo: CAT_LOAN_TIPO[valor] ?? f.tipo,
      // Y se limpian los vínculos que la categoría nueva ya no usa.
      vehicle_id: CAT_VEHICLE_LINKED.has(valor) || valor === 'client_expense' ? f.vehicle_id : '',
      cliente_id: CAT_CLIENTE_LINKED.has(valor) ? f.cliente_id : '',
      prestamo_id: valor in CAT_LOAN_TIPO ? f.prestamo_id : '',
    }))
  }

  async function guardar() {
    const body: Record<string, any> = {
      tipo: form.tipo,
      cuenta: form.cuenta,
      monto: form.monto === '' ? null : Number(form.monto),
      categoria: form.categoria,
      fecha: form.fecha || null,
      descripcion: form.descripcion,
      vehicle_id: form.vehicle_id || null,
      cliente_id: form.cliente_id || null,
      prestamo_id: form.prestamo_id || null,
    }
    // Pre-chequeo con la MISMA función pura que corre en el server: el error
    // sale al toque y con el mismo texto, sin ida y vuelta.
    const check = validarMovimiento(body, cuentas.map(c => c.clave), todayKey(), new Date().toISOString())
    if (!check.ok) { toast.error(check.error); return }

    setSaving(true)
    const res = await fetch('/api/finanzas/movimiento', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const json = await res.json().catch(() => ({} as any))
    setSaving(false)
    if (res.ok) {
      toast.success('Movimiento registrado')
      onOpenChange(false)
      setForm(vacio)
      router.refresh()
    } else {
      toast.error(json.message || json.error || 'No se pudo registrar el movimiento')
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Nuevo movimiento</DialogTitle>
          <DialogDescription>
            Se guarda en el mismo ledger que escribe el bot y mueve el saldo de la cuenta.
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <FField label="Tipo">
            <select value={form.tipo} onChange={e => set('tipo', e.target.value)} className={fieldSelectCls}>
              {TIPO_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </FField>
          <FField label="Cuenta">
            <select value={form.cuenta} onChange={e => set('cuenta', e.target.value)} className={fieldSelectCls}>
              {cuentas.map(c => <option key={c.clave} value={c.clave}>{capFirst(c.label)}</option>)}
            </select>
          </FField>
          <FField label="Categoría">
            <select value={form.categoria} onChange={e => setCategoria(e.target.value)} className={fieldSelectCls}>
              {CATEGORIAS_ELEGIBLES.map(c => (
                <option key={c} value={c}>{CAT_LABEL[c] ?? c}</option>
              ))}
            </select>
          </FField>
          <FInput
            label="Monto (USD)"
            type="number"
            min="0"
            step="0.01"
            value={form.monto}
            onChange={v => set('monto', v)}
          />
          {pideAuto && (
            <FField label="Auto *" hint="La categoría lo exige: sin el auto, el costo del vehículo queda mal.">
              <select value={form.vehicle_id} onChange={e => set('vehicle_id', e.target.value)} className={fieldSelectCls}>
                <option value="">—</option>
                {vehicles.map((v: any) => (
                  <option key={v.id} value={v.id}>{autoLabel(v)}</option>
                ))}
              </select>
            </FField>
          )}
          {pideCliente && (
            <FField label="Cliente *" hint="Queda como cuenta corriente del cliente.">
              <select value={form.cliente_id} onChange={e => set('cliente_id', e.target.value)} className={fieldSelectCls}>
                <option value="">—</option>
                {clientes.map((c: any) => (
                  <option key={c.id} value={c.id}>{c.nombre}</option>
                ))}
              </select>
            </FField>
          )}
          {pidePrestamo && (
            <FField label="Préstamo *" hint="Los pagos bajan solos el capital vivo y el interés adeudado.">
              <select value={form.prestamo_id} onChange={e => set('prestamo_id', e.target.value)} className={fieldSelectCls}>
                <option value="">—</option>
                {prestamos
                  .filter((p: any) => p.estado !== 'pagado')
                  .map((p: any) => (
                    <option key={p.id} value={p.id}>
                      {clientes.find((c: any) => c.id === p.acreedor_id)?.nombre ?? `Préstamo #${p.id}`} · {fmt(p.monto_original)}
                    </option>
                  ))}
              </select>
            </FField>
          )}
          <FInput
            label="Fecha"
            type="date"
            value={form.fecha}
            onChange={v => set('fecha', v)}
            hint="Vacío = hoy."
          />
          <FTextarea
            label="Descripción"
            className="md:col-span-2"
            rows={2}
            value={form.descripcion}
            onChange={v => set('descripcion', v)}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={guardar} disabled={saving}>{saving ? 'Guardando…' : 'Registrar'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

const MODALIDAD_OPTIONS = [
  { value: 'mensual', label: 'Mensual (cuota fija el 1 de cada mes)' },
  { value: 'al_final', label: 'Al final (devenga por día, se salda con el capital)' },
]

function NuevoPrestamoDialog({
  open, onOpenChange, clientes, vehicles,
}: {
  open: boolean; onOpenChange: (o: boolean) => void; clientes: any[]; vehicles: any[]
}) {
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  // fecha_inicio arranca vacía y se completa con hoy AL GUARDAR: todayKey() usa
  // la hora local, y en el prerender del server (UTC) daría el día de mañana
  // después de las 21 AR.
  const vacio = {
    acreedor_id: '', monto_original: '', tasa_interes_anual: '',
    modalidad: 'mensual', fecha_inicio: '', vehicle_id: '', notas: '',
  }
  const [form, setForm] = useState(vacio)
  const set = (campo: keyof typeof vacio, valor: string) => setForm(f => ({ ...f, [campo]: valor }))

  // Los acreedores son los clientes marcados como tales. Si nadie está marcado
  // (o la marca vive sólo en `tipo`), se ofrece la lista completa antes que un
  // desplegable vacío.
  const acreedores = clientes.filter((c: any) => c.es_acreedor || c.tipo === 'acreedor')
  const opcionesAcreedor = acreedores.length > 0 ? acreedores : clientes

  async function guardar() {
    const acreedor_id = Number(form.acreedor_id)
    if (!Number.isInteger(acreedor_id) || acreedor_id <= 0) { toast.error('Elegí el acreedor.'); return }
    const monto = Number(form.monto_original)
    if (!Number.isFinite(monto) || monto <= 0) { toast.error('El monto debe ser mayor que 0.'); return }
    const tasa = form.tasa_interes_anual === '' ? 0 : Number(form.tasa_interes_anual)
    if (!Number.isFinite(tasa) || tasa < 0) { toast.error('La tasa debe ser un número.'); return }

    setSaving(true)
    const payload: Record<string, any> = {
      acreedor_id,
      monto_original: monto,
      // La tasa canónica es en PORCENTAJE (15 = 15% anual), igual que en el bot.
      tasa_interes_anual: tasa,
      modalidad: form.modalidad,
      estado: 'activo',
      fecha_inicio: form.fecha_inicio || todayKey(),
    }
    if (form.vehicle_id) payload.vehicle_id = Number(form.vehicle_id)
    if (form.notas.trim()) payload.notas = form.notas.trim()
    // `monto_pagado` NO se manda: es un cache derivado del ledger. Los pagos se
    // registran como movimientos loan_repayment / loan_interest.
    const res = await postRecord('prestamos', payload)
    setSaving(false)
    if (res.ok) {
      toast.success('Préstamo registrado')
      onOpenChange(false)
      setForm(vacio)
      router.refresh()
    } else {
      toast.error(res.error || 'No se pudo registrar el préstamo')
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Nuevo préstamo</DialogTitle>
          <DialogDescription>
            Sólo el préstamo. La plata que entra se registra aparte, como movimiento
            &quot;Préstamo recibido&quot; vinculado a él.
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <FField label="Acreedor">
            <select value={form.acreedor_id} onChange={e => set('acreedor_id', e.target.value)} className={fieldSelectCls}>
              <option value="">—</option>
              {opcionesAcreedor.map((c: any) => (
                <option key={c.id} value={c.id}>{c.nombre}</option>
              ))}
            </select>
          </FField>
          <FInput
            label="Monto (USD)"
            type="number"
            min="0"
            step="0.01"
            value={form.monto_original}
            onChange={v => set('monto_original', v)}
          />
          <FInput
            label="Tasa anual (%)"
            type="number"
            min="0"
            step="0.01"
            value={form.tasa_interes_anual}
            onChange={v => set('tasa_interes_anual', v)}
            hint="En porcentaje: 15 = 15% anual, nunca 0,15."
          />
          <FField label="Modalidad">
            <select value={form.modalidad} onChange={e => set('modalidad', e.target.value)} className={fieldSelectCls}>
              {MODALIDAD_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </FField>
          <FInput
            label="Fecha de inicio"
            type="date"
            value={form.fecha_inicio}
            onChange={v => set('fecha_inicio', v)}
            hint="La fecha real del desembolso: de ahí arranca el interés. Vacío = hoy."
          />
          <FField label="Auto que financia (opcional)">
            <select value={form.vehicle_id} onChange={e => set('vehicle_id', e.target.value)} className={fieldSelectCls}>
              <option value="">Capital general</option>
              {vehicles.map((v: any) => (
                <option key={v.id} value={v.id}>{autoLabel(v)}</option>
              ))}
            </select>
          </FField>
          <FTextarea
            label="Notas"
            className="md:col-span-2"
            rows={2}
            value={form.notas}
            onChange={v => set('notas', v)}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={guardar} disabled={saving}>{saving ? 'Guardando…' : 'Registrar'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
