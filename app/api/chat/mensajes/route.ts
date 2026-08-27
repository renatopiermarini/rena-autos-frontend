import { NextRequest } from 'next/server'
import { backendConfig, proxyBackend, sinBackend } from '@/lib/backend'

/**
 * El historial del chat, para el polling cada 2,5 s.
 *
 *   /chat ──GET /api/chat/mensajes?after_id=&limit=──► rena-autos-api
 *
 * `after_id` es incremental: cada poll pide sólo lo que no vio. El backend NO
 * exige que el chat esté habilitado para esta ruta a propósito — leer el hilo
 * que ya existe es correcto aunque la instancia se haya quedado sin key.
 */
export const dynamic = 'force-dynamic'

/** Techo del `limit`: espeja el default del backend y frena un ?limit=99999. */
const LIMIT_MAX = 200

function entero(valor: string | null, def: number, max: number): number {
  const n = Number(valor)
  if (!Number.isFinite(n) || n < 0) return def
  return Math.min(Math.floor(n), max)
}

export async function GET(request: NextRequest) {
  const cfg = backendConfig()
  if (!cfg) return sinBackend('chat')

  const q = request.nextUrl.searchParams
  const afterId = entero(q.get('after_id'), 0, Number.MAX_SAFE_INTEGER)
  const limit = entero(q.get('limit'), 100, LIMIT_MAX) || 100

  return proxyBackend(cfg, `/api/chat/mensajes?after_id=${afterId}&limit=${limit}`)
}
