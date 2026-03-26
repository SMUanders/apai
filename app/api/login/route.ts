import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const { password } = await req.json()
  const correct = process.env.SITE_PASSWORD

  if (!correct || password !== correct) {
    return NextResponse.json({ error: 'Forkert adgangskode' }, { status: 401 })
  }

  const res = NextResponse.json({ ok: true })
  res.cookies.set('apai_auth', correct, {
    httpOnly: true,
    secure: true,
    sameSite: 'strict',
    maxAge: 60 * 60 * 24 * 365,
    path: '/',
  })
  return res
}
