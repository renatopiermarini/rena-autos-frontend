import { NextRequest, NextResponse } from 'next/server'
import { backendCaido, backendConfig, sinBackend } from '@/lib/backend'
import { idDocumentoValido } from '@/lib/documentos'

/**
 * Ver / bajar un archivo de la documentación.
 *
 *   <a href="/api/documentos/<id>/descargar" target="_blank">
 *     ──GET──► backend GET /api/documentos/<id>/descargar (bytes)
 *
 * Los bytes se hacen STREAM tal cual (no se cargan en memoria: un título
 * escaneado puede pesar 10 MB) con el Content-Type y el Content-Disposition
 * del backend — el browser abre el PDF/la foto en la pestaña o lo baja con su
 * nombre real. Sin cache: el archivo puede borrarse y el link no debe seguir
 * "funcionando" desde el disco del browser.
 */
export const dynamic = 'force-dynamic'

export async function GET(
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
    upstream = await fetch(`${cfg.base}/api/documentos/${n}/descargar`, {
      headers: { 'X-API-Key': cfg.key },
      cache: 'no-store',
    })
  } catch (e) {
    return backendCaido(e)
  }

  if (!upstream.ok) {
    const texto = await upstream.text().catch(() => '')
    return new NextResponse(texto, {
      status: upstream.status,
      headers: {
        'Content-Type': upstream.headers.get('content-type') ?? 'application/json',
        'Cache-Control': 'no-store',
      },
    })
  }

  const headers: Record<string, string> = {
    'Content-Type': upstream.headers.get('content-type') ?? 'application/octet-stream',
    'Content-Disposition': upstream.headers.get('content-disposition') ?? 'inline',
    'Cache-Control': 'no-store',
  }
  const largo = upstream.headers.get('content-length')
  if (largo) headers['Content-Length'] = largo
  return new NextResponse(upstream.body, { status: 200, headers })
}
