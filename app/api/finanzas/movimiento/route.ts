import { NextRequest, NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { validarMovimiento } from '@/lib/movimiento'
import { DEFAULT_CUENTAS, cuentaKeys, arDay } from '@/lib/kapso'
import { dbGet, dbPost, dbPatch, dbDelete, DbError } from '@/lib/db'

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
    bustFinanzas()
    return NextResponse.json({ data: row }, { status: 200 })
  } catch (e) {
    return errorResponse(e)
  }
}

// Las páginas que renderizan el ledger — el mismo scope que usa el proxy /api/db.
function bustFinanzas() {
  for (const r of ['/', '/finanzas', '/stock', '/config/cuentas', '/config/inversores']) {
    revalidatePath(r)
  }
}

function errorResponse(e: unknown) {
  if (e instanceof DbError) return NextResponse.json(e.body ?? {}, { status: e.status })
  const message = e instanceof Error ? e.message : String(e)
  return NextResponse.json({ error: 'db_error', message }, { status: 500 })
}

function idFrom(request: NextRequest): number | null {
  const raw = request.nextUrl.searchParams.get('id')
  const n = Number(raw)
  return Number.isInteger(n) && n > 0 ? n : null
}

async function movimientoPorId(id: number): Promise<any | null> {
  const rows = await dbGet(TABLE, { id })
  // Kapso puede ignorar filtros que no conoce: se re-chequea del lado nuestro.
  return rows.find((r: any) => Number(r?.id) === id) ?? null
}

/**
 * Edición de un movimiento. Editables: monto, cuenta, tipo y nota — la
 * categoría y los vínculos (auto/cliente/préstamo) NO, porque cambiarlos
 * re-dispara los guards de vínculos obligatorios y es más honesto eliminar y
 * volver a cargar que editar a medias.
 *
 * Se valida la fila FUSIONADA con validarMovimiento (los mismos guards que el
 * alta y el bot: cuenta válida, monto > 0, dirección de las categorías de
 * préstamo), pero al aplicar se preservan created_at y afecta_balance
 * originales: la fecha del movimiento es un dato, y hay asientos off-balance
 * (afecta_balance=0) que un re-validado ciego dejaría contando para el saldo.
 */
export async function PATCH(request: NextRequest) {
  const id = idFrom(request)
  if (id === null) return NextResponse.json({ error: 'id_invalido', message: 'Falta ?id= numérico.' }, { status: 400 })

  let body: any
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'json_invalido', message: 'Body inválido: no es JSON.' }, { status: 400 })
  }

  try {
    const original = await movimientoPorId(id)
    if (!original) {
      return NextResponse.json({ error: 'no_encontrado', message: `No existe el movimiento #${id}.` }, { status: 404 })
    }

    const merged = {
      tipo: body.tipo ?? original.tipo,
      cuenta: body.cuenta ?? original.cuenta,
      monto: body.monto ?? original.monto,
      categoria: original.categoria,
      vehicle_id: original.vehicle_id,
      cliente_id: original.cliente_id,
      prestamo_id: original.prestamo_id,
      nota: body.nota !== undefined ? body.nota : original.nota,
    }
    const cuentas = await cuentasValidas()
    const ahoraIso = new Date().toISOString()
    const validado = validarMovimiento(merged, cuentas, arDay(ahoraIso), ahoraIso)
    if (!validado.ok) {
      return NextResponse.json({ error: 'valor_invalido', message: validado.error }, { status: 400 })
    }

    const patch: Record<string, any> = {
      tipo: validado.row.tipo,
      cuenta: validado.row.cuenta,
      monto: validado.row.monto,
      nota: validado.row.nota ?? null,
    }
    const row = await dbPatch(TABLE, id, patch)
    bustFinanzas()
    return NextResponse.json({ data: row }, { status: 200 })
  } catch (e) {
    return errorResponse(e)
  }
}

/** Borrado directo. Nada referencia a un movimiento, así que no hay guard de
 *  huérfanos; el 404 amable evita el "borré dos veces" silencioso. */
export async function DELETE(request: NextRequest) {
  const id = idFrom(request)
  if (id === null) return NextResponse.json({ error: 'id_invalido', message: 'Falta ?id= numérico.' }, { status: 400 })

  try {
    const original = await movimientoPorId(id)
    if (!original) {
      return NextResponse.json({ error: 'no_encontrado', message: `No existe el movimiento #${id} (¿ya se borró?).` }, { status: 404 })
    }
    const res = await dbDelete(TABLE, id)
    bustFinanzas()
    return NextResponse.json({ data: res }, { status: 200 })
  } catch (e) {
    return errorResponse(e)
  }
}
