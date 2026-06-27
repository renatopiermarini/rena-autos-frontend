'use client'
import { useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ChevronLeftIcon, ChevronRightIcon } from 'lucide-react'
import { DIAS_SEMANA, MESES_ES, localDayKey } from '@/lib/date'
import { BLOCK_HOURS } from '@/lib/agenda'
import type { CalendarEvent, CalendarBlock } from './types'

// Week time-grid: hours down the Y axis, Mon–Sun across. Visitas render as point
// pills at their time; transferencias as shaded blocks spanning their hours. Owns its
// own week navigation (like MonthGrid owns the month) and filters the data to the view.

const HOUR_PX = 44

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
  const todayKey = localDayKey(new Date())

  const days  = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))
  const hours = Array.from({ length: dayEndHour - dayStartHour }, (_, i) => dayStartHour + i)
  const laneHeight = (dayEndHour - dayStartHour) * HOUR_PX
  const topFor = (d: Date) => (((d.getHours() * 60 + d.getMinutes()) - dayStartHour * 60) / 60) * HOUR_PX

  const weekLabel = `${days[0].getDate()} ${mesCorto(days[0].getMonth())} – ${days[6].getDate()} ${mesCorto(days[6].getMonth())}`

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Button size="icon-sm" variant="ghost" onClick={() => setWeekStart(w => addDays(w, -7))}><ChevronLeftIcon className="size-4" /></Button>
        <span className="text-sm font-medium w-40 text-center">{weekLabel}</span>
        <Button size="icon-sm" variant="ghost" onClick={() => setWeekStart(w => addDays(w, 7))}><ChevronRightIcon className="size-4" /></Button>
        <Button size="xs" variant="outline" onClick={() => setWeekStart(mondayOf(new Date()))} className="ml-2">Hoy</Button>
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
                const dayEvents = events.filter(e => localDayKey(e.start) === dk)
                const dayBlocks = blocks.filter(b => localDayKey(b.start) === dk)
                return (
                  <div key={di} className={`relative border-l ${isToday ? 'bg-blue-50/40 dark:bg-blue-950/30' : ''}`} style={{ height: laneHeight }}>
                    {hours.map(h => <div key={h} className="border-b border-border/70" style={{ height: HOUR_PX }} />)}

                    {dayBlocks.map(b => {
                      const top    = Math.max(0, topFor(b.start))
                      const bottom = Math.min(laneHeight, topFor(b.end))
                      const height = bottom - top
                      if (height <= 2) return null // block sits entirely outside the visible window
                      return (
                        <div
                          key={`b${b.id}`}
                          onClick={() => onBlockClick?.(b)}
                          title={`Turno · ${b.title} (${hhmm(b.start)}–${hhmm(b.end)})`}
                          className="absolute left-px right-px overflow-hidden bg-amber-50 dark:bg-amber-950/40 border-l-[3px] border-amber-600"
                          style={{ top, height }}
                        >
                          <div className="px-1 pt-0.5 text-[10px] leading-tight text-amber-900 dark:text-amber-200">
                            <span className="font-medium tabular-nums">{hhmm(b.start)}</span> {b.title}
                            <div className="text-amber-800 dark:text-amber-300">Turno · bloqueado</div>
                          </div>
                        </div>
                      )
                    })}

                    {dayEvents.map(e => {
                      // Clamp out-of-window events to the nearest edge rather than hide them.
                      const top = Math.min(Math.max(0, topFor(e.start)), laneHeight - 20)
                      return (
                        <div
                          key={`e${e.id}`}
                          onClick={() => onEventClick?.(e)}
                          title={`${hhmm(e.start)} ${e.title}${e.subtitle ? ' — ' + e.subtitle : ''}`}
                          className="absolute left-0.5 right-0.5 overflow-hidden bg-blue-50 dark:bg-blue-950/40 border-l-2 border-blue-600 cursor-pointer hover:bg-blue-100 dark:hover:bg-blue-900/50"
                          style={{ top, height: 20 }}
                        >
                          <div className="px-1 text-[10px] leading-tight truncate text-blue-900 dark:text-blue-200">
                            <span className="font-medium tabular-nums">{hhmm(e.start)}</span> {e.title}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )
              })}
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex gap-4 text-xs text-muted-foreground flex-wrap">
        <span className="inline-flex items-center gap-1.5"><span className="inline-block w-2.5 h-2.5 rounded-full bg-blue-600" /> Visita</span>
        <span className="inline-flex items-center gap-1.5"><span className="inline-block w-3.5 h-2 rounded-sm bg-amber-500" /> Turno transferencia (bloque {BLOCK_HOURS} h)</span>
      </div>
    </div>
  )
}
