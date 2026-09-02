import { dbGet, DbError } from '@/lib/db'

// Toda la lectura pasa por lib/db.ts, que elige backend por DATABASE_URL. Sin
// esa variable (la instancia de Renato) hace EXACTAMENTE los mismos fetch
// paginados de siempre contra la REST de Kapso, con el mismo `revalidate`.
//
// Trade-off del modo Postgres: `revalidate` NO aplica. El fetch-cache de Next
// cachea respuestas HTTP, y en Postgres no hay ninguna — habría que envolver
// cada lectura en `unstable_cache`, que revalidatePath('/', 'layout') (lo que
// hacen los writes del proxy para refrescar la UI) no invalida. Preferimos leer
// siempre fresco: una instancia nueva paga un round-trip a Railway por render y
// nunca muestra un dato viejo después de guardar. Si algún día molesta la
// latencia, la solución es unstable_cache + revalidateTag en los writes, no
// bajar el revalidate.
async function get(table: string, revalidate: number = 30) {
  try {
    return await dbGet(table, {}, { revalidate })
  } catch (e) {
    // Un error HTTP devuelve lo que se alcanzó a leer, igual que antes (el
    // `return all` del !res.ok). Un fallo de red sigue propagándose: getSafe()
    // lo atrapa para las tablas que pueden no existir todavía.
    if (e instanceof DbError) return e.partial ?? []
    throw e
  }
}

export async function getBalances()        { return get('balances', 60) }
export async function getVehicles()        { return get('vehicles', 15) }
export async function getClientes()        { return get('clientes', 60) }
export async function getInteresados()     { return get('interesados', 15) }
export async function getTareas()          { return get('tareas', 15) }
export async function getPrestamos()       { return get('prestamos', 60) }
export async function getMovimientos()     { return get('movimientos_contabilidad', 60) }
export async function getOfertas()         { return get('ofertas', 15) }
export async function getVisitas()         { return get('visitas', 15) }
export async function getKbEntries()       { return get('kb_entries', 15) }
export async function getVerificaciones()  { return get('verificaciones_mecanicas', 30) }
export async function getTramites()        { return get('tramites', 15) }
export async function getTurnos()          { return get('turnos', 15) }

// ── Tablas de configuración (productización multi-instancia) ──────────────────
//
// config_negocio / cuentas / equipo PUEDEN NO EXISTIR todavía: el DDL lo corre
// el usuario a mano por wrangler. Un 404 de Kapso, una red caída o un JSON raro
// NO pueden tirar la página abajo — cada pantalla cae a los valores hardcodeados
// de siempre y muestra el banner de "tablas sin crear". get() ya devuelve [] con
// respuesta !ok, pero un fetch rechazado SÍ tira, así que va envuelto.
async function getSafe(table: string, revalidate: number): Promise<any[]> {
  try {
    return await get(table, revalidate)
  } catch (e) {
    console.warn(`[kapso] no se pudo leer ${table} (¿tabla sin crear?):`, e)
    return []
  }
}

// La tabla `cotizaciones` también puede no existir todavía (DDL manual —
// scripts/ddl_cotizaciones.sql en rena-autos-api), así que va por getSafe.
export async function getCotizaciones() { return getSafe('cotizaciones', 15) }

// D1 devuelve los booleanos como 1/0, "1"/"0" o true/false según el driver.
// Boolean('0') es true, así que se coerce siempre. Sin valor = activo (una fila
// vieja sin la columna no debería desaparecer de la UI).
export function flagOn(value: any, fallback = true): boolean {
  if (value === null || value === undefined || value === '') return fallback
  if (typeof value === 'boolean') return value
  const n = Number(value)
  if (Number.isFinite(n)) return n !== 0
  return String(value).toLowerCase() === 'true'
}

/** Filas de config_negocio → { clave: valor }. Última fila gana ante duplicados. */
export function parseConfigNegocio(rows: any[]): Record<string, string> {
  const out: Record<string, string> = {}
  if (!Array.isArray(rows)) return out
  for (const r of rows) {
    const clave = r?.clave
    if (typeof clave !== 'string' || clave === '') continue
    out[clave] = r.valor == null ? '' : String(r.valor)
  }
  return out
}

/** Filas activas ordenadas por `orden` (y por id ante empate/ausencia). */
export function activasOrdenadas(rows: any[], activeField: string): any[] {
  if (!Array.isArray(rows)) return []
  return rows
    .filter(r => flagOn(r?.[activeField]))
    .sort((a, b) => {
      const oa = Number(a?.orden ?? 0), ob = Number(b?.orden ?? 0)
      const na = Number.isFinite(oa) ? oa : 0, nb = Number.isFinite(ob) ? ob : 0
      if (na !== nb) return na - nb
      return (coerceId(a?.id) ?? 0) - (coerceId(b?.id) ?? 0)
    })
}

// Filas crudas (con id, activas e inactivas) — las pantallas de configuración
// necesitan el id para el PATCH y las inactivas para poder reactivarlas.
export async function getConfigNegocioRows() { return getSafe('config_negocio', 60) }
export async function getCuentasRows()       { return getSafe('cuentas', 60) }
export async function getEquipoRows()        { return getSafe('equipo', 60) }

/** Config del negocio como record. `{}` si la tabla no existe todavía. */
export async function getConfigNegocio(): Promise<Record<string, string>> {
  return parseConfigNegocio(await getConfigNegocioRows())
}

/** Cuentas activas, en orden. `[]` si la tabla no existe todavía. */
export async function getCuentas(): Promise<any[]> {
  return activasOrdenadas(await getCuentasRows(), 'activa')
}

// ── Cuentas (las cajas de la contabilidad) ────────────────────────────────────
//
// Las cajas dejaron de ser tres literales: salen de la tabla `cuentas`. Sin
// tabla —o con la tabla vacía— se cae a estas tres, que son EXACTAMENTE
// BUSINESS.accounts del backend (customer_profile.py), así el dashboard de
// Renato muestra y suma lo mismo de siempre.
export const DEFAULT_CUENTAS: string[] = ['cash', 'nexo', 'fiwind']

/**
 * Claves de cuenta activas, en orden. Acepta tanto las filas crudas de la tabla
 * (getCuentasRows) como las ya filtradas (getCuentas): activasOrdenadas es
 * idempotente. Lista vacía ⇒ DEFAULT_CUENTAS.
 */
export function cuentaKeys(cuentasRows: any[]): string[] {
  const claves = activasOrdenadas(cuentasRows, 'activa')
    .map(c => (typeof c?.clave === 'string' ? c.clave.trim() : ''))
    .filter(Boolean)
  const unicas = Array.from(new Set(claves))
  return unicas.length > 0 ? unicas : DEFAULT_CUENTAS
}

export type CuentaInfo = { clave: string; label: string }

/**
 * Cuentas para mostrar: clave (la que viaja a movimientos_contabilidad.cuenta)
 * + label. Sin tabla el label ES la clave en minúscula, que es el texto literal
 * que el dashboard ya mostraba ("cash · nexo · fiwind"). Donde la UI capitaliza
 * (los `<option>` del filtro) lo hace en el render con capFirst, no acá.
 */
export function cuentasInfo(cuentasRows: any[]): CuentaInfo[] {
  const activas = activasOrdenadas(cuentasRows, 'activa')
  const porClave = new Map<string, CuentaInfo>()
  for (const c of activas) {
    const clave = typeof c?.clave === 'string' ? c.clave.trim() : ''
    if (!clave || porClave.has(clave)) continue
    const label = typeof c?.label === 'string' && c.label.trim() ? c.label.trim() : clave
    porClave.set(clave, { clave, label })
  }
  if (porClave.size === 0) return DEFAULT_CUENTAS.map(clave => ({ clave, label: clave }))
  return Array.from(porClave.values())
}

/** "cash" → "Cash"; "Caja Chica" queda igual. Para los labels de los selects. */
export function capFirst(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s
}

/** Umbral de la alerta "caja baja". Sin config_negocio, los 500 de siempre. */
export const UMBRAL_ALERTA_CAJA_DEFAULT = 500

export function umbralAlertaCaja(cfg: Record<string, string> | undefined): number {
  const raw = Number(cfg?.umbral_alerta_caja)
  return Number.isFinite(raw) && raw >= 0 ? raw : UMBRAL_ALERTA_CAJA_DEFAULT
}

/** Equipo activo, en orden. `[]` si la tabla no existe todavía. */
export async function getEquipo(): Promise<any[]> {
  return activasOrdenadas(await getEquipoRows(), 'activo')
}

// ── Client-side mutations (call the /api/db proxy) ────────────────────────────

// The /api/db proxy returns actionable errors (400 "`estado` inválido: …",
// 404 "No existe…", 409 "tiene N visitas vinculadas") — the *Detailed helpers
// surface them so callers can toast the real reason instead of a generic
// "Error al guardar" (or, worse, nothing).
async function proxyError(res: Response): Promise<string> {
  const json = await res.json().catch(() => ({} as any))
  return json.message || json.error || `Error ${res.status}`
}

export async function patchRecord(
  table: string,
  id: number,
  data: object,
  keyName: string = 'id',
): Promise<boolean> {
  return (await patchRecordDetailed(table, id, data, keyName)).ok
}

export async function patchRecordDetailed(
  table: string,
  id: number,
  data: object,
  keyName: string = 'id',
): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch(`/api/db/${table}?${keyName}=${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  if (res.ok) return { ok: true }
  return { ok: false, error: await proxyError(res) }
}

export async function postRecord(table: string, data: object): Promise<{ ok: boolean; data?: any; error?: string }> {
  const res = await fetch(`/api/db/${table}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  const json = await res.json().catch(() => ({}))
  if (res.ok) return { ok: true, data: json }
  return { ok: false, data: json, error: json.message || json.error || `Error ${res.status}` }
}

export async function deleteRecord(
  table: string,
  id: number,
  keyName: string = 'id',
): Promise<boolean> {
  return (await deleteRecordDetailed(table, id, keyName)).ok
}

// Like deleteRecord but surfaces the proxy's rejection message (e.g. the 409
// "tiene N visitas vinculadas" from the orphan-guard) so the UI can show it.
export async function deleteRecordDetailed(
  table: string,
  id: number,
  keyName: string = 'id',
): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch(`/api/db/${table}?${keyName}=${id}`, { method: 'DELETE' })
  if (res.ok) return { ok: true }
  return { ok: false, error: await proxyError(res) }
}

// ── Derived finance helpers (pure) ────────────────────────────────────────────
//
// Every formula here MIRRORS the backend's single definitions in
// rena-autos-api/tools/kapso_tools.py (_ledger_costo, _loan_position,
// _affects_balance) and tools/analisis_tool.py (_patrimonio). If the two repos
// disagree the bot and the dashboard contradict each other in front of the
// same user — change both or neither.

// D1 returns FKs as TEXT ("6") while our ids are numbers; a strict === match
// silently drops every row (the backend's 130i incident: costo 2.368 vs
// 16.722 reales). Coerce both sides, always.
export function coerceId(x: any): number | null {
  if (x === null || x === undefined || x === '') return null
  const n = Number(x)
  return Number.isFinite(n) ? n : null
}

// Does this movimiento count toward the account balance? The explicit
// afecta_balance column (1/0, added 2026-08-10) wins when present; pre-DDL
// rows fall back to the legacy encoding "saldo_post IS NOT NULL". Note D1 may
// return the column as the STRING "0" — Boolean('0') is true, so coerce.
export function affectsBalance(m: any): boolean {
  const flag = m?.afecta_balance
  if (flag !== null && flag !== undefined) {
    const n = Number(flag)
    if (Number.isFinite(n)) return n !== 0
  }
  return m?.saldo_post != null
}

// Calendar day (YYYY-MM-DD) as seen in Argentina (UTC−3, no DST). Movements
// are stored in UTC; slicing the raw string puts anything after 21:00 AR on
// the wrong day. Date-only strings pass through untouched.
export function arDay(value: any): string {
  if (!value) return ''
  const raw = String(value).trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw
  const parsed = new Date(raw.includes('T') || raw.includes(' ') ? raw.replace(' ', 'T') : raw)
  if (isNaN(parsed.getTime())) return raw.slice(0, 10)
  // Naive strings are UTC in this system (datetime.now(timezone.utc)).
  const utcMs = raw.endsWith('Z') || /[+-]\d{2}:?\d{2}$/.test(raw)
    ? parsed.getTime()
    : parsed.getTime() - parsed.getTimezoneOffset() * 60000
  return new Date(utcMs - 3 * 3600000).toISOString().slice(0, 10)
}

export type VehicleFinancials = {
  compra: number
  fuente_compra: 'precio_compra' | 'vehicle_purchase' | 'ninguna'
  advertencia_compra: string | null
  precio_compra: number
  gastos_por_categoria: Record<string, number>
  gastos_total: number
  otros_egresos: number
  gastos_cliente: number
  costo_total: number
  egresos_totales: number
  precio_publicado: number | null
  precio_venta_objetivo: number | null
  margen_esperado: number | null
  prestamos_asociados: any[]
  es_consignacion: boolean
}

// Mirror of the backend's _ledger_costo — the ONE cost definition. Rules:
//  1. compra = vehicles.precio_compra if > 0, else Σ vehicle_purchase egresos —
//     never both (same money written two ways; summing both double-counts it,
//     reading only one loses cars whose purchase lives only in the other).
//  2. gastos = Σ vehicle_expense. compra + gastos = costo_total.
//  3. otros_egresos = every other egreso linked to the car (commission,
//     refund…) — outside costo_total, inside egresos_totales (what P&L nets).
//  4. afecta_balance=false rows DO count: the car cost that money no matter
//     whose pocket paid first.
//  5. client_expense (gasto adelantado POR CUENTA del cliente — repuesto del
//     dueño de una consignación) is NOT our cost: recoverable, reported apart
//     as gastos_cliente, excluded from every total.
export function computeVehicleFinancials(
  vehicleId: number,
  vehicles: any[],
  movimientos: any[],
  prestamos: any[],
): VehicleFinancials {
  const vid = coerceId(vehicleId)
  const v = vehicles.find(x => coerceId(x.id) === vid) ?? {}
  const es_consignacion = v.tipo_operacion === 'consignacion'
  const precio_compra = Number(v.precio_compra ?? 0)
  const precio_publicado = v.precio_publicado != null && v.precio_publicado !== '' ? Number(v.precio_publicado) : null
  const precio_venta_objetivo = v.precio_venta_objetivo != null && v.precio_venta_objetivo !== '' ? Number(v.precio_venta_objetivo) : null

  const gastos_por_categoria: Record<string, number> = {}
  let gastos_total = 0
  let compra_movs = 0
  let otros_egresos = 0
  let gastos_cliente = 0
  for (const m of movimientos) {
    if (coerceId(m.vehicle_id) !== vid) continue
    if (m.tipo !== 'egreso') continue
    const monto = Number(m.monto ?? 0)
    const cat = m.categoria || 'sin_categoria'
    if (cat === 'vehicle_purchase') { compra_movs += monto; continue }
    if (cat === 'client_expense')   { gastos_cliente += monto; continue }
    if (cat === 'vehicle_expense')  { gastos_total += monto }
    else                            { otros_egresos += monto }
    gastos_por_categoria[cat] = (gastos_por_categoria[cat] ?? 0) + monto
  }

  let compra: number
  let fuente_compra: VehicleFinancials['fuente_compra']
  if (precio_compra > 0)      { compra = precio_compra; fuente_compra = 'precio_compra' }
  else if (compra_movs > 0)   { compra = compra_movs;   fuente_compra = 'vehicle_purchase' }
  else                        { compra = 0;             fuente_compra = 'ninguna' }
  const advertencia_compra =
    precio_compra > 0 && compra_movs > 0 && Math.abs(precio_compra - compra_movs) >= 0.01
      ? `La compra está anotada dos veces y no coincide: precio_compra=${precio_compra} vs movimientos vehicle_purchase=${compra_movs}. Se usa precio_compra.`
      : null

  const costo_total = round2(compra + gastos_total)
  const egresos_totales = round2(compra + gastos_total + otros_egresos)
  const margen_esperado = es_consignacion
    ? null
    : precio_publicado != null ? round2(precio_publicado - costo_total) : null
  const prestamos_asociados = prestamos.filter(p => coerceId(p.vehicle_id) === vid)

  return {
    compra: round2(compra),
    fuente_compra,
    advertencia_compra,
    precio_compra,
    gastos_por_categoria,
    gastos_total: round2(gastos_total),
    otros_egresos: round2(otros_egresos),
    gastos_cliente: round2(gastos_cliente),
    costo_total,
    egresos_totales,
    precio_publicado,
    precio_venta_objetivo,
    margen_esperado,
    prestamos_asociados,
    es_consignacion,
  }
}

// Exportado: lib/venta.ts y lib/ajuste.ts redondean la MISMA plata que este
// módulo (la comisión de una consignación, el saldo derivado de una cuenta). Con
// dos round2 distintos el diálogo mostraría un centavo y el ledger guardaría otro.
export function round2(n: number) { return Math.round(n * 100) / 100 }

// Tasa anual as PERCENT (15). The canonical unit is percent; the legacy
// fractional encoding (0.15) is tolerated here and ONLY here — same contract
// as the backend's _tasa_pct.
export function tasaPct(raw: any): number {
  const t = Number(raw ?? 0)
  if (!Number.isFinite(t)) return 0
  return t > 0 && t <= 1 ? t * 100 : t
}

export type LoanPosition = {
  id: number | null
  acreedor_id: number | null
  modalidad: 'mensual' | 'al_final'
  estado: string | null
  tasa_pct: number
  fecha_inicio: string | null
  capital_original: number
  capital_vivo: number
  interes_mensual: number
  interes_devengado: number
  interes_pagado_total: number
  interes_adeudado: number
  deuda_total: number
  interes_mes_pagado: boolean | null
  proximo_vencimiento: string | null
  vencido: boolean
}

function dayDiff(fromIso: string, toIso: string): number {
  const [fy, fm, fd] = fromIso.split('-').map(Number)
  const [ty, tm, td] = toIso.split('-').map(Number)
  return Math.max(0, Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86400000))
}

// Mirror of the backend's _loan_position — a loan's COMPLETE position derived
// from the ledger. Two modalidades:
//   mensual  — fixed cuota capital_vivo × tasa/12 due the 1st of each month,
//              never capitalises. Devengado = elapsed month-firsts since
//              fecha_inicio × cuota.
//   al_final — accrues by real days over the outstanding capital, per-segment
//              between repayments; settled together with the capital.
// Both: capital_vivo = monto_original − Σ loan_repayment (matched by
// prestamo_id); interes_adeudado = devengado − Σ loan_interest (floor 0);
// deuda_total = capital_vivo + interes_adeudado. prestamos.monto_pagado is a
// CACHE — never an input here.
export function computeLoanPosition(
  prestamo: any,
  movimientos: any[],
  hoyIso?: string,
): LoanPosition {
  const pid = coerceId(prestamo.id)
  const capital_original = Number(prestamo.monto_original ?? 0)
  const tasa = tasaPct(prestamo.tasa_interes_anual)
  const modalidad: LoanPosition['modalidad'] = prestamo.modalidad === 'al_final' ? 'al_final' : 'mensual'
  const inicio = arDay(prestamo.fecha_inicio || prestamo.created_at) || null
  const hoy = hoyIso ?? arDay(new Date().toISOString())

  const delPrestamo = movimientos.filter(m => coerceId(m.prestamo_id) === pid && pid !== null)
  const repagos = delPrestamo
    .filter(m => m.categoria === 'loan_repayment' && m.tipo === 'egreso')
    .sort((a, b) => (arDay(a.created_at) || '').localeCompare(arDay(b.created_at) || ''))
  const interesesPagados = delPrestamo.filter(m => m.categoria === 'loan_interest' && m.tipo === 'egreso')

  const capital_vivo = Math.max(0, round2(capital_original - repagos.reduce((s, m) => s + Number(m.monto ?? 0), 0)))
  const interes_pagado_total = round2(interesesPagados.reduce((s, m) => s + Number(m.monto ?? 0), 0))

  let interes_mensual = 0
  let interes_devengado = 0
  let interes_mes_pagado: boolean | null = null
  let proximo_vencimiento: string | null = null

  if (modalidad === 'mensual') {
    interes_mensual = round2(capital_vivo * tasa / 100 / 12)
    if (inicio) {
      // Cuotas devengadas = MESES COMPLETOS desde el desembolso (inicio 30/08 →
      // la primera se cumple el 30/09, no el 1/09). El interés se paga vencido:
      // contar el cambio de mes calendario le cobraba un mes entero a un
      // préstamo de dos días (decisión del usuario 2026-09-01).
      const [iy, im, id] = inicio.split('-').map(Number)
      const [hy, hm, hd] = hoy.split('-').map(Number)
      let mesesVencidos = (hy - iy) * 12 + (hm - im)
      if (hd < id) mesesVencidos -= 1          // el mes en curso no se cumplió
      interes_devengado = round2(Math.max(0, mesesVencidos) * interes_mensual)
    }
    const mesActual = hoy.slice(0, 7)
    interes_mes_pagado = interesesPagados.some(m => (arDay(m.created_at) || '').slice(0, 7) === mesActual)
    const [hy, hm] = hoy.split('-').map(Number)
    proximo_vencimiento = hm === 12 ? `${hy + 1}-01-01` : `${hy}-${String(hm + 1).padStart(2, '0')}-01`
  } else if (inicio) {
    let capital = capital_original
    let prev = inicio
    let devengado = 0
    for (const m of repagos) {
      const d = arDay(m.created_at) || prev
      devengado += capital * tasa / 100 * dayDiff(prev, d) / 365
      capital = Math.max(0, capital - Number(m.monto ?? 0))
      prev = d > prev ? d : prev
    }
    devengado += capital * tasa / 100 * dayDiff(prev, hoy) / 365
    interes_devengado = round2(devengado)
  }

  const interes_adeudado = round2(Math.max(0, interes_devengado - interes_pagado_total))
  return {
    id: pid,
    acreedor_id: coerceId(prestamo.acreedor_id),
    modalidad,
    estado: prestamo.estado ?? null,
    tasa_pct: tasa,
    fecha_inicio: inicio,
    capital_original,
    capital_vivo,
    interes_mensual,
    interes_devengado,
    interes_pagado_total,
    interes_adeudado,
    deuda_total: round2(capital_vivo + interes_adeudado),
    interes_mes_pagado,
    proximo_vencimiento,
    vencido: prestamo.estado === 'vencido',
  }
}

export type PatrimonioAuto = { vehicle_id: number | null; label: string; costo: number; valor: number; sena_cobrada: number }
export type ParteSocio = { vehicle_id: number | null; label: string; socio_cliente_id: number | null; socio: string | null; pct: number; margen: number; parte: number }

// Una caja por cada cuenta del perfil, más el total. Era {cash,nexo,fiwind,total}
// fijo; ahora las claves salen de la tabla `cuentas`. `total` es una clave
// RESERVADA: si alguien crea una cuenta llamada "total", el total gana.
export type Cajas = Record<string, number> & { total: number }

export type Patrimonio = {
  cajas: Cajas
  stock: {
    total: number
    costo_invertido: number
    ganancia_esperada: number
    autos: PatrimonioAuto[]
  }
  por_cobrar: {
    total: number
    clientes: { cliente_id: number | null; nombre: string; adelantado: number; devuelto: number; saldo: number }[]
    comisiones_consignaciones: {
      total: number
      autos: { vehicle_id: number | null; label: string; precio_base: number; comision_total: number; es_pactada: boolean; cobrado: number; comision: number }[]
    }
  }
  deuda_total: number
  parte_socios: { total: number; autos: ParteSocio[] }
  interes_mensual_total: number
  capital_propio: number
  posiciones: LoanPosition[]
}

/**
 * Saldo CRUDO (sin redondear) de una cuenta, derivado del ledger: ingresos −
 * egresos de las filas que afectan el balance. Es la única definición de "cuánta
 * plata hay en esta caja" del dashboard.
 *
 * Va sin redondear porque computePatrimonio suma las cajas ANTES de redondear
 * (el total redondea la suma cruda, no las partes); para mostrar un saldo se usa
 * saldoDeCuenta().
 */
export function saldoCrudoDeCuenta(movimientos: any[], clave: string): number {
  let total = 0
  for (const m of movimientos ?? []) {
    if (!affectsBalance(m)) continue
    if (String(m.cuenta ?? '') !== clave) continue
    total += Number(m.monto ?? 0) * (m.tipo === 'ingreso' ? 1 : -1)
  }
  return total
}

/** El mismo saldo, redondeado a centavos: lo que se muestra y lo que se ajusta. */
export function saldoDeCuenta(movimientos: any[], clave: string): number {
  return round2(saldoCrudoDeCuenta(movimientos, clave))
}

// Mirror of the backend's analisis_db(patrimonio): the real money picture.
// cajas (derived from the ledger) + stock (autos PROPIOS sin vender, valued at
// what we expect to get: precio_venta_objetivo → precio_publicado → costo —
// never an invented valuation) + cuentas por cobrar (client_expense −
// client_repayment: our money currently in clients' hands) − deudas (capital
// vivo + interés adeudado of every active loan).
export function computePatrimonio(
  movimientos: any[],
  vehicles: any[],
  prestamos: any[],
  clientes: any[],
  hoyIso?: string,
  // Las cuentas del perfil (tabla `cuentas`). Va última y con default para que
  // ningún llamador viejo cambie de comportamiento: con DEFAULT_CUENTAS el
  // resultado es idéntico al de la versión hardcodeada (lo fija el snapshot de
  // lib/kapso.test.ts). Lo que suma NO cambió — sólo la forma del contenedor.
  cuentas: string[] = DEFAULT_CUENTAS,
): Patrimonio {
  const claves = Array.from(new Set(cuentas.filter(Boolean)))
  const cajasOut = { total: 0 } as Cajas
  let totalCrudo = 0
  for (const c of claves) {
    // Un movimiento de una cuenta que no está en el perfil no se cuenta —
    // misma regla que antes, cuando el `in cajas` filtraba contra los 3 fijos.
    const crudo = saldoCrudoDeCuenta(movimientos, c)
    cajasOut[c] = round2(crudo)
    totalCrudo += crudo   // el total redondea la suma CRUDA, no las partes
  }
  cajasOut.total = round2(totalCrudo)

  // Señas ya cobradas por auto: son parte del precio que YA está en la caja, así
  // que el auto vale en el stock lo que FALTA cobrar. Sin esto los mismos pesos
  // se cuentan dos veces (en cajas y en stock).
  const senasPorAuto = new Map<number, number>()
  for (const m of movimientos) {
    if (m.categoria !== 'down_payment') continue
    const vid = coerceId(m.vehicle_id)
    if (vid === null) continue
    senasPorAuto.set(vid, (senasPorAuto.get(vid) ?? 0) + Number(m.monto ?? 0))
  }

  const autos: PatrimonioAuto[] = []
  const socios: ParteSocio[] = []
  for (const v of vehicles) {
    if (v.tipo_operacion !== 'propio' || v.estado === 'vendido') continue
    const costo = computeVehicleFinancials(v.id, vehicles, movimientos, prestamos).costo_total
    const precio = Number(v.precio_venta_objetivo ?? 0) || Number(v.precio_publicado ?? 0) || costo
    if (costo <= 0 && precio <= 0) continue
    const vid = coerceId(v.id)
    const label = `${v.marca ?? ''} ${v.modelo ?? ''}`.trim() + (v.dominio ? ` (${v.dominio})` : '')
    const sena = round2(Math.min(vid === null ? 0 : (senasPorAuto.get(vid) ?? 0), precio))
    const valor = round2(precio - sena)
    // Parte del socio: su % del margen (venta esperada − costo). Su capital ya
    // vive como préstamo; esto es sólo la ganancia que no es nuestra. Sin la
    // columna cargada (o pre-DDL) el pct es 0 y no resta.
    const pct = Number(v.socio_pct ?? 0)
    if (pct > 0) {
      const margen = precio - costo
      const parte = round2(Math.max(0, margen) * pct / 100)
      if (parte > 0) {
        const socioId = coerceId(v.socio_cliente_id)
        socios.push({
          vehicle_id: vid, label, socio_cliente_id: socioId,
          socio: clientes.find(c => coerceId(c.id) === socioId)?.nombre ?? null,
          pct: round2(pct), margen: round2(margen), parte,
        })
      }
    }
    // Todos los propios sin vender van al mismo stock: `uso_personal` ya no
    // separa nada acá (decisión del usuario 2026-08-26).
    autos.push({ vehicle_id: vid, label, costo, valor, sena_cobrada: sena })
  }
  socios.sort((a, b) => b.parte - a.parte)
  const sociosTotal = round2(socios.reduce((s, a) => s + a.parte, 0))
  autos.sort((a, b) => b.valor - a.valor)
  const stockTotal = round2(autos.reduce((s, a) => s + a.valor, 0))
  const stockCosto = round2(autos.reduce((s, a) => s + a.costo, 0))

  const porCliente = new Map<number, { adelantado: number; devuelto: number }>()
  for (const m of movimientos) {
    const cid = coerceId(m.cliente_id)
    if (cid === null) continue
    const entry = porCliente.get(cid) ?? { adelantado: 0, devuelto: 0 }
    if (m.categoria === 'client_expense' && m.tipo === 'egreso') {
      entry.adelantado += Number(m.monto ?? 0)
    } else if (m.categoria === 'client_repayment' && m.tipo === 'ingreso') {
      entry.devuelto += Number(m.monto ?? 0)
    } else continue
    porCliente.set(cid, entry)
  }
  const clientesCobrar = Array.from(porCliente.entries())
    .filter(([, e]) => e.adelantado - e.devuelto > 0.005)
    .map(([cid, e]) => ({
      cliente_id: cid,
      nombre: clientes.find(c => coerceId(c.id) === cid)?.nombre ?? `id=${cid}`,
      adelantado: round2(e.adelantado),
      devuelto: round2(e.devuelto),
      saldo: round2(e.adelantado - e.devuelto),
    }))
    .sort((a, b) => b.saldo - a.saldo)
  // Comisiones esperadas de consignaciones activas: nuestro 5% del precio
  // objetivo (fallback publicado). Se cobran recién al vender — van marcadas
  // como esperadas — pero son un activo real, igual que la ganancia esperada.
  // Lo ya cobrado de comisión por auto: en las consignaciones la seña NO se
  // devuelve, entra a cuenta de la comisión, así que lo que queda por cobrar es
  // el total pactado menos lo que ya entró (si no, esa plata se cuenta dos
  // veces: en la caja y otra vez como comisión esperada).
  const comisionCobrada = new Map<number, number>()
  for (const m of movimientos) {
    if (m.categoria !== 'commission' || m.tipo !== 'ingreso') continue
    const vid = coerceId(m.vehicle_id)
    if (vid === null) continue
    comisionCobrada.set(vid, (comisionCobrada.get(vid) ?? 0) + Number(m.monto ?? 0))
  }
  const comisionesAutos = vehicles
    .filter(v => v.tipo_operacion === 'consignacion' && v.estado !== 'vendido')
    .map(v => {
      const vid = coerceId(v.id)
      const base = Number(v.precio_venta_objetivo ?? 0) || Number(v.precio_publicado ?? 0)
      const label = `${v.marca ?? ''} ${v.modelo ?? ''}`.trim() + (v.dominio ? ` (${v.dominio})` : '')
      // comision_pactada = el monto ACORDADO (se negocia y casi nunca es el 5%
      // exacto). Sin ella, el 5% del precio, como siempre.
      const pactada = Number(v.comision_pactada ?? 0)
      const total = round2(pactada > 0 ? pactada : base * 0.05)
      const cobrado = round2(vid === null ? 0 : (comisionCobrada.get(vid) ?? 0))
      return {
        vehicle_id: vid, label, precio_base: round2(base), comision_total: total,
        es_pactada: pactada > 0, cobrado, comision: round2(Math.max(0, total - cobrado)),
      }
    })
    .filter(a => a.comision_total > 0 && a.comision > 0)
    .sort((a, b) => b.comision - a.comision)
  const comisionesTotal = round2(comisionesAutos.reduce((s, a) => s + a.comision, 0))

  const porCobrarTotal = round2(clientesCobrar.reduce((s, c) => s + c.saldo, 0) + comisionesTotal)

  const posiciones = prestamos
    .filter(p => p.estado === 'activo')
    .map(p => computeLoanPosition(p, movimientos, hoyIso))
  const deudaTotal = round2(posiciones.reduce((s, p) => s + p.deuda_total, 0))
  const interesMensualTotal = round2(posiciones
    .filter(p => p.modalidad === 'mensual')
    .reduce((s, p) => s + p.interes_mensual, 0))

  // La parte del socio NO es nuestra: su capital ya está en deudaTotal como
  // préstamo, pero su ganancia vivía adentro del stock.
  const capitalPropio = round2(cajasOut.total + stockTotal + porCobrarTotal - deudaTotal - sociosTotal)
  return {
    cajas: cajasOut,
    stock: {
      total: stockTotal,
      costo_invertido: stockCosto,
      ganancia_esperada: round2(stockTotal - stockCosto),
      autos,
    },
    por_cobrar: {
      total: porCobrarTotal,
      clientes: clientesCobrar,
      comisiones_consignaciones: { total: comisionesTotal, autos: comisionesAutos },
    },
    deuda_total: deudaTotal,
    parte_socios: { total: sociosTotal, autos: socios },
    interes_mensual_total: interesMensualTotal,
    capital_propio: capitalPropio,
    posiciones,
  }
}

export type LiquidacionConsignacion = {
  precio_venta: number
  fuente_precio: 'precio_venta_final' | 'ledger_venta' | 'precio_publicado' | 'precio_venta_objetivo' | 'sin_precio'
  estimada: boolean
  comision_pct: number
  comision: number
  gastos_adelantados: number
  neto_al_cliente: number
}

// Mirror of analisis_db(liquidacion_consignacion): cuánto le corresponde al
// dueño de una consignación = precio de venta − comisión (5% default) − gastos
// adelantados por su cuenta (client_expense del auto). Si el auto no se vendió
// todavía, se ESTIMA con precio_publicado/objetivo (estimada=true).
export function computeLiquidacionConsignacion(
  vehicleId: number,
  vehicles: any[],
  movimientos: any[],
  comisionPct: number = 5,
): LiquidacionConsignacion {
  const vid = coerceId(vehicleId)
  const v = vehicles.find(x => coerceId(x.id) === vid) ?? {}
  const delAuto = movimientos.filter(m => coerceId(m.vehicle_id) === vid)
  const gastos_adelantados = round2(delAuto
    .filter(m => m.categoria === 'client_expense' && m.tipo === 'egreso')
    .reduce((s, m) => s + Number(m.monto ?? 0), 0))

  let precio_venta = Number(v.precio_venta_final ?? 0)
  let fuente: LiquidacionConsignacion['fuente_precio'] = 'precio_venta_final'
  let estimada = false
  if (precio_venta <= 0) {
    precio_venta = round2(delAuto
      .filter(m => m.categoria === 'venta' && m.tipo === 'ingreso')
      .reduce((s, m) => s + Number(m.monto ?? 0), 0))
    fuente = 'ledger_venta'
  }
  if (precio_venta <= 0 && Number(v.precio_publicado ?? 0) > 0) {
    precio_venta = Number(v.precio_publicado); fuente = 'precio_publicado'; estimada = true
  }
  if (precio_venta <= 0 && Number(v.precio_venta_objetivo ?? 0) > 0) {
    precio_venta = Number(v.precio_venta_objetivo); fuente = 'precio_venta_objetivo'; estimada = true
  }
  if (precio_venta <= 0) fuente = 'sin_precio'

  const comision = round2(precio_venta * comisionPct / 100)
  return {
    precio_venta: round2(precio_venta),
    fuente_precio: fuente,
    estimada,
    comision_pct: comisionPct,
    comision,
    gastos_adelantados,
    neto_al_cliente: round2(precio_venta - comision - gastos_adelantados),
  }
}
