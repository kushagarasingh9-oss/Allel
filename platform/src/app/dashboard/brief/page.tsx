'use client'

import React, { useState } from 'react'
import { useChatContext } from '@/ui/chat/chat-provider'
import { DevinChatBox } from '@/ui/primitives/devin-chat-box'
import { AgentFeed } from '@/ui/chat/agent-feed'
import { RotateCcw } from 'lucide-react'

function InlineTool({ name, icon }: { name: string; icon: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 font-medium text-white align-middle">
      <img
        src={icon}
        alt={name}
        className="w-3.5 h-3.5 inline-block object-contain"
        style={{ width: 14, height: 14 }}
      />
      <span>{name}</span>
    </span>
  )
}

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
            {/* Pure Continuous Paragraph Flow — Zero Bullet Points, Perfect Baseline Alignment */}
            <div className="space-y-4 text-zinc-300 animate-in fade-in duration-150 text-[14.5px] leading-relaxed">
              <div>
                <h2 className="text-xl sm:text-2xl font-semibold tracking-tight text-white">
                  Hey Kushagra, good morning.
                </h2>
                <p className="mt-2.5 text-zinc-300">
                  Here is your operational update across your customer accounts and connected tools today.
                </p>
              </div>

              <p>
                In <InlineTool name="Gmail" icon="/logos/gmail.svg" />, Rohan from Apex MultiRail sent an email asking for wire details, and Sarah at FintechScale replied to yesterday’s check-in. Both threads are waiting on replies — should we prepare drafts for them?
              </p>

              <p>
                Across your billing in <InlineTool name="Stripe" icon="/logos/stripe.svg" />, Apex MultiRail had 2 card retries declined on <code className="text-xs font-mono bg-white/[0.06] px-1.5 py-0.5 rounded text-zinc-200">Card ····4242</code>, while FintechScale transitioned to past due following an unpaid invoice run. In <InlineTool name="PostHog" icon="/logos/posthog.svg" />, Apex MultiRail’s core query volume dropped 44% over the past week, and DataVibe triggered the cancel flow modal before abandoning the session.
              </p>

              <p>
                Over in <InlineTool name="Intercom" icon="/logos/intercom.svg" />, an urgent ticket was opened by Rohan Trivedi regarding checkout payment errors. Tailored drafts and recovery motions are staged — ask below to review any thread, inspect customer evidence, or take action across your tools.
              </p>
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
