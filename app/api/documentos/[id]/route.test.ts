/**
 * Lo que fija este suite del DELETE de un archivo:
 *   · el id se valida (sólo dígitos) antes de componer la URL del backend;
 *   · el 204 vuelve como 204 sin body; otros status pasan tal cual;
 *   · sin las env, 501; backend caído, 502.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { NextRequest } from 'next/server'

import { DELETE } from './route'

const OLD_ENV = { ...process.env }

const borrar = (id: string) =>
  DELETE(new NextRequest(`http://x/api/documentos/${id}`, { method: 'DELETE' }), { params: Promise.resolve({ id }) })

function mockBackend(res: { status?: number; body?: string | null } = {}) {
  const calls: { url: string; init: RequestInit }[] = []
  vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit = {}) => {
    calls.push({ url, init })
    const { status = 204, body = null } = res
    return new Response(body, { status, headers: body ? { 'content-type': 'application/json' } : {} })
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

describe('DELETE /api/documentos/[id]', () => {
  it('manda el DELETE con la key y devuelve 204', async () => {
    const calls = mockBackend()
    const res = await borrar('41')
    expect(calls[0].url).toBe('https://backend.test/api/documentos/41')
    expect(calls[0].init.method).toBe('DELETE')
    expect((calls[0].init.headers as Record<string, string>)['X-API-Key']).toBe('k')
    expect(res.status).toBe(204)
  })

  it('un id que no es un entero positivo es 400 sin tocar el backend', async () => {
    const calls = mockBackend()
    for (const malo of ['abc', '-1', '0', '1.5', '..']) {
      expect((await borrar(malo)).status).toBe(400)
    }
    expect(calls).toHaveLength(0)
  })

  it('el 404 del backend pasa tal cual', async () => {
    mockBackend({ status: 404, body: '{"detail":"No existe el documento #9"}' })
    const res = await borrar('9')
    expect(res.status).toBe(404)
    expect((await res.json()).detail).toContain('No existe')
  })

  it('sin las env: 501; backend caído: 502', async () => {
    delete process.env.BACKEND_URL
    expect((await borrar('1')).status).toBe(501)
    process.env.BACKEND_URL = 'https://backend.test'
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('ECONNREFUSED') }))
    expect((await borrar('1')).status).toBe(502)
  })
})
