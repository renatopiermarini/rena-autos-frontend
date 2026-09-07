/**
 * Lo que fija este suite (lib/ia-match.ts):
 *   · dominio manda: exacto, sin espacios/guiones, sin importar mayúsculas;
 *   · marca+modelo por contención ("Golf" ↔ "Golf GTI"), sin acentos;
 *   · los vendidos van últimos; ambigüedad real → null;
 *   · los catálogos llevan la etiqueta "Marca Modelo Año · DOMINIO".
 */
import { describe, it, expect } from 'vitest'
import {
  matchVehiculo, catalogoVehiculos, catalogoInteresados, labelVehiculo, normalizarTexto,
} from '@/lib/ia-match'

const STOCK = [
  { id: 1, marca: 'Volkswagen', modelo: 'Golf GTI', 'año': 2019, dominio: 'AB 123 CD', estado: 'publicado' },
  { id: 2, marca: 'Toyota', modelo: 'Hilux', 'año': 2021, dominio: 'AH204EZ', estado: 'en_preparacion' },
  { id: 3, marca: 'Citroën', modelo: 'C4', 'año': 2015, dominio: 'OPQ123', estado: 'vendido' },
  { id: 4, marca: 'Chevrolet', modelo: 'Cruze', 'año': 2018, dominio: null, estado: 'publicado' },
  { id: 5, marca: 'Chevrolet', modelo: 'Cruze LTZ', 'año': 2020, dominio: null, estado: 'publicado' },
]

describe('matchVehiculo', () => {
  it('por dominio, sin espacios ni guiones ni mayúsculas', () => {
    expect(matchVehiculo(STOCK, { dominio: 'ab123cd' })).toBe(1)
    expect(matchVehiculo(STOCK, { dominio: 'AH-204-EZ' })).toBe(2)
  })

  it('por marca + modelo, por contención y sin acentos', () => {
    expect(matchVehiculo(STOCK, { marca: 'VW', modelo: 'golf' })).toBeNull() // "vw" no está en "volkswagen"
    expect(matchVehiculo(STOCK, { marca: 'Volkswagen', modelo: 'Golf' })).toBe(1)
    expect(matchVehiculo(STOCK, { modelo: 'golf gti' })).toBe(1)
    expect(matchVehiculo(STOCK, { marca: 'citroen', modelo: 'c4' })).toBe(3)
  })

  it('sólo marca no alcanza; nada → null', () => {
    expect(matchVehiculo(STOCK, { marca: 'Toyota' })).toBeNull()
    expect(matchVehiculo(STOCK, {})).toBeNull()
    expect(matchVehiculo(STOCK, { modelo: 'Corolla' })).toBeNull()
  })

  it('los vendidos van últimos y la ambigüedad da null', () => {
    const conVendido = [...STOCK, { id: 6, marca: 'Toyota', modelo: 'Hilux SRX', 'año': 2018, estado: 'vendido' }]
    expect(matchVehiculo(conVendido, { marca: 'Toyota', modelo: 'Hilux' })).toBe(2)
    // Dos Cruze en stock: "Cruze" pega en los dos → null (no adivina).
    expect(matchVehiculo(STOCK, { marca: 'Chevrolet', modelo: 'Cruze' })).toBeNull()
    // "Cruze LTZ" pega en los dos también (LTZ contiene Cruze / Cruze contenido en Cruze LTZ) → null.
    expect(matchVehiculo(STOCK, { modelo: 'Cruze LTZ' })).toBeNull()
  })

  it('el dominio equivocado no impide caer al match por modelo', () => {
    expect(matchVehiculo(STOCK, { dominio: 'ZZZ999', marca: 'Toyota', modelo: 'Hilux' })).toBe(2)
  })
})

describe('catálogos', () => {
  it('vehículos: sin vendidos, con la etiqueta "Marca Modelo Año · DOMINIO"', () => {
    const cat = catalogoVehiculos(STOCK)
    expect(cat.map(c => c.id)).toEqual([1, 2, 4, 5])
    expect(cat[0].label).toBe('Volkswagen Golf GTI 2019 · AB 123 CD')
    expect(cat[2].label).toBe('Chevrolet Cruze 2018')
  })

  it('labelVehiculo acepta `anio` además de `año`', () => {
    expect(labelVehiculo({ id: 9, marca: 'Ford', modelo: 'Ka', anio: 2012 })).toBe('Ford Ka 2012')
  })

  it('interesados: nombre · teléfono, y un placeholder si no hay nombre', () => {
    const cat = catalogoInteresados([
      { id: 10, nombre: 'Juan Pérez', telefono: '11 5555-1234' },
      { id: 11, nombre: '', telefono: '11 4444-0000' },
      { id: 'x', nombre: 'Sin id' },
    ])
    expect(cat).toEqual([
      { id: 10, label: 'Juan Pérez · 11 5555-1234' },
      { id: 11, label: 'interesado #11 · 11 4444-0000' },
    ])
  })
})

describe('normalizarTexto', () => {
  it('minúsculas, sin acentos, espacios colapsados', () => {
    expect(normalizarTexto('  Citroën   C4 ')).toBe('citroen c4')
    expect(normalizarTexto(null)).toBe('')
  })
})
