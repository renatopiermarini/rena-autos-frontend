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

/** Una sección de tareas destacadas: un miembro asignable que no es el asignado
 *  por defecto. Con el perfil de Renato hay exactamente una, la de Marshiot. */
export type SeccionEquipo = {
  clave: string
  label: string
  badgeCls: string   // clases del pill; salen de lib/equipo.ts
  tareas: { id: number; titulo: string; urgent: boolean; fecha: string | null }[]
}

/** Un número del strip de arriba. Ya viene formateado del server (app/page.tsx),
 *  que lo saca de computePatrimonio — la misma cuenta que dibuja /finanzas. */
export type NumeroResumen = {
  label: string
  valor: string
  sub?: string
  href: string
  tone?: 'default' | 'positive' | 'negative'
}

export default function TableroClient({
  items, alertas, sinFecha, datosFaltantes = [], verificacionesSinAuto = [], secciones = [], resumen = [],
}: {
  items: BoardItem[]
  alertas: string[]
  sinFecha: { id: number; titulo: string; asignado?: string; urgent: boolean }[]
  datosFaltantes?: { label: string; faltan: string[]; dias?: number | null }[]
  verificacionesSinAuto?: { mecanico: string | null; fecha: string | null; resumen: string | null }[]
  secciones?: SeccionEquipo[]
  resumen?: NumeroResumen[]
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
        <h1 className="text-2xl font-semibold tracking-tight">Tablero</h1>
        <p className="text-sm text-muted-foreground first-letter:uppercase">
          {fecha} · {hoyCount === 0 ? 'nada pendiente hoy' : `${hoyCount} pendiente${hoyCount === 1 ? '' : 's'} hoy`}
        </p>
      </div>

      {/* "¿Cómo vengo?" — lo primero que se ve. El tablero arrancaba con datos
          faltantes y el calendario: información de trabajo, no de negocio. Cuatro
          números y nada más (sin gráficos), cada uno linkeando a la pantalla
          donde se sigue mirando; en el celular quedan de a dos. */}
      {resumen.length > 0 && (
        <section className="grid grid-cols-2 gap-2 lg:grid-cols-4">
          {resumen.map(n => (
            <Link
              key={n.label}
              href={n.href}
              className="rounded-lg border border-border bg-card px-3 py-2.5 transition-colors hover:bg-muted/40"
            >
              <p className="text-2xs uppercase tracking-wide text-muted-foreground">{n.label}</p>
              <p className={`text-2xl font-semibold font-mono tabular-nums leading-tight ${
                n.tone === 'positive' ? 'text-success'
                : n.tone === 'negative' ? 'text-destructive'
                : ''
              }`}>
                {n.valor}
              </p>
              {n.sub && (
                <p className="mt-0.5 truncate text-2xs text-muted-foreground" title={n.sub}>{n.sub}</p>
              )}
            </Link>
          ))}
        </section>
      )}

      {/* Tareas destacadas — arriba del todo, pedido del usuario 2026-08-13 (era
          la sección fija de Marshiot). El acento violeta es el de la sección, no
          el de la persona: identifica "tareas del equipo" y queda igual que
          siempre. Quién es cada uno lo dice el pill, que sí usa su color. */}
      {secciones.map(seccion => (
        <section key={seccion.clave} className="rounded-lg border border-violet-600/30 bg-violet-600/5 dark:border-violet-400/25 dark:bg-violet-400/10 overflow-hidden">
          <header className="flex items-center justify-between px-3 py-2 border-b border-violet-600/15 dark:border-violet-400/15">
            <div className="flex items-center gap-2">
              <span className={`${seccion.badgeCls} rounded-full px-2 py-0.5 text-xs font-medium`}>{seccion.label}</span>
              <h2 className="text-xs font-semibold uppercase tracking-wide text-violet-800 dark:text-violet-300">
                {(() => { const n = seccion.tareas.filter(t => !done[String(t.id)]).length; return n === 0 ? 'Todo listo' : `${n} tarea${n === 1 ? '' : 's'}` })()}
              </h2>
            </div>
            <Link href="/tareas" className="text-xs text-violet-800 dark:text-violet-300 hover:underline underline-offset-2">
              Ver tareas →
            </Link>
          </header>
          <ul className="divide-y divide-violet-600/15 dark:divide-violet-400/15">
            {seccion.tareas.map(t => {
              const isDone = done[String(t.id)] ?? false
              return (
                <li key={t.id} className="flex items-center gap-2.5 px-3 py-2">
                  {/* "Hecha" se pinta con los tokens success, igual que el mismo
                      checkbox en MonthBoard: dos verdes distintos para el mismo
                      gesto en la misma pantalla era drift. El violeta queda para
                      el borde pendiente, que es el acento de la sección. */}
                  <button
                    type="button"
                    onClick={() => toggleTarea(t.id, !isDone)}
                    disabled={busy[String(t.id)]}
                    aria-pressed={isDone}
                    title={isDone ? 'Reabrir tarea' : 'Marcar como completada'}
                    aria-label={isDone ? 'Reabrir tarea' : 'Marcar como completada'}
                    className={`size-4 shrink-0 rounded border flex items-center justify-center transition-colors ${
                      isDone
                        ? 'border-success bg-success text-success-foreground'
                        : 'border-violet-600/40 dark:border-violet-400/40 hover:border-violet-600 dark:hover:border-violet-400 text-transparent'
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
      ))}

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
          diario por WhatsApp). Warning, no destructive: higiene de datos, no fuego. */}
      {datosFaltantes.length > 0 && (
        <AlertaHigiene
          titulo={`Datos faltantes en ${datosFaltantes.length} vehículo${datosFaltantes.length === 1 ? '' : 's'}`}
          href="/stock"
          cta="Completar en Stock →"
        >
          {datosFaltantes.map((v, i) => (
            <li key={i} className="px-3 py-2 text-sm">
              <span className="font-medium">{v.label}</span>
              {/* Días en stock: el auto que lleva demasiado parado se marca acá
                  mismo — es plata quieta, no sólo un campo sin llenar. */}
              {v.dias != null && (
                <span className="ml-1.5 rounded-full bg-warning/15 px-1.5 py-0.5 text-2xs font-medium font-mono tabular-nums text-warning">
                  hace {v.dias} días
                </span>
              )}
              <span className="text-muted-foreground"> — falta: {v.faltan.join(', ')}</span>
            </li>
          ))}
        </AlertaHigiene>
      )}

      {/* Verificaciones que el bot guardó sin saber de qué auto eran — mismo
          tratamiento warning que datos faltantes. Se resuelven asignando el
          auto en /verificaciones. */}
      {verificacionesSinAuto.length > 0 && (
        <AlertaHigiene
          titulo={verificacionesSinAuto.length === 1
            ? 'Verificación sin auto asignado'
            : `Verificaciones sin auto asignado · ${verificacionesSinAuto.length}`}
          href="/verificaciones"
          cta="Asignar en Verificaciones →"
        >
          {verificacionesSinAuto.map((v, i) => (
            <li key={i} className="px-3 py-2 text-sm">
              <span className="font-medium">{v.mecanico || 'Verificación'}</span>
              {v.fecha && (
                <span className="ml-1.5 text-xs font-mono tabular-nums text-muted-foreground">
                  {Number(v.fecha.slice(8, 10))}/{Number(v.fecha.slice(5, 7))}
                </span>
              )}
              {v.resumen && (
                <span className="text-muted-foreground"> — {v.resumen}</span>
              )}
            </li>
          ))}
        </AlertaHigiene>
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

// Marco compartido de las alertas de higiene de datos (datos faltantes,
// verificaciones sin auto): tokens warning, mismo esqueleto que la sección
// de Alertas destructive de arriba. Antes eran dos bloques ámbar idénticos
// hardcodeados — el motivo del ignore ai-color-palette en .impeccable.
function AlertaHigiene({
  titulo, href, cta, children,
}: { titulo: string; href: string; cta: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-warning/30 bg-warning/5 overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2">
        <div className="flex items-center gap-2 text-warning">
          <CircleAlertIcon className="size-4 shrink-0" aria-hidden />
          <h2 className="text-xs font-semibold uppercase tracking-wide">{titulo}</h2>
        </div>
        <Link href={href} className="text-xs text-warning hover:underline underline-offset-2">
          {cta}
        </Link>
      </div>
      <ul className="divide-y divide-warning/15 border-t border-warning/15">{children}</ul>
    </section>
  )
}
