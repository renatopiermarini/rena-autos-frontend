/**
 * Lo que fija este suite de la campana (lib/notificaciones.ts):
 *   · "Marcar leídas" llega hasta el id más alto PINTADO, no el de la tabla;
 *   · el globito se capa en 99+ y desaparece en cero;
 *   · el tiempo relativo escalona minutos/horas/días y nunca dice "hace -3 min".
 */
import { describe, it, expect } from 'vitest'
import { type Notificacion, hastaIdVisible, textoBadge, tiempoRelativo } from '@/lib/notificaciones'

describe('tiempoRelativo', () => {
  const AHORA = new Date('2026-08-27T12:00:00-03:00').getTime()
  const hace = (ms: number) => new Date(AHORA - ms).toISOString()

  it('escalona minutos, horas y días', () => {
    expect(tiempoRelativo(hace(10_000), AHORA)).toBe('recién')
    expect(tiempoRelativo(hace(5 * 60_000), AHORA)).toBe('hace 5 min')
    expect(tiempoRelativo(hace(3 * 3_600_000), AHORA)).toBe('hace 3 h')
    expect(tiempoRelativo(hace(2 * 86_400_000), AHORA)).toBe('hace 2 d')
  })

  it('de una semana en adelante muestra la fecha', () => {
    expect(tiempoRelativo('2026-08-01T12:00:00-03:00', AHORA)).toBe('01/08/26')
  })

  it('un reloj adelantado del cliente no muestra "hace -3 min"', () => {
    expect(tiempoRelativo(new Date(AHORA + 180_000).toISOString(), AHORA)).toBe('recién')
  })

  it('vacío si no hay fecha', () => {
    expect(tiempoRelativo(null, AHORA)).toBe('')
    expect(tiempoRelativo('mañana', AHORA)).toBe('')
  })
})

describe('campana', () => {
  const noti = (p: Partial<Notificacion> & { id: number }): Notificacion => ({
    texto: '', nivel: 'info', link: null, leida: false, ...p,
  })

  it('hastaIdVisible es el id más alto PINTADO, no el de la tabla', () => {
    expect(hastaIdVisible([noti({ id: 3 }), noti({ id: 9 }), noti({ id: 5 })])).toBe(9)
    expect(hastaIdVisible([])).toBe(0)
  })

  it('el globito se capa en 99+ y desaparece en cero', () => {
    expect(textoBadge(0)).toBe('')
    expect(textoBadge(1)).toBe('1')
    expect(textoBadge(99)).toBe('99')
    expect(textoBadge(120)).toBe('99+')
    expect(textoBadge(NaN)).toBe('')
  })
})
