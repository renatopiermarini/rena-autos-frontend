'use client'
import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { ArrowRightIcon } from 'lucide-react'
import { DIAS_SEMANA, localDayKey, instantDayKey } from '@/lib/date'
import { transferenciaBlocks, turnosBlocks } from '@/lib/agenda'

// Compact read-only strip of the current week for the home dashboard: a blue dot per
// visita and an amber bar for turnos, per day. Client component so "today"/"this week"
// resolve in the browser (AR), not on the UTC server. Links to the full /calendario.

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
const plural = (n: number, noun: string) => `${n} ${noun}${n === 1 ? '' : 's'}`

export function MiniWeek({
  visitas, transferencias, turnos = [],
}: { visitas: any[]; transferencias: any[]; turnos?: any[] }) {
  const weekStart = mondayOf(new Date())
  const todayKey = localDayKey(new Date())
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))

  const visByDay: Record<string, number> = {}
  for (const v of visitas) {
    if (!v.fecha || v.resultado === 'cancelada') continue
    const k = instantDayKey(v.fecha)
    if (k) visByDay[k] = (visByDay[k] ?? 0) + 1
  }
  // Must match the expression the agenda uses, or Inicio and Agenda report different
  // turno counts for the same week — this strip counted only transferencias and left
  // out every turno the bot wrote.
  const turByDay: Record<string, number> = {}
  for (const b of [...transferenciaBlocks(transferencias), ...turnosBlocks(turnos)]) {
    const k = localDayKey(b.start)
    turByDay[k] = (turByDay[k] ?? 0) + 1
  }

  return (
    <Card size="sm">
      <CardContent className="py-3">
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm font-medium">Esta semana</span>
          <Link href="/calendario" className="text-xs text-blue-600 dark:text-blue-400 hover:underline inline-flex items-center gap-1">
            Ver calendario <ArrowRightIcon className="size-3" />
          </Link>
        </div>
        <div className="grid grid-cols-7 gap-1 text-center">
          {days.map((d, i) => {
            const k = localDayKey(d)
            const isToday = k === todayKey
            const nv = visByDay[k] ?? 0
            const nt = turByDay[k] ?? 0
            return (
              // Carries the day, so the agenda can open where the user pointed instead of
              // seven identical links to the same week.
              <Link
                key={i}
                href={`/calendario?d=${k}`}
                aria-label={`${DIAS_SEMANA[i]} ${d.getDate()}${isToday ? ' (hoy)' : ''}: ${plural(nv, 'visita')}, ${plural(nt, 'turno')}`}
                aria-current={isToday ? 'date' : undefined}
                className={`rounded-md py-1.5 hover:bg-muted/60 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${isToday ? 'bg-blue-50 dark:bg-blue-950/40' : ''}`}
              >
                <div className="text-[10px] text-muted-foreground">{DIAS_SEMANA[i]}</div>
                <div className={`text-sm ${isToday ? 'font-semibold text-blue-700 dark:text-blue-400' : ''}`}>{d.getDate()}</div>
                <div className="flex items-center justify-center gap-0.5 h-2 mt-0.5" aria-hidden>
                  {nt > 0 && <span className="inline-block w-3 h-1.5 rounded-sm bg-amber-500" />}
                  {Array.from({ length: Math.min(nv, 3) }).map((_, j) => (
                    <span key={j} className="inline-block w-1.5 h-1.5 rounded-full bg-blue-600" />
                  ))}
                  {/* Three dots used to mean "3 or 9". */}
                  {nv > 3 && <span className="text-[9px] leading-none text-blue-700 dark:text-blue-400 font-medium">+{nv - 3}</span>}
                </div>
              </Link>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}
