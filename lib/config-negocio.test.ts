/**
 * Parser de config_negocio y conversores de sus valores. Todo se guarda como
 * TEXT: si el armado del record o el ida y vuelta de stock_keywords se rompen,
 * el dashboard muestra la config de otra clave (o la pisa al guardar).
 */
import { describe, expect, it } from 'vitest'
import { parseConfigNegocio, activasOrdenadas, flagOn } from './kapso'
import { keywordsToText, textToKeywords, jsonError } from './config-negocio'

describe('parseConfigNegocio', () => {
  it('arma el record a partir de las filas', () => {
    expect(parseConfigNegocio([
      { id: 1, clave: 'nombre', valor: 'Renato Piermarini Autos' },
      { id: 2, clave: 'branding_iniciales', valor: 'RP' },
    ])).toEqual({ nombre: 'Renato Piermarini Autos', branding_iniciales: 'RP' })
  })
  it('tabla inexistente / vacía ⇒ {} (la UI cae a los defaults)', () => {
    expect(parseConfigNegocio([])).toEqual({})
    expect(parseConfigNegocio(null as any)).toEqual({})
    expect(parseConfigNegocio(undefined as any)).toEqual({})
  })
  it('valor NULL se normaliza a "" — nunca a la string "null"', () => {
    expect(parseConfigNegocio([{ clave: 'short_name', valor: null }])).toEqual({ short_name: '' })
  })
  it('numéricos de D1 se devuelven como string', () => {
    expect(parseConfigNegocio([{ clave: 'umbral_alerta_caja', valor: 500 }]))
      .toEqual({ umbral_alerta_caja: '500' })
  })
  it('ignora filas sin clave usable', () => {
    expect(parseConfigNegocio([
      { clave: '', valor: 'x' }, { valor: 'y' }, { clave: 7, valor: 'z' }, null,
    ] as any)).toEqual({})
  })
  it('ante claves duplicadas gana la última fila', () => {
    expect(parseConfigNegocio([
      { clave: 'nombre', valor: 'viejo' },
      { clave: 'nombre', valor: 'nuevo' },
    ])).toEqual({ nombre: 'nuevo' })
  })
})

describe('flagOn', () => {
  it('coerce los booleanos de D1 (1/0, "1"/"0", true/false)', () => {
    expect(flagOn(1)).toBe(true)
    expect(flagOn('1')).toBe(true)
    expect(flagOn(0)).toBe(false)
    expect(flagOn('0')).toBe(false) // Boolean('0') sería true
    expect(flagOn(true)).toBe(true)
    expect(flagOn('true')).toBe(true)
    expect(flagOn('false')).toBe(false)
  })
  it('sin valor usa el fallback', () => {
    expect(flagOn(null)).toBe(true)
    expect(flagOn(undefined)).toBe(true)
    expect(flagOn('')).toBe(true)
    expect(flagOn(null, false)).toBe(false)
  })
})

describe('activasOrdenadas', () => {
  const filas = [
    { id: 3, clave: 'fiwind', orden: 3, activa: 1 },
    { id: 1, clave: 'cash', orden: 1, activa: 1 },
    { id: 2, clave: 'vieja', orden: 2, activa: 0 },
    { id: 4, clave: 'nexo', orden: 2, activa: '1' },
  ]
  it('filtra inactivas y ordena por orden', () => {
    expect(activasOrdenadas(filas, 'activa').map(r => r.clave)).toEqual(['cash', 'nexo', 'fiwind'])
  })
  it('desempata por id cuando el orden coincide o falta', () => {
    const empate = [{ id: 9, clave: 'b' }, { id: 2, clave: 'a' }]
    expect(activasOrdenadas(empate, 'activa').map(r => r.clave)).toEqual(['a', 'b'])
  })
  it('entrada no-array ⇒ []', () => {
    expect(activasOrdenadas(null as any, 'activa')).toEqual([])
  })
})

describe('stock_keywords ↔ textarea', () => {
  it('array JSON ⇒ una por línea, y vuelta', () => {
    expect(keywordsToText('["auto","camioneta"]')).toBe('auto\ncamioneta')
    expect(textToKeywords('auto\ncamioneta')).toBe('["auto","camioneta"]')
  })
  it('el ida y vuelta no pierde nada', () => {
    const raw = '["auto","camioneta","suv"]'
    expect(textToKeywords(keywordsToText(raw))).toBe(raw)
  })
  it('limpia líneas vacías y espacios al guardar', () => {
    expect(textToKeywords('  auto \n\n  camioneta\n')).toBe('["auto","camioneta"]')
    expect(textToKeywords('')).toBe('[]')
  })
  it('un valor viejo que no es JSON se muestra tal cual en vez de perderse', () => {
    expect(keywordsToText('auto,camioneta')).toBe('auto,camioneta')
    expect(keywordsToText('')).toBe('')
  })
  it('JSON que no es array (un objeto) también se muestra crudo', () => {
    expect(keywordsToText('{"a":1}')).toBe('{"a":1}')
  })
})

describe('jsonError', () => {
  it('vacío es válido (la clave queda sin setear)', () => {
    expect(jsonError('')).toBeNull()
    expect(jsonError('   ')).toBeNull()
  })
  it('null si parsea', () => {
    expect(jsonError('{"lavado":true}')).toBeNull()
    expect(jsonError('[]')).toBeNull()
  })
  it('mensaje si no parsea', () => {
    expect(jsonError('{lavado:true}')).not.toBeNull()
  })
})
