/**
 * Las lecturas de lib/kapso.ts pasan ahora por lib/db.ts. Esto fija que, sin
 * DATABASE_URL, la instancia de Renato hace los MISMOS requests que antes:
 * misma URL paginada, misma API key, mismo `revalidate` por tabla, y el mismo
 * "si Kapso contesta mal, devolvé lo que se leyó" en vez de tirar la pantalla.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { getVehicles, getBalances, getConfigNegocioRows } from '@/lib/kapso'

const OLD_ENV = { ...process.env }

function jsonRes(data: any, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => data } as any
}

beforeEach(() => {
  process.env.KAPSO_DB_URL = 'https://api.test/db'
  process.env.KAPSO_API_KEY = 'k-test'
  delete process.env.DATABASE_URL
  vi.restoreAllMocks()
})

afterEach(() => {
  process.env = { ...OLD_ENV }
})

describe('lecturas del dashboard (backend Kapso)', () => {
  it('getVehicles pega a /vehicles paginado, con la key y revalidate=15', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonRes({ data: [{ id: 1 }] }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(getVehicles()).resolves.toEqual([{ id: 1 }])
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://api.test/db/vehicles?limit=200&offset=0')
    expect(init.headers['X-API-Key']).toBe('k-test')
    expect(init.next).toEqual({ revalidate: 15 })
  })

  it('cada tabla conserva su revalidate', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonRes({ data: [] }))
    vi.stubGlobal('fetch', fetchMock)
    await getBalances()
    expect(fetchMock.mock.calls[0][1].next).toEqual({ revalidate: 60 })
  })

  it('un 500 de Kapso devuelve lo leído hasta ahí, no una excepción', async () => {
    const page = Array.from({ length: 200 }, (_, i) => ({ id: i + 1 }))
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonRes({ data: page }))
      .mockResolvedValueOnce(jsonRes({ error: 'boom' }, 500))
    vi.stubGlobal('fetch', fetchMock)

    await expect(getVehicles()).resolves.toHaveLength(200)
  })

  it('un 404 (tabla sin crear) es lista vacía', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonRes({ error: 'not found' }, 404)))
    await expect(getConfigNegocioRows()).resolves.toEqual([])
  })

  it('una red caída la absorbe getSafe en las tablas de configuración', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')))
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    await expect(getConfigNegocioRows()).resolves.toEqual([])
    // …pero en una tabla que SÍ tiene que estar, el fallo se propaga.
    await expect(getVehicles()).rejects.toThrow('ECONNREFUSED')
  })
})
