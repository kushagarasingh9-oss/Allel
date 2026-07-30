'use client'

import { useState } from 'react'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')

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
        setError(payload?.error ?? 'Unable to send magic link.')
        return
      }

      setEmail(normalizedEmail)
      setSent(true)
    } catch {
      setError('Unable to reach the auth service. Please try again.')
    } finally {
      setLoading(false)
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
            Cofounder
          </span>
          <p className="mt-2 text-[14px] text-[#555]">
            The AI Agent for Customer Operations
          </p>
        </div>

        {sent ? (
          <div className="border border-[#ffffff12] bg-[#111] p-8 text-center">
            <div className="mb-4 text-[32px]">✉️</div>
            <h2 className="mb-2 text-[18px] font-medium text-white">
              Check your inbox
            </h2>
            <p className="text-[14px] leading-relaxed text-[#666]">
              We sent a magic link to <span className="text-white">{email}</span>.
              Click the link to sign in.
            </p>
            <button
              onClick={() => setSent(false)}
              className="mt-6 text-[13px] text-[#555] underline underline-offset-4 hover:text-white transition-colors"
            >
              Use a different email
            </button>
          </div>
        ) : (
          <form onSubmit={handleLogin} className="border border-[#ffffff12] bg-[#111] p-8">
            <h1 className="mb-1 text-[20px] font-medium text-white">
              Sign in
            </h1>
            <p className="mb-6 text-[14px] text-[#555]">
              Enter your email to receive a magic link
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
                {loading ? 'Sending...' : 'Send magic link'}
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
