import { describe, it, expect } from 'vitest'
import { IA_ACCIONES, esIaAccion } from '@/lib/ia-catalogo'

describe('esIaAccion', () => {
  it('acepta exactamente las acciones del catálogo', () => {
    for (const a of IA_ACCIONES) expect(esIaAccion(a)).toBe(true)
    expect(IA_ACCIONES).toHaveLength(6)
  })

  it('rechaza lo que no está, incluyendo basura y path traversal', () => {
    for (const v of ['', 'chat', '../notificaciones', 'VEHICULO-DESDE-DOCUMENTO', null, undefined, 3, {}]) {
      expect(esIaAccion(v)).toBe(false)
    }
  })
})
