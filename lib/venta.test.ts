import { describe, it, expect } from 'vitest'
import {
  planVenta, comisionVenta, comisionConsignacionPct, autoLabelVenta,
  VENTA_FORM_VACIO, COMISION_PCT_DEFAULT, type VentaForm,
} from './venta'
import { computeLiquidacionConsignacion } from './kapso'

const NOW = '2026-08-27T15:00:00.000Z'

function form(over: Partial<VentaForm> = {}): VentaForm {
  return { ...VENTA_FORM_VACIO, precio_venta_final: '10000', cuenta: 'cash', ...over }
}

const PROPIO = { id: 7, marca: 'Chevrolet', modelo: 'Cruze', dominio: 'AB123CD', tipo_operacion: 'propio' }
const CONSIG = { id: 9, marca: 'VW', modelo: 'Amarok', tipo_operacion: 'consignacion', cliente_id: 4 }

const OPTS = { comisionPct: 5, gastosAdelantados: 0, nowIso: NOW }

/** Estrecha a ok:true (o falla el test). */
function plan(r: ReturnType<typeof planVenta>) {
  if (!r.ok) throw new Error(`esperaba ok, salió: ${r.error}`)
  return r
}

describe('comisionConsignacionPct', () => {
  it('lee el porcentaje de config_negocio', () => {
    expect(comisionConsignacionPct({ comision_consignacion_pct: '7.5' })).toBe(7.5)
  })
  it('cae en 5 sin config, con basura o fuera de 0–100', () => {
    expect(comisionConsignacionPct(undefined)).toBe(COMISION_PCT_DEFAULT)
    expect(comisionConsignacionPct({})).toBe(5)
    expect(comisionConsignacionPct({ comision_consignacion_pct: 'ocho' })).toBe(5)
    expect(comisionConsignacionPct({ comision_consignacion_pct: '0' })).toBe(5)
    expect(comisionConsignacionPct({ comision_consignacion_pct: '250' })).toBe(5)
  })
})

describe('comisionVenta', () => {
  it('redondea a centavos igual que la liquidación', () => {
    expect(comisionVenta(10000, 5)).toBe(500)
    expect(comisionVenta(12345.67, 5)).toBe(617.28)   // 617.2835 → 617.28
    expect(comisionVenta(3333.33, 7.5)).toBe(250)     // 249.99975 → 250
  })

  it('da EXACTAMENTE lo mismo que computeLiquidacionConsignacion', () => {
    const vehicles = [{ id: 9, tipo_operacion: 'consignacion', precio_venta_final: 12345.67 }]
    const liq = computeLiquidacionConsignacion(9, vehicles, [], 5)
    expect(comisionVenta(12345.67, 5)).toBe(liq.comision)
  })
})

describe('planVenta — auto propio', () => {
  it('marca vendido y mete el PRECIO ENTERO como ingreso de venta', () => {
    const r = plan(planVenta(form({ fecha_venta: '2026-08-27', comprador_id: '3' }), PROPIO, OPTS))
    expect(r.patch).toEqual({
      estado: 'vendido',
      precio_venta_final: 10000,
      updated_at: NOW,
      fecha_venta: '2026-08-27',
      comprador_id: 3,
    })
    expect(r.movimientos).toEqual([{
      tipo: 'ingreso',
      categoria: 'venta',
      monto: 10000,
      vehicle_id: 7,
      cuenta: 'cash',
      descripcion: 'Venta Chevrolet Cruze (AB123CD)',
      fecha: '2026-08-27',
    }])
    expect(r.desglose.entra_a_caja).toBe(10000)
    expect(r.desglose.es_consignacion).toBe(false)
    expect(r.desglose.comision).toBe(0)
  })

  it('omite fecha_venta y comprador_id cuando el usuario no los cargó', () => {
    const r = plan(planVenta(form(), PROPIO, OPTS))
    expect(r.patch).toEqual({ estado: 'vendido', precio_venta_final: 10000, updated_at: NOW })
    expect(r.movimientos[0].fecha).toBeUndefined()
  })

  it('ignora el check de gastos: un propio no tiene dueño a quien reintegrarle', () => {
    const r = plan(planVenta(
      form({ cobrar_gastos: true }), PROPIO, { ...OPTS, gastosAdelantados: 300 },
    ))
    expect(r.movimientos).toHaveLength(1)
    expect(r.movimientos[0].categoria).toBe('venta')
  })
})

describe('planVenta — consignación', () => {
  it('NO mete el precio entero: entra sólo la comisión', () => {
    const r = plan(planVenta(form({ precio_venta_final: '20000' }), CONSIG, OPTS))
    expect(r.movimientos).toEqual([{
      tipo: 'ingreso',
      categoria: 'commission',
      monto: 1000,
      vehicle_id: 9,
      cuenta: 'cash',
      descripcion: 'Comisión 5% venta VW Amarok',
    }])
    expect(r.desglose.entra_a_caja).toBe(1000)
    expect(r.desglose.resto_dueno).toBe(19000)
    // El precio de venta sí queda en el auto: es el precio real de la operación.
    expect(r.patch.precio_venta_final).toBe(20000)
  })

  it('usa el pct de config, no el 5 hardcodeado', () => {
    const r = plan(planVenta(form({ precio_venta_final: '20000' }), CONSIG, { ...OPTS, comisionPct: 8 }))
    expect(r.movimientos[0].monto).toBe(1600)
    expect(r.desglose.comision_pct).toBe(8)
    expect(r.movimientos[0].descripcion).toBe('Comisión 8% venta VW Amarok')
  })

  it('con el check tildado suma el reintegro de gastos a nombre del dueño', () => {
    const r = plan(planVenta(
      form({ precio_venta_final: '20000', cobrar_gastos: true }),
      CONSIG,
      { ...OPTS, gastosAdelantados: 350.5 },
    ))
    expect(r.movimientos).toHaveLength(2)
    expect(r.movimientos[1]).toEqual({
      tipo: 'ingreso',
      categoria: 'client_repayment',
      monto: 350.5,
      vehicle_id: 9,
      cliente_id: 4,
      cuenta: 'cash',
      descripcion: 'Reintegro de gastos adelantados VW Amarok',
    })
    expect(r.desglose.entra_a_caja).toBe(1350.5)
    expect(r.desglose.neto_al_dueno).toBe(18649.5)
  })

  it('sin el check, los gastos se informan pero no se cobran', () => {
    const r = plan(planVenta(
      form({ precio_venta_final: '20000' }), CONSIG, { ...OPTS, gastosAdelantados: 350 },
    ))
    expect(r.movimientos).toHaveLength(1)
    expect(r.desglose.gastos_adelantados).toBe(350)
    expect(r.desglose.entra_a_caja).toBe(1000)
  })

  it('rechaza el reintegro si la consignación no tiene cliente dueño', () => {
    const r = planVenta(
      form({ cobrar_gastos: true }),
      { ...CONSIG, cliente_id: null },
      { ...OPTS, gastosAdelantados: 350 },
    )
    expect(r).toMatchObject({ ok: false })
  })

  it('sin gastos, el check tildado no agrega un movimiento de $0', () => {
    const r = plan(planVenta(form({ cobrar_gastos: true }), CONSIG, OPTS))
    expect(r.movimientos).toHaveLength(1)
  })
})

describe('planVenta — validación', () => {
  it('exige precio > 0 y numérico', () => {
    expect(planVenta(form({ precio_venta_final: '' }), PROPIO, OPTS)).toMatchObject({ ok: false })
    expect(planVenta(form({ precio_venta_final: '0' }), PROPIO, OPTS)).toMatchObject({ ok: false })
    expect(planVenta(form({ precio_venta_final: '-5' }), PROPIO, OPTS)).toMatchObject({ ok: false })
    expect(planVenta(form({ precio_venta_final: 'diez mil' }), PROPIO, OPTS)).toMatchObject({ ok: false })
  })

  it('exige cuenta destino', () => {
    expect(planVenta(form({ cuenta: '' }), PROPIO, OPTS)).toMatchObject({ ok: false })
  })

  it('exige fecha YYYY-MM-DD si viene', () => {
    expect(planVenta(form({ fecha_venta: '27/08/2026' }), PROPIO, OPTS)).toMatchObject({ ok: false })
  })

  it('rechaza un auto sin id', () => {
    expect(planVenta(form(), { ...PROPIO, id: null }, OPTS)).toMatchObject({ ok: false })
  })
})

describe('autoLabelVenta', () => {
  it('agrega el dominio cuando está', () => {
    expect(autoLabelVenta(PROPIO)).toBe('Chevrolet Cruze (AB123CD)')
    expect(autoLabelVenta(CONSIG)).toBe('VW Amarok')
  })
})
