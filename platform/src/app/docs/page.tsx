import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Documentation — Allel",
  description: "Technical architecture, integrations, and operational guide for Allel (allel.co).",
};

export default function DocsPage() {
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
          <Link href="/about" className="hover:text-white transition-colors">About</Link>
          <Link href="/privacy" className="hover:text-white transition-colors">Privacy</Link>
        </div>
      </header>

      {/* Content Container */}
      <div className="max-w-3xl mx-auto px-6 py-12 md:py-20">
        <div className="mb-10 pb-8 border-b border-white/[0.08]">
          <h1 className="text-3xl md:text-4xl font-semibold tracking-tight text-white">Documentation</h1>
          <p className="mt-2 text-xs text-zinc-500 font-mono">
            Version 1.0 • Last updated: September 5, 2026 • Platform: Allel (https://allel.co)
          </p>
        </div>

        <div className="space-y-12 text-[14.5px] leading-relaxed text-zinc-300">
          {/* Section 1 */}
          <section className="space-y-3">
            <h2 className="text-lg font-medium text-white tracking-tight">1. What is Allel?</h2>
            <p className="text-zinc-400">
              Allel is an AI-powered autonomous operations platform designed specifically for SaaS founders and customer-facing teams. It integrates with your core billing, product analytics, and customer communication tools to monitor account health in real-time, surface churn risks, and automate routine operational workflows.
            </p>
            <p className="text-zinc-400">
              Unlike fully unattended automation systems, Allel utilizes a strict <strong className="text-zinc-200">Human-in-the-Loop</strong> architecture: agents can detect events and compose context-aware drafts, but actions that affect customers require explicit confirmation from a human operator.
            </p>
          </section>

          {/* Section 2 */}
          <section className="space-y-3">
            <h2 className="text-lg font-medium text-white tracking-tight">2. Core Architecture</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
              <div className="p-4 rounded-lg bg-white/[0.02] border border-white/[0.08] space-y-2">
                <h3 className="text-sm font-medium text-white">Event Engine</h3>
                <p className="text-xs text-zinc-400 leading-relaxed">
                  Real-time webhook ingestion across Stripe, PostHog, Intercom, and Google Calendar to identify payment failures, usage drops, and customer meetings.
                </p>
              </div>
              <div className="p-4 rounded-lg bg-white/[0.02] border border-white/[0.08] space-y-2">
                <h3 className="text-sm font-medium text-white">Risk Intelligence</h3>
                <p className="text-xs text-zinc-400 leading-relaxed">
                  Predictive churn and billing analysis correlating sudden activity decreases with invoice schedules to flag accounts needing immediate attention.
                </p>
              </div>
              <div className="p-4 rounded-lg bg-white/[0.02] border border-white/[0.08] space-y-2">
                <h3 className="text-sm font-medium text-white">Draft Generation</h3>
                <p className="text-xs text-zinc-400 leading-relaxed">
                  Autonomous context preparation that crafts personalized recovery emails directly inside your Gmail drafts folder without ever sending them automatically.
                </p>
              </div>
              <div className="p-4 rounded-lg bg-white/[0.02] border border-white/[0.08] space-y-2">
                <h3 className="text-sm font-medium text-white">Executive Daily Brief</h3>
                <p className="text-xs text-zinc-400 leading-relaxed">
                  A high-signal morning executive summary consolidating upcoming meetings, at-risk revenue, and high-priority action items into a 2-minute read.
                </p>
              </div>
            </div>
          </section>

          {/* Section 3 */}
          <section className="space-y-3">
            <h2 className="text-lg font-medium text-white tracking-tight">3. Supported Integrations</h2>
            <p className="text-zinc-400">Allel connects securely via OAuth 2.0 and encrypted API tokens:</p>
            <ul className="list-disc list-inside space-y-2 pl-1 text-zinc-400">
              <li>
                <strong className="text-zinc-200 font-medium">Google Workspace:</strong> Connect Gmail and Google Calendar to draft recovery messages and synchronize daily schedules. Allel strictly adheres to the Google API Limited Use Policy.
              </li>
              <li>
                <strong className="text-zinc-200 font-medium">Stripe:</strong> Ingest customer subscription events, invoice payment failures, past-due statuses, and refund requests.
              </li>
              <li>
                <strong className="text-zinc-200 font-medium">PostHog:</strong> Track user engagement trends, feature adoption drops, and weekly active user anomalies.
              </li>
              <li>
                <strong className="text-zinc-200 font-medium">Slack:</strong> Receive real-time operational notifications and approval prompts directly inside your team\x27s workspace.
              </li>
              <li>
                <strong className="text-zinc-200 font-medium">Intercom & Linear:</strong> Sync customer support conversations and tie bug reports to high-value customer accounts.
              </li>
            </ul>
          </section>

          {/* Section 4 */}
          <section className="space-y-3">
            <h2 className="text-lg font-medium text-white tracking-tight">4. Security & Compliance</h2>
            <p className="text-zinc-400">
              Security is built into every layer of our stack. All OAuth access tokens, webhook secrets, and customer identifiers are encrypted at rest using AES-256 and transmitted exclusively over TLS 1.3.
            </p>
            <p className="text-zinc-400">
              We do not use customer data or Google Workspace user data to train or fine-tune generalized machine learning models. You can revoke integrations or request complete workspace data deletion at any time.
            </p>
          </section>

          {/* Section 5 */}
          <section className="space-y-3">
            <h2 className="text-lg font-medium text-white tracking-tight">5. Getting Started</h2>
            <div className="p-4 rounded-lg bg-white/[0.02] border border-white/[0.08] text-xs font-mono space-y-2 text-zinc-400">
              <p className="text-white font-sans font-medium text-sm">Quick Setup Steps</p>
              <p>1. Sign in to your Allel workspace at <a href="https://allel.co/auth/login" className="text-zinc-200 underline underline-offset-4 decoration-zinc-700 hover:text-white">https://allel.co/auth/login</a></p>
              <p>2. Navigate to Settings &gt; Integrations and connect your Google Workspace and Stripe accounts</p>
              <p>3. Review incoming health signals and approve your first automated recovery draft</p>
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
