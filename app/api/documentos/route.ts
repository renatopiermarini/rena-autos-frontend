import { NextRequest, NextResponse } from 'next/server'
import { backendCaido, backendConfig, sinBackend } from '@/lib/backend'

/**
 * Proxy al generador de contratos del backend.
 *
 *   dashboard ──POST /api/documentos──► rena-autos-api POST /api/documentos/generar
 *                                       (header X-API-Key: BACKEND_API_KEY)
 *
 * POR QUÉ EXISTE ESTA ROUTE y la pantalla no le pega derecho al backend: la
 * API key. `BACKEND_API_KEY` es la misma clave que abre TODO el REST del bot;
 * si viajara al browser quedaría a la vista de cualquiera que abra el
 * inspector. Acá vive server-side (lib/backend.ts) y el browser sólo ve su
 * propio origen.
 *
 * Auth: el middleware de sesión cubre todo menos /login y /api/login, así que
 * esta route está detrás de la cookie igual que /api/db.
 *
 * FEATURE OPCIONAL: la instancia sin las dos env responde 501
 * `documentos_no_configurado` — no 500, no un fetch a `undefined/api/...`. La
 * sección /documentos ni siquiera se dibuja sin backend (app/documentos/page.tsx
 * mira las mismas dos variables), así que este 501 es el cinturón.
 *
 * El body pasa TAL CUAL (incluido `guardar`, que le dice al backend que
 * persista el archivo en `documentos` con origen 'generado'). El 200 es
 * BINARIO (pdf o docx) y se devuelve con su Content-Type, su
 * Content-Disposition (el nombre lo arma el backend: "Recibo de Seña - Pérez -
 * AB123CD.pdf") y el `X-Documento-Id` del archivo guardado, si lo hubo. Los
 * errores del backend pasan tal cual: sus 422 llevan la lista de faltantes que
 * la pantalla traduce (lib/documentos.ts).
 */

// Nada de esto se cachea: es una escritura de documento, no una lectura.
export const dynamic = 'force-dynamic'

const RUTA_BACKEND = '/api/documentos/generar'

export async function POST(request: NextRequest) {
  const cfg = backendConfig()
  if (!cfg) return sinBackend('documentos')

  let body: any
  try {
    body = await request.json()
  } catch {
    return NextResponse.json(
      { error: 'json_invalido', message: 'Body inválido: no es JSON.' },
      { status: 400 },
    )
  }

  let upstream: Response
  try {
    upstream = await fetch(`${cfg.base}${RUTA_BACKEND}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-Key': cfg.key },
      body: JSON.stringify(body),
      cache: 'no-store',
    })
  } catch (e) {
    // El backend puede estar dormido/caído: se dice, no se rompe.
    return backendCaido(e)
  }

  // Error del backend: passthrough textual con SU status y SU content-type. El
  // 422 trae `{detail:{error, faltantes|detalles}}` y la pantalla lo traduce.
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

  const archivo = await upstream.arrayBuffer()
  const headers: Record<string, string> = {
    'Content-Type': upstream.headers.get('content-type') ?? 'application/octet-stream',
    // Sin esto el browser no sabe cómo se llama el archivo que acaba de bajar.
    'Content-Disposition': upstream.headers.get('content-disposition') ?? 'attachment',
    'Cache-Control': 'no-store',
  }
  const docId = upstream.headers.get('x-documento-id')
  if (docId) headers['X-Documento-Id'] = docId
  return new NextResponse(archivo, { status: 200, headers })
}
