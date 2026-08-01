'use client'
import { useEffect, useMemo, useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ChevronLeftIcon, ChevronRightIcon, TriangleAlertIcon } from 'lucide-react'
import { DIAS_SEMANA, MESES_ES, localDayKey } from '@/lib/date'
import { BLOCK_HOURS, blockConflicts, eventConflicts } from '@/lib/agenda'
import { cn } from '@/lib/utils'
import { packLanes, laneStyle, type Lane } from './lanes'
import type { CalendarEvent, CalendarBlock } from './types'

// Week time-grid: hours down the Y axis, Mon–Sun across. Visitas render as point
// pills at their time; turnos as shaded blocks spanning their hours. Owns its
// own week navigation (like MonthGrid owns the month) and filters the data to the view.
//
// Two rules this grid has to keep, because it is the only surface where a human can
// catch a double-booking that neither validator rejected:
//   1. N items stacked in time must be N items visible on screen — never one painted
//      over another. Overlapping items share a cluster and split the column width.
//   2. Nothing is dropped silently. Items outside the visible hour window are counted
//      and offered, not discarded.

const HOUR_PX = 44
// Past two lanes a day column is ~30px wide and the text is gone, which defeats the
// point of splitting at all. Beyond this, the extras collapse into a "+N" the user can
// open per day — the goal is "you can tell there are N", not "N unreadable slivers".
const MAX_LANES = 2
// Two lines: who is coming, then which car. A visita carries no duration in the data,
// so this height is a rendering choice, not a claim — but it is also the collision
// extent, which is right: two visitas half an hour apart do overlap on screen and
// both need to stay readable.
const EVENT_PX = 36

function mondayOf(d: Date): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  const dow = (x.getDay() + 6) % 7 // Mon=0 … Sun=6
  x.setDate(x.getDate() - dow)
  return x
}
function addDays(d: Date, n: number): Date {
  const x = new Date(d)
  x.setDate(x.getDate() + n)
  return x
}
const hhmm = (d: Date) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
const mesCorto = (m: number) => MESES_ES[m].slice(0, 3).toLowerCase()
const plural = (n: number, noun: string) => `${n} ${noun}${n === 1 ? '' : 's'}`

type Props = {
  events: CalendarEvent[]
  blocks: CalendarBlock[]
  dayStartHour?: number
  dayEndHour?: number
  /** `YYYY-MM-DD` to open on, from `/agenda?d=`. Applied after mount. */
  initialDay?: string | null
  onEventClick?: (e: CalendarEvent) => void
  onBlockClick?: (b: CalendarBlock) => void
}

export function WeekTimeGrid({
  events, blocks, dayStartHour = 7, dayEndHour = 21, initialDay, onEventClick, onBlockClick,
}: Props) {
  const [weekStart, setWeekStart] = useState(() => mondayOf(new Date()))

  // Arriving from a MiniWeek day. Applied in an effect rather than in the initial state
  // so the server render and the first client render agree.
  useEffect(() => {
    if (!initialDay) return
    const [y, m, d] = initialDay.split('-').map(Number)
    setWeekStart(mondayOf(new Date(y, m - 1, d)))
  }, [initialDay])

  const [showFullDay, setShowFullDay] = useState(false)
  const [openDays, setOpenDays] = useState<Set<string>>(new Set())
  const toggleDay = (dk: string) => setOpenDays(prev => {
    const next = new Set(prev)
    next.has(dk) ? next.delete(dk) : next.add(dk)
    return next
  })
  const todayKey = localDayKey(new Date())

  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart])
  const weekKeys = useMemo(() => new Set(days.map(localDayKey)), [days])

  const weekEvents = useMemo(() => events.filter(e => weekKeys.has(localDayKey(e.start))), [events, weekKeys])
  const weekBlocks = useMemo(() => blocks.filter(b => weekKeys.has(localDayKey(b.start))), [blocks, weekKeys])

  // Conflicts are computed for the visible week only — this is a display-layer read,
  // not the write rule mirrored in the Python backend.
  const evConflicts = useMemo(() => eventConflicts(weekEvents, weekBlocks), [weekEvents, weekBlocks])
  const blConflicts = useMemo(() => blockConflicts(weekBlocks), [weekBlocks])
  const conflictCount = evConflicts.size + blConflicts.size

  // Widen the window on demand rather than hiding what falls outside it.
  const needed = useMemo(() => {
    let lo = dayStartHour
    let hi = dayEndHour
    for (const e of weekEvents) lo = Math.min(lo, e.start.getHours())
    for (const b of weekBlocks) {
      lo = Math.min(lo, b.start.getHours())
      hi = Math.max(hi, b.end.getHours() + (b.end.getMinutes() > 0 ? 1 : 0))
    }
    for (const e of weekEvents) hi = Math.max(hi, e.start.getHours() + 1)
    return { lo: Math.max(0, lo), hi: Math.min(24, hi) }
  }, [weekEvents, weekBlocks, dayStartHour, dayEndHour])

  const startHour = showFullDay ? needed.lo : dayStartHour
  const endHour = showFullDay ? needed.hi : dayEndHour
  const hasHidden = needed.lo < dayStartHour || needed.hi > dayEndHour

  const hours = Array.from({ length: endHour - startHour }, (_, i) => startHour + i)
  const laneHeight = (endHour - startHour) * HOUR_PX
  const topFor = (d: Date) => (((d.getHours() * 60 + d.getMinutes()) - startHour * 60) / 60) * HOUR_PX

  const weekLabel = `${days[0].getDate()} ${mesCorto(days[0].getMonth())} – ${days[6].getDate()} ${mesCorto(days[6].getMonth())}`

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <Button size="icon-sm" variant="ghost" aria-label="Semana anterior" onClick={() => setWeekStart(w => addDays(w, -7))}><ChevronLeftIcon className="size-4" /></Button>
        <span className="text-sm font-medium w-40 text-center">{weekLabel}</span>
        <Button size="icon-sm" variant="ghost" aria-label="Semana siguiente" onClick={() => setWeekStart(w => addDays(w, 7))}><ChevronRightIcon className="size-4" /></Button>
        <Button size="xs" variant="outline" onClick={() => setWeekStart(mondayOf(new Date()))} className="ml-2">Hoy</Button>

        {/* Describes the week actually on screen. The header used to carry an all-time
            count here, which never matched what you were looking at. */}
        <span className="text-xs text-muted-foreground">
          {plural(weekEvents.length, 'visita')} · {plural(weekBlocks.length, 'turno')}
        </span>

        {conflictCount > 0 && (
          <span className="ml-auto inline-flex items-center gap-1.5 rounded-md bg-destructive/10 px-2 py-1 text-xs font-medium text-destructive">
            <TriangleAlertIcon className="size-3.5" aria-hidden />
            {conflictCount === 1 ? '1 conflicto esta semana' : `${conflictCount} conflictos esta semana`}
          </span>
        )}
      </div>

      <Card size="sm" className="relative">
        {/* A calendar should still show its grid when the week is empty — but it should
            say so, rather than presenting 616px of ruling as if it were a full week. */}
        {weekEvents.length === 0 && weekBlocks.length === 0 && (
          <div className="pointer-events-none absolute inset-0 z-10 grid place-items-center">
            <p className="rounded-md border bg-background px-3 py-1.5 text-sm text-muted-foreground">
              Sin visitas ni turnos esta semana
            </p>
          </div>
        )}
        <CardContent className="p-0 overflow-x-auto">
          <div className="min-w-[640px]" role="grid" aria-label={`Semana del ${weekLabel}`}>
            <div className="grid border-b bg-muted/40" role="row" style={{ gridTemplateColumns: '44px repeat(7, 1fr)' }}>
              <div role="columnheader" aria-label="Hora" />
              {days.map((d, i) => {
                const isToday = localDayKey(d) === todayKey
                return (
                  <div
                    key={i}
                    role="columnheader"
                    {...(isToday ? { 'aria-current': 'date' as const } : {})}
                    className={`py-2 text-center text-xs ${isToday ? 'text-blue-700 dark:text-blue-400 font-semibold' : 'text-muted-foreground font-medium'}`}
                  >
                    {DIAS_SEMANA[i]} {d.getDate()}
                    {/* "Today" is otherwise carried by colour alone. */}
                    {isToday && <span className="sr-only"> (hoy)</span>}
                  </div>
                )
              })}
            </div>

            <div className="grid" role="row" style={{ gridTemplateColumns: '44px repeat(7, 1fr)' }}>
              <div>
                {hours.map(h => (
                  <div key={h} className="text-[10px] text-muted-foreground text-right pr-1.5 tabular-nums" style={{ height: HOUR_PX }}>
                    {String(h).padStart(2, '0')}
                  </div>
                ))}
              </div>

              {days.map((day, di) => {
                const dk = localDayKey(day)
                const isToday = dk === todayKey
                const dayEvents = weekEvents.filter(e => localDayKey(e.start) === dk)
                const dayBlocks = weekBlocks.filter(b => localDayKey(b.start) === dk)

                // Partition by the visible window instead of dropping or clamping-and-lying.
                const visibleBlocks = dayBlocks.filter(b => topFor(b.end) > 0 && topFor(b.start) < laneHeight)
                const visibleEvents = dayEvents.filter(e => topFor(e.start) >= 0 && topFor(e.start) < laneHeight)
                const hiddenCount = (dayBlocks.length - visibleBlocks.length) + (dayEvents.length - visibleEvents.length)

                const allBlocks = packLanes(visibleBlocks, b => ({
                  top: Math.max(0, topFor(b.start)),
                  bottom: Math.min(laneHeight, topFor(b.end)),
                }))
                // Events pack against each other in pixel space, since their height is fixed
                // and two visitas 20 minutes apart collide visually even though neither has an end.
                const allEvents = packLanes(visibleEvents, e => {
                  const top = Math.min(Math.max(0, topFor(e.start)), laneHeight - EVENT_PX)
                  return { top, bottom: top + EVENT_PX }
                })

                // Cap the split unless this day was opened. Everything past MAX_LANES is
                // counted, not dropped — the count is the whole point.
                const opened = openDays.has(dk)
                const cap = <T,>(rows: Lane<T>[]) => opened
                  ? rows
                  : rows.filter(r => r.lane < MAX_LANES)
                    .map(r => ({ ...r, lanes: Math.min(r.lanes, MAX_LANES) }))
                const packedBlocks = cap(allBlocks)
                const packedEvents = cap(allEvents)
                const overflow = (allBlocks.length - packedBlocks.length) + (allEvents.length - packedEvents.length)

                return (
                  <div
                    key={di}
                    role="gridcell"
                    aria-label={`${DIAS_SEMANA[di]} ${day.getDate()}`}
                    className={`relative border-l ${isToday ? 'bg-blue-50/40 dark:bg-blue-950/30' : ''}`}
                    style={{ height: laneHeight }}
                  >
                    {/* Full-strength rules, weighted every third hour. At border/70 these
                        measured ~1.2:1 against the card and effectively vanished, leaving
                        pills floating with no readable time axis. */}
                    {hours.map(h => (
                      <div
                        key={h}
                        className={h % 3 === 0 ? 'border-b border-border' : 'border-b border-border/60'}
                        style={{ height: HOUR_PX }}
                      />
                    ))}

                    {packedBlocks.map(({ item: b, lane, lanes }) => {
                      const top = Math.max(0, topFor(b.start))
                      const height = Math.min(laneHeight, topFor(b.end)) - top
                      const choca = blConflicts.get(b.id)
                      const clickable = !!onBlockClick && !!b.href
                      const Tag = clickable ? 'button' : 'div'
                      const desc = `${b.title}, ${hhmm(b.start)} a ${hhmm(b.end)}${b.subtitle ? `, ${b.subtitle}` : ''}${choca ? `. Se superpone con ${choca.map(c => c.title).join(', ')}` : ''}`
                      return (
                        <Tag
                          key={`b${b.id}`}
                          {...(clickable ? { type: 'button' as const, onClick: () => onBlockClick?.(b), 'aria-label': `Turno: ${desc}` } : {})}
                          title={`Turno · ${desc}`}
                          className={cn(
                            'absolute overflow-hidden text-left bg-amber-50 dark:bg-amber-950/40 border-l-[3px] border-amber-600',
                            clickable && 'cursor-pointer hover:bg-amber-100 dark:hover:bg-amber-900/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:z-20',
                            choca && 'ring-1 ring-inset ring-destructive',
                          )}
                          style={{ top, height, ...laneStyle(lane, lanes) }}
                        >
                          {choca && <span className="absolute inset-0 bg-destructive/10 pointer-events-none" aria-hidden />}
                          <div className="relative px-1 pt-0.5 leading-tight text-amber-900 dark:text-amber-200">
                            <div className="truncate text-xs">
                              <span className="font-medium tabular-nums">{hhmm(b.start)}</span> {b.title}
                            </div>
                            {choca
                              ? <div className="flex items-center gap-0.5 text-[11px] font-medium text-destructive">
                                  <TriangleAlertIcon className="size-2.5 shrink-0" aria-hidden />
                                  <span className="truncate">Choca con {choca[0].title}</span>
                                </div>
                              : <div className="truncate text-[11px] text-amber-800 dark:text-amber-300">
                                  {b.subtitle || 'Bloquea la agenda'}
                                </div>}
                          </div>
                        </Tag>
                      )
                    })}

                    {packedEvents.map(({ item: e, lane, lanes }) => {
                      const top = Math.min(Math.max(0, topFor(e.start)), laneHeight - EVENT_PX)
                      const choca = evConflicts.get(e.id)
                      const clickable = !!onEventClick && !!e.href
                      const Tag = clickable ? 'button' : 'div'
                      const desc = `${hhmm(e.start)} ${e.title}${e.subtitle ? ` — ${e.subtitle}` : ''}${choca ? `. Choca con ${choca.map(c => c.title).join(', ')}` : ''}`
                      return (
                        <Tag
                          key={`e${e.id}`}
                          {...(clickable ? { type: 'button' as const, onClick: () => onEventClick?.(e), 'aria-label': `Visita: ${desc}` } : {})}
                          title={desc}
                          className={cn(
                            'absolute overflow-hidden text-left z-10 bg-blue-50 dark:bg-blue-950/40 border-l-2 border-blue-600',
                            clickable && 'cursor-pointer hover:bg-blue-100 dark:hover:bg-blue-900/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:z-20',
                            choca && 'ring-1 ring-inset ring-destructive',
                          )}
                          style={{ top, height: EVENT_PX, ...laneStyle(lane, lanes) }}
                        >
                          {/* Person first: the car is recoverable from context, the person is not.
                              Nobody here thinks "Amarok at 3" — they think "Nico is coming at 3". */}
                          <div className="px-1 pt-0.5 leading-tight text-blue-900 dark:text-blue-200">
                            <div className="flex items-center gap-0.5 text-xs">
                              {choca && <TriangleAlertIcon className="size-2.5 shrink-0 text-destructive" aria-hidden />}
                              <span className="font-medium tabular-nums shrink-0">{hhmm(e.start)}</span>
                              <span className="truncate">{e.subtitle || e.title}</span>
                            </div>
                            <div className="truncate text-[11px] text-blue-800 dark:text-blue-300">
                              {e.subtitle ? e.title : 'Sin interesado'}
                            </div>
                          </div>
                        </Tag>
                      )
                    })}

                    {(overflow > 0 || opened || hiddenCount > 0) && (
                      <div className="absolute inset-x-px bottom-px z-20 flex flex-col gap-px">
                        {(overflow > 0 || opened) && (
                          <button
                            type="button"
                            onClick={() => toggleDay(dk)}
                            aria-expanded={opened}
                            className="rounded-sm bg-muted px-1 py-0.5 text-[10px] font-medium text-foreground/90 hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          >
                            {opened ? 'Ver menos' : `+${overflow} superpuesta${overflow === 1 ? '' : 's'}`}
                          </button>
                        )}
                        {hiddenCount > 0 && (
                          <button
                            type="button"
                            onClick={() => setShowFullDay(true)}
                            className="rounded-sm bg-muted px-1 py-0.5 text-[10px] font-medium text-foreground/90 hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          >
                            +{hiddenCount} fuera de hora
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex gap-4 text-xs text-muted-foreground flex-wrap items-center">
        <span className="inline-flex items-center gap-1.5"><span className="inline-block w-2.5 h-2.5 rounded-full bg-blue-600" /> Visita</span>
        <span className="inline-flex items-center gap-1.5"><span className="inline-block w-3.5 h-2 rounded-sm bg-amber-500" /> Turno (bloquea {BLOCK_HOURS} h salvo que indique otra duración)</span>
        <span className="inline-flex items-center gap-1.5 text-destructive"><TriangleAlertIcon className="size-3" aria-hidden /> Se superponen</span>
        {(hasHidden || showFullDay) && (
          <button
            type="button"
            onClick={() => setShowFullDay(v => !v)}
            className="ml-auto underline underline-offset-2 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
          >
            {showFullDay
              ? `Ver ${String(dayStartHour).padStart(2, '0')}–${String(dayEndHour).padStart(2, '0')}`
              : 'Ver día completo'}
          </button>
        )}
      </div>
    </div>
  )
}
