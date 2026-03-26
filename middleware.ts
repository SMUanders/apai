import { NextRequest, NextResponse } from 'next/server'

const PASSWORD = process.env.SITE_PASSWORD

export function middleware(req: NextRequest) {
  if (!PASSWORD) return NextResponse.next()

  const cookie = req.cookies.get('apai_auth')?.value
  if (cookie === PASSWORD) return NextResponse.next()

  const { pathname } = req.nextUrl
  if (pathname === '/login') return NextResponse.next()

  return NextResponse.redirect(new URL('/login', req.url))
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icon-|manifest|sw.js|api/login).*)'],
}
