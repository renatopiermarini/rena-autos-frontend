/**
 * El fetch a `/api/ia/<accion>` desde el browser, con los errores ya en criollo.
 *
 * Client-only (usa fetch y FormData del browser). La lógica de aplicar lo que
 * vuelve al formulario vive en lib/ia.ts, que es pura; esto es sólo el cable.
 *
 * Los errores se traducen ACÁ y no en el proxy (que hace passthrough, ver
 * lib/backend.proxyBackend) porque el proxy no sabe qué formulario preguntó y
 * el mensaje tiene que servirle a quien está mirando el dropzone.
 */
import type { IaAccion } from '@/lib/ia-catalogo'

export type IaResultado<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; status: number }

/** Lo que el backend/proxy puede haber puesto en el body de un error. */
type BodyError = {
  detail?: unknown
  message?: unknown
  error?: unknown
}

function textoDe(v: unknown): string {
  return typeof v === 'string' && v.trim() ? v.trim() : ''
}

/**
 * Status + body de error → una línea (o varias) en criollo.
 *
 *   501 → esta instancia no tiene backend (BACKEND_URL / BACKEND_API_KEY);
 *   503 → passthrough: es el cost cap, y el backend dice cuándo se reanuda;
 *   502 → el backend no contesta (dormido, caído, sin red);
 *   422 → la IA devolvió algo que no valida: lista de `detalles`;
 *   413 → el archivo supera 10 MB;
 *   400 → formato no soportado;
 *   401/403 → la key está mal.
 */
export function traducirErrorIa(status: number, body: BodyError | null | undefined): string {
  const detail = body?.detail
  const detailObj = detail && typeof detail === 'object' ? (detail as Record<string, unknown>) : null
  const detailTexto = textoDe(detail) || textoDe(detailObj?.error) || textoDe(detailObj?.message)
  const mensaje = textoDe(body?.message)

  switch (status) {
    case 501:
      return 'Esta instancia no tiene backend: la IA no está disponible.'
    case 503:
      return detailTexto || mensaje || 'La IA está pausada por ahora. Probá más tarde.'
    case 502:
      return 'El backend no contesta. Probá de nuevo en un rato.'
    case 422: {
      const detalles = Array.isArray(detailObj?.detalles)
        ? (detailObj!.detalles as unknown[]).map(textoDe).filter(Boolean)
        : []
      const cabecera = detailTexto || 'La IA no pudo leer bien el documento.'
      return detalles.length ? `${cabecera}\n${detalles.map(d => `· ${d}`).join('\n')}` : cabecera
    }
    case 413:
      return 'El archivo supera 10 MB. Sacá la foto con menos calidad o mandá un PDF más liviano.'
    case 400:
      return detailTexto || mensaje || 'Formato no soportado (JPG, PNG, WebP o PDF).'
    case 401:
    case 403:
      return 'El backend rechazó la clave de acceso. Avisá que hay que revisar BACKEND_API_KEY.'
    default:
      return detailTexto || mensaje || textoDe(body?.error) || `La IA falló (error ${status}).`
  }
}

/**
 * POST a la acción. `body` puede ser un FormData (archivos: se manda tal cual,
 * el browser pone el boundary) o un objeto (se manda como JSON).
 *
 * Nunca lanza: todo error (red incluida) vuelve como `{ok: false}` con un
 * texto para mostrar.
 */
export async function postIa<T>(accion: IaAccion, body: FormData | object): Promise<IaResultado<T>> {
  const esForm = typeof FormData !== 'undefined' && body instanceof FormData
  let res: Response
  try {
    res = await fetch(`/api/ia/${accion}`, {
      method: 'POST',
      headers: esForm ? undefined : { 'Content-Type': 'application/json' },
      body: esForm ? body : JSON.stringify(body),
      cache: 'no-store',
    })
  } catch {
    return { ok: false, error: 'Sin conexión. Revisá la red y probá de nuevo.', status: 0 }
  }

  const json = await res.json().catch(() => null)
  if (!res.ok) return { ok: false, error: traducirErrorIa(res.status, json), status: res.status }
  return { ok: true, data: json as T }
}
