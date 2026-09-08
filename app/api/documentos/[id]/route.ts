import { NextRequest, NextResponse } from 'next/server'
import { backendCaido, backendConfig, sinBackend } from '@/lib/backend'
import { idDocumentoValido } from '@/lib/documentos'

/**
 * Borrar un archivo de la documentación.
 *
 *   lista ──DELETE /api/documentos/<id>──► backend DELETE /api/documentos/<id> → 204
 *
 * El id se valida como entero positivo antes de salir: así ni `../` ni un
 * `descargar` de más llegan a componer una ruta rara del otro lado.
 */
export const dynamic = 'force-dynamic'

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const n = idDocumentoValido(id)
  if (n === null) {
    return NextResponse.json({ error: 'id_invalido', message: 'El id del documento no es válido.' }, { status: 400 })
  }
  const cfg = backendConfig()
  if (!cfg) return sinBackend('documentos')

  let upstream: Response
  try {
    upstream = await fetch(`${cfg.base}/api/documentos/${n}`, {
      method: 'DELETE',
      headers: { 'X-API-Key': cfg.key },
      cache: 'no-store',
    })
  } catch (e) {
    return backendCaido(e)
  }

  if (upstream.status === 204) return new NextResponse(null, { status: 204 })
  const texto = await upstream.text().catch(() => '')
  return new NextResponse(texto, {
    status: upstream.status,
    headers: {
      'Content-Type': upstream.headers.get('content-type') ?? 'application/json',
      'Cache-Control': 'no-store',
    },
  })
}
