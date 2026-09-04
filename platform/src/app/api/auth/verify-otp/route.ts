import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/foundation/database/server'

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => null)) as {
      email?: unknown
      token?: unknown
    } | null

    const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : ''
    const token = typeof body?.token === 'string' ? body.token.trim() : ''

    if (!email || !token) {
      return NextResponse.json(
        { error: 'Email and 6-digit verification code are required.' },
        { status: 400 }
      )
    }

    const supabase = await createClient()
    const { data, error } = await supabase.auth.verifyOtp({
      email,
      token,
      type: 'email',
    })

    if (error) {
      return NextResponse.json(
        { error: error.message || 'Invalid or expired code. Please check your email and try again.' },
        { status: 400 }
      )
    }

    return NextResponse.json({ ok: true, hasSession: !!data.session })
  } catch (error) {
    console.error('[api/auth/verify-otp] Verification error', error)
    return NextResponse.json(
      { error: 'Unable to verify code. Please try again.' },
      { status: 500 }
    )
  }
}
