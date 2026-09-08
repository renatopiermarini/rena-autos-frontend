/**
 * Lo que fija este suite (lib/ia-cliente.ts):
 *   · cada status del proxy/backend tiene su línea en criollo;
 *   · el 503 del cost cap pasa el texto del backend tal cual;
 *   · el 422 lista los `detalles`;
 *   · postIa nunca lanza: red caída = {ok:false}.
 */
import { describe, it, expect, afterEach, vi } from 'vitest'
import { postIa, traducirErrorIa } from '@/lib/ia-cliente'

afterEach(() => vi.unstubAllGlobals())

describe('traducirErrorIa', () => {
  it('501: esta instancia no tiene backend', () => {
    expect(traducirErrorIa(501, { error: 'ia_no_configurado' })).toContain('no tiene backend')
  })

  it('503: passthrough del detail del cost cap', () => {
    expect(traducirErrorIa(503, { detail: 'Tope de gasto alcanzado. Se reanuda mañana 00:00.' }))
      .toBe('Tope de gasto alcanzado. Se reanuda mañana 00:00.')
    expect(traducirErrorIa(503, { message: 'pausado' })).toBe('pausado')
    expect(traducirErrorIa(503, null)).toContain('pausada')
  })

  it('502: el backend no contesta', () => {
    expect(traducirErrorIa(502, { error: 'backend_inalcanzable', message: 'fetch failed' }))
      .toContain('no contesta')
  })

  it('422: lista los detalles', () => {
    const txt = traducirErrorIa(422, {
      detail: { error: 'Respuesta inválida', detalles: ['dominio: Dominio inválido', 'anio: Input should be a valid integer'] },
    })
    expect(txt).toContain('Respuesta inválida')
    expect(txt).toContain('· dominio: Dominio inválido')
    expect(txt).toContain('· anio:')
  })

  it('413 y 400: archivo y formato', () => {
    expect(traducirErrorIa(413, null)).toContain('10 MB')
    expect(traducirErrorIa(400, null)).toContain('JPG, PNG, WebP o PDF')
    expect(traducirErrorIa(400, { detail: 'Aceptamos imágenes y PDF.' })).toBe('Aceptamos imágenes y PDF.')
  })

  it('401/403: la key', () => {
    expect(traducirErrorIa(401, null)).toContain('BACKEND_API_KEY')
  })

  it('otro: lo que diga el backend, o el status', () => {
    expect(traducirErrorIa(500, { detail: 'boom' })).toBe('boom')
    expect(traducirErrorIa(500, null)).toContain('500')
  })
})

describe('postIa', () => {
  it('manda JSON y devuelve data con ok', async () => {
    const calls: { url: string; init: RequestInit }[] = []
    vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ url, init })
      return new Response('{"marca":"Ford"}', { status: 200, headers: { 'content-type': 'application/json' } })
    }))
    const r = await postIa<{ marca: string }>('interesado-desde-chat', { texto: 'hola' })
    expect(r).toEqual({ ok: true, data: { marca: 'Ford' } })
    expect(calls[0].url).toBe('/api/ia/interesado-desde-chat')
    expect((calls[0].init.headers as Record<string, string>)['Content-Type']).toBe('application/json')
    expect(calls[0].init.body).toBe('{"texto":"hola"}')
  })

  it('manda FormData sin Content-Type a mano (el browser pone el boundary)', async () => {
    const calls: { init: RequestInit }[] = []
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init: RequestInit) => {
      calls.push({ init })
      return new Response('{}', { status: 200 })
    }))
    const fd = new FormData()
    fd.append('archivo', new File([new Uint8Array(2)], 'c.jpg', { type: 'image/jpeg' }))
    await postIa('vehiculo-desde-documento', fd)
    expect(calls[0].init.headers).toBeUndefined()
    expect(calls[0].init.body).toBeInstanceOf(FormData)
  })

  it('un error vuelve traducido, con su status', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{"error":"ia_no_configurado"}', { status: 501 })))
    const r = await postIa('parsear-agenda', { texto: 'x' })
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.status).toBe(501)
      expect(r.error).toContain('no tiene backend')
    }
  })

  it('sin red no lanza', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('fetch failed') }))
    const r = await postIa('parsear-agenda', { texto: 'x' })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.status).toBe(0)
  })
})
