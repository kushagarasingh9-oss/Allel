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

    const supabase = await createClient()
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${request.nextUrl.origin}/auth/callback`,
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
