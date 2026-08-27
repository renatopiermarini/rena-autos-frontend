import { NextRequest, NextResponse } from 'next/server'

/**
 * Proxy al generador de contratos del backend.
 *
 *   dashboard ──POST /api/documentos──► rena-autos-api POST /api/documentos/generar
 *                                       (header X-API-Key: BACKEND_API_KEY)
 *
 * POR QUÉ EXISTE ESTA ROUTE y el diálogo no le pega derecho al backend: la
 * API key. `BACKEND_API_KEY` es la misma clave que abre TODO el REST del bot
 * (`_require_api_key`, la misma de /message); si viajara al browser —como
 * variable NEXT_PUBLIC_, en un fetch del cliente o en el HTML— quedaría a la
 * vista de cualquiera que abra el inspector. Acá vive server-side y el browser
 * sólo ve su propio origen.
 *
 * Auth: el middleware de sesión cubre todo menos /login y /api/login, así que
 * esta route está detrás de la cookie igual que /api/db.
 *
 * FEATURE OPCIONAL: la instancia que no tenga las dos env (BACKEND_URL y
 * BACKEND_API_KEY) responde 501 `documentos_no_configurado` — no 500, no un
 * fetch a `undefined/api/...`. El botón que la dispara ni siquiera se dibuja
 * (app/stock/page.tsx mira las mismas dos variables), así que este 501 es el
 * cinturón: sólo lo ve quien postee a mano.
 *
 * El cuerpo del 200 es BINARIO (pdf o docx) y se devuelve tal cual, con su
 * Content-Type y su Content-Disposition — el nombre del archivo lo arma el
 * backend ("Recibo de Seña - Pérez - AB123CD.pdf") y no hay razón para
 * reinventarlo acá. Los errores del backend se pasan tal cual: sus 422 llevan
 * la lista de faltantes que el diálogo traduce (lib/documentos.ts).
 */

// Nada de esto se cachea: es una escritura de documento, no una lectura.
export const dynamic = 'force-dynamic'

const RUTA_BACKEND = '/api/documentos/generar'

function config(): { base: string; key: string } | null {
  const base = (process.env.BACKEND_URL ?? '').trim().replace(/\/+$/, '')
  const key = (process.env.BACKEND_API_KEY ?? '').trim()
  if (!base || !key) return null
  return { base, key }
}

export async function POST(request: NextRequest) {
  const cfg = config()
  if (!cfg) {
    return NextResponse.json(
      {
        error: 'documentos_no_configurado',
        message: 'Esta instancia no tiene configurado el backend de documentos (BACKEND_URL / BACKEND_API_KEY).',
      },
      { status: 501 },
    )
  }

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
    return NextResponse.json(
      {
        error: 'backend_inalcanzable',
        message: e instanceof Error ? e.message : String(e),
      },
      { status: 502 },
    )
  }

  // Error del backend: passthrough textual con SU status y SU content-type. El
  // 422 trae `{detail:{error, faltantes|detalles}}` y el diálogo lo traduce.
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
  return new NextResponse(archivo, {
    status: 200,
    headers: {
      'Content-Type': upstream.headers.get('content-type') ?? 'application/octet-stream',
      // Sin esto el browser no sabe cómo se llama el archivo que acaba de bajar.
      'Content-Disposition': upstream.headers.get('content-disposition') ?? 'attachment',
      'Cache-Control': 'no-store',
    },
  })
}
