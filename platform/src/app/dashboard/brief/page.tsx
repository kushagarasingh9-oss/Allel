'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useChatContext } from '@/ui/chat/chat-provider'
import { DevinChatBox } from '@/ui/primitives/devin-chat-box'
import { createClient } from '@/foundation/database/client'
import { RefreshCw } from 'lucide-react'

const PROVIDER_ICONS: Record<string, string> = {
  stripe: '/logos/stripe.svg',
  gmail: '/logos/gmail.svg',
  posthog: '/logos/posthog.svg',
  intercom: '/logos/intercom.svg',
  slack: '/logos/slack.svg',
  hubspot: '/logos/hubspot.svg',
  linear: '/logos/linear.svg',
  sentry: '/logos/sentry-light.svg',
  google_calendar: '/logos/google-calendar.svg',
}

function InlineTool({ name, icon }: { name: string; icon: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 font-medium text-white align-middle mx-1">
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
  const router = useRouter()
  const { startNewChat } = useChatContext()

  const [inputText, setInputText] = useState('')
  const [greeting, setGreeting] = useState('good morning')
  const [userName, setUserName] = useState('Founder')
  const [briefData, setBriefData] = useState<{
    brief: {
      id: string
      workspace_id: string
      brief_date: string
      headline: string
      summary: string
      generated_at: string
    } | null
    items: Array<{
      id: string
      founder_brief_id: string
      customer_account_id: string | null
      sort_order: number
      risk_level: 'high' | 'medium' | 'low'
      headline: string
      detail: string
      next_step: string
      evidence?: string[]
      customer_accounts?: {
        name: string
        mrr_cents: number
        risk_level: string
      } | null
    }>
    integrations: Array<{
      provider: string
      status: string
      last_synced_at: string | null
    }>
    user?: {
      firstName: string
      email?: string | null
    }
  } | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)

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

  // Fast client-side detection of authenticated user's name
  useEffect(() => {
    async function loadUser() {
      try {
        const supabase = createClient()
        const {
          data: { user },
        } = await supabase.auth.getUser()
        if (user) {
          const meta = user.user_metadata || {}
          const fullName = meta.full_name || meta.name || meta.display_name || ''
          const first = fullName
            ? fullName.trim().split(' ')[0]
            : user.email
            ? user.email.split('@')[0]
            : 'Founder'
          setUserName(first)
        }
      } catch (err) {
        console.error('Failed to load user info in BriefPage:', err)
      }
    }
    void loadUser()
  }, [])

  // Load authoritative brief from database
  const loadBrief = useCallback(async () => {
    try {
      setIsLoading(true)
      const res = await fetch('/api/brief')
      if (res.ok) {
        const data = await res.json()
        setBriefData(data)
        if (data.user?.firstName) {
          setUserName(data.user.firstName)
        }
      }
    } catch (e) {
      console.error('Failed to load brief:', e)
    } finally {
      setIsLoading(false)
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
          integrations: data.integrations || prev?.integrations || [],
          user: data.user || prev?.user,
        }))
        if (data.user?.firstName) {
          setUserName(data.user.firstName)
        }
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

    // Start a fresh task session and store the pending prompt
    startNewChat()
    if (typeof window !== 'undefined') {
      window.sessionStorage.setItem('allel.pending-prompt', query)
    }

    // Transition smoothly to the main dashboard command center
    router.push('/dashboard')
  }, [inputText, startNewChat, router])

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

  const connectedIntegrations = (briefData?.integrations || []).filter(
    i => i.status === 'connected'
  )
  const hasConnectedIntegrations = connectedIntegrations.length > 0

  // Filter out placeholder item when genuine account items exist
  const rawItems = briefData?.items || []
  const actionableItems = rawItems.filter(
    item =>
      item.customer_accounts !== null &&
      item.headline !== 'No live customer accounts are available yet.'
  )

  const summaryText = briefData?.brief?.summary || ''
  const headlineText = briefData?.brief?.headline || ''

  // Format summary text into clean, structured paragraphs with inline badges
  const cleanText = (text: string): string => {
    if (!text) return ''
    return text.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
  }

  const renderFormattedSummary = (text: string) => {
    if (!text) return null

    const cleaned = cleanText(text)
    const sentences = cleaned.split(/(?<=\.)\s+/).filter(s => s.trim().length > 0)
    if (sentences.length === 0) {
      return <p className="leading-relaxed text-zinc-300">{cleaned}</p>
    }

    const toolItems: React.ReactNode[] = []
    const narrativeSentences: string[] = []

    sentences.forEach((sentence, idx) => {
      const trimmed = sentence.trim()
      const match = trimmed.match(
        /^(?:In\s+)?(Gmail|Stripe|PostHog|Intercom|Slack|Linear|Sentry|HubSpot|Google Calendar)[:,\s]*(.*)$/i
      )

      if (match) {
        const providerName = match[1]
        let detail = match[2].trim()
        if (detail.endsWith('.')) detail = detail.slice(0, -1)
        const providerKey = providerName.toLowerCase().replace(' ', '_')
        const icon = PROVIDER_ICONS[providerKey] || '/logos/account.svg'

        toolItems.push(
          <span key={idx} className="inline-flex items-center gap-1">
            <InlineTool name={providerName} icon={icon} />
            <span className="text-zinc-400 font-normal">({detail})</span>
          </span>
        )
      } else {
        narrativeSentences.push(trimmed)
      }
    })

    return (
      <div className="space-y-3.5 text-zinc-300 text-[14.5px] leading-relaxed">
        {toolItems.length > 0 && (
          <p className="leading-relaxed">
            <span className="text-zinc-400">Connected workspace audit: </span>
            {toolItems.map((tool, i) => (
              <React.Fragment key={i}>
                {tool}
                {i < toolItems.length - 1 ? <span className="text-zinc-600"> &middot; </span> : '. '}
              </React.Fragment>
            ))}
          </p>
        )}

        {narrativeSentences.length > 0 && (
          <p className="leading-relaxed text-zinc-300">
            {narrativeSentences.join(' ')}
          </p>
        )}
      </div>
    )
  }

  return (
    <div className="flex flex-col h-screen w-full bg-[#0d0d0f] text-[#F4F4F5] relative overflow-hidden font-sans select-none">
      {/* Clean Top Header — Zero bottom border */}
      <header className="h-12 px-8 flex items-center justify-between shrink-0 bg-[#0d0d0f] z-30">
        <div className="flex items-center gap-2.5">
          <img
            src="/dot.png"
            alt="Allel"
            className="w-4 h-4 object-contain shrink-0"
          />
          <h1 className="text-[17px] font-medium tracking-tight text-white">
            Brief
          </h1>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => void handleRefreshBrief()}
            disabled={isRefreshing}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium text-zinc-400 hover:text-white hover:bg-white/[0.04] transition-colors cursor-pointer disabled:opacity-50"
            title="Re-run daily brief"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
            <span>{isRefreshing ? 'Refreshing…' : 'Refresh'}</span>
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <div className="flex-1 h-full min-h-0 relative flex flex-col items-center justify-between overflow-hidden">
        <div className="w-full max-w-[760px] mx-auto px-6 h-full flex flex-col relative min-h-0">
          <div className="w-full pt-10 pb-36 h-full overflow-y-auto">
            {/* Header Greeting — Clean solid typography */}
            <div className="mb-2">
              <h2 className="text-[17px] font-medium tracking-tight text-white">
                Hey {userName}, {greeting}.
              </h2>
              {hasConnectedIntegrations && headlineText && headlineText !== 'Connect your tools to get started' && (
                <p className="text-xs text-zinc-400 mt-1 font-normal">
                  {headlineText.replace(/^[⚠!\s]+/, '').trim()}
                </p>
              )}
            </div>

            {/* Loading Skeleton */}
            {isLoading && !briefData && (
              <div className="space-y-4 animate-pulse pt-4">
                <div className="h-4 bg-white/[0.04] rounded w-3/4" />
                <div className="h-4 bg-white/[0.04] rounded w-full" />
                <div className="h-4 bg-white/[0.04] rounded w-5/6" />
              </div>
            )}

            {/* State 1: New User / Zero Integrations Onboarding State — Pure Editorial Text, Zero Cards */}
            {!isLoading && !hasConnectedIntegrations && (
              <div className="space-y-4 text-zinc-300 animate-in fade-in duration-150 text-[14.5px] leading-relaxed pt-2">
                <p>
                  Your autonomous daily brief is waiting for your live integrations. Once connected, Allel monitors customer retention health across <InlineTool name="Stripe" icon="/logos/stripe.svg" />, <InlineTool name="Gmail" icon="/logos/gmail.svg" />, <InlineTool name="PostHog" icon="/logos/posthog.svg" />, and <InlineTool name="Intercom" icon="/logos/intercom.svg" /> every morning at 4:00 AM.
                </p>

                <p>
                  Head to <span onClick={() => router.push('/dashboard/connections')} className="text-white font-medium underline underline-offset-4 decoration-zinc-500 hover:decoration-white cursor-pointer transition-colors">Connections</span> to connect your tools and generate your real-time daily brief.
                </p>

                <p className="pt-2 text-zinc-400 leading-relaxed">
                  Would you like me to guide you through connecting <span onClick={() => router.push('/dashboard/connections')} className="text-zinc-200 underline underline-offset-4 decoration-zinc-600 hover:text-white cursor-pointer transition-colors">Stripe</span> or <span onClick={() => router.push('/dashboard/connections')} className="text-zinc-200 underline underline-offset-4 decoration-zinc-600 hover:text-white cursor-pointer transition-colors">Gmail</span>, explain how autonomous retention recovery works, or answer any questions about your workspace?
                </p>
              </div>
            )}

            {/* State 2: Active Workspace Brief — Pure Structured Editorial Typography */}
            {!isLoading && hasConnectedIntegrations && (
              <div className="space-y-4 text-zinc-300 animate-in fade-in duration-150 text-[14.5px] leading-relaxed pt-2">
                {/* Formatted Executive Summary */}
                {summaryText ? (
                  renderFormattedSummary(summaryText)
                ) : (
                  <p>
                    All customer accounts are healthy. No churn risks, gateway timeouts, or failed payment retries were detected across your connected sources during the latest audit run.
                  </p>
                )}

                {/* Priority Accounts & Actions Rendered as Pristine Editorial Paragraphs */}
                {actionableItems.length > 0 && (
                  <div className="space-y-3 pt-1">
                    {actionableItems.map((item, idx) => {
                      const accountName =
                        item.customer_accounts?.name || item.headline.split(' ')[0]

                      let headline = cleanText(item.headline)
                      if (headline.toLowerCase().startsWith(accountName.toLowerCase())) {
                        headline = headline.slice(accountName.length).replace(/^[\s—–:-]+/, '').trim()
                      }
                      const detail = cleanText(item.detail)
                      const nextStep = cleanText(item.next_step)

                      return (
                        <p key={item.id || idx} className="text-zinc-300 leading-relaxed text-[14.5px]">
                          <span
                            onClick={() => handleSubmit(`Inspect customer ${accountName}`)}
                            className="text-white font-medium cursor-pointer hover:underline"
                          >
                            {accountName}
                          </span>
                          {headline ? ` — ${headline}. ` : '. '}
                          {detail && detail !== headline && (
                            <span className="text-zinc-400">{detail} </span>
                          )}
                          {nextStep && (
                            <span
                              onClick={() =>
                                handleSubmit(`Execute action for ${accountName}: ${nextStep}`)
                              }
                              className="text-zinc-200 underline underline-offset-4 decoration-zinc-600 hover:text-white cursor-pointer transition-colors"
                            >
                              {nextStep}
                            </span>
                          )}
                        </p>
                      )
                    })}
                  </div>
                )}

                {/* Editorial Prompt Suggestion */}
                <p className="pt-2 text-zinc-400 leading-relaxed">
                  Would you like me to inspect any account details, draft tailored recovery emails, or push these cases to your <span onClick={() => handleSubmit('Add these at-risk accounts to the revenue recovery queue')} className="text-zinc-200 underline underline-offset-4 decoration-zinc-600 hover:text-white hover:decoration-zinc-400 cursor-pointer transition-colors">Revenue Recovery</span> queue?
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Fixed Bottom Chat Omnibar */}
        <div className="absolute bottom-0 left-0 right-0 w-full z-30 px-6 pb-5 pt-8 bg-gradient-to-t from-[#0d0d0f] from-70% via-[#0d0d0f]/90 to-transparent flex justify-center pointer-events-none [&>*]:pointer-events-auto">
          <DevinChatBox
            value={inputText}
            onChange={setInputText}
            onSubmit={handleSubmit}
            isLoading={false}
            onStop={() => {}}
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
