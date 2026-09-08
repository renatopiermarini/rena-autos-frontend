'use client'
import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { CheckIcon, CircleAlertIcon, FileTextIcon, Loader2Icon, UploadIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ACCEPT_ARCHIVO, esImagen, validarFile } from '@/lib/archivos'

/**
 * La zona donde se suelta el papel (cédula, DNI, informe) o se pega la foto
 * con Ctrl+V para que la IA lo lea y pre-llene el formulario de abajo.
 *
 * Tres puertas al mismo lugar: arrastrar, hacer click (input oculto) y pegar.
 * La tercera importa: en el escritorio la cédula suele venir por WhatsApp Web,
 * y "copiar imagen → Ctrl+V sobre el form" es más corto que guardarla.
 *
 * NO sube nada: valida (lib/archivos.validarFile, mismo techo y tipos que el
 * backend) y le entrega los archivos válidos al padre por `onArchivos`. El
 * padre comprime (lib/imagenes), pega al proxy (lib/ia-cliente) y vuelve con el
 * `estado` — este componente sólo lo pinta:
 *
 *   idle       borde punteado neutro, "Soltá acá…"
 *   analizando borde `info` + spinner, aria-busy
 *   listo      borde `success`
 *   error      borde `destructive` + `mensaje`
 *
 * Plano con borde y `rounded-lg`, como manda DESIGN.md. Sin sombra.
 */

export type DropzoneEstado = 'idle' | 'analizando' | 'listo' | 'error'

export type DropzoneProps = {
  /** El `accept` del input. Default: imágenes y PDF (lib/archivos). */
  accept?: string
  /** ¿Varios archivos a la vez? Default: uno (se toma el primero). */
  multiple?: boolean
  /** La línea principal: "Soltá la cédula o el título". */
  label: string
  /** La línea chica debajo: "JPG, PNG, WebP o PDF · hasta 10 MB". */
  hint?: string
  estado: DropzoneEstado
  /** Texto del estado: el error en criollo, o "Leyendo la cédula…". */
  mensaje?: string
  /** Se llama SÓLO con archivos válidos. Nunca con la lista vacía. */
  onArchivos: (files: File[]) => void
  /** El motivo del primer archivo rechazado, en criollo. */
  onError?: (mensaje: string) => void
  /** Mostrar miniatura (imagen) o ícono + nombre (PDF) del último archivo. */
  preview?: boolean
  disabled?: boolean
  className?: string
}

const HINT_DEFAULT = 'JPG, PNG, WebP o PDF · hasta 10 MB · también podés pegar con Ctrl+V'

export function Dropzone({
  accept = ACCEPT_ARCHIVO,
  multiple = false,
  label,
  hint = HINT_DEFAULT,
  estado,
  mensaje,
  onArchivos,
  onError,
  preview = true,
  disabled = false,
  className,
}: DropzoneProps) {
  const inputRef = useRef<HTMLInputElement | null>(null)
  const inputId = useId()
  const descId = useId()
  const [arrastrando, setArrastrando] = useState(false)
  const [archivos, setArchivos] = useState<File[]>([])
  // Las URLs de las miniaturas viven fuera del state para poder revocarlas en
  // el cleanup sin depender de un render más.
  const urlsRef = useRef<string[]>([])
  const [previews, setPreviews] = useState<{ file: File; url: string | null }[]>([])

  useEffect(() => {
    urlsRef.current.forEach(u => URL.revokeObjectURL(u))
    urlsRef.current = []
    if (!preview) { setPreviews([]); return }
    const next = archivos.map(file => {
      const url = esImagen({ mime: file.type, nombre: file.name }) ? URL.createObjectURL(file) : null
      if (url) urlsRef.current.push(url)
      return { file, url }
    })
    setPreviews(next)
    return () => {
      urlsRef.current.forEach(u => URL.revokeObjectURL(u))
      urlsRef.current = []
    }
  }, [archivos, preview])

  const bloqueado = disabled || estado === 'analizando'

  const procesar = useCallback((lista: FileList | File[] | null | undefined) => {
    if (bloqueado || !lista) return
    const todos = Array.from(lista)
    const candidatos = multiple ? todos : todos.slice(0, 1)
    const validos: File[] = []
    let primerError: string | null = null
    for (const f of candidatos) {
      const err = validarFile(f)
      if (err) { primerError = primerError ?? err; continue }
      validos.push(f)
    }
    if (primerError) onError?.(primerError)
    if (validos.length === 0) return
    setArchivos(validos)
    onArchivos(validos)
  }, [bloqueado, multiple, onArchivos, onError])

  const abrirPicker = () => {
    if (bloqueado) return
    inputRef.current?.click()
  }

  const Icono = estado === 'analizando' ? Loader2Icon
    : estado === 'listo' ? CheckIcon
    : estado === 'error' ? CircleAlertIcon
    : UploadIcon

  return (
    <div className={cn('space-y-2', className)}>
      <div
        role="button"
        tabIndex={bloqueado ? -1 : 0}
        aria-disabled={bloqueado || undefined}
        aria-busy={estado === 'analizando' || undefined}
        aria-describedby={descId}
        onClick={abrirPicker}
        onKeyDown={e => {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); abrirPicker() }
        }}
        onDragEnter={e => { e.preventDefault(); if (!bloqueado) setArrastrando(true) }}
        onDragOver={e => { e.preventDefault(); if (!bloqueado) setArrastrando(true) }}
        onDragLeave={e => {
          // Salir a un hijo también dispara dragleave: sólo cuenta salir del todo.
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setArrastrando(false)
        }}
        onDrop={e => {
          e.preventDefault()
          setArrastrando(false)
          procesar(e.dataTransfer?.files)
        }}
        onPaste={e => {
          const files = e.clipboardData?.files
          if (files && files.length > 0) { e.preventDefault(); procesar(files) }
        }}
        className={cn(
          'flex cursor-pointer items-center gap-3 rounded-lg border px-4 py-3 text-left outline-none transition-colors',
          'focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50',
          estado === 'idle' && 'border-dashed border-border hover:bg-muted/40',
          estado === 'idle' && arrastrando && 'border-primary bg-primary/5',
          estado === 'analizando' && 'border-info bg-info/5',
          estado === 'listo' && 'border-success bg-success/5',
          estado === 'error' && 'border-destructive bg-destructive/5',
          bloqueado && 'cursor-not-allowed opacity-70',
        )}
      >
        <span
          aria-hidden
          className={cn(
            'grid size-9 shrink-0 place-items-center rounded-md',
            estado === 'idle' && 'bg-muted text-muted-foreground',
            estado === 'analizando' && 'bg-info/10 text-info',
            estado === 'listo' && 'bg-success/10 text-success',
            estado === 'error' && 'bg-destructive/10 text-destructive',
          )}
        >
          <Icono className={cn('size-4', estado === 'analizando' && 'animate-spin motion-reduce:animate-none')} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">{label}</p>
          <p
            id={descId}
            className={cn(
              'text-xs',
              estado === 'error' ? 'text-destructive'
                : estado === 'listo' ? 'text-success'
                : estado === 'analizando' ? 'text-info'
                : 'text-muted-foreground',
            )}
            aria-live="polite"
          >
            {mensaje || hint}
          </p>
        </div>
        <input
          ref={inputRef}
          id={inputId}
          type="file"
          accept={accept}
          multiple={multiple}
          disabled={bloqueado}
          className="sr-only"
          tabIndex={-1}
          onChange={e => {
            procesar(e.target.files)
            // Limpiar para que elegir el MISMO archivo dos veces vuelva a disparar.
            e.target.value = ''
          }}
        />
      </div>

      {preview && previews.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {previews.map(({ file, url }) => (
            <li
              key={`${file.name}-${file.size}-${file.lastModified}`}
              className="flex items-center gap-2 rounded-lg border border-border bg-card p-1.5 pr-3"
            >
              {url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={url}
                  alt={file.name}
                  className="size-12 rounded-md object-cover"
                />
              ) : (
                <span className="grid size-12 place-items-center rounded-md bg-muted text-muted-foreground">
                  <FileTextIcon className="size-5" />
                </span>
              )}
              <span className="max-w-[14rem] truncate text-xs text-muted-foreground" title={file.name}>
                {file.name}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
