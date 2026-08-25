/**
 * Validación de un alta de movimiento contable hecha DESDE EL DASHBOARD.
 *
 * Módulo PURO (sin Next, sin env, sin fetch): lo usa la route
 * /api/finanzas/movimiento para validar antes de escribir, el diálogo de
 * Finanzas para saber qué campos pedir, y los tests para fijar las reglas.
 *
 * ESPEJO del backend — rena-autos-api tools/kapso_tools.py:
 *   CATEGORIAS_MOVIMIENTO, _VEHICLE_LINKED_CATEGORIAS, _LOAN_LINKED_CATEGORIAS,
 *   _LOAN_CATEGORIA_TIPO, _CLIENT_EXPENSE_CATEGORIA / _CLIENT_REPAYMENT_CATEGORIA
 *   y _validate_movimiento.
 * Si allá se agrega una categoría o cambia una regla, se cambia acá también:
 * son las dos puertas de escritura al MISMO ledger.
 */
import { fromARInputValue } from './date'

// Espejo exacto de CATEGORIAS_MOVIMIENTO (kapso_tools.py). Ojo: el CAT_LABEL de
// FinanzasClient tiene además 'sin_categoria', que NO es un valor válido de la
// columna — es el placeholder de display para filas viejas sin categoría.
export const CATEGORIAS_MOVIMIENTO = [
  'commission', 'vehicle_purchase', 'vehicle_expense', 'general_expense',
  'marketing', 'loan', 'refund', 'down_payment', 'personal_withdrawal',
  'investments', 'ajuste', 'other', 'apertura', 'venta',
  'loan_disbursement', 'loan_interest', 'loan_repayment',
  'client_expense', 'client_repayment',
] as const

export type CategoriaMovimiento = typeof CATEGORIAS_MOVIMIENTO[number]

/** Categorías que EXIGEN un auto: son las que alimentan el costo por vehículo. */
export const CAT_VEHICLE_LINKED = new Set<string>(['vehicle_expense', 'vehicle_purchase'])

/** Categorías de préstamo: exigen prestamo_id y tienen dirección fija. */
export const CAT_LOAN_TIPO: Record<string, 'ingreso' | 'egreso'> = {
  loan_disbursement: 'ingreso',
  loan_interest: 'egreso',
  loan_repayment: 'egreso',
}

/** Cuenta corriente de clientes: exigen cliente_id (client_expense además auto). */
export const CAT_CLIENTE_LINKED = new Set<string>(['client_expense', 'client_repayment'])

/**
 * Internas del sistema: las escribe el bot solo (ajuste sale de update_balance,
 * apertura de la migración, loan es legacy). Siguen siendo valores VÁLIDOS de la
 * columna —por eso la route las acepta— pero el diálogo no las ofrece.
 */
export const CATEGORIAS_INTERNAS = new Set<string>(['ajuste', 'apertura', 'loan'])

export const CATEGORIAS_ELEGIBLES = CATEGORIAS_MOVIMIENTO.filter(c => !CATEGORIAS_INTERNAS.has(c))

const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/

export type MovimientoOk = { ok: true; row: Record<string, any> }
export type MovimientoError = { ok: false; error: string }
export type MovimientoResult = MovimientoOk | MovimientoError

function idPositivo(raw: any): number | null {
  if (raw === null || raw === undefined || raw === '') return null
  const n = Number(raw)
  return Number.isInteger(n) && n > 0 ? n : null
}

function texto(raw: any): string | null {
  if (typeof raw !== 'string') return null
  const t = raw.trim()
  return t === '' ? null : t
}

/**
 * Valida el body de un alta y devuelve la FILA lista para POSTear a
 * movimientos_contabilidad, con la misma forma que escribe el bot.
 *
 * @param cuentas  claves válidas de cuenta (tabla `cuentas`, o DEFAULT_CUENTAS)
 * @param hoyAr    día de hoy en Argentina, "YYYY-MM-DD"
 * @param ahoraIso instante actual ISO (lo que el bot guarda en created_at)
 *
 * NO chequea que vehicle_id / cliente_id / prestamo_id existan de verdad: los
 * selects del diálogo sólo ofrecen filas reales, y una lectura extra por alta no
 * paga. El bot sí lo chequea porque ahí los ids los inventa un LLM.
 */
export function validarMovimiento(
  body: any,
  cuentas: string[],
  hoyAr: string,
  ahoraIso: string,
): MovimientoResult {
  const err = (error: string): MovimientoError => ({ ok: false, error })
  if (!body || typeof body !== 'object') return err('Body inválido: se esperaba un objeto JSON.')

  const tipo = body.tipo
  if (tipo !== 'ingreso' && tipo !== 'egreso') {
    return err("`tipo` debe ser 'ingreso' o 'egreso'.")
  }

  const cuenta = body.cuenta
  if (typeof cuenta !== 'string' || !cuentas.includes(cuenta)) {
    return err(`\`cuenta\` inválida: ${JSON.stringify(cuenta ?? null)}. Cuentas válidas: ${cuentas.join(', ')}.`)
  }

  const monto = Number(body.monto)
  if (!Number.isFinite(monto)) return err('`monto` debe ser numérico.')
  if (monto <= 0) return err('`monto` debe ser mayor que 0.')

  const categoria = body.categoria
  if (typeof categoria !== 'string' || !(CATEGORIAS_MOVIMIENTO as readonly string[]).includes(categoria)) {
    return err(`\`categoria\` inválida: ${JSON.stringify(categoria ?? null)}. Categorías válidas: ${[...CATEGORIAS_MOVIMIENTO].sort().join(', ')}.`)
  }

  const vehicle_id = idPositivo(body.vehicle_id)
  const cliente_id = idPositivo(body.cliente_id)
  const prestamo_id = idPositivo(body.prestamo_id)

  // Guard 1b del backend: una categoría de auto SIEMPRE lleva su auto, o el P&L
  // por vehículo queda mintiendo.
  if (CAT_VEHICLE_LINKED.has(categoria) && vehicle_id === null) {
    return err(`La categoría '${categoria}' requiere un vehículo.`)
  }
  // Guard 1c: préstamo real + dirección fija por significado.
  if (categoria in CAT_LOAN_TIPO) {
    if (prestamo_id === null) return err(`La categoría '${categoria}' requiere un préstamo.`)
    const esperado = CAT_LOAN_TIPO[categoria]
    if (tipo !== esperado) {
      return err(
        `La categoría '${categoria}' debe ser un ${esperado} ` +
        `(${esperado === 'ingreso' ? 'la plata entra' : 'la plata sale'}), no un ${tipo}.`,
      )
    }
  }
  // Guard 1d: cuenta corriente de clientes.
  if (CAT_CLIENTE_LINKED.has(categoria) && cliente_id === null) {
    return err(`La categoría '${categoria}' requiere un cliente.`)
  }
  if (categoria === 'client_expense' && vehicle_id === null) {
    return err("La categoría 'client_expense' requiere también el auto del cliente (el gasto adelantado se asocia al auto para la liquidación).")
  }

  const fecha = body.fecha === null || body.fecha === undefined || body.fecha === '' ? null : String(body.fecha)
  if (fecha !== null && !FECHA_RE.test(fecha)) {
    return err(`\`fecha\` inválida: ${JSON.stringify(fecha)}. Se espera YYYY-MM-DD.`)
  }
  // Hoy (o sin fecha) guarda el instante real, como el bot: así el movimiento
  // nuevo queda primero en la lista, que ordena por created_at. Una fecha
  // pasada/futura se ancla al mediodía AR — nunca cae en el día de al lado.
  const created_at = fecha === null || fecha === hoyAr
    ? ahoraIso
    : fromARInputValue(`${fecha}T12:00`)

  const nota = texto(body.descripcion) ?? texto(body.nota)

  const row: Record<string, any> = {
    cuenta,
    tipo,
    categoria,
    monto: Math.round(monto * 100) / 100,
    created_at,
    // CRÍTICO (espejo de _commit_movimiento): sin afecta_balance=1 la fila queda
    // invisible para el saldo. saldo_post NO se manda: el saldo se deriva del
    // ledger, es un cache de display que calcula el backend.
    afecta_balance: 1,
  }
  if (nota) row.nota = nota
  if (vehicle_id !== null) row.vehicle_id = vehicle_id
  if (cliente_id !== null) row.cliente_id = cliente_id
  if (prestamo_id !== null) row.prestamo_id = prestamo_id
  return { ok: true, row }
}
