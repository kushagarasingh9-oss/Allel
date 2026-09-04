'use client'

import { useState } from 'react'
import { OtpInput, type OtpStatus } from '@/ui/primitives/otp-input'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')

  const [otpStatus, setOtpStatus] = useState<OtpStatus>('idle')
  const [otpError, setOtpError] = useState('')
  const [verifying, setVerifying] = useState(false)
  const [resending, setResending] = useState(false)

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      const normalizedEmail = email.trim().toLowerCase()
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: normalizedEmail }),
      })
      const payload = (await response.json().catch(() => null)) as {
        error?: string
      } | null

      if (!response.ok) {
        setError(payload?.error ?? 'Unable to send verification code.')
        return
      }

      setEmail(normalizedEmail)
      setSent(true)
      setOtpStatus('idle')
      setOtpError('')
    } catch {
      setError('Unable to reach the auth service. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const handleVerifyOtp = async (code: string) => {
    setVerifying(true)
    setOtpStatus('checking')
    setOtpError('')

    try {
      const response = await fetch('/api/auth/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, token: code }),
      })

      const payload = (await response.json().catch(() => null)) as {
        error?: string
      } | null

      if (!response.ok) {
        setOtpStatus('error')
        setOtpError(payload?.error || 'Invalid or expired code. Fix the digit that slipped.')
        return
      }

      setOtpStatus('success')
      // Redirect straight to dashboard
      window.location.href = '/dashboard'
    } catch {
      setOtpStatus('error')
      setOtpError('Verification failed. Please try again.')
    } finally {
      setVerifying(false)
    }
  }

  const handleResend = async () => {
    if (resending || verifying) return
    setResending(true)
    setOtpError('')
    setOtpStatus('idle')

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      if (!response.ok) {
        setOtpError('Failed to resend code. Please try again.')
        setOtpStatus('error')
      }
    } catch {
      setOtpError('Failed to resend code. Please check your connection.')
      setOtpStatus('error')
    } finally {
      setResending(false)
    }
  }

  return (
    <main className="min-h-screen w-full bg-[#0e0e0e] flex items-center justify-center px-4">
      <div className="w-full max-w-[420px]">

        {/* Logo */}
        <div className="mb-10 text-center">
          <span
            className="text-[28px] font-semibold text-white tracking-tight"
          >
            Allel
          </span>
          <p className="mt-2 text-[14px] text-[#555]">
            Connect your tools. AI agents automate the work.
          </p>
        </div>

        {sent ? (
          <div className="border border-[#ffffff12] bg-[#111] p-8 text-center flex flex-col items-center">
            <h2 className="mb-1.5 text-[20px] font-medium text-white tracking-tight">
              Enter OTP
            </h2>
            <p className="text-[13.5px] leading-relaxed text-[#777] max-w-[340px] mb-6">
              Enter the 6-digit code sent to <span className="text-white font-medium">{email}</span>
            </p>

            <OtpInput
              length={6}
              autoFocus
              disabled={verifying}
              status={otpStatus}
              errorMessage={otpError}
              hint=""
              onChange={() => {
                if (otpStatus === 'error') {
                  setOtpStatus('idle')
                  setOtpError('')
                }
              }}
              onComplete={handleVerifyOtp}
            />

            {verifying && (
              <p className="mt-3 text-[12.5px] text-blue-400 animate-pulse">
                Verifying code...
              </p>
            )}

            <div className="mt-7 flex items-center justify-center gap-4 text-[12.5px]">
              <button
                type="button"
                disabled={resending || verifying}
                onClick={handleResend}
                className="text-[#666] hover:text-white transition-colors disabled:opacity-50"
              >
                {resending ? 'Sending...' : 'Resend code'}
              </button>
              <span className="text-[#333]">•</span>
              <button
                type="button"
                onClick={() => {
                  setSent(false)
                  setOtpStatus('idle')
                  setOtpError('')
                }}
                className="text-[#666] hover:text-white transition-colors"
              >
                Use a different email
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleLogin} className="border border-[#ffffff12] bg-[#111] p-8">
            <h1 className="mb-1 text-[20px] font-medium text-white">
              Sign in
            </h1>
            <p className="mb-6 text-[14px] text-[#555]">
              Enter your email to receive a verification code
            </p>

            <div className="mb-4">
              <label className="mb-2 block text-[12px] font-medium uppercase tracking-widest text-[#444]">
                Email
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
                className="w-full border border-[#ffffff12] bg-[#0a0a0a] px-4 py-3 text-[14px] text-white placeholder-[#333] outline-none focus:border-[#ffffff30] transition-colors"
              />
            </div>

            {error && (
              <p className="mb-4 text-[13px] text-red-400">{error}</p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="group relative mt-2 flex h-[46px] w-full items-center justify-between overflow-hidden bg-[#111] pl-5 pr-[48px] ring-1 ring-[#ffffff20] disabled:opacity-50"
            >
              <div className="absolute right-[4px] top-[4px] z-0 h-[38px] w-[38px] bg-white transition-all duration-[400ms] ease-[cubic-bezier(0.23,1,0.32,1)] group-hover:right-0 group-hover:top-0 group-hover:h-full group-hover:w-full" />
              <span className="relative z-10 text-[14px] font-medium text-white transition-colors duration-[400ms] group-hover:text-black">
                {loading ? 'Sending code...' : 'Continue with email'}
              </span>
              <div className="pointer-events-none absolute right-[4px] top-[4px] z-10 flex h-[38px] w-[38px] items-center justify-center">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="black" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="transition-transform duration-[400ms] ease-[cubic-bezier(0.23,1,0.32,1)] group-hover:translate-x-1">
                  <path d="M5 12h14" />
                  <path d="m12 5 7 7-7 7" />
                </svg>
              </div>
            </button>
          </form>
        )}

        <p className="mt-6 text-center text-[12px] text-[#333]">
          By signing in, you agree to our terms of service.
        </p>
      </div>
    </main>
  )
}
