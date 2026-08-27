import { NextRequest } from 'next/server'
import { backendConfig, proxyBackend, sinBackend } from '@/lib/backend'

/**
 * La campana: los avisos del negocio y el número del globito rojo.
 *
 *   header ──GET /api/notificaciones?...──► rena-autos-api GET /api/notificaciones
 *
 * Las filas las escribe el bot (`utils/avisos.avisar()`): recordatorios de
 * tareas, alertas de caja, nudges. Del lado del backend esta ruta NO depende de
 * que el chat ni el bot estén encendidos — la campana existe en las tres
 * configuraciones, y en la instancia sin bot es el ÚNICO lugar donde un aviso
 * proactivo aparece.
 */
export const dynamic = 'force-dynamic'

const LIMIT_MAX = 100

function entero(valor: string | null, def: number, max: number): number {
  const n = Number(valor)
  if (!Number.isFinite(n) || n < 0) return def
  return Math.min(Math.floor(n), max)
}

export async function GET(request: NextRequest) {
  const cfg = backendConfig()
  if (!cfg) return sinBackend('notificaciones')

  const q = request.nextUrl.searchParams
  const afterId = entero(q.get('after_id'), 0, Number.MAX_SAFE_INTEGER)
  const limit = entero(q.get('limit'), 20, LIMIT_MAX) || 20
  const soloNoLeidas = q.get('solo_no_leidas') === 'true'

  return proxyBackend(
    cfg,
    `/api/notificaciones?after_id=${afterId}&limit=${limit}&solo_no_leidas=${soloNoLeidas}`,
  )
}
