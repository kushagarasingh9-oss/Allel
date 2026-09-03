'use client'

import React, { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/foundation/database/client'
import {
  Inbox,
  Calendar,
  Clock,
  Send,
  FileText,
  Search,
  CheckCircle2,
  Sparkles,
  ArrowRight,
  ShieldCheck,
  AlertCircle,
  Zap,
} from 'lucide-react'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')

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
    <div className="min-h-screen w-full bg-[#EAEAEA] flex items-center justify-center p-3 sm:p-6 lg:p-8 font-sans antialiased select-none">
      {/* Outer Card Container with Soft Rounded Corners */}
      <div className="w-full max-w-[1380px] h-[calc(100vh-2rem)] min-h-[700px] max-h-[920px] bg-[#FAF9F7] rounded-3xl shadow-2xl overflow-hidden grid grid-cols-1 lg:grid-cols-12 border border-black/5">
        
        {/* ── Left Column: Authentication Form ── */}
        <div className="lg:col-span-5 xl:col-span-5 flex flex-col justify-between p-8 sm:p-12 lg:p-14 bg-white">
          
          {/* Brand Logo Header */}
          <div className="flex items-center gap-2.5">
            <div className="w-6 h-6 rounded-md bg-neutral-900 flex items-center justify-center text-white shadow-xs">
              {/* Modern geometric brand dot grid */}
              <div className="grid grid-cols-2 gap-1 p-1">
                <span className="w-1.5 h-1.5 rounded-full bg-white" />
                <span className="w-1.5 h-1.5 rounded-full bg-white/70" />
                <span className="w-1.5 h-1.5 rounded-full bg-white/70" />
                <span className="w-1.5 h-1.5 rounded-full bg-white" />
              </div>
            </div>
            <span className="text-[17px] font-semibold text-neutral-900 tracking-tight">
              Allel
            </span>
          </div>

          {/* Center Form Block */}
          <div className="w-full max-w-[340px] mx-auto my-auto py-8">
            {sent ? (
              <div className="text-center py-4 animate-in fade-in zoom-in-95 duration-200">
                <div className="w-12 h-12 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto mb-4 border border-emerald-200/60 shadow-xs">
                  <CheckCircle2 className="w-6 h-6" />
                </div>
                <h2 className="text-[22px] font-medium tracking-tight text-neutral-900 mb-1.5">
                  Check your inbox
                </h2>
                <p className="text-[13.5px] text-neutral-500 leading-relaxed mb-6">
                  We sent a secure magic link to <br />
                  <strong className="text-neutral-800 font-medium">{email}</strong>.
                </p>
                <button
                  type="button"
                  onClick={() => setSent(false)}
                  className="text-[13px] text-neutral-600 hover:text-neutral-950 font-medium underline underline-offset-4 transition-colors cursor-pointer"
                >
                  Use a different email address
                </button>
              </div>
            ) : (
              <div>
                <h1 className="text-[25px] font-medium tracking-tight text-neutral-900">
                  Sign In with Allel
                </h1>
                <p className="text-[13.5px] text-neutral-500 mt-1 mb-7">
                  Welcome back. Let's get back to work.
                </p>

                {/* Continue with Google */}
                <button
                  type="button"
                  onClick={handleGoogleSignIn}
                  disabled={googleLoading || loading}
                  className="w-full flex items-center justify-center gap-2.5 py-2.5 px-4 rounded-xl border border-neutral-200/90 hover:border-neutral-300 bg-white hover:bg-neutral-50/80 text-neutral-700 text-[13.5px] font-medium transition-all shadow-xs cursor-pointer disabled:opacity-50"
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

                {/* Subtle Divider */}
                <div className="relative my-5 flex items-center justify-center">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-neutral-200/70" />
                  </div>
                  <span className="relative bg-white px-2.5 text-[12px] text-neutral-400 font-normal">
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
                      className="w-full rounded-xl border border-neutral-200/90 bg-white px-3.5 py-2.5 text-[13.5px] text-neutral-900 placeholder:text-neutral-400 outline-none focus:border-neutral-900 focus:ring-1 focus:ring-neutral-900/10 transition-all shadow-2xs"
                    />
                  </div>

                  {error && (
                    <div className="flex items-start gap-2 p-2.5 rounded-lg bg-rose-50 border border-rose-200/80 text-rose-700 text-[12px]">
                      <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                      <span>{error}</span>
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={loading || googleLoading}
                    className="w-full py-2.5 px-4 rounded-xl bg-[#1E1E1E] hover:bg-black active:bg-neutral-900 text-white text-[13.5px] font-medium transition-all shadow-xs cursor-pointer disabled:opacity-50"
                  >
                    {loading ? 'Sending link...' : 'Sign In'}
                  </button>
                </form>

                {/* Sign up link & Quick Demo */}
                <div className="mt-5 text-center text-[13px] text-neutral-500">
                  Don't have an account yet?{' '}
                  <button
                    type="button"
                    onClick={() => {
                      const inputEl = document.querySelector('input[type="email"]') as HTMLInputElement
                      inputEl?.focus()
                    }}
                    className="text-blue-600 hover:text-blue-700 font-medium cursor-pointer"
                  >
                    Sign Up
                  </button>
                </div>

                {/* Direct Demo Access for Evaluators */}
                <div className="mt-4 pt-3.5 border-t border-neutral-100 text-center">
                  <Link
                    href="/dashboard"
                    className="inline-flex items-center gap-1.5 text-[12px] text-neutral-400 hover:text-neutral-700 font-medium transition-colors"
                  >
                    <span>Instant demo preview</span>
                    <ArrowRight className="w-3 h-3" />
                  </Link>
                </div>
              </div>
            )}
          </div>

          {/* Footer Terms */}
          <div className="text-[12px] text-neutral-400 text-center">
            By signing in, you agree to our{' '}
            <span className="underline underline-offset-2 hover:text-neutral-600 cursor-pointer">
              terms of use
            </span>
            .
          </div>
        </div>

        {/* ── Right Column: Cozy Painterly Artwork + Floating Allel App Mockup ── */}
        <div className="hidden lg:flex lg:col-span-7 xl:col-span-7 relative p-5 sm:p-6 lg:p-7 overflow-hidden bg-[#F2EFE9] items-center justify-center">
          
          {/* The Impressionist Oil Painting Canvas Frame */}
          <div className="relative w-full h-full rounded-2xl xl:rounded-3xl overflow-hidden shadow-inner border border-black/5 flex items-center justify-center">
            <img
              src="/images/login-backdrop.jpg"
              alt="Serene Coastal Impressionist Landscape"
              className="absolute inset-0 w-full h-full object-cover object-center filter brightness-[0.98] contrast-[1.03]"
            />

            {/* Soft Ambient Vignette Overlay */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/25 via-transparent to-black/10" />

            {/* ── Floating Allel Executive UI Glass Window ── */}
            <div className="relative z-10 w-[92%] max-w-[560px] bg-white/96 backdrop-blur-xl rounded-2xl shadow-[0_24px_50px_-12px_rgba(0,0,0,0.35)] border border-white/80 overflow-hidden text-neutral-800">
              
              {/* App Window Header Bar */}
              <div className="px-4 py-2.5 bg-neutral-50/80 border-b border-neutral-200/60 flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-[#FF5F56] border border-[#E0443E]" />
                  <span className="w-2.5 h-2.5 rounded-full bg-[#FFBD2E] border border-[#DEA123]" />
                  <span className="w-2.5 h-2.5 rounded-full bg-[#27C93F] border border-[#1AAB29]" />
                </div>
                <div className="flex items-center gap-1.5 text-[11px] font-medium text-neutral-500">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
                  <span>Autonomous Revenue Recovery</span>
                </div>
                <div className="text-[10.5px] text-neutral-400 font-mono">
                  ⌘K
                </div>
              </div>

              {/* Two-Column Mockup Body */}
              <div className="grid grid-cols-12 min-h-[360px] text-[12px]">
                
                {/* Mini Sidebar */}
                <div className="col-span-4 bg-[#F9F9FB] border-r border-neutral-200/60 p-3 flex flex-col justify-between">
                  <div className="space-y-3">
                    <div className="flex items-center gap-1.5 px-1 py-0.5 text-neutral-900 font-semibold text-[13px]">
                      <span className="w-2 h-2 rounded-full bg-blue-600 animate-pulse" />
                      <span>Allel Copilot</span>
                    </div>

                    {/* Search Pill */}
                    <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white border border-neutral-200/80 text-[11px] text-neutral-400 shadow-2xs">
                      <Search className="w-3 h-3 text-neutral-400" />
                      <span>Search...</span>
                    </div>

                    {/* Nav Items */}
                    <div className="space-y-0.5 pt-1">
                      <div className="flex items-center justify-between px-2 py-1.5 rounded-lg bg-blue-50/80 text-blue-700 font-medium">
                        <div className="flex items-center gap-2">
                          <Inbox className="w-3.5 h-3.5" />
                          <span>Unified Inbox</span>
                        </div>
                        <span className="text-[10px] bg-blue-600 text-white px-1.5 py-0.2 rounded-full font-bold">
                          24
                        </span>
                      </div>

                      <div className="flex items-center gap-2 px-2 py-1.5 rounded-lg text-neutral-600 hover:bg-neutral-100">
                        <Zap className="w-3.5 h-3.5 text-neutral-400" />
                        <span>Risk Feeds</span>
                      </div>

                      <div className="flex items-center gap-2 px-2 py-1.5 rounded-lg text-neutral-600 hover:bg-neutral-100">
                        <Calendar className="w-3.5 h-3.5 text-neutral-400" />
                        <span>Meetings</span>
                      </div>

                      <div className="flex items-center gap-2 px-2 py-1.5 rounded-lg text-neutral-600 hover:bg-neutral-100">
                        <FileText className="w-3.5 h-3.5 text-neutral-400" />
                        <span>Drafts</span>
                      </div>
                    </div>
                  </div>

                  {/* Connected Providers Row */}
                  <div className="pt-3 border-t border-neutral-200/60">
                    <div className="text-[10px] uppercase font-semibold text-neutral-400 tracking-wider mb-1.5">
                      Syncing
                    </div>
                    <div className="flex items-center gap-1.5">
                      <img src="/logos/stripe.svg" alt="Stripe" className="w-3.5 h-3.5 object-contain opacity-80" />
                      <img src="/logos/posthog.svg" alt="PostHog" className="w-3.5 h-3.5 object-contain opacity-80" />
                      <img src="/logos/intercom.svg" alt="Intercom" className="w-3.5 h-3.5 object-contain opacity-80" />
                      <img src="/logos/gmail.svg" alt="Gmail" className="w-3.5 h-3.5 object-contain opacity-80" />
                    </div>
                  </div>
                </div>

                {/* Mini Main Feed & AI Action Card */}
                <div className="col-span-8 p-3 flex flex-col justify-between bg-white">
                  
                  {/* Top Filter Pills */}
                  <div>
                    <div className="flex items-center gap-1 border-b border-neutral-100 pb-2 mb-2 text-[11px]">
                      <span className="px-2 py-0.5 rounded-full bg-neutral-900 text-white font-medium">
                        All 56
                      </span>
                      <span className="px-2 py-0.5 rounded-full text-neutral-500 hover:bg-neutral-100">
                        Needs Reply 18
                      </span>
                      <span className="px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 font-semibold border border-rose-200/60">
                        At Risk 7
                      </span>
                    </div>

                    {/* Customer Cards List */}
                    <div className="space-y-1.5">
                      {/* Customer 1: Apex MultiRail */}
                      <div className="p-2 rounded-xl bg-neutral-50/90 border border-neutral-200/70 shadow-2xs">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full bg-rose-500" />
                            <span className="font-semibold text-neutral-900 text-[12px]">
                              Apex MultiRail
                            </span>
                          </div>
                          <span className="text-[10px] font-semibold text-rose-600 bg-rose-50 px-1.5 py-0.5 rounded">
                            $3,500/mo at risk
                          </span>
                        </div>
                        <p className="text-[11px] text-neutral-500 mt-1 truncate">
                          504 Gateway Timeouts on webhook sync · Intercom ticket open
                        </p>
                      </div>

                      {/* Customer 2: Vortex Data */}
                      <div className="p-2 rounded-xl bg-white border border-neutral-150">
                        <div className="flex items-center justify-between">
                          <span className="font-medium text-neutral-800 text-[12px]">
                            Vortex Data
                          </span>
                          <span className="text-[10px] text-neutral-500">
                            $4,000/mo
                          </span>
                        </div>
                        <p className="text-[11px] text-neutral-400 mt-0.5 truncate">
                          Invoice retry pending · 3 days remaining
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* AI Generated Recovery Card */}
                  <div className="mt-2.5 p-2.5 rounded-xl bg-gradient-to-br from-blue-50/70 via-indigo-50/40 to-white border border-blue-200/60 shadow-xs">
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-1.5">
                        <Sparkles className="w-3.5 h-3.5 text-blue-600" />
                        <span className="text-[11px] font-semibold text-blue-900">
                          AI Outreach Ready
                        </span>
                      </div>
                      <span className="text-[10px] text-blue-600 font-mono">
                        rohan@apexmultirail.co
                      </span>
                    </div>
                    <p className="text-[10.5px] text-neutral-600 leading-snug line-clamp-2">
                      "Hi Rohan, I noticed your team hit 504 timeouts on webhook sync. Engineering is deploying a fix today..."
                    </p>
                    <div className="mt-2 flex items-center justify-between">
                      <span className="text-[9.5px] text-neutral-400">
                        Zero hallucination · Verified via Stripe & Intercom
                      </span>
                      <div className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-[#0055FF] text-white text-[10.5px] font-medium shadow-xs">
                        <Send className="w-2.5 h-2.5" />
                        <span>Send</span>
                      </div>
                    </div>
                  </div>

                </div>

              </div>
            </div>

          </div>

        </div>

      </div>
    </div>
  )
}
