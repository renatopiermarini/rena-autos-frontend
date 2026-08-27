/**
 * Lo que fija este suite del proxy del historial:
 *   · el after_id incremental del polling llega tal cual al backend;
 *   · un ?limit=99999 (o basura) se acota antes de salir;
 *   · sin las env, 501 sin tocar el backend.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { NextRequest } from 'next/server'

import { GET } from './route'

const OLD_ENV = { ...process.env }

const pedido = (qs = '') => new NextRequest(`http://x/api/chat/mensajes${qs}`)

function mockBackend(body = '{"mensajes":[],"last_id":0}', status = 200) {
  const calls: { url: string; init: RequestInit }[] = []
  vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit = {}) => {
    calls.push({ url, init })
    return new Response(body, { status, headers: { 'content-type': 'application/json' } })
  }))
  return calls
}

beforeEach(() => {
  process.env.BACKEND_URL = 'https://backend.test/'
  process.env.BACKEND_API_KEY = 'k'
  vi.restoreAllMocks()
})

afterEach(() => {
  process.env = { ...OLD_ENV }
  vi.unstubAllGlobals()
})

describe('GET /api/chat/mensajes', () => {
  it('pasa el after_id del polling y manda la key', async () => {
    const calls = mockBackend()
    const res = await GET(pedido('?after_id=41&limit=50'))
    // La barra final de BACKEND_URL se normaliza: nada de "//api/chat".
    expect(calls[0].url).toBe('https://backend.test/api/chat/mensajes?after_id=41&limit=50')
    expect((calls[0].init.headers as Record<string, string>)['X-API-Key']).toBe('k')
    expect(res.status).toBe(200)
  })

  it('sin parámetros pide desde el principio', async () => {
    const calls = mockBackend()
    await GET(pedido())
    expect(calls[0].url).toContain('after_id=0')
    expect(calls[0].url).toContain('limit=100')
  })

  it('acota el limit y descarta la basura', async () => {
    const calls = mockBackend()
    await GET(pedido('?limit=99999'))
    expect(calls[0].url).toContain('limit=200')
    await GET(pedido('?after_id=-5&limit=abc'))
    expect(calls[1].url).toContain('after_id=0')
    expect(calls[1].url).toContain('limit=100')
  })

  it('devuelve las filas del backend tal cual', async () => {
    mockBackend('{"mensajes":[{"id":7,"rol":"bot","texto":"hola"}],"last_id":7}')
    const res = await GET(pedido())
    expect(await res.json()).toEqual({
      mensajes: [{ id: 7, rol: 'bot', texto: 'hola' }], last_id: 7,
    })
  })

  it('sin las env: 501 y el backend ni se toca', async () => {
    delete process.env.BACKEND_URL
    const calls = mockBackend()
    const res = await GET(pedido())
    expect(res.status).toBe(501)
    expect(calls).toHaveLength(0)
  })
})
