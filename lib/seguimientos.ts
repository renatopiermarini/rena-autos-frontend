/**
 * Seguimientos: cada charla abierta con un interesado o un cliente, con su
 * resumen y su próximo paso. Reemplazan a las tareas tipo `seguimiento` que el
 * Tablero escondía porque eran cientos (Fase 5 del plan de IA distribuida).
 *
 * Tabla `seguimientos` (Postgres, migración 0006 de rena-autos-api). En la
 * instancia de Renato —modo Kapso, sin DATABASE_URL— la tabla NO existe: el
 * getter devuelve `null` (≠ `[]`, que es "existe y está vacía") y la pantalla
 * muestra el aviso en vez de una lista vacía que se lee como "no hay nada".
 *
 * Todo lo que no es el getter es PURO (se testea en node sin fetch): la
 * clasificación por vencimiento, el posponer, el orden y la persona.
 */
import { dbGet, DbError, SchemaError } from '@/lib/db'
import { localDayKey, parseLocalDate } from '@/lib/date'

export type SeguimientoEstado = 'pendiente' | 'hecho' | 'descartado'
export type SeguimientoFuente = 'crm' | 'manual' | 'ia' | 'bot'

export type Seguimiento = {
  id: number
  interesado_id: number | null
  cliente_id: number | null
  vehicle_id: number | null
  crm_chat_id: string | null
  resumen: string | null
  proximo_paso: string | null
  /** TEXT YYYY-MM-DD, como `tareas.fecha_vencimiento`. */
  fecha_proximo: string | null
  estado: SeguimientoEstado
  fuente: SeguimientoFuente
  /** Veces que el CRM volvió a insistir sobre la misma charla. */
  nudges: number
  created_at: string | null
  updated_at: string | null
  hecho_at: string | null
}

export const ESTADO_LABEL: Record<SeguimientoEstado, string> = {
  pendiente: 'Pendiente',
  hecho: 'Hecho',
  descartado: 'Descartado',
}

export const FUENTE_LABEL: Record<SeguimientoFuente, string> = {
  crm: 'CRM',
  manual: 'Manual',
  ia: 'IA',
  bot: 'Bot',
}

// ── Lectura ──────────────────────────────────────────────────────────────────

/**
 * Todas las filas, o `null` si la tabla no existe en esta instancia.
 *
 * Mismo patrón que `getSafe` de lib/kapso.ts (un fallo nunca tira la página),
 * pero distinguiendo "no existe" de "vacía": en Kapso una tabla sin crear es
 * 404; en Postgres, `SchemaError` (400 esquema_desconocido). Cualquier otro
 * error HTTP devuelve lo que se alcanzó a leer, como el resto de las lecturas.
 */
export async function getSeguimientos(): Promise<Seguimiento[] | null> {
  try {
    const rows: any[] = await dbGet('seguimientos', {}, { revalidate: 15 })
    return rows.map(normalizar)
  } catch (e) {
    if (e instanceof SchemaError) return null
    if (e instanceof DbError) {
      if (e.status === 404) return null
      return (e.partial ?? []).map(normalizar)
    }
    console.warn('[seguimientos] no se pudo leer la tabla:', e)
    return null
  }
}

/** Ids como number (la D1 devuelve FKs como TEXT), nudges como entero. */
function normalizar(r: any): Seguimiento {
  return {
    id: Number(r?.id),
    interesado_id: idONull(r?.interesado_id),
    cliente_id: idONull(r?.cliente_id),
    vehicle_id: idONull(r?.vehicle_id),
    crm_chat_id: r?.crm_chat_id ?? null,
    resumen: r?.resumen ?? null,
    proximo_paso: r?.proximo_paso ?? null,
    fecha_proximo: r?.fecha_proximo ? String(r.fecha_proximo).slice(0, 10) : null,
    estado: (r?.estado ?? 'pendiente') as SeguimientoEstado,
    fuente: (r?.fuente ?? 'manual') as SeguimientoFuente,
    nudges: Number.isFinite(Number(r?.nudges)) ? Number(r.nudges) : 0,
    created_at: r?.created_at ?? null,
    updated_at: r?.updated_at ?? null,
    hecho_at: r?.hecho_at ?? null,
  }
}

function idONull(v: any): number | null {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

// ── Vencimiento ──────────────────────────────────────────────────────────────

export type Vencimiento = 'vencido' | 'hoy' | 'proximo' | 'sin_fecha'

const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/

/**
 * Comparación de strings YYYY-MM-DD: sin Date, sin zona horaria. `hoy` viene
 * de `todayKey()` (cliente) o de `localDayKey(new Date())` (server).
 */
export function clasificarVencimiento(fecha: string | null | undefined, hoy: string): Vencimiento {
  if (!fecha || !FECHA_RE.test(fecha)) return 'sin_fecha'
  if (fecha < hoy) return 'vencido'
  if (fecha === hoy) return 'hoy'
  return 'proximo'
}

/**
 * Nueva fecha al posponer `dias`. Se cuenta desde la fecha actual del
 * seguimiento si está en el futuro; si ya venció (o no tiene fecha), desde
 * hoy — "+1 día" sobre un seguimiento vencido hace una semana tiene que
 * caer mañana, no seguir vencido.
 */
export function posponer(fecha: string | null | undefined, dias: number, hoy: string): string {
  const base = fecha && FECHA_RE.test(fecha) && fecha > hoy ? fecha : hoy
  const d = parseLocalDate(base)
  d.setDate(d.getDate() + dias)
  return localDayKey(d)
}

/**
 * Pendientes en el orden en que hay que atenderlos: por fecha ascendente
 * (vencidos primero, después hoy, después los próximos) y los sin fecha al
 * final. Empate por id (el más viejo primero). No muta.
 */
export function ordenarPendientes<T extends Pick<Seguimiento, 'id' | 'fecha_proximo'>>(rows: T[]): T[] {
  const conFecha = (r: T) => !!r.fecha_proximo && FECHA_RE.test(r.fecha_proximo)
  return [...rows].sort((a, b) => {
    const fa = conFecha(a), fb = conFecha(b)
    if (fa !== fb) return fa ? -1 : 1
    if (fa && fb && a.fecha_proximo !== b.fecha_proximo) {
      return a.fecha_proximo! < b.fecha_proximo! ? -1 : 1
    }
    return a.id - b.id
  })
}

/** Cuántos pendientes hay, y cuántos de ellos ya vencieron o son para hoy. */
export function resumenPendientes(rows: Seguimiento[], hoy: string): { pendientes: number; vencidos: number; paraHoy: number } {
  let pendientes = 0, vencidos = 0, paraHoy = 0
  for (const r of rows) {
    if (r.estado !== 'pendiente') continue
    pendientes++
    const v = clasificarVencimiento(r.fecha_proximo, hoy)
    if (v === 'vencido') vencidos++
    if (v === 'vencido' || v === 'hoy') paraHoy++
  }
  return { pendientes, vencidos, paraHoy }
}

// ── Persona y auto ───────────────────────────────────────────────────────────

export type PersonaRef = { nombre: string; href: string }

type PersonaLike = { id: any; nombre?: string | null }

/**
 * Quién es el seguimiento: el interesado si lo tiene, si no el cliente, con
 * el link a su ficha (`?id=` abre y scrollea la fila). `null` si no apunta a
 * nadie o la persona ya no existe. Ids coercionados: en Kapso la FK es TEXT.
 */
export function personaDe(
  seg: Pick<Seguimiento, 'interesado_id' | 'cliente_id'>,
  interesados: PersonaLike[],
  clientes: PersonaLike[],
): PersonaRef | null {
  if (seg.interesado_id != null) {
    const i = interesados.find(x => Number(x.id) === Number(seg.interesado_id))
    if (i) return { nombre: i.nombre || `Interesado #${seg.interesado_id}`, href: `/interesados?id=${seg.interesado_id}` }
  }
  if (seg.cliente_id != null) {
    const c = clientes.find(x => Number(x.id) === Number(seg.cliente_id))
    if (c) return { nombre: c.nombre || `Cliente #${seg.cliente_id}`, href: `/clientes?id=${seg.cliente_id}` }
  }
  return null
}

type VehiculoLike = { id: any; marca?: string | null; modelo?: string | null; dominio?: string | null }

/** "Marca Modelo · DOMINIO", o "" si el auto no existe. */
export function autoDe(vehicleId: number | null | undefined, vehicles: VehiculoLike[]): string {
  if (vehicleId == null) return ''
  const v = vehicles.find(x => Number(x.id) === Number(vehicleId))
  if (!v) return ''
  const nombre = `${v.marca ?? ''} ${v.modelo ?? ''}`.trim() || `Auto #${vehicleId}`
  return v.dominio ? `${nombre} · ${v.dominio}` : nombre
}
