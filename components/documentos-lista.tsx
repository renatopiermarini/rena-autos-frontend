'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { ExternalLinkIcon, Trash2Icon } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Th, Td, tdCls } from '@/components/table-cells'
import { fmtDMY } from '@/lib/date'
import {
  origenLabel, tamanioLegible, tipoDocumentoLabel, type DocumentoMeta,
} from '@/lib/documentos'
import { cn } from '@/lib/utils'

/**
 * Los archivos guardados de un auto (vista `documentos_meta`), en la tab
 * Documentación de la ficha y en el acordeón de /documentacion.
 *
 * Ver/Descargar es un <a> al proxy de bytes (app/api/documentos/[id]/descargar)
 * en otra pestaña: el browser abre el PDF o la foto solo, sin JS. Eliminar
 * pregunta con el confirm nativo — es un borrado de verdad, no hay papelera —
 * y refresca la página (router.refresh) para que la lista salga de la DB.
 */

const ORIGEN_VARIANT: Record<string, 'info' | 'secondary' | 'success' | 'outline'> = {
  dashboard: 'secondary',
  whatsapp: 'info',
  generado: 'success',
  claude: 'outline',
}

export function DocumentosLista({
  documentos, onCambio, vacio = 'Sin archivos todavía.', className,
}: {
  documentos: DocumentoMeta[]
  /** Después de borrar (además del router.refresh). */
  onCambio?: () => void
  vacio?: string
  className?: string
}) {
  const router = useRouter()
  const [borrando, setBorrando] = useState<number | null>(null)

  async function eliminar(d: DocumentoMeta) {
    if (borrando) return
    if (!window.confirm(`¿Eliminar "${d.nombre}"? No se puede deshacer.`)) return
    setBorrando(d.id)
    let res: Response
    try {
      res = await fetch(`/api/documentos/${d.id}`, { method: 'DELETE' })
    } catch {
      setBorrando(null)
      toast.error('Sin conexión. Revisá la red y probá de nuevo.')
      return
    }
    setBorrando(null)
    if (!res.ok && res.status !== 204) {
      const json = await res.json().catch(() => ({} as any))
      toast.error(
        (typeof json?.detail === 'string' && json.detail) || json?.message || 'No se pudo eliminar el archivo.',
      )
      return
    }
    toast.success('Archivo eliminado')
    onCambio?.()
    router.refresh()
  }

  if (documentos.length === 0) {
    return <p className={cn('text-sm text-muted-foreground', className)}>{vacio}</p>
  }

  return (
    <div className={cn('overflow-x-auto rounded-lg border border-border', className)}>
      <table className="w-full text-[13px]">
        <thead>
          <tr className="border-b border-border">
            <Th>Tipo</Th>
            <Th>Archivo</Th>
            <Th right>Tamaño</Th>
            <Th>Fecha</Th>
            <Th>Origen</Th>
            <Th className="sr-only">Acciones</Th>
          </tr>
        </thead>
        <tbody>
          {documentos.map(d => (
            <tr key={d.id} className="border-b border-border last:border-b-0">
              <Td className="whitespace-nowrap font-medium">{tipoDocumentoLabel(d.tipo)}</Td>
              <Td className="max-w-[18rem] truncate text-muted-foreground" title={d.nombre}>{d.nombre}</Td>
              <td className={cn(tdCls, 'whitespace-nowrap text-right font-mono tabular-nums text-muted-foreground')}>
                {tamanioLegible(d.tamanio)}
              </td>
              <Td className="whitespace-nowrap font-mono tabular-nums text-muted-foreground">{fmtDMY(d.created_at)}</Td>
              <Td>
                <Badge variant={ORIGEN_VARIANT[d.origen] ?? 'outline'} className="text-2xs">
                  {origenLabel(d.origen)}
                </Badge>
              </Td>
              <Td className="whitespace-nowrap text-right">
                <a
                  href={`/api/documentos/${d.id}/descargar`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-primary underline-offset-2 hover:underline"
                >
                  Ver / Descargar <ExternalLinkIcon aria-hidden className="size-3" />
                </a>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  className="ml-2 text-muted-foreground hover:text-destructive"
                  aria-label={`Eliminar ${d.nombre}`}
                  disabled={borrando === d.id}
                  onClick={() => eliminar(d)}
                >
                  <Trash2Icon />
                </Button>
              </Td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
