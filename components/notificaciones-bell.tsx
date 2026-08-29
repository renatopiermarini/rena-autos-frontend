'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { type Notificacion, hastaIdVisible, textoBadge, tiempoRelativo } from '@/lib/chat'
import { cn } from '@/lib/utils'
import { BellIcon } from 'lucide-react'

/**
 * La campana del header: los avisos que el bot manda solo.
 *
 * Las filas las escribe el backend (`utils/avisos.avisar()`): recordatorios de
 * tareas, alertas de caja, nudges. En la instancia SIN bot de WhatsApp ésta es
 * la única superficie donde un aviso proactivo aparece, así que el globito rojo
 * es la señal — no un adorno.
 *
 * La campana no se dibuja si la instancia no tiene backend: eso lo decide el
 * layout en el server (lib/backend.backendHabilitado) y baja como prop, porque
 * acá `process.env.BACKEND_URL` no existe.
 */

/** Cada cuánto se refresca el globito. 30 s: un aviso no es una conversación. */
const POLL_MS = 30_000

/** Cuántos avisos entran en el popover. Más que esto es una pantalla, no una
 *  campana. */
const LIMITE = 20

export function NotificacionesBell() {
  const router = useRouter()
  const [abierto, setAbierto] = useState(false)
  const [lista, setLista] = useState<Notificacion[]>([])
  const [noLeidas, setNoLeidas] = useState(0)
  const [marcando, setMarcando] = useState(false)
  const cajaRef = useRef<HTMLDivElement | null>(null)

  const traer = useCallback(async () => {
    try {
      const r = await fetch(`/api/notificaciones?limit=${LIMITE}`, { cache: 'no-store' })
      if (!r.ok) return
      const data = await r.json().catch(() => null)
      if (Array.isArray(data?.notificaciones)) setLista(data.notificaciones)
      const n = Number(data?.no_leidas)
      setNoLeidas(Number.isFinite(n) && n > 0 ? n : 0)
    } catch {
      // Sin red no hay campana; el próximo poll la trae.
    }
  }, [])

  // Poll SÓLO con la pestaña visible, igual que el chat.
  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null
    const arrancar = () => {
      if (!timer) timer = setInterval(() => { void traer() }, POLL_MS)
    }
    const parar = () => {
      if (timer) clearInterval(timer)
      timer = null
    }
    const alCambiar = () => {
      if (document.visibilityState === 'visible') { void traer(); arrancar() } else parar()
    }
    alCambiar()
    document.addEventListener('visibilitychange', alCambiar)
    return () => {
      document.removeEventListener('visibilitychange', alCambiar)
      parar()
    }
  }, [traer])

  // Cerrar al tocar afuera o con Escape: el popover no puede quedar tapando la
  // pantalla en un celular.
  useEffect(() => {
    if (!abierto) return
    const afuera = (e: MouseEvent | TouchEvent) => {
      if (cajaRef.current && !cajaRef.current.contains(e.target as Node)) setAbierto(false)
    }
    const escape = (e: KeyboardEvent) => { if (e.key === 'Escape') setAbierto(false) }
    document.addEventListener('mousedown', afuera)
    document.addEventListener('touchstart', afuera)
    document.addEventListener('keydown', escape)
    return () => {
      document.removeEventListener('mousedown', afuera)
      document.removeEventListener('touchstart', afuera)
      document.removeEventListener('keydown', escape)
    }
  }, [abierto])

  function alternar() {
    const proximo = !abierto
    setAbierto(proximo)
    if (proximo) void traer()
  }

  async function marcarLeidas() {
    // Hasta el id más alto que la lista llegó a PINTAR: un aviso que entró
    // mientras esto estaba abierto no se da por visto sin que nadie lo viera.
    const hasta = hastaIdVisible(lista)
    if (hasta <= 0 || marcando) return
    setMarcando(true)
    try {
      const r = await fetch('/api/notificaciones/leer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hasta_id: hasta }),
      })
      if (!r.ok) return
      const data = await r.json().catch(() => null)
      const n = Number(data?.no_leidas)
      setNoLeidas(Number.isFinite(n) && n > 0 ? n : 0)
      setLista(prev => prev.map(x => (x.id <= hasta ? { ...x, leida: true } : x)))
    } catch {
      // Se reintenta con el próximo toque.
    } finally {
      setMarcando(false)
    }
  }

  function abrirAviso(n: Notificacion) {
    if (!n.link) return
    setAbierto(false)
    // Los links los escribe el backend y son rutas del propio dashboard
    // ("/tareas", "/finanzas?..."). Se navega adentro; cualquier cosa que no
    // arranque con "/" se ignora en vez de mandar al usuario afuera.
    if (n.link.startsWith('/')) router.push(n.link)
  }

  const badge = textoBadge(noLeidas)

  return (
    <div ref={cajaRef} className="relative">
      <button
        type="button"
        onClick={alternar}
        aria-label={noLeidas > 0 ? `Avisos (${noLeidas} sin leer)` : 'Avisos'}
        aria-expanded={abierto}
        className="relative grid size-9 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
      >
        <BellIcon className="size-4.5" />
        {badge && (
          <span className="absolute -top-0.5 -right-0.5 grid min-w-4 place-items-center rounded-full bg-destructive px-1 text-[10px] font-bold leading-4 text-destructive-foreground">
            {badge}
          </span>
        )}
      </button>

      {abierto && (
        <div
          role="dialog"
          aria-label="Avisos"
          className="absolute right-0 top-11 z-50 w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-xl border border-border bg-popover text-popover-foreground shadow-lg"
        >
          <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
            <span className="text-sm font-medium">Avisos</span>
            <button
              type="button"
              onClick={() => void marcarLeidas()}
              disabled={marcando || noLeidas === 0 || lista.length === 0}
              className="rounded px-1.5 py-0.5 text-xs text-muted-foreground transition-colors hover:text-foreground disabled:opacity-40"
            >
              Marcar leídas
            </button>
          </div>

          <div className="max-h-[min(24rem,60dvh)] overflow-y-auto">
            {lista.length === 0 ? (
              <p className="px-3 py-6 text-center text-sm text-muted-foreground">
                No hay avisos.
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {lista.map(n => {
                  const clickable = Boolean(n.link && n.link.startsWith('/'))
                  return (
                    <li key={n.id}>
                      <div
                        role={clickable ? 'button' : undefined}
                        tabIndex={clickable ? 0 : undefined}
                        onClick={clickable ? () => abrirAviso(n) : undefined}
                        onKeyDown={clickable
                          ? e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); abrirAviso(n) } }
                          : undefined}
                        className={cn(
                          'flex gap-2 px-3 py-2.5 text-sm',
                          clickable && 'cursor-pointer hover:bg-muted/60',
                          !n.leida && 'bg-primary/[0.04]',
                        )}
                      >
                        {/* Punto rojo = alerta: "alerta" ya es roja en el panel del
                            Tablero, y el contador de arriba también. Los avisos
                            comunes no gastan color. */}
                        <span
                          aria-hidden
                          className={cn(
                            'mt-1.5 size-1.5 shrink-0 rounded-full',
                            n.nivel === 'alerta'
                              ? 'bg-destructive'
                              : n.leida ? 'bg-transparent' : 'bg-primary',
                          )}
                        />
                        <div className="min-w-0 flex-1">
                          <p className={cn('break-words', n.leida ? 'text-muted-foreground' : 'font-medium')}>
                            {n.texto}
                          </p>
                          <p className="mt-0.5 text-[11px] text-muted-foreground">
                            {tiempoRelativo(n.created_at)}
                            {n.nivel === 'alerta' && <span className="text-destructive"> · alerta</span>}
                          </p>
                        </div>
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
