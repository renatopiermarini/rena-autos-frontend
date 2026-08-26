/**
 * Capa de datos dual del dashboard — el espejo de `rena-autos-api/db/`.
 *
 * El backend ya elige backend por `DB_BACKEND=kapso|postgres`; acá el selector
 * es la PRESENCIA de `DATABASE_URL`, que es lo único que distingue a una
 * instancia nueva (Postgres de Railway, deployada en su propio Vercel) de la de
 * Renato (Kapso REST sobre la D1). Sin `DATABASE_URL` este módulo hace
 * EXACTAMENTE los mismos fetch que hacía el código de antes: mismas URLs,
 * mismos headers, misma paginación, misma política de errores.
 *
 * Todo esto es SERVER-SIDE. La API key de Kapso y la DATABASE_URL nunca salen
 * del servidor; los componentes cliente siguen hablando con /api/db y
 * /api/finanzas/movimiento (ver el alias `postgres: false` del bundle de
 * browser en next.config.js).
 *
 * ── Contrato de retorno ──────────────────────────────────────────────────────
 *
 * Es el de la REST de Kapso, columna por columna, porque TODO el dashboard está
 * escrito contra él (igual que db/pg.py del backend, que documenta lo mismo):
 *
 *   - filas como objetos planos; las lecturas devuelven un array
 *   - booleanos como 0/1 enteros, nunca true/false (`flagOn()` los coerce, y
 *     media UI compara contra 1)
 *   - fechas como TEXT ISO (el esquema las guarda TEXT; igual normalizamos)
 *   - montos como number (DOUBLE PRECISION ≡ el REAL de SQLite)
 *   - ids como number: postgres.js devuelve int8 como STRING por defecto, así
 *     que el tipo `bigint` se parsea a Number (ver PG_OPTS)
 *   - `dbPatch` de un id inexistente devuelve `[]` — el ghost-write de Kapso
 *     (200 con `data: []`) del que dependen los 404 del proxy
 *
 * ── Errores ──────────────────────────────────────────────────────────────────
 *
 * Todo fallo sale como `DbError` con `status` + `body`, que es lo que el proxy
 * necesita para responder igual que cuando pasaba la respuesta de Kapso tal
 * cual. En las lecturas paginadas el error lleva además `partial` (lo que se
 * alcanzó a leer), porque `lib/kapso.ts` devuelve la página parcial en vez de
 * tirar la pantalla abajo.
 *
 * ── Nulls ────────────────────────────────────────────────────────────────────
 *
 * A diferencia de `db/pg.py` (que filtra los None con `_clean`), acá los `null`
 * SE ESCRIBEN. En el bot un None significa "este campo no viene"; en el
 * dashboard significa "borrame este campo" — ClientesClient manda
 * explícitamente `payload[k] = null` para vaciar un dato, y hoy Kapso lo
 * respeta. Sólo se descartan los `undefined`.
 */
import postgres from 'postgres'
import type { Sql } from 'postgres'
import { unstable_noStore as noStore } from 'next/cache'

const PAGE_SIZE = 200 // Kapso topea cada request en ~200; más que eso se pagina.
const MAX_PAGES = 50  // guarda anti-loop; llegar al tope es una ALERTA, no un corte silencioso.
const TIMEOUT_S = 20  // en línea con el _TIMEOUT del backend (db/kapso_rest.py, db/pg.py)

/** ¿Instancia con Postgres propio? Se lee en cada llamada (no se cachea) para
 *  que un test que cambia el env no dependa del orden de imports. */
export function usingPostgres(): boolean {
  return !!(process.env.DATABASE_URL || '').trim()
}

export class DbError extends Error {
  readonly status: number
  readonly body: any
  /** Filas leídas antes del fallo (sólo en lecturas paginadas). */
  readonly partial?: any[]
  constructor(message: string, status: number, body: any, partial?: any[]) {
    super(message)
    this.name = 'DbError'
    this.status = status
    this.body = body
    this.partial = partial
  }
}

/** Tabla o columna que no existe en el esquema. Es un bug de código o una
 *  migración que falta, nunca input del usuario. Sale como 400 para que el
 *  toast del dashboard muestre algo accionable en vez de un 500 mudo. */
export class SchemaError extends DbError {
  constructor(message: string) {
    super(message, 400, { error: 'esquema_desconocido', message })
    this.name = 'SchemaError'
  }
}

// ── Backend Kapso (REST sobre la D1) ─────────────────────────────────────────

function conn() {
  const base = process.env.KAPSO_DB_URL!
  const headers = {
    'X-API-Key': process.env.KAPSO_API_KEY!,
    'Content-Type': 'application/json',
  }
  return { base, headers }
}

function kapsoUrl(table: string, params: Record<string, any>): string {
  const qs = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null) continue
    qs.set(k, String(v))
  }
  const q = qs.toString()
  return `${conn().base}/${table}${q ? `?${q}` : ''}`
}

async function bodyOf(res: Response): Promise<any> {
  if (res.status === 204 || res.status === 205 || res.status === 304) return {}
  return res.json().catch(() => ({}))
}

/** El `data` de la respuesta, o el body entero si no viene envuelto — igual que
 *  `body.get("data", body)` del backend. */
function unwrap(body: any): any {
  return body && typeof body === 'object' && 'data' in body ? body.data : body
}

async function kapsoGet(
  table: string,
  params: Record<string, any>,
  init: RequestInit,
): Promise<any[]> {
  const base: Record<string, any> = { ...params }
  if (base.limit === undefined) base.limit = PAGE_SIZE
  // Filtro por id ⇒ una sola página (a lo sumo una fila). Misma regla que
  // db/pg.py y db/kapso_rest.py.
  const single = base.id !== undefined
  const all: any[] = []
  let offset = Number(base.offset ?? 0)

  for (let i = 0; i < (single ? 1 : MAX_PAGES); i++) {
    const url = single ? kapsoUrl(table, base) : kapsoUrl(table, { ...base, offset })
    const res = await fetch(url, { headers: conn().headers, ...init })
    if (!res.ok) {
      throw new DbError(
        `GET ${table} → ${res.status}`,
        res.status,
        await bodyOf(res),
        all,
      )
    }
    const page: any[] = (await res.json()).data ?? []
    if (page.length === 0) break
    all.push(...page)
    if (page.length < PAGE_SIZE) break
    offset += page.length
  }
  return all
}

async function kapsoWrite(
  method: 'POST' | 'PATCH' | 'DELETE',
  table: string,
  params: Record<string, any>,
  row?: object,
): Promise<any> {
  const res = await fetch(kapsoUrl(table, params), {
    method,
    headers: conn().headers,
    ...(row === undefined ? {} : { body: JSON.stringify(row) }),
  })
  const body = await bodyOf(res)
  if (!res.ok) throw new DbError(`${method} ${table} → ${res.status}`, res.status, body)
  return body
}

// ── Backend Postgres ─────────────────────────────────────────────────────────
//
// Driver: `postgres` (postgres.js). Sobre `pg`: es JS puro (cero binarios
// nativos), pesa menos en el bundle de una función serverless y arranca más
// rápido en frío, que es lo único que importa en Vercel.
//
// Opciones (lo recomendado para funciones serverless con una base "normal"
// detrás, no un pooler):
//
//   max: 1            Cada invocación de una Vercel Function atiende UN request
//                     a la vez, así que un pool grande no da concurrencia: sólo
//                     multiplica conexiones ociosas contra el límite de Railway
//                     (una lambda que escala a 50 instancias con max:10 son 500
//                     conexiones). Es además lo que recomienda postgres.js para
//                     entornos donde el proceso se congela entre requests.
//   idle_timeout: 20  Vercel CONGELA la función entre invocaciones: un socket
//                     ocioso puede quedar muerto del lado del server sin que el
//                     cliente se entere. Cerrarlo a los 20 s evita el clásico
//                     "connection terminated unexpectedly" del primer query
//                     después de un rato.
//   max_lifetime      Recicla la conexión cada 30 min (cortes del proxy TCP de
//                     Railway, failovers).
//   connect_timeout   20 s, el mismo _TIMEOUT del backend.
//   prepare: false    Los prepared statements con nombre no sobreviven a un
//                     pooler en modo transacción (PgBouncer/pgpool), que es
//                     adónde termina apuntando cualquier instancia que crezca.
//                     Con conexión directa a Railway el costo es despreciable
//                     (una query por request), y así el mismo código sirve para
//                     las dos topologías.
//
// SSL no se fuerza: viaja en la URL (`?sslmode=require`), que es como la
// entrega Railway. Forzarlo acá rompería un Postgres local sin TLS.
const PG_OPTS = {
  max: 1,
  idle_timeout: 20,
  max_lifetime: 60 * 30,
  connect_timeout: TIMEOUT_S,
  prepare: false,
  // int8 (BIGSERIAL id, count(*)) vuelve como STRING por defecto en
  // postgres.js. La D1 devuelve números y medio dashboard compara ids con
  // ===, así que se parsea a Number.
  types: {
    bigint: {
      to: 20,
      from: [20],
      parse: (x: string) => Number(x),
      serialize: (x: any) => x.toString(),
    },
  },
} as const

// Singleton a nivel módulo (el patrón para serverless: la conexión se reusa
// entre invocaciones que caen en la misma instancia tibia). Se guarda además en
// globalThis para que el HMR del dev server no abra una conexión por recarga.
const globalForSql = globalThis as unknown as { __renaSql?: Sql; __renaCatalog?: Promise<Catalog> | null }

export function sqlClient(): Sql {
  if (!globalForSql.__renaSql) {
    const url = (process.env.DATABASE_URL || '').trim()
    if (!url) throw new Error('DATABASE_URL vacía — no hay adónde conectarse.')
    globalForSql.__renaSql = postgres(url, PG_OPTS as any)
  }
  return globalForSql.__renaSql
}

/** Sólo para tests: inyecta un cliente falso (o limpia el singleton). */
export function __setSqlClient(client: Sql | null): void {
  globalForSql.__renaSql = client ?? undefined
  resetCatalog()
}

// ── Whitelist de tablas + columnas ───────────────────────────────────────────
//
// ESPEJO de `db/pg.py` del backend: la fuente de verdad es el esquema real
// (`information_schema.columns`, o sea lo que dejaron las migraciones de
// db/migrations/0001_base.sql), no una lista hardcodeada. Una lista copiada
// acá se desincronizaría de la DDL a la primera migración; introspectar no
// puede desviarse. Con eso, ni la tabla ni las columnas que se componen en el
// SQL pueden salir de algo que exista de verdad, y los valores van SIEMPRE por
// placeholder.
//
// Las tablas del esquema (para referencia; la lista viva es la de arriba):
//   vehicles, clientes, interesados, ofertas, visitas, turnos, tareas,
//   movimientos_contabilidad, balances, prestamos, gastos_vehicles,
//   verificaciones_mecanicas, tramites, transferencias, kb_entries, memorias,
//   notas, audit_log, colegas, ventas_referencia, referencias_consultas,
//   config_negocio, cuentas, equipo.

type Catalog = Record<string, Set<string>>

async function loadCatalog(): Promise<Catalog> {
  const sql = sqlClient()
  const rows = await sql<{ table_name: string; column_name: string }[]>`
    SELECT table_name, column_name
      FROM information_schema.columns
     WHERE table_schema = 'public'
  `
  const out: Catalog = {}
  for (const r of rows) {
    ;(out[r.table_name] ||= new Set()).add(r.column_name)
  }
  return out
}

function catalog(): Promise<Catalog> {
  return (globalForSql.__renaCatalog ||= loadCatalog().catch(e => {
    globalForSql.__renaCatalog = null // un fallo de red no puede envenenar el cache
    throw e
  }))
}

export function resetCatalog(): void {
  globalForSql.__renaCatalog = null
}

async function columnsOf(table: string): Promise<Set<string>> {
  let cat = await catalog()
  if (!cat[table]) {
    // Un miss refresca UNA vez antes de fallar: una tabla recién migrada no
    // puede quedar invisible por el cache.
    resetCatalog()
    cat = await catalog()
  }
  const cols = cat[table]
  if (!cols) {
    throw new SchemaError(
      `tabla desconocida: ${JSON.stringify(table)} — no existe en el esquema (¿falta una migración?)`,
    )
  }
  return cols
}

async function checkColumn(table: string, column: string): Promise<string> {
  const cols = await columnsOf(table)
  if (!cols.has(column)) {
    throw new SchemaError(`columna desconocida: ${table}.${column}`)
  }
  return column
}

// ── Normalización de valores ─────────────────────────────────────────────────

/** Params que son control de paginación, no filtro de igualdad. */
const CONTROL_PARAMS = new Set(['limit', 'offset'])

/** Un valor tal como lo devolvería el JSON de Kapso. */
function outValue(v: any): any {
  if (typeof v === 'boolean') return v ? 1 : 0
  if (typeof v === 'bigint') return Number(v)
  if (v instanceof Date) return v.toISOString()
  if (v instanceof Uint8Array) return Buffer.from(v).toString('utf8')
  return v
}

function outRow(row: any): any {
  if (!row || typeof row !== 'object') return row
  const out: Record<string, any> = {}
  for (const [k, v] of Object.entries(row)) out[k] = outValue(v)
  return out
}

/** Un valor listo para viajar como parámetro. */
function inValue(v: any): any {
  if (typeof v === 'boolean') return v ? 1 : 0 // las columnas son INTEGER 0/1
  if (v !== null && typeof v === 'object' && !(v instanceof Date)) {
    // Kapso serializa objetos/arrays a JSON y la D1 guarda el string; las
    // columnas equivalentes en PG son TEXT, así que reciben lo mismo.
    return JSON.stringify(v)
  }
  return v
}

/** Fila lista para escribir: sin `undefined` (los null SÍ se escriben). */
function writable(row: Record<string, any>): Record<string, any> {
  const out: Record<string, any> = {}
  for (const [k, v] of Object.entries(row || {})) {
    if (v === undefined) continue
    out[k] = inValue(v)
  }
  return out
}

/** Filtros validados contra el catálogo. Cada uno es una igualdad, igual que
 *  los query params de Kapso. */
async function pgFilters(table: string, params: Record<string, any>): Promise<[string, any][]> {
  const entries = Object.entries(params || {}).filter(
    ([k, v]) => !CONTROL_PARAMS.has(k) && v !== undefined,
  )
  for (const [col] of entries) await checkColumn(table, col)
  return entries as [string, any][]
}

/**
 * El WHERE como fragmento. SÍNCRONA a propósito: un `sql``…``` es un thenable,
 * y devolverlo desde una función async lo EJECUTARÍA (el await implícito del
 * return). Las columnas ya vienen validadas por pgFilters.
 */
function pgWhere(sql: Sql, filters: [string, any][]) {
  if (filters.length === 0) return sql``
  return filters.reduce(
    (acc: any, [col, val], i) =>
      i === 0
        ? sql`WHERE ${sql(col)} = ${inValue(val)}`
        : sql`${acc} AND ${sql(col)} = ${inValue(val)}`,
    sql`` as any,
  )
}

async function pgGet(table: string, params: Record<string, any>): Promise<any[]> {
  const sql = sqlClient()
  await columnsOf(table)
  const where = pgWhere(sql, await pgFilters(table, params))
  const limit = params?.limit === undefined ? PAGE_SIZE : Number(params.limit)
  const single = params?.id !== undefined

  const page = async (offset: number) => {
    const rows = await sql`
      SELECT * FROM ${sql(table)} ${where} ORDER BY id LIMIT ${limit} OFFSET ${offset}
    `
    return rows.map(outRow)
  }

  if (single) return page(Number(params.offset ?? 0))

  const all: any[] = []
  let offset = Number(params?.offset ?? 0)
  for (let i = 0; i < MAX_PAGES; i++) {
    const rows = await page(offset)
    if (rows.length === 0) break
    all.push(...rows)
    if (rows.length < limit) break
    offset += rows.length
  }
  return all
}

// ── API pública ──────────────────────────────────────────────────────────────

export type GetOptions = {
  /** Segundos de fetch-cache de Next (sólo backend Kapso; ver lib/kapso.ts). */
  revalidate?: number
}

/**
 * Todas las filas de `table` que matcheen `params` (cada param es una
 * igualdad), paginando hasta agotar. `limit`/`offset` son control.
 */
export async function dbGet(
  table: string,
  params: Record<string, any> = {},
  opts: GetOptions = {},
): Promise<any[]> {
  if (usingPostgres()) {
    // Sin esto, las pages que leen por acá no hacen ningún fetch y Next las
    // PRERENDERIZA al build: el dashboard quedaba congelado con los datos del
    // momento del deploy (visto en vivo con TM Motors, 2026-08-26). noStore()
    // marca la request como dinámica — en modo pg cada carga lee la DB fresca.
    noStore()
    return pgGet(table, params)
  }
  const init: RequestInit =
    opts.revalidate === undefined
      ? { cache: 'no-store' }
      : ({ next: { revalidate: opts.revalidate } } as RequestInit)
  return kapsoGet(table, params, init)
}

/** Inserta una fila y devuelve la fila creada (con su id). */
export async function dbPost(table: string, row: Record<string, any>): Promise<any> {
  if (!usingPostgres()) return unwrap(await kapsoWrite('POST', table, {}, row))

  const sql = sqlClient()
  const data = writable(row)
  const cols: string[] = []
  for (const c of Object.keys(data)) cols.push(await checkColumn(table, c))
  if (cols.length === 0) {
    throw new SchemaError(`INSERT vacío en ${JSON.stringify(table)} — no hay ninguna columna que escribir.`)
  }
  const rows = await sql`INSERT INTO ${sql(table)} ${sql(data, ...cols)} RETURNING *`
  return outRow(rows[0]) ?? {}
}

/**
 * Actualiza por `key` (id, o vehicle_id para las transferencias legacy sin id)
 * y devuelve la fila actualizada. `[]` si no existe: es el ghost-write de
 * Kapso, y los 404 del proxy dependen de poder distinguirlo.
 */
export async function dbPatch(
  table: string,
  id: number,
  row: Record<string, any>,
  key: string = 'id',
): Promise<any> {
  if (!usingPostgres()) return unwrap(await kapsoWrite('PATCH', table, { [key]: id }, row))

  const sql = sqlClient()
  await checkColumn(table, key)
  const data = writable(row)
  // Ni la clave del WHERE ni el id se pisan desde el body (algunos forms
  // reenvían la fila entera).
  delete data[key]
  delete data.id
  const cols: string[] = []
  for (const c of Object.keys(data)) cols.push(await checkColumn(table, c))
  if (cols.length === 0) {
    // Kapso acepta un PATCH sin campos: no cambia nada y devuelve la fila (o []
    // si no está). Se reproduce con un SELECT.
    const rows = await pgGet(table, { [key]: id, limit: 1 })
    return rows.length ? rows[0] : []
  }
  const rows = await sql`
    UPDATE ${sql(table)} SET ${sql(data, ...cols)} WHERE ${sql(key)} = ${id} RETURNING *
  `
  if (rows.length === 0) return []
  return rows.length === 1 ? outRow(rows[0]) : rows.map(outRow)
}

/** Borra por `key`. Devuelve lo mismo que el backend, que tampoco distingue
 *  "borré una fila" de "no había ninguna" (el proxy ya chequeó que existía). */
export async function dbDelete(
  table: string,
  id: number,
  key: string = 'id',
): Promise<{ deleted: true; id: number }> {
  if (!usingPostgres()) {
    await kapsoWrite('DELETE', table, { [key]: id })
    return { deleted: true, id }
  }
  const sql = sqlClient()
  await checkColumn(table, key)
  await sql`DELETE FROM ${sql(table)} WHERE ${sql(key)} = ${id}`
  return { deleted: true, id }
}

/**
 * Cuántas filas de `table` tienen `col = value`. Es el guard de huérfanos del
 * proxy ("tiene 3 visitas vinculadas"), no un dato que se muestre.
 *
 * En Kapso se cuenta del lado del cliente: un filtro que el server ignore
 * devolvería la tabla entera y el borrado quedaría bloqueado para siempre.
 */
export async function dbCount(table: string, col: string, value: string | number): Promise<number> {
  if (!usingPostgres()) {
    const rows = await kapsoGet(table, { [col]: value }, { cache: 'no-store' })
    return rows.filter(r => matches(r?.[col], value)).length
  }
  const sql = sqlClient()
  await checkColumn(table, col)
  const rows = await sql<{ n: number }[]>`
    SELECT count(*)::int AS n FROM ${sql(table)} WHERE ${sql(col)} = ${inValue(value)}
  `
  return Number(rows[0]?.n ?? 0)
}

/** Igualdad tolerante al tipo: la D1 devuelve las FK como TEXT ("6") tanto como
 *  number. Es el mismo criterio que `coerceId` de lib/kapso.ts. */
export function matches(cell: any, value: string | number): boolean {
  if (typeof value === 'number') return Number(cell) === value
  return String(cell ?? '') === value
}
