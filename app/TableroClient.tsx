'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { toast } from 'sonner'
import { CheckIcon, CircleAlertIcon } from 'lucide-react'
import { patchRecordDetailed } from '@/lib/kapso'
import { MonthBoard, type BoardItem } from '@/components/calendar/MonthBoard'
import { localDayKey } from '@/lib/date'

// El tablero: qué pinta el día. Nada de plata, nada de stock — eso vive en Finanzas
// y en Stock. Acá sólo va lo que pasa y lo que hay que hacer.

export default function TableroClient({
  items, alertas, sinFecha, datosFaltantes = [], marshiot = [],
}: {
  items: BoardItem[]
  alertas: string[]
  sinFecha: { id: number; titulo: string; asignado?: string; urgent: boolean }[]
  datosFaltantes?: { label: string; faltan: string[] }[]
  marshiot?: { id: number; titulo: string; urgent: boolean; fecha: string | null }[]
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

      {/* Tareas de Marshiot — arriba del todo, pedido del usuario 2026-08-13.
          Violeta = su color de badge en /tareas. */}
      {marshiot.length > 0 && (
        <section className="rounded-lg border border-violet-300 bg-violet-50/60 dark:border-violet-900 dark:bg-violet-950/30 overflow-hidden">
          <header className="flex items-center justify-between px-3 py-2 border-b border-violet-200/60 dark:border-violet-900/60">
            <div className="flex items-center gap-2">
              <span className="bg-violet-600 text-white rounded-full px-2 py-0.5 text-xs font-medium">Marshiot</span>
              <h2 className="text-xs font-semibold uppercase tracking-wide text-violet-700 dark:text-violet-300">
                {(() => { const n = marshiot.filter(t => !done[String(t.id)]).length; return n === 0 ? 'Todo listo' : `${n} tarea${n === 1 ? '' : 's'}` })()}
              </h2>
            </div>
            <Link href="/tareas" className="text-xs text-violet-700 dark:text-violet-300 hover:underline underline-offset-2">
              Ver tareas →
            </Link>
          </header>
          <ul className="divide-y divide-violet-200/60 dark:divide-violet-900/60">
            {marshiot.map(t => {
              const isDone = done[String(t.id)] ?? false
              return (
                <li key={t.id} className="flex items-center gap-2.5 px-3 py-2">
                  <button
                    type="button"
                    onClick={() => toggleTarea(t.id, !isDone)}
                    disabled={busy[String(t.id)]}
                    title={isDone ? 'Reabrir tarea' : 'Marcar como completada'}
                    aria-label={isDone ? 'Reabrir tarea' : 'Marcar como completada'}
                    className={`size-4 shrink-0 rounded border flex items-center justify-center transition-colors ${
                      isDone
                        ? 'bg-violet-600 border-violet-600 text-white'
                        : 'border-violet-400 dark:border-violet-700 hover:border-violet-600 text-transparent'
                    }`}
                  >
                    <CheckIcon className="size-3" aria-hidden />
                  </button>
                  {t.urgent && !isDone && <span className="size-1.5 rounded-full bg-destructive shrink-0" aria-hidden />}
                  <span className={`text-sm truncate flex-1 ${isDone ? 'text-muted-foreground line-through' : ''}`}>
                    {t.titulo}
                  </span>
                  {t.fecha && (
                    <span className="text-xs text-muted-foreground tabular-nums shrink-0">
                      {Number(t.fecha.slice(8, 10))}/{Number(t.fecha.slice(5, 7))}
                    </span>
                  )}
                </li>
              )
            })}
          </ul>
        </section>
      )}

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

      {/* Datos faltantes en vehículos — banner permanente (reemplaza al aviso
          diario por WhatsApp). Ámbar, no rojo: es higiene de datos, no fuego. */}
      {datosFaltantes.length > 0 && (
        <section className="rounded-lg border border-amber-300 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/40 overflow-hidden">
          <div className="flex items-center justify-between px-3 py-2">
            <div className="flex items-center gap-2 text-amber-700 dark:text-amber-300">
              <CircleAlertIcon className="size-4 shrink-0" aria-hidden />
              <h2 className="text-xs font-semibold uppercase tracking-wide">
                Datos faltantes en {datosFaltantes.length} vehículo{datosFaltantes.length === 1 ? '' : 's'}
              </h2>
            </div>
            <Link href="/stock" className="text-xs text-amber-700 dark:text-amber-300 hover:underline underline-offset-2">
              Completar en Stock →
            </Link>
          </div>
          <ul className="divide-y divide-amber-200/60 dark:divide-amber-900/60 border-t border-amber-200/60 dark:border-amber-900/60">
            {datosFaltantes.map((v, i) => (
              <li key={i} className="px-3 py-2 text-sm text-amber-800 dark:text-amber-200">
                <span className="font-medium">{v.label}</span>
                <span className="text-amber-700/80 dark:text-amber-300/80"> — falta: {v.faltan.join(', ')}</span>
              </li>
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
