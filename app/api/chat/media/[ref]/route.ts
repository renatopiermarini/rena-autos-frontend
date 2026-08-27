import { NextRequest, NextResponse } from 'next/server'
import { backendCaido, backendConfig, sinBackend } from '@/lib/backend'

/**
 * Sirve los bytes de un adjunto del chat, re-streameados desde el backend.
 *
 *   <img src="/api/chat/media/abc123"> ──► rena-autos-api GET /api/chat/media/abc123
 *
 * El backend protege esta ruta con la MISMA API key que el resto del REST (a
 * diferencia de /media/contratos, que es público porque el link se lo manda a
 * Meta). Como la key no puede bajar al browser, un `<img>` no puede pegarle
 * derecho: tiene que pasar por acá.
 *
 * Se conservan las cabeceras de privacidad del backend (`no-store`, `noindex`):
 * un adjunto de chat es la foto de un DNI o el PDF de un boleto — nada de cachés
 * intermedias ni de índices.
 */
export const dynamic = 'force-dynamic'

/** Sólo el alfabeto de las refs que genera el backend. Corta cualquier `../`. */
const REF_RE = /^[A-Za-z0-9._-]{1,128}$/

const CABECERAS_PRIVADAS = {
  'Cache-Control': 'no-store, no-cache, must-revalidate, private',
  'Pragma': 'no-cache',
  'X-Robots-Tag': 'noindex, nofollow, noarchive, nosnippet',
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ ref: string }> },
) {
  const cfg = backendConfig()
  if (!cfg) return sinBackend('chat')

  const { ref } = await params
  if (!REF_RE.test(ref ?? '')) {
    return NextResponse.json({ error: 'ref_invalida' }, { status: 400 })
  }

  let upstream: Response
  try {
    upstream = await fetch(`${cfg.base}/api/chat/media/${encodeURIComponent(ref)}`, {
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
        ...CABECERAS_PRIVADAS,
      },
    })
  }

  const bytes = await upstream.arrayBuffer()
  return new NextResponse(bytes, {
    status: 200,
    headers: {
      'Content-Type': upstream.headers.get('content-type') ?? 'application/octet-stream',
      ...CABECERAS_PRIVADAS,
    },
  })
}
