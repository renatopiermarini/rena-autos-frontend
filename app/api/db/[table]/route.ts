import { NextRequest, NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { visitaConflict } from '@/lib/agenda'

const BASE    = process.env.KAPSO_DB_URL!
const KEY     = process.env.KAPSO_API_KEY!
const HEADERS = { 'X-API-Key': KEY, 'Content-Type': 'application/json' }

const ALLOWED = new Set(['vehicles', 'clientes', 'tareas', 'interesados', 'ofertas', 'visitas', 'notas', 'transferencias', 'kb_entries', 'verificaciones_mecanicas'])

// Live-verified enum sets — mirrors the bot (rena-autos-api tools/kapso_tools.py
// ENUMS, prod survey 2026-07-07). "equipo" in asignado is real (broadcast bucket).
const ENUMS: Record<string, Record<string, string[]>> = {
  vehicles: {
    estado: ['a_ingresar', 'en_preparacion', 'publicado', 'reservado', 'vendido'],
    tipo_operacion: ['consignacion', 'propio'],
  },
  tareas: {
    estado: ['pendiente', 'en_curso', 'completada'],
    prioridad: ['alta', 'media', 'baja'],
    asignado: ['rena', 'fran', 'marshiot', 'equipo'],
  },
  visitas: {
    resultado: ['pendiente', 'concretada', 'cancelada', 'no_compro'],
    tipo: ['visita_interesado', 'recibir_vehiculo'],
  },
  ofertas: { estado: ['pendiente', 'aceptada', 'rechazada', 'contraoferta'] },
  clientes: { tipo: ['vendedor', 'comprador', 'acreedor'] },
  verificaciones_mecanicas: { estado: ['pendiente', 'hecha', 'pagada'] },
  kb_entries: { tipo: ['proceso', 'faq', 'plantilla', 'leccion_aprendida'] },
}

// Deleting these would orphan child rows. Policy (same as the bot): reject with
// counts, never auto-cascade.
const DELETE_LINKS: Record<string, Array<[table: string, col: string, label: string]>> = {
  vehicles: [
    ['visitas', 'vehicle_id', 'visita(s)'],
    ['ofertas', 'vehicle_id', 'oferta(s)'],
    ['transferencias', 'vehicle_id', 'transferencia(s)'],
    ['tareas', 'vehicle_id', 'tarea(s)'],
    ['gastos_vehicles', 'vehicle_id', 'gasto(s)'],
    ['movimientos_contabilidad', 'vehicle_id', 'movimiento(s) contable(s)'],
  ],
  interesados: [
    ['visitas', 'interesado_id', 'visita(s)'],
    ['ofertas', 'interesado_id', 'oferta(s)'],
  ],
}

// Mutations address rows by ?id=N (or ?vehicle_id=N for legacy id-less
// transferencias rows). Anything else — including NO filter, which Kapso would
// apply to the whole table — is rejected.
const FILTER_KEYS = ['id', 'vehicle_id']

function parseFilter(request: NextRequest): { key: string; value: number } | NextResponse {
  const params = request.nextUrl.searchParams
  const keys = FILTER_KEYS.filter(k => params.has(k))
  if (keys.length !== 1) {
    return NextResponse.json(
      { error: 'filtro_requerido', message: 'Se requiere exactamente un filtro: ?id=N o ?vehicle_id=N.' },
      { status: 400 },
    )
  }
  const value = Number(params.get(keys[0]))
  if (!Number.isInteger(value) || value <= 0) {
    return NextResponse.json(
      { error: 'filtro_invalido', message: `\`${keys[0]}\` inválido: debe ser un entero positivo.` },
      { status: 400 },
    )
  }
  return { key: keys[0], value }
}

function enumError(table: string, body: any): NextResponse | null {
  const rules = ENUMS[table]
  if (!rules || !body || typeof body !== 'object') return null
  for (const [field, allowed] of Object.entries(rules)) {
    const val = body[field]
    if (val != null && !allowed.includes(val)) {
      return NextResponse.json(
        { error: 'valor_invalido', message: `\`${field}\` inválido: ${JSON.stringify(val)}. Valores válidos: ${[...allowed].sort().join(', ')}.` },
        { status: 400 },
      )
    }
  }
  return null
}

// Kapso ghost-writes (verified live 2026-07-07): PATCH/DELETE on a nonexistent id
// return HTTP 200 and silently no-op, so res.ok is meaningless without this check.
// Returns the matching rows, or null when the read itself failed (fail-open: only
// reject when we positively know the row is missing — this is defense-in-depth,
// the bot enforces the same checks on its side).
async function rowsMatching(table: string, key: string, value: number): Promise<any[] | null> {
  try {
    const res = await fetch(`${BASE}/${table}?${key}=${value}&limit=200`, { headers: HEADERS, cache: 'no-store' })
    if (!res.ok) return null
    const rows: any[] = (await res.json()).data ?? []
    // Re-check client-side so an ignored filter param can't fake a match.
    return rows.filter(r => Number(r?.[key]) === value)
  } catch {
    return null
  }
}

async function notFound404(table: string, key: string, value: number): Promise<NextResponse | null> {
  const rows = await rowsMatching(table, key, value)
  if (rows !== null && rows.length === 0) {
    return NextResponse.json(
      { error: 'no_existe', message: `No existe ${table} con ${key}=${value} — nada que actualizar/borrar.` },
      { status: 404 },
    )
  }
  return null
}

async function linkedRows409(table: string, key: string, value: number): Promise<NextResponse | null> {
  if (key !== 'id') return null
  const links = DELETE_LINKS[table]
  if (!links) return null
  const counts = await Promise.all(links.map(async ([tbl, col, label]) => {
    const rows = await rowsMatching(tbl, col, value)
    return rows && rows.length > 0 ? `${rows.length} ${label}` : null
  }))
  const found = counts.filter(Boolean)
  if (found.length > 0) {
    return NextResponse.json(
      {
        error: 'registros_vinculados',
        message: `No se puede borrar: tiene ${found.join(', ')} vinculado(s). Borralos primero o cambiá el estado en vez de borrar.`,
      },
      { status: 409 },
    )
  }
  return null
}

function bustCache() {
  // Invalidate Data Cache for every page so router.refresh() gets fresh data.
  revalidatePath('/', 'layout')
}

// Kapso responds 204 No Content on DELETE; Response.json() throws on
// bodyless status codes, so pass those through without a JSON body.
async function proxyResponse(res: Response) {
  if (res.status === 204 || res.status === 205 || res.status === 304) {
    return new NextResponse(null, { status: res.status })
  }
  const data = await res.json().catch(() => ({}))
  return NextResponse.json(data, { status: res.status })
}

// Defense-in-depth: the dashboard UI already blocks a conflicting visita, but enforce
// it here too so no client can write a visita on top of a transferencia turno block.
// Mirrors the bot (rena-autos-api). Fail-open: if we can't read transferencias, allow.
async function fetchAllTransferencias(): Promise<any[]> {
  const all: any[] = []
  let offset = 0
  for (let i = 0; i < 20; i++) {
    const res = await fetch(`${BASE}/transferencias?limit=200&offset=${offset}`, { headers: HEADERS, cache: 'no-store' })
    if (!res.ok) return all
    const page: any[] = (await res.json()).data ?? []
    all.push(...page)
    if (page.length < 200) break
    offset += page.length
  }
  return all
}

async function visitaConflict409(table: string, body: any): Promise<NextResponse | null> {
  if (table !== 'visitas' || !body?.fecha) return null
  try {
    const transferencias = await fetchAllTransferencias()
    const hit = visitaConflict(body.fecha, transferencias)
    if (hit) {
      return NextResponse.json(
        { error: 'conflicto_turno', message: `No se puede agendar: choca con el turno de transferencia de ${hit.auto}.`, auto: hit.auto },
        { status: 409 },
      )
    }
  } catch {
    return null
  }
  return null
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ table: string }> },
) {
  const { table } = await params
  if (!ALLOWED.has(table)) return NextResponse.json({ error: 'Not allowed' }, { status: 403 })

  const body = await request.json()
  const badEnum = enumError(table, body)
  if (badEnum) return badEnum
  const conflict = await visitaConflict409(table, body)
  if (conflict) return conflict
  const res = await fetch(`${BASE}/${table}`, {
    method: 'POST',
    headers: HEADERS,
    body: JSON.stringify(body),
  })
  if (res.ok) bustCache()
  return proxyResponse(res)
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ table: string }> },
) {
  const { table } = await params
  if (!ALLOWED.has(table)) return NextResponse.json({ error: 'Not allowed' }, { status: 403 })

  const filter = parseFilter(request)
  if (filter instanceof NextResponse) return filter
  const body = await request.json()
  const badEnum = enumError(table, body)
  if (badEnum) return badEnum
  const missing = await notFound404(table, filter.key, filter.value)
  if (missing) return missing
  const conflict = await visitaConflict409(table, body)
  if (conflict) return conflict

  const res = await fetch(`${BASE}/${table}?${filter.key}=${filter.value}`, {
    method: 'PATCH',
    headers: HEADERS,
    body: JSON.stringify(body),
  })
  if (res.ok) bustCache()
  return proxyResponse(res)
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ table: string }> },
) {
  const { table } = await params
  if (!ALLOWED.has(table)) return NextResponse.json({ error: 'Not allowed' }, { status: 403 })

  const filter = parseFilter(request)
  if (filter instanceof NextResponse) return filter
  const missing = await notFound404(table, filter.key, filter.value)
  if (missing) return missing
  const linked = await linkedRows409(table, filter.key, filter.value)
  if (linked) return linked

  const res = await fetch(`${BASE}/${table}?${filter.key}=${filter.value}`, {
    method: 'DELETE',
    headers: HEADERS,
  })
  if (res.ok) bustCache()
  return proxyResponse(res)
}
