'use client'
import { Fragment, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ChevronLeftIcon, ChevronRightIcon } from 'lucide-react'
import { DIAS_CORTOS, MESES_ES, fmtFechaLarga, localDayKey } from '@/lib/date'

// Generic month grid extracted from the tareas calendar. The caller supplies how to
// bucket an item by day and how to render it (chip in the cell, row in the detail
// panel), so the same grid serves tareas today and anything date-bucketed later.

type MonthGridProps<T> = {
  items: T[]
  /** Day bucket "YYYY-MM-DD" for an item, or null → goes to the "sin fecha" list. */
  dayKeyOf: (item: T) => string | null
  itemKey: (item: T) => React.Key
  renderChip: (item: T) => React.ReactNode
  renderDetail: (item: T) => React.ReactNode
  sortDay?: (a: T, b: T) => number
  maxPerDay?: number
  /** Singular noun for the "— N tareas" header + "Sin tareas para este día." line. */
  noun?: string
  sinFechaLabel?: string
}

const plural = (n: number, noun: string) => `${noun}${n === 1 ? '' : 's'}`

export function MonthGrid<T>({
  items, dayKeyOf, itemKey, renderChip, renderDetail,
  sortDay, maxPerDay = 3, noun = 'evento', sinFechaLabel = 'Sin fecha',
}: MonthGridProps<T>) {
  const now = new Date()
  const [year, setYear]   = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth())
  const [selected, setSelected] = useState<string | null>(null)
  const [expandedDays, setExpandedDays] = useState<Set<string>>(new Set())

  const byDay: Record<string, T[]> = {}
  const sinFecha: T[] = []
  for (const it of items) {
    const key = dayKeyOf(it)
    if (!key) { sinFecha.push(it); continue }
    ;(byDay[key] ||= []).push(it)
  }
  if (sortDay) for (const k of Object.keys(byDay)) byDay[k].sort(sortDay)

  const firstDay    = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const todayK      = localDayKey(now)

  const dayKey = (d: number) => `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
  function prevMonth() {
    if (month === 0) { setYear(y => y - 1); setMonth(11) } else setMonth(m => m - 1)
    setSelected(null); setExpandedDays(new Set())
  }
  function nextMonth() {
    if (month === 11) { setYear(y => y + 1); setMonth(0) } else setMonth(m => m + 1)
    setSelected(null); setExpandedDays(new Set())
  }
  function toggleExpand(key: string, e: React.MouseEvent) {
    e.stopPropagation()
    setExpandedDays(prev => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })
  }

  const cells: (number | null)[] = [
    ...Array(firstDay).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ]
  while (cells.length % 7 !== 0) cells.push(null)

  const selItems = selected ? (byDay[selected] ?? []) : []

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Button size="icon-sm" variant="ghost" aria-label="Mes anterior" onClick={prevMonth}><ChevronLeftIcon className="size-4" /></Button>
        <span className="text-sm font-medium w-44 text-center">{MESES_ES[month]} {year}</span>
        <Button size="icon-sm" variant="ghost" aria-label="Mes siguiente" onClick={nextMonth}><ChevronRightIcon className="size-4" /></Button>
        <Button
          size="xs"
          variant="outline"
          onClick={() => { setYear(now.getFullYear()); setMonth(now.getMonth()); setSelected(todayK) }}
          className="ml-2"
        >Hoy</Button>
      </div>

      <Card size="sm">
        <CardContent className="p-0">
          <div className="grid grid-cols-7 bg-muted/40 border-b">
            {DIAS_CORTOS.map(d => <div key={d} className="py-2 text-center text-xs text-muted-foreground font-medium">{d}</div>)}
          </div>
          <div className="divide-y divide-border">
            {Array.from({ length: cells.length / 7 }, (_, row) => (
              <div key={row} className="grid grid-cols-7 divide-x divide-border">
                {cells.slice(row * 7, row * 7 + 7).map((day, col) => {
                  if (day === null) return <div key={`empty-${row}-${col}`} className="min-h-28 bg-muted/20 p-1" />
                  const key      = dayKey(day)
                  const dayItems = byDay[key] ?? []
                  const isToday  = key === todayK
                  const isSel    = key === selected
                  const isExp    = expandedDays.has(key)
                  const shown    = isExp ? dayItems : dayItems.slice(0, maxPerDay)
                  const hidden   = dayItems.length - maxPerDay
                  return (
                    <div
                      key={key}
                      role="button"
                      tabIndex={0}
                      aria-pressed={isSel}
                      {...(isToday ? { 'aria-current': 'date' as const } : {})}
                      aria-label={`${day}${isToday ? ' (hoy)' : ''}: ${dayItems.length} ${plural(dayItems.length, noun)}`}
                      onClick={() => setSelected(isSel ? null : key)}
                      onKeyDown={e => {
                        if (e.key !== 'Enter' && e.key !== ' ') return
                        e.preventDefault()
                        setSelected(isSel ? null : key)
                      }}
                      className={`min-h-28 p-1.5 cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring ${
                        isSel ? 'bg-accent ring-1 ring-inset ring-ring' : isToday ? 'bg-blue-50/70 dark:bg-blue-950/40' : 'hover:bg-muted/40'
                      }`}
                    >
                      <div className="mb-1">
                        <span className={`text-xs font-semibold w-5 h-5 flex items-center justify-center rounded-full ${
                          isToday ? 'bg-blue-600 text-white' : isSel ? 'text-foreground' : 'text-muted-foreground'
                        }`}>{day}</span>
                        {/* Today is otherwise a blue circle and nothing else. */}
                        {isToday && <span className="sr-only">hoy</span>}
                      </div>
                      <div className="space-y-0.5">
                        {shown.map(it => <Fragment key={itemKey(it)}>{renderChip(it)}</Fragment>)}
                        {hidden > 0 && (
                          <button type="button" onClick={e => toggleExpand(key, e)} className="text-xs text-muted-foreground hover:text-foreground px-1 py-0.5 rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                            {isExp ? 'ver menos' : `+${hidden} más`}
                          </button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {selected && (
        <Card size="sm">
          <CardHeader className="border-b py-2.5">
            <CardTitle className="text-sm">
              {fmtFechaLarga(selected)}
              {selItems.length > 0 && <span className="text-muted-foreground font-normal ml-2">— {selItems.length} {plural(selItems.length, noun)}</span>}
            </CardTitle>
          </CardHeader>
          <CardContent className="divide-y divide-border p-0">
            {selItems.length === 0
              ? <p className="px-3 py-2.5 text-sm text-muted-foreground">Sin {plural(2, noun)} para este día.</p>
              : selItems.map(it => <Fragment key={itemKey(it)}>{renderDetail(it)}</Fragment>)}
          </CardContent>
        </Card>
      )}

      {sinFecha.length > 0 && (
        <Card size="sm">
          <CardHeader className="border-b py-2.5">
            <CardTitle className="text-sm">{sinFechaLabel} ({sinFecha.length})</CardTitle>
          </CardHeader>
          <CardContent className="divide-y divide-border p-0">
            {sinFecha.map(it => <Fragment key={itemKey(it)}>{renderDetail(it)}</Fragment>)}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
