import Link from 'next/link'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Terms of Service — Allel',
  description: 'Terms of Service for Allel (allel.co).',
}

export default function TermsPage() {
  return (
    <main className="min-h-screen w-full bg-[#0b0b0a] text-zinc-300 font-sans selection:bg-zinc-800 selection:text-white">
      {/* Top Header — Clean, sticky, no sign-in badge */}
      <header className="border-b border-white/[0.08] bg-[#0b0b0a]/90 backdrop-blur-md sticky top-0 z-50 px-6 py-4 flex items-center justify-between max-w-5xl mx-auto w-full">
        <Link href="/" className="flex items-center gap-2.5 group hover:opacity-90 transition-opacity">
          <img
            src="/dot.png"
            alt="Allel"
            className="w-[18px] h-[18px] object-contain shrink-0"
          />
          <span className="text-[17px] font-medium tracking-tight text-white">Allel</span>
        </Link>
        <div className="flex items-center gap-5 text-[13px] text-zinc-400 font-medium">
          <Link href="/" className="hover:text-white transition-colors">Home</Link>
          <Link href="/pricing" className="hover:text-white transition-colors">Pricing</Link>
          <Link href="/privacy" className="hover:text-white transition-colors">Privacy Policy</Link>
        </div>
      </header>

      {/* Content Container */}
      <div className="max-w-3xl mx-auto px-6 py-12 md:py-20">
        <div className="mb-10 pb-8 border-b border-white/[0.08]">
          <h1 className="text-3xl md:text-4xl font-semibold tracking-tight text-white">Terms of Service</h1>
          <p className="mt-2 text-xs text-zinc-500 font-mono">
            Last updated: September 5, 2026 • Effective Date: September 5, 2026 • Application: Allel (https://allel.co)
          </p>
        </div>

        <div className="space-y-10 text-[14.5px] leading-relaxed text-zinc-300">
          <section className="space-y-3">
            <h2 className="text-lg font-medium text-white tracking-tight">1. Agreement to Terms</h2>
            <p className="text-zinc-400">
              By accessing or using Allel (&quot;we&quot;, &quot;our&quot;, or &quot;us&quot;), available at{' '}
              <a href="https://allel.co" className="text-zinc-200 underline underline-offset-4 decoration-zinc-700 hover:text-white hover:decoration-zinc-300 transition-colors">
                https://allel.co
              </a>
              , you agree to be bound by these Terms of Service. If you do not agree to all terms and conditions, you must not access or use the service.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-medium text-white tracking-tight">2. Description of Service</h2>
            <p className="text-zinc-400">
              Allel provides autonomous workflow automation, SaaS integration monitoring, churn intelligence, and context-aware draft generation for revenue recovery and customer management. All drafted communications require human approval before dispatch. Allel never dispatches customer communications autonomously without explicit user review.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-medium text-white tracking-tight">3. User Responsibilities & Integrations</h2>
            <p className="text-zinc-400">
              When connecting third-party services (including Google Workspace, Stripe, PostHog, Slack, Intercom, or Linear), you represent and warrant that you possess the necessary permissions to authorize Allel to access those services. You remain responsible for maintaining the security of your account credentials and for reviewing and approving all drafted communications before sending.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-medium text-white tracking-tight">4. Limitation of Liability</h2>
            <p className="text-zinc-400">
              To the maximum extent permitted by applicable law, Allel, its directors, employees, partners, and operators shall not be liable for any indirect, incidental, special, consequential, or punitive damages resulting from your access to or use of, or inability to access or use, the service.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-medium text-white tracking-tight">5. Contact Information</h2>
            <p className="text-zinc-400">
              Questions or concerns regarding these Terms of Service should be directed to our operations team:
            </p>
            <div className="p-4 rounded-lg bg-white/[0.02] border border-white/[0.08] text-xs font-mono space-y-1 text-zinc-400">
              <p className="text-white font-sans font-medium text-sm">Allel Operations</p>
              <p>Primary Support: kushagarasingh175@gmail.com</p>
              <p>Founder Contact: kushagra@allel.co</p>
              <p>Official Website: https://allel.co</p>
            </div>
          </section>
        </div>

        {/* Clean Footer */}
        <div className="mt-16 pt-8 border-t border-white/[0.08] flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-zinc-500">
          <p>© 2026 Allel (allel.co). All rights reserved.</p>
          <div className="flex items-center gap-5">
            <Link href="/privacy" className="hover:text-zinc-300 transition-colors">Privacy Policy</Link>
            <Link href="/pricing" className="hover:text-zinc-300 transition-colors">Pricing</Link>
            <Link href="/" className="hover:text-zinc-300 transition-colors">Home</Link>
          </div>
        </div>
      </div>
    </main>
  )
}
