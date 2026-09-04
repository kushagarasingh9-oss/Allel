'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { useChatContext } from '@/ui/chat/chat-provider'
import { DevinChatBox } from '@/ui/primitives/devin-chat-box'
import { AgentFeed } from '@/ui/chat/agent-feed'
import { RotateCcw, ChevronUp, ChevronDown, RefreshCw } from 'lucide-react'
import { cn } from '@/foundation/utils'

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
  const [isCollapsed, setIsCollapsed] = useState(false)
  const [greeting, setGreeting] = useState('good morning')
  const [briefData, setBriefData] = useState<{ brief: any; items: any[]; integrations: any[] } | null>(null)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const hasMessages = messages.length > 0

  // Time-of-day greeting detection
  useEffect(() => {
    const hour = new Date().getHours()
    if (hour >= 5 && hour < 12) {
      setGreeting('good morning')
    } else if (hour >= 12 && hour < 17) {
      setGreeting('good afternoon')
    } else if (hour >= 17 && hour < 22) {
      setGreeting('good evening')
    } else {
      setGreeting('good night')
    }
  }, [])

  // Load authoritative brief from database
  const loadBrief = useCallback(async () => {
    try {
      const res = await fetch('/api/brief')
      if (res.ok) {
        const data = await res.json()
        setBriefData(data)
      }
    } catch (e) {
      console.error('Failed to load brief:', e)
    }
  }, [])

  useEffect(() => {
    void loadBrief()
  }, [loadBrief])

  const handleRefreshBrief = async () => {
    if (isRefreshing) return
    try {
      setIsRefreshing(true)
      const res = await fetch('/api/brief', { method: 'POST' })
      if (res.ok) {
        const data = await res.json()
        setBriefData(prev => ({
          ...prev,
          brief: data.brief,
          items: data.items,
          integrations: prev?.integrations || [],
        }))
      }
    } catch (e) {
      console.error('Failed to refresh brief:', e)
    } finally {
      setIsRefreshing(false)
    }
  }

  const handleSubmit = useCallback((textToSend?: string) => {
    const query = (textToSend || inputText).trim()
    if (!query) return

    if (isLoading) {
      stop()
      return
    }

    setIsCollapsed(true)
    sendMessage({ text: query })
    setInputText('')
  }, [inputText, isLoading, stop, sendMessage])

  useEffect(() => {
    const handleProceed = (e: Event) => {
      const detail = (e as CustomEvent).detail
      if (detail?.text) {
        handleSubmit(detail.text)
      }
    }
    window.addEventListener('allel:proceed-tasks', handleProceed)
    return () => window.removeEventListener('allel:proceed-tasks', handleProceed)
  }, [handleSubmit])

  return (
    <div className="flex flex-col h-screen w-full bg-[#0d0d0f] text-[#F4F4F5] relative overflow-hidden font-sans select-none">
      {/* Clean Top Header — Full width px-8, No dividing border */}
      <header className="h-12 px-8 flex items-center justify-between shrink-0 bg-[#0d0d0f] z-30">
        <div className="flex items-center gap-2.5">
          <img
            src="/logo-icon.png"
            alt="Allel"
            className="w-5 h-5 object-contain shrink-0 mix-blend-screen bg-transparent"
            style={{ width: 20, height: 20 }}
          />
          <h1 className="text-[17px] font-medium tracking-tight text-white">Brief</h1>

          {/* Clean shimmering Daily Brief text on the left */}
          {hasMessages && (
            <button
              onClick={() => setIsCollapsed(!isCollapsed)}
              className="flex items-center gap-1.5 ml-6 group cursor-pointer select-none text-left"
              title={isCollapsed ? "Expand Daily Brief" : "Collapse Daily Brief"}
            >
              <span className="text-[14.5px] font-medium tracking-tight silver-shimmer-text">
                Daily Brief
              </span>
              <ChevronDown
                className={cn(
                  "w-3.5 h-3.5 text-zinc-500 group-hover:text-zinc-300 transition-transform duration-200",
                  !isCollapsed && "rotate-180"
                )}
              />
            </button>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => void handleRefreshBrief()}
            disabled={isRefreshing}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium text-zinc-400 hover:text-white hover:bg-white/[0.04] transition-colors cursor-pointer disabled:opacity-50"
            title="Re-run daily brief"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
            <span>{isRefreshing ? 'Refreshing…' : 'Refresh'}</span>
          </button>

          {hasMessages && (
            <button
              onClick={() => {
                resetActiveThread()
                setIsCollapsed(false)
              }}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium text-zinc-400 hover:text-white hover:bg-white/[0.04] transition-colors cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset</span>
            </button>
          )}
        </div>
      </header>

      {/* Main Content Area */}
      <div className="flex-1 h-full min-h-0 relative flex flex-col items-center justify-between overflow-hidden">
        {/* Daily Brief Floating Overlay — appears above the chat, blurs the background chat slightly & premiumly */}
        {hasMessages && !isCollapsed && (
          <div
            className="absolute inset-0 z-40 bg-black/40 backdrop-blur-[6px] flex flex-col items-center pt-3 px-6 animate-in fade-in duration-200 overflow-y-auto"
            onClick={(e) => {
              if (e.target === e.currentTarget) {
                setIsCollapsed(true)
              }
            }}
          >
            {/* Purely sharp edges (not rounded), dark card without dividing lines */}
            <div className="w-full max-w-[760px] rounded-sm bg-[#111114] border border-white/10 p-6 shadow-2xl my-2">
              <div className="flex items-center justify-between mb-3.5">
                <h2 className="text-[15px] font-medium tracking-tight text-white">
                  <span className="silver-shimmer-text">Hey Kushagra</span>, {greeting}.
                </h2>
                <button
                  onClick={() => setIsCollapsed(true)}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-sm text-xs font-medium text-zinc-400 hover:text-white hover:bg-white/[0.06] transition-colors cursor-pointer select-none"
                  title="Collapse Daily Brief"
                >
                  <span>Collapse</span>
                  <ChevronUp className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="space-y-3.5 text-zinc-300 text-[14px] leading-relaxed font-sans">
                <p>
                  In <InlineTool name="Gmail" icon="/logos/gmail.svg" />, you have active threads awaiting replies across accounts: Rohan from <span className="text-white font-medium cursor-pointer hover:underline" onClick={() => handleSubmit("Inspect customer Apex MultiRail")}>Apex MultiRail</span> is waiting on wire payment details, Sarah at <span className="text-white font-medium cursor-pointer hover:underline" onClick={() => handleSubmit("Inspect customer FintechScale")}>FintechScale</span> requested a billing update link, and David from <span className="text-white font-medium cursor-pointer hover:underline" onClick={() => handleSubmit("Inspect customer Cobalt Wire")}>Cobalt Wire</span> replied to yesterday’s invoice reminder.
                </p>

                <p>
                  Across your billing in <InlineTool name="Stripe" icon="/logos/stripe.svg" />, multiple accounts require immediate attention: <span className="text-white font-medium cursor-pointer hover:underline" onClick={() => handleSubmit("Inspect customer Apex MultiRail")}>Apex MultiRail</span> had 2 consecutive card retries declined on <code className="text-xs font-mono bg-white/[0.06] px-1.5 py-0.5 rounded text-zinc-200">Card ····4242</code>, while <span className="text-white font-medium cursor-pointer hover:underline" onClick={() => handleSubmit("Inspect customer Cobalt Wire")}>Cobalt Wire</span> and <span className="text-white font-medium cursor-pointer hover:underline" onClick={() => handleSubmit("Inspect customer FintechScale")}>FintechScale</span> transitioned to past due following unpaid invoice runs, and <span className="text-white font-medium cursor-pointer hover:underline" onClick={() => handleSubmit("Inspect customer Hyperion Dispatch")}>Hyperion Dispatch</span> was marked cancelled.
                </p>

                <p>
                  In <InlineTool name="PostHog" icon="/logos/posthog.svg" /> and <InlineTool name="Intercom" icon="/logos/intercom.svg" />, core query telemetry dropped 44% for Apex MultiRail following 504 webhook gateway timeouts, while Shaurya at <span className="text-white font-medium cursor-pointer hover:underline" onClick={() => handleSubmit("Inspect customer DataVibe")}>DataVibe</span> triggered the cancellation data export flow before abandoning his session.
                </p>

                <p className="pt-1 text-zinc-400 text-[13.5px] leading-relaxed">
                  Would you like me to dive into <span className="text-zinc-200 underline underline-offset-4 decoration-zinc-600 hover:text-white hover:decoration-zinc-400 cursor-pointer transition-colors" onClick={() => handleSubmit("Inspect customer Apex MultiRail")}>Apex MultiRail’s</span> gateway timeouts, draft a tailored recovery email for <span className="text-zinc-200 underline underline-offset-4 decoration-zinc-600 hover:text-white hover:decoration-zinc-400 cursor-pointer transition-colors" onClick={() => handleSubmit("Draft a recovery email for FintechScale")}>FintechScale</span>, or push these at-risk accounts to your <span className="text-zinc-200 underline underline-offset-4 decoration-zinc-600 hover:text-white hover:decoration-zinc-400 cursor-pointer transition-colors" onClick={() => handleSubmit("Add these at-risk accounts to the revenue recovery queue")}>Revenue Recovery</span> queue?
                </p>
              </div>
            </div>
          </div>
        )}

        <div className="w-full max-w-[760px] mx-auto px-6 h-full flex flex-col relative min-h-0">

          {/* Initial Full-Page Narrative View when no conversation has started */}
          {!hasMessages && (
            <div className="w-full pt-10 pb-36 h-full overflow-y-auto">
              <div className="space-y-4 text-zinc-300 animate-in fade-in duration-200 text-[14.5px] leading-relaxed pb-4">
                <div className="flex items-center justify-between mb-2">
                  <h2 className="text-[17px] font-medium tracking-tight text-white">
                    <span className="silver-shimmer-text">Hey Kushagra</span>, {greeting}.
                  </h2>
                </div>

                <p>
                  In <InlineTool name="Gmail" icon="/logos/gmail.svg" />, you have active threads awaiting replies across accounts: Rohan from <span className="text-white font-medium cursor-pointer hover:underline" onClick={() => handleSubmit("Inspect customer Apex MultiRail")}>Apex MultiRail</span> is waiting on wire payment details, Sarah at <span className="text-white font-medium cursor-pointer hover:underline" onClick={() => handleSubmit("Inspect customer FintechScale")}>FintechScale</span> requested a billing update link, and David from <span className="text-white font-medium cursor-pointer hover:underline" onClick={() => handleSubmit("Inspect customer Cobalt Wire")}>Cobalt Wire</span> replied to yesterday’s invoice reminder.
                </p>

                <p>
                  Across your billing in <InlineTool name="Stripe" icon="/logos/stripe.svg" />, multiple accounts require immediate attention: <span className="text-white font-medium cursor-pointer hover:underline" onClick={() => handleSubmit("Inspect customer Apex MultiRail")}>Apex MultiRail</span> had 2 consecutive card retries declined on <code className="text-xs font-mono bg-white/[0.06] px-1.5 py-0.5 rounded text-zinc-200">Card ····4242</code>, while <span className="text-white font-medium cursor-pointer hover:underline" onClick={() => handleSubmit("Inspect customer Cobalt Wire")}>Cobalt Wire</span> and <span className="text-white font-medium cursor-pointer hover:underline" onClick={() => handleSubmit("Inspect customer FintechScale")}>FintechScale</span> transitioned to past due following unpaid invoice runs, and <span className="text-white font-medium cursor-pointer hover:underline" onClick={() => handleSubmit("Inspect customer Hyperion Dispatch")}>Hyperion Dispatch</span> was marked cancelled.
                </p>

                <p>
                  In <InlineTool name="PostHog" icon="/logos/posthog.svg" /> and <InlineTool name="Intercom" icon="/logos/intercom.svg" />, core query telemetry dropped 44% for Apex MultiRail following 504 webhook gateway timeouts, while Shaurya at <span className="text-white font-medium cursor-pointer hover:underline" onClick={() => handleSubmit("Inspect customer DataVibe")}>DataVibe</span> triggered the cancellation data export flow before abandoning his session.
                </p>

                <p className="pt-2 text-zinc-400 leading-relaxed">
                  Would you like me to dive into <span className="text-zinc-200 underline underline-offset-4 decoration-zinc-600 hover:text-white hover:decoration-zinc-400 cursor-pointer transition-colors" onClick={() => handleSubmit("Inspect customer Apex MultiRail")}>Apex MultiRail’s</span> gateway timeouts, draft a tailored recovery email for <span className="text-zinc-200 underline underline-offset-4 decoration-zinc-600 hover:text-white hover:decoration-zinc-400 cursor-pointer transition-colors" onClick={() => handleSubmit("Draft a recovery email for FintechScale")}>FintechScale</span>, or push these at-risk accounts to your <span className="text-zinc-200 underline underline-offset-4 decoration-zinc-600 hover:text-white hover:decoration-zinc-400 cursor-pointer transition-colors" onClick={() => handleSubmit("Add these at-risk accounts to the revenue recovery queue")}>Revenue Recovery</span> queue?
                </p>
              </div>
            </div>
          )}

          {/* Active Agent Execution Feed */}
          {hasMessages && (
            <div className="w-full flex-1 min-h-0 flex flex-col justify-between pt-1 pb-36 animate-in fade-in duration-200 relative overflow-hidden">
              <div className="flex-1 h-full min-h-0 w-full flex flex-col relative overflow-hidden">
                <AgentFeed />
              </div>
            </div>
          )}
        </div>

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
