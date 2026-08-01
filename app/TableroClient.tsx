'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { toast } from 'sonner'
import { CircleAlertIcon } from 'lucide-react'
import { patchRecordDetailed } from '@/lib/kapso'
import { MonthBoard, type BoardItem } from '@/components/calendar/MonthBoard'
import { localDayKey } from '@/lib/date'

// El tablero: qué pinta el día. Nada de plata, nada de stock — eso vive en Finanzas
// y en Stock. Acá sólo va lo que pasa y lo que hay que hacer.

export default function TableroClient({
  items, alertas, sinFecha,
}: {
  items: BoardItem[]
  alertas: string[]
  sinFecha: { id: number; titulo: string; asignado?: string; urgent: boolean }[]
}) {
  const router = useRouter()
  const [done, setDone] = useState<Record<string, boolean>>({})
  const [busy, setBusy] = useState<Record<string, boolean>>({})

  async function toggleTarea(id: string | number, next: boolean) {
    const key = String(id)
    if (busy[key]) return
    setBusy(b => ({ ...b, [key]: true }))
    // Optimistic: the checkbox is the whole point, so it must feel instant.
    setDone(d => ({ ...d, [key]: next }))
    const { ok, error } = await patchRecordDetailed('tareas', Number(id), next
      ? { estado: 'completada', fecha_completado: new Date().toISOString() }
      : { estado: 'pendiente', fecha_completado: null })
    setBusy(b => ({ ...b, [key]: false }))
    if (ok) {
      toast.success(next ? 'Tarea completada' : 'Tarea reabierta')
      router.refresh()
    } else {
      setDone(d => ({ ...d, [key]: !next }))
      toast.error(error || 'No se pudo actualizar')
    }
  }

  const withLocalState = items.map(i =>
    i.kind === 'tarea' && done[String(i.id)] !== undefined ? { ...i, done: done[String(i.id)] } : i)

  const hoy = new Date()
  const fecha = hoy.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' })
  const hoyKey = localDayKey(hoy)
  const hoyCount = withLocalState.filter(i => i.dayKey === hoyKey && !i.done).length

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-xl font-semibold">Tablero</h1>
        <p className="text-sm text-muted-foreground first-letter:uppercase">
          {fecha} · {hoyCount === 0 ? 'nada pendiente hoy' : `${hoyCount} pendiente${hoyCount === 1 ? '' : 's'} hoy`}
        </p>
      </div>

      {alertas.length > 0 && (
        <section className="rounded-lg border border-destructive/30 bg-destructive/5 overflow-hidden">
          <div className="flex items-center gap-2 px-3 py-2 text-destructive">
            <CircleAlertIcon className="size-4 shrink-0" aria-hidden />
            <h2 className="text-xs font-semibold uppercase tracking-wide">
              {alertas.length === 1 ? 'Alerta' : `Alertas · ${alertas.length}`}
            </h2>
          </div>
          <ul className="divide-y divide-destructive/15 border-t border-destructive/15">
            {alertas.map((a, i) => (
              <li key={i} className="px-3 py-2 text-sm text-destructive">{a}</li>
            ))}
          </ul>
        </section>
      )}

      <MonthBoard items={withLocalState} onToggleTarea={toggleTarea} />

      {sinFecha.length > 0 && (
        <section className="rounded-lg border border-border bg-card overflow-hidden">
          <header className="flex items-baseline justify-between border-b border-border px-3 py-2">
            <h2 className="text-sm font-medium">Sin fecha</h2>
            <Link href="/tareas" className="text-xs text-muted-foreground hover:text-foreground">
              Ver tareas →
            </Link>
          </header>
          <ul className="divide-y divide-border">
            {sinFecha.slice(0, 6).map(t => (
              <li key={t.id} className="flex items-center justify-between gap-3 px-3 py-2">
                <span className="flex items-center gap-2 min-w-0">
                  {t.urgent && <span className="size-1.5 rounded-full bg-destructive shrink-0" aria-hidden />}
                  <span className="text-sm truncate">{t.titulo}</span>
                </span>
                {t.asignado && (
                  <span className="text-xs text-muted-foreground shrink-0">{t.asignado}</span>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
