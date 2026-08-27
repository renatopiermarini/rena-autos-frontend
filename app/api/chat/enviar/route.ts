import { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { backendConfig, proxyBackend, sinBackend } from '@/lib/backend'

/**
 * Manda un mensaje al bot.
 *
 *   /chat ──POST /api/chat/enviar──► rena-autos-api POST /api/chat/enviar
 *                                    (header X-API-Key: BACKEND_API_KEY)
 *
 * El backend contesta AL TOQUE con `{id, turn_ref, estado:"pendiente"}` — el
 * turno del agente corre atrás y puede tardar de 10 a 120 segundos. Quien
 * espera la respuesta es el polling de /api/chat/mensajes, no este POST.
 *
 * Los errores se pasan tal cual: el 503 sin ANTHROPIC_API_KEY trae un `detail`
 * que la pantalla muestra palabra por palabra.
 */
export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  const cfg = backendConfig()
  if (!cfg) return sinBackend('chat')

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json(
      { error: 'json_invalido', message: 'Body inválido: no es JSON.' },
      { status: 400 },
    )
  }

  // Sólo los tres campos del contrato. No se reenvía el body crudo: lo que el
  // browser mande de más no tiene por qué llegar al backend.
  const b = (body ?? {}) as Record<string, unknown>
  const payload = {
    texto: typeof b.texto === 'string' ? b.texto : '',
    media_ref: typeof b.media_ref === 'string' ? b.media_ref : '',
    media_nombre: typeof b.media_nombre === 'string' ? b.media_nombre : '',
  }

  return proxyBackend(cfg, '/api/chat/enviar', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}
