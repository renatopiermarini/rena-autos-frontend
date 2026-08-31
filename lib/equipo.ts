/**
 * El equipo: quién existe, cómo se lo pinta y en qué orden se lo muestra.
 *
 * Antes vivía hardcodeado en app/tareas/TareasClient.tsx (TEAM / TEAM_ORDER /
 * SECTION_ORDER) y en el literal 'marshiot' del tablero. Ahora sale de la tabla
 * `equipo`; sin tabla —o con la tabla vacía— se cae a DEFAULT_EQUIPO, que es
 * EXACTAMENTE el objeto que estaba en TareasClient, así el dashboard de Renato
 * renderiza igual que siempre.
 *
 * Módulo PURO (sin Next, sin env, sin fetch): lo usan pantallas server y client.
 */
import { flagOn, activasOrdenadas, capFirst } from './kapso'

export type MiembroEquipo = {
  clave: string        // lo que se guarda en tareas.asignado / completado_por
  label: string        // cómo se muestra
  badge: string        // clases del pill "Rena"
  avatar: string       // clases del círculo con la inicial
  isAssignee: boolean  // ¿le va sección propia en el tablero?
}

/** A quién se le asigna algo cuando nada lo determina (backend: DEFAULT_ASSIGNEE_KEY). */
export const DEFAULT_ASSIGNEE = 'rena'

// Paleta cíclica para las claves que no conocemos: violeta, azul, verde, ámbar,
// rosa. Determinista por índice, así el color de una persona no baila entre
// renders ni entre pantallas. El HUE de cada persona es identidad y no se toca;
// el tratamiento sí: badge tinted (mismo idioma que los Badge de estado) y
// avatar sólido — un círculo de 20px con tinte al 10% es ilegible.
// Texto light en *-800 y dark en *-300: los 20 pares hue×tema pasan AA
// (peor caso green-800 light 6.34:1; con *-700, green daba 4.42 y fallaba).
// Strings LITERALES a propósito: el scanner de Tailwind no ve clases armadas
// con template strings — interpolar acá rompería la generación del CSS.
export const PALETA_EQUIPO = [
  {
    badge: 'border border-violet-600/30 bg-violet-600/10 text-violet-800 dark:border-violet-400/25 dark:bg-violet-400/15 dark:text-violet-300',
    avatar: 'bg-violet-600 text-white',
  },
  {
    badge: 'border border-blue-600/30 bg-blue-600/10 text-blue-800 dark:border-blue-400/25 dark:bg-blue-400/15 dark:text-blue-300',
    avatar: 'bg-blue-600 text-white',
  },
  {
    badge: 'border border-green-600/30 bg-green-600/10 text-green-800 dark:border-green-400/25 dark:bg-green-400/15 dark:text-green-300',
    avatar: 'bg-green-600 text-white',
  },
  {
    badge: 'border border-amber-600/30 bg-amber-600/10 text-amber-800 dark:border-amber-400/25 dark:bg-amber-400/15 dark:text-amber-300',
    avatar: 'bg-amber-600 text-white',
  },
  {
    badge: 'border border-pink-600/30 bg-pink-600/10 text-pink-800 dark:border-pink-400/25 dark:bg-pink-400/15 dark:text-pink-300',
    avatar: 'bg-pink-600 text-white',
  },
]

// Los colores de siempre. Se respetan aunque la persona venga de la tabla: si
// Marshiot cambiara de violeta a verde el día que se corre el DDL, el usuario
// leería el cambio como un bug. Rena conserva el inverso foreground/background:
// es la marca del dueño, no un color de la paleta.
const COLORES_FIJOS: Record<string, { badge: string; avatar: string }> = {
  rena:     { badge: 'bg-foreground text-background', avatar: 'bg-foreground text-background' },
  fran:     PALETA_EQUIPO[1], // azul
  marshiot: PALETA_EQUIPO[0], // violeta
}

/**
 * El equipo de hoy, tal cual estaba escrito a mano en TareasClient.
 *
 * `isAssignee` = "se le pueden asignar tareas" — la MISMA semántica que la
 * columna equipo.is_assignee del backend. Quién tiene sección destacada arriba
 * del tablero es OTRA cosa: sale de config_negocio.tablero_destacados (ver
 * destacadosClaves), no de este flag.
 */
export const DEFAULT_EQUIPO: MiembroEquipo[] = [
  { clave: 'rena',     label: 'Rena',     ...COLORES_FIJOS.rena,     isAssignee: true },
  { clave: 'fran',     label: 'Fran',     ...COLORES_FIJOS.fran,     isAssignee: true },
  { clave: 'marshiot', label: 'Marshiot', ...COLORES_FIJOS.marshiot, isAssignee: true },
]

/** Fallback de tablero_destacados: lo único destacado hoy (pedido 2026-08-13). */
export const DEFAULT_DESTACADOS = ['marshiot']

function colores(clave: string, i: number) {
  const fijo = COLORES_FIJOS[clave]
  if (fijo) return fijo
  return PALETA_EQUIPO[i % PALETA_EQUIPO.length]
}

/**
 * Filas de `equipo` → miembros activos, en orden. Vacío (tabla sin crear, sin
 * filas activas o lectura fallida) ⇒ DEFAULT_EQUIPO: el fallback está acá, una
 * sola vez, y no repetido en cada pantalla.
 */
export function equipoFromRows(rows: any[]): MiembroEquipo[] {
  const activos = activasOrdenadas(rows, 'activo')
  const out: MiembroEquipo[] = []
  const vistas = new Set<string>()
  for (const r of activos) {
    const clave = typeof r?.clave === 'string' ? r.clave.trim() : ''
    if (!clave || vistas.has(clave)) continue
    vistas.add(clave)
    const label = typeof r?.display_name === 'string' && r.display_name.trim()
      ? r.display_name.trim()
      : capFirst(clave)
    out.push({ clave, label, ...colores(clave, out.length), isAssignee: flagOn(r?.is_assignee) })
  }
  return out.length > 0 ? out : DEFAULT_EQUIPO
}

/**
 * La clave que recibe lo que no tiene dueño. Sale de
 * config_negocio.default_assignee; si no está cargada —o apunta a alguien que ya
 * no existe— se usa 'rena' si está en el equipo, y si no el primero de la lista.
 */
export function resolveDefaultAssignee(
  cfg: Record<string, string> | undefined,
  equipo: MiembroEquipo[],
): string {
  const claves = equipo.map(m => m.clave)
  const configurado = (cfg?.default_assignee ?? '').trim()
  if (configurado && claves.includes(configurado)) return configurado
  if (claves.includes(DEFAULT_ASSIGNEE)) return DEFAULT_ASSIGNEE
  return claves[0] ?? DEFAULT_ASSIGNEE
}

/**
 * Claves con sección propia arriba del tablero. Config explícita
 * (config_negocio.tablero_destacados, CSV) — NO se deriva de is_assignee: que
 * alguien sea asignable no significa que sus tareas vayan destacadas (a Fran se
 * le asignan tareas y nunca tuvo sección). Sin la clave configurada cae a
 * DEFAULT_DESTACADOS; siempre se filtra a miembros existentes y se excluye el
 * default_assignee (sus tareas ya están en el resto de la pantalla).
 */
export function destacadosClaves(
  cfg: Record<string, string> | undefined,
  equipo: MiembroEquipo[],
  defAssignee: string,
): string[] {
  const raw = (cfg?.tablero_destacados ?? '').trim()
  const pedidas = raw ? raw.split(',').map(s => s.trim()).filter(Boolean) : DEFAULT_DESTACADOS
  const claves = new Set(equipo.map(m => m.clave))
  return pedidas.filter(c => claves.has(c) && c !== defAssignee)
}

/** Los miembros destacados, en el orden de la config. */
export function seccionesEquipo(
  equipo: MiembroEquipo[],
  defAssignee: string,
  destacados: string[],
): MiembroEquipo[] {
  const porClave = new Map(equipo.map(m => [m.clave, m]))
  return destacados
    .filter(c => c !== defAssignee)
    .map(c => porClave.get(c))
    .filter((m): m is MiembroEquipo => Boolean(m))
}

/**
 * Orden de las secciones "Por persona" de /tareas: primero los destacados
 * (los mismos del tablero), después el asignado por defecto, después el resto.
 * Con el fallback: marshiot, rena, fran — el orden pedido en 2026-08-13.
 */
export function ordenSecciones(
  equipo: MiembroEquipo[],
  defAssignee: string,
  destacados: string[],
): string[] {
  // Misma fuente que el tablero: sólo destacados que existen y no son el default.
  const arriba = seccionesEquipo(equipo, defAssignee, destacados).map(m => m.clave)
  const usadas = new Set(arriba)
  const orden = [...arriba]
  if (equipo.some(m => m.clave === defAssignee)) {
    orden.push(defAssignee)
    usadas.add(defAssignee)
  }
  for (const m of equipo) if (!usadas.has(m.clave)) orden.push(m.clave)
  return orden
}

/**
 * Sugerencia para el campo libre "autor" de la KB: las dos primeras claves del
 * equipo. Con el fallback da "rena / fran", el placeholder de siempre. Van las
 * CLAVES y no los labels porque es lo que se guarda en la columna.
 */
export function placeholderAutores(equipo: MiembroEquipo[]): string {
  return equipo.slice(0, 2).map(m => m.clave).join(' / ')
}

/** Busca por clave, case-insensitive (la columna guarda minúsculas). */
export function miembroPorClave(equipo: MiembroEquipo[], asignado: any): MiembroEquipo | null {
  const a = String(asignado ?? '').trim().toLowerCase()
  if (!a) return null
  return equipo.find(m => m.clave.toLowerCase() === a) ?? null
}
