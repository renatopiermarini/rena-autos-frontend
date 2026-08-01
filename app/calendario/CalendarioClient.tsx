'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useDeepLinkDay } from '@/lib/deep-link'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { CalendarView } from '@/app/tareas/TareasClient'
import { WeekTimeGrid } from '@/components/calendar/WeekTimeGrid'
import { transferenciaBlocks, turnosBlocks } from '@/lib/agenda'
import { parseInstant } from '@/lib/date'
import type { CalendarEvent } from '@/components/calendar/types'

function vehLabel(vehicles: any[], id: any): string {
  const v = vehicles.find(x => x.id === id)
  return v ? (`${v.marca ?? ''} ${v.modelo ?? ''}`.trim() || `Auto #${id}`) : `Auto #${id}`
}
function interLabel(interesados: any[], id: any): string {
  return interesados.find(x => x.id === id)?.nombre ?? ''
}
// `subtitle` is the person the visita is with, and only that. It used to fall back to
// `v.notas`, which put raw internal notes on screen wherever an interesado was missing
// or unrecognised.

export default function CalendarioClient({
  tareas, visitas, transferencias, turnos, vehicles, interesados,
}: {
  tareas: any[]; visitas: any[]; transferencias: any[]; turnos: any[]; vehicles: any[]; interesados: any[]
}) {
  const router = useRouter()
  const [tab, setTab] = useState<'tareas' | 'visitas'>('visitas')
  const deepDay = useDeepLinkDay()

  const events: CalendarEvent[] = []
  for (const v of visitas) {
    if (!v.fecha || v.resultado === 'cancelada') continue
    const start = parseInstant(v.fecha)
    if (!start) continue
    events.push({
      id: v.id,
      title: vehLabel(vehicles, v.vehicle_id),
      start,
      kind: 'visita',
      subtitle: interLabel(interesados, v.interesado_id) || undefined,
      href: `/visitas?id=${v.id}`,
      meta: v,
    })
  }

  const blocks = [...transferenciaBlocks(transferencias), ...turnosBlocks(turnos)]

  // Scoped to what is still ahead, matching the "próximas" definition on /visitas and
  // Inicio. It used to count every pendiente visita ever, including last year's, so the
  // number never reconciled with anything on screen and people learned to ignore it.
  const ahora = new Date()
  const pendVisitas = visitas.filter(v =>
    v.resultado === 'pendiente' && v.fecha && new Date(v.fecha) >= ahora).length
  const turnosProximos = blocks.filter(b => b.start >= ahora).length
  const plural = (n: number, noun: string) => `${n} ${noun}${n === 1 ? '' : 's'}`

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-baseline gap-3">
          <h1 className="text-xl font-semibold">Agenda</h1>
          {/* Totals still ahead, across all time. Per-week counts live on the grid,
              which is the only place that knows which week you are looking at. */}
          <span className="text-sm text-muted-foreground">
            {plural(pendVisitas, 'visita')} {pendVisitas === 1 ? 'próxima' : 'próximas'} · {plural(turnosProximos, 'turno')} {turnosProximos === 1 ? 'próximo' : 'próximos'}
          </span>
        </div>
        <Tabs value={tab} onValueChange={(v: any) => setTab(v)}>
          <TabsList>
            <TabsTrigger value="visitas">Visitas + Turnos</TabsTrigger>
            <TabsTrigger value="tareas">Tareas</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {tab === 'tareas'
        ? <CalendarView tareas={tareas} vehicles={vehicles} />
        : <WeekTimeGrid
            events={events}
            blocks={blocks}
            initialDay={deepDay}
            onEventClick={e => { if (e.href) router.push(e.href) }}
            onBlockClick={b => { if (b.href) router.push(b.href) }}
          />
      }
    </div>
  )
}
