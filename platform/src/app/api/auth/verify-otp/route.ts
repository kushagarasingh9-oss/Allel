import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/foundation/database/server'
import { decrypt } from '@/integrations/_core/encryption'

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

    // 1. Check for encrypted pending auth cookie (from Resend direct 6-digit OTP flow)
    const pendingCookie = request.cookies.get('allel_pending_auth')?.value
    if (pendingCookie && pendingCookie.includes('::')) {
      try {
        const [encrypted, iv, authTag] = pendingCookie.split('::')
        if (encrypted && iv && authTag) {
          const decrypted = decrypt(encrypted, iv, authTag)
          const parsed = JSON.parse(decrypted) as {
            email: string
            code: string
            actionLink: string
            expiresAt: number
          }

          if (
            parsed.email.toLowerCase() === email &&
            parsed.code === token &&
            parsed.expiresAt > Date.now()
          ) {
            // Exchange magic link action URL for Supabase auth tokens
            const fetchRes = await fetch(parsed.actionLink, { redirect: 'manual' })
            const location = fetchRes.headers.get('location') || ''
            const hash = location.includes('#') ? location.split('#')[1] : ''
            const params = new URLSearchParams(hash)
            const accessToken = params.get('access_token')
            const refreshToken = params.get('refresh_token')

            if (accessToken && refreshToken) {
              const { error: sessionError } = await supabase.auth.setSession({
                access_token: accessToken,
                refresh_token: refreshToken,
              })

              if (!sessionError) {
                const response = NextResponse.json({ ok: true, hasSession: true })
                response.cookies.delete('allel_pending_auth')
                return response
              }
              console.error('[api/auth/verify-otp] setSession error:', sessionError)
            }
          }
        }
      } catch (cookieErr) {
        console.warn('[api/auth/verify-otp] Cookie decode warning, falling back to Supabase verifyOtp', cookieErr)
      }
    }

    // 2. Fallback: Supabase GoTrue direct verify
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

    const response = NextResponse.json({ ok: true, hasSession: !!data.session })
    response.cookies.delete('allel_pending_auth')
    return response
  } catch (error) {
    console.error('[api/auth/verify-otp] Verification error', error)
    return NextResponse.json(
      { error: 'Unable to verify code. Please try again.' },
      { status: 500 }
    )
  }
}
