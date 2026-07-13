'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
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

export default function AgendaClient({
  tareas, visitas, transferencias, turnos, vehicles, interesados,
}: {
  tareas: any[]; visitas: any[]; transferencias: any[]; turnos: any[]; vehicles: any[]; interesados: any[]
}) {
  const router = useRouter()
  const [tab, setTab] = useState<'tareas' | 'visitas'>('visitas')

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
      subtitle: interLabel(interesados, v.interesado_id) || v.notas || undefined,
      meta: v,
    })
  }

  const blocks = [...transferenciaBlocks(transferencias), ...turnosBlocks(turnos)]

  const pendVisitas = visitas.filter(v => v.resultado === 'pendiente').length

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-baseline gap-3">
          <h1 className="text-xl font-semibold">Agenda</h1>
          <span className="text-sm text-muted-foreground">{pendVisitas} visitas pendientes · {blocks.length} turnos</span>
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
            onEventClick={() => router.push('/visitas')}
            onBlockClick={() => router.push('/transferencias')}
          />
      }
    </div>
  )
}
