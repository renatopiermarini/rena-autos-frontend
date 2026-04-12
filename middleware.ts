import { NextRequest, NextResponse } from 'next/server'

const COOKIE = 'ra_auth'

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  // Login page and login API always accessible (no cookie yet)
  if (pathname === '/login' || pathname === '/api/login') return NextResponse.next()

  const auth = req.cookies.get(COOKIE)?.value
  const expected = process.env.DASHBOARD_PASSWORD

  if (!expected || auth !== expected) {
    const url = req.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
