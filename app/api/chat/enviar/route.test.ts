/**
 * Lo que fija este suite del proxy de envío:
 *   · sin las env, 501 y NI SIQUIERA se llama al backend (feature opcional);
 *   · la API key va en el header al backend y NUNCA vuelve en la respuesta;
 *   · sólo viajan los tres campos del contrato, no el body crudo del browser;
 *   · el 503 sin ANTHROPIC_API_KEY pasa con su `detail` intacto — es el texto
 *     que la pantalla le muestra al usuario.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { NextRequest } from 'next/server'

import { POST } from './route'

const OLD_ENV = { ...process.env }

const pedido = (body: unknown) =>
  new NextRequest('http://x/api/chat/enviar', { method: 'POST', body: JSON.stringify(body) })

function mockBackend(res: { status?: number; body?: string; headers?: Record<string, string> } = {}) {
  const calls: { url: string; init: RequestInit }[] = []
  vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit = {}) => {
    calls.push({ url, init })
    const { status = 200, body = '{"id":41,"turn_ref":"abc","estado":"pendiente"}', headers = { 'content-type': 'application/json' } } = res
    return new Response(body, { status, headers })
  }))
  return calls
}

beforeEach(() => {
  process.env.BACKEND_URL = 'https://backend.test'
  process.env.BACKEND_API_KEY = 'secreto-de-la-agencia'
  vi.restoreAllMocks()
})

afterEach(() => {
  process.env = { ...OLD_ENV }
  vi.unstubAllGlobals()
})

describe('POST /api/chat/enviar', () => {
  it('reenvía con la X-API-Key y devuelve el {id, turn_ref}', async () => {
    const calls = mockBackend()
    const res = await POST(pedido({ texto: 'hola' }))

    expect(calls).toHaveLength(1)
    expect(calls[0].url).toBe('https://backend.test/api/chat/enviar')
    expect((calls[0].init.headers as Record<string, string>)['X-API-Key']).toBe('secreto-de-la-agencia')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ id: 41, turn_ref: 'abc', estado: 'pendiente' })
  })

  it('la key NO vuelve en la respuesta al browser', async () => {
    mockBackend()
    const res = await POST(pedido({ texto: 'hola' }))
    const texto = await res.text()
    expect(texto).not.toContain('secreto-de-la-agencia')
    expect(Array.from(res.headers.keys()).join(',').toLowerCase()).not.toContain('api-key')
  })

  it('manda SÓLO los tres campos del contrato', async () => {
    const calls = mockBackend()
    await POST(pedido({
      texto: ' anotá 200 ', media_ref: 'r1', media_nombre: 'cedula.jpg',
      sender: '549111', admin: true,
    }))
    expect(JSON.parse(calls[0].init.body as string)).toEqual({
      texto: ' anotá 200 ', media_ref: 'r1', media_nombre: 'cedula.jpg',
    })
  })

  it('rellena con vacíos lo que el browser no mandó', async () => {
    const calls = mockBackend()
    await POST(pedido({ texto: 'hola' }))
    expect(JSON.parse(calls[0].init.body as string)).toEqual({
      texto: 'hola', media_ref: '', media_nombre: '',
    })
  })

  it('sin las env: 501 y el backend ni se toca', async () => {
    delete process.env.BACKEND_API_KEY
    const calls = mockBackend()
    const res = await POST(pedido({ texto: 'hola' }))
    expect(res.status).toBe(501)
    expect(calls).toHaveLength(0)
    expect((await res.json()).error).toBe('chat_no_configurado')
  })

  it('el 503 del chat sin clave pasa tal cual, con su detail', async () => {
    const detail = 'chat deshabilitado en esta instancia: falta ANTHROPIC_API_KEY.'
    mockBackend({ status: 503, body: JSON.stringify({ detail }) })
    const res = await POST(pedido({ texto: 'hola' }))
    expect(res.status).toBe(503)
    expect((await res.json()).detail).toBe(detail)
  })

  it('body que no es JSON: 400 sin llamar al backend', async () => {
    const calls = mockBackend()
    const req = new NextRequest('http://x/api/chat/enviar', { method: 'POST', body: 'no-json' })
    const res = await POST(req)
    expect(res.status).toBe(400)
    expect(calls).toHaveLength(0)
  })

  it('backend caído: 502 en vez de romper', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('ECONNREFUSED') }))
    const res = await POST(pedido({ texto: 'hola' }))
    expect(res.status).toBe(502)
    expect((await res.json()).error).toBe('backend_inalcanzable')
  })
})
