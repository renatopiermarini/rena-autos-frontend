import { describe, expect, it } from 'vitest'
import { cotizacionesHabilitadas } from './cotizaciones'

describe('cotizacionesHabilitadas', () => {
  it('config sin cargar ⇒ visible (instancia de Renato pre-DDL)', () => {
    expect(cotizacionesHabilitadas({})).toBe(true)
    expect(cotizacionesHabilitadas(undefined)).toBe(true)
    expect(cotizacionesHabilitadas(null)).toBe(true)
  })

  it('config cargada ⇒ sólo con cotizaciones_colega=1', () => {
    expect(cotizacionesHabilitadas({ branding_titulo: 'TM Motors' })).toBe(false)
    expect(cotizacionesHabilitadas({ cotizaciones_colega: '0' })).toBe(false)
    expect(cotizacionesHabilitadas({ cotizaciones_colega: '1' })).toBe(true)
    expect(cotizacionesHabilitadas({ cotizaciones_colega: ' 1 ' })).toBe(true)
  })
})
