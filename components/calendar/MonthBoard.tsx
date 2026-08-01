'use client'
import { useMemo, useState } from 'react'
import Link from 'next/link'
import { ChevronLeftIcon, ChevronRightIcon, CheckIcon } from 'lucide-react'
import { DIAS_CORTOS, MESES_ES, localDayKey, fmtFechaLarga } from '@/lib/date'
import { cn } from '@/lib/utils'

// El tablero: mes completo a la izquierda, el día elegido a la derecha.
// The month answers "which day", the column answers "what is on it". Tareas are
// completed from the column, so the screen is somewhere you act, not just read.

export type BoardItem = {
  id: string | number
  kind: 'visita' | 'turno' | 'tarea'
  /** HH:MM, or null for something due that day with no time (most tareas). */
  hora: string | null
  title: string
  subtitle?: string
  href?: string
  done?: boolean
  urgent?: boolean
  dayKey: string
}

const KIND_LABEL: Record<BoardItem['kind'], string> = {
  visita: 'Visitas', turno: 'Turnos', tarea: 'Tareas',
}
// One hue per kind, far enough apart to tell at a glance in a dot the size of a
// full stop: visita blue, turno amber, tarea green. Tareas were grey, which read as
// "disabled" on the one screen where they are the main thing you act on.
const KIND_DOT: Record<BoardItem['kind'], string> = {
  visita: 'bg-info', turno: 'bg-warning', tarea: 'bg-success',
}
const KIND_CHIP: Record<BoardItem['kind'], string> = {
  visita: 'bg-info/12 text-info',
  turno: 'bg-warning/12 text-warning',
  tarea: 'bg-success/12 text-success',
}
const KIND_ONE: Record<BoardItem['kind'], string> = {
  visita: 'Visita', turno: 'Turno', tarea: 'Tarea',
}

// DIAS_CORTOS is Sunday-first; this grid runs Monday-first like the calendario's
// week view, so the header has to be rotated or every column is mislabelled.
const DOW_LUN = [...DIAS_CORTOS.slice(1), DIAS_CORTOS[0]]

export function MonthBoard({
  items,
  onToggleTarea,
}: {
  items: BoardItem[]
  onToggleTarea?: (id: string | number, done: boolean) => void
}) {
  const today = new Date()
  const todayKey = localDayKey(today)

  const [year, setYear] = useState(today.getFullYear())
  const [month, setMonth] = useState(today.getMonth())
  const [selected, setSelected] = useState<string>(todayKey)
  const [hidden, setHidden] = useState<Set<BoardItem['kind']>>(new Set())

  const toggleKind = (k: BoardItem['kind']) => setHidden(prev => {
    const next = new Set(prev)
    next.has(k) ? next.delete(k) : next.add(k)
    return next
  })

  const shown = items.filter(i => !hidden.has(i.kind))

  const byDay = useMemo(() => {
    const m: Record<string, BoardItem[]> = {}
    for (const i of shown) (m[i.dayKey] ||= []).push(i)
    for (const k of Object.keys(m)) {
      // Timed things first, in order; undated tareas fall to the bottom.
      m[k].sort((a, b) => (a.hora ?? '99:99').localeCompare(b.hora ?? '99:99'))
    }
    return m
  }, [shown])

  const firstDow = (new Date(year, month, 1).getDay() + 6) % 7 // Mon = 0
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const cells: (number | null)[] = [
    ...Array(firstDow).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ]
  while (cells.length % 7 !== 0) cells.push(null)

  const keyOf = (d: number) =>
    `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`

  function shiftMonth(delta: number) {
    const m = month + delta
    if (m < 0) { setYear(y => y - 1); setMonth(11) }
    else if (m > 11) { setYear(y => y + 1); setMonth(0) }
    else setMonth(m)
  }
  function goToday() {
    setYear(today.getFullYear())
    setMonth(today.getMonth())
    setSelected(todayKey)
  }

  const dayItems = byDay[selected] ?? []
  const pendientes = dayItems.filter(i => !i.done).length

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,340px)_minmax(0,1fr)] items-start">

      {/* ── El mes ─────────────────────────────────────────────────────────── */}
      <section className="rounded-lg border border-border bg-card lg:sticky lg:top-20">
        <header className="flex items-center gap-1 border-b border-border px-2 py-2">
          <button
            type="button" aria-label="Mes anterior" onClick={() => shiftMonth(-1)}
            className="grid size-7 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          ><ChevronLeftIcon className="size-4" /></button>
          <span className="flex-1 text-center text-sm font-medium capitalize">
            {MESES_ES[month]} {year}
          </span>
          <button
            type="button" aria-label="Mes siguiente" onClick={() => shiftMonth(1)}
            className="grid size-7 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          ><ChevronRightIcon className="size-4" /></button>
          <button
            type="button" onClick={goToday}
            className="rounded-md px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >Hoy</button>
        </header>

        <div className="p-2">
          <div className="grid grid-cols-7 mb-1">
            {DOW_LUN.map(d => (
              <div key={d} className="py-1 text-center text-[11px] font-medium text-muted-foreground">{d}</div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-0.5">
            {cells.map((day, idx) => {
              if (day === null) return <div key={`e${idx}`} className="aspect-square" />
              const dk = keyOf(day)
              const isToday = dk === todayKey
              const isSel = dk === selected
              const list = byDay[dk] ?? []
              const kinds = Array.from(new Set(list.filter(i => !i.done).map(i => i.kind)))
              return (
                <button
                  key={dk}
                  type="button"
                  onClick={() => setSelected(dk)}
                  aria-pressed={isSel}
                  aria-current={isToday ? 'date' : undefined}
                  aria-label={`${day} de ${MESES_ES[month]}${isToday ? ', hoy' : ''}: ${list.length} ${list.length === 1 ? 'ítem' : 'ítems'}`}
                  className={cn(
                    'relative aspect-square rounded-md flex flex-col items-center justify-center gap-1 text-sm tabular-nums transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    isSel
                      ? 'bg-primary text-primary-foreground font-semibold'
                      : isToday
                        ? 'text-info font-semibold hover:bg-muted'
                        : 'hover:bg-muted',
                  )}
                >
                  <span>{day}</span>
                  {/* Which kinds of thing are on this day, before you click it. */}
                  <span className="flex h-1.5 items-center gap-0.5" aria-hidden>
                    {kinds.map(k => (
                      <span
                        key={k}
                        className={cn(
                          'size-1 rounded-full',
                          isSel ? 'bg-primary-foreground/80' : KIND_DOT[k],
                        )}
                      />
                    ))}
                  </span>
                </button>
              )
            })}
          </div>
        </div>

        <div className="flex items-center gap-1 border-t border-border px-2 py-2">
          {(['visita', 'turno', 'tarea'] as const).map(k => {
            const off = hidden.has(k)
            return (
              <button
                key={k}
                type="button"
                aria-pressed={!off}
                onClick={() => toggleKind(k)}
                className={cn(
                  'inline-flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  off ? 'text-muted-foreground/60 hover:text-muted-foreground' : 'bg-muted text-foreground',
                )}
              >
                <span className={cn('size-1.5 rounded-full', KIND_DOT[k], off && 'opacity-30')} aria-hidden />
                {KIND_LABEL[k]}
              </button>
            )
          })}
        </div>
      </section>

      {/* ── El día ─────────────────────────────────────────────────────────── */}
      <section className="rounded-lg border border-border bg-card">
        <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border px-3 py-2.5">
          <h2 className="text-sm font-medium first-letter:uppercase">
            {fmtFechaLarga(selected)}
            {selected === todayKey && <span className="ml-2 text-xs font-normal text-info">hoy</span>}
          </h2>
          <span className="text-xs text-muted-foreground tabular-nums">
            {pendientes === 0 ? 'nada pendiente' : `${pendientes} pendiente${pendientes === 1 ? '' : 's'}`}
          </span>
        </header>

        {dayItems.length === 0 ? (
          <p className="px-3 py-12 text-center text-sm text-muted-foreground">
            Nada para este día.
          </p>
        ) : (
          <ul className="divide-y divide-border max-h-[calc(100vh-13rem)] overflow-y-auto">
            {dayItems.map(it => {
              const body = (
                <>
                  <span className={cn('w-1 self-stretch rounded-full shrink-0', KIND_DOT[it.kind])} aria-hidden />
                  <span className="w-[52px] shrink-0 text-sm font-medium tabular-nums text-muted-foreground">
                    {it.hora ?? '—'}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className={cn('block text-sm truncate', it.done && 'line-through text-muted-foreground')}>
                      {it.title}
                    </span>
                    <span className="mt-0.5 flex items-center gap-1.5 min-w-0">
                      <span className={cn(
                        'inline-flex shrink-0 items-center rounded px-1.5 py-px text-[10px] font-medium uppercase tracking-wide',
                        KIND_CHIP[it.kind],
                      )}>
                        {KIND_ONE[it.kind]}
                      </span>
                      {it.subtitle && (
                        <span className="text-xs text-muted-foreground truncate">{it.subtitle}</span>
                      )}
                    </span>
                  </span>
                </>
              )

              if (it.kind === 'tarea' && onToggleTarea) {
                return (
                  <li key={`${it.kind}-${it.id}`}>
                    <button
                      type="button"
                      onClick={() => onToggleTarea(it.id, !it.done)}
                      aria-pressed={!!it.done}
                      className={cn(
                        'group flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
                        it.urgent && !it.done && 'bg-destructive/[0.07]',
                      )}
                    >
                      {body}
                      <span
                        className={cn(
                          'grid size-5 shrink-0 place-items-center rounded border transition-colors',
                          it.done
                            ? 'border-success bg-success text-success-foreground'
                            : 'border-border group-hover:border-foreground/40',
                        )}
                        aria-hidden
                      >
                        {it.done && <CheckIcon className="size-3.5" />}
                      </span>
                    </button>
                  </li>
                )
              }

              return (
                <li key={`${it.kind}-${it.id}`}>
                  <Link
                    href={it.href ?? '/calendario'}
                    className="flex items-center gap-3 px-3 py-2.5 transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                  >
                    {body}
                  </Link>
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </div>
  )
}
