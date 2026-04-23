const BASE = process.env.KAPSO_DB_URL!
const KEY  = process.env.KAPSO_API_KEY!
const HEADERS = { 'X-API-Key': KEY, 'Content-Type': 'application/json' }

async function get(table: string, revalidate: number = 30) {
  const res = await fetch(`${BASE}/${table}`, { headers: HEADERS, next: { revalidate } })
  if (!res.ok) return []
  return (await res.json()).data ?? []
}

export async function getBalances()        { return get('balances', 60) }
export async function getVehicles()        { return get('vehicles', 15) }
export async function getClientes()        { return get('clientes', 60) }
export async function getInteresados()     { return get('interesados', 15) }
export async function getTareas()          { return get('tareas', 15) }
export async function getPrestamos()       { return get('prestamos', 60) }
export async function getMovimientos()     { return get('movimientos_contabilidad', 60) }
export async function getTransferencias()  { return get('transferencias', 15) }
export async function getOfertas()         { return get('ofertas', 15) }
export async function getVisitas()         { return get('visitas', 15) }

// ── Client-side mutations (call the /api/db proxy) ────────────────────────────

export async function patchRecord(
  table: string,
  id: number,
  data: object,
  keyName: string = 'id',
): Promise<boolean> {
  const res = await fetch(`/api/db/${table}?${keyName}=${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  return res.ok
}

export async function postRecord(table: string, data: object): Promise<{ ok: boolean; data?: any }> {
  const res = await fetch(`/api/db/${table}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  const json = await res.json().catch(() => ({}))
  return { ok: res.ok, data: json }
}

export async function deleteRecord(
  table: string,
  id: number,
  keyName: string = 'id',
): Promise<boolean> {
  const res = await fetch(`/api/db/${table}?${keyName}=${id}`, { method: 'DELETE' })
  return res.ok
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
    const cat = m.categoria || 'sin_categoria'
    const monto = Number(m.monto ?? 0)
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

  const inicioStr = prestamo.fecha_inicio || prestamo.created_at
  const inicio = inicioStr ? new Date(inicioStr) : today
  const dias_transcurridos = Math.max(0, Math.floor((today.getTime() - inicio.getTime()) / 86400000))
  const interes_acumulado = capital * tasa_anual * (dias_transcurridos / 365)

  const pagado = Number(prestamo.monto_pagado ?? 0)
  const saldo_pendiente = Math.max(0, capital + interes_acumulado - pagado)

  let dias_vencimiento: number | null = null
  if (prestamo.fecha_vencimiento) {
    const v = new Date(prestamo.fecha_vencimiento)
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
