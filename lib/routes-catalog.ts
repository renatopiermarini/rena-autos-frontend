/**
 * Catálogo ÚNICO de rutas del bot y validadores de `clave`.
 *
 * Una sola definición para el proxy (/api/db/[table]) y para la UI de
 * configuración: si la lista vive en dos lados, el día que se agrega una ruta
 * el server rechaza lo que el form ofrece. Espejo de las rutas que el router
 * de rena-autos-api sabe despachar.
 *
 * Módulo PURO: sin imports de Next, sin env — se usa en server y en cliente.
 */

export const ROUTES_CATALOG = [
  'stock',
  'tareas',
  'finanzas',
  'contratos',
  'kb',
  'research',
  'tramites',
  'verificaciones',
  'referencias',
  'publicacion',
  'bienvenida',
] as const

export type RouteKey = typeof ROUTES_CATALOG[number]

export const ROUTE_LABEL: Record<RouteKey, string> = {
  stock: 'Stock',
  tareas: 'Tareas',
  finanzas: 'Finanzas',
  contratos: 'Contratos',
  // Ruta del BOT, no del dashboard: la pantalla "Guía" (/kb) se eliminó, pero el
  // router del backend sigue despachando 'kb' contra su base kb_entries. La clave
  // es lo que viaja a equipo.routes; la etiqueta se lee sólo en los badges de
  // Configuración → Equipo.
  kb: 'Guía',
  research: 'Research',
  tramites: 'Trámites',
  verificaciones: 'Verificaciones',
  referencias: 'Referencias',
  publicacion: 'Publicación',
  bienvenida: 'Bienvenida',
}

/** `equipo.routes` / acceso total. Sentinela, no es una ruta del catálogo. */
export const ROUTES_ALL = 'all'

/**
 * Claves de `cuentas` y `equipo`: identificadores que viajan al bot y a la DB
 * (movimientos_contabilidad.cuenta, tareas.asignado). Minúscula, sin espacios,
 * sin acentos — lo que un enum de Python/SQL tolera sin sorpresas.
 */
export const CLAVE_RE = /^[a-z][a-z0-9_]*$/

export function isValidClave(value: unknown): boolean {
  return typeof value === 'string' && CLAVE_RE.test(value)
}

export function isRouteKey(value: unknown): value is RouteKey {
  return typeof value === 'string' && (ROUTES_CATALOG as readonly string[]).includes(value)
}

/** "stock, tareas" → ['stock','tareas']. Tolera espacios y comas de más. */
export function parseRoutesCsv(raw: unknown): string[] {
  if (typeof raw !== 'string') return []
  return raw.split(',').map(s => s.trim()).filter(Boolean)
}

export function isAllRoutes(raw: unknown): boolean {
  return typeof raw === 'string' && raw.trim().toLowerCase() === ROUTES_ALL
}

/**
 * Valida `equipo.routes`: o el literal "all", o un CSV cuyos items estén TODOS
 * en el catálogo. Devuelve null si es válido, o el mensaje de error (en
 * castellano, el mismo que sale por la API y por el form).
 */
export function routesError(raw: unknown): string | null {
  if (raw === null || raw === undefined || raw === '') return null // opcional
  if (typeof raw !== 'string') {
    return '`routes` inválido: debe ser "all" o una lista separada por comas.'
  }
  if (isAllRoutes(raw)) return null
  const items = parseRoutesCsv(raw)
  if (items.length === 0) {
    return '`routes` inválido: vacío. Usá "all" o una lista separada por comas.'
  }
  const bad = items.filter(r => !isRouteKey(r))
  if (bad.length > 0) {
    return `\`routes\` inválido: ${bad.map(b => JSON.stringify(b)).join(', ')}. Rutas válidas: ${[...ROUTES_CATALOG].sort().join(', ')} (o "all").`
  }
  return null
}

/** Normaliza para guardar: "all" queda "all", el resto CSV sin espacios ni repetidos. */
export function routesToCsv(routes: string[]): string {
  return Array.from(new Set(routes.map(r => r.trim()).filter(Boolean))).join(',')
}
