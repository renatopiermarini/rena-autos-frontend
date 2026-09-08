/**
 * Lo que fija este suite del proxy de "preparar" (faltantes en vivo):
 *   · el body JSON va al backend con la key y vuelve su 200 {ok, faltantes,
 *     detalles} tal cual;
 *   · un body que no es JSON es 400 sin tocar el backend;
 *   · sin las env, 501; backend caído, 502.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { NextRequest } from 'next/server'

import { POST } from './route'

const OLD_ENV = { ...process.env }

const BODY = { tipo: 'recibo_pago', vehicle_id: 7, cliente_id: 3, campos_extra: { monto_pagado: 100 }, formato: 'pdf' }

const pedido = (body: string) =>
  POST(new NextRequest('http://x/api/documentos/preparar', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body,
  }))

function mockBackend(res: { status?: number; body?: string } = {}) {
  const calls: { url: string; init: RequestInit }[] = []
  vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit = {}) => {
    calls.push({ url, init })
    const { status = 200, body = '{"ok":false,"faltantes":["comprador.dni"],"detalles":[]}' } = res
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

describe('POST /api/documentos/preparar', () => {
  it('reenvía el body con la key y devuelve el {ok, faltantes, detalles} del backend', async () => {
    const calls = mockBackend()
    const res = await pedido(JSON.stringify(BODY))
    expect(calls[0].url).toBe('https://backend.test/api/documentos/preparar')
    const headers = calls[0].init.headers as Record<string, string>
    expect(headers['X-API-Key']).toBe('k')
    expect(headers['Content-Type']).toBe('application/json')
    expect(JSON.parse(calls[0].init.body as string)).toEqual(BODY)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: false, faltantes: ['comprador.dni'], detalles: [] })
  })

  it('body que no es JSON → 400 sin llamar al backend', async () => {
    const calls = mockBackend()
    const res = await pedido('no-json')
    expect(res.status).toBe(400)
    expect(calls).toHaveLength(0)
  })

  it('sin las env: 501 y el backend ni se toca', async () => {
    delete process.env.BACKEND_API_KEY
    const calls = mockBackend()
    const res = await pedido(JSON.stringify(BODY))
    expect(res.status).toBe(501)
    expect((await res.json()).error).toBe('documentos_no_configurado')
    expect(calls).toHaveLength(0)
  })

  it('backend caído → 502 explicado (lo que /documentos traduce a "no se pudo hablar con el backend")', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('ECONNREFUSED') }))
    const res = await pedido(JSON.stringify(BODY))
    expect(res.status).toBe(502)
    expect((await res.json()).error).toBe('backend_inalcanzable')
  })
})
