import { NextRequest, NextResponse } from 'next/server'

const COOKIE = 'ra_auth'
const COOKIE_MAX_AGE = 60 * 60 * 24 * 30 // 30 days

export async function POST(req: NextRequest) {
  const { password } = await req.json()
  const expected = process.env.DASHBOARD_PASSWORD

  if (!expected || password !== expected) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const res = NextResponse.json({ ok: true })
  res.cookies.set(COOKIE, expected, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: COOKIE_MAX_AGE,
    path: '/',
  })
  return res
}
