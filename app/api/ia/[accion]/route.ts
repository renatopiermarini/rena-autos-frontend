import { NextRequest, NextResponse } from 'next/server'
import { backendCaido, backendConfig, proxyBackend, sinBackend } from '@/lib/backend'
import { esIaAccion } from '@/lib/ia-catalogo'
import { MAX_BYTES_ARCHIVO } from '@/lib/archivos'

/**
 * El único proxy de la IA distribuida:
 *
 *   form ──POST /api/ia/<accion>──► rena-autos-api POST /api/ia/<accion>
 *
 * `accion` se valida contra lib/ia-catalogo (404 si no está): así una ruta
 * con `../` o una acción que el backend todavía no tiene no llega a salir.
 *
 * Dos cuerpos posibles, según el Content-Type:
 *   · multipart (una cédula, un DNI frente+dorso): se RECONSTRUYE el FormData
 *     campo por campo —archivos con su nombre, textos tal cual— y se reenvía
 *     con la key. Reconstruir y no hacer pipe del stream: el tope de 10 MB se
 *     corta acá, antes de cruzar la red;
 *   · JSON (un chat pegado, una frase de agenda): passthrough por
 *     lib/backend.proxyBackend.
 *
 * La respuesta del backend vuelve tal cual (status, body): el 503 del cost
 * cap y el 422 con `detalles` los traduce lib/ia-cliente en el browser.
 */
export const dynamic = 'force-dynamic'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ accion: string }> },
) {
  const { accion } = await params
  if (!esIaAccion(accion)) {
    return NextResponse.json(
      { error: 'accion_desconocida', message: `No existe la acción de IA "${accion}".` },
      { status: 404 },
    )
  }

  const cfg = backendConfig()
  if (!cfg) return sinBackend('ia')

  const ruta = `/api/ia/${accion}`
  const contentType = (request.headers.get('content-type') ?? '').toLowerCase()

  if (!contentType.includes('multipart/form-data')) {
    const texto = await request.text().catch(() => '')
    try {
      JSON.parse(texto || 'null')
    } catch {
      return NextResponse.json(
        { error: 'json_invalido', message: 'Body inválido: no es JSON.' },
        { status: 400 },
      )
    }
    return proxyBackend(cfg, ruta, { method: 'POST', body: texto || '{}' })
  }

  let form: FormData
  try {
    form = await request.formData()
  } catch {
    return NextResponse.json(
      { error: 'multipart_invalido', message: 'No pude leer el archivo.' },
      { status: 400 },
    )
  }

  const salida = new FormData()
  let archivos = 0
  let gordo: File | null = null
  // forEach y no for...of: este tsconfig apunta a es5 y FormData no se itera
  // sin --downlevelIteration.
  form.forEach((valor, campo) => {
    if (valor instanceof File) {
      archivos += 1
      if (valor.size > MAX_BYTES_ARCHIVO) gordo = gordo ?? valor
      salida.append(campo, valor, valor.name || 'adjunto')
    } else {
      salida.append(campo, valor)
    }
  })

  if (archivos === 0) {
    return NextResponse.json(
      { error: 'archivo_faltante', message: 'Falta el archivo.' },
      { status: 400 },
    )
  }
  // Se corta acá y no allá: no tiene sentido cruzar 20 MB por la red para que
  // el backend los rechace.
  if (gordo) {
    return NextResponse.json(
      { detail: 'El archivo pesa más de 10 MB. Mandá una foto más liviana.' },
      { status: 413 },
    )
  }

  let upstream: Response
  try {
    upstream = await fetch(`${cfg.base}${ruta}`, {
      method: 'POST',
      // Sin Content-Type a mano: fetch le pone el boundary del multipart.
      headers: { 'X-API-Key': cfg.key },
      body: salida,
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
