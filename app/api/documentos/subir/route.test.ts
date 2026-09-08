/**
 * Lo que fija este suite del proxy de subida:
 *   · el multipart se reenvía RECONSTRUIDO (archivo con su nombre + los campos
 *     de texto: vehicle_id, tipo, clasificar, tildar) con la key;
 *   · sin `archivo` es 400 y >10 MB es 413, sin cruzar la red;
 *   · el status y el body del backend vuelven tal cual (201 con sugerencia,
 *     422, 501 "no está en Postgres");
 *   · sin las env, 501 y el backend ni se toca.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { NextRequest } from 'next/server'

import { POST } from './route'

const OLD_ENV = { ...process.env }

const pedido = (fd: FormData) => POST(new NextRequest('http://x/api/documentos/subir', { method: 'POST', body: fd }))

const foto = (bytes = 4, nombre = 'titulo.jpg') =>
  new File([new Uint8Array(bytes)], nombre, { type: 'image/jpeg' })

function formCompleto() {
  const fd = new FormData()
  fd.append('archivo', foto(), 'titulo.jpg')
  fd.append('vehicle_id', '7')
  fd.append('tipo', 'titulo')
  fd.append('clasificar', 'false')
  fd.append('tildar', 'true')
  return fd
}

function mockBackend(res: { status?: number; body?: string; headers?: Record<string, string> } = {}) {
  const calls: { url: string; init: RequestInit }[] = []
  vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit = {}) => {
    calls.push({ url, init })
    const {
      status = 201,
      body = '{"documento":{"id":1,"tipo":"titulo"}}',
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

describe('POST /api/documentos/subir', () => {
  it('reenvía el archivo y los campos con la key; el 201 vuelve tal cual', async () => {
    const calls = mockBackend()
    const res = await pedido(formCompleto())

    expect(calls[0].url).toBe('https://backend.test/api/documentos/subir')
    expect((calls[0].init.headers as Record<string, string>)['X-API-Key']).toBe('k')
    const fd = calls[0].init.body as FormData
    const archivo = fd.get('archivo') as File
    expect(archivo.name).toBe('titulo.jpg')
    expect(archivo.size).toBe(4)
    expect(fd.get('vehicle_id')).toBe('7')
    expect(fd.get('tipo')).toBe('titulo')
    expect(fd.get('clasificar')).toBe('false')
    expect(fd.get('tildar')).toBe('true')

    expect(res.status).toBe(201)
    expect(await res.json()).toEqual({ documento: { id: 1, tipo: 'titulo' } })
  })

  it('sin archivo: 400 sin tocar el backend', async () => {
    const calls = mockBackend()
    const fd = new FormData()
    fd.append('vehicle_id', '7')
    const res = await pedido(fd)
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('archivo_faltante')
    expect(calls).toHaveLength(0)
  })

  it('más de 10 MB: 413 acá, sin cruzar la red', async () => {
    const calls = mockBackend()
    const fd = new FormData()
    fd.append('archivo', foto(10 * 1024 * 1024 + 1), 'gordo.jpg')
    const res = await pedido(fd)
    expect(res.status).toBe(413)
    expect(calls).toHaveLength(0)
  })

  it('el 501 "no está en Postgres" y el 422 del backend pasan tal cual', async () => {
    mockBackend({ status: 501, body: '{"detail":"Esta instancia no guarda documentos"}' })
    const res = await pedido(formCompleto())
    expect(res.status).toBe(501)
    expect((await res.json()).detail).toContain('no guarda documentos')

    mockBackend({ status: 422, body: '{"detail":{"error":"tipo inválido"}}' })
    expect((await pedido(formCompleto())).status).toBe(422)
  })

  it('sin las env: 501 y el backend ni se toca', async () => {
    delete process.env.BACKEND_URL
    const calls = mockBackend()
    const res = await pedido(formCompleto())
    expect(res.status).toBe(501)
    expect((await res.json()).error).toBe('documentos_no_configurado')
    expect(calls).toHaveLength(0)
  })

  it('backend caído → 502 explicado', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('ECONNREFUSED') }))
    const res = await pedido(formCompleto())
    expect(res.status).toBe(502)
    expect((await res.json()).error).toBe('backend_inalcanzable')
  })
})
