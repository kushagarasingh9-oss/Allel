import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/foundation/database/server'
import { createServiceClient } from '@/foundation/database/service'
import { Resend } from 'resend'

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

    const resendApiKey = process.env.RESEND_API_KEY
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    // High-reliability path: Generate OTP via Supabase Admin and dispatch via verified Resend domain
    if (resendApiKey && serviceRoleKey) {
      try {
        const adminClient = createServiceClient()
        const { data: linkData, error: linkError } = await adminClient.auth.admin.generateLink({
          type: 'magiclink',
          email,
          options: {
            redirectTo: `${origin}/auth/callback`,
          },
        })

        if (linkError) {
          console.error('[api/auth/login] Admin generateLink error:', linkError)
        } else if (linkData?.properties?.email_otp) {
          const otp = linkData.properties.email_otp
          const actionLink = linkData.properties.action_link

          const resend = new Resend(resendApiKey)
          const sendResult = await resend.emails.send({
            from: 'Allel <kushagra@allel.co>',
            to: email,
            subject: `Your Allel verification code is ${otp}`,
            html: `
              <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 24px; background: #0e0e0e; color: #ededed; border-radius: 12px; border: 1px solid rgba(255,255,255,0.1);">
                <div style="margin-bottom: 24px; text-align: center;">
                  <span style="font-size: 24px; font-weight: 600; color: #ffffff; letter-spacing: -0.5px;">Allel</span>
                  <p style="margin-top: 4px; font-size: 13px; color: #777777;">Autonomous Revenue Recovery</p>
                </div>
                
                <h3 style="font-size: 16px; font-weight: 500; color: #ffffff; margin-bottom: 8px;">Your verification code</h3>
                <p style="font-size: 13.5px; color: #888888; line-height: 1.5; margin-bottom: 20px;">
                  Enter this verification code on the login screen to sign in:
                </p>

                <div style="background: #141414; border: 1px solid rgba(255,255,255,0.18); border-radius: 8px; padding: 18px; text-align: center; margin-bottom: 24px;">
                  <span style="font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; font-size: 32px; font-weight: 700; letter-spacing: 8px; color: #ffffff; display: inline-block;">
                    ${otp}
                  </span>
                </div>

                <div style="text-align: center; margin-top: 24px; padding-top: 20px; border-top: 1px solid rgba(255,255,255,0.08);">
                  <p style="font-size: 12.5px; color: #666666; margin-bottom: 12px;">Or click below to sign in directly with 1-click:</p>
                  <a href="${actionLink}" style="display: inline-block; background: #ffffff; color: #000000; padding: 10px 22px; border-radius: 8px; font-size: 13px; font-weight: 600; text-decoration: none;">
                    Log In to Allel →
                  </a>
                </div>
              </div>
            `,
          })

          if (!sendResult.error) {
            return NextResponse.json({ ok: true, otpLength: otp.length })
          }
          console.warn('[api/auth/login] Resend send warning, falling back to Supabase client', sendResult.error)
        }
      } catch (adminErr) {
        console.warn('[api/auth/login] Resend flow caught error, falling back to Supabase client', adminErr)
      }
    }

    // Fallback path: Standard Supabase client OTP request
    const supabase = await createClient()
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${origin}/auth/callback`,
      },
    })

    if (error) {
      return NextResponse.json(
        { error: error.message || 'Unable to send verification code.' },
        { status: error.status || 400 }
      )
    }

    return NextResponse.json({ ok: true, otpLength: 8 })
  } catch (error) {
    console.error('[api/auth/login] Failed to send verification code', error)
    return NextResponse.json(
      { error: 'Unable to reach the auth service. Please try again.' },
      { status: 500 }
    )
  }
}
