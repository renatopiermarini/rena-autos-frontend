/**
 * Lo que fija este suite de los dos extremos de la media del chat:
 *   · la subida reenvía el archivo bajo el nombre de campo que el backend
 *     espera (`archivo`) y corta los >10MB antes de cruzar la red;
 *   · la bajada re-streamea los BYTES con su content-type y con las cabeceras
 *     de privacidad — un adjunto es la foto de un DNI, no se cachea ni se
 *     indexa;
 *   · una ref con `../` no sale del backend.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { NextRequest } from 'next/server'

import { POST } from './route'
import { GET } from './[ref]/route'

const OLD_ENV = { ...process.env }

function subida(file: File | null, campo = 'archivo') {
  const fd = new FormData()
  if (file) fd.append(campo, file)
  return new NextRequest('http://x/api/chat/media', { method: 'POST', body: fd })
}

const foto = (bytes = 4, nombre = 'cedula.jpg') =>
  new File([new Uint8Array(bytes)], nombre, { type: 'image/jpeg' })

function mockBackend(res: { status?: number; body?: BodyInit; headers?: Record<string, string> } = {}) {
  const calls: { url: string; init: RequestInit }[] = []
  vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit = {}) => {
    calls.push({ url, init })
    const {
      status = 200,
      body = '{"ref":"abc","tipo":"imagen","mime":"image/jpeg","bytes":4,"nombre":"cedula.jpg","url":"/api/chat/media/abc"}',
      headers = { 'content-type': 'application/json' },
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

describe('POST /api/chat/media', () => {
  it('reenvía el archivo con la key y devuelve la ref', async () => {
    const calls = mockBackend()
    const res = await POST(subida(foto()))

    expect(calls[0].url).toBe('https://backend.test/api/chat/media')
    expect((calls[0].init.headers as Record<string, string>)['X-API-Key']).toBe('k')
    // Reconstruido bajo el nombre de campo del backend, venga como venga.
    const enviado = calls[0].init.body as FormData
    expect(enviado.get('archivo')).toBeInstanceOf(File)
    expect((enviado.get('archivo') as File).name).toBe('cedula.jpg')
    expect((await res.json()).ref).toBe('abc')
  })

  it('sin el campo `archivo` no hay nada que subir: 400 sin llamar al backend', async () => {
    const calls = mockBackend()
    expect((await POST(subida(foto(), 'file'))).status).toBe(400)
    expect((await POST(subida(null))).status).toBe(400)
    expect(calls).toHaveLength(0)
  })

  it('corta los >10MB acá, sin cruzar la red del celular', async () => {
    const calls = mockBackend()
    const gordo = new File([new Uint8Array(10 * 1024 * 1024 + 1)], 'grande.jpg', { type: 'image/jpeg' })
    const res = await POST(subida(gordo))
    expect(res.status).toBe(413)
    expect(calls).toHaveLength(0)
    expect((await res.json()).detail).toContain('10MB')
  })

  it('el 400 del backend por tipo pasa tal cual', async () => {
    mockBackend({ status: 400, body: '{"detail":"Aceptamos imágenes (jpeg, png, webp, heic) y PDF."}' })
    const res = await POST(subida(foto()))
    expect(res.status).toBe(400)
    expect((await res.json()).detail).toContain('PDF')
  })

  it('sin las env: 501 y el backend ni se toca', async () => {
    delete process.env.BACKEND_API_KEY
    const calls = mockBackend()
    expect((await POST(subida(foto()))).status).toBe(501)
    expect(calls).toHaveLength(0)
  })
})

describe('GET /api/chat/media/[ref]', () => {
  const bajar = (ref: string) =>
    GET(new NextRequest(`http://x/api/chat/media/${ref}`), { params: Promise.resolve({ ref }) })

  it('re-streamea los bytes con su content-type', async () => {
    const calls = mockBackend({
      body: new Uint8Array([0x25, 0x50, 0x44, 0x46]),
      headers: { 'content-type': 'application/pdf' },
    })
    const res = await bajar('abc123')

    expect(calls[0].url).toBe('https://backend.test/api/chat/media/abc123')
    expect((calls[0].init.headers as Record<string, string>)['X-API-Key']).toBe('k')
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('application/pdf')
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(new Uint8Array([0x25, 0x50, 0x44, 0x46]))
  })

  it('nunca se cachea ni se indexa: es la foto de un DNI', async () => {
    mockBackend({ body: new Uint8Array([1]), headers: { 'content-type': 'image/jpeg' } })
    const res = await bajar('abc123')
    expect(res.headers.get('cache-control')).toContain('no-store')
    expect(res.headers.get('x-robots-tag')).toContain('noindex')
    expect(res.headers.get('referrer-policy')).toBe('no-referrer')
    expect(res.headers.get('x-content-type-options')).toBe('nosniff')
  })

  it('una ref con path traversal no llega al backend', async () => {
    const calls = mockBackend()
    const res = await bajar('../../etc/passwd')
    expect(res.status).toBe(400)
    expect(calls).toHaveLength(0)
  })

  it('el 404 del backend pasa con su status', async () => {
    mockBackend({ status: 404, body: '{"detail":"not found"}' })
    expect((await bajar('nope')).status).toBe(404)
  })

  it('sin las env: 501', async () => {
    delete process.env.BACKEND_URL
    expect((await bajar('abc')).status).toBe(501)
  })
})
