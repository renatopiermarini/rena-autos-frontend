/**
 * El alta de movimientos después de pasar su I/O por lib/db.ts.
 *
 * Las reglas de validación viven en lib/movimiento.ts y ya tienen sus tests;
 * acá lo que se fija es la parte que toca la base: de dónde salen las cuentas
 * válidas, qué se POSTea y qué se responde (incluido el passthrough del error).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { POST } from './route'

const OLD_ENV = { ...process.env }

function mockKapso(handler: (url: URL, init: any) => { status?: number; body?: any }) {
  const calls: { url: string; method: string; body: any }[] = []
  const fn = vi.fn(async (url: string, init: any = {}) => {
    calls.push({ url, method: init.method ?? 'GET', body: init.body ? JSON.parse(init.body) : undefined })
    const { status = 200, body = {} } = handler(new URL(url), init) ?? {}
    return { ok: status >= 200 && status < 300, status, json: async () => body } as any
  })
  vi.stubGlobal('fetch', fn)
  return calls
}

const alta = (body: any) =>
  new NextRequest('http://x/api/finanzas/movimiento', { method: 'POST', body: JSON.stringify(body) })

const MOV = { tipo: 'egreso', cuenta: 'cash', monto: 1500, categoria: 'general_expense', descripcion: 'nafta' }

beforeEach(() => {
  process.env.KAPSO_DB_URL = 'https://api.test/db'
  process.env.KAPSO_API_KEY = 'k-test'
  delete process.env.DATABASE_URL
  vi.restoreAllMocks()
})

afterEach(() => {
  process.env = { ...OLD_ENV }
})

describe('POST /api/finanzas/movimiento', () => {
  it('escribe la fila en movimientos_contabilidad y la devuelve envuelta en `data`', async () => {
    const calls = mockKapso(u =>
      u.pathname.endsWith('/cuentas')
        ? { body: { data: [{ clave: 'cash', activa: 1, orden: 1 }] } }
        : { body: { data: { id: 77 } } },
    )
    const res = await POST(alta(MOV))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ data: { id: 77 } })

    const write = calls.find(c => c.method === 'POST')!
    expect(write.url).toBe('https://api.test/db/movimientos_contabilidad')
    expect(write.body).toMatchObject({ tipo: 'egreso', cuenta: 'cash', monto: 1500 })
    // Lo que hace que la fila cuente para el saldo.
    expect(write.body.afecta_balance).toBe(1)
  })

  it('sin tabla `cuentas` cae a las cuentas por defecto', async () => {
    const calls = mockKapso(u =>
      u.pathname.endsWith('/cuentas')
        ? { status: 404, body: { error: 'not found' } }
        : { body: { data: { id: 1 } } },
    )
    const res = await POST(alta(MOV))
    expect(res.status).toBe(200)
    expect(calls.some(c => c.method === 'POST')).toBe(true)
  })

  it('una cuenta que no está en la tabla se rechaza sin escribir', async () => {
    const calls = mockKapso(u =>
      u.pathname.endsWith('/cuentas')
        ? { body: { data: [{ clave: 'nexo', activa: 1 }] } }
        : { body: { data: {} } },
    )
    const res = await POST(alta({ ...MOV, cuenta: 'cash' }))
    expect(res.status).toBe(400)
    expect((await res.json()).message).toContain('`cuenta` inválida')
    expect(calls.some(c => c.method === 'POST')).toBe(false)
  })

  it('si la escritura falla, vuelve el status y el body de la base', async () => {
    mockKapso(u =>
      u.pathname.endsWith('/cuentas')
        ? { body: { data: [{ clave: 'cash', activa: 1 }] } }
        : { status: 503, body: { error: 'kapso_caido' } },
    )
    const res = await POST(alta(MOV))
    expect(res.status).toBe(503)
    expect(await res.json()).toEqual({ error: 'kapso_caido' })
  })
})
