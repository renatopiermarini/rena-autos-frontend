'use client'
import { useCallback, useState } from 'react'
import { toast } from 'sonner'
import { Dropzone, type DropzoneEstado } from '@/components/ui/dropzone'
import { comprimirImagen } from '@/lib/imagenes'
import { postIa } from '@/lib/ia-cliente'
import type { IaAccion } from '@/lib/ia-catalogo'

/**
 * El Dropzone ya cableado a una acción de IA: comprime, sube, y le entrega el
 * JSON al formulario. Cada form sólo decide qué hacer con la respuesta
 * (lib/ia-formularios → lib/ia.aplicarSugerencia).
 *
 * `campos` nombra los archivos del multipart en el orden en que se sueltan:
 * `['archivo']` para una cédula, `['frente', 'dorso']` para un DNI (con dos
 * campos el dropzone acepta varios archivos). Un solo archivo con dos campos
 * es válido: el backend lee el frente solo.
 *
 * Errores: inline en rojo (el propio dropzone) y un toast, en criollo
 * (lib/ia-cliente.traducirErrorIa). Un 422 con varias líneas se lista abajo.
 */
export function IaDropzone<T>({
  accion,
  campos = ['archivo'],
  label,
  hint,
  onResultado,
  disabled,
  className,
}: {
  accion: IaAccion
  campos?: string[]
  label: string
  hint?: string
  onResultado: (data: T) => void
  disabled?: boolean
  className?: string
}) {
  const [estado, setEstado] = useState<DropzoneEstado>('idle')
  const [mensaje, setMensaje] = useState('')
  const [detalles, setDetalles] = useState<string[]>([])

  const onArchivos = useCallback(async (files: File[]) => {
    setEstado('analizando')
    setDetalles([])
    setMensaje(files.length > 1 ? 'Leyendo frente y dorso…' : 'Leyendo el documento…')

    const fd = new FormData()
    for (let i = 0; i < files.length && i < campos.length; i++) {
      const f = await comprimirImagen(files[i])
      fd.append(campos[i], f, f.name)
    }
    const r = await postIa<T>(accion, fd)
    if (!r.ok) {
      const [cabecera, ...resto] = r.error.split('\n')
      setEstado('error')
      setMensaje(cabecera)
      setDetalles(resto.filter(Boolean))
      toast.error(cabecera)
      return
    }
    setEstado('listo')
    setMensaje('Listo: revisá los campos marcados antes de guardar.')
    onResultado(r.data)
  }, [accion, campos, onResultado])

  const onError = useCallback((m: string) => {
    setEstado('error')
    setMensaje(m)
    setDetalles([])
  }, [])

  return (
    <div className={className}>
      <Dropzone
        label={label}
        hint={hint}
        multiple={campos.length > 1}
        estado={estado}
        mensaje={mensaje || undefined}
        onArchivos={onArchivos}
        onError={onError}
        disabled={disabled}
      />
      {detalles.length > 0 && (
        <ul className="mt-1.5 space-y-0.5 text-xs text-destructive">
          {detalles.map((d, i) => <li key={`${i}-${d}`}>{d}</li>)}
        </ul>
      )}
    </div>
  )
}
