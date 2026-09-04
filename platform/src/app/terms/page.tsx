import Link from 'next/link'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Terms of Service — Allel',
  description: 'Terms of Service for Allel (allel.co).',
}

export default function TermsPage() {
  return (
    <main className="min-h-screen w-full bg-[#0b0b0a] text-zinc-300 font-sans selection:bg-zinc-800 selection:text-white">
      {/* Top Navigation */}
      <header className="border-b border-white/[0.08] bg-[#0b0b0a]/90 backdrop-blur-md sticky top-0 z-50 px-6 py-4 flex items-center justify-between max-w-5xl mx-auto w-full">
        <Link href="/" className="flex items-center gap-2.5 group hover:opacity-90 transition-opacity">
          <img
            src="/dot.png"
            alt="Allel"
            className="w-[18px] h-[18px] object-contain shrink-0"
          />
          <span className="text-lg font-bold text-white tracking-tight">Allel</span>
        </Link>
        <div className="flex items-center gap-4 text-xs text-zinc-400">
          <Link href="/" className="hover:text-white transition-colors">Home</Link>
          <Link href="/privacy" className="hover:text-white transition-colors">Privacy Policy</Link>
          <Link href="/auth/login" className="px-3 py-1.5 rounded-md bg-white/10 hover:bg-white/15 text-white font-medium transition-colors">Sign In</Link>
        </div>
      </header>

      {/* Content Container */}
      <div className="max-w-4xl mx-auto px-6 py-12 md:py-16">
        <div className="mb-10 pb-8 border-b border-white/[0.08]">
          <h1 className="text-3xl md:text-4xl font-bold text-white tracking-tight">Terms of Service</h1>
          <p className="mt-2 text-sm text-zinc-400">
            Last updated: September 5, 2026 • Application: Allel (https://allel.co)
          </p>
        </div>

        <div className="space-y-8 text-sm leading-relaxed text-zinc-300">
          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-white tracking-tight">1. Agreement to Terms</h2>
            <p>
              By accessing or using Allel (<a href="https://allel.co" className="text-blue-400 hover:underline">https://allel.co</a>), you agree to be bound by these Terms of Service. If you do not agree, you may not use our services.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-white tracking-tight">2. Description of Service</h2>
            <p>
              Allel provides autonomous workflow automation, SaaS integration monitoring, and draft generation for revenue recovery and customer management. All drafted communications require human approval before dispatch.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-white tracking-tight">3. User Responsibilities & Integrations</h2>
            <p>
              When connecting third-party services (such as Google, Stripe, or PostHog), you represent that you have the requisite authority to grant Allel access to those accounts. You are responsible for reviewing and approving all drafted communications before sending.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-white tracking-tight">4. Limitation of Liability</h2>
            <p>
              To the maximum extent permitted by law, Allel and its operators shall not be liable for any indirect, incidental, special, consequential, or punitive damages resulting from your use of the service.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-white tracking-tight">5. Contact Information</h2>
            <p>
              Questions regarding these Terms should be sent to{' '}
              <a href="mailto:kushagarasingh175@gmail.com" className="text-blue-400 hover:underline font-mono">kushagarasingh175@gmail.com</a> or{' '}
              <a href="mailto:kushagra@allel.co" className="text-blue-400 hover:underline font-mono">kushagra@allel.co</a>.
            </p>
          </section>
        </div>

        <div className="mt-16 pt-8 border-t border-white/[0.08] flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-zinc-500">
          <p>© 2026 Allel (allel.co). All rights reserved.</p>
          <div className="flex items-center gap-4">
            <Link href="/privacy" className="hover:text-zinc-300 transition-colors">Privacy Policy</Link>
            <Link href="/" className="hover:text-zinc-300 transition-colors">Home</Link>
          </div>
        </div>
      </div>
    </main>
  )
}
