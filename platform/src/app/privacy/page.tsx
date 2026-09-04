import Link from 'next/link'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Privacy Policy — Allel',
  description: 'Privacy Policy and Google API Services User Data Policy Disclosure for Allel (allel.co).',
}

export default function PrivacyPolicyPage() {
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
          <Link href="/terms" className="hover:text-white transition-colors">Terms</Link>
        </div>
      </header>

      {/* Content Container */}
      <div className="max-w-3xl mx-auto px-6 py-12 md:py-20">
        <div className="mb-10 pb-8 border-b border-white/[0.08]">
          <h1 className="text-3xl md:text-4xl font-semibold tracking-tight text-white">Privacy Policy</h1>
          <p className="mt-2 text-xs text-zinc-500 font-mono">
            Last updated: September 5, 2026 • Effective Date: September 5, 2026 • Application: Allel (https://allel.co)
          </p>
        </div>

        <div className="space-y-10 text-[14.5px] leading-relaxed text-zinc-300">
          {/* Section 1 */}
          <section className="space-y-3">
            <h2 className="text-lg font-medium text-white tracking-tight">1. Overview & Introduction</h2>
            <p className="text-zinc-400">
              Allel (&quot;we&quot;, &quot;our&quot;, or &quot;us&quot;), accessible via{' '}
              <a href="https://allel.co" className="text-zinc-200 underline underline-offset-4 decoration-zinc-700 hover:text-white hover:decoration-zinc-300 transition-colors">
                https://allel.co
              </a>
              , provides AI-assisted revenue recovery, account workflow automation, and unified daily operations for founders and customer teams.
            </p>
            <p className="text-zinc-400">
              We are committed to protecting your personal information and your right to privacy. This Privacy Policy outlines what information we collect, how it is used, how it is safeguarded, and how you retain full control over your data, with specific details on our handling of Google user data.
            </p>
            <p className="text-zinc-400">
              If you have any questions or concerns regarding our practices, please reach out to us at{' '}
              <a href="mailto:kushagarasingh175@gmail.com" className="text-zinc-200 underline underline-offset-4 decoration-zinc-700 hover:text-white hover:decoration-zinc-300 transition-colors font-mono text-[13px]">
                kushagarasingh175@gmail.com
              </a>{' '}
              or{' '}
              <a href="mailto:kushagra@allel.co" className="text-zinc-200 underline underline-offset-4 decoration-zinc-700 hover:text-white hover:decoration-zinc-300 transition-colors font-mono text-[13px]">
                kushagra@allel.co
              </a>.
            </p>
          </section>

          {/* Section 2 */}
          <section className="space-y-3">
            <h2 className="text-lg font-medium text-white tracking-tight">2. Information We Collect</h2>
            <p className="text-zinc-400">We collect information you explicitly provide and data from third-party services you authorize:</p>
            <ul className="list-disc list-inside space-y-2 pl-1 text-zinc-400">
              <li>
                <strong className="text-zinc-200 font-medium">Account Information:</strong> Name, work email address, and authentication tokens when creating an account or logging in.
              </li>
              <li>
                <strong className="text-zinc-200 font-medium">Google User Data (Google OAuth):</strong> When you connect your Google account to Allel, we request authorization to access:
                <ul className="list-circle list-inside pl-5 mt-1.5 space-y-1.5 text-zinc-400">
                  <li>Basic profile information (email address and name) to authenticate and identify your workspace.</li>
                  <li>Gmail messages and thread metadata (via read and draft permissions) to inspect customer billing inquiries, identify churn risks, and draft follow-up outreach for your explicit manual review.</li>
                  <li>Google Calendar event metadata (via read-only permission) to compile your daily founder executive brief.</li>
                </ul>
              </li>
              <li>
                <strong className="text-zinc-200 font-medium">SaaS Stack Integrations:</strong> Authorized API keys and webhook events from Stripe, PostHog, Intercom, Slack, Linear, and HubSpot to detect payment anomalies and customer engagement trends.
              </li>
            </ul>
          </section>

          {/* Section 3 — Critical Google Limited Use Policy */}
          <section className="space-y-4 p-6 rounded-lg bg-white/[0.02] border border-white/[0.08]">
            <h2 className="text-base font-medium text-white tracking-tight">
              3. Google API Services User Data Policy (Limited Use Disclosure)
            </h2>
            <p className="text-zinc-200 text-sm leading-relaxed">
              Allel&apos;s use and transfer of information received from Google APIs to any other app will adhere to the{' '}
              <a
                href="https://developers.google.com/terms/api-services-user-data-policy#additional_requirements_for_specific_api_scopes"
                target="_blank"
                rel="noopener noreferrer"
                className="text-white underline underline-offset-4 decoration-zinc-600 hover:decoration-white transition-colors font-medium"
              >
                Google API Services User Data Policy
              </a>
              , including the Limited Use requirements.
            </p>
            <div className="space-y-2 text-xs text-zinc-400 pt-1">
              <p>Specifically, in accordance with Google Limited Use specifications:</p>
              <ul className="list-disc list-inside space-y-1.5 pl-1">
                <li>
                  <strong className="text-zinc-300 font-medium">No AI/ML Model Training:</strong> We do <em>NOT</em> use Google Workspace user data (including Gmail messages, email content, or Calendar entries) to develop, train, fine-tune, or improve generalized artificial intelligence (AI) and/or machine learning (ML) models.
                </li>
                <li>
                  <strong className="text-zinc-300 font-medium">No Sale of User Data:</strong> We do <em>NOT</em> sell, rent, lease, or monetize Google user data to any third party, data broker, or advertisement network.
                </li>
                <li>
                  <strong className="text-zinc-300 font-medium">No Advertising:</strong> Google user data is never used for serving advertisements, retargeting, or interest-based advertising.
                </li>
                <li>
                  <strong className="text-zinc-300 font-medium">Human Access Restrictions:</strong> Humans are not allowed to read Google user data unless you provide explicit consent for specific troubleshooting, it is strictly necessary for security purposes (such as investigating abuse), or required by applicable law.
                </li>
              </ul>
            </div>
          </section>

          {/* Section 4 */}
          <section className="space-y-3">
            <h2 className="text-lg font-medium text-white tracking-tight">4. How We Use Your Information</h2>
            <p className="text-zinc-400">We use collected data solely to deliver the specific features you request:</p>
            <ul className="list-disc list-inside space-y-1.5 pl-1 text-zinc-400">
              <li>Identifying failed customer invoices, subscription cancellations, or churn risks across Stripe and PostHog.</li>
              <li>Drafting context-aware customer recovery emails inside your Gmail drafts folder. <strong className="text-zinc-200">Note: Allel never dispatches emails autonomously without your manual review and approval in the founder dashboard.</strong></li>
              <li>Aggregating relevant meetings and priorities into your daily brief summary.</li>
              <li>Maintaining authenticated sessions and preventing unauthorized access.</li>
            </ul>
          </section>

          {/* Section 5 */}
          <section className="space-y-3">
            <h2 className="text-lg font-medium text-white tracking-tight">5. Data Storage, Security & Retention</h2>
            <p className="text-zinc-400">
              Security is foundational to Allel. All user credentials, OAuth access tokens, and integration secrets are encrypted using industry-standard AES-256 encryption at rest and TLS 1.3 in transit.
            </p>
            <p className="text-zinc-400">
              We retain customer operational data only for as long as your workspace remains active. When you disconnect an integration, the associated OAuth tokens and temporary sync snapshots are immediately purged from our active systems.
            </p>
          </section>

          {/* Section 6 */}
          <section className="space-y-3">
            <h2 className="text-lg font-medium text-white tracking-tight">6. Your Rights & Data Deletion</h2>
            <p className="text-zinc-400">You retain full sovereignty over your data at all times:</p>
            <ul className="list-disc list-inside space-y-1.5 pl-1 text-zinc-400">
              <li>
                <strong className="text-zinc-200 font-medium">Revoke Google Access:</strong> You can disconnect Google access directly in your Allel Dashboard (Settings &gt; Integrations) or via Google&apos;s Security Portal at{' '}
                <a href="https://myaccount.google.com/permissions" target="_blank" rel="noopener noreferrer" className="text-zinc-200 underline underline-offset-4 decoration-zinc-700 hover:text-white transition-colors">
                  myaccount.google.com/permissions
                </a>.
              </li>
              <li>
                <strong className="text-zinc-200 font-medium">Request Full Deletion:</strong> You may request complete deletion of your account, workspace history, and all stored data by emailing{' '}
                <a href="mailto:kushagarasingh175@gmail.com" className="text-zinc-200 underline underline-offset-4 decoration-zinc-700 hover:text-white transition-colors font-mono text-[13px]">
                  kushagarasingh175@gmail.com
                </a>. We will fulfill deletion requests within 30 business days.
              </li>
            </ul>
          </section>

          {/* Section 7 */}
          <section className="space-y-3">
            <h2 className="text-lg font-medium text-white tracking-tight">7. Contact & Operator Information</h2>
            <p className="text-zinc-400">
              For privacy inquiries, data subject access requests, or verification questions, please contact our team directly:
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
            <Link href="/terms" className="hover:text-zinc-300 transition-colors">Terms of Service</Link>
            <Link href="/pricing" className="hover:text-zinc-300 transition-colors">Pricing</Link>
            <Link href="/" className="hover:text-zinc-300 transition-colors">Home</Link>
          </div>
        </div>
      </div>
    </main>
  )
}
