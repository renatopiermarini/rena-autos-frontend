import { describe, it, expect } from 'vitest'
import { diasEnStock, etiquetaDias, tarjetaVehiculo, DIAS_STOCK_ALERTA } from './stock'

// Fecha-only se parsea a mediodía LOCAL (lib/date), así que el "ahora" de
// referencia también va a mediodía: los tests no dependen de la hora del día.
const ahora = new Date('2026-08-25T12:00:00').getTime()

describe('diasEnStock', () => {
  it('cuenta los días desde el ingreso', () => {
    expect(diasEnStock('2026-08-25', ahora)).toBe(0)
    expect(diasEnStock('2026-08-24', ahora)).toBe(1)
    expect(diasEnStock('2026-07-06', ahora)).toBe(50)
  })

  it('sin fecha de ingreso devuelve null, no 0 ni NaN', () => {
    expect(diasEnStock(null, ahora)).toBeNull()
    expect(diasEnStock('', ahora)).toBeNull()
    expect(diasEnStock(undefined, ahora)).toBeNull()
    expect(diasEnStock('no es una fecha', ahora)).toBeNull()
  })

  it('una fecha futura no da días negativos', () => {
    expect(diasEnStock('2026-09-01', ahora)).toBe(0)
  })

  it('acepta un instante completo, no sólo date-only', () => {
    expect(diasEnStock('2026-08-20T10:00:00-03:00', ahora)).toBe(5)
  })
})

describe('etiquetaDias', () => {
  it('singulariza', () => {
    expect(etiquetaDias(1)).toBe('1 día')
    expect(etiquetaDias(0)).toBe('0 días')
    expect(etiquetaDias(90)).toBe('90 días')
  })
  it('sin días no inventa texto', () => {
    expect(etiquetaDias(null)).toBe('')
  })
})

describe('tarjetaVehiculo', () => {
  const base = {
    marca: 'Chevrolet', modelo: 'Cruze', año: 2018, dominio: 'AB123CD',
    color: 'Gris', km: 84000, estado: 'publicado',
    precio_publicado: 18500, fecha_ingreso: '2026-08-13',
  }

  it('arma las tres líneas de la tarjeta', () => {
    const t = tarjetaVehiculo(base, ahora)
    expect(t.titulo).toBe('Chevrolet Cruze 2018')
    expect(t.detalle).toContain('AB123CD')
    expect(t.detalle).toContain('Gris')
    expect(t.detalle).toContain('km')
    expect(t.precio.startsWith('$')).toBe(true)
    expect(t.estadoLabel).toBe('Publicado')
    expect(t.dias).toBe(12)
    expect(t.diasLabel).toBe('12 días')
    expect(t.diasAlerta).toBe(false)
  })

  it('el detalle omite lo que falta pero SIEMPRE dice algo de la patente', () => {
    const t = tarjetaVehiculo({ ...base, color: null, km: null }, ahora)
    expect(t.detalle).toBe('AB123CD')
    const sinPatente = tarjetaVehiculo({ ...base, dominio: '', color: null, km: null }, ahora)
    expect(sinPatente.detalle).toBe('sin patente')
  })

  it('sin publicado usa el objetivo y lo marca como estimado', () => {
    const t = tarjetaVehiculo({ ...base, precio_publicado: null, precio_venta_objetivo: 20000 }, ahora)
    expect(t.precioEstimado).toBe(true)
    expect(t.precio.startsWith('$')).toBe(true)
  })

  it('sin ningún precio muestra "—" y no inventa un número', () => {
    const t = tarjetaVehiculo(
      { ...base, precio_publicado: null, precio_venta_objetivo: null }, ahora)
    expect(t.precio).toBe('—')
    expect(t.precioEstimado).toBe(false)
  })

  it('el publicado le gana al objetivo', () => {
    const t = tarjetaVehiculo({ ...base, precio_venta_objetivo: 99999 }, ahora)
    expect(t.precioEstimado).toBe(false)
    expect(t.precio).toBe(tarjetaVehiculo(base, ahora).precio)
  })

  it(`marca alerta recién pasados los ${DIAS_STOCK_ALERTA} días`, () => {
    const enElLimite = tarjetaVehiculo({ ...base, fecha_ingreso: '2026-07-11' }, ahora) // 45
    expect(enElLimite.dias).toBe(DIAS_STOCK_ALERTA)
    expect(enElLimite.diasAlerta).toBe(false)
    const pasado = tarjetaVehiculo({ ...base, fecha_ingreso: '2026-07-10' }, ahora)     // 46
    expect(pasado.diasAlerta).toBe(true)
  })

  it('un auto sin datos no rompe la tarjeta', () => {
    const t = tarjetaVehiculo({}, ahora)
    expect(t.titulo).toBe('Auto sin datos')
    expect(t.detalle).toBe('sin patente')
    expect(t.precio).toBe('—')
    expect(t.dias).toBeNull()
    expect(t.diasLabel).toBe('')
    expect(t.diasAlerta).toBe(false)
  })

  it('un estado desconocido cae al fallback de estadoMeta y no queda vacío', () => {
    const t = tarjetaVehiculo({ ...base, estado: 'algo_raro' }, ahora)
    expect(t.estadoLabel).toBe('algo raro')
  })
})
