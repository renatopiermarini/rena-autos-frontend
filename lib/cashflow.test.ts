/**
 * Tablero /cashflow: las tres miradas (caja, resultado, capital) tienen que
 * cerrar entre sí y con computePatrimonio. Escenario armado a mano con los
 * números esperados calculados en papel (ver comentarios).
 */
import { describe, expect, it } from 'vitest'
import { buildCashflowReport, detectarTransferencias, mesesEntre, mesCorto, LINEAS_PUENTE, conceptoFijo, parseGastosFijos, GASTOS_FIJOS_DEFAULT } from './cashflow'
import { computePatrimonio } from './kapso'

const HOY = '2026-09-15'

// Cronología:
//  jul: préstamo 20.000 al 12% mensual (cuota 200) · compra auto 10 a 15.000
//       (objetivo 20.000) · gasto 1.000 · gasto general 500 · entra la
//       consignación 20 (objetivo 10.000 → comisión esperada 500)
//  ago: paga cuota 200 · seña 2.000 + venta 17.000 del auto 10 (19.000 total:
//       margen 3.000, pero 1.000 menos que lo esperado) · retiro 800
//  sep: comisión 500 del 20 (vendido) · entra la consignación 21 (objetivo
//       20.000 → 1.000 esperados) · cuota 200 · transferencia cash→nexo 3.000
const MOVS = [
  { id: 1,  cuenta: 'cash', tipo: 'ingreso', categoria: 'apertura',            monto: 10000, created_at: '1999-12-31T12:00:00+00:00', afecta_balance: 1 },
  { id: 2,  cuenta: 'cash', tipo: 'ingreso', categoria: 'loan_disbursement',   monto: 20000, created_at: '2026-07-01T15:00:00+00:00', afecta_balance: 1, prestamo_id: 1 },
  { id: 3,  cuenta: 'cash', tipo: 'egreso',  categoria: 'vehicle_purchase',    monto: 15000, created_at: '2026-07-02T15:00:00+00:00', afecta_balance: 1, vehicle_id: 10 },
  { id: 4,  cuenta: 'cash', tipo: 'egreso',  categoria: 'vehicle_expense',     monto: 1000,  created_at: '2026-07-10T15:00:00+00:00', afecta_balance: 1, vehicle_id: 10 },
  { id: 5,  cuenta: 'cash', tipo: 'egreso',  categoria: 'general_expense',     monto: 500,   created_at: '2026-07-15T15:00:00+00:00', afecta_balance: 1 },
  { id: 6,  cuenta: 'cash', tipo: 'egreso',  categoria: 'loan_interest',       monto: 200,   created_at: '2026-08-01T15:00:00+00:00', afecta_balance: 1, prestamo_id: 1 },
  { id: 7,  cuenta: 'cash', tipo: 'ingreso', categoria: 'down_payment',        monto: 2000,  created_at: '2026-08-05T15:00:00+00:00', afecta_balance: 1, vehicle_id: 10 },
  { id: 8,  cuenta: 'cash', tipo: 'ingreso', categoria: 'venta',               monto: 17000, created_at: '2026-08-20T15:00:00+00:00', afecta_balance: 1, vehicle_id: 10 },
  { id: 9,  cuenta: 'cash', tipo: 'egreso',  categoria: 'personal_withdrawal', monto: 800,   created_at: '2026-08-25T15:00:00+00:00', afecta_balance: 1 },
  { id: 10, cuenta: 'cash', tipo: 'ingreso', categoria: 'commission',          monto: 500,   created_at: '2026-09-05T15:00:00+00:00', afecta_balance: 1, vehicle_id: 20 },
  { id: 11, cuenta: 'cash', tipo: 'egreso',  categoria: 'other',               monto: 3000,  created_at: '2026-09-10T15:00:00+00:00', afecta_balance: 1, nota: 'Transferencia interna cash → nexo' },
  { id: 12, cuenta: 'nexo', tipo: 'ingreso', categoria: 'other',               monto: 3000,  created_at: '2026-09-10T15:00:05+00:00', afecta_balance: 1, nota: 'Transferencia interna cash → nexo' },
  { id: 13, cuenta: 'cash', tipo: 'egreso',  categoria: 'loan_interest',       monto: 200,   created_at: '2026-09-01T15:00:00+00:00', afecta_balance: 1, prestamo_id: 1 },
]
const VEHICLES = [
  { id: 10, marca: 'Chevrolet', modelo: 'Cruze', tipo_operacion: 'propio', estado: 'vendido', precio_venta_objetivo: 20000, fecha_venta: '2026-08-20', created_at: '2026-07-02' },
  { id: 20, marca: 'Toyota', modelo: 'Corolla', tipo_operacion: 'consignacion', estado: 'vendido', precio_venta_objetivo: 10000, fecha_venta: '2026-09-05', created_at: '2026-07-05' },
  { id: 21, marca: 'Audi', modelo: 'A4', tipo_operacion: 'consignacion', estado: 'publicado', precio_venta_objetivo: 20000, created_at: '2026-09-01' },
]
const PRESTAMOS = [
  { id: 1, acreedor_id: 5, monto_original: 20000, tasa_interes_anual: 12, modalidad: 'mensual', fecha_inicio: '2026-07-01', estado: 'activo', created_at: '2026-07-01T15:00:00+00:00' },
]
const CLIENTES = [{ id: 5, nombre: 'Luciano' }]

const input = { movimientos: MOVS, vehicles: VEHICLES, prestamos: PRESTAMOS, clientes: CLIENTES, hoy: HOY }

describe('helpers de fecha', () => {
  it('mesesEntre incluye los extremos y cruza el año', () => {
    expect(mesesEntre('2026-11-20', '2027-02-01')).toEqual(['2026-11', '2026-12', '2027-01', '2027-02'])
  })
  it('mesCorto', () => {
    expect(mesCorto('2026-09')).toBe('sep 26')
  })
})

describe('detectarTransferencias', () => {
  it('empareja egreso e ingreso "other" del mismo monto en cuentas distintas', () => {
    expect(Array.from(detectarTransferencias(MOVS)).sort()).toEqual([11, 12])
  })
  it('no empareja dentro de la misma cuenta ni lejos en el tiempo', () => {
    const movs = [
      { id: 1, cuenta: 'cash', tipo: 'egreso',  categoria: 'other', monto: 100, created_at: '2026-09-10T15:00:00Z', afecta_balance: 1 },
      { id: 2, cuenta: 'cash', tipo: 'ingreso', categoria: 'other', monto: 100, created_at: '2026-09-10T15:00:01Z', afecta_balance: 1 },
      { id: 3, cuenta: 'nexo', tipo: 'ingreso', categoria: 'other', monto: 100, created_at: '2026-09-11T15:00:00Z', afecta_balance: 1 },
    ]
    expect(detectarTransferencias(movs).size).toBe(0)
  })
})

describe('buildCashflowReport · escenario completo', () => {
  const r = buildCashflowReport(input)

  it('el capital de hoy es EXACTAMENTE el de computePatrimonio (el número de /finanzas)', () => {
    const pat = computePatrimonio(MOVS, VEHICLES, PRESTAMOS, CLIENTES, HOY)
    expect(r.capital.hoy).toBe(pat.capital_propio)
    // cajas 31.800 + comisión esperada del 21 (1.000) − préstamo 20.000
    expect(r.capital.hoy).toBe(12800)
  })

  it('meses desde el primer movimiento real (la apertura de 1999 no abre un mes)', () => {
    expect(r.meses).toEqual(['2026-07', '2026-08', '2026-09'])
    expect(r.capital.serie[0]).toEqual({ d: '2026-06-30', v: 10000 })
    expect(r.capital.serie[r.capital.serie.length - 1]).toEqual({ d: HOY, v: 12800 })
  })

  it('flujo de caja: sin la transferencia, y Σ líneas = neto = variación de cajas', () => {
    expect(r.caja['2026-07'].neto).toBe(3500)
    expect(r.caja['2026-07'].cajaCierre).toBe(13500)
    expect(r.caja['2026-08'].neto).toBe(18000)
    expect(r.caja['2026-09'].neto).toBe(300)
    expect(r.caja['2026-09'].lineas.otros).toBe(0)
    let prev = 10000
    for (const mes of r.meses) {
      const c = r.caja[mes]
      const suma = Object.values(c.lineas).reduce((s, v) => s + v, 0)
      expect(suma).toBeCloseTo(c.neto, 2)
      expect(c.cajaCierre - prev).toBeCloseTo(c.neto, 2)
      prev = c.cajaCierre
    }
  })

  it('puente de julio: entra el auto con 4.000 de margen esperado neto de gastos', () => {
    const p = r.puentes['2026-07']
    expect(p.capitalInicio).toBe(10000)
    expect(p.capitalFin).toBe(14000)
    expect(p.lineas.autos_entraron).toBe(4000)       // 20.000 esperado − 15.000 − 1.000
    expect(p.lineas.consignaciones).toBe(500)        // comisión esperada del 20
    expect(p.lineas.gastos_generales).toBe(-500)
    expect(p.lineas.otros).toBe(0)                   // préstamo: entra caja y entra deuda
    expect(p.lineas.diferencias).toBe(0)
  })

  it('puente de agosto: vender 1.000 por debajo de lo esperado baja el capital', () => {
    const p = r.puentes['2026-08']
    expect(p.capitalFin - p.capitalInicio).toBe(-2000)
    expect(p.lineas.autos_vendidos).toBe(-1000)
    expect(p.lineas.intereses).toBe(-200)
    expect(p.lineas.retiros).toBe(-800)
    expect(p.lineas.diferencias).toBe(0)
    expect(p.autos[0]).toMatchObject({ vehicle_id: 10, antes: 'stock', despues: 'vendido', efecto: -1000 })
  })

  it('puente de septiembre: cobrar la comisión esperada no mueve el capital; la nueva consignación sí', () => {
    const p = r.puentes['2026-09']
    expect(p.lineas.consignaciones).toBe(1000)
    expect(p.lineas.intereses).toBe(-200)
    expect(p.lineas.diferencias).toBe(0)
    expect(p.capitalFin).toBe(12800)
  })

  it('puente total: el auto entró y salió en el período → margen realizado 3.000', () => {
    const p = r.puentes.total
    expect(p.lineas.autos_vendidos).toBe(3000)
    expect(p.lineas.consignaciones).toBe(1500)
    expect(p.lineas.intereses).toBe(-400)
    expect(p.lineas.diferencias).toBe(0)
    const suma = LINEAS_PUENTE.reduce((s, l) => s + p.lineas[l.key], 0)
    expect(p.capitalInicio + suma).toBeCloseTo(p.capitalFin, 2)
  })

  it('las diferencias mensuales suman la del total', () => {
    const mensual = r.meses.reduce((s, m) => s + r.puentes[m].lineas.diferencias, 0)
    expect(mensual).toBeCloseTo(r.puentes.total.lineas.diferencias, 2)
  })

  it('resultado: el margen del auto se reconoce el mes de la venta, el interés cuando se devenga', () => {
    expect(r.resultado['2026-07']).toMatchObject({ margenAutos: 0, gastosGenerales: -500, intereses: 0, neto: -500 })
    expect(r.resultado['2026-08']).toMatchObject({ margenAutos: 3000, intereses: -200, operativo: 2800, retiros: -800, neto: 2000 })
    expect(r.resultado['2026-08'].autosVendidos[0]).toMatchObject({ vehicle_id: 10, ingresos: 19000, costo: 16000, margen: 3000 })
    expect(r.resultado['2026-09']).toMatchObject({ comisiones: 500, consignacionesVendidas: 1, intereses: -200, operativo: 300 })
  })

  it('gastos: lo que salió de la caja, por tipo', () => {
    expect(r.gastos['2026-07']).toMatchObject({ fijos: 0, gastos_generales: 500, gastos_autos: 1000, intereses: 0, retiros: 0 })
    expect(r.gastos['2026-08']).toMatchObject({ fijos: 0, gastos_generales: 0, gastos_autos: 0, intereses: 200, retiros: 800 })
    expect(r.topGastos['2026-07'].map(g => g.monto)).toEqual([1000, 500])
  })

  it('punto de equilibrio con los meses cerrados', () => {
    expect(r.equilibrio.mesesBase).toEqual(['2026-07', '2026-08'])
    // Gasto fijo = retiros (0 · 800 → 400); el gasto general de julio no es
    // ni Fran ni Marshiot ni cochera → otros (500 · 0 → 250); intereses 0 · 200 → 100.
    expect(r.equilibrio.gastoFijoProm).toBe(400)
    expect(r.equilibrio.otrosGastosProm).toBe(250)
    expect(r.equilibrio.interesesProm).toBe(100)
    expect(r.equilibrio.gastoTotalProm).toBe(750)
    expect(r.equilibrio.margenPromAuto).toBe(3000)
    expect(r.equilibrio.autosNecesarios).toBe(0.25)
  })

  it('sin anomalías en un ledger limpio', () => {
    expect(r.anomalias).toEqual([])
  })
})

describe('buildCashflowReport · compra financiada sin pasar por caja', () => {
  it('préstamo y compra con afecta_balance = 0 se compensan: sin diferencias', () => {
    const r = buildCashflowReport({
      movimientos: [
        { id: 1, cuenta: 'cash', tipo: 'ingreso', categoria: 'apertura', monto: 1000, created_at: '1999-12-31T12:00:00Z', afecta_balance: 1 },
        { id: 2, cuenta: 'cash', tipo: 'ingreso', categoria: 'loan', monto: 5000, created_at: '2026-09-02T15:00:00Z', afecta_balance: 0, prestamo_id: 2 },
        { id: 3, cuenta: 'cash', tipo: 'egreso', categoria: 'vehicle_purchase', monto: 5000, created_at: '2026-09-02T15:00:00Z', afecta_balance: 0, vehicle_id: 30 },
      ],
      vehicles: [{ id: 30, marca: 'Porsche', modelo: 'Cayenne', tipo_operacion: 'propio', estado: 'publicado', precio_venta_objetivo: 8000, created_at: '2026-09-02' }],
      prestamos: [{ id: 2, acreedor_id: 1, monto_original: 5000, tasa_interes_anual: 0, modalidad: 'al_final', fecha_inicio: '2026-09-02', estado: 'activo' }],
      clientes: [],
      hoy: '2026-09-10',
    })
    const p = r.puentes['2026-09']
    expect(p.capitalFin - p.capitalInicio).toBe(3000)
    expect(p.lineas.autos_entraron).toBe(3000)
    expect(p.lineas.otros).toBe(0)
    expect(p.lineas.diferencias).toBe(0)
    // No pasó por caja: el flujo del mes es cero.
    expect(r.caja['2026-09'].neto).toBe(0)
  })
})

describe('buildCashflowReport · préstamo que reinvierte (capitaliza)', () => {
  it('el interés reinvertido es gasto del mes aunque no salga plata, y cuadra el puente', () => {
    const r = buildCashflowReport({
      movimientos: [
        { id: 1, cuenta: 'cash', tipo: 'ingreso', categoria: 'apertura', monto: 1000, created_at: '1999-12-31T12:00:00Z', afecta_balance: 1 },
        { id: 2, cuenta: 'cash', tipo: 'ingreso', categoria: 'loan_disbursement', monto: 18000, created_at: '2026-08-26T15:00:00Z', afecta_balance: 1, prestamo_id: 9 },
      ],
      vehicles: [],
      prestamos: [{ id: 9, acreedor_id: 44, monto_original: 18000, tasa_interes_anual: 18, modalidad: 'capitaliza', fecha_inicio: '2026-08-26', estado: 'activo' }],
      clientes: [{ id: 44, nombre: 'Seba' }],
      hoy: '2026-10-01',
    })
    expect(r.resultado['2026-09'].intereses).toBe(-270)
    const p = r.puentes['2026-09']
    expect(p.lineas.intereses).toBe(-270)
    expect(p.lineas.diferencias).toBe(0)
    expect(p.capitalFin - p.capitalInicio).toBe(-270)
    // No salió plata: el flujo de caja no lo ve.
    expect(r.caja['2026-09'].lineas.intereses).toBe(0)
    expect(r.prestamos[0]).toMatchObject({ modalidad: 'capitaliza', capital: 18270, interesAdeudado: 0, deuda: 18270, interesMensual: 274.05 })
  })

  it('un mes que el acreedor cobra no mueve el capital ni deja diferencias', () => {
    const r = buildCashflowReport({
      movimientos: [
        { id: 1, cuenta: 'cash', tipo: 'ingreso', categoria: 'apertura', monto: 1000, created_at: '1999-12-31T12:00:00Z', afecta_balance: 1 },
        { id: 2, cuenta: 'cash', tipo: 'ingreso', categoria: 'loan_disbursement', monto: 18000, created_at: '2026-08-26T15:00:00Z', afecta_balance: 1, prestamo_id: 9 },
        { id: 3, cuenta: 'cash', tipo: 'egreso', categoria: 'loan_interest', monto: 270, created_at: '2026-10-05T15:00:00Z', afecta_balance: 1, prestamo_id: 9 },
        { id: 4, cuenta: 'cash', tipo: 'egreso', categoria: 'loan_repayment', monto: 3000, created_at: '2026-10-10T15:00:00Z', afecta_balance: 1, prestamo_id: 9 },
      ],
      vehicles: [],
      prestamos: [{ id: 9, acreedor_id: 44, monto_original: 18000, tasa_interes_anual: 18, modalidad: 'capitaliza', fecha_inicio: '2026-08-26', estado: 'activo' }],
      clientes: [{ id: 44, nombre: 'Seba' }],
      hoy: '2026-10-20',
    })
    const p = r.puentes['2026-10']
    expect(p.lineas.diferencias).toBe(0)
    expect(p.capitalFin - p.capitalInicio).toBe(0)
    expect(r.caja['2026-10'].lineas.intereses).toBe(-270)
  })
})

describe('buildCashflowReport · a revisar', () => {
  it('auto vendido sin ingreso y auto propio sin precio ni costo', () => {
    const r = buildCashflowReport({
      movimientos: [
        { id: 1, cuenta: 'cash', tipo: 'egreso', categoria: 'vehicle_purchase', monto: 9000, created_at: '2026-05-29T15:00:00Z', afecta_balance: 1, vehicle_id: 33 },
        { id: 2, cuenta: 'cash', tipo: 'egreso', categoria: 'down_payment', monto: 1300, created_at: '2026-09-24T15:00:00Z', afecta_balance: 1, vehicle_id: 63 },
      ],
      vehicles: [
        { id: 33, marca: 'BMW', modelo: 'X3', tipo_operacion: 'propio', estado: 'vendido', created_at: '2026-05-29' },
        { id: 63, marca: 'Ford', modelo: 'Mustang', tipo_operacion: 'propio', estado: 'a_ingresar', created_at: '2026-09-24' },
      ],
      prestamos: [], clientes: [], hoy: '2026-09-29',
    })
    const titulos = r.anomalias.map(a => a.titulo)
    expect(titulos).toContain('BMW X3: vendido sin ingreso de venta')
    expect(titulos).toContain('Ford Mustang: plata puesta que el patrimonio no ve')
  })
})

describe('buildCashflowReport · fechas de entrada y salida del stock', () => {
  const base = {
    prestamos: [], clientes: [], hoy: '2026-08-31',
  }

  it('un auto cargado antes de pagarlo entra al stock el día del pago (sin salto de capital)', () => {
    const r = buildCashflowReport({
      ...base,
      movimientos: [
        { id: 1, cuenta: 'cash', tipo: 'ingreso', categoria: 'apertura', monto: 20000, created_at: '1999-12-31T12:00:00Z', afecta_balance: 1 },
        { id: 2, cuenta: 'cash', tipo: 'egreso', categoria: 'vehicle_purchase', monto: 15500, created_at: '2026-08-03T15:00:00Z', afecta_balance: 1, vehicle_id: 45 },
        { id: 3, cuenta: 'cash', tipo: 'ingreso', categoria: 'venta', monto: 18500, created_at: '2026-08-06T15:00:00Z', afecta_balance: 1, vehicle_id: 45 },
      ],
      vehicles: [{ id: 45, marca: 'Chevrolet', modelo: 'Cruze', tipo_operacion: 'propio', estado: 'vendido', precio_compra: 15500, precio_venta_objetivo: 19500, fecha_venta: '2026-08-06', created_at: '2026-07-30' }],
    })
    // Antes del pago el auto no cuenta: la historia arranca el 03/08 con la caja.
    expect(r.capital.serie[0]).toEqual({ d: '2026-08-02', v: 20000 })
    const ago = r.puentes['2026-08']
    expect(ago.lineas.autos_vendidos).toBe(3000)   // entró y salió en agosto: margen realizado
    expect(ago.lineas.diferencias).toBe(0)
  })

  it('el auto sale del stock el día del cobro si el cobro se cargó después de marcarlo vendido', () => {
    const r = buildCashflowReport({
      ...base,
      movimientos: [
        { id: 1, cuenta: 'cash', tipo: 'ingreso', categoria: 'venta', monto: 17000, created_at: '2026-08-20T15:00:00Z', afecta_balance: 1, vehicle_id: 11 },
      ],
      vehicles: [{ id: 11, marca: 'Chevrolet', modelo: 'Cruze', tipo_operacion: 'propio', estado: 'vendido', precio_compra: 16000, precio_venta_objetivo: 17000, created_at: '2026-06-01' }],
      auditVehiculos: [{ tabla: 'vehicles', operacion: 'patch', registro_id: 11, fecha: '2026-08-10T15:00:00Z', datos: '{"estado":"vendido"}' }],
    })
    const serie = r.capital.serie
    // Entre el 10 (marcado vendido) y el 20 (cobro) el auto sigue valiendo 17.000.
    expect(serie.find(p => p.d === '2026-08-15')?.v).toBe(17000)
    expect(serie.find(p => p.d === '2026-08-20')?.v).toBe(17000)
  })

  it('sin cobro de venta, el audit_log fecha el paso a vendido', () => {
    const r = buildCashflowReport({
      ...base,
      movimientos: [],
      vehicles: [{ id: 7, marca: 'VW', modelo: 'Passat', tipo_operacion: 'propio', estado: 'vendido', precio_publicado: 22000, created_at: '2026-04-13', updated_at: '2026-08-25' }],
      auditVehiculos: [{ tabla: 'vehicles', operacion: 'patch', registro_id: 7, fecha: '2026-08-01T14:35:00Z', datos: { estado: 'vendido' } }],
    })
    expect(r.capital.serie.find(p => p.d === '2026-07-31')?.v).toBe(22000)
    expect(r.capital.serie.find(p => p.d === '2026-08-01')?.v).toBe(0)
    expect(r.anomalias.map(a => a.titulo)).toContain('VW Passat: figuró como auto propio sin costo')
  })

  it('un movimiento sin caja sin contrapartida se marca', () => {
    const r = buildCashflowReport({
      ...base,
      movimientos: [
        { id: 1, cuenta: 'cash', tipo: 'ingreso', categoria: 'other', monto: 16500, created_at: '2026-08-01T15:00:00Z', afecta_balance: 0, vehicle_id: 31 },
      ],
      vehicles: [{ id: 31, marca: 'Chevrolet', modelo: 'Cruze', tipo_operacion: 'propio', estado: 'vendido', precio_compra: 16000, created_at: '2026-05-22' }],
    })
    const a = r.anomalias.find(x => x.titulo.startsWith('Movimiento sin caja que no cierra'))
    expect(a?.monto).toBe(-16500)
  })
})

describe('gasto fijo = retiros + Fran + Marshiot + cocheras', () => {
  it('reconoce los conceptos por la nota, sin falsos positivos', () => {
    const c = GASTOS_FIJOS_DEFAULT
    expect(conceptoFijo('Gastos Fran Junio', c)).toBe('Fran')
    expect(conceptoFijo('gastos fran', c)).toBe('Fran')
    expect(conceptoFijo('Sueldo Marshiot', c)).toBe('Marshiot')
    expect(conceptoFijo('Pago cochera - Septiembre', c)).toBe('Cocheras')
    expect(conceptoFijo('Cocheras mensual', c)).toBe('Cocheras')
    expect(conceptoFijo('Transferencia a Maxi', c)).toBeNull()
    expect(conceptoFijo('Uber', c)).toBeNull()
  })

  it('config_negocio puede redefinirlos', () => {
    expect(parseGastosFijos('')).toBe(GASTOS_FIJOS_DEFAULT)
    expect(parseGastosFijos('Fran, Alquiler:alquiler|galpon')).toEqual([
      { label: 'Fran', palabras: ['fran'] },
      { label: 'Alquiler', palabras: ['alquiler', 'galpon'] },
    ])
  })

  it('separa el gasto fijo del resto y lo promedia con los retiros', () => {
    const mov = (id: number, dia: string, categoria: string, monto: number, nota: string) =>
      ({ id, cuenta: 'cash', tipo: 'egreso', categoria, monto, nota, created_at: `${dia}T15:00:00Z`, afecta_balance: 1 })
    const r = buildCashflowReport({
      movimientos: [
        { id: 1, cuenta: 'cash', tipo: 'ingreso', categoria: 'apertura', monto: 20000, created_at: '1999-12-31T12:00:00Z', afecta_balance: 1 },
        mov(2, '2026-07-05', 'general_expense', 1500, 'Gastos Fran Julio'),
        mov(3, '2026-07-10', 'general_expense', 700, 'Cocheras mensual'),
        mov(4, '2026-07-11', 'general_expense', 150, 'Sueldo Marshiot'),
        mov(5, '2026-07-12', 'general_expense', 745, 'Viaje a Tucumán'),
        mov(6, '2026-07-20', 'personal_withdrawal', 1000, 'Retiro Rena'),
      ],
      vehicles: [], prestamos: [], clientes: [], hoy: '2026-08-05',
    })
    const g = r.gastos['2026-07']
    expect(g.fijos).toBe(2350)
    expect(g.fijoDetalle).toEqual({ Fran: 1500, Marshiot: 150, Cocheras: 700 })
    expect(g.gastos_generales).toBe(745)
    expect(r.gastoFijoItems['2026-07'].map(x => x.concepto)).toEqual(['Fran', 'Cocheras', 'Marshiot'])
    expect(r.equilibrio.mesesBase).toEqual(['2026-07'])
    expect(r.equilibrio.gastoFijoProm).toBe(3350)        // 1000 retiros + 2350
    expect(r.equilibrio.otrosGastosProm).toBe(745)
    expect(r.equilibrio.gastoTotalProm).toBe(4095)
  })
})
