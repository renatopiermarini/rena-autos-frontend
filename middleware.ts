import { NextRequest, NextResponse } from 'next/server'
import { hashPassword } from '@/lib/auth'

const COOKIE = 'ra_auth'

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  // Login page and login API always accessible (no cookie yet)
  if (pathname === '/login' || pathname === '/api/login') return NextResponse.next()

  const token = req.cookies.get(COOKIE)?.value
  const password = process.env.DASHBOARD_PASSWORD

  if (!token || !password) {
    return NextResponse.redirect(new URL('/login', req.url))
  }

  const expected = await hashPassword(password)
  if (token !== expected) {
    return NextResponse.redirect(new URL('/login', req.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
