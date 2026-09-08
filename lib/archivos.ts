/**
 * Qué archivo se puede subir a la IA (una cédula, un DNI, un PDF de informe) y
 * cómo se muestra: los mismos tipos y el mismo techo que el backend
 * (rena-autos-api utils/chat_media), validados ACÁ para que el rechazo sea
 * instantáneo y no después de subir 9MB por la red.
 *
 * Módulo PURO (sin Next, sin fetch, sin DOM): lo usan el Dropzone
 * (components/ui/dropzone.tsx), los proxies de /api/ia y los tests.
 */

/** El mismo techo que el backend (utils/chat_media.MAX_BYTES). */
export const MAX_BYTES_ARCHIVO = 10 * 1024 * 1024

/** Los mismos tipos que acepta el backend (utils/chat_media). */
export const MIMES_ACEPTADOS = [
  'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'application/pdf',
] as const

/** El `accept` del <input type="file">. */
export const ACCEPT_ARCHIVO = 'image/*,application/pdf'

// Fallback por extensión: en Android una foto HEIC llega con `type: ""` y un
// PDF de Drive a veces como "application/octet-stream". Rechazarlos por el mime
// sería rechazar exactamente los archivos que el dropzone existe para recibir.
const EXTENSIONES_OK = ['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif', 'pdf']

function extensionDe(nombre?: string | null): string {
  const n = (nombre ?? '').trim().toLowerCase()
  const i = n.lastIndexOf('.')
  return i > 0 ? n.slice(i + 1) : ''
}

/**
 * ¿Se puede mandar este archivo? Devuelve `null` si sí, o el motivo en criollo.
 *
 * Recibe un objeto plano y no un `File` para poder testearse en node y para
 * que el proxy del server lo use con lo que le llegó por multipart.
 */
export function validarArchivo(
  archivo: { nombre?: string | null; mime?: string | null; bytes?: number | null },
): string | null {
  const bytes = Number(archivo?.bytes ?? 0)
  if (!Number.isFinite(bytes) || bytes <= 0) return 'El archivo está vacío.'
  if (bytes > MAX_BYTES_ARCHIVO) {
    const mb = (bytes / (1024 * 1024)).toFixed(1)
    return `El archivo pesa ${mb}MB y el máximo son 10MB. Sacá la foto con menos calidad o mandá el PDF más liviano.`
  }
  const mime = (archivo?.mime ?? '').trim().toLowerCase()
  if ((MIMES_ACEPTADOS as readonly string[]).includes(mime)) return null
  // Mime desconocido o vacío: se le da la chance a la extensión.
  if (EXTENSIONES_OK.includes(extensionDe(archivo?.nombre))) return null
  return 'Sólo se pueden mandar fotos (jpg, png, webp, heic) o PDF.'
}

/** El mismo `validarArchivo`, pero directo desde un `File` del browser. */
export function validarFile(file: File): string | null {
  return validarArchivo({ nombre: file.name, mime: file.type, bytes: file.size })
}

/**
 * ¿Se muestra como imagen (preview) o como tarjeta de documento (ícono +
 * nombre)? Mira el `tipo` explícito si lo hay ('imagen', como lo nombra el
 * backend) y si no, el mime; con mime vacío cae a la extensión (HEIC en
 * Android llega sin type).
 */
export function esImagen(
  archivo?: { tipo?: string | null; mime?: string | null; nombre?: string | null } | null,
): boolean {
  if (!archivo) return false
  if (archivo.tipo === 'imagen') return true
  const mime = (archivo.mime ?? '').trim().toLowerCase()
  if (mime) return mime.startsWith('image/')
  return EXTENSIONES_OK.includes(extensionDe(archivo.nombre)) && extensionDe(archivo.nombre) !== 'pdf'
}
