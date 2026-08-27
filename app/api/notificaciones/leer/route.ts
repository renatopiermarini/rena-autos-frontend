import { NextRequest, NextResponse } from 'next/server'
import { backendConfig, proxyBackend, sinBackend } from '@/lib/backend'

/**
 * "Marcar leídas": da por vistos los avisos con id <= `hasta_id`.
 *
 * Por rango y no por fila porque así se usa la campana: se abre y se da por
 * visto lo que estaba. `hasta_id` es el id más alto que la lista llegó a PINTAR
 * (lib/chat.hastaIdVisible), así que un aviso que entró mientras el popover
 * estaba abierto no se marca leído sin que nadie lo haya visto.
 */
export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  const cfg = backendConfig()
  if (!cfg) return sinBackend('notificaciones')

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json(
      { error: 'json_invalido', message: 'Body inválido: no es JSON.' },
      { status: 400 },
    )
  }

  const hastaId = Number((body as Record<string, unknown> | null)?.hasta_id)
  if (!Number.isFinite(hastaId) || hastaId <= 0) {
    return NextResponse.json(
      { error: 'hasta_id_invalido', message: 'hasta_id debe ser > 0.' },
      { status: 400 },
    )
  }

  return proxyBackend(cfg, '/api/notificaciones/leer', {
    method: 'POST',
    body: JSON.stringify({ hasta_id: Math.floor(hastaId) }),
  })
}
