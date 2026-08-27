/**
 * Lo que fija este suite de la campana:
 *   · el GET pasa la key y devuelve `no_leidas` (el número del globito) tal cual;
 *   · "Marcar leídas" exige un hasta_id > 0 y no reenvía nada más;
 *   · sin las env, 501 en las dos rutas y el backend ni se toca.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { NextRequest } from 'next/server'

import { GET } from './route'
import { POST } from './leer/route'

const OLD_ENV = { ...process.env }

const listar = (qs = '') => GET(new NextRequest(`http://x/api/notificaciones${qs}`))
const leer = (body: unknown) =>
  POST(new NextRequest('http://x/api/notificaciones/leer', {
    method: 'POST', body: JSON.stringify(body),
  }))

function mockBackend(body = '{"notificaciones":[],"no_leidas":0,"last_id":0}', status = 200) {
  const calls: { url: string; init: RequestInit }[] = []
  vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit = {}) => {
    calls.push({ url, init })
    return new Response(body, { status, headers: { 'content-type': 'application/json' } })
  }))
  return calls
}

beforeEach(() => {
  process.env.BACKEND_URL = 'https://backend.test'
  process.env.BACKEND_API_KEY = 'k'
  vi.restoreAllMocks()
})

afterEach(() => {
  process.env = { ...OLD_ENV }
  vi.unstubAllGlobals()
})

describe('GET /api/notificaciones', () => {
  it('manda la key y devuelve los avisos con el contador del globito', async () => {
    const calls = mockBackend(
      '{"notificaciones":[{"id":9,"texto":"Vence el seguro","nivel":"alerta","link":"/tareas","leida":false,"created_at":"2026-08-27T09:00:00-03:00"}],"no_leidas":3,"last_id":9}',
    )
    const res = await listar()

    expect((calls[0].init.headers as Record<string, string>)['X-API-Key']).toBe('k')
    expect(calls[0].url).toContain('/api/notificaciones?')
    const data = await res.json()
    expect(data.no_leidas).toBe(3)
    expect(data.notificaciones[0].nivel).toBe('alerta')
  })

  it('los parámetros por defecto son los de la campana', async () => {
    const calls = mockBackend()
    await listar()
    expect(calls[0].url).toContain('after_id=0')
    expect(calls[0].url).toContain('limit=20')
    expect(calls[0].url).toContain('solo_no_leidas=false')
  })

  it('acota el limit y acepta solo_no_leidas', async () => {
    const calls = mockBackend()
    await listar('?limit=5000&solo_no_leidas=true')
    expect(calls[0].url).toContain('limit=100')
    expect(calls[0].url).toContain('solo_no_leidas=true')
  })

  it('sin las env: 501 y el backend ni se toca', async () => {
    delete process.env.BACKEND_API_KEY
    const calls = mockBackend()
    const res = await listar()
    expect(res.status).toBe(501)
    expect(calls).toHaveLength(0)
    expect((await res.json()).error).toBe('notificaciones_no_configurado')
  })
})

describe('POST /api/notificaciones/leer', () => {
  it('reenvía el hasta_id y devuelve el contador nuevo', async () => {
    const calls = mockBackend('{"marcadas":3,"no_leidas":0}')
    const res = await leer({ hasta_id: 9 })

    expect(calls[0].url).toBe('https://backend.test/api/notificaciones/leer')
    expect(JSON.parse(calls[0].init.body as string)).toEqual({ hasta_id: 9 })
    expect(await res.json()).toEqual({ marcadas: 3, no_leidas: 0 })
  })

  it('rechaza un hasta_id que no marca nada, sin molestar al backend', async () => {
    const calls = mockBackend()
    expect((await leer({ hasta_id: 0 })).status).toBe(400)
    expect((await leer({ hasta_id: -1 })).status).toBe(400)
    expect((await leer({})).status).toBe(400)
    expect(calls).toHaveLength(0)
  })

  it('sin las env: 501', async () => {
    delete process.env.BACKEND_URL
    expect((await leer({ hasta_id: 9 })).status).toBe(501)
  })
})
