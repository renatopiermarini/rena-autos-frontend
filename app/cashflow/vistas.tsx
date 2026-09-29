'use client'
/**
 * Pestañas del tablero /cashflow que no son una sola tarjeta: Resumen, Mes a
 * mes, Anual, Capital, Estadísticas y Reporte (imprimible).
 */
import { useState, type ReactNode } from 'react'
import { PrinterIcon } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { InfoTip } from '@/components/ui/tooltip'
import { Th, tdCls } from '@/components/table-cells'
import { LineaCapital, ColumnasApiladas, ColumnasMes, TipRow } from '@/components/charts/charts'
import { money, moneyDelta } from '@/lib/money'
import { fmtDMY } from '@/lib/date'
import { cn } from '@/lib/utils'
import { LINEAS_PUENTE, mesCorto, mesLargo, type CashflowReport, type ResultadoMes, type CajaMes } from '@/lib/cashflow'
import {
  type Sel, signoCls, r2, num, pct, periodoLabel, sumarResultado, sumarCaja, textoDiagnostico,
  Seccion, Kpi, Chips, SelectorMes, Diagnostico, PuenteLista, SinCajaLista, TablaColumnas,
  filasResultado, filasCaja, GraficoResultado, GraficoCaja, AutosVendidosTabla, ResultadoCard,
  TopGastos, RevisarLista, catLabel, tdMoneyCls,
} from './secciones'

const trimestre = (mes: string) => `T${Math.ceil(Number(mes.slice(5, 7)) / 3)}`
const mesesDelAnio = (report: CashflowReport, anio: string) => report.meses.filter(m => m.startsWith(anio))

// ── Resumen ──────────────────────────────────────────────────────────────────

export function VistaResumen({ report, sel, onSel, irA }: {
  report: CashflowReport; sel: Sel; onSel: (s: Sel) => void; irA: (tab: string) => void
}) {
  const puente = report.puentes[sel] ?? report.puentes[report.mesActual]
  const rango = sel === 'total' ? null : { desde: puente.desde, hasta: puente.hasta }
  const ultimos = report.meses.slice(-7)
  return (
    <div className="space-y-5">
      <SelectorMes report={report} sel={sel} onSel={onSel} />
      <Diagnostico report={report} sel={sel} />
      <Seccion
        titulo="Capital propio: por qué se mueve"
        ayuda={<>El capital propio es la pestaña Patrimonio: <b>cajas + stock a precio esperado + por cobrar − deudas − parte de socios</b>, reconstruido día por día con los datos como estaban cada día. A la derecha, qué lo movió en el período elegido.</>}
        contentClassName="grid gap-6 lg:grid-cols-5"
      >
        <div className="lg:col-span-3 min-w-0">
          <LineaCapital serie={report.capital.serie} rango={rango} fmtValor={money} fmtDia={fmtDMY} height={280} />
        </div>
        <div className="lg:col-span-2 min-w-0">
          <PuenteLista p={puente} titulo={periodoLabel(sel, report)} />
        </div>
      </Seccion>
      <div className="grid gap-5 lg:grid-cols-2">
        <Seccion titulo="Ganancia por mes" ayuda="Margen de autos vendidos + comisiones − gastos − intereses, mes por mes. En el detalle de cada barra están los retiros y lo que quedó después."
          accion={<button type="button" onClick={() => irA('mensual')} className="text-xs font-normal text-primary hover:underline">Ver mes a mes →</button>}>
          <GraficoResultado report={report} meses={ultimos} sel={sel} onSel={onSel} />
        </Seccion>
        <Seccion titulo="Caja por mes" ayuda="Entradas y salidas reales de las cajas (sin transferencias entre cuentas propias)."
          accion={<button type="button" onClick={() => irA('caja')} className="text-xs font-normal text-primary hover:underline">Ver flujo de caja →</button>}>
          <GraficoCaja report={report} meses={ultimos} sel={sel} onSel={onSel} height={200} />
        </Seccion>
      </div>
      {report.anomalias.length > 0 && (
        <button type="button" onClick={() => irA('revisar')}
          className="w-full rounded-lg border border-warning/40 bg-warning/5 px-3 py-2.5 text-left text-sm hover:bg-warning/10 transition-colors">
          <b>{report.anomalias.length} cosas a revisar</b> en el ledger que mueven el capital
          <span className="text-muted-foreground"> — {report.anomalias.slice(0, 2).map(a => a.titulo).join(' · ')}{report.anomalias.length > 2 ? '…' : ''}</span>
        </button>
      )}
    </div>
  )
}

// ── Mes a mes ────────────────────────────────────────────────────────────────
//
// Lo simple primero: cuánto se ganó con autos y comisiones, cuánto se gastó y
// la ganancia, mes por mes. El detalle línea por línea queda plegado abajo.

type MesSimple = { bruta: number; gastos: number; ganancia: number; retiros: number; despues: number; vendidos: number; consig: number }

function mesSimple(r: ResultadoMes): MesSimple {
  return {
    bruta: r.margenAutos + r.comisiones,
    gastos: -(r.gastosGenerales + r.gastosSinAuto + r.intereses),
    ganancia: r.operativo,
    retiros: -r.retiros,
    despues: r.neto,
    vendidos: r.autosVendidos.length,
    consig: r.consignacionesVendidas,
  }
}

function VsAnterior({ v, antes, alReves = false }: { v: number; antes: number | null; alReves?: boolean }) {
  if (antes === null) return null
  const d = v - antes
  if (Math.abs(d) < 0.005) return <>igual que el mes anterior</>
  const bueno = alReves ? d < 0 : d > 0
  return <><span className={bueno ? 'text-success' : 'text-destructive'}>{d > 0 ? '▲' : '▼'} {money(r2(Math.abs(d)))}</span> vs. mes anterior</>
}

export function VistaMensual({ report, sel, onSel }: { report: CashflowReport; sel: Sel; onSel: (s: Sel) => void }) {
  const [detalle, setDetalle] = useState(false)
  const mes = report.meses.includes(sel) ? sel : report.mesActual
  const i = report.meses.indexOf(mes)
  const anterior = i > 0 ? report.meses[i - 1] : null
  const S = (m: string) => mesSimple(report.resultado[m])
  const a = S(mes)
  const b = anterior ? S(anterior) : null
  const r = report.resultado[mes]
  const consig = report.consignaciones.filter(c => c.dia.startsWith(mes))
  const filas = [...report.meses].reverse()
  const tot = report.meses.reduce((acc, m) => {
    const x = S(m)
    return { bruta: acc.bruta + x.bruta, gastos: acc.gastos + x.gastos, ganancia: acc.ganancia + x.ganancia, retiros: acc.retiros + x.retiros, despues: acc.despues + x.despues, vendidos: acc.vendidos + x.vendidos, consig: acc.consig + x.consig }
  }, { bruta: 0, gastos: 0, ganancia: 0, retiros: 0, despues: 0, vendidos: 0, consig: 0 })

  return (
    <div className="space-y-5">
      <SelectorMes report={report} sel={mes} onSel={onSel} conTotal={false} />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi label={`Ganancia bruta ${mesCorto(mes)}`} value={money(r2(a.bruta))}
          sub={<>{a.vendidos} autos + {a.consig} consignaciones · <VsAnterior v={a.bruta} antes={b?.bruta ?? null} /></>}
          tip="Lo que dejaron los autos propios vendidos en el mes (cobrado − compra − arreglos) más las comisiones de consignaciones." />
        <Kpi label={`Gastos ${mesCorto(mes)}`} value={money(r2(a.gastos))} tone={a.gastos > 0 ? 'negative' : 'default'}
          sub={<VsAnterior v={a.gastos} antes={b?.gastos ?? null} alReves />}
          tip="Gastos generales del negocio (cochera, sueldos, papelería, publicidad…) + intereses de los préstamos. Los arreglos de cada auto ya están descontados de su ganancia." />
        <Kpi tone="hero" label={`Ganancia ${mesCorto(mes)}`} value={moneyDelta(r2(a.ganancia))} signo={a.ganancia}
          sub={<VsAnterior v={a.ganancia} antes={b?.ganancia ?? null} />}
          tip="Ganancia bruta − gastos." />
        <Kpi label="Después de retiros" value={moneyDelta(r2(a.despues))} signo={a.despues}
          sub={<>retiraste {money(r2(a.retiros))}</>}
          tip="La ganancia menos lo que sacaste para vos. Es lo que suma (o resta) al capital del negocio." />
      </div>

      <Seccion
        titulo="Ganancia y gastos por mes"
        ayuda="Verde: lo que dejaron autos y comisiones. Rojo: gastos generales e intereses. La raya es la ganancia. Tocá un mes para ver su detalle."
        contentClassName="space-y-4"
      >
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5"><span className="inline-block size-2.5 rounded-sm bg-success" />Ganancia bruta</span>
          <span className="flex items-center gap-1.5"><span className="inline-block size-2.5 rounded-sm bg-destructive" />Gastos</span>
          <span className="flex items-center gap-1.5"><span className="inline-block h-0.5 w-3 rounded bg-foreground" />Ganancia</span>
        </div>
        <ColumnasMes
          items={report.meses.map(m => { const x = S(m); return { mes: m, pos: Math.max(0, x.bruta), neg: Math.max(0, x.gastos), neto: x.ganancia } })}
          seleccionado={mes} onSelect={onSel} height={220}
          tooltip={it => {
            const x = S(it.mes)
            return (
              <>
                <p className="font-medium mb-1">{mesCorto(it.mes)}</p>
                <TipRow label="Ganancia bruta" value={money(r2(x.bruta))} swatch="var(--success)" />
                <TipRow label="Gastos" value={money(r2(x.gastos))} swatch="var(--destructive)" />
                <TipRow label="Ganancia" value={moneyDelta(r2(x.ganancia))} strong />
                <TipRow label="Retiros" value={money(r2(x.retiros))} />
              </>
            )
          }}
        />
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-border">
                <Th>Mes</Th><Th right>Vendidos</Th><Th right>Ganancia bruta</Th><Th right>Gastos</Th><Th right>Ganancia</Th>
                <Th right>Retiros</Th><Th right>Después de retiros</Th>
              </tr>
            </thead>
            <tbody>
              {filas.map(m => {
                const x = S(m)
                return (
                  <tr key={m} onClick={() => onSel(m)}
                    className={cn('border-b border-border/60 cursor-pointer hover:bg-muted/40', m === mes && 'bg-primary/5')}>
                    <td className={cn(tdCls, m === mes && 'text-primary font-medium')}>{mesLargo(m).charAt(0).toUpperCase() + mesLargo(m).slice(1)} {m.slice(2, 4)}</td>
                    <td className={cn(tdMoneyCls, 'text-muted-foreground')}>{x.vendidos + x.consig || '—'}</td>
                    <td className={tdMoneyCls}>{x.bruta ? money(r2(x.bruta)) : '—'}</td>
                    <td className={cn(tdMoneyCls, x.gastos > 0 && 'text-destructive')}>{x.gastos ? money(r2(x.gastos)) : '—'}</td>
                    <td className={cn(tdMoneyCls, 'font-medium', signoCls(x.ganancia))}>{moneyDelta(r2(x.ganancia))}</td>
                    <td className={cn(tdMoneyCls, 'text-muted-foreground')}>{x.retiros ? money(r2(x.retiros)) : '—'}</td>
                    <td className={cn(tdMoneyCls, signoCls(x.despues))}>{moneyDelta(r2(x.despues))}</td>
                  </tr>
                )
              })}
              <tr className="font-medium bg-muted/30">
                <td className={tdCls}>Total</td>
                <td className={tdMoneyCls}>{tot.vendidos + tot.consig}</td>
                <td className={tdMoneyCls}>{money(r2(tot.bruta))}</td>
                <td className={cn(tdMoneyCls, 'text-destructive')}>{money(r2(tot.gastos))}</td>
                <td className={cn(tdMoneyCls, signoCls(tot.ganancia))}>{moneyDelta(r2(tot.ganancia))}</td>
                <td className={tdMoneyCls}>{money(r2(tot.retiros))}</td>
                <td className={cn(tdMoneyCls, signoCls(tot.despues))}>{moneyDelta(r2(tot.despues))}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </Seccion>

      <div className="grid gap-5 lg:grid-cols-2">
        <Seccion titulo={`Qué se vendió en ${mesLargo(mes)}`} contentClassName="space-y-4">
          <div>
            <p className="text-2xs uppercase tracking-wide text-muted-foreground mb-2">Autos propios ({r.autosVendidos.length})</p>
            {r.autosVendidos.length === 0 ? <p className="text-sm text-muted-foreground">Ninguno.</p> : (
              <ul className="divide-y divide-border text-[13px]">
                {r.autosVendidos.map(v => (
                  <li key={v.vehicle_id} className="flex items-baseline justify-between gap-3 py-1.5">
                    <span className="min-w-0">
                      <span className="block truncate">{v.label}</span>
                      <span className="block text-2xs text-muted-foreground">{fmtDMY(v.dia)} · vendido en {money(v.ingresos)} · costó {money(v.costo)}</span>
                    </span>
                    <span className={cn('font-mono tabular-nums shrink-0', signoCls(v.margen))}>{moneyDelta(v.margen)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <p className="text-2xs uppercase tracking-wide text-muted-foreground mb-2">Consignaciones ({consig.length})</p>
            {consig.length === 0 ? <p className="text-sm text-muted-foreground">Ninguna.</p> : (
              <ul className="divide-y divide-border text-[13px]">
                {consig.map(c => (
                  <li key={c.vehicle_id} className="flex items-baseline justify-between gap-3 py-1.5">
                    <span className="min-w-0">
                      <span className="block truncate">{c.label}</span>
                      <span className="block text-2xs text-muted-foreground">{fmtDMY(c.dia)}</span>
                    </span>
                    <span className={cn('font-mono tabular-nums shrink-0', signoCls(c.cobrado))}>{moneyDelta(c.cobrado)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Seccion>

        <Seccion titulo={`En qué se gastó en ${mesLargo(mes)}`} contentClassName="space-y-4">
          <div className="text-[13px]">
            <div className="flex justify-between py-1"><span>Gastos generales</span><span className="font-mono tabular-nums">{money(r2(-(r.gastosGenerales + r.gastosSinAuto)))}</span></div>
            <div className="flex justify-between py-1"><span>Intereses de préstamos</span><span className="font-mono tabular-nums">{money(r2(-r.intereses))}</span></div>
            <div className="flex justify-between py-1 border-t border-border mt-1 font-medium"><span>Gastos</span><span className="font-mono tabular-nums text-destructive">{money(r2(a.gastos))}</span></div>
            <div className="flex justify-between py-1 text-muted-foreground"><span>Retiros personales (aparte)</span><span className="font-mono tabular-nums">{money(r2(a.retiros))}</span></div>
          </div>
          <div>
            <p className="text-2xs uppercase tracking-wide text-muted-foreground mb-2">Los gastos generales más grandes</p>
            <TopGastos report={report} sel={mes} soloGenerales />
          </div>
        </Seccion>
      </div>

      <div className="print:hidden">
        <button type="button" onClick={() => setDetalle(d => !d)} aria-expanded={detalle}
          className="text-sm text-primary hover:underline">
          {detalle ? 'Ocultar el detalle línea por línea' : 'Ver el detalle línea por línea de todos los meses →'}
        </button>
      </div>
      {detalle && <ResultadoCard report={report} sel={mes} onSel={onSel} />}
    </div>
  )
}

function ConsignacionesTabla({ filas }: { filas: CashflowReport['consignaciones'] }) {
  return (
    <table className="w-full text-[13px]">
      <thead>
        <tr className="border-b border-border"><Th>Auto</Th><Th>Vendida</Th><Th right>Días</Th><Th right>Cobrado neto</Th></tr>
      </thead>
      <tbody>
        {filas.map(c => (
          <tr key={c.vehicle_id} className="border-b border-border/60">
            <td className={tdCls}>{c.label}</td>
            <td className={cn(tdCls, 'text-muted-foreground')}>{fmtDMY(c.dia)}</td>
            <td className={tdMoneyCls}>{c.dias}</td>
            <td className={cn(tdMoneyCls, signoCls(c.cobrado))}>{moneyDelta(c.cobrado)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

// ── Anual ────────────────────────────────────────────────────────────────────

export function VistaAnual({ report, anio, onAnio, onSel }: {
  report: CashflowReport; anio: string; onAnio: (a: string) => void; onSel: (s: Sel) => void
}) {
  const meses = mesesDelAnio(report, anio)
  const trimestres = Array.from(new Set(meses.map(trimestre)))
  const porTrim = (t: string) => meses.filter(m => trimestre(m) === t)
  // Trimestre ("T3") o mes ("2026-08"): las mismas filas sirven para las
  // columnas y para el promedio mensual.
  const rT = (k: string) => (/^T\d$/.test(k) ? sumarResultado(report, porTrim(k)) : report.resultado[k])
  const cT = (t: string) => sumarCaja(report, porTrim(t))
  const tot = sumarResultado(report, meses)
  const caja = sumarCaja(report, meses)
  const p = report.puentes[anio]
  const enCurso = anio === report.hoy.slice(0, 4)
  const gastoFijo = -(tot.gastosGenerales + tot.gastosSinAuto + tot.intereses + tot.retiros)

  return (
    <div className="space-y-5">
      <Chips label="Año" opciones={report.anios.map(a => ({ key: a, label: a }))} valor={anio} onCambio={onAnio} />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi tone="hero" label={`Ganancia ${anio}`} value={moneyDelta(r2(tot.operativo))} signo={tot.operativo}
          sub={<>después de retiros {moneyDelta(r2(tot.neto))} · {meses.length} meses{enCurso ? ' (en curso)' : ''}</>}
          tip="Margen de autos vendidos + comisiones − gastos − intereses del año. Abajo, lo que quedó después de los retiros." />
        <Kpi label="Ventas" value={`${tot.autosVendidos.length} + ${tot.consignacionesVendidas}`}
          sub={<>propios (margen {money(r2(tot.margenAutos))}) + consignaciones ({money(r2(tot.comisiones))})</>}
          tip="Autos propios vendidos y consignaciones cobradas en el año." />
        <Kpi label="Gasto fijo del año" value={money(r2(gastoFijo))}
          sub={<>{money(r2(gastoFijo / Math.max(1, meses.length)))}/mes · retiros {money(r2(-tot.retiros))}</>}
          tip="Gastos generales + intereses devengados + retiros personales del año." />
        <Kpi label="Capital en el año" value={moneyDelta(r2(p.capitalFin - p.capitalInicio))} tone={p.capitalFin >= p.capitalInicio ? 'positive' : 'negative'}
          sub={<>de {money(p.capitalInicio)} a {money(p.capitalFin)}</>}
          tip="Variación del capital propio entre el inicio del año (o del sistema) y el cierre (o hoy)." />
      </div>

      <div className="grid gap-5 lg:grid-cols-5">
        <Seccion className="lg:col-span-3" titulo={`Ganancia de ${anio}, mes a mes`} ayuda="Click en un mes para verlo en la pestaña Mes a mes.">
          <GraficoResultado report={report} meses={meses} sel="" onSel={onSel} height={220} />
        </Seccion>
        <Seccion className="lg:col-span-2" titulo={`Qué movió el capital en ${anio}`}>
          <PuenteLista p={p} titulo={periodoLabel(anio, report)} />
        </Seccion>
      </div>

      <Seccion titulo={`Ganancia de ${anio} por trimestre`} contentClassName="space-y-2">
        <TablaColumnas
          columnas={trimestres} etiqueta={t => t} filas={filasResultado(rT, trimestres)}
          extra={{
            label: 'Prom. mensual',
            valor: f => {
              if (f.tipo === 'grupo' || !meses.length) return ''
              const v = meses.reduce((s, m) => s + f.valores(m), 0) / meses.length
              return f.entero ? num(v) : moneyDelta(r2(v))
            },
          }}
        />
      </Seccion>

      <Seccion titulo={`Flujo de caja ${anio} por trimestre`}>
        <TablaColumnas columnas={trimestres} etiqueta={t => t} filas={filasCaja(cT, trimestres, false)} />
        <p className="mt-2 text-xs text-muted-foreground">Caja al cierre{enCurso ? ' (hoy)' : ''}: <span className="font-mono tabular-nums">{money(caja.cajaCierre)}</span></p>
      </Seccion>
    </div>
  )
}

// ── Capital ──────────────────────────────────────────────────────────────────

export function VistaCapital({ report, sel, onSel }: { report: CashflowReport; sel: Sel; onSel: (s: Sel) => void }) {
  const p = report.puentes[sel] ?? report.puentes.total
  const rango = sel === 'total' ? null : { desde: p.desde, hasta: p.hasta }
  const f = report.fotoHoy
  const ecuacion: { label: string; v: number; signo: '+' | '−' | '='; ayuda: string }[] = [
    { label: 'Cajas', v: f.cajas, signo: '+', ayuda: 'Suma de las cajas, derivada del ledger.' },
    { label: 'Stock a precio esperado', v: f.stock, signo: '+', ayuda: `Autos propios sin vender, a su precio objetivo (o publicado; sin precio, al costo), menos señas ya cobradas. Costaron ${money(f.costoStock)}.` },
    { label: 'Por cobrar', v: f.porCobrar, signo: '+', ayuda: 'Gastos adelantados por clientes + comisiones pendientes de consignaciones activas.' },
    { label: 'Deudas', v: f.deuda, signo: '−', ayuda: 'Capital vivo + interés devengado impago de los préstamos activos.' },
    { label: 'Parte de socios', v: f.socios, signo: '−', ayuda: 'Porción del margen esperado que es de un socio.' },
  ]
  return (
    <div className="space-y-5">
      <SelectorMes report={report} sel={sel} onSel={onSel} />
      <Seccion
        titulo="Capital propio, día por día"
        ayuda={<>Reconstruido con los datos como estaban cada día: movimientos hasta ese día, autos que ya estaban y no se habían vendido, préstamos vivos. La valuación del stock usa los precios cargados HOY en cada ficha (no hay historial de precios), así que un auto que se vendió por menos de lo publicado aparece como una baja el día de la venta.</>}
        contentClassName="grid gap-6 lg:grid-cols-5"
      >
        <div className="lg:col-span-3 min-w-0 space-y-4">
          <LineaCapital serie={report.capital.serie} rango={rango} fmtValor={money} fmtDia={fmtDMY} height={320} />
          <SinCajaLista p={p} />
        </div>
        <div className="lg:col-span-2 min-w-0">
          <PuenteLista p={p} titulo={periodoLabel(sel, report)} detalleAbierto />
        </div>
      </Seccion>
      <Seccion titulo="Capital mes por mes" contentClassName="p-0 overflow-x-auto"
        ayuda="Cierre, máximo y mínimo del capital propio reconstruido en cada mes (la tabla del gráfico de arriba).">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="border-b border-border">
              <Th>Mes</Th><Th right>Cierre</Th><Th right>Variación</Th><Th right>Máximo</Th><Th right>Mínimo</Th>
            </tr>
          </thead>
          <tbody>
            {report.meses.map(m => {
              const pts = report.capital.serie.filter(x => x.d.startsWith(m))
              if (!pts.length) return null
              const max = pts.reduce((a, b) => (b.v > a.v ? b : a))
              const min = pts.reduce((a, b) => (b.v < a.v ? b : a))
              const pm = report.puentes[m]
              const d = pm.capitalFin - pm.capitalInicio
              return (
                <tr key={m} className={cn('border-b border-border/60', sel === m && 'bg-primary/5')}>
                  <td className={tdCls}>
                    <button type="button" onClick={() => onSel(m)} className="hover:text-primary">{mesCorto(m)}</button>
                  </td>
                  <td className={tdMoneyCls}>{money(pm.capitalFin)}</td>
                  <td className={cn(tdMoneyCls, signoCls(d))}>{moneyDelta(r2(d))}</td>
                  <td className={cn(tdMoneyCls, 'text-muted-foreground')}>{money(max.v)} <span className="text-2xs">{fmtDMY(max.d).slice(0, 5)}</span></td>
                  <td className={cn(tdMoneyCls, 'text-muted-foreground')}>{money(min.v)} <span className="text-2xs">{fmtDMY(min.d).slice(0, 5)}</span></td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </Seccion>
      <Seccion titulo="De qué está hecho el capital hoy" ayuda="La misma cuenta que Finanzas → Patrimonio.">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 text-[13px]">
          {ecuacion.map(e => (
            <div key={e.label} className="rounded-lg border border-border px-3 py-2">
              <p className="text-2xs uppercase tracking-wide text-muted-foreground flex items-center gap-1">{e.signo} {e.label} <InfoTip>{e.ayuda}</InfoTip></p>
              <p className="font-mono tabular-nums text-base">{money(e.v)}</p>
            </div>
          ))}
          <div className="rounded-lg border border-primary/40 bg-primary/5 px-3 py-2">
            <p className="text-2xs uppercase tracking-wide text-muted-foreground">= Capital propio</p>
            <p className="font-mono tabular-nums text-base font-semibold">{money(report.capital.hoy)}</p>
          </div>
        </div>
      </Seccion>
    </div>
  )
}

// ── Estadísticas ─────────────────────────────────────────────────────────────

function Stat({ label, value, ayuda }: { label: string; value: ReactNode; ayuda?: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5 border-b border-border/60 last:border-0">
      <span className="text-muted-foreground flex items-center gap-1.5">{label}{ayuda && <InfoTip>{ayuda}</InfoTip>}</span>
      <span className="font-mono tabular-nums text-right whitespace-nowrap">{value}</span>
    </div>
  )
}

const mediana = (xs: number[]) => {
  if (!xs.length) return null
  const s = [...xs].sort((a, b) => a - b)
  const k = Math.floor(s.length / 2)
  return s.length % 2 ? s[k] : (s[k - 1] + s[k]) / 2
}
const prom = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null)

export function VistaEstadisticas({ report, alcance, onAlcance }: {
  report: CashflowReport; alcance: string; onAlcance: (a: string) => void
}) {
  const meses = alcance === 'total' ? report.meses : mesesDelAnio(report, alcance)
  const res = sumarResultado(report, meses)
  const ventas = res.autosVendidos
  const consig = report.consignaciones.filter(c => meses.includes(c.dia.slice(0, 7)))
  const costoTot = ventas.reduce((s, a) => s + a.costo, 0)
  const margenTot = ventas.reduce((s, a) => s + a.margen, 0)
  const stock = report.stock
  const deudas = report.prestamos
  const capDeuda = deudas.reduce((s, d) => s + d.capital, 0)
  const tasaPond = capDeuda > 0 ? deudas.reduce((s, d) => s + d.capital * d.tasa, 0) / capDeuda : null
  const mesesCerrados = meses.filter(m => m < report.mesActual)
  const base = mesesCerrados.length ? mesesCerrados : meses
  const ggProm = prom(base.map(m => -(report.resultado[m].gastosGenerales + report.resultado[m].gastosSinAuto)))
  const retProm = prom(base.map(m => -report.resultado[m].retiros))
  const ranking = [...ventas].sort((a, b) => b.margen - a.margen)
  const opcionesAlcance = [{ key: 'total', label: 'Desde el inicio' }, ...report.anios.map(a => ({ key: a, label: a }))]

  return (
    <div className="space-y-5">
      <Chips label="Período" opciones={opcionesAlcance} valor={alcance} onCambio={onAlcance} />
      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4 text-[13px]">
        <Seccion titulo="Autos propios">
          <Stat label="Vendidos" value={ventas.length} />
          <Stat label="Facturado" value={money(r2(ventas.reduce((s, a) => s + a.ingresos, 0)))} />
          <Stat label="Margen total" value={<span className={signoCls(margenTot)}>{moneyDelta(r2(margenTot))}</span>} />
          <Stat label="Margen promedio" value={ventas.length ? money(r2(margenTot / ventas.length)) : '—'} />
          <Stat label="Margen mediano" value={mediana(ventas.map(a => a.margen)) === null ? '—' : money(r2(mediana(ventas.map(a => a.margen))!))} ayuda="La mitad de los autos dejó más que esto y la otra mitad menos. Menos sensible que el promedio a un auto que salió muy bien o muy mal." />
          <Stat label="Margen sobre costo" value={pct(costoTot > 0 ? (margenTot / costoTot) * 100 : null)} />
          <Stat label="Días promedio hasta vender" value={prom(ventas.map(a => a.dias)) === null ? '—' : num(prom(ventas.map(a => a.dias))!, 0)} />
          <Stat label="Preparación promedio por auto" value={ventas.length ? money(r2(ventas.reduce((s, a) => s + a.gastos, 0) / ventas.length)) : '—'} ayuda="Gastos del auto (arreglos, papeles, lavado) sin la compra." />
        </Seccion>
        <Seccion titulo="Consignaciones">
          <Stat label="Vendidas" value={consig.length} />
          <Stat label="Cobrado neto" value={money(r2(consig.reduce((s, c) => s + c.cobrado, 0)))} ayuda="Comisión + seña − gastos hechos en el auto." />
          <Stat label="Comisión promedio" value={consig.length ? money(r2(consig.reduce((s, c) => s + c.cobrado, 0) / consig.length)) : '—'} />
          <Stat label="Días promedio hasta vender" value={prom(consig.map(c => c.dias)) === null ? '—' : num(prom(consig.map(c => c.dias))!, 0)} />
          <Stat label="Comisiones del período" value={money(r2(res.comisiones))} ayuda="Como en la ganancia: todo lo cobrado por consignaciones en el período, vendidas o no." />
        </Seccion>
        <Seccion titulo="Estructura">
          <Stat label="Gastos generales / mes" value={ggProm === null ? '—' : money(r2(ggProm))} ayuda="Promedio de los meses cerrados del período." />
          <Stat label="Retiros / mes" value={retProm === null ? '—' : money(r2(retProm))} />
          <Stat label="Intereses del período" value={money(r2(-res.intereses))} />
          <Stat label="Ganancia / mes" value={<span className={signoCls(res.operativo)}>{moneyDelta(r2(res.operativo / Math.max(1, meses.length)))}</span>} />
          <Stat label="Después de retiros / mes" value={<span className={signoCls(res.neto)}>{moneyDelta(r2(res.neto / Math.max(1, meses.length)))}</span>} />
          <Stat label="Punto de equilibrio" value={report.equilibrio.autosNecesarios === null ? '—' : `${num(report.equilibrio.autosNecesarios)} autos/mes`} ayuda="Autos propios por mes que hacen falta para cubrir el gasto fijo con el margen promedio de los últimos meses." />
        </Seccion>
        <Seccion titulo="Hoy">
          <Stat label="Autos en stock" value={stock.length} />
          <Stat label="Plata inmovilizada" value={money(r2(stock.reduce((s, a) => s + a.costo, 0)))} />
          <Stat label="Días promedio en stock" value={prom(stock.map(a => a.dias)) === null ? '—' : num(prom(stock.map(a => a.dias))!, 0)} />
          <Stat label="Deuda" value={money(report.fotoHoy.deuda)} />
          <Stat label="Tasa promedio ponderada" value={pct(tasaPond)} />
          <Stat label="Interés mensual" value={money(report.fotoHoy.interesMensual)} />
        </Seccion>
      </div>

      <Seccion titulo="Ventas por mes" ayuda="Cantidad de autos propios vendidos y de consignaciones cobradas, por mes.">
        <ColumnasApiladas
          items={meses.map(m => ({ mes: m, partes: { propios: report.resultado[m].autosVendidos.length, consig: report.resultado[m].consignacionesVendidas } }))}
          series={[{ key: 'propios', label: 'Autos propios', color: 'var(--cat-1)' }, { key: 'consig', label: 'Consignaciones', color: 'var(--cat-3)' }]}
          fmtValor={n => num(n, 0)} height={200}
        />
      </Seccion>

      <Seccion titulo="Ranking de autos propios vendidos" contentClassName="p-0 overflow-x-auto"
        ayuda="Ordenados por margen. % por mes = margen sobre costo dividido los meses que el auto estuvo parado: compara un auto que dejó poco pero rápido con uno que dejó mucho pero tardó.">
        {ranking.length === 0 ? <p className="px-3 py-3 text-sm text-muted-foreground">Sin ventas en el período.</p> : (
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-border">
                <Th>Auto</Th><Th>Vendido</Th><Th right>Días</Th><Th right>Costo</Th><Th right>Cobrado</Th><Th right>Margen</Th><Th right>% s/costo</Th><Th right>% por mes</Th>
              </tr>
            </thead>
            <tbody>
              {ranking.map(a => {
                const pc = a.costo > 0 ? (a.margen / a.costo) * 100 : null
                const pm = pc === null ? null : pc / Math.max(1, a.dias / 30)
                return (
                  <tr key={a.vehicle_id} className="border-b border-border/60">
                    <td className={tdCls}>{a.label}{a.socioPct > 0 && <span className="ml-1.5 text-2xs text-muted-foreground">socio {a.socioPct}%</span>}</td>
                    <td className={cn(tdCls, 'text-muted-foreground')}>{fmtDMY(a.dia)}</td>
                    <td className={tdMoneyCls}>{a.dias}</td>
                    <td className={tdMoneyCls}>{money(a.costo)}</td>
                    <td className={tdMoneyCls}>{money(a.ingresos)}</td>
                    <td className={cn(tdMoneyCls, signoCls(a.margen))}>{moneyDelta(a.margen)}</td>
                    <td className={cn(tdMoneyCls, pc === null ? undefined : signoCls(pc))}>{pct(pc)}</td>
                    <td className={cn(tdMoneyCls, pm === null ? undefined : signoCls(pm))}>{pct(pm)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </Seccion>

      <Seccion titulo={`Consignaciones vendidas (${consig.length})`} contentClassName={consig.length ? 'p-0 overflow-x-auto' : undefined}>
        {consig.length === 0 ? <p className="text-sm text-muted-foreground">Ninguna en el período.</p> : <ConsignacionesTabla filas={[...consig].reverse()} />}
      </Seccion>
    </div>
  )
}

// ── Reporte imprimible ───────────────────────────────────────────────────────

export function VistaReporte({ report, sel, onSel, anio, onAnio, titulo }: {
  report: CashflowReport; sel: Sel; onSel: (s: Sel) => void; anio: string; onAnio: (a: string) => void; titulo: string
}) {
  const [modo, setModo] = useState<'mes' | 'anio'>(/^\d{4}$/.test(sel) ? 'anio' : 'mes')
  const mes = report.meses.includes(sel) ? sel : report.mesActual
  const clave = modo === 'mes' ? mes : anio
  const meses = modo === 'mes' ? [mes] : mesesDelAnio(report, anio)
  const res: ResultadoMes = sumarResultado(report, meses)
  const caja: CajaMes = sumarCaja(report, meses)
  const p = report.puentes[clave]
  const nombre = modo === 'mes' ? `${mesLargo(mes)} ${mes.slice(0, 4)}` : anio
  const consig = report.consignaciones.filter(c => meses.includes(c.dia.slice(0, 7)))
  const { delta, bajan, suben } = textoDiagnostico(report, clave)
  const enCurso = modo === 'mes' ? mes === report.mesActual : anio === report.hoy.slice(0, 4)

  const Bloque = ({ t, children }: { t: string; children: ReactNode }) => (
    <section className="break-inside-avoid">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground border-b border-border pb-1 mb-2">{t}</h2>
      {children}
    </section>
  )
  const Linea = ({ l, v, fuerte, sinSigno }: { l: ReactNode; v: number; fuerte?: boolean; sinSigno?: boolean }) => (
    <div className={cn('flex justify-between py-0.5', fuerte && 'font-semibold border-t border-border mt-1 pt-1')}>
      <span>{l}</span>
      <span className={cn('font-mono tabular-nums', !sinSigno && signoCls(v))}>{sinSigno ? money(r2(v)) : moneyDelta(r2(v))}</span>
    </div>
  )

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 print:hidden">
        <Chips label="Informe" opciones={[{ key: 'mes', label: 'Mensual' }, { key: 'anio', label: 'Anual' }]} valor={modo} onCambio={v => setModo(v as 'mes' | 'anio')} />
        {modo === 'mes'
          ? <SelectorMes report={report} sel={mes} onSel={onSel} conTotal={false} />
          : <Chips label="Año" opciones={report.anios.map(a => ({ key: a, label: a }))} valor={anio} onCambio={onAnio} />}
        <Button size="sm" className="ml-auto" onClick={() => window.print()}>
          <PrinterIcon /> Imprimir / guardar PDF
        </Button>
      </div>

      <Card className="mx-auto max-w-3xl print:max-w-none print:border-0 print:shadow-none">
        <CardContent className="space-y-6 px-6 py-6 text-[13px] leading-relaxed">
          <header>
            <p className="text-xs text-muted-foreground">{titulo}</p>
            <h1 className="text-xl font-semibold tracking-tight">Informe financiero · {nombre.charAt(0).toUpperCase() + nombre.slice(1)}</h1>
            <p className="text-xs text-muted-foreground">
              Del {fmtDMY(p.desde)} al {fmtDMY(p.hasta)}{enCurso ? ' (período en curso)' : ''} · generado el {fmtDMY(report.hoy)} · montos en USD
            </p>
          </header>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {[
              { l: 'Ganancia', v: moneyDelta(r2(res.operativo)), c: signoCls(res.operativo) },
              { l: 'Ganancia después de retiros', v: moneyDelta(r2(res.neto)), c: signoCls(res.neto) },
              { l: 'Capital propio al cierre', v: money(p.capitalFin), c: '' },
              { l: 'Variación del capital', v: moneyDelta(r2(delta)), c: signoCls(delta) },
              { l: 'Caja al cierre', v: money(caja.cajaCierre), c: '' },
              { l: 'Ventas', v: `${res.autosVendidos.length} propios · ${res.consignacionesVendidas} consig.`, c: '' },
            ].map(k => (
              <div key={k.l} className="rounded-lg border border-border px-3 py-2">
                <p className="text-2xs uppercase tracking-wide text-muted-foreground">{k.l}</p>
                <p className={cn('font-mono tabular-nums text-base font-medium', k.c)}>{k.v}</p>
              </div>
            ))}
          </div>

          <Bloque t="En una frase">
            <p>
              El capital propio {delta >= 0 ? 'subió' : 'bajó'} <b>{money(Math.abs(r2(delta)))}</b> (de {money(p.capitalInicio)} a {money(p.capitalFin)}).
              {bajan.length > 0 && <> Lo bajaron {bajan.map(l => `${l.label.toLowerCase()} (${moneyDelta(l.v)})`).join(', ')}.</>}
              {suben.length > 0 && <> Lo subieron {suben.map(l => `${l.label.toLowerCase()} (${moneyDelta(l.v)})`).join(', ')}.</>}
              {' '}La ganancia fue {moneyDelta(r2(res.operativo))}; después de {money(r2(-res.retiros))} de retiros quedaron {moneyDelta(r2(res.neto))}.
            </p>
          </Bloque>

          <div className="grid gap-6 sm:grid-cols-2">
            <Bloque t="Ganancia">
              <Linea l={`Margen de ${res.autosVendidos.length} autos propios vendidos`} v={res.margenAutos} />
              <Linea l={`Comisiones (${res.consignacionesVendidas} consignaciones)`} v={res.comisiones} />
              <Linea l="Gastos generales" v={res.gastosGenerales + res.gastosSinAuto} />
              <Linea l="Intereses devengados" v={res.intereses} />
              <Linea l="Ganancia" v={res.operativo} fuerte />
              <Linea l="Retiros personales" v={res.retiros} />
              <Linea l="Ganancia después de retiros" v={res.neto} fuerte />
            </Bloque>
            <Bloque t="Qué movió el capital">
              <Linea l="Capital al inicio" v={p.capitalInicio} sinSigno />
              {LINEAS_PUENTE.filter(l => Math.abs(p.lineas[l.key]) >= 0.5).map(l => <Linea key={l.key} l={l.label} v={p.lineas[l.key]} />)}
              <Linea l="Capital al cierre" v={p.capitalFin} fuerte sinSigno />
            </Bloque>
          </div>

          <Bloque t="Flujo de caja">
            <div className="grid gap-x-6 sm:grid-cols-2">
              <div>
                <Linea l="Entradas" v={caja.entradas} sinSigno />
                <Linea l="Salidas" v={-caja.salidas} />
                <Linea l="Flujo neto" v={caja.neto} fuerte />
              </div>
              <div className="text-muted-foreground">
                {filasCaja(() => caja, ['x'], false).filter(f => f.tipo !== 'grupo' && f.tipo !== 'total' && f.tipo !== 'tenue').map(f => (
                  <div key={f.key} className="flex justify-between py-0.5">
                    <span>{f.label}</span>
                    <span className={cn('font-mono tabular-nums', signoCls(f.valores('x')))}>{moneyDelta(r2(f.valores('x')))}</span>
                  </div>
                ))}
              </div>
            </div>
          </Bloque>

          {res.autosVendidos.length > 0 && (
            <Bloque t={`Autos propios vendidos (${res.autosVendidos.length})`}>
              <AutosVendidosTabla vendidos={res.autosVendidos} />
            </Bloque>
          )}
          {consig.length > 0 && (
            <Bloque t={`Consignaciones vendidas (${consig.length})`}>
              <ConsignacionesTabla filas={consig} />
            </Bloque>
          )}

          <div className="grid gap-6 sm:grid-cols-2">
            <Bloque t="Gastos más grandes">
              <TopGastos report={report} sel={clave} />
            </Bloque>
            <Bloque t="Deuda al día de hoy">
              {report.prestamos.map(d => (
                <div key={d.id} className="flex justify-between py-0.5">
                  <span>{d.acreedor} <span className="text-muted-foreground">· {pct(d.tasa)} {d.modalidad === 'mensual' ? 'cuota mensual' : 'al final'}</span></span>
                  <span className="font-mono tabular-nums">{money(d.deuda)}</span>
                </div>
              ))}
              <Linea l="Total" v={report.fotoHoy.deuda} fuerte sinSigno />
            </Bloque>
          </div>

          {report.anomalias.length > 0 && (
            <Bloque t="A revisar en los datos">
              <ul className="list-disc pl-5 space-y-0.5 text-muted-foreground">
                {report.anomalias.map((a, i) => <li key={i}>{a.titulo}{a.monto !== null ? ` (${moneyDelta(a.monto)})` : ''}</li>)}
              </ul>
            </Bloque>
          )}
          {p.sinCaja.length > 0 && (
            <p className="text-xs text-muted-foreground">
              Incluye {p.sinCaja.length} movimientos que no pasaron por caja ({p.sinCaja.slice(0, 3).map(m => catLabel(m.categoria).toLowerCase()).join(', ')}{p.sinCaja.length > 3 ? '…' : ''}).
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

export function VistaRevisar({ report }: { report: CashflowReport }) {
  return (
    <Seccion titulo={`A revisar (${report.anomalias.length})`} contentClassName="p-0"
      ayuda="Datos del ledger que probablemente estén mal o incompletos y mueven el capital. Se corrigen por el MCP (Claude), no desde esta pantalla.">
      <RevisarLista report={report} />
    </Seccion>
  )
}
