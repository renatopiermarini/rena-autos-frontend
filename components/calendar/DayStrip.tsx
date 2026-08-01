'use client'
import { useMemo, useState } from 'react'
import Link from 'next/link'
import { ChevronLeftIcon, ChevronRightIcon, CheckIcon } from 'lucide-react'
import { DIAS_SEMANA, localDayKey } from '@/lib/date'
import { cn } from '@/lib/utils'

// Horizontal week strip: seven days across, each day's work stacked under it.
// This is the tablero's main section — the question it answers is "what does the
// day look like", so a day is a column you read top to bottom, not a row in a list.
//
// Shares its filter vocabulary with the calendario so the two surfaces agree.

export type StripItem = {
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

const KIND_LABEL: Record<StripItem['kind'], string> = {
  visita: 'Visitas',
  turno: 'Turnos',
  tarea: 'Tareas',
}

const KIND_RULE: Record<StripItem['kind'], string> = {
  visita: 'bg-info',
  turno: 'bg-warning',
  tarea: 'bg-muted-foreground',
}

// A day with thirty follow-ups is a wall, not a glance. Show the top of the day and
// let the user open the rest — the count stays visible either way.
const MAX_PER_DAY = 6

function mondayOf(d: Date): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7))
  return x
}
function addDays(d: Date, n: number): Date {
  const x = new Date(d)
  x.setDate(x.getDate() + n)
  return x
}

export function DayStrip({
  items,
  onToggleTarea,
}: {
  items: StripItem[]
  onToggleTarea?: (id: string | number, done: boolean) => void
}) {
  const [weekStart, setWeekStart] = useState(() => mondayOf(new Date()))
  const [hidden, setHidden] = useState<Set<StripItem['kind']>>(new Set())
  const [openDays, setOpenDays] = useState<Set<string>>(new Set())
  const todayKey = localDayKey(new Date())

  const toggleOpen = (dk: string) => setOpenDays(prev => {
    const next = new Set(prev)
    next.has(dk) ? next.delete(dk) : next.add(dk)
    return next
  })

  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart])

  const toggleKind = (k: StripItem['kind']) => setHidden(prev => {
    const next = new Set(prev)
    next.has(k) ? next.delete(k) : next.add(k)
    return next
  })

  const shown = items.filter(i => !hidden.has(i.kind))
  const byDay = useMemo(() => {
    const m: Record<string, StripItem[]> = {}
    for (const i of shown) (m[i.dayKey] ||= []).push(i)
    for (const k of Object.keys(m)) {
      m[k].sort((a, b) => (a.hora ?? '99:99').localeCompare(b.hora ?? '99:99'))
    }
    return m
  }, [shown])

  const weekLabel = `${days[0].getDate()}/${days[0].getMonth() + 1} – ${days[6].getDate()}/${days[6].getMonth() + 1}`
  const total = shown.filter(i => days.some(d => localDayKey(d) === i.dayKey)).length

  return (
    <section className="rounded-lg border border-border bg-card">
      <header className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2">
        <div className="flex items-center gap-1">
          <button
            type="button"
            aria-label="Semana anterior"
            onClick={() => setWeekStart(w => addDays(w, -7))}
            className="grid size-7 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <ChevronLeftIcon className="size-4" />
          </button>
          <span className="w-28 text-center text-sm font-medium tabular-nums">{weekLabel}</span>
          <button
            type="button"
            aria-label="Semana siguiente"
            onClick={() => setWeekStart(w => addDays(w, 7))}
            className="grid size-7 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <ChevronRightIcon className="size-4" />
          </button>
          <button
            type="button"
            onClick={() => setWeekStart(mondayOf(new Date()))}
            className="ml-1 rounded-md px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Hoy
          </button>
        </div>

        {/* Same filter vocabulary as the calendario. Dims rather than unmounts. */}
        <div className="ml-auto flex items-center gap-1">
          {(['visita', 'turno', 'tarea'] as const).map(k => {
            const off = hidden.has(k)
            return (
              <button
                key={k}
                type="button"
                aria-pressed={!off}
                onClick={() => toggleKind(k)}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  off ? 'text-muted-foreground/60 hover:text-muted-foreground' : 'bg-muted text-foreground',
                )}
              >
                <span className={cn('size-1.5 rounded-full', KIND_RULE[k], off && 'opacity-30')} aria-hidden />
                {KIND_LABEL[k]}
              </button>
            )
          })}
        </div>
      </header>

      <div className="grid grid-cols-7 divide-x divide-border overflow-x-auto">
        {days.map((d, i) => {
          const dk = localDayKey(d)
          const isToday = dk === todayKey
          const all = byDay[dk] ?? []
          const open = openDays.has(dk)
          const list = open ? all : all.slice(0, MAX_PER_DAY)
          const rest = all.length - list.length
          const pend = all.filter(x => !x.done).length
          return (
            <div key={dk} className={cn('min-w-[132px] min-h-[168px]', isToday && 'bg-info/5')}>
              <div
                className={cn(
                  'flex items-baseline gap-1 px-2 py-1.5 border-b border-border',
                  isToday ? 'text-info font-semibold' : 'text-muted-foreground',
                )}
              >
                <span className="text-[11px] uppercase tracking-wide">{DIAS_SEMANA[i]}</span>
                <span className="text-sm tabular-nums">{d.getDate()}</span>
                {isToday && <span className="sr-only">(hoy)</span>}
                {pend > 0 && (
                  <span className="ml-auto text-[11px] tabular-nums opacity-70">{pend}</span>
                )}
              </div>

              <ul className="p-1 space-y-1">
                {list.map(it => {
                  const body = (
                    <>
                      <span className={cn('w-0.5 self-stretch rounded-full shrink-0', KIND_RULE[it.kind])} aria-hidden />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-baseline gap-1">
                          {it.hora && <span className="text-[11px] font-medium tabular-nums shrink-0">{it.hora}</span>}
                          <span className={cn('text-xs truncate', it.done && 'line-through text-muted-foreground')}>
                            {it.title}
                          </span>
                        </span>
                        {it.subtitle && (
                          <span className="block text-[11px] text-muted-foreground truncate">{it.subtitle}</span>
                        )}
                      </span>
                    </>
                  )

                  // Tareas are completable right here — that is the whole point of the
                  // tablero. Everything else deep-links to its record.
                  if (it.kind === 'tarea' && onToggleTarea) {
                    return (
                      <li key={`${it.kind}-${it.id}`}>
                        <button
                          type="button"
                          onClick={() => onToggleTarea(it.id, !it.done)}
                          aria-pressed={!!it.done}
                          className={cn(
                            'group flex w-full gap-1.5 rounded-md p-1 text-left transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                            it.urgent && !it.done && 'bg-destructive/10',
                          )}
                        >
                          {body}
                          <span
                            className={cn(
                              'mt-0.5 grid size-4 shrink-0 place-items-center rounded border transition-colors',
                              it.done
                                ? 'border-success bg-success text-success-foreground'
                                : 'border-border group-hover:border-foreground/40',
                            )}
                            aria-hidden
                          >
                            {it.done && <CheckIcon className="size-3" />}
                          </span>
                        </button>
                      </li>
                    )
                  }

                  return (
                    <li key={`${it.kind}-${it.id}`}>
                      <Link
                        href={it.href ?? '/calendario'}
                        className="flex gap-1.5 rounded-md p-1 transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        {body}
                      </Link>
                    </li>
                  )
                })}

                {(rest > 0 || open) && (
                  <li>
                    <button
                      type="button"
                      onClick={() => toggleOpen(dk)}
                      aria-expanded={open}
                      className="w-full rounded-md px-1 py-1 text-left text-[11px] font-medium text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      {open ? 'Ver menos' : `+${rest} más`}
                    </button>
                  </li>
                )}
              </ul>
            </div>
          )
        })}
      </div>

      {total === 0 && (
        <p className="border-t border-border px-3 py-3 text-center text-sm text-muted-foreground">
          Nada agendado esta semana.
        </p>
      )}
    </section>
  )
}
