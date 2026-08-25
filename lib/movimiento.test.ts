/**
 * Reglas del alta de movimientos desde el dashboard. Espejo de
 * _validate_movimiento del backend (rena-autos-api tools/kapso_tools.py): si
 * los dos lados no validan igual, el bot rechaza lo que el dashboard escribe.
 */
import { describe, expect, it } from 'vitest'
import {
  validarMovimiento, CATEGORIAS_MOVIMIENTO, CATEGORIAS_ELEGIBLES, CATEGORIAS_INTERNAS,
} from './movimiento'

const CUENTAS = ['cash', 'nexo', 'fiwind']
const HOY = '2026-08-25'
const AHORA = '2026-08-25T18:30:00.000Z'

const base = {
  tipo: 'egreso', cuenta: 'cash', monto: 1500, categoria: 'general_expense',
}
const val = (body: any) => validarMovimiento(body, CUENTAS, HOY, AHORA)
const filaDe = (body: any) => {
  const r = val(body)
  if (!r.ok) throw new Error(`esperaba ok, salió: ${r.error}`)
  return r.row
}
const errorDe = (body: any) => {
  const r = val(body)
  if (r.ok) throw new Error('esperaba error, salió ok')
  return r.error
}

describe('validarMovimiento · forma de la fila', () => {
  it('escribe la MISMA fila que el bot: afecta_balance=1 y sin saldo_post', () => {
    const row = filaDe({ ...base, descripcion: '  Nafta  ' })
    expect(row.afecta_balance).toBe(1)
    expect('saldo_post' in row).toBe(false)
    expect(row).toMatchObject({
      cuenta: 'cash', tipo: 'egreso', categoria: 'general_expense', monto: 1500, nota: 'Nafta',
    })
  })
  it('sin fecha usa el instante actual (el movimiento nuevo queda primero)', () => {
    expect(filaDe(base).created_at).toBe(AHORA)
    expect(filaDe({ ...base, fecha: HOY }).created_at).toBe(AHORA)
  })
  it('una fecha pasada se ancla al mediodía AR, nunca al día de al lado', () => {
    expect(filaDe({ ...base, fecha: '2026-08-01' }).created_at).toBe('2026-08-01T12:00:00-03:00')
  })
  it('los vínculos vacíos no se mandan; los numéricos se coercen a entero', () => {
    const row = filaDe({ ...base, vehicle_id: '', cliente_id: null, prestamo_id: undefined })
    expect('vehicle_id' in row).toBe(false)
    expect('cliente_id' in row).toBe(false)
    expect('prestamo_id' in row).toBe(false)
    expect(filaDe({ ...base, categoria: 'vehicle_expense', vehicle_id: '7' }).vehicle_id).toBe(7)
  })
  it('el monto se redondea a dos decimales y acepta string', () => {
    expect(filaDe({ ...base, monto: '10.005' }).monto).toBe(10.01)
  })
  it('descripcion o nota, lo que venga', () => {
    expect(filaDe({ ...base, nota: 'de nota' }).nota).toBe('de nota')
    expect('nota' in filaDe({ ...base, descripcion: '   ' })).toBe(false)
  })
})

describe('validarMovimiento · rechazos', () => {
  it('tipo', () => {
    expect(errorDe({ ...base, tipo: 'transferencia' })).toMatch(/`tipo`/)
    expect(errorDe({ ...base, tipo: undefined })).toMatch(/`tipo`/)
  })
  it('cuenta fuera del perfil', () => {
    expect(errorDe({ ...base, cuenta: 'mp' })).toMatch(/`cuenta` inválida/)
    expect(errorDe({ ...base, cuenta: 'CASH' })).toMatch(/`cuenta` inválida/)
  })
  it('cuenta del perfil dinámico: lo que vale depende de la tabla', () => {
    expect(validarMovimiento({ ...base, cuenta: 'mp' }, ['mp', 'caja_chica'], HOY, AHORA).ok).toBe(true)
    expect(validarMovimiento({ ...base, cuenta: 'cash' }, ['mp', 'caja_chica'], HOY, AHORA).ok).toBe(false)
  })
  it('monto', () => {
    expect(errorDe({ ...base, monto: 0 })).toMatch(/mayor que 0/)
    expect(errorDe({ ...base, monto: -5 })).toMatch(/mayor que 0/)
    expect(errorDe({ ...base, monto: 'mil' })).toMatch(/numérico/)
    expect(errorDe({ ...base, monto: undefined })).toMatch(/numérico/)
  })
  it('categoria fuera del enum del backend (sin_categoria NO es un valor real)', () => {
    expect(errorDe({ ...base, categoria: 'sin_categoria' })).toMatch(/`categoria` inválida/)
    expect(errorDe({ ...base, categoria: 'inventada' })).toMatch(/`categoria` inválida/)
    expect(errorDe({ ...base, categoria: undefined })).toMatch(/`categoria` inválida/)
  })
  it('fecha con formato raro', () => {
    expect(errorDe({ ...base, fecha: '25/08/2026' })).toMatch(/`fecha` inválida/)
  })
  it('body que no es objeto', () => {
    expect(errorDe(null)).toMatch(/Body inválido/)
    expect(errorDe('hola')).toMatch(/Body inválido/)
  })
})

describe('validarMovimiento · vínculos obligatorios (guards del backend)', () => {
  it('categoría de auto sin auto', () => {
    expect(errorDe({ ...base, categoria: 'vehicle_expense' })).toMatch(/requiere un vehículo/)
    expect(errorDe({ ...base, categoria: 'vehicle_purchase', vehicle_id: 0 })).toMatch(/requiere un vehículo/)
    expect(val({ ...base, categoria: 'vehicle_expense', vehicle_id: 7 }).ok).toBe(true)
  })
  it('categoría de préstamo: exige préstamo y dirección fija', () => {
    expect(errorDe({ ...base, categoria: 'loan_interest' })).toMatch(/requiere un préstamo/)
    expect(errorDe({ ...base, categoria: 'loan_interest', prestamo_id: 3, tipo: 'ingreso' }))
      .toMatch(/debe ser un egreso/)
    expect(errorDe({ ...base, categoria: 'loan_disbursement', prestamo_id: 3, tipo: 'egreso' }))
      .toMatch(/debe ser un ingreso/)
    expect(val({ ...base, categoria: 'loan_repayment', prestamo_id: 3, tipo: 'egreso' }).ok).toBe(true)
    expect(val({ ...base, categoria: 'loan_disbursement', prestamo_id: 3, tipo: 'ingreso' }).ok).toBe(true)
  })
  it('cuenta corriente de clientes', () => {
    expect(errorDe({ ...base, categoria: 'client_repayment', tipo: 'ingreso' })).toMatch(/requiere un cliente/)
    expect(val({ ...base, categoria: 'client_repayment', tipo: 'ingreso', cliente_id: 4 }).ok).toBe(true)
    // client_expense además exige el auto: el gasto adelantado se liquida contra él.
    expect(errorDe({ ...base, categoria: 'client_expense', cliente_id: 4 })).toMatch(/requiere también el auto/)
    expect(val({ ...base, categoria: 'client_expense', cliente_id: 4, vehicle_id: 9 }).ok).toBe(true)
  })
})

describe('catálogo de categorías', () => {
  it('las internas son válidas para la route pero no se ofrecen en el diálogo', () => {
    for (const c of Array.from(CATEGORIAS_INTERNAS)) {
      expect((CATEGORIAS_MOVIMIENTO as readonly string[])).toContain(c)
      expect(CATEGORIAS_ELEGIBLES).not.toContain(c)
    }
    expect(val({ ...base, categoria: 'ajuste' }).ok).toBe(true)
  })
  it('es el set del backend, sin agregados ni faltantes', () => {
    // Espejo literal de CATEGORIAS_MOVIMIENTO (kapso_tools.py, 19 valores).
    expect([...CATEGORIAS_MOVIMIENTO].sort()).toEqual([
      'ajuste', 'apertura', 'client_expense', 'client_repayment', 'commission',
      'down_payment', 'general_expense', 'investments', 'loan', 'loan_disbursement',
      'loan_interest', 'loan_repayment', 'marketing', 'other', 'personal_withdrawal',
      'refund', 'vehicle_expense', 'vehicle_purchase', 'venta',
    ])
  })
})
