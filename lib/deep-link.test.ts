/**
 * La parte pura de lib/deep-link.ts: cómo se leen `?dni=1` y `?rapido=<texto>`.
 */
import { describe, it, expect } from 'vitest'
import { leerDeepLinkFlag, leerDeepLinkParam } from '@/lib/deep-link'

describe('leerDeepLinkFlag', () => {
  it('acepta 1/true/si; el resto es false', () => {
    expect(leerDeepLinkFlag('?id=3&dni=1', 'dni')).toBe(true)
    expect(leerDeepLinkFlag('?dni=true', 'dni')).toBe(true)
    expect(leerDeepLinkFlag('?dni=sí', 'dni')).toBe(true)
    expect(leerDeepLinkFlag('?dni=0', 'dni')).toBe(false)
    expect(leerDeepLinkFlag('?id=3', 'dni')).toBe(false)
    expect(leerDeepLinkFlag('', 'dni')).toBe(false)
  })
})

describe('leerDeepLinkParam', () => {
  it('devuelve el texto decodificado y recortado, o null', () => {
    expect(leerDeepLinkParam('?rapido=visita%20de%20Juan%20ma%C3%B1ana', 'rapido')).toBe('visita de Juan mañana')
    expect(leerDeepLinkParam('?rapido=+', 'rapido')).toBeNull()
    expect(leerDeepLinkParam('?otro=x', 'rapido')).toBeNull()
  })
})
