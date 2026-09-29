'use client'
/**
 * Gráficos del tablero /cashflow — SVG a mano, sin librería (el repo no tiene
 * ninguna y no hace falta para tres formas). Reglas (ver DESIGN.md):
 *   - barras ≤ 24px, punta redondeada 4px y base recta sobre la línea de cero
 *   - líneas de 2px; grilla y ejes en hairline de --border, nunca punteados
 *   - el texto usa tokens de texto (foreground / muted), nunca el color de la serie
 *   - hover con tooltip en todo; con teclado, flechas ← → recorren los puntos
 */
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { moneyK } from '@/lib/money'
import { mesCorto } from '@/lib/cashflow'
import { cn } from '@/lib/utils'

// ── Infra ────────────────────────────────────────────────────────────────────

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T | null>(null)
  const [w, setW] = useState(0)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    setW(el.clientWidth)
    const raf = requestAnimationFrame(() => setW(el.clientWidth))
    if (typeof ResizeObserver === 'undefined') return () => cancelAnimationFrame(raf)
    const ro = new ResizeObserver(([e]) => setW(e.contentRect.width))
    ro.observe(el)
    return () => { ro.disconnect(); cancelAnimationFrame(raf) }
  }, [])
  return [ref, w] as const
}

/** Ticks "redondos" (1-2-2,5-5 × 10ⁿ) que cubren [min, max]. */
export function niceTicks(min: number, max: number, count = 4): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [0]
  if (min === max) { min -= 1; max += 1 }
  const raw = (max - min) / count
  const mag = 10 ** Math.floor(Math.log10(raw))
  const step = [1, 2, 2.5, 5, 10].map(f => f * mag).find(s => s >= raw) ?? 10 * mag
  const lo = Math.floor(min / step) * step
  const hi = Math.ceil(max / step) * step
  const out: number[] = []
  for (let v = lo; v <= hi + step / 2; v += step) out.push(Math.round(v * 100) / 100)
  return out
}

/** Barra con la punta redondeada y la base recta (la base apoya en el cero). */
function barPath(x: number, yTop: number, w: number, h: number, punta: 'arriba' | 'abajo', r = 4): string {
  if (h <= 0) return ''
  const rr = Math.min(r, w / 2, h)
  if (punta === 'arriba') {
    const yb = yTop + h
    return `M${x},${yb}V${yTop + rr}Q${x},${yTop} ${x + rr},${yTop}H${x + w - rr}Q${x + w},${yTop} ${x + w},${yTop + rr}V${yb}Z`
  }
  const yb = yTop + h
  return `M${x},${yTop}V${yb - rr}Q${x},${yb} ${x + rr},${yb}H${x + w - rr}Q${x + w},${yb} ${x + w},${yb - rr}V${yTop}Z`
}

function Tip({ x, y, width, children }: { x: number; y: number; width: number; children: ReactNode }) {
  // Se abre hacia el lado con más aire, y nunca se sale del contenedor.
  const W = 230
  const left = Math.max(0, Math.min(width - W, x - W / 2))
  return (
    <div
      role="status"
      className="pointer-events-none absolute z-10 rounded-lg border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-overlay"
      style={{ left, top: Math.max(0, y), width: W }}
    >
      {children}
    </div>
  )
}

export function TipRow({ label, value, swatch, strong }: { label: ReactNode; value: ReactNode; swatch?: string; strong?: boolean }) {
  return (
    <div className={cn('flex items-center justify-between gap-3', strong && 'font-medium border-t border-border pt-1 mt-1')}>
      <span className="flex items-center gap-1.5 text-muted-foreground">
        {swatch && <span className="inline-block size-2 rounded-full" style={{ background: swatch }} />}
        {label}
      </span>
      <span className="font-mono tabular-nums">{value}</span>
    </div>
  )
}

// ── Línea: capital propio día por día ────────────────────────────────────────

export function LineaCapital({
  serie, rango, fmtValor, fmtDia, height = 240,
}: {
  serie: { d: string; v: number }[]
  rango?: { desde: string; hasta: string } | null
  fmtValor: (n: number) => string
  fmtDia: (d: string) => string
  height?: number
}) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const [hover, setHover] = useState<number | null>(null)
  const M = { t: 16, r: 16, b: 24, l: 44 }
  const n = serie.length
  if (n === 0) return <div ref={ref} style={{ height }} />

  const vals = serie.map(p => p.v)
  const ticks = niceTicks(Math.min(0, ...vals), Math.max(0, ...vals))
  const yMin = ticks[0], yMax = ticks[ticks.length - 1]
  const iw = Math.max(1, width - M.l - M.r)
  const ih = height - M.t - M.b
  const x = (i: number) => M.l + (n === 1 ? iw / 2 : (i / (n - 1)) * iw)
  const y = (v: number) => M.t + (1 - (v - yMin) / (yMax - yMin || 1)) * ih
  const path = serie.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.v).toFixed(1)}`).join('')
  const area = `${path}L${x(n - 1).toFixed(1)},${y(Math.max(yMin, 0)).toFixed(1)}L${x(0).toFixed(1)},${y(Math.max(yMin, 0)).toFixed(1)}Z`

  // Un tick por mes (el primer día que aparece de cada mes). Si el primero es
  // un mes empezado (la serie arranca el 25/03) y queda pegado al siguiente, se
  // cae: dos etiquetas encimadas no se leen.
  const mesTicksTodos: { i: number; mes: string }[] = []
  serie.forEach((p, i) => {
    const mes = p.d.slice(0, 7)
    if (p.d.endsWith('-01') || (i === 0 && !mesTicksTodos.length)) mesTicksTodos.push({ i, mes })
  })
  // De derecha a izquierda: el mes actual siempre lleva etiqueta y en el
  // celular (meses de ~40px) queda uno sí, uno no.
  const mesTicks: typeof mesTicksTodos = []
  for (let k = mesTicksTodos.length - 1; k >= 0; k--) {
    const t = mesTicksTodos[k]
    const ultimo = mesTicks[0]
    if (!ultimo || x(ultimo.i) - x(t.i) >= 44) mesTicks.unshift(t)
  }

  let banda: { x0: number; x1: number } | null = null
  if (rango) {
    const i0 = serie.findIndex(p => p.d > rango.desde)
    let i1 = -1
    serie.forEach((p, i) => { if (p.d <= rango.hasta) i1 = i })
    if (i0 >= 0 && i1 >= i0) banda = { x0: x(Math.max(0, i0 - 1)), x1: x(i1) }
  }

  const onMove = (e: React.PointerEvent<SVGRectElement>) => {
    const rect = (e.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect()
    const px = e.clientX - rect.left
    const i = Math.round(((px - M.l) / iw) * (n - 1))
    setHover(Math.max(0, Math.min(n - 1, i)))
  }
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
    e.preventDefault()
    const base = hover ?? n - 1
    setHover(Math.max(0, Math.min(n - 1, base + (e.key === 'ArrowRight' ? 1 : -1))))
  }

  const last = serie[n - 1]
  const h = hover !== null ? serie[hover] : null
  const prevMes = h ? serie.filter(p => p.d < h.d.slice(0, 7) + '-01').pop() : null

  return (
    <div ref={ref} className="relative select-none" style={{ height }}>
      {width > 0 && (
        <svg
          width={width} height={height} role="img" tabIndex={0}
          aria-label={`Capital propio día por día, de ${fmtDia(serie[0].d)} a ${fmtDia(last.d)}. Hoy ${fmtValor(last.v)}.`}
          onKeyDown={onKey} onBlur={() => setHover(null)}
          className="outline-none focus-visible:ring-2 focus-visible:ring-ring/50 rounded"
        >
          {banda && <rect x={banda.x0} y={M.t} width={Math.max(2, banda.x1 - banda.x0)} height={ih} className="fill-primary/8" />}
          {ticks.map(t => (
            <g key={t}>
              <line x1={M.l} x2={M.l + iw} y1={y(t)} y2={y(t)} className={t === 0 ? 'stroke-muted-foreground/50' : 'stroke-border'} strokeWidth={1} />
              <text x={M.l - 6} y={y(t)} dy="0.32em" textAnchor="end" className="fill-muted-foreground text-2xs font-mono">{moneyK(t)}</text>
            </g>
          ))}
          {mesTicks.map(({ i, mes }) => (
            <text key={mes} x={x(i)} y={height - 6} textAnchor="start" className="fill-muted-foreground text-2xs">{mesCorto(mes)}</text>
          ))}
          <path d={area} fill="var(--primary)" opacity={0.1} />
          <path d={path} fill="none" stroke="var(--primary)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          {h && hover !== null && (
            <g>
              <line x1={x(hover)} x2={x(hover)} y1={M.t} y2={M.t + ih} className="stroke-muted-foreground/60" strokeWidth={1} />
              <circle cx={x(hover)} cy={y(h.v)} r={5} fill="var(--primary)" stroke="var(--card)" strokeWidth={2} />
            </g>
          )}
          <circle cx={x(n - 1)} cy={y(last.v)} r={4.5} fill="var(--primary)" stroke="var(--card)" strokeWidth={2} />
          <text x={Math.min(x(n - 1), M.l + iw - 4)} y={y(last.v) - 10} textAnchor="end" className="fill-foreground text-xs font-mono font-medium">{fmtValor(last.v)}</text>
          <rect x={M.l} y={M.t} width={iw} height={ih} fill="transparent" onPointerMove={onMove} onPointerLeave={() => setHover(null)} />
        </svg>
      )}
      {h && hover !== null && (
        <Tip x={x(hover)} y={4} width={width}>
          <p className="font-medium mb-1">{fmtDia(h.d)}</p>
          <TipRow label="Capital propio" value={fmtValor(h.v)} swatch="var(--primary)" />
          {prevMes && <TipRow label="vs. cierre del mes anterior" value={`${h.v - prevMes.v >= 0 ? '+' : '−'}${fmtValor(Math.abs(h.v - prevMes.v))}`} />}
        </Tip>
      )}
    </div>
  )
}

// ── Columnas por mes, con cero al medio ──────────────────────────────────────

export type ColumnaMes = { mes: string; pos: number; neg: number; neto?: number }

/**
 * Una columna por mes que crece desde el cero: `pos` hacia arriba (verde),
 * `neg` hacia abajo (rojo), y un punto para el neto. Con sólo `neto` (pos = neg
 * = 0) la barra es el neto, coloreada por signo. Click = elegir el mes.
 */
export function ColumnasMes({
  items, seleccionado, onSelect, tooltip, height = 220, soloNeto = false,
}: {
  items: ColumnaMes[]
  seleccionado?: string | null
  onSelect?: (mes: string) => void
  tooltip: (it: ColumnaMes) => ReactNode
  height?: number
  soloNeto?: boolean
}) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const [hover, setHover] = useState<number | null>(null)
  const M = { t: 12, r: 8, b: 24, l: 44 }
  const vals = items.flatMap(it => soloNeto ? [it.neto ?? 0] : [it.pos, -it.neg, it.neto ?? 0])
  const ticks = niceTicks(Math.min(0, ...vals), Math.max(0, ...vals))
  const yMin = ticks[0], yMax = ticks[ticks.length - 1]
  const iw = Math.max(1, width - M.l - M.r)
  const ih = height - M.t - M.b
  const y = (v: number) => M.t + (1 - (v - yMin) / (yMax - yMin || 1)) * ih
  const slot = iw / Math.max(1, items.length)
  const bw = Math.min(24, slot * 0.34)
  const cx = (i: number) => M.l + slot * i + slot / 2

  const onKey = (e: React.KeyboardEvent) => {
    if (!items.length) return
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault()
      const base = hover ?? items.length - 1
      setHover(Math.max(0, Math.min(items.length - 1, base + (e.key === 'ArrowRight' ? 1 : -1))))
    } else if ((e.key === 'Enter' || e.key === ' ') && hover !== null) {
      e.preventDefault()
      onSelect?.(items[hover].mes)
    }
  }

  return (
    <div ref={ref} className="relative select-none" style={{ height }}>
      {width > 0 && (
        <svg width={width} height={height} role="img" tabIndex={0} onKeyDown={onKey} onBlur={() => setHover(null)}
          aria-label="Columnas por mes. Flechas para recorrer, Enter para elegir el mes."
          className="outline-none focus-visible:ring-2 focus-visible:ring-ring/50 rounded">
          {ticks.map(t => (
            <g key={t}>
              <line x1={M.l} x2={M.l + iw} y1={y(t)} y2={y(t)} className={t === 0 ? 'stroke-muted-foreground/50' : 'stroke-border'} strokeWidth={1} />
              <text x={M.l - 6} y={y(t)} dy="0.32em" textAnchor="end" className="fill-muted-foreground text-2xs font-mono">{moneyK(t)}</text>
            </g>
          ))}
          {items.map((it, i) => {
            const sel = seleccionado === it.mes
            const activo = hover === i || sel
            const y0 = y(0)
            return (
              <g key={it.mes} opacity={seleccionado && !sel && hover !== i ? 0.55 : 1}>
                {sel && <rect x={M.l + slot * i + 2} y={M.t} width={slot - 4} height={ih} rx={4} className="fill-primary/8" />}
                {soloNeto ? (
                  (it.neto ?? 0) !== 0 && (
                    <path
                      d={(it.neto ?? 0) > 0
                        ? barPath(cx(i) - bw / 2, y(it.neto ?? 0), bw, y0 - y(it.neto ?? 0), 'arriba')
                        : barPath(cx(i) - bw / 2, y0, bw, y(it.neto ?? 0) - y0, 'abajo')}
                      fill={(it.neto ?? 0) > 0 ? 'var(--success)' : 'var(--destructive)'}
                    />
                  )
                ) : (
                  <>
                    {it.pos > 0 && <path d={barPath(cx(i) - bw / 2, y(it.pos), bw, y0 - y(it.pos), 'arriba')} fill="var(--success)" />}
                    {it.neg > 0 && <path d={barPath(cx(i) - bw / 2, y0, bw, y(-it.neg) - y0, 'abajo')} fill="var(--destructive)" />}
                    {it.neto !== undefined && (
                      <g>
                        <line x1={cx(i) - bw / 2 - 5} x2={cx(i) + bw / 2 + 5} y1={y(it.neto)} y2={y(it.neto)} stroke="var(--card)" strokeWidth={5} strokeLinecap="round" />
                        <line x1={cx(i) - bw / 2 - 4} x2={cx(i) + bw / 2 + 4} y1={y(it.neto)} y2={y(it.neto)} stroke="var(--foreground)" strokeWidth={2.5} strokeLinecap="round" />
                      </g>
                    )}
                  </>
                )}
                <text x={cx(i)} y={height - 6} textAnchor="middle"
                  className={cn('text-2xs', activo ? 'fill-foreground font-medium' : 'fill-muted-foreground')}>{mesCorto(it.mes)}</text>
                <rect x={M.l + slot * i} y={0} width={slot} height={height} fill="transparent"
                  className={onSelect ? 'cursor-pointer' : undefined}
                  onPointerEnter={() => setHover(i)} onPointerLeave={() => setHover(null)}
                  onClick={() => onSelect?.(it.mes)} />
              </g>
            )
          })}
        </svg>
      )}
      {hover !== null && items[hover] && (
        <Tip x={cx(hover)} y={4} width={width}>
          {tooltip(items[hover])}
        </Tip>
      )}
    </div>
  )
}

// ── Columnas apiladas: en qué se va la plata ─────────────────────────────────

export type Serie = { key: string; label: string; color: string }

export function ColumnasApiladas({
  items, series, seleccionado, onSelect, fmtValor, height = 220,
}: {
  items: { mes: string; partes: Record<string, number> }[]
  series: Serie[]
  seleccionado?: string | null
  onSelect?: (mes: string) => void
  fmtValor: (n: number) => string
  height?: number
}) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const [hover, setHover] = useState<number | null>(null)
  const M = { t: 12, r: 8, b: 24, l: 44 }
  const totales = items.map(it => series.reduce((s, se) => s + Math.max(0, it.partes[se.key] ?? 0), 0))
  const ticks = niceTicks(0, Math.max(1, ...totales))
  const yMax = ticks[ticks.length - 1]
  const iw = Math.max(1, width - M.l - M.r)
  const ih = height - M.t - M.b
  const y = (v: number) => M.t + (1 - v / (yMax || 1)) * ih
  const slot = iw / Math.max(1, items.length)
  const bw = Math.min(24, slot * 0.34)
  const cx = (i: number) => M.l + slot * i + slot / 2
  const GAP = 2

  return (
    <div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 mb-2 text-xs text-muted-foreground">
        {series.map(s => (
          <span key={s.key} className="flex items-center gap-1.5">
            <span className="inline-block size-2.5 rounded-sm" style={{ background: s.color }} />{s.label}
          </span>
        ))}
      </div>
      <div ref={ref} className="relative select-none" style={{ height }}>
        {width > 0 && (
          <svg width={width} height={height} role="img" aria-label="Salidas por tipo y por mes">
            {ticks.map(t => (
              <g key={t}>
                <line x1={M.l} x2={M.l + iw} y1={y(t)} y2={y(t)} className={t === 0 ? 'stroke-muted-foreground/50' : 'stroke-border'} strokeWidth={1} />
                <text x={M.l - 6} y={y(t)} dy="0.32em" textAnchor="end" className="fill-muted-foreground text-2xs font-mono">{moneyK(t)}</text>
              </g>
            ))}
            {items.map((it, i) => {
              let acc = 0
              const visibles = series.filter(se => (it.partes[se.key] ?? 0) > 0)
              const sel = seleccionado === it.mes
              return (
                <g key={it.mes} opacity={seleccionado && !sel && hover !== i ? 0.55 : 1}>
                  {sel && <rect x={M.l + slot * i + 2} y={M.t} width={slot - 4} height={ih} rx={4} className="fill-primary/8" />}
                  {visibles.map((se, k) => {
                    const v = it.partes[se.key] ?? 0
                    const top = y(acc + v)
                    const bottom = y(acc)
                    acc += v
                    const esUltimo = k === visibles.length - 1
                    const h = Math.max(0, bottom - top - (k > 0 ? GAP : 0))
                    return esUltimo
                      ? <path key={se.key} d={barPath(cx(i) - bw / 2, top, bw, h, 'arriba')} fill={se.color} />
                      : <rect key={se.key} x={cx(i) - bw / 2} y={top} width={bw} height={h} fill={se.color} />
                  })}
                  <text x={cx(i)} y={height - 6} textAnchor="middle"
                    className={cn('text-2xs', hover === i || sel ? 'fill-foreground font-medium' : 'fill-muted-foreground')}>{mesCorto(it.mes)}</text>
                  <rect x={M.l + slot * i} y={0} width={slot} height={height} fill="transparent"
                    className={onSelect ? 'cursor-pointer' : undefined}
                    onPointerEnter={() => setHover(i)} onPointerLeave={() => setHover(null)}
                    onClick={() => onSelect?.(it.mes)} />
                </g>
              )
            })}
          </svg>
        )}
        {hover !== null && items[hover] && (
          <Tip x={cx(hover)} y={4} width={width}>
            <p className="font-medium mb-1">{mesCorto(items[hover].mes)}</p>
            {series.map(se => <TipRow key={se.key} label={se.label} value={fmtValor(items[hover].partes[se.key] ?? 0)} swatch={se.color} />)}
            <TipRow label="Total" value={fmtValor(totales[hover])} strong />
          </Tip>
        )}
      </div>
    </div>
  )
}
