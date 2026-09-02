import { describe, it, expect } from 'vitest'
import { esExterna, sinAuto, verificacionPaga } from './verificaciones'

describe('esExterna / sinAuto', () => {
  it('externa: vehicle_id null con prefijo en notas', () => {
    const v = { vehicle_id: null, notas: 'Auto externo — Corolla de Juan' }
    expect(esExterna(v)).toBe(true)
    expect(sinAuto(v)).toBe(false)
  })

  it('sin auto asignado: vehicle_id null sin prefijo', () => {
    const v = { vehicle_id: '', notas: 'la paga Maxi' }
    expect(esExterna(v)).toBe(false)
    expect(sinAuto(v)).toBe(true)
  })

  it('con vehicle_id no es ni externa ni sin auto', () => {
    const v = { vehicle_id: 7, notas: 'Auto externo mentiroso' }
    expect(esExterna(v)).toBe(false)
    expect(sinAuto(v)).toBe(false)
  })
})

describe('verificacionPaga', () => {
  const rows = [
    { vehicle_id: 1, estado: 'pagada' },
    { vehicle_id: '2', estado: 'pendiente' },   // FK como texto (D1)
    { vehicle_id: 3, estado: 'hecha' },
    { vehicle_id: 3, estado: 'pagada' },        // dos verificaciones, una paga
    { vehicle_id: null, estado: 'pagada' },     // sin auto: no cuenta para nadie
    { vehicle_id: '', estado: 'pendiente' },
  ]

  it('paga si el auto tiene alguna verificación pagada', () => {
    expect(verificacionPaga(rows, 1)).toBe('paga')
    expect(verificacionPaga(rows, 3)).toBe('paga')
  })

  it('falta si tiene verificaciones pero ninguna paga', () => {
    expect(verificacionPaga(rows, 2)).toBe('falta')
  })

  it('null si el auto no tiene ninguna verificación', () => {
    expect(verificacionPaga(rows, 99)).toBe(null)
  })

  it('las filas sin vehicle_id no matchean ningún auto (Number("") === 0)', () => {
    expect(verificacionPaga(rows, 0)).toBe(null)
  })
})
