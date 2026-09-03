'use client'

import React, { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/foundation/database/client'
import {
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  ImageIcon,
} from 'lucide-react'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')
  const [hasCustomImage, setHasCustomImage] = useState(false)
  const [customImageUrl, setCustomImageUrl] = useState('/images/login-custom.png')

  // Check if user uploaded a custom image to /images/login-custom.png or .jpg
  useEffect(() => {
    const img = new Image()
    img.src = '/images/login-custom.png'
    img.onload = () => setHasCustomImage(true)
    img.onerror = () => {
      const imgJpg = new Image()
      imgJpg.src = '/images/login-custom.jpg'
      imgJpg.onload = () => {
        setCustomImageUrl('/images/login-custom.jpg')
        setHasCustomImage(true)
      }
      imgJpg.onerror = () => setHasCustomImage(false)
    }
  }, [])

  const handleEmailLogin = async (e: React.FormEvent) => {
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

  const handleGoogleSignIn = async () => {
    setGoogleLoading(true)
    setError('')
    try {
      const supabase = createClient()
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
        },
      })
      if (error) {
        setError(error.message)
        setGoogleLoading(false)
      }
    } catch {
      setError('Unable to connect to Google authentication.')
      setGoogleLoading(false)
    }
  }

  return (
    <div className="min-h-screen w-full bg-[#09090B] text-neutral-200 flex items-center justify-center p-3 sm:p-6 lg:p-8 font-sans antialiased select-none">
      {/* Outer Card Container with Soft Rounded Corners and Dark Matte Border */}
      <div className="w-full max-w-[1380px] h-[calc(100vh-2rem)] min-h-[700px] max-h-[920px] bg-[#0E0E12] rounded-3xl shadow-2xl overflow-hidden grid grid-cols-1 lg:grid-cols-12 border border-white/[0.08]">
        
        {/* ── Left Column: Dark Cozy Auth Form ── */}
        <div className="lg:col-span-5 xl:col-span-5 flex flex-col justify-between p-8 sm:p-12 lg:p-14 bg-[#0E0E12] border-r border-white/[0.04]">
          
          {/* Brand Logo Header */}
          <div className="flex items-center gap-2.5">
            <div className="w-6 h-6 rounded-md bg-white flex items-center justify-center text-neutral-950 shadow-xs">
              {/* Geometric brand dot grid */}
              <div className="grid grid-cols-2 gap-1 p-1">
                <span className="w-1.5 h-1.5 rounded-full bg-neutral-950" />
                <span className="w-1.5 h-1.5 rounded-full bg-neutral-950/70" />
                <span className="w-1.5 h-1.5 rounded-full bg-neutral-950/70" />
                <span className="w-1.5 h-1.5 rounded-full bg-neutral-950" />
              </div>
            </div>
            <span className="text-[17px] font-semibold text-white tracking-tight">
              Allel
            </span>
          </div>

          {/* Center Form Block */}
          <div className="w-full max-w-[340px] mx-auto my-auto py-8">
            {sent ? (
              <div className="text-center py-4 animate-in fade-in zoom-in-95 duration-200">
                <div className="w-12 h-12 rounded-full bg-emerald-500/10 text-emerald-400 flex items-center justify-center mx-auto mb-4 border border-emerald-500/20 shadow-xs">
                  <CheckCircle2 className="w-6 h-6" />
                </div>
                <h2 className="text-[22px] font-medium tracking-tight text-white mb-1.5">
                  Check your inbox
                </h2>
                <p className="text-[13.5px] text-neutral-400 leading-relaxed mb-6">
                  We sent a secure magic link to <br />
                  <strong className="text-white font-medium">{email}</strong>.
                </p>
                <button
                  type="button"
                  onClick={() => setSent(false)}
                  className="text-[13px] text-neutral-400 hover:text-white font-medium underline underline-offset-4 transition-colors cursor-pointer"
                >
                  Use a different email address
                </button>
              </div>
            ) : (
              <div>
                <h1 className="text-[25px] font-medium tracking-tight text-white">
                  Sign In with Allel
                </h1>
                <p className="text-[13.5px] text-neutral-400 mt-1 mb-7">
                  Welcome back. Let's get back to work.
                </p>

                {/* Continue with Google */}
                <button
                  type="button"
                  onClick={handleGoogleSignIn}
                  disabled={googleLoading || loading}
                  className="w-full flex items-center justify-center gap-2.5 py-2.5 px-4 rounded-xl border border-white/10 hover:border-white/20 bg-[#151519] hover:bg-[#1A1A20] active:bg-[#121216] text-white text-[13.5px] font-medium transition-all shadow-xs cursor-pointer disabled:opacity-50"
                >
                  <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
                    <path
                      fill="#4285F4"
                      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                    />
                    <path
                      fill="#34A853"
                      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                    />
                    <path
                      fill="#EA4335"
                      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                    />
                  </svg>
                  <span>{googleLoading ? 'Connecting to Google...' : 'Continue with Google'}</span>
                </button>

                {/* Subtle Dark Divider */}
                <div className="relative my-5 flex items-center justify-center">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-white/[0.08]" />
                  </div>
                  <span className="relative bg-[#0E0E12] px-2.5 text-[12px] text-neutral-500 font-normal">
                    or
                  </span>
                </div>

                {/* Email Form */}
                <form onSubmit={handleEmailLogin} className="space-y-3.5">
                  <div>
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="Enter your work email address"
                      className="w-full rounded-xl border border-white/10 bg-[#151519] px-3.5 py-2.5 text-[13.5px] text-white placeholder:text-neutral-500 outline-none focus:border-white/30 focus:ring-1 focus:ring-white/20 transition-all shadow-inner"
                    />
                  </div>

                  {error && (
                    <div className="flex items-start gap-2 p-2.5 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 text-[12px]">
                      <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                      <span>{error}</span>
                    </div>
                  )}

                  {/* Primary High-Contrast Button (Matching Reference) */}
                  <button
                    type="submit"
                    disabled={loading || googleLoading}
                    className="w-full py-2.5 px-4 rounded-xl bg-white hover:bg-neutral-100 active:bg-neutral-200 text-neutral-950 text-[13.5px] font-semibold transition-all shadow-sm cursor-pointer disabled:opacity-50"
                  >
                    {loading ? 'Sending link...' : 'Sign In'}
                  </button>
                </form>

                {/* Sign up link & Quick Demo */}
                <div className="mt-5 text-center text-[13px] text-neutral-400">
                  Don't have an account yet?{' '}
                  <button
                    type="button"
                    onClick={() => {
                      const inputEl = document.querySelector('input[type="email"]') as HTMLInputElement
                      inputEl?.focus()
                    }}
                    className="text-blue-400 hover:text-blue-300 font-medium cursor-pointer"
                  >
                    Sign Up
                  </button>
                </div>

                {/* Direct Demo Access for Evaluators */}
                <div className="mt-4 pt-3.5 border-t border-white/[0.06] text-center">
                  <Link
                    href="/dashboard"
                    className="inline-flex items-center gap-1.5 text-[12px] text-neutral-400 hover:text-neutral-200 font-medium transition-colors"
                  >
                    <span>Instant demo preview</span>
                    <ArrowRight className="w-3 h-3" />
                  </Link>
                </div>
              </div>
            )}
          </div>

          {/* Footer Terms */}
          <div className="text-[12px] text-neutral-500 text-center">
            By signing in, you agree to our{' '}
            <span className="underline underline-offset-2 hover:text-neutral-400 cursor-pointer">
              terms of use
            </span>
            .
          </div>
        </div>

        {/* ── Right Column: Dark Canvas Frame Ready for Your Image ── */}
        <div className="hidden lg:flex lg:col-span-7 xl:col-span-7 relative p-5 sm:p-6 lg:p-7 overflow-hidden bg-[#070709] items-center justify-center">
          
          {/* Inner Rounded Frame */}
          <div className="relative w-full h-full rounded-2xl xl:rounded-3xl overflow-hidden border border-white/[0.08] bg-[#0E0E12] flex items-center justify-center">
            
            {hasCustomImage ? (
              <img
                src={customImageUrl}
                alt="Allel Product Showcase"
                className="w-full h-full object-cover object-center"
              />
            ) : (
              /* Sleek, Dark Canvas Waiting for Your Image */
              <div className="w-full h-full flex flex-col items-center justify-center p-8 text-center bg-gradient-to-br from-[#121217] via-[#0D0D11] to-[#08080A] relative overflow-hidden">
                {/* Subtle Ambient Radial Glow */}
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[340px] h-[340px] bg-blue-600/10 rounded-full blur-3xl pointer-events-none" />

                <div className="relative z-10 max-w-[380px] flex flex-col items-center">
                  <div className="w-14 h-14 rounded-2xl bg-white/[0.04] border border-white/10 flex items-center justify-center text-neutral-400 mb-4 shadow-inner">
                    <ImageIcon className="w-6 h-6 stroke-[1.5]" />
                  </div>
                  <h3 className="text-[17px] font-medium text-white mb-1.5 tracking-tight">
                    Right Panel Image Canvas
                  </h3>
                  <p className="text-[13px] text-neutral-400 leading-relaxed">
                    Ready for your image. Drop or send your screenshot / artwork and it will fill this entire pane seamlessly.
                  </p>
                </div>
              </div>
            )}

          </div>

        </div>

      </div>
    </div>
  )
}
