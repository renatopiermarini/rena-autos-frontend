const BASE = process.env.KAPSO_DB_URL!
const KEY  = process.env.KAPSO_API_KEY!
const HEADERS = { 'X-API-Key': KEY, 'Content-Type': 'application/json' }

async function get(table: string) {
  const res = await fetch(`${BASE}/${table}`, { headers: HEADERS, next: { revalidate: 30 } })
  if (!res.ok) return []
  return (await res.json()).data ?? []
}

export async function getBalances()        { return get('balances') }
export async function getVehicles()        { return get('vehicles') }
export async function getClientes()        { return get('clientes') }
export async function getInteresados()     { return get('interesados') }
export async function getTareas()          { return get('tareas') }
export async function getPrestamos()       { return get('prestamos') }
export async function getMovimientos()     { return get('movimientos_contabilidad') }
export async function getTransferencias()  { return get('transferencias') }
