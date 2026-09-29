'use client'
/**
 * Tablero de cashflow y finanzas (/cashflow): una pantalla aparte, sin el nav
 * del dashboard, con pestañas arriba (mismo esqueleto que el tablero de Kavos:
 * barra de pestañas fija arriba, una sección por pestaña; los KPIs generales
 * van en el Resumen).
 * La pestaña y el período viajan en la URL (?tab=anual&p=2026) para poder
 * mandar el link de una vista puntual.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { ArrowLeftIcon } from 'lucide-react'
import { TooltipProvider } from '@/components/ui/tooltip'
import { ThemeToggle } from '@/components/theme-toggle'
import { fmtDMY } from '@/lib/date'
import { cn } from '@/lib/utils'
import type { CashflowReport } from '@/lib/cashflow'
import {
  type Sel, Kpis, SelectorMes, CajaCard, GastosCard, StockCard, DeudaCard,
} from './secciones'
import {
  VistaResumen, VistaMensual, VistaAnual, VistaCapital, VistaEstadisticas, VistaReporte, VistaRevisar,
} from './vistas'

const TABS = [
  { id: 'resumen',      label: 'Resumen' },
  { id: 'mensual',      label: 'Mes a mes' },
  { id: 'anual',        label: 'Anual' },
  { id: 'capital',      label: 'Capital' },
  { id: 'caja',         label: 'Flujo de caja' },
  { id: 'gastos',       label: 'Gastos' },
  { id: 'deuda',        label: 'Stock y deuda' },
  { id: 'estadisticas', label: 'Estadísticas' },
  { id: 'reporte',      label: 'Reporte' },
  { id: 'revisar',      label: 'A revisar' },
] as const
type Tab = typeof TABS[number]['id']

export default function CashflowClient({ report, tabInicial, periodoInicial, titulo = 'Renato Piermarini Autos' }: {
  report: CashflowReport; tabInicial?: string; periodoInicial?: string; titulo?: string
}) {
  const anioActual = report.hoy.slice(0, 4)
  const [tab, setTab] = useState<Tab>(TABS.some(t => t.id === tabInicial) ? tabInicial as Tab : 'resumen')
  const [sel, setSel] = useState<Sel>(
    periodoInicial && (report.meses.includes(periodoInicial) || periodoInicial === 'total') ? periodoInicial : report.mesActual,
  )
  const [anio, setAnio] = useState<string>(
    periodoInicial && report.anios.includes(periodoInicial) ? periodoInicial : anioActual,
  )
  const [alcance, setAlcance] = useState<string>(
    periodoInicial && (report.anios.includes(periodoInicial) || periodoInicial === 'total') ? periodoInicial : 'total',
  )
  const contenido = useRef<HTMLDivElement>(null)

  // La URL refleja lo que se está mirando, sin navegar (replaceState).
  useEffect(() => {
    const p = tab === 'anual' ? anio : tab === 'estadisticas' ? alcance : sel
    const qs = new URLSearchParams({ tab, p })
    window.history.replaceState(null, '', `${window.location.pathname}?${qs}`)
  }, [tab, sel, anio, alcance])

  const irA = useCallback((t: string) => {
    setTab(t as Tab)
    requestAnimationFrame(() => contenido.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
  }, [])

  // Elegir un mes desde un gráfico o una tabla de otra vista lleva al detalle
  // del mes (la vista Anual y el Resumen no tienen detalle propio).
  const elegirMes = useCallback((m: Sel) => {
    setSel(m)
    if (tab === 'anual') irA('mensual')
  }, [tab, irA])

  const n = report.anomalias.length

  return (
    <TooltipProvider>
      <div className="space-y-5">
        <header className="flex items-start justify-between gap-3 print:hidden">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
              <Link href="/" className="inline-flex items-center gap-1 hover:text-foreground transition-colors">
                <ArrowLeftIcon className="size-3.5" /> Tablero
              </Link>
              <span aria-hidden>·</span>
              <Link href="/finanzas" className="hover:text-foreground transition-colors">Finanzas (movimientos y préstamos)</Link>
            </div>
            <h1 className="text-2xl font-semibold tracking-tight">Cashflow y finanzas</h1>
            <p className="text-sm text-muted-foreground">
              Todo en USD, calculado del ledger al {fmtDMY(report.hoy)}. Solo consulta.
            </p>
          </div>
          <ThemeToggle />
        </header>

        <nav
          aria-label="Secciones"
          className="sticky top-0 z-30 -mx-4 sm:-mx-8 border-b border-border bg-background/90 backdrop-blur-sm print:hidden"
        >
          <div className="relative">
            <div className="flex gap-1 overflow-x-auto scrollbar-hide px-4 sm:px-8 py-2">
              {TABS.map(t => (
                <button
                  key={t.id} type="button"
                  aria-current={tab === t.id ? 'page' : undefined}
                  onClick={e => { e.currentTarget.scrollIntoView({ block: 'nearest', inline: 'center' }); irA(t.id) }}
                  className={cn(
                    'shrink-0 whitespace-nowrap rounded-md px-3 py-1.5 text-sm transition-colors',
                    tab === t.id
                      ? 'bg-primary/10 text-primary font-medium'
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted/60',
                  )}
                >
                  {t.label}
                  {t.id === 'revisar' && n > 0 && (
                    <span className="ml-1.5 inline-grid min-w-4 place-items-center rounded-full bg-warning/15 px-1 text-2xs font-medium text-warning">{n}</span>
                  )}
                </button>
              ))}
            </div>
            <span aria-hidden className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-background to-transparent sm:hidden" />
          </div>
        </nav>

        {/* Los números grandes sólo en el Resumen: cada pestaña trae los suyos y
            dos filas de tarjetas repetían lo mismo (pedido del usuario: simplificar). */}
        {tab === 'resumen' && <Kpis report={report} />}

        <div ref={contenido} className="scroll-mt-16">
          {tab === 'resumen' && <VistaResumen report={report} sel={sel} onSel={setSel} irA={irA} />}
          {tab === 'mensual' && <VistaMensual report={report} sel={sel} onSel={setSel} />}
          {tab === 'anual' && <VistaAnual report={report} anio={anio} onAnio={setAnio} onSel={elegirMes} />}
          {tab === 'capital' && <VistaCapital report={report} sel={sel} onSel={setSel} />}
          {tab === 'caja' && (
            <div className="space-y-5">
              <SelectorMes report={report} sel={sel} onSel={setSel} />
              <CajaCard report={report} sel={sel} onSel={setSel} />
            </div>
          )}
          {tab === 'gastos' && (
            <div className="space-y-5">
              <SelectorMes report={report} sel={sel} onSel={setSel} />
              <GastosCard report={report} sel={sel} onSel={setSel} />
            </div>
          )}
          {tab === 'deuda' && (
            <div className="grid gap-5 lg:grid-cols-2">
              <StockCard report={report} />
              <DeudaCard report={report} />
            </div>
          )}
          {tab === 'estadisticas' && <VistaEstadisticas report={report} alcance={alcance} onAlcance={setAlcance} />}
          {tab === 'reporte' && (
            <VistaReporte report={report} sel={sel} onSel={setSel} anio={anio} onAnio={setAnio} titulo={titulo} />
          )}
          {tab === 'revisar' && <VistaRevisar report={report} />}
        </div>
      </div>
    </TooltipProvider>
  )
}
