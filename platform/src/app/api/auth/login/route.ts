import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/foundation/database/server'

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => null)) as {
      email?: unknown
    } | null
    const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : ''

    if (!email || !email.includes('@')) {
      return NextResponse.json({ error: 'Enter a valid email address.' }, { status: 400 })
    }

    const forwardedHost = request.headers.get('x-forwarded-host') || request.headers.get('host')
    const forwardedProto = request.headers.get('x-forwarded-proto') || (process.env.NODE_ENV === 'production' ? 'https' : 'http')
    const origin = forwardedHost ? `${forwardedProto}://${forwardedHost}` : request.nextUrl.origin

    const supabase = await createClient()
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${origin}/auth/callback`,
      },
    })

    if (error) {
      return NextResponse.json(
        { error: error.message || 'Unable to send magic link.' },
        { status: error.status || 400 }
      )
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('[api/auth/login] Failed to send magic link', error)
    return NextResponse.json(
      { error: 'Unable to reach the auth service. Please try again.' },
      { status: 500 }
    )
  }
}
