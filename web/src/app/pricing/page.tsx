'use client';

import React from 'react';
import Link from 'next/link';
import { Check } from 'lucide-react';

export default function PricingPage() {
  return (
    <div className="min-h-screen bg-[#0b0b0a] text-[#edede8] font-sans selection:bg-[#262624]">
      {/* Navigation */}
      <nav className="border-b border-[#1c1c1a] bg-[#0b0b0a]/80 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-8">
            <Link href="/" className="font-bold text-xl tracking-tight text-[#edede8]">
              Allel
            </Link>
            <div className="hidden md:flex items-center gap-6 text-sm text-[#a1a19a]">
              <Link href="/" className="hover:text-[#edede8] transition-colors">Home</Link>
              <Link href="/pricing" className="text-[#edede8] font-medium">Pricing</Link>
              <Link href="/docs" className="hover:text-[#edede8] transition-colors">Docs</Link>
              <Link href="/about" className="hover:text-[#edede8] transition-colors">About</Link>
            </div>
          </div>
          <Link
            href="/#waitlist"
            className="px-4 py-2 text-sm font-medium bg-[#edede8] text-[#121211] rounded-lg hover:bg-white transition-colors"
          >
            Get started
          </Link>
        </div>
      </nav>

      {/* Header Section */}
      <main className="max-w-6xl mx-auto px-6 py-20">
        <div className="text-center max-w-2xl mx-auto mb-16">
          <p className="text-xs uppercase tracking-widest text-[#a1a19a] font-mono mb-4">PRICING</p>
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight text-[#edede8] mb-4">
            Priced per seat, not per agent.
          </h1>
          <p className="text-base text-[#a1a19a]">
            Connect unlimited tools on every plan. Deploy AI agents across your stack.
          </p>
        </div>

        {/* Pricing Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-24">
          {/* Plan 1: Starter */}
          <div className="p-8 rounded-2xl border border-[#262624] bg-[#121211] flex flex-col justify-between hover:border-[#383834] transition-colors">
            <div>
              <p className="text-xs font-mono uppercase text-[#a1a19a] tracking-wider mb-3">STARTER</p>
              <div className="flex items-baseline gap-1 mb-4">
                <span className="text-4xl font-bold text-[#edede8]">$25</span>
                <span className="text-sm text-[#a1a19a]">/month</span>
              </div>
              <p className="text-sm text-[#a1a19a] mb-6 min-h-[40px]">
                For solo founders & indie builders wiring up core tool automations.
              </p>
              <div className="border-t border-[#1c1c1a] pt-6 space-y-3 mb-8">
                <div className="flex items-start gap-3 text-sm text-[#edede8]">
                  <Check className="w-4 h-4 text-[#a1a19a] shrink-0 mt-0.5" />
                  <span>Unlimited app integrations</span>
                </div>
                <div className="flex items-start gap-3 text-sm text-[#edede8]">
                  <Check className="w-4 h-4 text-[#a1a19a] shrink-0 mt-0.5" />
                  <span>1,000 credits / month</span>
                </div>
                <div className="flex items-start gap-3 text-sm text-[#edede8]">
                  <Check className="w-4 h-4 text-[#a1a19a] shrink-0 mt-0.5" />
                  <span>Human-in-the-loop approval queue</span>
                </div>
                <div className="flex items-start gap-3 text-sm text-[#edede8]">
                  <Check className="w-4 h-4 text-[#a1a19a] shrink-0 mt-0.5" />
                  <span>Daily founder briefs & audit logs</span>
                </div>
              </div>
            </div>
            <Link
              href="/#waitlist"
              className="w-full py-2.5 text-center text-sm font-medium border border-[#262624] text-[#edede8] rounded-lg hover:bg-[#1a1a18] transition-colors"
            >
              Start with Starter
            </Link>
          </div>

          {/* Plan 2: Growth (Featured) */}
          <div className="p-8 rounded-2xl border border-[#383834] bg-[#161614] flex flex-col justify-between relative shadow-xl">
            <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 bg-[#edede8] text-[#121211] text-[11px] font-mono font-semibold rounded-full uppercase tracking-wider">
              Popular
            </div>
            <div>
              <p className="text-xs font-mono uppercase text-[#a1a19a] tracking-wider mb-3">GROWTH</p>
              <div className="flex items-baseline gap-1 mb-4">
                <span className="text-4xl font-bold text-[#edede8]">$49</span>
                <span className="text-sm text-[#a1a19a]">/month</span>
              </div>
              <p className="text-sm text-[#a1a19a] mb-6 min-h-[40px]">
                For growing teams running continuous background agents across their stack.
              </p>
              <div className="border-t border-[#262624] pt-6 space-y-3 mb-8">
                <div className="flex items-start gap-3 text-sm text-[#edede8]">
                  <Check className="w-4 h-4 text-[#a1a19a] shrink-0 mt-0.5" />
                  <span>Unlimited app integrations</span>
                </div>
                <div className="flex items-start gap-3 text-sm text-[#edede8]">
                  <Check className="w-4 h-4 text-[#a1a19a] shrink-0 mt-0.5" />
                  <span>2,500 credits / month</span>
                </div>
                <div className="flex items-start gap-3 text-sm text-[#edede8]">
                  <Check className="w-4 h-4 text-[#a1a19a] shrink-0 mt-0.5" />
                  <span>Real-time webhook & event triggers</span>
                </div>
                <div className="flex items-start gap-3 text-sm text-[#edede8]">
                  <Check className="w-4 h-4 text-[#a1a19a] shrink-0 mt-0.5" />
                  <span>Custom agent policies & safety controls</span>
                </div>
              </div>
            </div>
            <Link
              href="/#waitlist"
              className="w-full py-2.5 text-center text-sm font-medium bg-[#edede8] text-[#121211] rounded-lg hover:bg-white transition-colors"
            >
              Join the waitlist
            </Link>
          </div>

          {/* Plan 3: Pro */}
          <div className="p-8 rounded-2xl border border-[#262624] bg-[#121211] flex flex-col justify-between hover:border-[#383834] transition-colors">
            <div>
              <p className="text-xs font-mono uppercase text-[#a1a19a] tracking-wider mb-3">PRO</p>
              <div className="flex items-baseline gap-1 mb-4">
                <span className="text-4xl font-bold text-[#edede8]">$99</span>
                <span className="text-sm text-[#a1a19a]">/month</span>
              </div>
              <p className="text-sm text-[#a1a19a] mb-6 min-h-[40px]">
                For fast-scaling startups requiring high-volume multi-agent orchestration.
              </p>
              <div className="border-t border-[#1c1c1a] pt-6 space-y-3 mb-8">
                <div className="flex items-start gap-3 text-sm text-[#edede8]">
                  <Check className="w-4 h-4 text-[#a1a19a] shrink-0 mt-0.5" />
                  <span>Unlimited app integrations</span>
                </div>
                <div className="flex items-start gap-3 text-sm text-[#edede8]">
                  <Check className="w-4 h-4 text-[#a1a19a] shrink-0 mt-0.5" />
                  <span>Unlimited agent credits</span>
                </div>
                <div className="flex items-start gap-3 text-sm text-[#edede8]">
                  <Check className="w-4 h-4 text-[#a1a19a] shrink-0 mt-0.5" />
                  <span>Multi-agent collaboration & delegation</span>
                </div>
                <div className="flex items-start gap-3 text-sm text-[#edede8]">
                  <Check className="w-4 h-4 text-[#a1a19a] shrink-0 mt-0.5" />
                  <span>Dedicated 1-on-1 support & priority SLA</span>
                </div>
              </div>
            </div>
            <Link
              href="/#waitlist"
              className="w-full py-2.5 text-center text-sm font-medium border border-[#262624] text-[#edede8] rounded-lg hover:bg-[#1a1a18] transition-colors"
            >
              Talk to us
            </Link>
          </div>
        </div>

        {/* FAQ Section */}
        <div className="border-t border-[#1c1c1a] pt-16">
          <p className="text-xs uppercase tracking-widest text-[#a1a19a] font-mono mb-2">QUESTIONS</p>
          <h2 className="text-2xl font-bold text-[#edede8] mb-8">Everything founders ask first.</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 text-sm">
            <div>
              <h3 className="font-semibold text-[#edede8] mb-2">How do agent credits work?</h3>
              <p className="text-[#a1a19a]">
                Each automated action executed by an agent (e.g. drafting an email, checking Stripe, or posting to Slack) consumes 1 credit.
              </p>
            </div>
            <div>
              <h3 className="font-semibold text-[#edede8] mb-2">Can I connect my own custom APIs?</h3>
              <p className="text-[#a1a19a]">
                Yes, all plans include unlimited tool integrations and webhook triggers out of the box.
              </p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
