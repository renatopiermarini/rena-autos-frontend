/**
 * El proxy /api/db/[table] después de pasar toda su I/O por lib/db.ts.
 *
 * Corre en modo Kapso (sin DATABASE_URL), que es la instancia de Renato: lo
 * que se fija es que los guards siguen en el mismo orden, con los mismos
 * códigos y los mismos mensajes, y que la respuesta que ve el browser no
 * cambió (envoltorio `{ data }`, 204 sin body en el DELETE, y el status del
 * error tal como vino de Kapso).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { POST, PATCH, DELETE } from './route'
import { __setSqlClient } from '@/lib/db'

const OLD_ENV = { ...process.env }

/** Cliente de Postgres mínimo: entrega el texto de cada query al handler.
 *  (El armado fino del SQL lo cubre lib/db.test.ts.) */
function fakeSql(run: (text: string) => any[]) {
  const sql: any = (...a: any[]) => {
    if (Array.isArray(a[0]) && Array.isArray((a[0] as any).raw)) {
      const text = (a[0] as string[]).join(' ')
      return {
        then: (resolve: any, reject: any) => {
          try { resolve(run(text)) } catch (e) { reject(e) }
        },
      }
    }
    return {}
  }
  return sql
}

type Handler = (url: URL, init: any) => { status?: number; body?: any }

/** Enruta los fetch por tabla+método, como haría la REST de Kapso. */
function mockKapso(handler: Handler) {
  const calls: { url: string; method: string; body: any }[] = []
  const fn = vi.fn(async (url: string, init: any = {}) => {
    calls.push({
      url,
      method: init.method ?? 'GET',
      body: init.body ? JSON.parse(init.body) : undefined,
    })
    const { status = 200, body = {} } = handler(new URL(url), init) ?? {}
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
    } as any
  })
  vi.stubGlobal('fetch', fn)
  return calls
}

const req = (url: string, method: string, body?: any) =>
  new NextRequest(url, {
    method,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })

const ctx = (table: string) => ({ params: Promise.resolve({ table }) })

beforeEach(() => {
  process.env.KAPSO_DB_URL = 'https://api.test/db'
  process.env.KAPSO_API_KEY = 'k-test'
  delete process.env.DATABASE_URL
  vi.restoreAllMocks()
})

afterEach(() => {
  process.env = { ...OLD_ENV }
})

describe('proxy /api/db/[table]', () => {
  it('rechaza una tabla fuera del ALLOWED', async () => {
    const calls = mockKapso(() => ({ body: { data: [] } }))
    const res = await POST(req('http://x/api/db/audit_log', 'POST', { a: 1 }), ctx('audit_log'))
    expect(res.status).toBe(403)
    expect(calls).toHaveLength(0)
  })

  it('valida los enums antes de escribir', async () => {
    const calls = mockKapso(() => ({ body: { data: [] } }))
    const res = await POST(
      req('http://x/api/db/vehicles', 'POST', { estado: 'inventado' }),
      ctx('vehicles'),
    )
    expect(res.status).toBe(400)
    expect((await res.json()).message).toContain('`estado` inválido')
    expect(calls).toHaveLength(0)
  })

  it('POST bueno: escribe y devuelve la fila envuelta en `data`', async () => {
    const calls = mockKapso(u =>
      u.pathname.endsWith('/vehicles') ? { body: { data: { id: 42, marca: 'VW' } } } : { body: { data: [] } },
    )
    const res = await POST(
      req('http://x/api/db/vehicles', 'POST', { marca: 'VW', estado: 'publicado' }),
      ctx('vehicles'),
    )
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ data: { id: 42, marca: 'VW' } })
    const write = calls.find(c => c.method === 'POST')!
    expect(write.url).toBe('https://api.test/db/vehicles')
    expect(write.body).toEqual({ marca: 'VW', estado: 'publicado' })
  })

  it('PATCH de una fila que no existe: 404 y no se escribe nada', async () => {
    const calls = mockKapso(() => ({ body: { data: [] } })) // ninguna fila matchea
    const res = await PATCH(
      req('http://x/api/db/vehicles?id=7', 'PATCH', { marca: 'VW' }),
      ctx('vehicles'),
    )
    expect(res.status).toBe(404)
    expect((await res.json()).error).toBe('no_existe')
    expect(calls.some(c => c.method === 'PATCH')).toBe(false)
  })

  it('PATCH bueno: pasa la key del filtro a Kapso', async () => {
    const calls = mockKapso(u => ({ body: { data: u.searchParams.has('id') ? [{ id: 7 }] : [] } }))
    const res = await PATCH(
      req('http://x/api/db/vehicles?id=7', 'PATCH', { marca: 'VW' }),
      ctx('vehicles'),
    )
    expect(res.status).toBe(200)
    const write = calls.find(c => c.method === 'PATCH')!
    expect(write.url).toBe('https://api.test/db/vehicles?id=7')
  })

  it('un error de Kapso vuelve con SU status y SU body', async () => {
    mockKapso((u, init) =>
      (init.method ?? 'GET') === 'GET'
        ? { body: { data: [{ id: 7 }] } }        // la fila existe…
        : { status: 502, body: { error: 'kapso_caido' } }, // …pero el write falla
    )
    const res = await PATCH(
      req('http://x/api/db/vehicles?id=7', 'PATCH', { marca: 'VW' }),
      ctx('vehicles'),
    )
    expect(res.status).toBe(502)
    expect(await res.json()).toEqual({ error: 'kapso_caido' })
  })

  it('DELETE con hijos vinculados: 409 con la cuenta', async () => {
    mockKapso(u => {
      if (u.pathname.endsWith('/vehicles')) return { body: { data: [{ id: 5 }] } }
      if (u.pathname.endsWith('/visitas')) {
        return { body: { data: [{ vehicle_id: 5 }, { vehicle_id: 5 }] } }
      }
      return { body: { data: [] } }
    })
    const res = await DELETE(req('http://x/api/db/vehicles?id=5', 'DELETE'), ctx('vehicles'))
    expect(res.status).toBe(409)
    expect((await res.json()).message).toContain('2 visita(s)')
  })

  it('DELETE bueno: 204 sin body', async () => {
    const calls = mockKapso(u =>
      u.pathname.endsWith('/vehicles') && u.searchParams.has('id')
        ? { body: { data: [{ id: 5 }] } }
        : { body: { data: [] } },
    )
    const res = await DELETE(req('http://x/api/db/vehicles?id=5', 'DELETE'), ctx('vehicles'))
    expect(res.status).toBe(204)
    expect(await res.text()).toBe('')
    const del = calls.find(c => c.method === 'DELETE')!
    expect(del.url).toBe('https://api.test/db/vehicles?id=5')
  })

  it('DELETE sin filtro no borra la tabla entera', async () => {
    const calls = mockKapso(() => ({ body: { data: [] } }))
    const res = await DELETE(req('http://x/api/db/vehicles', 'DELETE'), ctx('vehicles'))
    expect(res.status).toBe(400)
    expect(calls).toHaveLength(0)
  })

  it('con DATABASE_URL el mismo proxy escribe en Postgres, sin un solo fetch', async () => {
    process.env.DATABASE_URL = 'postgres://u:p@h:5432/d'
    const calls = mockKapso(() => ({ body: { data: [] } }))
    const texts: string[] = []
    __setSqlClient(fakeSql(t => {
      texts.push(t)
      if (t.includes('information_schema')) {
        return ['id', 'marca', 'estado'].map(c => ({ table_name: 'vehicles', column_name: c }))
      }
      return [{ id: 42, marca: 'VW' }]
    }))

    const res = await POST(
      req('http://x/api/db/vehicles', 'POST', { marca: 'VW', estado: 'publicado' }),
      ctx('vehicles'),
    )
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ data: { id: 42, marca: 'VW' } })
    expect(calls).toHaveLength(0)
    expect(texts.some(t => t.includes('INSERT INTO'))).toBe(true)
    __setSqlClient(null)
  })

  it('`asignado` se valida contra la tabla equipo', async () => {
    mockKapso(u =>
      u.pathname.endsWith('/equipo')
        ? { body: { data: [{ clave: 'tincho', activo: 1 }] } }
        : { body: { data: [] } },
    )
    const ok = await POST(
      req('http://x/api/db/tareas', 'POST', { titulo: 'x', asignado: 'tincho' }),
      ctx('tareas'),
    )
    expect(ok.status).toBe(200)

    const bad = await POST(
      req('http://x/api/db/tareas', 'POST', { titulo: 'x', asignado: 'rena' }),
      ctx('tareas'),
    )
    expect(bad.status).toBe(400)
    expect((await bad.json()).message).toContain('`asignado` inválido')
  })
})
