'use client'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import {
  ACCEPT_ARCHIVO, type ChatMensaje, agruparPorDia, esImagen, estaEscribiendo,
  idTemporal, mergeMensajes, ofreceSiNo, ultimoIdServidor, validarArchivo,
} from '@/lib/chat'
import { fmtHora } from '@/lib/date'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/empty-state'
import {
  ArrowDownIcon, CameraIcon, CheckIcon, ClockIcon, FileTextIcon, KeyRoundIcon,
  MessageCircleIcon, PaperclipIcon, RotateCcwIcon, SendIcon, XIcon,
} from 'lucide-react'

/** Cada cuánto se pide lo nuevo. 2,5 s: rápido para que se sienta vivo, lento
 *  para que un turno de 2 minutos no sean mil requests. */
const POLL_MS = 2500

/** Un adjunto ya subido, esperando a que se toque "Enviar". */
type Adjunto = {
  ref: string
  nombre: string
  mime: string
  tipo: string
  /** blob: local, sólo para la miniatura del composer (no viaja a ningún lado). */
  preview: string | null
}

/** El `detail` del backend, o algo razonable si no vino ninguno. */
function detalleDe(data: unknown, status: number): string {
  const d = (data as Record<string, unknown> | null)?.detail
  if (typeof d === 'string' && d.trim()) return d.trim()
  const m = (data as Record<string, unknown> | null)?.message
  if (typeof m === 'string' && m.trim()) return m.trim()
  return `El servidor respondió ${status}.`
}

export default function ChatClient() {
  const [mensajes, setMensajes] = useState<ChatMensaje[]>([])
  const [cargando, setCargando] = useState(true)
  const [borrador, setBorrador] = useState('')
  const [adjunto, setAdjunto] = useState<Adjunto | null>(null)
  const [subiendo, setSubiendo] = useState(false)
  const [enviando, setEnviando] = useState(false)
  /** El `detail` del 503: la instancia se quedó sin ANTHROPIC_API_KEY. */
  const [sinClave, setSinClave] = useState<string | null>(null)
  const [pegado, setPegado] = useState(true)

  // `after_id` del próximo poll: el id real más alto que ya vimos.
  const afterIdRef = useRef(0)
  // El id de la fila del usuario cuyo `estado` estamos siguiendo. Mientras haya
  // una, el poll pide DESDE UNO ANTES: si pidiera desde ella, la fila no volvería
  // nunca y el relojito se quedaría girando para siempre (el backend actualiza
  // esa MISMA fila de pendiente → procesando → listo, no crea una nueva).
  const esperandoIdRef = useRef(0)
  const contadorTempRef = useRef(0)
  const scrollerRef = useRef<HTMLDivElement | null>(null)
  const finRef = useRef<HTMLDivElement | null>(null)
  const inputArchivoRef = useRef<HTMLInputElement | null>(null)
  const inputCamaraRef = useRef<HTMLInputElement | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)

  const escribiendo = estaEscribiendo(mensajes)
  const grupos = useMemo(() => agruparPorDia(mensajes), [mensajes])
  const mostrarSiNo = ofreceSiNo(mensajes) && !escribiendo && !enviando

  // ── Polling ────────────────────────────────────────────────────────────────

  const traer = useCallback(async () => {
    const desde = esperandoIdRef.current > 0
      ? Math.max(0, Math.min(afterIdRef.current, esperandoIdRef.current - 1))
      : afterIdRef.current
    try {
      const r = await fetch(`/api/chat/mensajes?after_id=${desde}&limit=100`, { cache: 'no-store' })
      if (!r.ok) return
      const data = await r.json().catch(() => null)
      const nuevos: ChatMensaje[] = Array.isArray(data?.mensajes) ? data.mensajes : []
      if (!nuevos.length) return

      const max = ultimoIdServidor(nuevos)
      if (max > afterIdRef.current) afterIdRef.current = max

      // ¿Ya terminó el turno que estábamos siguiendo?
      const seguida = nuevos.find(m => Number(m.id) === esperandoIdRef.current)
      if (seguida && (seguida.estado === 'listo' || seguida.estado === 'error')) {
        esperandoIdRef.current = 0
      }

      setMensajes(prev => mergeMensajes(prev, nuevos))
    } catch {
      // Un poll perdido no es un error que mostrar: el próximo lo arregla.
    }
  }, [])

  // Primera carga.
  useEffect(() => {
    let vivo = true
    traer().finally(() => { if (vivo) setCargando(false) })
    return () => { vivo = false }
  }, [traer])

  // El intervalo corre SÓLO con la pestaña visible: con el celular en el bolsillo
  // no tiene sentido pegarle al backend cada 2,5 s. Al volver, se pide de una
  // para que la pantalla esté fresca antes de que el ojo llegue.
  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null
    const arrancar = () => {
      if (timer) return
      timer = setInterval(() => { void traer() }, POLL_MS)
    }
    const parar = () => {
      if (timer) clearInterval(timer)
      timer = null
    }
    const alCambiarVisibilidad = () => {
      if (document.visibilityState === 'visible') {
        void traer()
        arrancar()
      } else {
        parar()
      }
    }
    alCambiarVisibilidad()
    document.addEventListener('visibilitychange', alCambiarVisibilidad)
    return () => {
      document.removeEventListener('visibilitychange', alCambiarVisibilidad)
      parar()
    }
  }, [traer])

  // ── Autoscroll ─────────────────────────────────────────────────────────────

  const alFondo = useCallback((suave = true) => {
    finRef.current?.scrollIntoView({ behavior: suave ? 'smooth' : 'auto', block: 'end' })
  }, [])

  // Sólo si el usuario está mirando el final. Si scrolleó para arriba a releer
  // algo, un mensaje nuevo NO se lo lleva de vuelta abajo — aparece el botón.
  useEffect(() => {
    if (pegado) alFondo(!cargando)
  }, [mensajes, escribiendo, pegado, cargando, alFondo])

  function alScrollear() {
    const el = scrollerRef.current
    if (!el) return
    const cerca = el.scrollHeight - el.scrollTop - el.clientHeight < 80
    setPegado(anterior => (anterior === cerca ? anterior : cerca))
  }

  // ── Composer: textarea auto-crecible ───────────────────────────────────────

  // `field-sizing-content` (el que trae components/ui/textarea) todavía no está
  // en Safari, que es justo el navegador del iPhone donde esto se usa. Se mide
  // a mano y se capa en ~7 renglones para que el input no se coma la pantalla.
  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 168)}px`
  }, [borrador])

  // ── Adjuntos ───────────────────────────────────────────────────────────────

  function limpiarAdjunto() {
    setAdjunto(a => {
      if (a?.preview) URL.revokeObjectURL(a.preview)
      return null
    })
    limpiarInputs()
  }

  function limpiarInputs() {
    if (inputArchivoRef.current) inputArchivoRef.current.value = ''
    if (inputCamaraRef.current) inputCamaraRef.current.value = ''
  }

  async function elegirArchivo(file: File | null | undefined) {
    if (!file) return
    const problema = validarArchivo({ nombre: file.name, mime: file.type, bytes: file.size })
    if (problema) {
      toast.error(problema)
      limpiarInputs()
      return
    }
    setSubiendo(true)
    try {
      const fd = new FormData()
      fd.append('archivo', file)
      const r = await fetch('/api/chat/media', { method: 'POST', body: fd })
      const data = await r.json().catch(() => null)
      if (!r.ok) {
        if (r.status === 503) setSinClave(detalleDe(data, r.status))
        toast.error(detalleDe(data, r.status))
        return
      }
      limpiarAdjunto()
      setAdjunto({
        ref: String(data?.ref ?? ''),
        nombre: String(data?.nombre ?? file.name),
        mime: String(data?.mime ?? file.type),
        tipo: String(data?.tipo ?? (file.type.startsWith('image/') ? 'imagen' : 'documento')),
        preview: file.type.startsWith('image/') ? URL.createObjectURL(file) : null,
      })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No pude subir el archivo.')
    } finally {
      setSubiendo(false)
      limpiarInputs()
    }
  }

  // ── Envío ──────────────────────────────────────────────────────────────────

  const enviar = useCallback(async (
    texto: string,
    media?: { ref: string; nombre: string; mime: string; tipo: string } | null,
  ) => {
    const limpio = (texto ?? '').trim()
    if (!limpio && !media) return

    // La burbuja aparece ANTES de que el backend conteste: escribir y ver el
    // mensaje son la misma acción. El id temporal ordena al final (lib/chat).
    const tempId = idTemporal(++contadorTempRef.current)
    const optimista: ChatMensaje = {
      id: tempId,
      rol: 'user',
      texto: limpio,
      estado: 'pendiente',
      created_at: new Date().toISOString(),
      pendienteLocal: true,
      mediaRef: media?.ref ?? null,
      media: media
        ? { url: `/api/chat/media/${media.ref}`, tipo: media.tipo, nombre: media.nombre, mime: media.mime }
        : null,
    }
    setMensajes(prev => mergeMensajes(prev, [optimista]))
    setPegado(true)
    setEnviando(true)

    try {
      const r = await fetch('/api/chat/enviar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          texto: limpio,
          media_ref: media?.ref ?? '',
          media_nombre: media?.nombre ?? '',
        }),
      })
      const data = await r.json().catch(() => null)
      if (!r.ok) {
        if (r.status === 503) setSinClave(detalleDe(data, r.status))
        throw new Error(detalleDe(data, r.status))
      }
      setSinClave(null)

      const idReal = Number(data?.id)
      if (Number.isFinite(idReal) && idReal > 0) {
        esperandoIdRef.current = idReal
        setMensajes(prev => {
          const temp = prev.find(m => m.id === tempId)
          const resto = prev.filter(m => m.id !== tempId)
          // El poll puede haber traído la fila real mientras este POST volvía:
          // ahí la del server manda y la optimista simplemente se va.
          if (!temp || resto.some(m => m.id === idReal)) {
            return resto.sort((a, b) => a.id - b.id)
          }
          return mergeMensajes(resto, [
            { ...temp, id: idReal, pendienteLocal: false, errorLocal: null },
          ])
        })
      }
    } catch (e) {
      const motivo = e instanceof Error ? e.message : 'No se pudo enviar.'
      setMensajes(prev => prev.map(m =>
        m.id === tempId ? { ...m, pendienteLocal: false, errorLocal: motivo } : m))
    } finally {
      setEnviando(false)
    }
  }, [])

  function enviarDelComposer() {
    if (enviando || subiendo) return
    const texto = borrador
    const media = adjunto
    if (!texto.trim() && !media) return
    setBorrador('')
    if (media?.preview) URL.revokeObjectURL(media.preview)
    setAdjunto(null)
    void enviar(texto, media)
  }

  function reintentar(m: ChatMensaje) {
    setMensajes(prev => prev.filter(x => x.id !== m.id))
    void enviar(m.texto, m.media && m.mediaRef
      ? { ref: m.mediaRef, nombre: m.media.nombre, mime: m.media.mime, tipo: m.media.tipo }
      : null)
  }

  function alTeclear(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key !== 'Enter' || e.shiftKey) return
    // En el celular Enter es "renglón nuevo" y el envío va por el botón. En una
    // compu con teclado, Enter manda — que es lo que la mano espera.
    if (typeof window !== 'undefined' && !window.matchMedia?.('(pointer: fine)').matches) return
    e.preventDefault()
    enviarDelComposer()
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  const hiloVacio = !cargando && mensajes.length === 0

  return (
    <div className="mx-auto flex h-[calc(100dvh-8.5rem)] w-full max-w-3xl flex-col">
      <div
        ref={scrollerRef}
        onScroll={alScrollear}
        className="relative min-h-0 flex-1 overflow-y-auto overscroll-contain px-1 pb-2"
      >
        {cargando && (
          <p className="py-10 text-center text-sm text-muted-foreground">Abriendo la conversación…</p>
        )}

        {hiloVacio && !sinClave && (
          <EmptyState
            icon={MessageCircleIcon}
            title="Hablá con el asistente"
            hint="Es el mismo que contesta por WhatsApp: preguntale por el stock, la caja, las tareas, o mandale la foto de una cédula. Escribí abajo para arrancar."
          />
        )}

        {hiloVacio && sinClave && (
          <EmptyState
            icon={KeyRoundIcon}
            title="El chat todavía no está activo"
            hint="El chat se activa cuando se cargue la clave de Anthropic — pedísela a quien administra el sistema."
          />
        )}

        {grupos.map(g => (
          <section key={g.clave}>
            <div className="sticky top-0 z-10 flex justify-center py-2">
              <span className="rounded-full bg-muted/90 px-3 py-0.5 text-2xs font-medium text-muted-foreground backdrop-blur-sm">
                {g.etiqueta}
              </span>
            </div>
            <div className="space-y-2">
              {g.mensajes.map(m => (
                <Burbuja key={m.id} m={m} onReintentar={() => reintentar(m)} />
              ))}
            </div>
          </section>
        ))}

        {escribiendo && <Escribiendo />}
        <div ref={finRef} className="h-1" />
      </div>

      {/* Volver al final: sólo cuando el usuario se fue para arriba. */}
      {!pegado && mensajes.length > 0 && (
        <div className="pointer-events-none relative">
          <Button
            size="icon"
            variant="secondary"
            aria-label="Ir al último mensaje"
            onClick={() => { setPegado(true); alFondo() }}
            className="pointer-events-auto absolute -top-12 right-2 size-10 rounded-full shadow-md"
          >
            <ArrowDownIcon className="size-4" />
          </Button>
        </div>
      )}

      {sinClave && !hiloVacio && (
        <div className="mb-2 flex items-start gap-2 rounded-xl border border-border bg-muted/50 px-3 py-2.5 text-sm">
          <KeyRoundIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          <p className="text-muted-foreground">
            El chat se activa cuando se cargue la clave de Anthropic — pedísela a quien administra el sistema.
          </p>
        </div>
      )}

      {/* Botones rápidos del gate de confirmación. Grandes: se tocan con el
          pulgar sin apuntar, que es como se contesta un "¿Confirmás?". */}
      {mostrarSiNo && (
        <div className="mb-2 grid grid-cols-2 gap-2">
          <Button
            size="lg"
            className="h-12 text-base"
            disabled={enviando}
            onClick={() => void enviar('sí')}
          >
            ✅ Sí
          </Button>
          <Button
            size="lg"
            variant="outline"
            className="h-12 text-base"
            disabled={enviando}
            onClick={() => void enviar('no')}
          >
            ❌ No
          </Button>
        </div>
      )}

      {/* Composer */}
      <div className="shrink-0 border-t border-border bg-background pt-2">
        {adjunto && (
          <div className="mb-2 flex items-center gap-2 rounded-xl border border-border bg-muted/40 p-2">
            {adjunto.preview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={adjunto.preview} alt="" className="size-12 rounded-lg object-cover" />
            ) : (
              <span className="grid size-12 place-items-center rounded-lg bg-muted text-muted-foreground">
                <FileTextIcon className="size-5" />
              </span>
            )}
            <span className="min-w-0 flex-1 truncate text-sm">{adjunto.nombre}</span>
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label="Quitar el archivo"
              onClick={limpiarAdjunto}
            >
              <XIcon className="size-4" />
            </Button>
          </div>
        )}

        <div className="flex items-end gap-2">
          {/* Dos entradas y no una: el clip abre la galería/los archivos, y la
              cámara —sólo en el celular— abre la cámara de atrás derecho. Un
              solo input con `capture` haría que elegir una foto YA SACADA (o un
              PDF) fuera imposible en Android. */}
          <input
            ref={inputArchivoRef}
            type="file"
            accept={ACCEPT_ARCHIVO}
            className="hidden"
            onChange={e => void elegirArchivo(e.target.files?.[0])}
          />
          <input
            ref={inputCamaraRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={e => void elegirArchivo(e.target.files?.[0])}
          />
          <Button
            size="icon"
            variant="ghost"
            aria-label="Adjuntar una foto o un PDF"
            disabled={subiendo || enviando}
            onClick={() => inputArchivoRef.current?.click()}
            className="size-11 shrink-0 rounded-full"
          >
            <PaperclipIcon className={cn('size-5', subiendo && 'opacity-50')} />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            aria-label="Sacar una foto"
            disabled={subiendo || enviando}
            onClick={() => inputCamaraRef.current?.click()}
            className="size-11 shrink-0 rounded-full sm:hidden"
          >
            <CameraIcon className={cn('size-5', subiendo && 'opacity-50')} />
          </Button>

          <textarea
            ref={textareaRef}
            rows={1}
            value={borrador}
            onChange={e => setBorrador(e.target.value)}
            onKeyDown={alTeclear}
            placeholder={subiendo ? 'Subiendo el archivo…' : 'Escribí un mensaje…'}
            aria-label="Mensaje"
            className="max-h-[168px] min-h-11 flex-1 resize-none rounded-2xl border border-input bg-transparent px-3.5 py-2.5 text-base outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
          />

          <Button
            size="icon"
            aria-label="Enviar"
            disabled={enviando || subiendo || (!borrador.trim() && !adjunto)}
            onClick={enviarDelComposer}
            className="size-11 shrink-0 rounded-full"
          >
            <SendIcon className="size-5" />
          </Button>
        </div>
      </div>
    </div>
  )
}

// ── Burbuja ───────────────────────────────────────────────────────────────────

function Burbuja({ m, onReintentar }: { m: ChatMensaje; onReintentar: () => void }) {
  // Una nota del canal, no del bot: va centrada, chica y gris. Que no se
  // confunda con el asistente hablando es el punto.
  if (m.rol === 'sistema') {
    return (
      <div className="flex justify-center py-1">
        <span className="max-w-[85%] rounded-lg bg-muted/60 px-3 py-1 text-center text-xs text-muted-foreground">
          {m.texto}
        </span>
      </div>
    )
  }

  const mio = m.rol === 'user'
  const fallado = Boolean(m.errorLocal)
  const enVuelo = !fallado && (m.pendienteLocal || m.estado === 'pendiente' || m.estado === 'procesando')

  return (
    <div className={cn('flex w-full', mio ? 'justify-end' : 'justify-start')}>
      <div className={cn('max-w-[85%] sm:max-w-[75%]', mio ? 'items-end' : 'items-start')}>
        <div
          className={cn(
            'rounded-2xl px-3.5 py-2 text-[15px] leading-relaxed whitespace-pre-wrap break-words',
            mio
              ? 'rounded-br-sm bg-primary text-primary-foreground'
              : 'rounded-bl-sm bg-muted text-foreground',
            fallado && 'border border-destructive/50',
          )}
        >
          {m.media && <Adjuntito media={m.media} mio={mio} />}
          {m.texto}
        </div>

        <div
          className={cn(
            'mt-0.5 flex items-center gap-1 px-1 text-2xs text-muted-foreground',
            mio ? 'justify-end' : 'justify-start',
          )}
        >
          {fallado ? (
            <>
              <span className="text-destructive">No se envió</span>
              <button
                type="button"
                onClick={onReintentar}
                className="inline-flex items-center gap-1 rounded px-1 font-medium text-destructive underline underline-offset-2"
              >
                <RotateCcwIcon className="size-3" />
                Reintentar
              </button>
            </>
          ) : (
            <>
              <span>{fmtHora(m.created_at)}</span>
              {mio && (enVuelo
                ? <ClockIcon className="size-3" aria-label="Enviando" />
                : <CheckIcon className="size-3" aria-label="Enviado" />)}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function Adjuntito({ media, mio }: { media: NonNullable<ChatMensaje['media']>; mio: boolean }) {
  // El href va SIEMPRE al proxy propio (/api/chat/media/...): el backend pide la
  // API key y el browser no la tiene.
  if (esImagen(media)) {
    return (
      <a href={media.url} target="_blank" rel="noreferrer" className="mb-1.5 block">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={media.url}
          alt={media.nombre || 'Adjunto'}
          className="max-h-64 w-auto max-w-full rounded-xl object-cover"
        />
      </a>
    )
  }
  return (
    <a
      href={media.url}
      target="_blank"
      rel="noreferrer"
      download={media.nombre || undefined}
      className={cn(
        'mb-1.5 flex items-center gap-2 rounded-xl px-2.5 py-2 text-sm',
        mio ? 'bg-primary-foreground/15' : 'bg-background/70',
      )}
    >
      <FileTextIcon className="size-5 shrink-0" />
      <span className="min-w-0 flex-1 truncate">{media.nombre || 'Documento'}</span>
      <span className="shrink-0 text-xs underline underline-offset-2">Descargar</span>
    </a>
  )
}

/** Los tres puntitos. Con `prefers-reduced-motion` quedan quietos: la burbuja
 *  sigue diciendo lo mismo sin nada saltando en pantalla. */
function Escribiendo() {
  return (
    <div className="flex justify-start pt-1" role="status" aria-label="El asistente está escribiendo">
      <span className="flex items-center gap-1 rounded-2xl rounded-bl-sm bg-muted px-3.5 py-3">
        {[0, 1, 2].map(i => (
          <span
            key={i}
            className="size-1.5 rounded-full bg-muted-foreground/70 motion-safe:animate-bounce"
            style={{ animationDelay: `${i * 150}ms` }}
          />
        ))}
      </span>
    </div>
  )
}
