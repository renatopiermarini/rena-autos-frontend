import { NextRequest, NextResponse } from 'next/server'
import { backendCaido, backendConfig, sinBackend } from '@/lib/backend'
import { MAX_BYTES_ARCHIVO } from '@/lib/archivos'

/**
 * Subir un papel (foto o PDF) a la documentación de un auto.
 *
 *   ficha/Documentación ──POST /api/documentos/subir──► backend POST /api/documentos/subir
 *
 * Multipart RECONSTRUIDO campo por campo (`archivo` con su nombre; vehicle_id,
 * cliente_id, tipo, clasificar, tildar como texto) y reenviado con la key —
 * mismo patrón que app/api/ia/[accion]/route.ts. Reconstruir y no hacer pipe
 * del stream: el tope de 10 MB se corta acá, antes de cruzar la red.
 *
 * La respuesta vuelve tal cual: 201 `{documento, sugerencia?, advertencia?}`,
 * 422 del clasificador, 501 si la instancia del backend no está en Postgres.
 */
export const dynamic = 'force-dynamic'

const RUTA_BACKEND = '/api/documentos/subir'

export async function POST(request: NextRequest) {
  const cfg = backendConfig()
  if (!cfg) return sinBackend('documentos')

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
  let archivo: File | null = null
  // forEach y no for...of: este tsconfig apunta a es5 y FormData no se itera
  // sin --downlevelIteration.
  form.forEach((valor, campo) => {
    if (valor instanceof File) {
      if (campo === 'archivo') archivo = archivo ?? valor
      salida.append(campo, valor, valor.name || 'adjunto')
    } else {
      salida.append(campo, valor)
    }
  })

  if (!archivo) {
    return NextResponse.json(
      { error: 'archivo_faltante', message: 'Falta el archivo.' },
      { status: 400 },
    )
  }
  if ((archivo as File).size > MAX_BYTES_ARCHIVO) {
    return NextResponse.json(
      { detail: 'El archivo pesa más de 10 MB. Mandá una foto más liviana.' },
      { status: 413 },
    )
  }

  let upstream: Response
  try {
    upstream = await fetch(`${cfg.base}${RUTA_BACKEND}`, {
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
