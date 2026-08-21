import { NextResponse } from 'next/server';
import { Resend } from 'resend';

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}

export async function POST(req: Request) {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  try {
    let email = '';

    const contentType = req.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      const body = await req.json();
      email = body.email || body.Email || '';
    } else if (contentType.includes('multipart/form-data') || contentType.includes('application/x-www-form-urlencoded')) {
      const formData = await req.formData();
      email = (formData.get('email') || formData.get('Email') || '').toString();
    } else {
      const text = await req.text();
      try {
        const body = JSON.parse(text);
        email = body.email || body.Email || '';
      } catch {
        email = text;
      }
    }

    email = email.trim();
    if (!email || !email.includes('@')) {
      return NextResponse.json(
        { success: false, error: 'Please provide a valid email address.' },
        { status: 400, headers }
      );
    }

    console.log(`[Waitlist API] New waitlist submission: ${email}`);

    const resendApiKey = process.env.RESEND_API_KEY;
    const notifyEmail = process.env.RESEND_NOTIFICATION_EMAIL || 'kushagara@allel.co';

    if (resendApiKey) {
      const resend = new Resend(resendApiKey);

      // Use verified domain or Resend onboarding fallback to guarantee delivery
      const fromEmail = process.env.RESEND_FROM_EMAIL || 'Allel Waitlist <onboarding@resend.dev>';

      // 1. Send Notification Email to Founder (kushagara@allel.co)
      try {
        await resend.emails.send({
          from: fromEmail,
          to: [notifyEmail],
          subject: `🔥 New Waitlist Lead: ${email}`,
          html: `
            <div style="font-family: sans-serif; padding: 24px; background-color: #0f0f11; color: #ffffff; border-radius: 8px;">
              <h2 style="color: #4e47fa; margin-top: 0;">🚀 New Waitlist Lead Joined!</h2>
              <p style="font-size: 16px;"><strong>Email:</strong> <a href="mailto:${email}" style="color: #3ecf8e;">${email}</a></p>
              <p style="color: #888888; font-size: 12px; margin-bottom: 0;">Joined on: ${new Date().toLocaleString()}</p>
            </div>
          `,
        });
        console.log(`[Waitlist API] Notification sent to ${notifyEmail}`);
      } catch (sendErr) {
        console.error('[Waitlist API] Failed to send notification email:', sendErr);
      }

      // 2. Send Confirmation Email to Subscriber
      if (isValidEmail(email)) {
        try {
          await resend.emails.send({
            from: fromEmail,
            to: [email],
            subject: "You're on the Allel waitlist! 🎉",
            html: `
              <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 560px; margin: 0 auto; padding: 32px 24px; background-color: #0c0d0e; color: #e6e6e6; border-radius: 12px; border: 1px solid #222;">
                <div style="margin-bottom: 24px;">
                  <span style="font-weight: 700; font-size: 20px; color: #ffffff; letter-spacing: -0.5px;">Allel</span>
                </div>
                <h1 style="font-size: 24px; font-weight: 600; color: #ffffff; margin: 0 0 16px 0;">Welcome to the waitlist.</h1>
                <p style="font-size: 15px; line-height: 1.6; color: #aaaaaa; margin: 0 0 24px 0;">
                  Thanks for joining the Allel waitlist. We’re building AI agents that operate across your stack—drafting, acting, and reporting back so you never have to switch tabs again.
                </p>
                <div style="padding: 16px 20px; background-color: #16171a; border-radius: 8px; border-left: 3px solid #3ecf8e; margin-bottom: 24px;">
                  <p style="font-size: 14px; color: #d0d0d0; margin: 0;">
                    We’re onboarding founder-led SaaS teams in batches. We’ll notify you right here as soon as your access spot opens up.
                  </p>
                </div>
                <p style="font-size: 14px; color: #666666; margin: 0;">
                  — The Allel Team<br />
                  <a href="https://allel.co" style="color: #888888; text-decoration: underline;">allel.co</a>
                </p>
              </div>
            `,
          });
          console.log(`[Waitlist API] Confirmation sent to ${email}`);
        } catch (confirmErr) {
          console.error('[Waitlist API] Failed to send subscriber confirmation email:', confirmErr);
        }
      }
    } else {
      console.warn('[Waitlist API] RESEND_API_KEY is missing in .env.local. Emails logged locally.');
    }

    return NextResponse.json(
      {
        success: true,
        status: 'success',
        message: "You're in! 🎉 Check your inbox for confirmation.",
      },
      { status: 200, headers }
    );
  } catch (error: any) {
    console.error('[Waitlist API] Error processing waitlist submission:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Internal server error' },
      { status: 500, headers }
    );
  }
}
