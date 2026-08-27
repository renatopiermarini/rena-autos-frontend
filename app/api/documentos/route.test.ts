/**
 * Lo que fija este suite del proxy de documentos:
 *   · sin las env, 501 y NI SIQUIERA se llama al backend (feature opcional);
 *   · la API key va en el header al backend y NUNCA vuelve en la respuesta;
 *   · el 200 es binario y conserva content-type y content-disposition (el
 *     nombre del archivo lo pone el backend);
 *   · los errores del backend pasan tal cual, con su status y su body — es lo
 *     que el diálogo traduce.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { NextRequest } from 'next/server'

import { POST } from './route'

const OLD_ENV = { ...process.env }

const BODY = {
  tipo: 'recibo_sena', vehicle_id: 7, cliente_id: 3,
  campos_extra: { monto_sena: 2000, precio_total: 25000 }, formato: 'pdf',
}

const pedido = (body: any = BODY) =>
  new NextRequest('http://x/api/documentos', { method: 'POST', body: JSON.stringify(body) })

function mockBackend(res: { status?: number; body?: any; headers?: Record<string, string> }) {
  const calls: { url: string; init: any }[] = []
  vi.stubGlobal('fetch', vi.fn(async (url: string, init: any = {}) => {
    calls.push({ url, init })
    const { status = 200, body = new Uint8Array([0x25, 0x50, 0x44, 0x46]), headers = {} } = res
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
})

describe('POST /api/documentos', () => {
  it('reenvía el body al backend con la X-API-Key y devuelve el archivo', async () => {
    const calls = mockBackend({
      headers: {
        'content-type': 'application/pdf',
        'content-disposition': "attachment; filename=\"x.pdf\"; filename*=UTF-8''Recibo.pdf",
      },
    })
    const res = await POST(pedido())

    expect(calls).toHaveLength(1)
    expect(calls[0].url).toBe('https://backend.test/api/documentos/generar')
    expect(calls[0].init.headers['X-API-Key']).toBe('secreto-de-la-agencia')
    expect(JSON.parse(calls[0].init.body)).toEqual(BODY)

    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('application/pdf')
    expect(res.headers.get('content-disposition')).toContain("filename*=UTF-8''Recibo.pdf")
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(new Uint8Array([0x25, 0x50, 0x44, 0x46]))
  })

  it('la barra final de BACKEND_URL no duplica la barra de la ruta', async () => {
    process.env.BACKEND_URL = 'https://backend.test/'
    const calls = mockBackend({})
    await POST(pedido())
    expect(calls[0].url).toBe('https://backend.test/api/documentos/generar')
  })

  it('sin las env responde 501 y no toca el backend', async () => {
    delete process.env.BACKEND_API_KEY
    const calls = mockBackend({})
    const res = await POST(pedido())
    expect(res.status).toBe(501)
    expect(await res.json()).toMatchObject({ error: 'documentos_no_configurado' })
    expect(calls).toHaveLength(0)
  })

  it('la clave NUNCA aparece en la respuesta', async () => {
    mockBackend({ status: 401, body: JSON.stringify({ detail: 'Unauthorized' }), headers: { 'content-type': 'application/json' } })
    const res = await POST(pedido())
    expect(res.status).toBe(401)
    expect(await res.text()).not.toContain('secreto-de-la-agencia')
  })

  it('el 422 del backend pasa tal cual (faltantes incluidos)', async () => {
    const detalle = { detail: { error: 'Faltan datos para generar el documento', faltantes: ['comprador.dni'] } }
    mockBackend({ status: 422, body: JSON.stringify(detalle), headers: { 'content-type': 'application/json' } })
    const res = await POST(pedido())
    expect(res.status).toBe(422)
    expect(await res.json()).toEqual(detalle)
  })

  it('backend caído → 502 explicado, no una excepción', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('ECONNREFUSED') }))
    const res = await POST(pedido())
    expect(res.status).toBe(502)
    expect(await res.json()).toMatchObject({ error: 'backend_inalcanzable' })
  })

  it('body que no es JSON → 400, sin llamar al backend', async () => {
    const calls = mockBackend({})
    const res = await POST(new NextRequest('http://x/api/documentos', { method: 'POST', body: 'no-json' }))
    expect(res.status).toBe(400)
    expect(calls).toHaveLength(0)
  })
})
