import { NextRequest, NextResponse } from 'next/server'
import { backendConfig, proxyBackend, sinBackend } from '@/lib/backend'

/**
 * "¿Se puede generar este documento?" sin generarlo.
 *
 *   /documentos ──POST /api/documentos/preparar──► backend POST /api/documentos/preparar
 *
 * Mismo body que generar; el backend contesta 200 `{ok, faltantes, detalles}`
 * (la misma forma que sus 422) y la pantalla lo traduce en vivo mientras el
 * usuario elige auto y cliente. Es de sólo lectura: no persiste nada.
 */
export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  const cfg = backendConfig()
  if (!cfg) return sinBackend('documentos')

  const texto = await request.text().catch(() => '')
  try {
    JSON.parse(texto || 'null')
  } catch {
    return NextResponse.json(
      { error: 'json_invalido', message: 'Body inválido: no es JSON.' },
      { status: 400 },
    )
  }
  return proxyBackend(cfg, '/api/documentos/preparar', { method: 'POST', body: texto || '{}' })
}
