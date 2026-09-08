'use client'
import { useCallback, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { TriangleAlertIcon } from 'lucide-react'
import { Dropzone, type DropzoneEstado } from '@/components/ui/dropzone'
import { IaChip, CAMPO_IA_CLS } from '@/components/ia-hint'
import { nativeSelectCls } from '@/components/form-fields'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { comprimirImagen } from '@/lib/imagenes'
import { postIa, traducirErrorIa } from '@/lib/ia-cliente'
import { normalizarDominioMatch } from '@/lib/ia-match'
import { TIPOS_SUBIBLES, TIPO_A_COLUMNA_DOC, tipoDocumentoLabel } from '@/lib/documentos'
import { cn } from '@/lib/utils'

/**
 * "Subir papel": el dropzone de la documentación de un auto.
 *
 * La IA propone, el humano confirma (lib/ia.ts): al soltar el archivo se
 * comprime (si es foto), se manda a `clasificar-documento` y el select de tipo
 * queda pre-seleccionado con el chip "Sugerido por IA" y la confianza. Recién
 * al apretar Guardar se sube (`POST /api/documentos/subir` con el tipo
 * ELEGIDO, `tildar=true`: si es uno de los 6 papeles del checklist, el backend
 * lo tilda solo — nunca destilda).
 *
 * Si el dominio que leyó la IA no es el de este auto, se avisa en rojo y el
 * botón pasa a "Subir igual": es el error más caro (el título de un auto
 * guardado en otro) y también el más fácil de cometer con veinte fotos en el
 * celular. Si la IA falla (501/502/503), el select queda a mano en "Otro" y se
 * puede subir igual: clasificar es una comodidad, guardar es lo importante.
 */

type Sugerencia = { tipo?: string; dominio?: string | null; confianza?: number; motivo?: string }

function pct(confianza: unknown): string | null {
  const n = Number(confianza)
  if (!Number.isFinite(n)) return null
  return `${Math.round(n <= 1 ? n * 100 : n)}%`
}

function traducirErrorSubida(status: number, json: any): string {
  if (status === 501) {
    const detalle = typeof json?.detail === 'string' ? json.detail : ''
    return detalle || 'Esta instancia no guarda archivos: el backend no está en Postgres.'
  }
  return traducirErrorIa(status, json)
}

export function DocumentoUpload({
  vehicleId, dominio, clienteId, onSubido, className,
}: {
  vehicleId: number
  /** La patente del auto, para detectar "este papel parece de otro auto". */
  dominio?: string | null
  clienteId?: number | null
  /** Después de subir (además del router.refresh). */
  onSubido?: () => void
  className?: string
}) {
  const router = useRouter()
  // `ronda` remonta el Dropzone para limpiar su preview después de subir/cancelar.
  const [ronda, setRonda] = useState(0)
  const [archivo, setArchivo] = useState<File | null>(null)
  const [estado, setEstado] = useState<DropzoneEstado>('idle')
  const [mensaje, setMensaje] = useState('')
  const [sugerencia, setSugerencia] = useState<Sugerencia | null>(null)
  const [tipo, setTipo] = useState('otro')
  const [tipoTocado, setTipoTocado] = useState(false)
  const [subiendo, setSubiendo] = useState(false)

  const dominioDetectado = normalizarDominioMatch(sugerencia?.dominio ?? '')
  const dominioAuto = normalizarDominioMatch(dominio ?? '')
  const otroAuto = Boolean(dominioDetectado && dominioAuto && dominioDetectado !== dominioAuto)
  const esIa = Boolean(sugerencia?.tipo) && !tipoTocado && tipo === sugerencia?.tipo

  function reset() {
    setArchivo(null)
    setEstado('idle')
    setMensaje('')
    setSugerencia(null)
    setTipo('otro')
    setTipoTocado(false)
    setRonda(r => r + 1)
  }

  const onArchivos = useCallback(async (files: File[]) => {
    const f = await comprimirImagen(files[0])
    setArchivo(f)
    setSugerencia(null)
    setTipoTocado(false)
    setEstado('analizando')
    setMensaje('Leyendo el papel…')

    const fd = new FormData()
    fd.append('archivo', f, f.name)
    const r = await postIa<Sugerencia>('clasificar-documento', fd)
    if (!r.ok) {
      // Sin IA no se pierde nada: el tipo se elige a mano y se sube igual.
      setEstado('idle')
      setMensaje(`No se pudo clasificar (${r.error.split('\n')[0]}). Elegí el tipo a mano y subilo igual.`)
      setTipo('otro')
      return
    }
    const sugerido = TIPOS_SUBIBLES.includes(String(r.data?.tipo ?? '')) ? String(r.data.tipo) : 'otro'
    setSugerencia(r.data)
    setTipo(sugerido)
    setEstado('listo')
    const conf = pct(r.data?.confianza)
    setMensaje(
      `Parece ${tipoDocumentoLabel(sugerido).toLowerCase()}${conf ? ` (confianza ${conf})` : ''}. Revisá el tipo y guardá.`,
    )
  }, [])

  const onError = useCallback((m: string) => {
    setEstado('error')
    setMensaje(m)
  }, [])

  async function guardar() {
    if (!archivo || subiendo) return
    setSubiendo(true)
    const fd = new FormData()
    fd.append('archivo', archivo, archivo.name)
    fd.append('vehicle_id', String(vehicleId))
    if (clienteId != null) fd.append('cliente_id', String(clienteId))
    fd.append('tipo', tipo)
    fd.append('clasificar', 'false')
    fd.append('tildar', 'true')

    let res: Response
    try {
      res = await fetch('/api/documentos/subir', { method: 'POST', body: fd, cache: 'no-store' })
    } catch {
      setSubiendo(false)
      toast.error('Sin conexión. Revisá la red y probá de nuevo.')
      return
    }
    const json = await res.json().catch(() => null)
    setSubiendo(false)
    if (!res.ok) {
      const texto = traducirErrorSubida(res.status, json)
      setEstado('error')
      setMensaje(texto.split('\n')[0])
      toast.error(texto.split('\n')[0])
      return
    }
    const tildado = tipo in TIPO_A_COLUMNA_DOC
    toast.success(tildado ? 'Papel guardado y tildado en el checklist' : 'Papel guardado')
    if (typeof json?.advertencia === 'string' && json.advertencia) toast.warning(json.advertencia)
    reset()
    onSubido?.()
    router.refresh()
  }

  return (
    <div className={cn('space-y-3', className)}>
      <Dropzone
        key={ronda}
        label="Subir papel (foto o PDF)"
        hint="Soltá el título, la cédula, el informe… la IA dice qué es y vos confirmás · hasta 10 MB · también Ctrl+V"
        estado={estado}
        mensaje={mensaje || undefined}
        onArchivos={onArchivos}
        onError={onError}
        disabled={subiendo}
      />

      {archivo && estado !== 'analizando' && (
        <div className="space-y-3 rounded-lg border border-border p-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,16rem)_1fr] sm:items-end">
            <div className="space-y-1.5">
              <span className="flex items-center gap-2">
                <Label htmlFor={`tipo-doc-${vehicleId}`} className="text-xs uppercase tracking-wide text-muted-foreground">
                  Qué papel es
                </Label>
                {esIa && <IaChip />}
              </span>
              <select
                id={`tipo-doc-${vehicleId}`}
                value={tipo}
                onChange={e => { setTipo(e.target.value); setTipoTocado(true) }}
                className={cn(nativeSelectCls, esIa && CAMPO_IA_CLS)}
                disabled={subiendo}
              >
                {TIPOS_SUBIBLES.map(t => (
                  <option key={t} value={t}>{tipoDocumentoLabel(t)}</option>
                ))}
              </select>
            </div>
            <p className="text-xs text-muted-foreground">
              {sugerencia?.dominio
                ? <>Dominio detectado: <span className="font-mono">{String(sugerencia.dominio).toUpperCase()}</span></>
                : sugerencia ? 'La IA no encontró una patente en el papel.' : null}
              {sugerencia?.motivo && <span className="block">{sugerencia.motivo}</span>}
              {tipo in TIPO_A_COLUMNA_DOC && (
                <span className="block">Al guardar se tilda solo en el checklist.</span>
              )}
            </p>
          </div>

          {otroAuto && (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm"
            >
              <TriangleAlertIcon aria-hidden className="mt-0.5 size-4 shrink-0 text-destructive" />
              <span>
                Este papel parece del <span className="font-mono">{dominioDetectado}</span>, no de este auto
                {dominioAuto ? <> (<span className="font-mono">{dominioAuto}</span>)</> : null}.
                Si lo guardás, queda en la documentación de este auto.
              </span>
            </div>
          )}

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant={otroAuto ? 'destructive' : 'default'}
              size="sm"
              onClick={guardar}
              disabled={subiendo}
            >
              {subiendo ? 'Subiendo…' : otroAuto ? 'Subir igual' : 'Guardar'}
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={reset} disabled={subiendo}>
              Cancelar
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
