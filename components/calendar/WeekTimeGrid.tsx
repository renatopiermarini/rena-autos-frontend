'use client'
import { useMemo, useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ChevronLeftIcon, ChevronRightIcon, TriangleAlertIcon } from 'lucide-react'
import { DIAS_SEMANA, MESES_ES, localDayKey } from '@/lib/date'
import { BLOCK_HOURS, blockConflicts, eventConflicts } from '@/lib/agenda'
import { cn } from '@/lib/utils'
import { packLanes, laneStyle } from './lanes'
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
const EVENT_PX = 20

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

type Props = {
  events: CalendarEvent[]
  blocks: CalendarBlock[]
  dayStartHour?: number
  dayEndHour?: number
  onEventClick?: (e: CalendarEvent) => void
  onBlockClick?: (b: CalendarBlock) => void
}

export function WeekTimeGrid({
  events, blocks, dayStartHour = 7, dayEndHour = 21, onEventClick, onBlockClick,
}: Props) {
  const [weekStart, setWeekStart] = useState(() => mondayOf(new Date()))
  const [showFullDay, setShowFullDay] = useState(false)
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

        {conflictCount > 0 && (
          <span className="ml-auto inline-flex items-center gap-1.5 rounded-md bg-destructive/10 px-2 py-1 text-xs font-medium text-destructive">
            <TriangleAlertIcon className="size-3.5" aria-hidden />
            {conflictCount === 1 ? '1 conflicto esta semana' : `${conflictCount} conflictos esta semana`}
          </span>
        )}
      </div>

      <Card size="sm">
        <CardContent className="p-0 overflow-x-auto">
          <div className="min-w-[640px]">
            <div className="grid border-b bg-muted/40" style={{ gridTemplateColumns: '44px repeat(7, 1fr)' }}>
              <div />
              {days.map((d, i) => {
                const isToday = localDayKey(d) === todayKey
                return (
                  <div key={i} className={`py-2 text-center text-xs ${isToday ? 'text-blue-700 dark:text-blue-400 font-semibold' : 'text-muted-foreground font-medium'}`}>
                    {DIAS_SEMANA[i]} {d.getDate()}
                    {isToday && <span className="sr-only"> (hoy)</span>}
                  </div>
                )
              })}
            </div>

            <div className="grid" style={{ gridTemplateColumns: '44px repeat(7, 1fr)' }}>
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

                const packedBlocks = packLanes(visibleBlocks, b => ({
                  top: Math.max(0, topFor(b.start)),
                  bottom: Math.min(laneHeight, topFor(b.end)),
                }))
                // Events pack against each other in pixel space, since their height is fixed
                // and two visitas 20 minutes apart collide visually even though neither has an end.
                const packedEvents = packLanes(visibleEvents, e => {
                  const top = Math.min(Math.max(0, topFor(e.start)), laneHeight - EVENT_PX)
                  return { top, bottom: top + EVENT_PX }
                })

                return (
                  <div key={di} className={`relative border-l ${isToday ? 'bg-blue-50/40 dark:bg-blue-950/30' : ''}`} style={{ height: laneHeight }}>
                    {hours.map(h => <div key={h} className="border-b border-border/70" style={{ height: HOUR_PX }} />)}

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
                          <div className="relative px-1 pt-0.5 text-[10px] leading-tight text-amber-900 dark:text-amber-200">
                            <span className="font-medium tabular-nums">{hhmm(b.start)}</span> {b.title}
                            {choca
                              ? <div className="flex items-center gap-0.5 font-medium text-destructive">
                                  <TriangleAlertIcon className="size-2.5 shrink-0" aria-hidden />
                                  <span className="truncate">Choca con {choca[0].title}</span>
                                </div>
                              : <div className="text-amber-800 dark:text-amber-300">Bloquea la agenda</div>}
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
                          <div className="flex items-center gap-0.5 px-1 text-[10px] leading-tight truncate text-blue-900 dark:text-blue-200">
                            {choca && <TriangleAlertIcon className="size-2.5 shrink-0 text-destructive" aria-hidden />}
                            <span className="font-medium tabular-nums">{hhmm(e.start)}</span>
                            <span className="truncate">{e.title}</span>
                          </div>
                        </Tag>
                      )
                    })}

                    {hiddenCount > 0 && (
                      <button
                        type="button"
                        onClick={() => setShowFullDay(true)}
                        className="absolute inset-x-px bottom-px z-20 rounded-sm bg-muted px-1 py-0.5 text-[10px] font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        +{hiddenCount} fuera de hora
                      </button>
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
