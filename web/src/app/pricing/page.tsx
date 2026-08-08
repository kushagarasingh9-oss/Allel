'use client';

import React from 'react';
import Link from 'next/link';

export default function PricingPage() {
  const tiers = [
    {
      name: 'Starter',
      price: '$25',
      period: '/month',
      description: 'For solo founders & indie builders wiring up core tool automations.',
      features: [
        'Unlimited app integrations',
        '1,000 credits / month',
        'Human-in-the-loop approval queue',
        'Daily founder briefs & audit logs'
      ],
      buttonText: 'Start with Starter',
      buttonLink: '/dashboard',
      popular: false
    },
    {
      name: 'Growth',
      price: '$49',
      period: '/month',
      description: 'For growing teams running continuous background agents across their stack.',
      features: [
        'Unlimited app integrations',
        '2,500 credits / month',
        'Real-time webhook & event triggers',
        'Custom agent policies & safety controls'
      ],
      buttonText: 'Join the waitlist',
      buttonLink: '/dashboard',
      popular: true
    },
    {
      name: 'Pro',
      price: '$99',
      period: '/month',
      description: 'For fast-scaling startups requiring high-volume multi-agent orchestration.',
      features: [
        'Unlimited app integrations',
        'Unlimited agent credits',
        'Multi-agent collaboration & delegation',
        'Dedicated 1-on-1 support & priority SLA'
      ],
      buttonText: 'Talk to us',
      buttonLink: '/dashboard',
      popular: false
    }
  ];

  const faqs = [
    {
      q: 'How do seat-based pricing and unlimited agents work?',
      a: 'You pay per team member (seat) on Allel. Every team member can deploy as many AI agents across Stripe, Slack, Gmail, GitHub, and PostHog as needed without extra agent fees.'
    },
    {
      q: 'What counts as an agent credit?',
      a: 'An agent credit is consumed when an AI agent runs a multi-step background tool execution, checks live database/API signals, or generates a structured action proposal.'
    },
    {
      q: 'Can I change plans or upgrade credits at any time?',
      a: 'Yes, you can upgrade, downgrade, or adjust your seat count instantly from your account settings with pro-rated billing.'
    },
    {
      q: 'Are custom API webhooks supported on all plans?',
      a: 'All plans include unlimited app integrations. Real-time custom webhooks and advanced event triggers are included in Growth and Pro plans.'
    }
  ];

  return (
    <div className="min-h-screen bg-[#070709] text-[#e0e0e6] font-sans">
      {/* Navigation Header */}
      <header className="sticky top-0 z-50 flex items-center justify-between border-b border-[#ffffff15] bg-[#070709]/80 px-6 py-4 backdrop-blur-md max-w-7xl mx-auto w-full">
        <div className="flex items-center gap-8">
          <Link href="/" className="text-xl font-bold text-white tracking-tight hover:opacity-80 transition-opacity">
            Allel
          </Link>
          <nav className="hidden md:flex items-center gap-6 text-sm text-[#a0a0b0]">
            <Link href="/" className="hover:text-white transition-colors">Home</Link>
            <Link href="/pricing" className="text-white font-medium">Pricing</Link>
            <Link href="/docs" className="hover:text-white transition-colors">Docs</Link>
            <Link href="/about" className="hover:text-white transition-colors">About</Link>
          </nav>
        </div>
        <Link
          href="/dashboard"
          className="rounded-sm bg-white px-4 py-2 text-xs font-semibold text-black hover:bg-white/90 transition-all shadow-sm"
        >
          Get started
        </Link>
      </header>

      {/* Main Pricing Section */}
      <main className="max-w-7xl mx-auto px-6 py-20">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <div className="inline-block text-[11px] font-mono tracking-widest text-[#858599] uppercase mb-3">
            PRICING
          </div>
          <h1 className="text-4xl md:text-5xl font-bold text-white tracking-tight mb-4 leading-tight">
            Priced per seat, <br className="hidden sm:inline" />
            not per agent.
          </h1>
          <p className="text-[#9595a6] text-base md:text-lg max-w-xl mx-auto">
            Connect unlimited tools on every plan. Deploy AI agents across your stack.
          </p>
        </div>

        {/* Pricing Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-24">
          {tiers.map((tier, idx) => (
            <div
              key={idx}
              className={`relative flex flex-col justify-between rounded-xl border p-8 transition-all ${
                tier.popular
                  ? 'border-white/40 bg-white/[0.05] shadow-2xl shadow-white/5'
                  : 'border-white/10 bg-white/[0.02] hover:border-white/20'
              }`}
            >
              {tier.popular && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full border border-white/30 bg-white/10 px-3 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-white backdrop-blur-md">
                  Most Popular
                </div>
              )}

              <div>
                <div className="text-xs font-mono uppercase tracking-wider text-[#a5a5b8] mb-4">
                  {tier.name}
                </div>
                <div className="flex items-baseline gap-1 mb-4">
                  <span className="text-4xl font-extrabold text-white tracking-tight">
                    {tier.price}
                  </span>
                  <span className="text-sm text-[#7a7a8c]">{tier.period}</span>
                </div>
                <p className="text-xs text-[#8e8e9e] leading-relaxed mb-8 min-h-[40px]">
                  {tier.description}
                </p>

                <div className="border-t border-white/10 pt-6 mb-8">
                  <ul className="space-y-3">
                    {tier.features.map((feature, fIdx) => (
                      <li key={fIdx} className="flex items-start gap-3 text-xs text-[#cccccc]">
                        <svg
                          className="w-4 h-4 text-white/80 shrink-0 mt-0.5"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth="2"
                            d="M5 13l4 4L19 7"
                          />
                        </svg>
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              <Link
                href={tier.buttonLink}
                className={`w-full py-3 px-4 rounded-md text-xs font-semibold text-center transition-all ${
                  tier.popular
                    ? 'bg-white text-black hover:bg-white/90 shadow-md'
                    : 'border border-white/20 bg-white/5 text-white hover:bg-white/10'
                }`}
              >
                {tier.buttonText}
              </Link>
            </div>
          ))}
        </div>

        {/* FAQ Section */}
        <div className="max-w-3xl mx-auto border-t border-white/10 pt-16">
          <div className="text-center mb-12">
            <div className="text-xs font-mono uppercase tracking-wider text-[#7a7a8c] mb-2">
              QUESTIONS
            </div>
            <h2 className="text-2xl font-bold text-white">Everything founders ask first.</h2>
          </div>

          <div className="space-y-8">
            {faqs.map((faq, idx) => (
              <div key={idx} className="border-b border-white/5 pb-6">
                <h3 className="text-sm font-semibold text-white mb-2">{faq.q}</h3>
                <p className="text-xs text-[#8e8e9e] leading-relaxed">{faq.a}</p>
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
