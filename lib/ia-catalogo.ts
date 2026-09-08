/**
 * Catálogo ÚNICO de las acciones de IA que el backend expone bajo
 * `POST /api/ia/<accion>` (rena-autos-api api/ia.py).
 *
 * Una sola lista para el proxy (app/api/ia/[accion]/route.ts) y para el
 * cliente (lib/ia-cliente.ts): si viviera en dos lados, el día que se agrega
 * una acción el proxy rechazaría lo que el formulario pide.
 *
 * Módulo PURO: sin imports de Next, sin env — se usa en server y en cliente.
 */

export const IA_ACCIONES = [
  /** Cédula / título / 08 (imagen o PDF) → campos del auto. */
  'vehiculo-desde-documento',
  /** DNI frente (+ dorso) → campos del cliente. */
  'cliente-desde-dni',
  /** Un papel cualquiera → qué papel es y de qué dominio. */
  'clasificar-documento',
  /** Un chat de WhatsApp pegado → interesado + seguimiento propuesto. */
  'interesado-desde-chat',
  /** "visita de Juan mañana 15hs por el Golf" → visita o tarea. */
  'parsear-agenda',
  /** Charla del CRM o texto pegado → resumen + próximo paso. */
  'resumir-seguimiento',
] as const

export type IaAccion = typeof IA_ACCIONES[number]

/** ¿Es una acción que el backend conoce? Corta cualquier `../` de paso. */
export function esIaAccion(valor: unknown): valor is IaAccion {
  return typeof valor === 'string' && (IA_ACCIONES as readonly string[]).includes(valor)
}
