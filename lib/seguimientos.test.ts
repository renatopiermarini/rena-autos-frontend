/**
 * La parte pura de lib/seguimientos.ts + el getter en modo Kapso (404 = la
 * tabla no existe → null, no lista vacía).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  clasificarVencimiento, posponer, ordenarPendientes, personaDe, autoDe, resumenPendientes,
  getSeguimientos, FUENTE_LABEL, ESTADO_LABEL, type Seguimiento,
} from '@/lib/seguimientos'

const HOY = '2026-09-08'

describe('clasificarVencimiento', () => {
  it('vencido / hoy / próximo / sin fecha', () => {
    expect(clasificarVencimiento('2026-09-07', HOY)).toBe('vencido')
    expect(clasificarVencimiento('2026-09-08', HOY)).toBe('hoy')
    expect(clasificarVencimiento('2026-09-09', HOY)).toBe('proximo')
    expect(clasificarVencimiento(null, HOY)).toBe('sin_fecha')
    expect(clasificarVencimiento('', HOY)).toBe('sin_fecha')
    expect(clasificarVencimiento('08/09/2026', HOY)).toBe('sin_fecha')
  })
})

describe('posponer', () => {
  it('desde la fecha si está en el futuro; desde hoy si venció o no tiene', () => {
    expect(posponer('2026-09-10', 1, HOY)).toBe('2026-09-11')
    expect(posponer('2026-09-01', 3, HOY)).toBe('2026-09-11')
    expect(posponer(null, 7, HOY)).toBe('2026-09-15')
    expect(posponer(HOY, 1, HOY)).toBe('2026-09-09')
  })
  it('cruza el mes sin pasar por UTC', () => {
    expect(posponer('2026-09-30', 1, HOY)).toBe('2026-10-01')
    expect(posponer('2026-12-31', 3, HOY)).toBe('2027-01-03')
  })
})

describe('ordenarPendientes', () => {
  it('fecha ascendente, sin fecha al final, empate por id', () => {
    const rows = [
      { id: 1, fecha_proximo: null },
      { id: 2, fecha_proximo: '2026-09-09' },
      { id: 3, fecha_proximo: '2026-09-01' },
      { id: 4, fecha_proximo: '2026-09-08' },
      { id: 5, fecha_proximo: '2026-09-01' },
      { id: 6, fecha_proximo: '' },
    ]
    expect(ordenarPendientes(rows).map(r => r.id)).toEqual([3, 5, 4, 2, 1, 6])
    expect(rows.map(r => r.id)).toEqual([1, 2, 3, 4, 5, 6]) // no muta
  })
})

const seg = (o: Partial<Seguimiento>): Seguimiento => ({
  id: 1, interesado_id: null, cliente_id: null, vehicle_id: null, crm_chat_id: null,
  resumen: null, proximo_paso: null, fecha_proximo: null, estado: 'pendiente', fuente: 'manual',
  nudges: 0, created_at: null, updated_at: null, hecho_at: null, ...o,
})

describe('resumenPendientes', () => {
  it('cuenta pendientes, vencidos y para hoy (vencidos + hoy); ignora hechos', () => {
    const rows = [
      seg({ id: 1, fecha_proximo: '2026-09-01' }),
      seg({ id: 2, fecha_proximo: HOY }),
      seg({ id: 3, fecha_proximo: '2026-09-20' }),
      seg({ id: 4, fecha_proximo: null }),
      seg({ id: 5, fecha_proximo: '2026-09-01', estado: 'hecho' }),
    ]
    expect(resumenPendientes(rows, HOY)).toEqual({ pendientes: 4, vencidos: 1, paraHoy: 2 })
  })
})

describe('personaDe / autoDe', () => {
  const interesados = [{ id: 3, nombre: 'Marcos' }]
  const clientes = [{ id: '7', nombre: 'Juan Pérez' }]
  it('interesado primero, después cliente, con link a la ficha', () => {
    expect(personaDe({ interesado_id: 3, cliente_id: null }, interesados, clientes))
      .toEqual({ nombre: 'Marcos', href: '/interesados?id=3' })
    expect(personaDe({ interesado_id: null, cliente_id: 7 }, interesados, clientes))
      .toEqual({ nombre: 'Juan Pérez', href: '/clientes?id=7' })
    // Interesado borrado pero cliente presente: cae al cliente.
    expect(personaDe({ interesado_id: 99, cliente_id: 7 }, interesados, clientes)?.nombre).toBe('Juan Pérez')
    expect(personaDe({ interesado_id: null, cliente_id: null }, interesados, clientes)).toBeNull()
  })
  it('autoDe: "Marca Modelo · DOMINIO"', () => {
    const vehicles = [{ id: 2, marca: 'VW', modelo: 'Golf', dominio: 'AB123CD' }, { id: 4, marca: 'Audi', modelo: 'A3', dominio: null }]
    expect(autoDe(2, vehicles)).toBe('VW Golf · AB123CD')
    expect(autoDe(4, vehicles)).toBe('Audi A3')
    expect(autoDe(9, vehicles)).toBe('')
    expect(autoDe(null, vehicles)).toBe('')
  })
})

describe('labels', () => {
  it('cubren todos los enums del proxy', () => {
    expect(Object.keys(FUENTE_LABEL).sort()).toEqual(['bot', 'crm', 'ia', 'manual'])
    expect(Object.keys(ESTADO_LABEL).sort()).toEqual(['descartado', 'hecho', 'pendiente'])
  })
})

describe('getSeguimientos (modo Kapso)', () => {
  const OLD_ENV = { ...process.env }
  const jsonRes = (data: any, status = 200) =>
    ({ ok: status >= 200 && status < 300, status, json: async () => data }) as any

  beforeEach(() => {
    process.env.KAPSO_DB_URL = 'https://api.test/db'
    process.env.KAPSO_API_KEY = 'k-test'
    delete process.env.DATABASE_URL
    vi.restoreAllMocks()
  })
  afterEach(() => { process.env = { ...OLD_ENV } })

  it('tabla sin crear (404) → null; vacía → []', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonRes({ error: 'not found' }, 404)))
    await expect(getSeguimientos()).resolves.toBeNull()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonRes({ data: [] })))
    await expect(getSeguimientos()).resolves.toEqual([])
  })

  it('normaliza ids TEXT y nudges', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonRes({
      data: [{ id: '5', interesado_id: '3', cliente_id: null, vehicle_id: '', nudges: '2', estado: 'pendiente', fuente: 'crm', fecha_proximo: '2026-09-08' }],
    })))
    const rows = await getSeguimientos()
    expect(rows).toHaveLength(1)
    expect(rows![0]).toMatchObject({ id: 5, interesado_id: 3, cliente_id: null, vehicle_id: null, nudges: 2, fuente: 'crm' })
  })

  it('un fallo de red no tira la página: null', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')))
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    await expect(getSeguimientos()).resolves.toBeNull()
  })
})
