'use client'
/**
 * Piezas del tablero /cashflow que se usan en más de una pestaña: KPIs,
 * diagnóstico, puente del capital, tablas mes × línea y las tarjetas de
 * resultado, caja, gastos, stock, deuda y "a revisar".
 */
import { Fragment, useState, type ReactNode } from 'react'
import { AlertTriangleIcon, ChevronDownIcon } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { InfoTip } from '@/components/ui/tooltip'
import { Th, thCls, tdCls, tdMoneyCls as tdMoneyBase } from '@/components/table-cells'
import { ColumnasMes, ColumnasApiladas, TipRow, type ColumnaMes } from '@/components/charts/charts'
import { money, moneyDelta } from '@/lib/money'
import { fmtDMY } from '@/lib/date'
import { cn } from '@/lib/utils'
import {
  LINEAS_PUENTE, LINEAS_CAJA, mesCorto, mesLargo,
  type CashflowReport, type Puente, type LineaPuenteKey, type LineaCajaKey, type ResultadoMes, type CajaMes,
} from '@/lib/cashflow'

export type Sel = string // 'YYYY-MM' | 'total'

// Plata en una sola línea: "+USD 9.569,57" partido en dos renglones no se lee.
// Las tablas viven en un overflow-x-auto, así que si no entra, scrollean.
export const tdMoneyCls = `${tdMoneyBase} whitespace-nowrap`

// ── Helpers ──────────────────────────────────────────────────────────────────

export function signoCls(n: number) {
  return n > 0.005 ? 'text-success' : n < -0.005 ? 'text-destructive' : 'text-muted-foreground'
}

export const r2 = (n: number) => Math.round(n * 100) / 100

export function num(n: number, dec = 1) {
  return n.toLocaleString('es-AR', { maximumFractionDigits: dec })
}

export function pct(n: number | null) {
  return n === null || !Number.isFinite(n) ? '—' : `${n.toLocaleString('es-AR', { maximumFractionDigits: 1 })}%`
}

export function periodoLabel(sel: Sel, report: CashflowReport) {
  if (sel === 'total') return 'desde el inicio'
  if (/^\d{4}$/.test(sel)) return `en ${sel}${sel === report.hoy.slice(0, 4) ? ' (hasta hoy)' : ''}`
  return `en ${mesLargo(sel)}${sel === report.mesActual ? ' (hasta hoy)' : ''}`
}

/** Suma el resultado de varios meses (un trimestre, un año). */
export function sumarResultado(report: CashflowReport, meses: string[]): ResultadoMes {
  const z: ResultadoMes = {
    margenAutos: 0, autosVendidos: [], comisiones: 0, consignacionesVendidas: 0, gastosGenerales: 0,
    gastosSinAuto: 0, intereses: 0, operativo: 0, retiros: 0, neto: 0, fueraDeResultado: 0,
  }
  for (const m of meses) {
    const r = report.resultado[m]
    if (!r) continue
    z.margenAutos += r.margenAutos; z.autosVendidos = z.autosVendidos.concat(r.autosVendidos)
    z.comisiones += r.comisiones; z.consignacionesVendidas += r.consignacionesVendidas
    z.gastosGenerales += r.gastosGenerales; z.gastosSinAuto += r.gastosSinAuto; z.intereses += r.intereses
    z.operativo += r.operativo; z.retiros += r.retiros; z.neto += r.neto; z.fueraDeResultado += r.fueraDeResultado
  }
  return z
}

/** Suma el flujo de caja de varios meses. La caja al cierre es la del último. */
export function sumarCaja(report: CashflowReport, meses: string[]): CajaMes {
  const lineas = Object.fromEntries(LINEAS_CAJA.map(l => [l.key, 0])) as Record<LineaCajaKey, number>
  let entradas = 0, salidas = 0, cierre = 0
  for (const m of meses) {
    const c = report.caja[m]
    if (!c) continue
    for (const l of LINEAS_CAJA) lineas[l.key] += c.lineas[l.key]
    entradas += c.entradas; salidas += c.salidas; cierre = c.cajaCierre
  }
  return { lineas, entradas, salidas, neto: entradas - salidas, cajaCierre: cierre }
}

// ── Estructura común de tarjetas ─────────────────────────────────────────────

export function Seccion({ titulo, ayuda, accion, children, className, contentClassName }: {
  titulo: ReactNode; ayuda?: ReactNode; accion?: ReactNode; children: ReactNode
  className?: string; contentClassName?: string
}) {
  return (
    <Card size="sm" className={className}>
      <CardHeader className="border-b py-3">
        <CardTitle className="text-sm flex items-center gap-1.5">
          {titulo}
          {ayuda && <InfoTip>{ayuda}</InfoTip>}
          {accion && <span className="ml-auto">{accion}</span>}
        </CardTitle>
      </CardHeader>
      <CardContent className={contentClassName}>{children}</CardContent>
    </Card>
  )
}

export function Kpi({ label, value, sub, tip, tone = 'default', signo }: {
  label: string; value: string; sub?: ReactNode; tip?: ReactNode; tone?: 'default' | 'hero' | 'negative' | 'positive'
  /** Si viene, el valor se pinta por signo: verde si gana, rojo si pierde. */
  signo?: number
}) {
  return (
    <Card size="sm" className={tone === 'hero' ? 'bg-muted/40' : undefined}>
      <CardContent>
        <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1 flex items-center gap-1.5">
          {label} {tip && <InfoTip>{tip}</InfoTip>}
        </p>
        {/* En el celular dos KPIs por fila: a text-2xl "USD 35.487,25" no entra
            en media pantalla de 375px, así que ahí baja de tamaño. */}
        <p className={cn('text-base min-[400px]:text-lg sm:text-2xl font-mono tabular-nums whitespace-nowrap',
          tone === 'hero' ? 'font-semibold' : 'font-medium',
          tone === 'negative' && 'text-destructive', tone === 'positive' && 'text-success',
          signo !== undefined && signoCls(signo))}>{value}</p>
        {sub && <div className="text-xs text-muted-foreground mt-1">{sub}</div>}
      </CardContent>
    </Card>
  )
}

export function Chips<T extends string>({ label, opciones, valor, onCambio }: {
  label: string; opciones: { key: T; label: string }[]; valor: T; onCambio: (v: T) => void
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap items-center gap-1.5 print:hidden">
      <span className="text-xs text-muted-foreground mr-1">{label}</span>
      {opciones.map(o => (
        <button
          key={o.key} type="button" role="radio" aria-checked={valor === o.key}
          onClick={() => onCambio(o.key)}
          className={cn(
            'h-7 rounded-lg border px-2.5 text-xs transition-colors',
            valor === o.key
              ? 'border-primary/40 bg-primary/10 text-primary font-medium'
              : 'border-border text-muted-foreground hover:text-foreground hover:bg-muted/60',
          )}
        >{o.label}</button>
      ))}
    </div>
  )
}

export function SelectorMes({ report, sel, onSel, conTotal = true }: {
  report: CashflowReport; sel: Sel; onSel: (s: Sel) => void; conTotal?: boolean
}) {
  return (
    <Chips
      label="Mes"
      opciones={[
        ...report.meses.map(m => ({ key: m, label: mesCorto(m) })),
        ...(conTotal ? [{ key: 'total', label: 'Desde el inicio' }] : []),
      ]}
      valor={sel} onCambio={onSel}
    />
  )
}

// ── KPIs de arriba ───────────────────────────────────────────────────────────

export function Kpis({ report }: { report: CashflowReport }) {
  const c = report.capital
  const f = report.fotoHoy
  const eq = report.equilibrio
  const rm = report.resultado[report.mesActual]
  const vsMes = c.hoy - c.inicioMes
  const vs30 = c.hoy - c.hace30
  return (
    // 5 tarjetas recién desde xl: en 1024px un monto de 6 cifras en text-2xl no
    // entra en un quinto de la pantalla (DESIGN.md: 2xl ya es el tope).
    <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3 print:hidden">
      <Kpi
        tone="hero" label="Capital propio" value={money(c.hoy)}
        sub={<>
          <span className={signoCls(vsMes)}>{moneyDelta(vsMes)}</span> en el mes ·{' '}
          <span className={signoCls(vs30)}>{moneyDelta(vs30)}</span> en 30 días
        </>}
        tip={<>Lo que es tuyo si hoy vendés el stock al precio esperado, cobrás y pagás todo. Mismo número que Finanzas → Patrimonio. Máximo: {money(c.maximo.v)} el {fmtDMY(c.maximo.d)}.</>}
      />
      <Kpi
        label={`Ganancia ${mesCorto(report.mesActual)}`} value={moneyDelta(rm?.operativo ?? 0)} signo={rm?.operativo ?? 0}
        sub={<>retiros {money(Math.abs(rm?.retiros ?? 0))} · después de retiros {moneyDelta(rm?.neto ?? 0)}</>}
        tip={<>Margen de los autos propios vendidos este mes + comisiones cobradas − gastos generales − intereses devengados. Los retiros no son gasto del negocio: van aparte. Un auto que sigue en el stock no suma ganancia hasta que se vende.</>}
      />
      <Kpi
        label="Gasto fijo mensual" value={money(eq.gastoFijoProm)}
        sub={<>estructura {money(eq.estructuraProm)} + retiros {money(eq.retirosProm)}</>}
        tip={<>Promedio de los últimos meses cerrados ({eq.mesesBase.map(mesCorto).join(', ') || 'sin meses cerrados'}): gastos generales + intereses devengados + gastos de autos sin auto asignado, más los retiros personales. Es lo que el negocio tiene que ganar cada mes para que el capital no baje.</>}
      />
      <Kpi
        label="En caja" value={money(f.cajas)}
        sub={eq.mesesDeCaja !== null ? <>cubre {num(eq.mesesDeCaja)} meses de gasto fijo</> : undefined}
        tip={<>Suma de las cajas, derivada del ledger. Incluye plata prestada: no es plata libre. Los meses de cobertura suponen que no se vende nada y no se paga capital de deuda.</>}
      />
      <Kpi
        tone="negative" label="Deudas" value={money(f.deuda)}
        sub={<>interés {money(f.interesMensual)}/mes en cuotas mensuales</>}
        tip={<>Capital vivo + interés devengado impago de cada préstamo activo. El interés mensual es el de los préstamos con cuota mensual; los &quot;al final&quot; devengan aparte y se pagan al cancelar.</>}
      />
    </div>
  )
}

// ── Diagnóstico en una frase ─────────────────────────────────────────────────

export function textoDiagnostico(report: CashflowReport, sel: Sel) {
  const p = report.puentes[sel]
  const delta = p.capitalFin - p.capitalInicio
  const lineas = LINEAS_PUENTE.map(l => ({ ...l, v: p.lineas[l.key] })).filter(l => Math.abs(l.v) >= 1)
  return {
    p, delta,
    bajan: lineas.filter(l => l.v < 0).sort((a, b) => a.v - b.v).slice(0, 3),
    suben: lineas.filter(l => l.v > 0).sort((a, b) => b.v - a.v).slice(0, 2),
  }
}

export function Diagnostico({ report, sel }: { report: CashflowReport; sel: Sel }) {
  const { p, delta, bajan, suben } = textoDiagnostico(report, sel)
  const eq = report.equilibrio
  const periodo = periodoLabel(sel, report)
  const lista = (ls: typeof bajan) => ls.map((l, i) => (
    <Fragment key={l.key}>
      {i > 0 && (i === ls.length - 1 ? ' y ' : ', ')}
      {l.label.toLowerCase()} <span className={cn('font-mono tabular-nums', signoCls(l.v))}>{moneyDelta(l.v)}</span>
    </Fragment>
  ))

  return (
    <Card size="sm" className="bg-muted/40">
      <CardContent className="space-y-2 text-sm leading-relaxed">
        <p>
          {periodo.charAt(0).toUpperCase() + periodo.slice(1)} el capital propio{' '}
          <b className={signoCls(delta)}>{delta >= 0 ? 'subió' : 'bajó'} {money(Math.abs(r2(delta)))}</b>
          {' '}(de {money(p.capitalInicio)} a {money(p.capitalFin)}).
          {bajan.length > 0 && <> Lo bajaron {lista(bajan)}.</>}
          {suben.length > 0 && <> Lo subieron {lista(suben)}.</>}
        </p>
        {eq.mesesBase.length > 0 && (
          <p className="text-muted-foreground">
            El negocio gasta en promedio <b className="text-foreground">{money(eq.gastoFijoProm)}/mes</b> fijos
            ({money(eq.estructuraProm)} de estructura e intereses + {money(eq.retirosProm)} de retiros,
            promedio de {eq.mesesBase.map(mesCorto).join(', ')}).
            {eq.margenPromAuto !== null && eq.autosNecesarios !== null && (
              <> Con un margen promedio de {money(eq.margenPromAuto)} por auto propio vendido, cubrirlo pide{' '}
                <b className="text-foreground">{num(eq.autosNecesarios)} autos por mes</b>;
                en los últimos meses se vendieron {num(eq.autosPorMes)} por mes
                {eq.comisionProm !== null && <> más {num(eq.consignacionesPorMes)} consignaciones (comisión promedio {money(eq.comisionProm)})</>}.
              </>
            )}
          </p>
        )}
      </CardContent>
    </Card>
  )
}

// ── Puente del capital ───────────────────────────────────────────────────────

export const LINEA_LABEL = Object.fromEntries(LINEAS_PUENTE.map(l => [l.key, l.label])) as Record<LineaPuenteKey, string>

export function PuenteLista({ p, titulo, detalleAbierto = false }: { p: Puente; titulo: string; detalleAbierto?: boolean }) {
  const [abierto, setAbierto] = useState(detalleAbierto)
  const lineas = LINEAS_PUENTE.filter(l => Math.abs(p.lineas[l.key]) >= 0.5)
  const max = Math.max(1, ...lineas.map(l => Math.abs(p.lineas[l.key])))
  const delta = p.capitalFin - p.capitalInicio
  return (
    <div className="text-[13px]">
      <p className="text-2xs uppercase tracking-wide text-muted-foreground mb-2">Qué movió el capital {titulo}</p>
      <div className="flex justify-between py-1.5 border-b border-border">
        <span className="text-muted-foreground">Capital al {fmtDMY(p.desde)}</span>
        <span className="font-mono tabular-nums">{money(p.capitalInicio)}</span>
      </div>
      {lineas.length === 0 && <p className="py-3 text-muted-foreground">Sin movimientos en el período.</p>}
      {lineas.map(l => {
        const v = p.lineas[l.key]
        return (
          <div key={l.key} className="grid grid-cols-[minmax(0,1fr)_64px_auto] items-center gap-3 py-1.5">
            <span className="flex items-center gap-1.5 min-w-0">
              <span className="truncate">{l.label}</span>
              <InfoTip>{l.ayuda}</InfoTip>
            </span>
            <span className="h-2 rounded-sm bg-muted overflow-hidden print:hidden" aria-hidden>
              <span className="block h-full rounded-sm" style={{ width: `${Math.max(3, (Math.abs(v) / max) * 100)}%`, background: v >= 0 ? 'var(--success)' : 'var(--destructive)' }} />
            </span>
            <span className={cn('font-mono tabular-nums text-right min-w-[92px]', signoCls(v))}>{moneyDelta(v)}</span>
          </div>
        )
      })}
      <div className="flex justify-between py-1.5 border-t border-border mt-1 font-medium">
        <span>Capital al {fmtDMY(p.hasta)}</span>
        <span className="font-mono tabular-nums">{money(p.capitalFin)}</span>
      </div>
      <div className="flex justify-between py-1 text-xs">
        <span className="text-muted-foreground">Variación</span>
        <span className={cn('font-mono tabular-nums', signoCls(delta))}>{moneyDelta(delta)}</span>
      </div>

      {p.autos.length > 0 && (
        <div className="mt-3 border-t border-border pt-2 print:hidden">
          <button type="button" onClick={() => setAbierto(a => !a)} aria-expanded={abierto}
            className="flex w-full items-center justify-between text-xs text-muted-foreground hover:text-foreground">
            <span>Auto por auto ({p.autos.length})</span>
            <ChevronDownIcon className={cn('size-3.5 transition-transform', abierto && 'rotate-180')} />
          </button>
          {abierto && (
            <ul className="mt-2 space-y-1">
              {p.autos.map(a => (
                <li key={a.vehicle_id} className="flex items-baseline justify-between gap-3">
                  <span className="min-w-0">
                    <span className="block truncate">{a.label}</span>
                    <span className="block text-2xs text-muted-foreground">
                      {LINEA_LABEL[a.linea]}{a.tipo === 'consignacion' ? ' · consignación' : ''}
                    </span>
                  </span>
                  <span className={cn('font-mono tabular-nums shrink-0', signoCls(a.efecto))}>{moneyDelta(a.efecto)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}

const CAT_LABEL: Record<string, string> = {
  commission: 'Comisión', vehicle_purchase: 'Compra auto', vehicle_expense: 'Gasto auto', general_expense: 'Gasto general',
  marketing: 'Marketing', loan: 'Préstamo', loan_disbursement: 'Préstamo recibido', loan_interest: 'Interés',
  loan_repayment: 'Devolución préstamo', client_expense: 'Por cuenta del cliente', client_repayment: 'Cliente devolvió',
  refund: 'Reembolso', down_payment: 'Seña', personal_withdrawal: 'Retiro', investments: 'Inversión', venta: 'Venta',
  apertura: 'Apertura', ajuste: 'Ajuste', other: 'Otro',
}
export const catLabel = (c: string) => CAT_LABEL[c] ?? c

export function SinCajaLista({ p }: { p: Puente }) {
  if (!p.sinCaja.length) return null
  return (
    <div>
      <p className="text-2xs uppercase tracking-wide text-muted-foreground mb-2 flex items-center gap-1.5">
        Movimientos que no pasaron por caja ({p.sinCaja.length})
        <InfoTip>Filas con afecta_balance = 0: compensaciones (un auto que paga una deuda), compras financiadas directo por un acreedor, deudas dadas por cobradas. Si no tienen contrapartida, son la &quot;diferencia de registro&quot; del puente.</InfoTip>
      </p>
      <ul className="divide-y divide-border text-[13px]">
        {p.sinCaja.map((m, i) => (
          <li key={i} className="flex items-baseline justify-between gap-3 py-1.5">
            <span className="min-w-0">
              <span className="block truncate">{m.nota || catLabel(m.categoria)}</span>
              <span className="block text-2xs text-muted-foreground">{fmtDMY(m.dia)} · {catLabel(m.categoria)}{m.auto ? ` · ${m.auto}` : ''}</span>
            </span>
            <span className={cn('font-mono tabular-nums shrink-0', m.tipo === 'ingreso' ? 'text-success' : 'text-destructive')}>
              {m.tipo === 'ingreso' ? '+' : '−'}{money(m.monto)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

// ── Tabla genérica columnas × línea ──────────────────────────────────────────

export type Fila = {
  key: string
  label: ReactNode
  valores: (col: string) => number
  tipo?: 'normal' | 'total' | 'grupo' | 'tenue'
  total?: boolean            // ¿mostrar la columna Total? (no para saldos de cierre)
  sinSigno?: boolean
  entero?: boolean           // conteos, no plata
}

export function TablaColumnas({ columnas, etiqueta, filas, sel, onSel, conTotal = true, extra }: {
  columnas: string[]
  etiqueta: (c: string) => string
  filas: Fila[]
  sel?: Sel
  onSel?: (s: Sel) => void
  conTotal?: boolean
  extra?: { label: string; valor: (f: Fila) => ReactNode }
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[13px]">
        <thead>
          <tr className="border-b border-border">
            <th className={cn(thCls, 'sticky left-0 bg-card z-[1] min-w-44')} />
            {columnas.map(c => (
              <th key={c} className={cn(thCls, 'text-right')}>
                {onSel ? (
                  <button type="button" onClick={() => onSel(c)}
                    className={cn('uppercase tracking-wide hover:text-foreground', sel === c && 'text-primary')}>
                    {etiqueta(c)}
                  </button>
                ) : etiqueta(c)}
              </th>
            ))}
            {conTotal && <Th right>Total</Th>}
            {extra && <Th right>{extra.label}</Th>}
          </tr>
        </thead>
        <tbody>
          {filas.map(f => {
            if (f.tipo === 'grupo') {
              return (
                <tr key={f.key}>
                  <td colSpan={columnas.length + 3} className={cn(thCls, 'pt-3 sticky left-0 bg-card')}>{f.label}</td>
                </tr>
              )
            }
            const total = columnas.reduce((s, c) => s + f.valores(c), 0)
            const fmt = (v: number) => f.entero
              ? (v ? num(v, 0) : '—')
              : Math.abs(v) < 0.005 && f.total !== false ? '—'
              : f.sinSigno ? money(r2(v)) : moneyDelta(r2(v))
            const color = (v: number) => (!f.sinSigno && !f.entero && f.tipo !== 'tenue' ? signoCls(v) : undefined)
            return (
              <tr key={f.key} className={cn('border-b border-border/60', f.tipo === 'total' && 'font-medium bg-muted/30', f.tipo === 'tenue' && 'text-muted-foreground')}>
                <td className={cn(tdCls, 'sticky left-0 z-[1]', f.tipo === 'total' ? 'bg-muted' : 'bg-card')}>{f.label}</td>
                {columnas.map(c => {
                  const v = f.valores(c)
                  return <td key={c} className={cn(tdMoneyCls, sel === c && 'bg-primary/5', color(v))}>{fmt(v)}</td>
                })}
                {conTotal && <td className={cn(tdMoneyCls, color(total))}>{f.total === false ? '' : fmt(total)}</td>}
                {extra && <td className={tdMoneyCls}>{extra.valor(f)}</td>}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ── Filas estándar ───────────────────────────────────────────────────────────

export function filasResultado(get: (c: string) => ResultadoMes, columnas: string[]): Fila[] {
  const hayGastosSinAuto = columnas.some(c => Math.abs(get(c).gastosSinAuto) >= 0.5)
  return [
    { key: 'nautos', label: 'Autos propios vendidos', valores: c => get(c).autosVendidos.length, entero: true, tipo: 'tenue' },
    { key: 'margen', label: 'Margen de autos propios vendidos', valores: c => get(c).margenAutos },
    { key: 'ncons', label: 'Consignaciones vendidas', valores: c => get(c).consignacionesVendidas, entero: true, tipo: 'tenue' },
    { key: 'comis', label: 'Comisiones de consignaciones', valores: c => get(c).comisiones },
    { key: 'gg', label: 'Gastos generales', valores: c => get(c).gastosGenerales },
    ...(hayGastosSinAuto ? [{ key: 'gsa', label: 'Gastos de autos sin auto asignado', valores: (c: string) => get(c).gastosSinAuto }] : []),
    { key: 'int', label: 'Intereses (devengados)', valores: c => get(c).intereses },
    { key: 'op', label: 'Ganancia', valores: c => get(c).operativo, tipo: 'total' },
    { key: 'ret', label: 'Retiros personales', valores: c => get(c).retiros },
    { key: 'neto', label: 'Ganancia después de retiros', valores: c => get(c).neto, tipo: 'total' },
    {
      key: 'fuera',
      label: <span className="flex items-center gap-1.5">Fuera de la ganancia <InfoTip>Aportes, ajustes de saldo y movimientos con categoría &quot;otro&quot;. Mueven la caja y el capital pero no son ganancia ni gasto del negocio (o no se sabe qué son: ver &quot;A revisar&quot;).</InfoTip></span>,
      valores: c => get(c).fueraDeResultado, tipo: 'tenue',
    },
  ]
}

const GRUPO_LABEL: Record<string, string> = {
  operacion: 'Operación', financiacion: 'Financiación', dueno: 'Dueño', otros: 'Otros',
}

export function filasCaja(get: (c: string) => CajaMes, columnas: string[], conCierre = true): Fila[] {
  const filas: Fila[] = []
  for (const grupo of ['operacion', 'financiacion', 'dueno', 'otros']) {
    const lineas = LINEAS_CAJA.filter(l => l.grupo === grupo && columnas.some(c => Math.abs(get(c).lineas[l.key]) >= 0.5))
    if (!lineas.length) continue
    filas.push({ key: `g-${grupo}`, label: GRUPO_LABEL[grupo], valores: () => 0, tipo: 'grupo' })
    for (const l of lineas) filas.push({ key: l.key, label: l.label, valores: c => get(c).lineas[l.key as LineaCajaKey] })
  }
  filas.push({ key: 'entradas', label: 'Entradas', valores: c => get(c).entradas, sinSigno: true, tipo: 'tenue' })
  filas.push({ key: 'salidas', label: 'Salidas', valores: c => get(c).salidas, sinSigno: true, tipo: 'tenue' })
  filas.push({ key: 'neto', label: 'Flujo neto', valores: c => get(c).neto, tipo: 'total' })
  if (conCierre) filas.push({ key: 'cierre', label: 'Caja al cierre', valores: c => get(c).cajaCierre, sinSigno: true, total: false, tipo: 'tenue' })
  return filas
}

// ── Resultado mensual ────────────────────────────────────────────────────────

export function tooltipResultado(r: ResultadoMes, titulo: string) {
  return (
    <>
      <p className="font-medium mb-1">{titulo}</p>
      <TipRow label={`Margen autos (${r.autosVendidos.length})`} value={moneyDelta(r.margenAutos)} />
      <TipRow label={`Comisiones (${r.consignacionesVendidas})`} value={moneyDelta(r.comisiones)} />
      <TipRow label="Gastos generales" value={moneyDelta(r.gastosGenerales + r.gastosSinAuto)} />
      <TipRow label="Intereses" value={moneyDelta(r.intereses)} />
      <TipRow label="Ganancia" value={moneyDelta(r.operativo)} strong />
      <TipRow label="Retiros" value={moneyDelta(r.retiros)} />
      <TipRow label="Después de retiros" value={moneyDelta(r.neto)} />
    </>
  )
}

export function GraficoResultado({ report, meses, sel, onSel, height = 200 }: {
  report: CashflowReport; meses: string[]; sel: Sel; onSel: (s: Sel) => void; height?: number
}) {
  const items: ColumnaMes[] = meses.map(m => ({ mes: m, pos: 0, neg: 0, neto: report.resultado[m].operativo }))
  return (
    <ColumnasMes
      items={items} soloNeto seleccionado={meses.includes(sel) ? sel : null} onSelect={onSel} height={height}
      tooltip={it => tooltipResultado(report.resultado[it.mes], mesCorto(it.mes))}
    />
  )
}

export function AutosVendidosTabla({ vendidos }: { vendidos: ResultadoMes['autosVendidos'] }) {
  if (!vendidos.length) return <p className="text-sm text-muted-foreground">No se vendieron autos propios en el período.</p>
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[13px]">
        <thead>
          <tr className="border-b border-border">
            <Th>Auto</Th><Th>Vendido</Th><Th right>Días</Th><Th right>Cobrado</Th><Th right>Costo</Th><Th right>Margen</Th>
            <Th right>vs. esperado</Th>
          </tr>
        </thead>
        <tbody>
          {vendidos.map(a => {
            const vsEsp = a.valorEsperado !== null ? a.ingresos - a.valorEsperado : null
            return (
              <tr key={a.vehicle_id} className="border-b border-border/60">
                <td className={tdCls}>{a.label}{a.socioPct > 0 && <span className="ml-1.5 text-2xs text-muted-foreground">socio {a.socioPct}%</span>}</td>
                <td className={cn(tdCls, 'text-muted-foreground')}>{fmtDMY(a.dia)}</td>
                <td className={tdMoneyCls}>{a.dias}</td>
                <td className={tdMoneyCls}>{money(a.ingresos)}</td>
                <td className={tdMoneyCls}>{money(a.costo)}</td>
                <td className={cn(tdMoneyCls, signoCls(a.margen))}>{moneyDelta(a.margen)}</td>
                <td className={cn(tdMoneyCls, vsEsp === null ? 'text-muted-foreground' : signoCls(vsEsp))}>
                  {vsEsp === null ? '—' : moneyDelta(vsEsp)}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

export function ResultadoCard({ report, sel, onSel }: { report: CashflowReport; sel: Sel; onSel: (s: Sel) => void }) {
  const R = report.resultado
  const meses = report.meses
  const mesDetalle = sel === 'total' ? null : sel
  const vendidos = mesDetalle ? R[mesDetalle]?.autosVendidos ?? [] : meses.flatMap(m => R[m].autosVendidos)

  return (
    <Seccion
      titulo="Ganancia mes a mes"
      ayuda={<>Ganancia realizada. El margen de un auto propio (todo lo cobrado − compra − gastos, igual que el P&amp;L por auto) se reconoce el mes en que se vende. Las comisiones de consignación, cuando se cobran (la seña de una consignación es comisión). Los intereses, cuando se devengan. No incluye la ganancia esperada del stock: esa está en el capital.</>}
      contentClassName="space-y-4"
    >
      <GraficoResultado report={report} meses={meses} sel={sel} onSel={onSel} />
      <TablaColumnas columnas={meses} etiqueta={mesCorto} filas={filasResultado(m => R[m], meses)} sel={sel} onSel={onSel} />
      <div>
        <p className="text-2xs uppercase tracking-wide text-muted-foreground mb-2">
          Autos propios vendidos {mesDetalle ? `en ${mesLargo(mesDetalle)}` : 'desde el inicio'} ({vendidos.length})
        </p>
        <AutosVendidosTabla vendidos={vendidos} />
      </div>
    </Seccion>
  )
}

// ── Flujo de caja ────────────────────────────────────────────────────────────

export function GraficoCaja({ report, meses, sel, onSel, height = 220 }: {
  report: CashflowReport; meses: string[]; sel: Sel; onSel: (s: Sel) => void; height?: number
}) {
  const C = report.caja
  const items: ColumnaMes[] = meses.map(m => ({ mes: m, pos: C[m].entradas, neg: C[m].salidas, neto: C[m].neto }))
  return (
    <div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground mb-2">
        <span className="flex items-center gap-1.5"><span className="inline-block size-2.5 rounded-sm bg-success" />Entradas</span>
        <span className="flex items-center gap-1.5"><span className="inline-block size-2.5 rounded-sm bg-destructive" />Salidas</span>
        <span className="flex items-center gap-1.5"><span className="inline-block h-0.5 w-3 rounded bg-foreground" />Neto</span>
      </div>
      <ColumnasMes
        items={items} seleccionado={meses.includes(sel) ? sel : null} onSelect={onSel} height={height}
        tooltip={it => (
          <>
            <p className="font-medium mb-1">{mesCorto(it.mes)}</p>
            <TipRow label="Entradas" value={money(it.pos)} swatch="var(--success)" />
            <TipRow label="Salidas" value={money(it.neg)} swatch="var(--destructive)" />
            <TipRow label="Neto" value={moneyDelta(it.neto ?? 0)} strong />
            <TipRow label="Caja al cierre" value={money(C[it.mes].cajaCierre)} />
          </>
        )}
      />
    </div>
  )
}

export function CajaCard({ report, sel, onSel }: { report: CashflowReport; sel: Sel; onSel: (s: Sel) => void }) {
  const meses = report.meses
  return (
    <Seccion
      titulo="Flujo de caja: cuánto entra y cuánto sale"
      ayuda={<>Criterio caja: sólo movimientos que pasan por las cajas. Las transferencias entre cuentas propias (nexo ↔ cash) no se cuentan: no es plata nueva. Comprar un auto es una salida enorme de caja aunque no sea un gasto — por eso el flujo de caja y la ganancia cuentan historias distintas.</>}
      contentClassName="space-y-4"
    >
      <GraficoCaja report={report} meses={meses} sel={sel} onSel={onSel} />
      <TablaColumnas columnas={meses} etiqueta={mesCorto} filas={filasCaja(m => report.caja[m], meses)} sel={sel} onSel={onSel} />
    </Seccion>
  )
}

// ── Gastos ───────────────────────────────────────────────────────────────────

export const GASTO_SERIES = [
  { key: 'gastos_generales', label: 'Gastos generales',     color: 'var(--cat-1)' },
  { key: 'gastos_autos',     label: 'Preparación de autos', color: 'var(--cat-2)' },
  { key: 'intereses',        label: 'Intereses pagados',    color: 'var(--cat-3)' },
  { key: 'retiros',          label: 'Retiros personales',   color: 'var(--cat-4)' },
]

const CAT_GASTO: Record<string, string> = { general_expense: 'General', marketing: 'Marketing', vehicle_expense: 'Auto' }

export function TopGastos({ report, sel, soloGenerales = false }: { report: CashflowReport; sel: Sel; soloGenerales?: boolean }) {
  const meses = /^\d{4}$/.test(sel) ? report.meses.filter(m => m.startsWith(sel)) : sel === 'total' ? report.meses : [sel]
  const top = meses.flatMap(m => report.topGastos[m] ?? [])
    .filter(g => !soloGenerales || g.categoria !== 'vehicle_expense')
    .sort((a, b) => b.monto - a.monto).slice(0, 8)
  if (!top.length) return <p className="text-sm text-muted-foreground">Sin gastos en el período.</p>
  return (
    <ul className="divide-y divide-border text-[13px]">
      {top.map((g, i) => (
        <li key={i} className="flex items-baseline justify-between gap-3 py-1.5">
          <span className="min-w-0">
            <span className="block truncate">{g.nota || '(sin nota)'}</span>
            <span className="block text-2xs text-muted-foreground">
              {fmtDMY(g.dia)} · {CAT_GASTO[g.categoria] ?? g.categoria}{g.auto ? ` · ${g.auto}` : ''}
            </span>
          </span>
          <span className="font-mono tabular-nums shrink-0">{money(g.monto)}</span>
        </li>
      ))}
    </ul>
  )
}

export function GastosCard({ report, sel, onSel }: { report: CashflowReport; sel: Sel; onSel: (s: Sel) => void }) {
  const G = report.gastos
  const meses = report.meses
  const items = meses.map(m => ({ mes: m, partes: G[m] as unknown as Record<string, number> }))
  const totalDe = (ms: string[]) => ms.reduce((s, m) => s + GASTO_SERIES.reduce((t, se) => t + (G[m] as any)[se.key], 0), 0)
  const totalSel = totalDe(sel === 'total' ? meses : [sel])
  const filas: Fila[] = [
    ...GASTO_SERIES.map(se => ({ key: se.key, label: <span className="flex items-center gap-1.5"><span className="inline-block size-2 rounded-sm" style={{ background: se.color }} />{se.label}</span>, valores: (m: string) => (G[m] as any)[se.key] as number, sinSigno: true })),
    { key: 'tot', label: 'Total', valores: (m: string) => totalDe([m]), sinSigno: true, tipo: 'total' as const },
  ]
  const cerrados = report.equilibrio.mesesBase

  return (
    <Seccion
      titulo="¿En qué se va la plata?"
      ayuda={<>Lo que salió de la caja cada mes que NO es comprar autos ni devolver préstamos: gastos generales, preparación de autos (arreglos, papeles, lavado), intereses pagados y retiros personales.</>}
      contentClassName="space-y-5"
    >
      <div className="grid gap-6 lg:grid-cols-5">
        <div className="lg:col-span-3 min-w-0">
          <ColumnasApiladas items={items} series={GASTO_SERIES} seleccionado={sel === 'total' ? null : sel} onSelect={onSel} fmtValor={money} />
        </div>
        <div className="lg:col-span-2 min-w-0">
          <div className="flex items-baseline justify-between mb-2">
            <p className="text-2xs uppercase tracking-wide text-muted-foreground">
              Gastos más grandes {sel === 'total' ? 'desde el inicio' : `de ${mesLargo(sel)}`}
            </p>
            <span className="text-xs text-muted-foreground">total {money(r2(totalSel))}</span>
          </div>
          <TopGastos report={report} sel={sel} />
        </div>
      </div>
      <TablaColumnas
        columnas={meses} etiqueta={mesCorto} filas={filas} sel={sel} onSel={onSel}
        extra={cerrados.length ? {
          label: 'Prom. mensual',
          valor: f => f.tipo === 'grupo' ? '' : money(r2(cerrados.reduce((s, m) => s + f.valores(m), 0) / cerrados.length)),
        } : undefined}
      />
    </Seccion>
  )
}

// ── Stock y deuda ────────────────────────────────────────────────────────────

export function StockCard({ report }: { report: CashflowReport }) {
  const s = report.stock
  const costo = s.reduce((a, x) => a + x.costo, 0)
  const ganancia = s.reduce((a, x) => a + x.ganancia, 0)
  return (
    <Seccion titulo="Plata inmovilizada en stock" contentClassName="p-0 overflow-x-auto"
      ayuda="Autos propios sin vender: cuánto costaron (compra + gastos), a cuánto se espera venderlos y hace cuántos días están. Cada mes parado cuesta interés y estructura.">
      <table className="w-full text-[13px]">
        <thead>
          <tr className="border-b border-border">
            <Th>Auto</Th><Th right>Días</Th><Th right>Costo</Th><Th right>Precio esp.</Th><Th right>Ganancia esp.</Th>
          </tr>
        </thead>
        <tbody>
          {s.map(a => (
            <tr key={a.vehicle_id} className="border-b border-border/60">
              <td className={tdCls}>
                {a.label}
                {a.socioPct > 0 && <span className="ml-1.5 text-2xs text-muted-foreground">socio {a.socioPct}%</span>}
                {a.sinValuar && <span className="ml-1.5 text-2xs text-warning">sin precio</span>}
              </td>
              <td className={cn(tdMoneyCls, a.dias > 60 && 'text-warning')}>{a.dias}</td>
              <td className={tdMoneyCls}>{money(a.costo)}</td>
              <td className={tdMoneyCls}>{money(a.precio)}</td>
              <td className={cn(tdMoneyCls, signoCls(a.ganancia))}>{moneyDelta(a.ganancia)}</td>
            </tr>
          ))}
          <tr className="font-medium bg-muted/30">
            <td className={tdCls}>Total</td>
            <td className={tdMoneyCls} />
            <td className={tdMoneyCls}>{money(r2(costo))}</td>
            <td className={tdMoneyCls} />
            <td className={cn(tdMoneyCls, signoCls(ganancia))}>{moneyDelta(r2(ganancia))}</td>
          </tr>
        </tbody>
      </table>
    </Seccion>
  )
}

export function DeudaCard({ report }: { report: CashflowReport }) {
  const p = report.prestamos
  const total = p.reduce((a, x) => a + x.deuda, 0)
  const interes = p.reduce((a, x) => a + x.interesMensual, 0)
  return (
    <Seccion titulo="Deuda y su costo" contentClassName="p-0 overflow-x-auto"
      ayuda={<>Préstamos activos, derivados del ledger. &quot;Al final&quot; = sin cuota: el interés se acumula y se paga al cancelar.</>}>
      <table className="w-full text-[13px]">
        <thead>
          <tr className="border-b border-border">
            <Th>Acreedor</Th><Th>Modalidad</Th><Th right>Tasa</Th><Th right>Interés/mes</Th><Th right>Deuda</Th>
          </tr>
        </thead>
        <tbody>
          {p.map(x => (
            <tr key={x.id} className="border-b border-border/60">
              <td className={tdCls}>{x.acreedor}</td>
              <td className={cn(tdCls, 'text-muted-foreground')}>{x.modalidad === 'mensual' ? 'cuota mensual' : 'al final'}</td>
              <td className={tdMoneyCls}>{pct(x.tasa)}</td>
              <td className={tdMoneyCls}>{x.interesMensual > 0 ? money(x.interesMensual) : '—'}</td>
              <td className={tdMoneyCls}>{money(x.deuda)}</td>
            </tr>
          ))}
          <tr className="font-medium bg-muted/30">
            <td className={tdCls}>Total</td>
            <td className={tdCls} />
            <td className={tdMoneyCls} />
            <td className={tdMoneyCls}>{money(r2(interes))}</td>
            <td className={tdMoneyCls}>{money(r2(total))}</td>
          </tr>
        </tbody>
      </table>
    </Seccion>
  )
}

// ── A revisar ────────────────────────────────────────────────────────────────

export function RevisarLista({ report }: { report: CashflowReport }) {
  if (!report.anomalias.length) return <p className="px-3 py-3 text-sm text-muted-foreground">Nada raro en el ledger.</p>
  return (
    <ul className="divide-y divide-border text-[13px]">
      {report.anomalias.map((a, i) => (
        <li key={i} className="flex items-start justify-between gap-4 px-3 py-2.5">
          <span className="min-w-0">
            <span className="block font-medium">{a.titulo}</span>
            <span className="block text-muted-foreground">{a.detalle}</span>
          </span>
          {a.monto !== null && <span className={cn('font-mono tabular-nums shrink-0', signoCls(a.monto))}>{moneyDelta(a.monto)}</span>}
        </li>
      ))}
    </ul>
  )
}

export function RevisarCard({ report }: { report: CashflowReport }) {
  return (
    <Card size="sm" className="border-warning/40">
      <CardHeader className="border-b py-3">
        <CardTitle className="text-sm flex items-center gap-1.5">
          <AlertTriangleIcon className="size-4 text-warning" /> A revisar ({report.anomalias.length})
          <InfoTip>Datos del ledger que probablemente estén mal o incompletos y mueven el capital. Se corrigen por el MCP (Claude), no desde esta pantalla.</InfoTip>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <RevisarLista report={report} />
      </CardContent>
    </Card>
  )
}
