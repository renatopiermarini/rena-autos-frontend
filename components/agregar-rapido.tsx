'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { Loader2Icon, SparklesIcon } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { postIa } from '@/lib/ia-cliente'
import { todayKey } from '@/lib/date'
import type { AgendaParseada } from '@/lib/ia-formularios'
import type { CatalogoItem } from '@/lib/ia-match'
import { limpiarDeepLinkParam } from '@/lib/deep-link'

/**
 * "Agregar rápido": una línea en lenguaje natural arriba de la lista de
 * Visitas o de Tareas → `parsear-agenda` → el diálogo de siempre, pre-llenado.
 *
 * La IA decide si la frase es una visita o una tarea. Si no coincide con la
 * pantalla ("visita de Juan" escrita en Tareas), acá no se crea nada: se
 * ofrece el link a la otra pantalla con `?rapido=<texto>`, que la ejecuta al
 * montar (`textoInicial`). Los catálogos van SIEMPRE desde lo que la pantalla
 * ya tiene cargado, para que la IA devuelva ids y no nombres.
 */

export type Catalogos = { vehicles: CatalogoItem[]; interesados: CatalogoItem[]; equipo: string[] }

const OTRA_PANTALLA = {
  visita: { href: '/tareas', label: 'Tareas', frase: 'Eso parece una tarea' },
  tarea: { href: '/visitas', label: 'Visitas', frase: 'Eso parece una visita' },
} as const

export function AgregarRapido({
  pantalla,
  catalogos,
  onResultado,
  textoInicial,
  placeholder,
}: {
  pantalla: 'visita' | 'tarea'
  catalogos: Catalogos
  /** Sólo cuando `data.tipo === pantalla`. */
  onResultado: (data: AgendaParseada, texto: string) => void
  /** `?rapido=<texto>` desde la otra pantalla: se ejecuta una vez al montar. */
  textoInicial?: string | null
  placeholder: string
}) {
  const [texto, setTexto] = useState('')
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState('')
  const [derivar, setDerivar] = useState<string | null>(null)
  const ejecutadoInicial = useRef(false)

  const enviar = useCallback(async (frase: string) => {
    const t = frase.trim()
    if (!t || cargando) return
    setCargando(true)
    setError('')
    setDerivar(null)
    const r = await postIa<AgendaParseada>('parsear-agenda', { texto: t, hoy: todayKey(), catalogos })
    setCargando(false)
    if (!r.ok) {
      setError(r.error.split('\n')[0])
      toast.error(r.error.split('\n')[0])
      return
    }
    if (r.data.tipo !== pantalla) {
      setDerivar(t)
      return
    }
    setTexto('')
    onResultado(r.data, t)
  }, [cargando, catalogos, onResultado, pantalla])

  useEffect(() => {
    if (!textoInicial || ejecutadoInicial.current) return
    ejecutadoInicial.current = true
    setTexto(textoInicial)
    // Un F5 no tiene que volver a parsear (y crear) lo mismo.
    limpiarDeepLinkParam('rapido')
    void enviar(textoInicial)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [textoInicial])

  const otra = OTRA_PANTALLA[pantalla]

  return (
    <div className="space-y-1.5">
      <form
        className="flex items-center gap-2"
        onSubmit={e => { e.preventDefault(); void enviar(texto) }}
      >
        <div className="relative flex-1">
          <SparklesIcon
            aria-hidden
            className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            value={texto}
            onChange={e => { setTexto(e.target.value); if (error) setError(''); if (derivar) setDerivar(null) }}
            // Enter explícito además del submit del form: no depende de la
            // "implicit submission" del browser (que un IME o un teclado virtual a veces se come).
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault()
                void enviar(texto)
              }
            }}
            placeholder={placeholder}
            aria-label="Agregar rápido en lenguaje natural"
            disabled={cargando}
            className="pl-8"
          />
        </div>
        <Button type="submit" size="sm" variant="outline" disabled={cargando || !texto.trim()}>
          {cargando
            ? <><Loader2Icon className="animate-spin motion-reduce:animate-none" /> Leyendo…</>
            : 'Agregar rápido'}
        </Button>
      </form>
      {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
      {derivar && (
        <p role="status" className="text-xs text-muted-foreground">
          {otra.frase} —{' '}
          <Link
            href={`${otra.href}?rapido=${encodeURIComponent(derivar)}`}
            className="text-primary underline underline-offset-2"
          >
            ¿la creo desde {otra.label}?
          </Link>
        </p>
      )}
    </div>
  )
}
