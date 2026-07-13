const BASE = process.env.KAPSO_DB_URL!
const KEY  = process.env.KAPSO_API_KEY!
const HEADERS = { 'X-API-Key': KEY, 'Content-Type': 'application/json' }

const PAGE_SIZE = 200 // Kapso caps each request at ~100; ask for 200, paginate beyond.

async function get(table: string, revalidate: number = 30) {
  // Paginate until we get a partial page. Kapso's default response is ~50 rows
  // and capped per-request, so without this loop we silently dropped any row
  // beyond the first page (the bot was saving expenses correctly but the UI
  // was pinned to the oldest 50 rows).
  const all: any[] = []
  let offset = 0
  for (let i = 0; i < 50; i++) { // hard cap to avoid runaway loops
    const url = `${BASE}/${table}?limit=${PAGE_SIZE}&offset=${offset}`
    const res = await fetch(url, { headers: HEADERS, next: { revalidate } })
    if (!res.ok) return all
    const page: any[] = (await res.json()).data ?? []
    if (page.length === 0) break
    all.push(...page)
    if (page.length < PAGE_SIZE) break
    offset += page.length
  }
  return all
}

export async function getBalances()        { return get('balances', 60) }
export async function getVehicles()        { return get('vehicles', 15) }
export async function getClientes()        { return get('clientes', 60) }
export async function getInteresados()     { return get('interesados', 15) }
export async function getTareas()          { return get('tareas', 15) }
export async function getPrestamos()       { return get('prestamos', 60) }
export async function getMovimientos()     { return get('movimientos_contabilidad', 60) }
export async function getTransferencias()  { return get('transferencias', 15) }
export async function getTurnos()           { return get('turnos', 15) }
export async function getOfertas()         { return get('ofertas', 15) }
export async function getVisitas()         { return get('visitas', 15) }
export async function getKbEntries()       { return get('kb_entries', 15) }
export async function getVerificaciones()  { return get('verificaciones_mecanicas', 30) }

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

export type VehicleFinancials = {
  precio_compra: number
  gastos_por_categoria: Record<string, number>
  gastos_total: number
  costo_total: number
  precio_publicado: number | null
  margen_esperado: number | null
  prestamos_asociados: any[]
  es_consignacion: boolean
}

export function computeVehicleFinancials(
  vehicleId: number,
  vehicles: any[],
  movimientos: any[],
  prestamos: any[],
): VehicleFinancials {
  const v = vehicles.find(x => x.id === vehicleId) ?? {}
  const es_consignacion = v.tipo_operacion === 'consignacion'
  const precio_compra = Number(v.precio_compra ?? 0)
  const precio_publicado = v.precio_publicado != null ? Number(v.precio_publicado) : null

  const gastos_por_categoria: Record<string, number> = {}
  let gastos_total = 0
  for (const m of movimientos) {
    if (m.vehicle_id !== vehicleId) continue
    if (m.tipo !== 'egreso') continue
    // Only real vehicle costs count as gastos. 'vehicle_purchase' is the SAME
    // money as vehicle.precio_compra (live 2026-07-11: vehicles 33/36 had
    // both → costo_total double-counted the purchase); 'refund' cancels an
    // ingreso (returned seña), it isn't a cost of the car. Off-balance
    // expenses (saldo_post null, fronted by an acreedor) DO count — the car
    // cost that money regardless of whose pocket paid first.
    if (m.categoria !== 'vehicle_expense') continue
    const monto = Number(m.monto ?? 0)
    const cat = m.categoria || 'sin_categoria'
    gastos_por_categoria[cat] = (gastos_por_categoria[cat] ?? 0) + monto
    gastos_total += monto
  }

  const costo_total = precio_compra + gastos_total
  const margen_esperado = es_consignacion
    ? null
    : precio_publicado != null ? precio_publicado - costo_total : null
  const prestamos_asociados = prestamos.filter(p => p.vehicle_id === vehicleId)

  return {
    precio_compra,
    gastos_por_categoria,
    gastos_total,
    costo_total,
    precio_publicado,
    margen_esperado,
    prestamos_asociados,
    es_consignacion,
  }
}

export type PrestamoStatus = {
  capital: number
  tasa_anual_pct: number
  dias_transcurridos: number
  interes_acumulado: number
  saldo_pendiente: number
  monto_a_devolver_vto: number
  dias_vencimiento: number | null
  vencido: boolean
  proximo: boolean
}

export function computePrestamoStatus(prestamo: any, today: Date = new Date()): PrestamoStatus {
  const capital = Number(prestamo.monto_original ?? 0)
  const tasaRaw = Number(prestamo.tasa_interes_anual ?? 0)
  const tasa_anual_pct = tasaRaw > 1 ? tasaRaw : tasaRaw * 100
  const tasa_anual = tasa_anual_pct / 100

  // Date-only strings parse as UTC midnight → AR day-diffs off by one near
  // midnight; anchor them to local noon (same rule as lib/date.ts parseAny).
  const inicioStr = prestamo.fecha_inicio || prestamo.created_at
  const inicio = inicioStr
    ? new Date(String(inicioStr).includes('T') ? inicioStr : inicioStr + 'T12:00:00')
    : today
  const dias_transcurridos = Math.max(0, Math.floor((today.getTime() - inicio.getTime()) / 86400000))
  const interes_acumulado = capital * tasa_anual * (dias_transcurridos / 365)

  const pagado = Number(prestamo.monto_pagado ?? 0)
  const saldo_pendiente = Math.max(0, capital + interes_acumulado - pagado)

  let dias_vencimiento: number | null = null
  if (prestamo.fecha_vencimiento) {
    const v = new Date(String(prestamo.fecha_vencimiento).includes('T')
      ? prestamo.fecha_vencimiento
      : prestamo.fecha_vencimiento + 'T12:00:00')
    dias_vencimiento = Math.ceil((v.getTime() - today.getTime()) / 86400000)
  }
  const vencido = prestamo.estado === 'vencido' || (dias_vencimiento != null && dias_vencimiento < 0)
  const proximo = dias_vencimiento != null && dias_vencimiento >= 0 && dias_vencimiento <= 30

  return {
    capital,
    tasa_anual_pct,
    dias_transcurridos,
    interes_acumulado: Math.round(interes_acumulado * 100) / 100,
    saldo_pendiente: Math.round(saldo_pendiente * 100) / 100,
    monto_a_devolver_vto: Number(prestamo.monto_a_devolver ?? 0),
    dias_vencimiento,
    vencido,
    proximo,
  }
}
