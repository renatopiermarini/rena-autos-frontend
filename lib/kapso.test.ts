/**
 * Tests for the pure finance helpers in lib/kapso.ts.
 *
 * These MIRROR the backend's single definitions (rena-autos-api:
 * _ledger_costo / _loan_position / _affects_balance / _patrimonio) and their
 * test numbers, so a divergence between bot and dashboard shows up here as a
 * red test, not as two different totals in front of the same user.
 */
import { describe, expect, it } from 'vitest'
import {
  affectsBalance, arDay, coerceId, tasaPct,
  computeVehicleFinancials, computeLoanPosition, computePatrimonio, computeLiquidacionConsignacion,
  DEFAULT_CUENTAS, cuentaKeys, cuentasInfo, capFirst, umbralAlertaCaja,
} from './kapso'

const HOY = '2026-08-10'

// ── Snapshot numérico del patrimonio con las cuentas por defecto ──────────────
//
// Escrito ANTES de volver dinámicas las cuentas (`cajas` pasó de
// {cash,nexo,fiwind} a Record<string, number>): estos números son los que
// devolvía la versión hardcodeada. Si el refactor mueve un centavo, este test se
// pone rojo. Es el contrato de "sin tablas de config, el dashboard de Renato
// calcula exactamente igual que siempre".
const SNAPSHOT_MOVS = [
  { cuenta: 'cash',   tipo: 'ingreso', monto: 20000.55, afecta_balance: 1 },
  { cuenta: 'cash',   tipo: 'egreso',  monto: 1234.33,  afecta_balance: 1 },
  { cuenta: 'cash',   tipo: 'egreso',  monto: 9999,     afecta_balance: 0 },   // no afecta saldo
  { cuenta: 'nexo',   tipo: 'ingreso', monto: 5094.33,  saldo_post: 5094.33 }, // pre-DDL
  { cuenta: 'nexo',   tipo: 'egreso',  monto: 0.01,     afecta_balance: 1 },
  { cuenta: 'fiwind', tipo: 'ingreso', monto: 777.77,   afecta_balance: 1 },
  { cuenta: 'inventada', tipo: 'ingreso', monto: 50000, afecta_balance: 1 },   // cuenta fuera del perfil: se ignora
  { tipo: 'egreso',  categoria: 'client_expense',   monto: 3118, cliente_id: 9, vehicle_id: 7, cuenta: 'cash', afecta_balance: 0 },
  { tipo: 'ingreso', categoria: 'client_repayment', monto: 400,  cliente_id: 9, cuenta: 'cash', afecta_balance: 0 },
]
const SNAPSHOT_VEHICLES = [
  { id: 37, marca: 'Porsche', modelo: 'Cayenne', tipo_operacion: 'propio', estado: 'en_preparacion', precio_compra: 11000, precio_venta_objetivo: 22000 },
  { id: 6, marca: 'BMW', modelo: '130i', tipo_operacion: 'propio', estado: 'en_preparacion', precio_compra: 16000, precio_venta_objetivo: 18000, uso_personal: 1 },
  { id: 31, marca: 'Chevrolet', modelo: 'Cruze', tipo_operacion: 'consignacion', estado: 'publicado', precio_venta_objetivo: 14000 },
]
const SNAPSHOT_PRESTAMOS = [
  { id: 1, acreedor_id: 2, monto_original: 10000, tasa_interes_anual: 15, modalidad: 'mensual', fecha_inicio: '2026-07-20', estado: 'activo' },
]
const SNAPSHOT_CLIENTES = [{ id: 2, nombre: 'Luciano' }, { id: 9, nombre: 'Nico' }]

describe('computePatrimonio · snapshot con las cuentas por defecto', () => {
  it('los números no se mueven al volver dinámicas las cuentas', () => {
    const pat = computePatrimonio(SNAPSHOT_MOVS, SNAPSHOT_VEHICLES, SNAPSHOT_PRESTAMOS, SNAPSHOT_CLIENTES, HOY)
    expect(pat.cajas.cash).toBe(18766.22)
    expect(pat.cajas.nexo).toBe(5094.32)
    expect(pat.cajas.fiwind).toBe(777.77)
    expect(pat.cajas.total).toBe(24638.31)
    // el 130i (uso_personal=1) es stock como cualquier otro
    expect(pat.stock.total).toBe(40000)
    expect(pat.stock.costo_invertido).toBe(27000)
    expect(pat.stock.ganancia_esperada).toBe(13000)
    expect(pat.por_cobrar.total).toBe(3418)
    expect(pat.por_cobrar.comisiones_consignaciones.total).toBe(700)
    expect(pat.deuda_total).toBe(10125)
    expect(pat.interes_mensual_total).toBe(125)
    expect(pat.capital_propio).toBe(57931.31)
  })
})

describe('cuentaKeys / cuentasInfo', () => {
  it('sin tabla (o tabla vacía) devuelve las tres de siempre', () => {
    expect(cuentaKeys([])).toEqual(DEFAULT_CUENTAS)
    expect(cuentaKeys([{ clave: 'cash', activa: 0 }])).toEqual(DEFAULT_CUENTAS)
    expect(cuentasInfo([])).toEqual([
      { clave: 'cash', label: 'cash' },
      { clave: 'nexo', label: 'nexo' },
      { clave: 'fiwind', label: 'fiwind' },
    ])
  })
  it('con tabla: sólo activas, en orden, con su label', () => {
    const rows = [
      { id: 2, clave: 'mp', label: 'Mercado Pago', orden: 2, activa: 1 },
      { id: 1, clave: 'caja_chica', label: 'Caja Chica', orden: 1, activa: 1 },
      { id: 3, clave: 'vieja', label: 'Vieja', orden: 3, activa: 0 },
    ]
    expect(cuentaKeys(rows)).toEqual(['caja_chica', 'mp'])
    expect(cuentasInfo(rows).map(c => c.label)).toEqual(['Caja Chica', 'Mercado Pago'])
  })
  it('sin label, el label es la clave (y capFirst la muestra capitalizada)', () => {
    expect(cuentasInfo([{ id: 1, clave: 'usdt', activa: 1 }])).toEqual([{ clave: 'usdt', label: 'usdt' }])
    expect(capFirst('usdt')).toBe('Usdt')
    expect(capFirst('Caja Chica')).toBe('Caja Chica')
    expect(capFirst('')).toBe('')
  })
})

describe('umbralAlertaCaja', () => {
  it('sin config, los 500 de siempre; con config, el número cargado', () => {
    expect(umbralAlertaCaja({})).toBe(500)
    expect(umbralAlertaCaja(undefined)).toBe(500)
    expect(umbralAlertaCaja({ umbral_alerta_caja: 'no es un número' })).toBe(500)
    expect(umbralAlertaCaja({ umbral_alerta_caja: '1200' })).toBe(1200)
    expect(umbralAlertaCaja({ umbral_alerta_caja: '0' })).toBe(0)
  })
})

describe('computePatrimonio · cuentas custom', () => {
  it('suma las cuentas del perfil e ignora las que no están', () => {
    const movs = [
      { cuenta: 'caja_chica', tipo: 'ingreso', monto: 1000.5, afecta_balance: 1 },
      { cuenta: 'caja_chica', tipo: 'egreso',  monto: 250.25, afecta_balance: 1 },
      { cuenta: 'mp',         tipo: 'ingreso', monto: 3000,   afecta_balance: 1 },
      { cuenta: 'cash',       tipo: 'ingreso', monto: 99999,  afecta_balance: 1 }, // fuera del perfil
    ]
    const pat = computePatrimonio(movs, [], [], [], HOY, ['caja_chica', 'mp'])
    expect(pat.cajas.caja_chica).toBe(750.25)
    expect(pat.cajas.mp).toBe(3000)
    expect(pat.cajas.cash).toBeUndefined()
    expect(pat.cajas.total).toBe(3750.25)
    expect(pat.capital_propio).toBe(3750.25)
  })
  it('el default sigue siendo cash/nexo/fiwind', () => {
    const movs = [{ cuenta: 'fiwind', tipo: 'ingreso', monto: 10, afecta_balance: 1 }]
    const explicito = computePatrimonio(movs, [], [], [], HOY, DEFAULT_CUENTAS)
    const implicito = computePatrimonio(movs, [], [], [], HOY)
    expect(implicito.cajas).toEqual(explicito.cajas)
    expect(implicito.cajas).toEqual({ cash: 0, nexo: 0, fiwind: 10, total: 10 })
  })
})

describe('affectsBalance', () => {
  it('explicit column wins over saldo_post, both directions', () => {
    expect(affectsBalance({ afecta_balance: 0, saldo_post: 600 })).toBe(false)
    expect(affectsBalance({ afecta_balance: 1, saldo_post: null })).toBe(true)
    expect(affectsBalance({ afecta_balance: '0', saldo_post: 600 })).toBe(false) // D1 string
  })
  it('pre-DDL rows fall back to saldo_post IS NOT NULL', () => {
    expect(affectsBalance({ saldo_post: 100 })).toBe(true)
    expect(affectsBalance({ saldo_post: null })).toBe(false)
  })
})

describe('arDay', () => {
  it('shifts UTC timestamps to the Argentine calendar day', () => {
    expect(arDay('2026-08-10T01:05:00+00:00')).toBe('2026-08-09') // 22:05 AR del 9
    expect(arDay('2026-08-10T12:00:00+00:00')).toBe('2026-08-10')
  })
  it('passes date-only strings through untouched', () => {
    expect(arDay('2026-08-10')).toBe('2026-08-10')
  })
})

describe('tasaPct', () => {
  it('percent is canonical; legacy fractions tolerated', () => {
    expect(tasaPct(15)).toBe(15)
    expect(tasaPct(0.15)).toBe(15)
    expect(tasaPct(0)).toBe(0)
    expect(tasaPct(null)).toBe(0)
  })
})

describe('computeVehicleFinancials', () => {
  const vehicles = [{ id: 6, tipo_operacion: 'propio', precio_compra: 12750, precio_publicado: 21000 }]
  const movs = [
    { vehicle_id: 6, tipo: 'egreso', categoria: 'vehicle_expense', monto: 2300 },
    { vehicle_id: '6', tipo: 'egreso', categoria: 'vehicle_expense', monto: 1672 }, // TEXT fk
    { vehicle_id: 6, tipo: 'egreso', categoria: 'vehicle_purchase', monto: 12750 },
    { vehicle_id: 6, tipo: 'egreso', categoria: 'refund', monto: 500 },
    { vehicle_id: 6, tipo: 'egreso', categoria: 'client_expense', monto: 300, cliente_id: 4 },
    { vehicle_id: 7, tipo: 'egreso', categoria: 'vehicle_expense', monto: 999 },
  ]

  it('mirrors _ledger_costo: coalesce compra, gastos, otros, client_expense apart', () => {
    const f = computeVehicleFinancials(6, vehicles, movs, [])
    expect(f.compra).toBe(12750)                 // precio_compra wins, no double count
    expect(f.fuente_compra).toBe('precio_compra')
    expect(f.gastos_total).toBe(3972)            // "6" string fk counted (130i fix)
    expect(f.otros_egresos).toBe(500)            // refund: fuera de costo, dentro de egresos
    expect(f.gastos_cliente).toBe(300)           // plata del cliente: fuera de TODO
    expect(f.costo_total).toBe(16722)
    expect(f.egresos_totales).toBe(17222)
    expect(f.margen_esperado).toBe(21000 - 16722)
  })

  it('falls back to vehicle_purchase movs when the ficha has no precio_compra', () => {
    const f = computeVehicleFinancials(6, [{ id: 6, tipo_operacion: 'propio' }], movs, [])
    expect(f.compra).toBe(12750)
    expect(f.fuente_compra).toBe('vehicle_purchase')
  })
})

describe('computeLoanPosition', () => {
  it('mensual: cuota fija capital × tasa/12, devengado por 1° de mes vencidos', () => {
    const pos = computeLoanPosition(
      { id: 1, monto_original: 16000, tasa_interes_anual: 15, modalidad: 'mensual', fecha_inicio: '2026-04-17', estado: 'activo' },
      [], HOY,
    )
    expect(pos.interes_mensual).toBe(200)
    expect(pos.interes_devengado).toBe(800)      // 1/05, 1/06, 1/07, 1/08
    expect(pos.deuda_total).toBe(16800)
    expect(pos.proximo_vencimiento).toBe('2026-09-01')
  })

  it('mensual iniciado este mes: nada devengado (primera cuota el 1° siguiente)', () => {
    const pos = computeLoanPosition(
      { id: 6, monto_original: 26000, tasa_interes_anual: 15, modalidad: 'mensual', fecha_inicio: '2026-08-01', estado: 'activo' },
      [], HOY,
    )
    expect(pos.interes_devengado).toBe(0)
    expect(pos.deuda_total).toBe(26000)
  })

  it('al_final: devenga por días; los de Pato cuadran a mano', () => {
    const p1 = computeLoanPosition(
      { id: 2, monto_original: 4500, tasa_interes_anual: 15, modalidad: 'al_final', fecha_inicio: '2026-03-27', estado: 'activo' },
      [], HOY,
    )
    expect(p1.interes_devengado).toBe(Math.round(4500 * 0.15 * 136 / 365 * 100) / 100) // 251.51
    expect(p1.deuda_total).toBe(4500 + p1.interes_devengado)
  })

  it('capital vivo y pagos salen del ledger por prestamo_id — monto_pagado se ignora', () => {
    const movs = [
      { prestamo_id: '1', categoria: 'loan_repayment', tipo: 'egreso', monto: 8000, created_at: '2026-07-25T12:00:00+00:00' },
      { prestamo_id: 1, categoria: 'loan_interest', tipo: 'egreso', monto: 100, created_at: '2026-08-03T12:00:00+00:00' },
    ]
    const pos = computeLoanPosition(
      { id: 1, monto_original: 16000, tasa_interes_anual: 15, modalidad: 'mensual', fecha_inicio: '2026-07-20', monto_pagado: 9999, estado: 'activo' },
      movs, HOY,
    )
    expect(pos.capital_vivo).toBe(8000)          // "1" string fk matched
    expect(pos.interes_mensual).toBe(100)        // sobre capital vivo
    expect(pos.interes_mes_pagado).toBe(true)
    expect(pos.interes_adeudado).toBe(0)
  })
})

describe('computePatrimonio', () => {
  it('cajas (derivadas) + stock a valor esperado + por cobrar − deudas', () => {
    const movs = [
      { cuenta: 'cash', tipo: 'ingreso', monto: 20000, afecta_balance: 1 },
      { cuenta: 'cash', tipo: 'egreso', monto: 9999, afecta_balance: 0 },   // no afecta
      { cuenta: 'nexo', tipo: 'ingreso', monto: 5000, saldo_post: 5000 },   // pre-DDL
      { tipo: 'egreso', categoria: 'client_expense', monto: 3118, cliente_id: 9, vehicle_id: 7, cuenta: 'cash', afecta_balance: 0 },
      { tipo: 'ingreso', categoria: 'client_repayment', monto: 400, cliente_id: 9, cuenta: 'cash', afecta_balance: 0 },
    ]
    const vehicles = [
      { id: 37, marca: 'Porsche', modelo: 'Cayenne', tipo_operacion: 'propio', estado: 'en_preparacion', precio_compra: 11000, precio_venta_objetivo: 22000 },
      { id: 31, marca: 'Chevrolet', modelo: 'Cruze', tipo_operacion: 'consignacion', estado: 'publicado', precio_compra: 9999 }, // no cuenta
      { id: 7, marca: 'VW', modelo: 'Golf', tipo_operacion: 'propio', estado: 'vendido', precio_compra: 8000 },                  // vendido
    ]
    const prestamos = [
      { id: 1, acreedor_id: 2, monto_original: 10000, tasa_interes_anual: 15, modalidad: 'mensual', fecha_inicio: '2026-07-20', estado: 'activo' },
      { id: 9, monto_original: 999, estado: 'pagado', modalidad: 'mensual', tasa_interes_anual: 15 },
    ]
    const clientes = [{ id: 2, nombre: 'Luciano' }, { id: 9, nombre: 'Nico' }]

    const pat = computePatrimonio(movs, vehicles, prestamos, clientes, HOY)
    expect(pat.cajas.total).toBe(25000)
    expect(pat.stock.total).toBe(22000)
    expect(pat.stock.costo_invertido).toBe(11000)
    expect(pat.stock.ganancia_esperada).toBe(11000)
    expect(pat.por_cobrar.total).toBe(2718)
    expect(pat.por_cobrar.clientes[0].nombre).toBe('Nico')
    expect(pat.deuda_total).toBe(10125)          // 10000 + cuota agosto impaga
    expect(pat.interes_mensual_total).toBe(125)
    expect(pat.capital_propio).toBe(25000 + 22000 + 2718 - 10125)
  })
})

describe('coerceId', () => {
  it('numbers, strings, and empties', () => {
    expect(coerceId('6')).toBe(6)
    expect(coerceId(6)).toBe(6)
    expect(coerceId('')).toBe(null)
    expect(coerceId(null)).toBe(null)
  })
})

describe('computePatrimonio · auto en uso', () => {
  it('uso_personal=1 ya no separa nada: es stock como cualquier otro', () => {
    const vehicles = [
      { id: 6, marca: 'BMW', modelo: '130i', tipo_operacion: 'propio', estado: 'en_preparacion', precio_compra: 16000, precio_venta_objetivo: 18000, uso_personal: 1 },
      { id: 37, marca: 'Porsche', modelo: 'Cayenne', tipo_operacion: 'propio', estado: 'en_preparacion', precio_compra: 11000, precio_venta_objetivo: 22000 },
    ]
    const movs = [{ cuenta: 'cash', tipo: 'ingreso', monto: 1000, afecta_balance: 1 }]
    const pat = computePatrimonio(movs, vehicles, [], [], HOY)
    expect(pat.stock.total).toBe(40000)          // 130i + Cayenne
    expect(pat.stock.autos.map(a => a.vehicle_id).sort((a, b) => (a ?? 0) - (b ?? 0))).toEqual([6, 37])
    expect(pat.capital_propio).toBe(1000 + 40000)
  })
})

describe('computeLiquidacionConsignacion', () => {
  const movs = [
    { vehicle_id: 31, tipo: 'egreso', categoria: 'client_expense', monto: 380, cliente_id: 4 },
  ]
  it('vendida: precio final − 5% − gastos adelantados', () => {
    const liq = computeLiquidacionConsignacion(31,
      [{ id: 31, tipo_operacion: 'consignacion', precio_venta_final: 16500 }], movs)
    expect(liq.comision).toBe(825)
    expect(liq.gastos_adelantados).toBe(380)
    expect(liq.neto_al_cliente).toBe(16500 - 825 - 380)
    expect(liq.estimada).toBe(false)
  })
  it('sin vender: estima con precio publicado y lo marca', () => {
    const liq = computeLiquidacionConsignacion(31,
      [{ id: 31, tipo_operacion: 'consignacion', precio_publicado: 17500 }], movs)
    expect(liq.estimada).toBe(true)
    expect(liq.fuente_precio).toBe('precio_publicado')
    expect(liq.neto_al_cliente).toBe(17500 - 875 - 380)
  })
})

describe('computePatrimonio · comisiones esperadas de consignaciones', () => {
  it('5% del precio objetivo (fallback publicado) de consignaciones activas', () => {
    const vehicles = [
      { id: 30, marca: 'Chevrolet', modelo: 'Cruze LTZ', tipo_operacion: 'consignacion', estado: 'publicado', precio_venta_objetivo: 14000 },
      { id: 29, marca: 'Toyota', modelo: 'Hilux GR', tipo_operacion: 'consignacion', estado: 'publicado', precio_publicado: 60000 },
      { id: 28, marca: 'Jeep', modelo: 'Renegade', tipo_operacion: 'consignacion', estado: 'vendido', precio_venta_objetivo: 9999 },
      { id: 27, marca: 'Kia', modelo: 'Rio', tipo_operacion: 'consignacion', estado: 'publicado' }, // sin precio
    ]
    const pat = computePatrimonio([], vehicles, [], [], HOY)
    expect(pat.por_cobrar.comisiones_consignaciones.total).toBe(700 + 3000)
    expect(pat.por_cobrar.comisiones_consignaciones.autos.map(a => a.vehicle_id)).toEqual([29, 30])
    expect(pat.por_cobrar.total).toBe(3700)
    expect(pat.capital_propio).toBe(3700)
  })
})

describe('computePatrimonio · socios y señas', () => {
  it('descuenta la seña ya cobrada del valor del auto', () => {
    // La seña está en la caja: el auto vale en el stock lo que FALTA cobrar.
    const pat = computePatrimonio(
      [{ cuenta: 'cash', tipo: 'ingreso', monto: 300, saldo_post: 300, categoria: 'down_payment', vehicle_id: 1 }],
      [{ id: 1, tipo_operacion: 'propio', estado: 'reservado', marca: 'VW', modelo: 'Taos', precio_venta_objetivo: 22000 }],
      [], [],
    )
    expect(pat.cajas.total).toBe(300)
    expect(pat.stock.total).toBe(21700)
    expect(pat.stock.autos[0].sena_cobrada).toBe(300)
    expect(pat.capital_propio).toBe(22000)   // el precio del auto, no precio + seña
  })

  it('resta la parte del margen que le toca al socio', () => {
    const pat = computePatrimonio(
      [{ cuenta: 'cash', tipo: 'egreso', monto: 20000, saldo_post: 0, categoria: 'vehicle_purchase', vehicle_id: 1 }],
      [{ id: 1, tipo_operacion: 'propio', estado: 'publicado', marca: 'VW', modelo: 'Amarok',
         precio_venta_objetivo: 30000, socio_cliente_id: 7, socio_pct: 50 }],
      [], [{ id: 7, nombre: 'Tincho' }],
    )
    expect(pat.stock.total).toBe(30000)
    expect(pat.parte_socios.total).toBe(5000)   // margen 10000, mitad del socio
    expect(pat.parte_socios.autos[0].socio).toBe('Tincho')
    expect(pat.capital_propio).toBe(5000)
  })

  it('sin socio cargado no cambia nada (pre-DDL la columna no existe)', () => {
    const pat = computePatrimonio(
      [], [{ id: 1, tipo_operacion: 'propio', estado: 'publicado', marca: 'VW', modelo: 'Amarok', precio_venta_objetivo: 30000 }],
      [], [],
    )
    expect(pat.parte_socios).toEqual({ total: 0, autos: [] })
    expect(pat.capital_propio).toBe(30000)
  })
})
