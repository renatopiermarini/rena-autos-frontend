/**
 * Roundtrip real contra un Postgres de verdad — el único test que prueba que
 * lo que arma lib/db.ts lo entiende postgres.js y lo entiende el motor.
 *
 * GATED: corre sólo con `PG_TEST_URL` en el entorno. Sin esa variable se saltea
 * limpio (no se asume ningún Postgres local corriendo):
 *
 *   PG_TEST_URL='postgres://user:pw@host:5432/db' npx vitest run lib/db.integration
 *
 * Crea y tira sus propias dos tablas (prefijo `it_`), no toca nada más.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import postgres from 'postgres'
import { dbGet, dbPost, dbPatch, dbDelete, dbCount, __setSqlClient, resetCatalog } from '@/lib/db'

const PG_URL = process.env.PG_TEST_URL
const suite = PG_URL ? describe : describe.skip

const AUTOS = 'it_autos'
const VISITAS = 'it_visitas'

suite('roundtrip real contra Postgres', () => {
  let admin: ReturnType<typeof postgres>

  beforeAll(async () => {
    process.env.DATABASE_URL = PG_URL
    delete process.env.KAPSO_DB_URL
    __setSqlClient(null)
    resetCatalog()

    admin = postgres(PG_URL!, { max: 1, prepare: false })
    await admin.unsafe(`DROP TABLE IF EXISTS ${VISITAS}, ${AUTOS}`)
    // Mismos tipos que db/migrations/0001_base.sql: id BIGSERIAL, fechas TEXT,
    // booleanos INTEGER 0/1, montos DOUBLE PRECISION.
    await admin.unsafe(`
      CREATE TABLE ${AUTOS} (
        id             BIGSERIAL PRIMARY KEY,
        marca          TEXT,
        modelo         TEXT,
        precio_compra  DOUBLE PRECISION,
        lavado         INTEGER DEFAULT 0,
        updated_at     TEXT
      )`)
    await admin.unsafe(`
      CREATE TABLE ${VISITAS} (
        id          BIGSERIAL PRIMARY KEY,
        vehicle_id  BIGINT,
        resultado   TEXT
      )`)
  })

  afterAll(async () => {
    if (!admin) return
    await admin.unsafe(`DROP TABLE IF EXISTS ${VISITAS}, ${AUTOS}`)
    await admin.end({ timeout: 5 })
    const { sqlClient } = await import('@/lib/db')
    await (sqlClient() as any).end({ timeout: 5 })
    __setSqlClient(null)
  })

  it('POST devuelve la fila con id numérico y respeta null / boolean 0-1', async () => {
    const row = await dbPost(AUTOS, {
      marca: "O'Higgins", // comillas: si se interpolara, la query explota
      modelo: null,
      precio_compra: 12500.5,
      lavado: true,
      updated_at: '2026-08-25T12:00:00.000Z',
    })
    expect(typeof row.id).toBe('number')
    expect(row).toMatchObject({
      marca: "O'Higgins",
      modelo: null,
      precio_compra: 12500.5,
      lavado: 1,
      updated_at: '2026-08-25T12:00:00.000Z',
    })
  })

  it('GET filtra, ordena por id y pagina', async () => {
    const rows = await dbGet(AUTOS, { marca: "O'Higgins" })
    expect(rows).toHaveLength(1)
    expect(await dbGet(AUTOS, { marca: 'no-existe' })).toEqual([])

    const all = await dbGet(AUTOS)
    expect(all.map(r => r.id)).toEqual([...all.map(r => r.id)].sort((a, b) => a - b))
  })

  it('PATCH actualiza y devuelve la fila; un id inexistente devuelve []', async () => {
    const [auto] = await dbGet(AUTOS, { marca: "O'Higgins" })
    const out = await dbPatch(AUTOS, auto.id, { modelo: 'Gol', lavado: false })
    expect(out).toMatchObject({ modelo: 'Gol', lavado: 0 })
    expect(await dbPatch(AUTOS, 999_999, { modelo: 'x' })).toEqual([])
  })

  it('dbCount cuenta los hijos vinculados', async () => {
    const [auto] = await dbGet(AUTOS, { marca: "O'Higgins" })
    await dbPost(VISITAS, { vehicle_id: auto.id, resultado: 'pendiente' })
    await dbPost(VISITAS, { vehicle_id: auto.id, resultado: 'concretada' })
    expect(await dbCount(VISITAS, 'vehicle_id', auto.id)).toBe(2)
    expect(await dbCount(VISITAS, 'vehicle_id', 999_999)).toBe(0)
    expect(await dbCount(VISITAS, 'resultado', 'pendiente')).toBe(1)
  })

  it('DELETE borra de verdad', async () => {
    const [auto] = await dbGet(AUTOS, { marca: "O'Higgins" })
    expect(await dbDelete(AUTOS, auto.id)).toEqual({ deleted: true, id: auto.id })
    expect(await dbGet(AUTOS, { id: auto.id })).toEqual([])
  })

  it('una tabla que no está en el esquema no se puede tocar', async () => {
    await expect(dbGet('it_tabla_que_no_existe')).rejects.toThrow(/tabla desconocida/)
    await expect(dbGet(AUTOS, { columna_inventada: 1 })).rejects.toThrow(/columna desconocida/)
  })
})
