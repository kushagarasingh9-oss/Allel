'use client'

import React, { useState } from 'react'
import { useChatContext } from '@/ui/chat/chat-provider'
import { DevinChatBox } from '@/ui/primitives/devin-chat-box'
import { AgentFeed } from '@/ui/chat/agent-feed'
import { RotateCcw, Sparkles, ArrowRight } from 'lucide-react'

export default function BriefPage() {
  const {
    messages,
    sendMessage,
    isLoading,
    stop,
    resetActiveThread,
  } = useChatContext()

  const [inputText, setInputText] = useState('')
  const hasMessages = messages.length > 0

  const handleSubmit = (textToSend?: string) => {
    const query = (textToSend || inputText).trim()
    if (!query) return

    if (isLoading) {
      stop()
      return
    }

    sendMessage({ text: query })
    setInputText('')
  }

  return (
    <div className="flex flex-col h-screen w-full bg-[#0d0d0f] text-[#F4F4F5] relative overflow-hidden font-sans select-none">
      {/* Top Header */}
      <header className="h-14 px-8 flex items-center justify-between shrink-0 border-b border-white/[0.04] bg-[#0d0d0f] z-20">
        <div className="flex items-center gap-2.5">
          <img
            src="/logo-icon.png"
            alt="Allel"
            className="w-5 h-5 object-contain shrink-0 mix-blend-screen bg-transparent"
            style={{ width: 20, height: 20 }}
          />
          <h1 className="text-[17px] font-medium tracking-tight text-white">Brief</h1>
        </div>

        {hasMessages && (
          <button
            onClick={() => resetActiveThread()}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/[0.08] bg-[#141416] text-xs font-medium text-zinc-400 hover:text-white hover:border-white/20 transition-all cursor-pointer shadow-xs"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset Standup</span>
          </button>
        )}
      </header>

      {/* Main Content Area */}
      <div className="flex-1 h-full min-h-0 relative flex flex-col items-center justify-between overflow-hidden">
        {!hasMessages ? (
          <div className="w-full max-w-4xl px-8 py-8 flex flex-col justify-between h-full overflow-y-auto">
            {/* Structured Executive Brief Content */}
            <div className="space-y-6 animate-in fade-in duration-200">
              {/* Salutation & Timestamp */}
              <div className="border-b border-white/[0.06] pb-5">
                <div className="flex items-center gap-2 text-xs font-mono uppercase tracking-[0.16em] text-zinc-500 mb-2">
                  <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  Live Fleet Standup · Today
                </div>
                <h2 className="text-xl sm:text-2xl font-semibold tracking-tight text-white">
                  Good morning. Here is your daily revenue and fleet brief.
                </h2>
                <p className="mt-1.5 text-sm text-zinc-400 font-normal leading-relaxed">
                  Synthesized across your active integrations to highlight at-risk MRR, degrading product telemetry, and customer tickets.
                </p>

                {/* Connected Tool Pills */}
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <div className="flex items-center gap-1.5 rounded-lg border border-white/[0.06] bg-[#141416] px-2.5 py-1 text-[11.5px] text-zinc-300 font-medium">
                    <img src="/logos/stripe.svg" alt="Stripe" className="w-3.5 h-3.5 object-contain" />
                    <span>Stripe</span>
                    <span className="text-zinc-500">· Synced</span>
                  </div>
                  <div className="flex items-center gap-1.5 rounded-lg border border-white/[0.06] bg-[#141416] px-2.5 py-1 text-[11.5px] text-zinc-300 font-medium">
                    <img src="/logos/posthog.svg" alt="PostHog" className="w-3.5 h-3.5 object-contain" />
                    <span>PostHog</span>
                    <span className="text-zinc-500">· Synced</span>
                  </div>
                  <div className="flex items-center gap-1.5 rounded-lg border border-white/[0.06] bg-[#141416] px-2.5 py-1 text-[11.5px] text-zinc-300 font-medium">
                    <img src="/logos/intercom.svg" alt="Intercom" className="w-3.5 h-3.5 object-contain" />
                    <span>Intercom</span>
                    <span className="text-zinc-500">· Synced</span>
                  </div>
                  <div className="flex items-center gap-1.5 rounded-lg border border-white/[0.06] bg-[#141416] px-2.5 py-1 text-[11.5px] text-zinc-300 font-medium">
                    <img src="/logos/gmail.svg" alt="Gmail" className="w-3.5 h-3.5 object-contain" />
                    <span>Gmail</span>
                    <span className="text-zinc-500">· Connected</span>
                  </div>
                </div>
              </div>

              {/* Section 1: Revenue Degradation */}
              <div className="rounded-xl border border-white/[0.08] bg-[#141416] p-5 shadow-xs">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono uppercase tracking-[0.16em] text-red-400 font-medium">
                      Revenue Degradation
                    </span>
                  </div>
                  <span className="text-xs font-medium text-red-400 bg-red-950/40 border border-red-900/40 px-2 py-0.5 rounded-md">
                    $4,200 MRR At Risk
                  </span>
                </div>
                <div className="mt-3.5 space-y-3 text-sm text-zinc-300">
                  <div className="flex items-start gap-2.5">
                    <span className="mt-1.5 w-1 h-1 rounded-full bg-zinc-500 shrink-0" />
                    <div>
                      <strong className="text-white font-medium">Apex MultiRail ($2,400 MRR):</strong> Consecutive card retries declined on <code className="text-xs font-mono bg-white/[0.06] px-1 py-0.5 rounded text-zinc-300">Card ····4242</code>. Account renewal at critical risk.
                    </div>
                  </div>
                  <div className="flex items-start gap-2.5">
                    <span className="mt-1.5 w-1 h-1 rounded-full bg-zinc-500 shrink-0" />
                    <div>
                      <strong className="text-white font-medium">FintechScale ($1,800 MRR):</strong> Subscription entered <code className="text-xs font-mono bg-white/[0.06] px-1 py-0.5 rounded text-zinc-300">past_due</code> status following automated Stripe billing run.
                    </div>
                  </div>
                </div>
              </div>

              {/* Section 2: Telemetry & Usage Signals */}
              <div className="rounded-xl border border-white/[0.08] bg-[#141416] p-5 shadow-xs">
                <span className="text-xs font-mono uppercase tracking-[0.16em] text-amber-400 font-medium">
                  Behavioral & Telemetry Signals
                </span>
                <div className="mt-3.5 space-y-3 text-sm text-zinc-300">
                  <div className="flex items-start gap-2.5">
                    <span className="mt-1.5 w-1 h-1 rounded-full bg-zinc-500 shrink-0" />
                    <div>
                      <strong className="text-white font-medium">Apex MultiRail:</strong> Core query telemetry down <span className="text-amber-400 font-medium">-44%</span> over the past 7 days in PostHog.
                    </div>
                  </div>
                  <div className="flex items-start gap-2.5">
                    <span className="mt-1.5 w-1 h-1 rounded-full bg-zinc-500 shrink-0" />
                    <div>
                      <strong className="text-white font-medium">DataVibe:</strong> Visited the account cancellation modal; session abandoned prior to final downgrade confirmation.
                    </div>
                  </div>
                </div>
              </div>

              {/* Section 3: Customer Support Sentiment */}
              <div className="rounded-xl border border-white/[0.08] bg-[#141416] p-5 shadow-xs">
                <span className="text-xs font-mono uppercase tracking-[0.16em] text-blue-400 font-medium">
                  Support & Direct Communication
                </span>
                <div className="mt-3.5 space-y-3 text-sm text-zinc-300">
                  <div className="flex items-start gap-2.5">
                    <span className="mt-1.5 w-1 h-1 rounded-full bg-zinc-500 shrink-0" />
                    <div>
                      <strong className="text-white font-medium">Intercom Ticket #1482:</strong> High priority inquiry from Rohan Trivedi detailing invoice checkout errors and request for payment support.
                    </div>
                  </div>
                </div>
              </div>

              {/* Quick Actions / Suggestions */}
              <div className="pt-2">
                <div className="text-xs font-medium text-zinc-400 mb-2.5">Quick actions with Allel:</div>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => handleSubmit("Add these cases to the revenue recovery system")}
                    className="flex items-center gap-1.5 rounded-lg border border-white/[0.08] bg-[#141416] hover:bg-[#1a1a1c] hover:border-white/20 px-3 py-1.5 text-xs text-zinc-300 hover:text-white transition-all cursor-pointer shadow-xs group"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Add these cases to the revenue recovery system</span>
                    <ArrowRight className="w-3 h-3 text-zinc-500 group-hover:text-white transition-colors ml-0.5" />
                  </button>

                  <button
                    onClick={() => handleSubmit("Draft an invoice recovery email for Apex MultiRail")}
                    className="flex items-center gap-1.5 rounded-lg border border-white/[0.08] bg-[#141416] hover:bg-[#1a1a1c] hover:border-white/20 px-3 py-1.5 text-xs text-zinc-300 hover:text-white transition-all cursor-pointer shadow-xs group"
                  >
                    <span>Draft recovery email for Apex MultiRail</span>
                    <ArrowRight className="w-3 h-3 text-zinc-500 group-hover:text-white transition-colors ml-0.5" />
                  </button>
                </div>
              </div>
            </div>

            {/* Bottom Omnibar for Brief */}
            <div className="pt-8 pb-2 w-full">
              <DevinChatBox
                value={inputText}
                onChange={setInputText}
                onSubmit={handleSubmit}
                isLoading={isLoading}
                onStop={stop}
                placeholder="Ask Allel or say 'Add these cases to revenue recovery'..."
                modeLabel="Auto"
                hideStatusBanner={true}
                className="w-full"
              />
            </div>
          </div>
        ) : (
          /* When chat is actively running with messages */
          <div className="w-full h-full flex-1 min-h-0 flex flex-col justify-between max-w-4xl mx-auto px-8 py-4 animate-in fade-in duration-200 relative">
            <div className="flex-1 h-full min-h-0 w-full flex flex-col relative overflow-hidden">
              <AgentFeed />
            </div>

            {/* Sticky Bottom Chat Omnibar */}
            <div className="w-full pt-4 pb-2 z-30 bg-[#0d0d0f]">
              <DevinChatBox
                value={inputText}
                onChange={setInputText}
                onSubmit={handleSubmit}
                isLoading={isLoading}
                onStop={stop}
                placeholder="Reply to Allel..."
                modeLabel="Auto"
                hideStatusBanner={true}
                className="w-full"
              />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
