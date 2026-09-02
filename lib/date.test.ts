import { describe, it, expect } from 'vitest'
import { toARInputValue, fromARInputValue, fmtDateTime } from './date'

// QA 2026-09-02: la lista (fmtDateTime, clavada en AR) y el input datetime-local
// (toARInputValue) mostraban horas distintas para la MISMA visita cuando el
// browser no estaba en Argentina — toARInputValue usaba getHours() local.
// Estos tests fijan que toARInputValue es AR wall-clock sin importar el TZ del
// proceso, y que el round-trip con fromARInputValue es la identidad.

describe('toARInputValue', () => {
  it('instante con offset -03:00 → el mismo wall-clock AR', () => {
    expect(toARInputValue('2026-08-31T15:30:00-03:00')).toBe('2026-08-31T15:30')
  })

  it('instante legacy en Z → convertido a wall-clock AR (UTC−3)', () => {
    expect(toARInputValue('2026-08-31T18:30:00Z')).toBe('2026-08-31T15:30')
  })

  it('cruce de día: madrugada AR desde un Z del día siguiente', () => {
    expect(toARInputValue('2026-09-01T01:15:00Z')).toBe('2026-08-31T22:15')
  })

  it('medianoche AR no sale como 24:00', () => {
    expect(toARInputValue('2026-08-31T03:00:00Z')).toBe('2026-08-31T00:00')
  })

  it('vacío/ inválido → ""', () => {
    expect(toARInputValue(null)).toBe('')
    expect(toARInputValue('')).toBe('')
    expect(toARInputValue('no es una fecha')).toBe('')
  })

  it('round-trip con fromARInputValue es la identidad', () => {
    const stored = '2026-08-31T15:30:00-03:00'
    expect(fromARInputValue(toARInputValue(stored))).toBe(stored)
  })

  it('coincide con la hora que muestra la lista (fmtDateTime)', () => {
    const stored = '2026-08-31T11:30:00-03:00'
    expect(toARInputValue(stored).slice(11)).toBe('11:30')
    expect(fmtDateTime(stored)).toContain('11:30')
  })
})
