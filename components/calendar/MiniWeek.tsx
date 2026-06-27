'use client'
import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { ArrowRightIcon } from 'lucide-react'
import { DIAS_SEMANA, localDayKey, instantDayKey } from '@/lib/date'
import { transferenciaBlocks } from '@/lib/agenda'

// Compact read-only strip of the current week for the home dashboard: a blue dot per
// visita and an amber bar for turnos, per day. Client component so "today"/"this week"
// resolve in the browser (AR), not on the UTC server. Links to the full /agenda.

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

export function MiniWeek({ visitas, transferencias }: { visitas: any[]; transferencias: any[] }) {
  const weekStart = mondayOf(new Date())
  const todayKey = localDayKey(new Date())
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))

  const visByDay: Record<string, number> = {}
  for (const v of visitas) {
    if (!v.fecha || v.resultado === 'cancelada') continue
    const k = instantDayKey(v.fecha)
    if (k) visByDay[k] = (visByDay[k] ?? 0) + 1
  }
  const turByDay: Record<string, number> = {}
  for (const b of transferenciaBlocks(transferencias)) {
    const k = localDayKey(b.start)
    turByDay[k] = (turByDay[k] ?? 0) + 1
  }

  return (
    <Card size="sm">
      <CardContent className="py-3">
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm font-medium">Esta semana</span>
          <Link href="/agenda" className="text-xs text-blue-600 dark:text-blue-400 hover:underline inline-flex items-center gap-1">
            Ver agenda <ArrowRightIcon className="size-3" />
          </Link>
        </div>
        <div className="grid grid-cols-7 gap-1 text-center">
          {days.map((d, i) => {
            const k = localDayKey(d)
            const isToday = k === todayKey
            const nv = visByDay[k] ?? 0
            const nt = turByDay[k] ?? 0
            return (
              <Link
                key={i}
                href="/agenda"
                className={`rounded-md py-1.5 hover:bg-muted/60 transition-colors ${isToday ? 'bg-blue-50 dark:bg-blue-950/40' : ''}`}
              >
                <div className="text-[10px] text-muted-foreground">{DIAS_SEMANA[i]}</div>
                <div className={`text-sm ${isToday ? 'font-semibold text-blue-700 dark:text-blue-400' : ''}`}>{d.getDate()}</div>
                <div className="flex items-center justify-center gap-0.5 h-2 mt-0.5">
                  {nt > 0 && <span className="inline-block w-3 h-1.5 rounded-sm bg-amber-500" title={`${nt} turno(s)`} />}
                  {Array.from({ length: Math.min(nv, 3) }).map((_, j) => (
                    <span key={j} className="inline-block w-1.5 h-1.5 rounded-full bg-blue-600" />
                  ))}
                </div>
              </Link>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}
