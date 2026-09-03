'use client'

import React, { useState } from 'react'
import { useChatContext } from '@/ui/chat/chat-provider'
import { DevinChatBox } from '@/ui/primitives/devin-chat-box'
import { AgentFeed } from '@/ui/chat/agent-feed'
import { RotateCcw } from 'lucide-react'

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
      {/* Clean Top Header */}
      <header className="h-12 px-8 flex items-center justify-between shrink-0 bg-[#0d0d0f] z-20">
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
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium text-zinc-400 hover:text-white hover:bg-white/[0.04] transition-colors cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset</span>
          </button>
        )}
      </header>

      {/* Main Content Area */}
      <div className="flex-1 h-full min-h-0 relative flex flex-col items-center justify-between overflow-hidden">
        {!hasMessages ? (
          <div className="w-full max-w-[700px] px-6 pt-10 pb-36 h-full overflow-y-auto">
            {/* Pure, Insanely Clean Editorial Text Brief — Zero Boxed Cards, Zero Tabular Borders */}
            <div className="space-y-6 text-zinc-300 animate-in fade-in duration-150">
              <div>
                <p className="text-xs font-mono tracking-wider uppercase text-zinc-500 mb-1.5">
                  Daily Brief
                </p>
                <h2 className="text-xl sm:text-2xl font-semibold tracking-tight text-white">
                  Good morning, Kushagra.
                </h2>
                <p className="mt-2 text-sm text-zinc-400 leading-relaxed">
                  Here is the operational update across your accounts for today.
                </p>
              </div>

              <div className="space-y-5 pt-2 text-sm leading-relaxed">
                <div>
                  <h3 className="text-sm font-medium text-white mb-2">
                    Revenue & Accounts at Risk
                  </h3>
                  <p className="text-zinc-400 mb-2">
                    $4,200 MRR is currently at risk across 2 accounts:
                  </p>
                  <ul className="space-y-2 list-disc list-inside text-zinc-400 pl-1">
                    <li>
                      <span className="text-zinc-200 font-medium">Apex MultiRail ($2,400 MRR)</span> — 2 card retries declined on Card ····4242. In addition, core query volume declined 44% in PostHog this week.
                    </li>
                    <li>
                      <span className="text-zinc-200 font-medium">FintechScale ($1,800 MRR)</span> — Subscription marked past due following an unpaid invoice run.
                    </li>
                  </ul>
                </div>

                <div>
                  <h3 className="text-sm font-medium text-white mb-2">
                    Customer Signals
                  </h3>
                  <ul className="space-y-2 list-disc list-inside text-zinc-400 pl-1">
                    <li>
                      <span className="text-zinc-200 font-medium">Intercom #1482</span> — High-priority ticket from Rohan Trivedi regarding invoice checkout errors.
                    </li>
                    <li>
                      <span className="text-zinc-200 font-medium">DataVibe</span> — Visited the account cancellation flow 2 days ago; session abandoned before final confirmation.
                    </li>
                  </ul>
                </div>

                <div>
                  <h3 className="text-sm font-medium text-white mb-2">
                    Recommended Actions
                  </h3>
                  <p className="text-zinc-400">
                    Recovery drafts have been prepared. You can ask below to inspect evidence, approve outreach, or add these cases directly into Revenue Recovery.
                  </p>
                </div>
              </div>
            </div>
          </div>
        ) : (
          /* Active Agent Execution Feed */
          <div className="w-full h-full flex-1 min-h-0 flex flex-col justify-between max-w-[760px] mx-auto px-6 pt-2 pb-36 animate-in fade-in duration-200 relative overflow-hidden">
            <div className="flex-1 h-full min-h-0 w-full flex flex-col relative overflow-hidden">
              <AgentFeed />
            </div>
          </div>
        )}

        {/* Fixed Bottom Chat Omnibar */}
        <div className="absolute bottom-0 left-0 right-0 w-full z-30 px-6 pb-5 pt-8 bg-gradient-to-t from-[#0d0d0f] from-70% via-[#0d0d0f]/90 to-transparent flex justify-center pointer-events-none [&>*]:pointer-events-auto">
          <DevinChatBox
            value={inputText}
            onChange={setInputText}
            onSubmit={handleSubmit}
            isLoading={isLoading}
            onStop={stop}
            placeholder="Ask Allel or say 'Add these cases to revenue recovery'..."
            modeLabel="Auto"
            hideStatusBanner={true}
            className="max-w-[700px] w-full"
          />
        </div>
      </div>
    </div>
  )
}
