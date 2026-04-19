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
