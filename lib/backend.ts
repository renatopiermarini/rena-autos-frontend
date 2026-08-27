/**
 * El puente server-side al backend del bot (rena-autos-api).
 *
 * POR QUÉ EXISTE: `BACKEND_API_KEY` es la clave que abre TODO el REST del bot.
 * Si viajara al browser —como NEXT_PUBLIC_, en un fetch del cliente o incrustada
 * en el HTML— quedaría a la vista de cualquiera que abra el inspector. Así que
 * el browser le habla a su propio origen (`/api/chat/...`) y estas rutas de Next
 * son las únicas que conocen la key.
 *
 * Es la misma política que ya aplicaba app/api/documentos/route.ts; esto la
 * factoriza porque el chat y la campana suman seis rutas más.
 *
 * Auth: el middleware de sesión cubre todo menos /login y /api/login, así que
 * estas rutas están detrás de la cookie del dashboard igual que /api/db.
 *
 * FEATURE OPCIONAL: la instancia sin las dos env responde 501 y ni siquiera
 * intenta el fetch. El nav no dibuja el ítem "Chat" ni la campana (mismo gate,
 * leído en el layout), así que el 501 es el cinturón: sólo lo ve quien postee
 * a mano.
 */
import { NextResponse } from 'next/server'

export type BackendConfig = { base: string; key: string }

/** Las dos env, normalizadas. `null` si falta cualquiera de las dos. */
export function backendConfig(): BackendConfig | null {
  const base = (process.env.BACKEND_URL ?? '').trim().replace(/\/+$/, '')
  const key = (process.env.BACKEND_API_KEY ?? '').trim()
  if (!base || !key) return null
  return { base, key }
}

/**
 * ¿Esta instancia tiene backend? Lo llaman los server components (el layout,
 * la page de /chat) para decidir si la pantalla existe. NO puede llamarse desde
 * un client component: ahí `process.env.BACKEND_URL` es `undefined`.
 */
export function backendHabilitado(): boolean {
  return backendConfig() !== null
}

/**
 * El 501 de "esta instancia no tiene esta función". No es un error: es un no.
 *
 * `slug` nombra la función en el código de error ("chat_no_configurado") y en
 * la explicación. Casi nadie lo ve: el nav no dibuja lo que no está.
 */
export function sinBackend(slug: string): NextResponse {
  return NextResponse.json(
    {
      error: `${slug}_no_configurado`,
      message: `Esta instancia no tiene configurado el backend del bot (BACKEND_URL / BACKEND_API_KEY), así que "${slug}" no está disponible.`,
    },
    { status: 501 },
  )
}

/** El 502 de "el backend no contesta" (dormido, caído, sin red). */
export function backendCaido(e: unknown): NextResponse {
  return NextResponse.json(
    {
      error: 'backend_inalcanzable',
      message: e instanceof Error ? e.message : String(e),
    },
    { status: 502 },
  )
}

/**
 * Reenvía al backend y devuelve SU respuesta tal cual: mismo status, mismo
 * body, mismo content-type.
 *
 * El passthrough textual no es pereza: los errores del backend traen `detail`
 * en criollo (el 503 del chat sin ANTHROPIC_API_KEY explica exactamente qué
 * falta) y traducirlos acá sería perder esa información o mentirla.
 *
 * Lo único que NO se copia son las cabeceras de la request original: la API key
 * se pone acá y la cookie del dashboard no tiene nada que hacer del otro lado.
 */
export async function proxyBackend(
  cfg: BackendConfig,
  ruta: string,
  init: { method?: string; body?: string } = {},
): Promise<NextResponse> {
  let upstream: Response
  try {
    upstream = await fetch(`${cfg.base}${ruta}`, {
      method: init.method ?? 'GET',
      headers: {
        'X-API-Key': cfg.key,
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: init.body,
      cache: 'no-store',
    })
  } catch (e) {
    return backendCaido(e)
  }

  const texto = await upstream.text().catch(() => '')
  return new NextResponse(texto, {
    status: upstream.status,
    headers: {
      'Content-Type': upstream.headers.get('content-type') ?? 'application/json',
      'Cache-Control': 'no-store',
    },
  })
}
