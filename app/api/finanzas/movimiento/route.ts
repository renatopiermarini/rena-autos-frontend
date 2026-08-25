import { NextRequest, NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { validarMovimiento } from '@/lib/movimiento'
import { DEFAULT_CUENTAS, cuentaKeys, arDay } from '@/lib/kapso'
import { dbGet, dbPost, DbError } from '@/lib/db'

/**
 * Alta de movimiento contable desde el dashboard.
 *
 * Va aparte de /api/db/[table] a propósito: `movimientos_contabilidad` NO está
 * (ni va a estar) en el ALLOWED del proxy genérico, porque una escritura de
 * plata necesita reglas propias — categorías, vínculos obligatorios y, sobre
 * todo, afecta_balance=1. Un POST crudo al proxy dejaría la fila invisible para
 * el saldo (el bug de siempre: escribir con _post en vez de _log_movimiento).
 *
 * Auth: el middleware de sesión cubre TODO menos /login y /api/login, así que
 * esta route vive detrás de la cookie igual que /api/db.
 *
 * Lo que NO hace, y el bot sí:
 *  - no actualiza el cache `balances` (el saldo se DERIVA del ledger en el
 *    dashboard y en el bot; la fila de `balances` la reescribe el backend en su
 *    próxima escritura, con su lock por cuenta. Meter un segundo escritor sin
 *    lock es exactamente cómo aparecen los saldos fantasma);
 *  - no suprime duplicados del mismo día (Guard 2). Acá el alta la tipea una
 *    persona mirando la pantalla, con el botón bloqueado mientras guarda.
 */

// La I/O va por lib/db.ts: Kapso REST o Postgres según DATABASE_URL. Las reglas
// de validación (y el afecta_balance=1) son las mismas para las dos instancias.

const TABLE = 'movimientos_contabilidad'

/** Claves de cuenta válidas. Sin tabla `cuentas` (o si falla), DEFAULT_CUENTAS. */
async function cuentasValidas(): Promise<string[]> {
  try {
    return cuentaKeys(await dbGet('cuentas'))
  } catch {
    return DEFAULT_CUENTAS
  }
}

export async function POST(request: NextRequest) {
  let body: any
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'json_invalido', message: 'Body inválido: no es JSON.' }, { status: 400 })
  }

  const cuentas = await cuentasValidas()
  const ahoraIso = new Date().toISOString()
  const validado = validarMovimiento(body, cuentas, arDay(ahoraIso), ahoraIso)
  if (!validado.ok) {
    return NextResponse.json({ error: 'valor_invalido', message: validado.error }, { status: 400 })
  }

  try {
    const row = await dbPost(TABLE, validado.row)
    revalidatePath('/', 'layout')
    return NextResponse.json({ data: row }, { status: 200 })
  } catch (e) {
    if (e instanceof DbError) return NextResponse.json(e.body ?? {}, { status: e.status })
    const message = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: 'db_error', message }, { status: 500 })
  }
}
