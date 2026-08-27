/**
 * El chat del dashboard: hablarle al MISMO bot que contesta por WhatsApp, pero
 * desde la web. Y la campana de avisos, que comparte con el chat el formateo de
 * tiempos.
 *
 * Módulo PURO (sin Next, sin fetch, sin DOM): todo lo que acá se decide —
 * cuándo mostrar los botones Sí/No, cómo se agrupan las burbujas por día, qué
 * archivo se puede adjuntar, cómo se fusiona lo que devuelve el polling — es
 * lógica que tiene que poder probarse sin abrir un browser. El componente
 * (app/chat/ChatClient.tsx) sólo pinta lo que estas funciones deciden.
 *
 * El contrato de los tipos espeja 1:1 el del backend (rena-autos-api
 * api/chat.py `_como_json` y api/notificaciones.py `listar`).
 */

import { fmtDMY, instantDayKey, localDayKey, parseInstant, parseLocalDate, todayKey } from '@/lib/date'

// ── Tipos del contrato ────────────────────────────────────────────────────────

/** Quién habla. 'sistema' NO es el bot: es el canal (una negativa de admisión,
 *  un error del turno). Por eso se pinta distinto — centrado y en gris. */
export type ChatRol = 'user' | 'bot' | 'sistema'

/** Estados de la fila del usuario mientras el turno corre en el backend. */
export type ChatEstado = 'pendiente' | 'procesando' | 'listo' | 'error'

export type ChatMedia = {
  /** Ruta del backend (`/api/chat/media/<ref>`). El frontend la sirve por su
   *  propio proxy — nunca le pega al backend derecho (la API key). */
  url: string
  tipo: string
  nombre: string
  mime: string
}

export type ChatMensaje = {
  id: number
  rol: ChatRol
  texto: string
  estado?: string | null
  created_at?: string | null
  turn_ref?: string | null
  media?: ChatMedia | null
  /** SÓLO local: la burbuja optimista todavía no fue confirmada por /enviar. */
  pendienteLocal?: boolean
  /** SÓLO local: /enviar falló y la burbuja ofrece "Reintentar". */
  errorLocal?: string | null
  /** SÓLO local: adjunto ya subido que viaja con este mensaje al reintentar. */
  mediaRef?: string | null
}

export type NotificacionNivel = 'info' | 'alerta' | string

export type Notificacion = {
  id: number
  texto: string
  nivel: NotificacionNivel
  link: string | null
  leida: boolean
  created_at?: string | null
}

// ── Ids temporales (envío optimista) ──────────────────────────────────────────

/**
 * Las burbujas optimistas necesitan un id ANTES de que el backend les dé el
 * suyo, y ese id tiene que ordenar al final de la lista (son lo más nuevo que
 * hay). Por eso se los numera desde un piso altísimo en vez de con negativos:
 * así el `sort` por id sale gratis y no hay caso especial.
 *
 * Los ids reales son rowids de D1 — no van a llegar a 10^12 en la vida útil de
 * esto (a un mensaje por segundo, ~31.000 años).
 */
export const ID_TEMPORAL_BASE = 1_000_000_000_000

export function esTemporal(id: number): boolean {
  return id >= ID_TEMPORAL_BASE
}

/** El id temporal de la n-ésima burbuja optimista de esta sesión. */
export function idTemporal(n: number): number {
  return ID_TEMPORAL_BASE + n
}

// ── Polling: fusionar sin duplicar ────────────────────────────────────────────

/**
 * Lo que ya está en pantalla + lo que trajo el poll, sin repetidos y en orden.
 *
 * El server SIEMPRE gana: cuando llega la fila real del mensaje que mandamos
 * (mismo id, porque al resolver /enviar le pisamos el id temporal por el de
 * verdad), reemplaza a la optimista con su `estado` autoritativo. Eso es lo que
 * hace que el relojito se apague solo sin que el componente lleve estado propio.
 */
export function mergeMensajes(previos: ChatMensaje[], nuevos: ChatMensaje[]): ChatMensaje[] {
  const porId = new Map<number, ChatMensaje>()
  for (const m of previos ?? []) {
    if (Number.isFinite(m?.id)) porId.set(Number(m.id), m)
  }
  for (const m of nuevos ?? []) {
    if (!Number.isFinite(m?.id)) continue
    porId.set(Number(m.id), { ...m, id: Number(m.id) })
  }
  // Array.from y no spread: este tsconfig apunta a es5 y el spread de un
  // iterador pediría --downlevelIteration.
  return Array.from(porId.values()).sort((a, b) => a.id - b.id)
}

/**
 * El `after_id` del próximo poll: el id real más alto que YA vimos.
 *
 * Los temporales no cuentan, y el id del mensaje que acabamos de mandar tampoco
 * avanza este número por su cuenta — así el siguiente poll vuelve a traer esa
 * misma fila con su `estado` (pendiente → procesando → listo) en vez de que se
 * quede congelada en el relojito para siempre.
 */
export function ultimoIdServidor(mensajes: ChatMensaje[]): number {
  let max = 0
  for (const m of mensajes ?? []) {
    const id = Number(m?.id)
    if (Number.isFinite(id) && !esTemporal(id) && id > max) max = id
  }
  return max
}

// ── "Escribiendo…" ────────────────────────────────────────────────────────────

/**
 * ¿El bot está pensando? Se mira el ÚLTIMO mensaje del usuario, no el último de
 * la lista: mientras el turno corre, el backend puede ir dejando notas de
 * progreso ('sistema') y la fila del usuario sigue en 'procesando'. Si mirara
 * el último a secas, esas notas apagarían el indicador antes de tiempo.
 */
export function estaEscribiendo(mensajes: ChatMensaje[]): boolean {
  for (let i = (mensajes?.length ?? 0) - 1; i >= 0; i--) {
    const m = mensajes[i]
    if (m?.rol !== 'user') continue
    if (m.errorLocal) return false
    if (m.pendienteLocal) return true
    return m.estado === 'pendiente' || m.estado === 'procesando'
  }
  return false
}

// ── Botones rápidos Sí / No ───────────────────────────────────────────────────

// El gate de confirmación del backend arma SIEMPRE el mismo prompt determinista
// (rena-autos-api flows/confirmation.build_confirmation_prompt): un encabezado
// "📝 ¿Confirmás …" y el cierre "Respondé *sí* o *no*.". Se piden LAS DOS
// marcas: un mensaje del bot que apenas diga "¿Confirmás?" en medio de una
// charla no es el gate, y ofrecer botones ahí manda un "sí" que nadie está
// esperando.
const RE_CONFIRMAS = /¿\s*confirmás/i
// Tolerante con los asteriscos (por si algún día el markdown se limpia antes de
// pintar) pero no con la estructura: tiene que ser "respondé sí o no".
const RE_RESPONDE_SI_O_NO = /respond[ée]\s*\*?\s*sí\s*\*?\s*o\s*\*?\s*no\s*\*?/i

/** ¿Este texto es el prompt del gate de confirmación del backend? */
export function esPromptConfirmacion(texto?: string | null): boolean {
  const t = texto ?? ''
  return RE_CONFIRMAS.test(t) && RE_RESPONDE_SI_O_NO.test(t)
}

/**
 * ¿Se muestran los botones [✅ Sí] [❌ No] arriba del input?
 *
 * Sólo si el ÚLTIMO mensaje del hilo es del bot y es el prompt del gate. Si
 * después vino cualquier otra cosa (otra respuesta, una nota del sistema, o el
 * propio usuario ya contestó), la pregunta dejó de estar abierta.
 */
export function ofreceSiNo(mensajes: ChatMensaje[]): boolean {
  const ultimo = (mensajes ?? [])[(mensajes?.length ?? 0) - 1]
  return !!ultimo && ultimo.rol === 'bot' && esPromptConfirmacion(ultimo.texto)
}

// ── Agrupado por día ──────────────────────────────────────────────────────────

export type GrupoDia = {
  /** "YYYY-MM-DD" local. */
  clave: string
  /** "Hoy" | "Ayer" | "DD/MM/AA". */
  etiqueta: string
  mensajes: ChatMensaje[]
}

/** El día anterior a una clave "YYYY-MM-DD", en local. */
function diaAnterior(clave: string): string {
  const d = parseLocalDate(clave)
  d.setDate(d.getDate() - 1)
  return localDayKey(d)
}

/** Cómo se llama el separador de un día: "Hoy", "Ayer" o la fecha. */
export function etiquetaDia(clave: string, hoy: string = todayKey()): string {
  if (!clave) return ''
  if (clave === hoy) return 'Hoy'
  if (clave === diaAnterior(hoy)) return 'Ayer'
  return fmtDMY(clave)
}

/**
 * Las burbujas partidas en días, como WhatsApp. El orden de entrada se respeta
 * (ya viene ordenado por id) y las filas sin `created_at` —una burbuja optimista
 * que todavía no volvió del server— caen en el día de hoy, que es donde el ojo
 * las espera.
 */
export function agruparPorDia(mensajes: ChatMensaje[], hoy: string = todayKey()): GrupoDia[] {
  const grupos: GrupoDia[] = []
  for (const m of mensajes ?? []) {
    const clave = instantDayKey(m?.created_at) || hoy
    const ultimo = grupos[grupos.length - 1]
    if (ultimo && ultimo.clave === clave) ultimo.mensajes.push(m)
    else grupos.push({ clave, etiqueta: etiquetaDia(clave, hoy), mensajes: [m] })
  }
  return grupos
}

// ── Tiempos ───────────────────────────────────────────────────────────────────

/**
 * "recién", "hace 5 min", "hace 3 h", "hace 2 d", y de ahí en adelante la fecha.
 *
 * Para la campana, donde lo que importa es "¿esto es de ahora o de la semana
 * pasada?" y no la hora exacta. `ahora` es parámetro para poder testearlo.
 */
export function tiempoRelativo(iso?: string | null, ahora: number = Date.now()): string {
  const d = parseInstant(iso)
  if (!d) return ''
  const seg = Math.round((ahora - d.getTime()) / 1000)
  // Un reloj adelantado del lado del cliente no tiene que mostrar "hace -3 min".
  if (seg < 60) return 'recién'
  const min = Math.floor(seg / 60)
  if (min < 60) return `hace ${min} min`
  const horas = Math.floor(min / 60)
  if (horas < 24) return `hace ${horas} h`
  const dias = Math.floor(horas / 24)
  if (dias < 7) return `hace ${dias} d`
  return fmtDMY(iso)
}

// ── Adjuntos ──────────────────────────────────────────────────────────────────

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
// sería rechazar exactamente los archivos que esta pantalla existe para recibir.
const EXTENSIONES_OK = ['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif', 'pdf']

function extensionDe(nombre?: string | null): string {
  const n = (nombre ?? '').trim().toLowerCase()
  const i = n.lastIndexOf('.')
  return i > 0 ? n.slice(i + 1) : ''
}

/**
 * ¿Se puede mandar este archivo? Devuelve `null` si sí, o el motivo en criollo.
 *
 * Se valida ACÁ además de en el backend para que el rechazo sea instantáneo y
 * no después de subir 9MB por la red del celular.
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

/** ¿La burbuja muestra el adjunto como imagen o como tarjeta de documento? */
export function esImagen(media?: ChatMedia | null): boolean {
  if (!media) return false
  if (media.tipo === 'imagen') return true
  return (media.mime ?? '').startsWith('image/')
}

// ── Notificaciones ────────────────────────────────────────────────────────────

/**
 * El id hasta el que se marca leído: el más alto que la lista llegó a PINTAR.
 *
 * No se usa el `last_id` de la respuesta ni el id más alto de la tabla: un aviso
 * que entró mientras el popover ya estaba abierto no se puede dar por visto sin
 * que nadie lo haya visto (así lo pide api/notificaciones.leer).
 */
export function hastaIdVisible(notificaciones: Notificacion[]): number {
  let max = 0
  for (const n of notificaciones ?? []) {
    const id = Number(n?.id)
    if (Number.isFinite(id) && id > max) max = id
  }
  return max
}

/** El número del globito, capado para que no rompa el layout. */
export function textoBadge(noLeidas: number): string {
  const n = Number(noLeidas)
  if (!Number.isFinite(n) || n <= 0) return ''
  return n > 99 ? '99+' : String(n)
}
