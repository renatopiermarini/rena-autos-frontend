import { NextRequest, NextResponse } from 'next/server'
import { backendCaido, backendConfig, sinBackend } from '@/lib/backend'

/**
 * Sube un adjunto del chat (foto de una cédula, PDF de un boleto).
 *
 *   /chat ──POST /api/chat/media (multipart)──► rena-autos-api POST /api/chat/media
 *
 * Dos pasos y no un multipart en /enviar, igual que el backend: subir puede
 * fallar por tipo o tamaño, y ese fallo tiene que ocurrir ANTES de que exista
 * una fila en el hilo y antes de gastar un turno del agente.
 *
 * El multipart se reenvía RECONSTRUIDO (no se hace pipe del stream): así el
 * nombre del campo es siempre `archivo`, que es el que el backend espera, sin
 * depender de cómo lo haya armado el browser.
 */
export const dynamic = 'force-dynamic'

/** El mismo techo que el backend (utils/chat_media.MAX_BYTES). */
const MAX_BYTES = 10 * 1024 * 1024

export async function POST(request: NextRequest) {
  const cfg = backendConfig()
  if (!cfg) return sinBackend('chat')

  let form: FormData
  try {
    form = await request.formData()
  } catch {
    return NextResponse.json(
      { error: 'multipart_invalido', message: 'No pude leer el archivo.' },
      { status: 400 },
    )
  }

  const archivo = form.get('archivo')
  if (!(archivo instanceof File)) {
    return NextResponse.json(
      { error: 'archivo_faltante', message: 'Falta el archivo.' },
      { status: 400 },
    )
  }
  // Se corta acá y no allá: no tiene sentido cruzar 20MB por la red para que el
  // backend los rechace.
  if (archivo.size > MAX_BYTES) {
    return NextResponse.json(
      { detail: 'El archivo pesa más de 10MB. Mandá una foto más liviana.' },
      { status: 413 },
    )
  }

  const salida = new FormData()
  salida.append('archivo', archivo, archivo.name || 'adjunto')

  let upstream: Response
  try {
    upstream = await fetch(`${cfg.base}/api/chat/media`, {
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
