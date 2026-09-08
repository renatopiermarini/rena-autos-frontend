/**
 * Lo que fija este suite del proxy de IA:
 *   · sólo salen las acciones del catálogo (404 el resto);
 *   · el multipart se reenvía RECONSTRUIDO con todos los campos (archivos con
 *     su nombre, textos tal cual) y la key, y corta los >10 MB antes de cruzar;
 *   · el JSON pasa por proxyBackend con la key y el content-type;
 *   · el status del backend (503 cost cap, 422) vuelve tal cual;
 *   · sin las env, 501 y el backend ni se toca.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { NextRequest } from 'next/server'

import { POST } from './route'

const OLD_ENV = { ...process.env }

const llamar = (accion: string, init: ConstructorParameters<typeof NextRequest>[1]) =>
  POST(new NextRequest(`http://x/api/ia/${accion}`, init), { params: Promise.resolve({ accion }) })

const json = (accion: string, body: unknown) =>
  llamar(accion, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })

const multipart = (accion: string, fd: FormData) => llamar(accion, { method: 'POST', body: fd })

const foto = (bytes = 4, nombre = 'cedula.jpg') =>
  new File([new Uint8Array(bytes)], nombre, { type: 'image/jpeg' })

function mockBackend(res: { status?: number; body?: string; headers?: Record<string, string> } = {}) {
  const calls: { url: string; init: RequestInit }[] = []
  vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit = {}) => {
    calls.push({ url, init })
    const { status = 200, body = '{"marca":"Ford"}', headers = { 'content-type': 'application/json' } } = res
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

describe('POST /api/ia/[accion] — catálogo y gate', () => {
  it('una acción que no está en el catálogo es 404 sin tocar el backend', async () => {
    const calls = mockBackend()
    for (const a of ['chat', '../notificaciones', 'VEHICULO-DESDE-DOCUMENTO']) {
      const res = await json(a, { texto: 'x' })
      expect(res.status).toBe(404)
      expect((await res.json()).error).toBe('accion_desconocida')
    }
    expect(calls).toHaveLength(0)
  })

  it('sin las env: 501 y el backend ni se toca', async () => {
    delete process.env.BACKEND_API_KEY
    const calls = mockBackend()
    const res = await json('parsear-agenda', { texto: 'x' })
    expect(res.status).toBe(501)
    expect((await res.json()).error).toBe('ia_no_configurado')
    expect(calls).toHaveLength(0)
  })
})

describe('POST /api/ia/[accion] — JSON', () => {
  it('reenvía el body con la key y el content-type', async () => {
    const calls = mockBackend({ body: '{"tipo":"visita"}' })
    const res = await json('parsear-agenda', { texto: 'visita de Juan mañana 15hs', hoy: '2026-09-07' })

    expect(calls[0].url).toBe('https://backend.test/api/ia/parsear-agenda')
    const headers = calls[0].init.headers as Record<string, string>
    expect(headers['X-API-Key']).toBe('k')
    expect(headers['Content-Type']).toBe('application/json')
    expect(JSON.parse(calls[0].init.body as string)).toEqual({ texto: 'visita de Juan mañana 15hs', hoy: '2026-09-07' })
    expect(await res.json()).toEqual({ tipo: 'visita' })
  })

  it('un body que no es JSON es 400 sin llamar al backend', async () => {
    const calls = mockBackend()
    const res = await llamar('parsear-agenda', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: '{no',
    })
    expect(res.status).toBe(400)
    expect(calls).toHaveLength(0)
  })

  it('el 503 del cost cap y el 422 de validación pasan tal cual', async () => {
    mockBackend({ status: 503, body: '{"detail":"Tope de gasto alcanzado."}' })
    const r503 = await json('resumir-seguimiento', { texto: 'x' })
    expect(r503.status).toBe(503)
    expect((await r503.json()).detail).toContain('Tope')

    mockBackend({ status: 422, body: '{"detail":{"error":"inválido","detalles":["dominio: Dominio inválido"]}}' })
    const r422 = await json('interesado-desde-chat', { texto: 'x' })
    expect(r422.status).toBe(422)
    expect((await r422.json()).detail.detalles).toHaveLength(1)
  })

  it('backend caído: 502', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('fetch failed') }))
    const res = await json('parsear-agenda', { texto: 'x' })
    expect(res.status).toBe(502)
    expect((await res.json()).error).toBe('backend_inalcanzable')
  })
})

describe('POST /api/ia/[accion] — multipart', () => {
  it('reconstruye TODOS los campos: archivos con nombre, textos tal cual, y la key', async () => {
    const calls = mockBackend()
    const fd = new FormData()
    fd.append('frente', foto(4, 'dni-frente.jpg'))
    fd.append('dorso', foto(4, 'dni-dorso.jpg'))
    fd.append('hoy', '2026-09-07')
    const res = await multipart('cliente-desde-dni', fd)

    expect(res.status).toBe(200)
    expect(calls[0].url).toBe('https://backend.test/api/ia/cliente-desde-dni')
    const headers = calls[0].init.headers as Record<string, string>
    expect(headers['X-API-Key']).toBe('k')
    // Sin Content-Type a mano: el boundary lo pone fetch.
    expect(headers['Content-Type']).toBeUndefined()
    const enviado = calls[0].init.body as FormData
    expect(enviado.get('frente')).toBeInstanceOf(File)
    expect((enviado.get('frente') as File).name).toBe('dni-frente.jpg')
    expect((enviado.get('dorso') as File).name).toBe('dni-dorso.jpg')
    expect(enviado.get('hoy')).toBe('2026-09-07')
  })

  it('sin ningún archivo no hay nada que analizar: 400 sin llamar al backend', async () => {
    const calls = mockBackend()
    const fd = new FormData()
    fd.append('hoy', '2026-09-07')
    expect((await multipart('vehiculo-desde-documento', fd)).status).toBe(400)
    expect(calls).toHaveLength(0)
  })

  it('corta los >10 MB acá, sin cruzar la red', async () => {
    const calls = mockBackend()
    const fd = new FormData()
    fd.append('archivo', new File([new Uint8Array(10 * 1024 * 1024 + 1)], 'grande.jpg', { type: 'image/jpeg' }))
    const res = await multipart('vehiculo-desde-documento', fd)
    expect(res.status).toBe(413)
    expect(calls).toHaveLength(0)
    expect((await res.json()).detail).toContain('10 MB')
  })

  it('el 400 del backend por tipo pasa tal cual', async () => {
    mockBackend({ status: 400, body: '{"detail":"Aceptamos imágenes (jpeg, png, webp, heic) y PDF."}' })
    const fd = new FormData()
    fd.append('archivo', foto())
    const res = await multipart('clasificar-documento', fd)
    expect(res.status).toBe(400)
    expect((await res.json()).detail).toContain('PDF')
  })
})
