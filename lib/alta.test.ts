import { describe, it, expect } from 'vitest'
import {
  validarAltaVehiculo, validarAltaCliente, ofreceRegistrarCompra,
  movimientoCompra, normalizarDominio, esErrorColumnaVersion, sinColumnaVersion,
  VEHICULO_FORM_VACIO, CLIENTE_FORM_VACIO,
  type AltaVehiculoForm, type AltaClienteForm,
} from './alta'

const NOW = '2026-08-25T15:00:00.000Z'

function veh(over: Partial<AltaVehiculoForm> = {}): AltaVehiculoForm {
  return { ...VEHICULO_FORM_VACIO, marca: 'Chevrolet', modelo: 'Cruze', ...over }
}
function cli(over: Partial<AltaClienteForm> = {}): AltaClienteForm {
  return { ...CLIENTE_FORM_VACIO, nombre: 'Juan Pérez', ...over }
}

/** Estrecha el resultado a ok:true y devuelve la fila (o falla el test). */
function row(r: ReturnType<typeof validarAltaVehiculo>) {
  if (!r.ok) throw new Error(`esperaba ok, salió: ${r.error}`)
  return r.row
}

describe('validarAltaVehiculo', () => {
  it('arma la fila mínima con los defaults', () => {
    const r = row(validarAltaVehiculo(veh(), NOW))
    expect(r).toEqual({
      marca: 'Chevrolet',
      modelo: 'Cruze',
      tipo_operacion: 'propio',
      estado: 'a_ingresar',
      created_at: NOW,
      updated_at: NOW,
    })
  })

  it('exige marca y modelo', () => {
    expect(validarAltaVehiculo(veh({ marca: '  ' }), NOW)).toMatchObject({ ok: false })
    expect(validarAltaVehiculo(veh({ modelo: '' }), NOW)).toMatchObject({ ok: false })
  })

  it('OMITE los campos vacíos en vez de mandarlos en null', () => {
    // Un INSERT con null explícito valida columna por columna en Postgres: un
    // campo opcional vacío no puede tirar abajo el alta entera.
    const r = row(validarAltaVehiculo(veh({ color: '', dominio: '', version: '' }), NOW))
    expect(Object.keys(r)).not.toContain('color')
    expect(Object.keys(r)).not.toContain('dominio')
    expect(Object.keys(r)).not.toContain('version')
    expect(Object.values(r)).not.toContain(null)
  })

  it('convierte números y pasa la patente a mayúsculas', () => {
    const r = row(validarAltaVehiculo(veh({
      año: '2019', km: '85000', precio_compra: '12500.5', dominio: ' ab 123 cd ',
      color: 'Gris', version: 'LTZ',
    }), NOW))
    expect(r.año).toBe(2019)
    expect(r.km).toBe(85000)
    expect(r.precio_compra).toBe(12500.5)
    expect(r.dominio).toBe('AB 123 CD')
    expect(r.color).toBe('Gris')
    expect(r.version).toBe('LTZ')
  })

  it('rechaza números negativos y basura', () => {
    expect(validarAltaVehiculo(veh({ km: '-1' }), NOW)).toMatchObject({ ok: false })
    expect(validarAltaVehiculo(veh({ precio_compra: '-0.01' }), NOW)).toMatchObject({ ok: false })
    expect(validarAltaVehiculo(veh({ año: 'dosmil' }), NOW)).toMatchObject({ ok: false })
    expect(validarAltaVehiculo(veh({ año: '2019.5' }), NOW)).toMatchObject({ ok: false })
  })

  it('acepta el 0 explícito (no lo confunde con vacío)', () => {
    const r = row(validarAltaVehiculo(veh({ km: '0' }), NOW))
    expect(r.km).toBe(0)
  })

  it('consignación exige el cliente dueño', () => {
    const sin = validarAltaVehiculo(veh({ tipo_operacion: 'consignacion' }), NOW)
    expect(sin.ok).toBe(false)
    const con = row(validarAltaVehiculo(veh({ tipo_operacion: 'consignacion', cliente_id: '7' }), NOW))
    expect(con.cliente_id).toBe(7)
  })

  it('un propio no arrastra cliente_id', () => {
    const r = row(validarAltaVehiculo(veh({ tipo_operacion: 'propio', cliente_id: '7' }), NOW))
    expect(Object.keys(r)).not.toContain('cliente_id')
  })

  it('valida los enums que valida el proxy', () => {
    expect(validarAltaVehiculo(veh({ estado: 'en_stock' }), NOW)).toMatchObject({ ok: false })
    expect(validarAltaVehiculo(veh({ tipo_operacion: 'alquiler' }), NOW)).toMatchObject({ ok: false })
  })

  it('la fecha de ingreso viaja como date-only, sin tocar la zona horaria', () => {
    const r = row(validarAltaVehiculo(veh({ fecha_ingreso: '2026-08-25' }), NOW))
    expect(r.fecha_ingreso).toBe('2026-08-25')
    expect(validarAltaVehiculo(veh({ fecha_ingreso: '25/08/2026' }), NOW)).toMatchObject({ ok: false })
  })
})

describe('ofreceRegistrarCompra', () => {
  it('sólo con auto propio y precio de compra > 0', () => {
    expect(ofreceRegistrarCompra({ tipo_operacion: 'propio', precio_compra: '12000' })).toBe(true)
    expect(ofreceRegistrarCompra({ tipo_operacion: 'propio', precio_compra: '0' })).toBe(false)
    expect(ofreceRegistrarCompra({ tipo_operacion: 'propio', precio_compra: '' })).toBe(false)
    expect(ofreceRegistrarCompra({ tipo_operacion: 'propio', precio_compra: 'x' })).toBe(false)
    // En consignación el auto no lo pagó la agencia: no hay egreso de caja.
    expect(ofreceRegistrarCompra({ tipo_operacion: 'consignacion', precio_compra: '12000' })).toBe(false)
  })
})

describe('movimientoCompra', () => {
  it('arma el egreso que espera /api/finanzas/movimiento', () => {
    const body = movimientoCompra(
      veh({ precio_compra: '12000', fecha_ingreso: '2026-08-20' }), 42, 'cash',
    )
    expect(body).toEqual({
      tipo: 'egreso',
      categoria: 'vehicle_purchase',
      cuenta: 'cash',
      monto: 12000,
      vehicle_id: 42,
      descripcion: 'Compra Chevrolet Cruze',
      fecha: '2026-08-20',
    })
  })

  it('sin fecha de ingreso no manda fecha (la route la resuelve como hoy)', () => {
    const body = movimientoCompra(veh({ precio_compra: '12000' }), 42, 'nexo')
    expect(Object.keys(body)).not.toContain('fecha')
  })
})

describe('fallback de la columna `version`', () => {
  it('reconoce el rechazo de la columna y no otros errores', () => {
    expect(esErrorColumnaVersion('columna desconocida: vehicles.version')).toBe(true)
    expect(esErrorColumnaVersion('Unknown column "version" in vehicles')).toBe(true)
    expect(esErrorColumnaVersion('columna desconocida: vehicles.color')).toBe(false)
    expect(esErrorColumnaVersion('la version del auto es obligatoria')).toBe(false)
    expect(esErrorColumnaVersion(undefined)).toBe(false)
  })

  it('pega la versión al modelo, como están cargados los autos viejos', () => {
    const r = sinColumnaVersion({ marca: 'Chevrolet', modelo: 'Cruze', version: 'LTZ' })
    expect(r).toEqual({ marca: 'Chevrolet', modelo: 'Cruze LTZ' })
  })

  it('sin versión deja el modelo intacto', () => {
    expect(sinColumnaVersion({ modelo: 'Cruze', version: '  ' })).toEqual({ modelo: 'Cruze' })
    expect(sinColumnaVersion({ modelo: 'Cruze' })).toEqual({ modelo: 'Cruze' })
  })
})

describe('validarAltaCliente', () => {
  it('arma la fila mínima', () => {
    const r = validarAltaCliente(cli(), NOW)
    expect(r).toEqual({
      ok: true,
      row: {
        nombre: 'Juan Pérez',
        tipo: 'comprador',
        es_acreedor: 0,
        created_at: NOW,
        updated_at: NOW,
      },
    })
  })

  it('exige nombre', () => {
    expect(validarAltaCliente(cli({ nombre: ' ' }), NOW)).toMatchObject({ ok: false })
  })

  it('tipo=acreedor setea también es_acreedor=1 (esAcreedor mira los dos)', () => {
    const r = validarAltaCliente(cli({ tipo: 'acreedor' }), NOW)
    expect(r).toMatchObject({ ok: true, row: { tipo: 'acreedor', es_acreedor: 1 } })
  })

  it('valida el enum de tipo que valida el proxy', () => {
    expect(validarAltaCliente(cli({ tipo: 'proveedor' }), NOW)).toMatchObject({ ok: false })
  })

  it('omite los opcionales vacíos y recorta los cargados', () => {
    const r = validarAltaCliente(cli({ telefono: ' 1156781234 ', email: '' }), NOW)
    if (!r.ok) throw new Error(r.error)
    expect(r.row.telefono).toBe('1156781234')
    expect(Object.keys(r.row)).not.toContain('email')
  })
})

describe('normalizarDominio', () => {
  it('recorta y pasa a mayúsculas', () => {
    expect(normalizarDominio(' ab123cd ')).toBe('AB123CD')
    expect(normalizarDominio('')).toBe('')
  })
})
