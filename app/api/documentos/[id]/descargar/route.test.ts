/**
 * Lo que fija este suite del proxy de descarga:
 *   · los bytes vuelven tal cual con el content-type y el content-disposition
 *     del backend (el nombre real, con tildes, viene en filename*);
 *   · nunca se cachea;
 *   · id inválido 400, sin env 501, error del backend passthrough.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { NextRequest } from 'next/server'

import { GET } from './route'

const OLD_ENV = { ...process.env }

const bajar = (id: string) =>
  GET(new NextRequest(`http://x/api/documentos/${id}/descargar`), { params: Promise.resolve({ id }) })

const PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46])

function mockBackend(res: { status?: number; body?: BodyInit; headers?: Record<string, string> } = {}) {
  const calls: { url: string; init: RequestInit }[] = []
  vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit = {}) => {
    calls.push({ url, init })
    const {
      status = 200,
      body = PDF,
      headers = {
        'content-type': 'application/pdf',
        'content-disposition': "inline; filename=\"titulo.pdf\"; filename*=UTF-8''T%C3%ADtulo.pdf",
      },
    } = res
    return new Response(body, { status, headers })
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

describe('GET /api/documentos/[id]/descargar', () => {
  it('devuelve los bytes con content-type y content-disposition del backend, sin cache', async () => {
    const calls = mockBackend()
    const res = await bajar('41')
    expect(calls[0].url).toBe('https://backend.test/api/documentos/41/descargar')
    expect((calls[0].init.headers as Record<string, string>)['X-API-Key']).toBe('k')
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('application/pdf')
    expect(res.headers.get('content-disposition')).toContain("filename*=UTF-8''T%C3%ADtulo.pdf")
    expect(res.headers.get('cache-control')).toBe('no-store')
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(PDF)
  })

  it('id inválido → 400 sin tocar el backend', async () => {
    const calls = mockBackend()
    expect((await bajar('x')).status).toBe(400)
    expect(calls).toHaveLength(0)
  })

  it('el 404 del backend pasa tal cual', async () => {
    mockBackend({ status: 404, body: '{"detail":"No existe"}', headers: { 'content-type': 'application/json' } })
    const res = await bajar('9')
    expect(res.status).toBe(404)
    expect((await res.json()).detail).toBe('No existe')
  })

  it('sin las env: 501 y el backend ni se toca', async () => {
    delete process.env.BACKEND_API_KEY
    const calls = mockBackend()
    expect((await bajar('1')).status).toBe(501)
    expect(calls).toHaveLength(0)
  })
})
