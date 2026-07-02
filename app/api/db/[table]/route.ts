import { NextRequest, NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { visitaConflict } from '@/lib/agenda'

const BASE    = process.env.KAPSO_DB_URL!
const KEY     = process.env.KAPSO_API_KEY!
const HEADERS = { 'X-API-Key': KEY, 'Content-Type': 'application/json' }

const ALLOWED = new Set(['vehicles', 'clientes', 'tareas', 'interesados', 'ofertas', 'visitas', 'notas', 'transferencias', 'kb_entries', 'verificaciones_mecanicas'])

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

  const qs  = request.nextUrl.searchParams.toString()
  const url = qs ? `${BASE}/${table}?${qs}` : `${BASE}/${table}`
  const body = await request.json()
  const conflict = await visitaConflict409(table, body)
  if (conflict) return conflict
  const res = await fetch(url, {
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

  const qs = request.nextUrl.searchParams.toString()
  if (!qs) return NextResponse.json({ error: 'filter required (id or vehicle_id)' }, { status: 400 })
  const res = await fetch(`${BASE}/${table}?${qs}`, {
    method: 'DELETE',
    headers: HEADERS,
  })
  if (res.ok) bustCache()
  return proxyResponse(res)
}
