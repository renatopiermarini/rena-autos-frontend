import { describe, it, expect } from 'vitest'
import { planAjuste } from './ajuste'
import { saldoDeCuenta, computePatrimonio } from './kapso'

/** Estrecha a ok:true (o falla el test). */
function plan(r: ReturnType<typeof planAjuste>) {
  if (!r.ok) throw new Error(`esperaba ok, salió: ${r.error}`)
  return r
}

describe('planAjuste — signo', () => {
  it('falta plata en el ledger (real > derivado) → INGRESO', () => {
    const r = plan(planAjuste('cash', 1000, '1200'))
    expect(r.movimiento).toEqual({
      tipo: 'ingreso',
      categoria: 'ajuste',
      cuenta: 'cash',
      monto: 200,
      descripcion: 'Ajuste de saldo desde configuración: saldo real 1200 (derivado era 1000)',
    })
    expect(r.diferencia).toBe(200)
  })

  it('sobra plata en el ledger (real < derivado) → EGRESO por el valor ABSOLUTO', () => {
    const r = plan(planAjuste('nexo', 1000, '750.25'))
    expect(r.movimiento).toMatchObject({ tipo: 'egreso', categoria: 'ajuste', cuenta: 'nexo', monto: 249.75 })
    expect(r.diferencia).toBe(-249.75)
  })

  it('un saldo real negativo es válido (cuenta en rojo)', () => {
    const r = plan(planAjuste('cash', 100, '-50'))
    expect(r.movimiento).toMatchObject({ tipo: 'egreso', monto: 150 })
  })
})

describe('planAjuste — diferencia cero', () => {
  it('no escribe nada cuando ya está cuadrada', () => {
    const r = plan(planAjuste('cash', 1000, '1000'))
    expect(r.movimiento).toBeNull()
    expect(r.diferencia).toBe(0)
  })

  it('menos de medio centavo también es cero', () => {
    expect(plan(planAjuste('cash', 1000, '1000.001')).movimiento).toBeNull()
  })

  it('un centavo NO es cero', () => {
    expect(plan(planAjuste('cash', 1000, '1000.01')).movimiento).toMatchObject({ monto: 0.01 })
  })
})

describe('planAjuste — validación', () => {
  it('exige cuenta y un saldo real numérico', () => {
    expect(planAjuste('', 1000, '1200')).toMatchObject({ ok: false })
    expect(planAjuste('cash', 1000, '')).toMatchObject({ ok: false })
    expect(planAjuste('cash', 1000, 'mil doscientos')).toMatchObject({ ok: false })
  })
})

describe('saldoDeCuenta', () => {
  const movs = [
    { cuenta: 'cash', tipo: 'ingreso', monto: 1000, afecta_balance: 1 },
    { cuenta: 'cash', tipo: 'egreso', monto: 250.5, afecta_balance: 1 },
    { cuenta: 'nexo', tipo: 'ingreso', monto: 500, afecta_balance: 1 },
    // No afecta el balance: no puede mover el saldo derivado.
    { cuenta: 'cash', tipo: 'ingreso', monto: 9999, afecta_balance: 0 },
  ]

  it('suma ingresos − egresos de esa cuenta y sólo de esa', () => {
    expect(saldoDeCuenta(movs, 'cash')).toBe(749.5)
    expect(saldoDeCuenta(movs, 'nexo')).toBe(500)
    expect(saldoDeCuenta(movs, 'fiwind')).toBe(0)
  })

  it('es la MISMA caja que muestra computePatrimonio (una sola matemática)', () => {
    const p = computePatrimonio(movs, [], [], [], undefined, ['cash', 'nexo', 'fiwind'])
    expect(p.cajas.cash).toBe(saldoDeCuenta(movs, 'cash'))
    expect(p.cajas.nexo).toBe(saldoDeCuenta(movs, 'nexo'))
    expect(p.cajas.fiwind).toBe(saldoDeCuenta(movs, 'fiwind'))
  })

  it('el ajuste deja el saldo derivado EXACTAMENTE en el saldo real', () => {
    const derivado = saldoDeCuenta(movs, 'cash')      // 749.5
    const r = plan(planAjuste('cash', derivado, '800'))
    const conAjuste = [...movs, { ...r.movimiento, afecta_balance: 1 }]
    expect(saldoDeCuenta(conAjuste, 'cash')).toBe(800)
  })
})
