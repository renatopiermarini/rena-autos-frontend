/**
 * Ajuste de saldo de una cuenta DESDE /config/cuentas.
 *
 * Módulo PURO. El saldo del dashboard es DERIVADO del ledger (ver
 * project_balance_model_deferred: no hay columna de saldo que se pueda pisar),
 * así que "poner el saldo real" NO es escribir un número: es asentar la
 * DIFERENCIA como un movimiento más, categoría 'ajuste'. El saldo derivado pasa
 * a valer lo que dijo el usuario porque el ledger ahora suma eso.
 *
 * Es el mismo camino que usa el bot (update_balance → categoría 'ajuste') y la
 * misma forma que ya tiene el ledger: sin esto, un "cuadre" desde la pantalla
 * sería una fila invisible para el saldo o un balance fantasma.
 *
 * Nota sobre la categoría: 'ajuste' está en CATEGORIAS_MOVIMIENTO
 * (lib/movimiento.ts), así que validarMovimiento —y por lo tanto
 * /api/finanzas/movimiento— la acepta tal cual. Está en CATEGORIAS_INTERNAS,
 * que es OTRA cosa: esa lista sólo saca la categoría del <select> del diálogo de
 * Finanzas (no es algo que se elija a mano al cargar un gasto). No hubo que
 * habilitar nada en la route.
 */
import { round2 } from './kapso'

/** Menos de medio centavo de diferencia es cero: la caja ya está cuadrada. */
export const EPSILON_AJUSTE = 0.005

export type AjustePlan = {
  ok: true
  /** null = la diferencia es 0: no se escribe nada. */
  movimiento: Record<string, any> | null
  diferencia: number
  saldo_real: number
  saldo_derivado: number
}
export type AjusteError = { ok: false; error: string }
export type AjusteResult = AjustePlan | AjusteError

const err = (error: string): AjusteError => ({ ok: false, error })

/**
 * Arma el movimiento de ajuste para dejar la cuenta `clave` en `saldoRealRaw`.
 *
 * Signo: si el saldo real es MAYOR que el derivado falta plata en el ledger →
 * INGRESO; si es menor, sobra → EGRESO. El monto es siempre |diferencia| porque
 * validarMovimiento exige monto > 0 (la dirección la lleva `tipo`).
 *
 * Un saldo real negativo es válido (una cuenta puede estar en rojo); lo que no
 * se acepta es un texto que no sea número.
 */
export function planAjuste(
  clave: string,
  saldoDerivado: number,
  saldoRealRaw: string,
): AjusteResult {
  const cuenta = (clave ?? '').trim()
  if (!cuenta) return err('Falta la cuenta a ajustar.')
  if (!Number.isFinite(saldoDerivado)) return err('El saldo derivado no es un número.')

  const t = (saldoRealRaw ?? '').trim()
  if (t === '') return err('Escribí el saldo real de la cuenta.')
  const real = Number(t)
  if (!Number.isFinite(real)) return err('El saldo real tiene que ser un número.')

  const derivado = round2(saldoDerivado)
  const saldo_real = round2(real)
  const diferencia = round2(saldo_real - derivado)

  if (Math.abs(diferencia) < EPSILON_AJUSTE) {
    return { ok: true, movimiento: null, diferencia: 0, saldo_real, saldo_derivado: derivado }
  }

  const movimiento = {
    tipo: diferencia > 0 ? 'ingreso' : 'egreso',
    categoria: 'ajuste',
    cuenta,
    monto: round2(Math.abs(diferencia)),
    descripcion: `Ajuste de saldo desde configuración: saldo real ${saldo_real} (derivado era ${derivado})`,
  }
  return { ok: true, movimiento, diferencia, saldo_real, saldo_derivado: derivado }
}
