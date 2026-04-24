import { NextRequest, NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'

const BASE    = process.env.KAPSO_DB_URL!
const KEY     = process.env.KAPSO_API_KEY!
const HEADERS = { 'X-API-Key': KEY, 'Content-Type': 'application/json' }

const ALLOWED = new Set(['vehicles', 'clientes', 'tareas', 'interesados', 'ofertas', 'visitas', 'notas', 'transferencias', 'kb_entries'])

function bustCache() {
  // Invalidate Data Cache for every page so router.refresh() gets fresh data.
  revalidatePath('/', 'layout')
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ table: string }> },
) {
  const { table } = await params
  if (!ALLOWED.has(table)) return NextResponse.json({ error: 'Not allowed' }, { status: 403 })

  const body = await request.json()
  const res = await fetch(`${BASE}/${table}`, {
    method: 'POST',
    headers: HEADERS,
    body: JSON.stringify(body),
  })
  const data = await res.json().catch(() => ({}))
  if (res.ok) bustCache()
  return NextResponse.json(data, { status: res.status })
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
  const res = await fetch(url, {
    method: 'PATCH',
    headers: HEADERS,
    body: JSON.stringify(body),
  })
  const data = await res.json().catch(() => ({}))
  if (res.ok) bustCache()
  return NextResponse.json(data, { status: res.status })
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
  const data = await res.json().catch(() => ({}))
  if (res.ok) bustCache()
  return NextResponse.json(data, { status: res.status })
}
