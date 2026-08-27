import { describe, it, expect } from 'vitest'
import { formSucio, MENSAJE_DESCARTAR } from './dirty'

describe('formSucio', () => {
  it('un form recién abierto no está sucio', () => {
    const inicial = { marca: '', modelo: '', año: '', fecha_ingreso: '2026-08-25' }
    expect(formSucio({ ...inicial }, inicial)).toBe(false)
  })

  it('detecta el primer caracter tipeado', () => {
    const inicial = { marca: '', modelo: '' }
    expect(formSucio({ marca: 'C', modelo: '' }, inicial)).toBe(true)
  })

  it('sembrar NO es ensuciar: la fecha de hoy y la cuenta por defecto vienen en el inicial', () => {
    const sembrado = { fecha_venta: '2026-08-25', cuenta: 'cash', precio: '' }
    expect(formSucio(sembrado, sembrado)).toBe(false)
    expect(formSucio({ ...sembrado, precio: '18500' }, sembrado)).toBe(true)
  })

  it('trata "", null y undefined como el mismo vacío', () => {
    expect(formSucio({ notas: '' }, { notas: null })).toBe(false)
    expect(formSucio({ notas: undefined }, { notas: '' })).toBe(false)
    expect(formSucio({ notas: ' ' }, { notas: '' })).toBe(true)
  })

  it('compara booleans (checkboxes) y no los confunde con vacío', () => {
    expect(formSucio({ cobrar: false }, { cobrar: false })).toBe(false)
    expect(formSucio({ cobrar: true }, { cobrar: false })).toBe(true)
  })

  it('compara arrays de strings (las rutas del equipo)', () => {
    expect(formSucio({ routes: ['stock', 'finanzas'] }, { routes: ['stock', 'finanzas'] })).toBe(false)
    expect(formSucio({ routes: ['stock'] }, { routes: ['stock', 'finanzas'] })).toBe(true)
    expect(formSucio({ routes: [] }, { routes: [] })).toBe(false)
  })

  it('compara números tipeados contra su string', () => {
    expect(formSucio({ orden: 3 }, { orden: '3' })).toBe(false)
    expect(formSucio({ orden: 4 }, { orden: '3' })).toBe(true)
  })

  it('mira la unión de las claves: un campo que aparece después también ensucia', () => {
    expect(formSucio({ a: '', b: 'x' }, { a: '' })).toBe(true)
    expect(formSucio({ a: '', b: '' }, { a: '' })).toBe(false)
  })

  it('tolera null/undefined en vez de objeto', () => {
    expect(formSucio(null, null)).toBe(false)
    expect(formSucio({ a: 'x' }, null)).toBe(true)
    expect(formSucio(undefined, { a: '' })).toBe(false)
  })

  it('el mensaje habla de datos sin guardar, no de "estado" ni "form"', () => {
    expect(MENSAJE_DESCARTAR).toMatch(/sin guardar/i)
    expect(MENSAJE_DESCARTAR).toMatch(/descartar/i)
  })
})
