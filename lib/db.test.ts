/**
 * Tests de la capa de datos dual (lib/db.ts).
 *
 * Dos mitades:
 *
 *  1. Sin DATABASE_URL ⇒ backend Kapso. Lo que se verifica es que la
 *     instancia de Renato sigue haciendo EXACTAMENTE los mismos requests que
 *     hacía el código de antes: URL, headers, método, body, paginación y la
 *     política de "un error HTTP devuelve lo leído hasta ahí". Acá no puede
 *     haber ni un `postgres(...)`: el cliente falso tira si alguien lo toca.
 *
 *  2. Con DATABASE_URL ⇒ backend Postgres, con un cliente falso que renderiza
 *     el SQL. Lo que importa es el ARMADO: identificadores validados contra el
 *     catálogo (whitelist) y valores SIEMPRE por placeholder — ni un dato del
 *     usuario interpolado en el texto de la query.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  dbGet, dbPost, dbPatch, dbDelete, dbCount,
  DbError, SchemaError, usingPostgres, matches,
  __setSqlClient, resetCatalog,
} from '@/lib/db'

// ── Doble del cliente de postgres.js ─────────────────────────────────────────
//
// Reproduce lo justo de la API que usa lib/db.ts:
//   sql`...`            → query (thenable: NO se ejecuta hasta el await)
//   sql('col')          → identificador, se inlinea escapado
//   sql(obj, ...cols)   → helper de INSERT/UPDATE
//   fragmentos anidados → se expanden en el texto
// El texto se renderiza con $1, $2… para que un test pueda afirmar que ningún
// valor viajó dentro del SQL.

type Rendered = { text: string; params: any[] }

function makeFakeSql(rows: (q: Rendered) => any[]) {
  const calls: Rendered[] = []

  const isTemplate = (x: any) => Array.isArray(x) && Array.isArray((x as any).raw)

  function render(strings: readonly string[], args: any[], out: Rendered) {
    strings.forEach((chunk, i) => {
      out.text += chunk
      if (i >= args.length) return
      const arg = args[i]
      if (arg && arg.__ident) {
        out.text += `"${String(arg.__ident).replace(/"/g, '""')}"`
      } else if (arg && arg.__helper) {
        const cols: string[] = arg.cols
        const quoted = cols.map(c => `"${c}"`)
        if (/\bset\s*$/i.test(out.text)) {
          out.text += cols
            .map(c => { out.params.push(arg.row[c]); return `"${c}" = $${out.params.length}` })
            .join(', ')
        } else {
          const values = cols.map(c => { out.params.push(arg.row[c]); return `$${out.params.length}` })
          out.text += `(${quoted.join(', ')}) values (${values.join(', ')})`
        }
      } else if (arg && arg.__query) {
        render(arg.strings, arg.args, out)
      } else {
        out.params.push(arg)
        out.text += `$${out.params.length}`
      }
    })
  }

  const sql: any = (...a: any[]) => {
    if (isTemplate(a[0])) {
      const strings = a[0] as string[]
      const args = a.slice(1)
      const query: any = {
        __query: true,
        strings,
        args,
        then(resolve: any, reject: any) {
          const out: Rendered = { text: '', params: [] }
          try {
            render(strings, args, out)
            out.text = out.text.replace(/\s+/g, ' ').trim()
            calls.push(out)
            resolve(rows(out))
          } catch (e) {
            reject(e)
          }
        },
      }
      return query
    }
    if (typeof a[0] === 'string') return { __ident: a[0] }
    if (Array.isArray(a[0])) return { __ident: a[0].join('", "') }
    return { __helper: true, row: a[0], cols: a.slice(1) }
  }

  sql.calls = calls
  return sql
}

const CATALOG_ROWS = [
  ...['id', 'marca', 'modelo', 'estado', 'precio_compra', 'lavado', 'updated_at', 'cliente_id']
    .map(c => ({ table_name: 'vehicles', column_name: c })),
  ...['id', 'vehicle_id', 'fecha', 'resultado']
    .map(c => ({ table_name: 'visitas', column_name: c })),
  ...['id', 'clave', 'activo', 'routes']
    .map(c => ({ table_name: 'equipo', column_name: c })),
  ...['id', 'cuenta', 'monto', 'afecta_balance']
    .map(c => ({ table_name: 'movimientos_contabilidad', column_name: c })),
]

/** Cliente falso ya con catálogo cargado. `rows` responde el resto de queries. */
function fakePg(rows: (q: Rendered) => any[] = () => []) {
  const sql = makeFakeSql(q =>
    q.text.includes('information_schema.columns') ? CATALOG_ROWS : rows(q),
  )
  __setSqlClient(sql as any)
  return sql
}

/** Las queries que NO son la introspección del catálogo. */
function queries(sql: any): Rendered[] {
  return sql.calls.filter((c: Rendered) => !c.text.includes('information_schema'))
}

const OLD_ENV = { ...process.env }

beforeEach(() => {
  process.env.KAPSO_DB_URL = 'https://api.test/db'
  process.env.KAPSO_API_KEY = 'k-test'
  delete process.env.DATABASE_URL
  __setSqlClient(null)
  resetCatalog()
  vi.restoreAllMocks()
})

afterEach(() => {
  process.env = { ...OLD_ENV }
  __setSqlClient(null)
  resetCatalog()
})

// ── Helpers del doble de fetch ───────────────────────────────────────────────

function jsonRes(data: any, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => data,
  } as any
}

function mockFetch(...responses: any[]) {
  const fn = vi.fn()
  responses.forEach(r => fn.mockResolvedValueOnce(r))
  fn.mockResolvedValue(jsonRes({ data: [] }))
  vi.stubGlobal('fetch', fn)
  return fn
}

const rowsOf = (n: number, from = 0) =>
  Array.from({ length: n }, (_, i) => ({ id: from + i + 1 }))

// ═══════════════════════════════════════════════════════════════════════════
// 1. Backend Kapso (sin DATABASE_URL) — la instancia de Renato, intacta
// ═══════════════════════════════════════════════════════════════════════════

describe('backend Kapso (sin DATABASE_URL)', () => {
  it('usingPostgres() es false y no se construye ningún cliente de Postgres', async () => {
    expect(usingPostgres()).toBe(false)
    __setSqlClient(new Proxy({}, {
      get() { throw new Error('no se puede tocar Postgres sin DATABASE_URL') },
    }) as any)
    mockFetch(jsonRes({ data: [{ id: 1 }] }))
    await expect(dbGet('vehicles')).resolves.toEqual([{ id: 1 }])
  })

  it('DATABASE_URL vacía o en blanco sigue siendo Kapso', () => {
    process.env.DATABASE_URL = ''
    expect(usingPostgres()).toBe(false)
    process.env.DATABASE_URL = '   '
    expect(usingPostgres()).toBe(false)
    process.env.DATABASE_URL = 'postgres://x/y'
    expect(usingPostgres()).toBe(true)
  })

  it('GET pide limit=200 y manda la API key en el header', async () => {
    const fetchMock = mockFetch(jsonRes({ data: [{ id: 1 }] }))
    await dbGet('vehicles')
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://api.test/db/vehicles?limit=200&offset=0')
    expect(init.headers).toEqual({ 'X-API-Key': 'k-test', 'Content-Type': 'application/json' })
    expect(init.cache).toBe('no-store')
  })

  it('sin revalidate va no-store; con revalidate usa el fetch-cache de Next', async () => {
    const fetchMock = mockFetch(jsonRes({ data: [] }))
    await dbGet('vehicles', {}, { revalidate: 15 })
    const init = fetchMock.mock.calls[0][1]
    expect(init.next).toEqual({ revalidate: 15 })
    expect(init.cache).toBeUndefined()
  })

  it('pagina hasta la página parcial', async () => {
    const fetchMock = mockFetch(
      jsonRes({ data: rowsOf(200) }),
      jsonRes({ data: rowsOf(200, 200) }),
      jsonRes({ data: rowsOf(7, 400) }),
    )
    const rows = await dbGet('vehicles')
    expect(rows).toHaveLength(407)
    expect(fetchMock.mock.calls.map(c => c[0])).toEqual([
      'https://api.test/db/vehicles?limit=200&offset=0',
      'https://api.test/db/vehicles?limit=200&offset=200',
      'https://api.test/db/vehicles?limit=200&offset=400',
    ])
  })

  it('un filtro por id es una sola página, sin offset', async () => {
    const fetchMock = mockFetch(jsonRes({ data: [{ id: 7 }] }))
    await dbGet('vehicles', { id: 7 })
    expect(fetchMock.mock.calls).toHaveLength(1)
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.test/db/vehicles?id=7&limit=200')
  })

  it('un error HTTP tira DbError con status, body y lo leído hasta ahí', async () => {
    mockFetch(
      jsonRes({ data: rowsOf(200) }),
      jsonRes({ error: 'boom' }, 500),
    )
    const err = await dbGet('vehicles').catch(e => e)
    expect(err).toBeInstanceOf(DbError)
    expect(err.status).toBe(500)
    expect(err.body).toEqual({ error: 'boom' })
    expect(err.partial).toHaveLength(200)
  })

  it('POST manda el body tal cual (los null se escriben) y devuelve la fila', async () => {
    const fetchMock = mockFetch(jsonRes({ data: { id: 9, marca: 'VW' } }))
    const row = await dbPost('vehicles', { marca: 'VW', modelo: null })
    expect(row).toEqual({ id: 9, marca: 'VW' })
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://api.test/db/vehicles')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body)).toEqual({ marca: 'VW', modelo: null })
  })

  it('PATCH filtra por la key pedida y devuelve [] en el ghost-write', async () => {
    const fetchMock = mockFetch(jsonRes({ data: [] }))
    const out = await dbPatch('transferencias', 12, { estado: 'ok' }, 'vehicle_id')
    expect(out).toEqual([])
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.test/db/transferencias?vehicle_id=12')
    expect(fetchMock.mock.calls[0][1].method).toBe('PATCH')
  })

  it('DELETE responde el contrato del backend y propaga el error con su status', async () => {
    mockFetch(jsonRes(null, 204))
    await expect(dbDelete('vehicles', 3)).resolves.toEqual({ deleted: true, id: 3 })

    mockFetch(jsonRes({ error: 'nope' }, 409))
    const err = await dbDelete('vehicles', 3).catch(e => e)
    expect(err).toBeInstanceOf(DbError)
    expect(err.status).toBe(409)
  })

  it('dbCount re-filtra del lado del cliente: un filtro ignorado no cuenta', async () => {
    mockFetch(jsonRes({ data: [{ vehicle_id: 5 }, { vehicle_id: '5' }, { vehicle_id: 8 }] }))
    await expect(dbCount('visitas', 'vehicle_id', 5)).resolves.toBe(2)

    // El server devuelve la tabla entera ignorando el filtro ⇒ 0, no "hay hijos".
    mockFetch(jsonRes({ data: [{ vehicle_id: 1 }, { vehicle_id: 2 }] }))
    await expect(dbCount('visitas', 'vehicle_id', 5)).resolves.toBe(0)
  })

  it('dbCount por texto compara como texto', async () => {
    mockFetch(jsonRes({ data: [{ cuenta: 'cash' }, { cuenta: 'nexo' }, { cuenta: 'cash' }] }))
    await expect(dbCount('movimientos_contabilidad', 'cuenta', 'cash')).resolves.toBe(2)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// 2. Backend Postgres (con DATABASE_URL)
// ═══════════════════════════════════════════════════════════════════════════

describe('backend Postgres (con DATABASE_URL)', () => {
  beforeEach(() => {
    process.env.DATABASE_URL = 'postgres://user:pw@host:5432/db'
    vi.stubGlobal('fetch', vi.fn(() => { throw new Error('no se le pega a Kapso con DATABASE_URL') }))
  })

  it('no hace ni un fetch: todo va por SQL', async () => {
    const sql = fakePg(() => [{ id: 1 }])
    await dbGet('vehicles')
    expect(queries(sql)).toHaveLength(1)
  })

  it('SELECT con identificadores citados, filtros por placeholder y ORDER BY id', async () => {
    const sql = fakePg(() => [])
    await dbGet('visitas', { vehicle_id: 5 })
    const q = queries(sql)[0]
    expect(q.text).toBe('SELECT * FROM "visitas" WHERE "vehicle_id" = $1 ORDER BY id LIMIT $2 OFFSET $3')
    expect(q.params).toEqual([5, 200, 0])
  })

  it('varios filtros se encadenan con AND, cada valor en su placeholder', async () => {
    const sql = fakePg(() => [])
    await dbGet('vehicles', { estado: 'publicado', marca: "O'Higgins" })
    const q = queries(sql)[0]
    expect(q.text).toContain('WHERE "estado" = $1 AND "marca" = $2')
    expect(q.params).toEqual(['publicado', "O'Higgins", 200, 0])
    // Ni una comilla del valor llegó al texto de la query.
    expect(q.text).not.toContain("O'Higgins")
  })

  it('limit/offset son control, no filtros', async () => {
    const sql = fakePg(() => [])
    await dbGet('vehicles', { limit: 10, offset: 20 })
    const q = queries(sql)[0]
    expect(q.text).not.toContain('WHERE')
    expect(q.params).toEqual([10, 20])
  })

  it('pagina de a 200 como Kapso', async () => {
    let served = 0
    const sql = fakePg(() => {
      const page = served < 400 ? rowsOf(200, served) : rowsOf(3, served)
      served += page.length
      return page
    })
    const rows = await dbGet('vehicles')
    expect(rows).toHaveLength(403)
    expect(queries(sql).map(q => q.params[q.params.length - 1])).toEqual([0, 200, 400])
  })

  it('normaliza la salida como el JSON de Kapso: booleanos 0/1, bigint number, fechas ISO', async () => {
    fakePg(() => [{
      id: BigInt(10), // int8 sin el parser de PG_OPTS (target es5: nada de 10n)
      lavado: true,
      updated_at: new Date('2026-08-25T12:00:00.000Z'),
      estado: null,
    }])
    const [row] = await dbGet('vehicles', { id: 10 })
    expect(row).toEqual({
      id: 10,
      lavado: 1,
      updated_at: '2026-08-25T12:00:00.000Z',
      estado: null,
    })
  })

  it('INSERT con RETURNING; los null se escriben y los undefined se descartan', async () => {
    const sql = fakePg(() => [{ id: 3, marca: 'VW' }])
    const row = await dbPost('vehicles', { marca: 'VW', modelo: null, estado: undefined, lavado: true })
    expect(row).toEqual({ id: 3, marca: 'VW' })
    const q = queries(sql)[0]
    expect(q.text).toBe('INSERT INTO "vehicles" ("marca", "modelo", "lavado") values ($1, $2, $3) RETURNING *')
    expect(q.params).toEqual(['VW', null, 1]) // el boolean se persiste como 0/1
  })

  it('un INSERT sin columnas es SchemaError, no una query vacía', async () => {
    const sql = fakePg(() => [])
    await expect(dbPost('vehicles', { estado: undefined })).rejects.toBeInstanceOf(SchemaError)
    expect(queries(sql)).toHaveLength(0)
  })

  it('UPDATE por id, con la fila normalizada de vuelta', async () => {
    const sql = fakePg(() => [{ id: 4, estado: 'vendido' }])
    const out = await dbPatch('vehicles', 4, { estado: 'vendido', id: 999 })
    expect(out).toEqual({ id: 4, estado: 'vendido' })
    const q = queries(sql)[0]
    // El id del body NO pisa la clave del WHERE.
    expect(q.text).toBe('UPDATE "vehicles" SET "estado" = $1 WHERE "id" = $2 RETURNING *')
    expect(q.params).toEqual(['vendido', 4])
  })

  it('UPDATE por otra key (transferencias legacy sin id)', async () => {
    const sql = fakePg(() => [{ id: 1 }])
    await dbPatch('visitas', 12, { resultado: 'concretada' }, 'vehicle_id')
    expect(queries(sql)[0].text).toContain('WHERE "vehicle_id" = $2')
  })

  it('PATCH de un id inexistente devuelve [] (el ghost-write de Kapso)', async () => {
    fakePg(() => [])
    await expect(dbPatch('vehicles', 404, { estado: 'vendido' })).resolves.toEqual([])
  })

  it('PATCH sin campos escribibles hace un SELECT, no un UPDATE', async () => {
    const sql = fakePg(() => [{ id: 4 }])
    const out = await dbPatch('vehicles', 4, { estado: undefined })
    expect(out).toEqual({ id: 4 })
    expect(queries(sql)[0].text).toContain('SELECT * FROM "vehicles"')
    expect(queries(sql).some(q => q.text.includes('UPDATE'))).toBe(false)
  })

  it('DELETE por placeholder', async () => {
    const sql = fakePg(() => [])
    await expect(dbDelete('vehicles', 8)).resolves.toEqual({ deleted: true, id: 8 })
    const q = queries(sql)[0]
    expect(q.text).toBe('DELETE FROM "vehicles" WHERE "id" = $1')
    expect(q.params).toEqual([8])
  })

  it('dbCount cuenta en la base', async () => {
    const sql = fakePg(() => [{ n: 3 }])
    await expect(dbCount('visitas', 'vehicle_id', 5)).resolves.toBe(3)
    const q = queries(sql)[0]
    expect(q.text).toBe('SELECT count(*)::int AS n FROM "visitas" WHERE "vehicle_id" = $1')
    expect(q.params).toEqual([5])
  })

  it('un objeto/array se guarda como JSON, igual que en la D1', async () => {
    const sql = fakePg(() => [{ id: 1 }])
    await dbPost('equipo', { clave: 'rena', routes: ['stock', 'finanzas'] })
    expect(queries(sql)[0].params).toEqual(['rena', '["stock","finanzas"]'])
  })

  // ── Whitelist ──────────────────────────────────────────────────────────────

  it('tabla fuera del catálogo ⇒ SchemaError 400, sin tocar la base', async () => {
    const sql = fakePg(() => [])
    const err = await dbGet('pg_shadow').catch(e => e)
    expect(err).toBeInstanceOf(SchemaError)
    expect(err.status).toBe(400)
    expect(err.body.error).toBe('esquema_desconocido')
    expect(queries(sql)).toHaveLength(0)
  })

  it('columna inventada en un filtro ⇒ SchemaError', async () => {
    const sql = fakePg(() => [])
    await expect(dbGet('vehicles', { 'id; DROP TABLE vehicles': 1 })).rejects.toBeInstanceOf(SchemaError)
    expect(queries(sql)).toHaveLength(0)
  })

  it('columna inventada en un INSERT o un UPDATE ⇒ SchemaError', async () => {
    fakePg(() => [])
    await expect(dbPost('vehicles', { marca: 'VW', hackeada: 1 })).rejects.toBeInstanceOf(SchemaError)
    await expect(dbPatch('vehicles', 1, { hackeada: 1 })).rejects.toBeInstanceOf(SchemaError)
    await expect(dbDelete('vehicles', 1, 'hackeada')).rejects.toBeInstanceOf(SchemaError)
    await expect(dbCount('vehicles', 'hackeada', 1)).rejects.toBeInstanceOf(SchemaError)
  })

  it('el catálogo se introspecta una sola vez y se cachea', async () => {
    const sql = fakePg(() => [])
    await dbGet('vehicles')
    await dbGet('visitas')
    await dbPost('vehicles', { marca: 'VW' })
    const intro = sql.calls.filter((c: Rendered) => c.text.includes('information_schema'))
    expect(intro).toHaveLength(1)
    expect(intro[0].text).toContain("table_schema = 'public'")
  })

  it('un miss refresca el catálogo una vez antes de fallar (tabla recién migrada)', async () => {
    let extra: any[] = []
    const sql = makeFakeSql(q =>
      q.text.includes('information_schema.columns') ? [...CATALOG_ROWS, ...extra] : [{ id: 1 }],
    )
    __setSqlClient(sql as any)
    await dbGet('vehicles')                                    // carga el catálogo
    extra = [{ table_name: 'colegas', column_name: 'id' }]     // llega la migración
    await expect(dbGet('colegas')).resolves.toEqual([{ id: 1 }])
    expect(sql.calls.filter((c: Rendered) => c.text.includes('information_schema'))).toHaveLength(2)
  })

  it('un fallo al leer el catálogo no queda cacheado', async () => {
    let boom = true
    const sql = makeFakeSql(q => {
      if (q.text.includes('information_schema.columns')) {
        if (boom) throw new Error('conexión caída')
        return CATALOG_ROWS
      }
      return [{ id: 1 }]
    })
    __setSqlClient(sql as any)
    await expect(dbGet('vehicles')).rejects.toThrow('conexión caída')
    boom = false
    await expect(dbGet('vehicles')).resolves.toEqual([{ id: 1 }])
  })
})

describe('matches()', () => {
  it('compara ids con coerción (la D1 devuelve FKs como TEXT)', () => {
    expect(matches('6', 6)).toBe(true)
    expect(matches(6, 6)).toBe(true)
    expect(matches(null, 6)).toBe(false)
    expect(matches('cash', 'cash')).toBe(true)
    expect(matches(null, 'cash')).toBe(false)
  })
})
