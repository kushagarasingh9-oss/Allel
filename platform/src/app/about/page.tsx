import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "About — Allel",
  description: "Our mission, philosophy, and approach to autonomous AI operations for modern software companies.",
};

export default function AboutPage() {
  return (
    <main className="min-h-screen w-full bg-[#0b0b0a] text-zinc-300 font-sans selection:bg-zinc-800 selection:text-white">
      {/* Top Header — Clean, sticky, consistent */}
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
          <Link href="/docs" className="hover:text-white transition-colors">Docs</Link>
          <Link href="/privacy" className="hover:text-white transition-colors">Privacy</Link>
        </div>
      </header>

      {/* Content Container */}
      <div className="max-w-3xl mx-auto px-6 py-12 md:py-20">
        <div className="mb-10 pb-8 border-b border-white/[0.08]">
          <h1 className="text-3xl md:text-4xl font-semibold tracking-tight text-white">About Allel</h1>
          <p className="mt-2 text-xs text-zinc-500 font-mono">
            Empowering founders with intelligent, human-supervised autonomous operations.
          </p>
        </div>

        <div className="space-y-12 text-[14.5px] leading-relaxed text-zinc-300">
          {/* Section 1 */}
          <section className="space-y-3">
            <h2 className="text-lg font-medium text-white tracking-tight">Our Mission</h2>
            <p className="text-zinc-400">
              Founders and early-stage startup operators spend countless hours every week manually tracking failed Stripe payments, cross-referencing customer drop-offs in product analytics, checking calendars, and typing out routine recovery follow-ups.
            </p>
            <p className="text-zinc-400">
              Allel was built to eliminate this operational friction. By connecting directly to your tools, our agents continuously observe key business signals, detect churn risks before they happen, and generate high-context drafts ready for your instant one-click approval.
            </p>
          </section>

          {/* Section 2 */}
          <section className="space-y-3">
            <h2 className="text-lg font-medium text-white tracking-tight">The Human-in-the-Loop Philosophy</h2>
            <p className="text-zinc-400">
              We strongly believe that full autopilot in customer communication is a mistake. No algorithm knows your customer nuance, strategic relationship context, or brand voice better than you do.
            </p>
            <p className="text-zinc-400">
              That&apos;s why Allel operates under a strict <strong className="text-zinc-200">co-pilot model</strong>. The agent does 95% of the heavy lifting—investigating Stripe decline codes, checking user login frequency, finding recent email history, drafting the response—and places it in your queue. You review, refine if necessary, and approve.
            </p>
          </section>

          {/* Section 3 */}
          <section className="space-y-3">
            <h2 className="text-lg font-medium text-white tracking-tight">Privacy &amp; Data Sovereignty</h2>
            <p className="text-zinc-400">
              Your business and customer data belongs solely to you. We strictly enforce:
            </p>
            <ul className="list-disc list-inside space-y-1.5 pl-1 text-zinc-400">
              <li>Zero training or fine-tuning of generalized AI/ML models on your Google Workspace or customer data.</li>
              <li>AES-256 encryption at rest and TLS 1.3 encryption in transit for all credentials and tokens.</li>
              <li>Full adherence to the Google API Services User Data Policy, including Limited Use requirements.</li>
              <li>Instant revocation of integrations and 30-day data purging upon workspace termination.</li>
            </ul>
          </section>

          {/* Section 4 */}
          <section className="space-y-3">
            <h2 className="text-lg font-medium text-white tracking-tight">Contact &amp; Connect</h2>
            <p className="text-zinc-400">
              We love chatting with founders, engineering leads, and teams building on modern SaaS stacks.
            </p>
            <div className="p-4 rounded-lg bg-white/[0.02] border border-white/[0.08] text-xs font-mono space-y-2 text-zinc-400">
              <p className="text-white font-sans font-medium text-sm">Allel Team</p>
              <p>Email: <a href="mailto:kushagra@allel.co" className="text-zinc-200 underline underline-offset-4 decoration-zinc-700 hover:text-white">kushagra@allel.co</a> / <a href="mailto:kushagarasingh175@gmail.com" className="text-zinc-200 underline underline-offset-4 decoration-zinc-700 hover:text-white">kushagarasingh175@gmail.com</a></p>
              <p>Twitter / X: <a href="https://x.com/kushagara12" target="_blank" rel="noopener noreferrer" className="text-zinc-200 underline underline-offset-4 decoration-zinc-700 hover:text-white">@kushagara12</a></p>
              <p>GitHub: <a href="https://github.com/kushagara175" target="_blank" rel="noopener noreferrer" className="text-zinc-200 underline underline-offset-4 decoration-zinc-700 hover:text-white">@kushagara175</a></p>
            </div>
          </section>
        </div>

        {/* Clean Footer */}
        <div className="mt-16 pt-8 border-t border-white/[0.08] flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-zinc-500">
          <p>© 2026 Allel (allel.co). All rights reserved.</p>
          <div className="flex items-center gap-5">
            <Link href="/privacy" className="hover:text-zinc-300 transition-colors">Privacy Policy</Link>
            <Link href="/terms" className="hover:text-zinc-300 transition-colors">Terms of Service</Link>
            <Link href="/pricing" className="hover:text-zinc-300 transition-colors">Pricing</Link>
            <Link href="/" className="hover:text-zinc-300 transition-colors">Home</Link>
          </div>
        </div>
      </div>
    </main>
  );
}
