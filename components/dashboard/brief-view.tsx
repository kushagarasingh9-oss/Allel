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
    <span className="inline-flex items-center gap-1.5 font-medium text-white align-middle ml-1 mr-0.5">
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

  const isGenericHeadline =
    !headlineText ||
    headlineText === 'Connect your tools to get started' ||
    headlineText.toLowerCase().includes('connected and syncing') ||
    headlineText.toLowerCase().includes('sources connected') ||
    headlineText.toLowerCase().includes('accounts synced')

  // Helpers for editorial typography
  const cleanText = (text: string): string => {
    if (!text) return ''
    return text.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
  }

  const renderAccountLink = (name: string) => (
    <span
      key={name}
      onClick={() => handleSubmit(`Inspect customer ${name}`)}
      className="text-white font-medium cursor-pointer hover:underline"
    >
      {name}
    </span>
  )

  const getCleanAccountName = (item: { headline: string; customer_accounts?: { name: string } | null }): string => {
    if (item.customer_accounts?.name) return item.customer_accounts.name
    const raw = item.headline.split(/[—–:-]/)[0].trim()
    return raw || item.headline
  }

  const getAccountReason = (item: { headline: string; detail: string; customer_accounts?: { name: string } | null }): string => {
    const text = `${cleanText(item.headline)} ${cleanText(item.detail)}`.toLowerCase()
    if (text.includes('504') || text.includes('gateway timeout')) {
      return 'is blocked by 504 gateway timeouts on billing webhooks'
    }
    if (text.includes('repeated payment') || text.includes('card charge') || text.includes('failed payment')) {
      return 'has repeated card charge failures requiring payment updates'
    }
    if (text.includes('cancelled')) {
      return 'is cancelled and requires churn rescue outreach'
    }
    if (text.includes('past due')) {
      return 'is past due and needs billing recovery follow-up'
    }
    if (text.includes('drop') || text.includes('decline') || text.includes('usage')) {
      return 'shows a critical usage drop indicating immediate churn risk'
    }
    if (text.includes('replied') || text.includes('reply')) {
      return 'sent an inquiry requiring immediate follow-up'
    }
    let headline = cleanText(item.headline)
    const name = getCleanAccountName(item)
    if (headline.toLowerCase().startsWith(name.toLowerCase())) {
      headline = headline.slice(name.length).replace(/^[\s—–:-]+/, '').trim()
    }
    return headline ? `needs review: ${headline}` : 'needs immediate attention'
  }

  const renderEditorialParagraph = () => {
    // Group actionable items by tool
    const stripeItems: typeof actionableItems = []
    const posthogItems: typeof actionableItems = []
    const gmailItems: typeof actionableItems = []
    const intercomItems: typeof actionableItems = []
    const otherItems: typeof actionableItems = []

    actionableItems.forEach(item => {
      const text = `${cleanText(item.headline)} ${cleanText(item.detail)} ${(item.evidence || []).join(' ')}`.toLowerCase()
      if (text.includes('504') || text.includes('webhook') || text.includes('intercom') || text.includes('ticket') || text.includes('conversation')) {
        intercomItems.push(item)
      } else if (text.includes('usage') || text.includes('drop') || text.includes('decline') || text.includes('posthog') || text.includes('activity')) {
        posthogItems.push(item)
      } else if (text.includes('gmail') || text.includes('email') || text.includes('reply') || text.includes('inbox') || text.includes('thread')) {
        gmailItems.push(item)
      } else if (text.includes('billing') || text.includes('payment') || text.includes('card') || text.includes('stripe') || text.includes('invoice') || text.includes('cancelled') || text.includes('past due')) {
        stripeItems.push(item)
      } else {
        otherItems.push(item)
      }
    })

    const connectedProviders = new Set(
      (briefData?.integrations || [])
        .filter(i => i.status === 'connected')
        .map(i => i.provider.toLowerCase().replace(' ', '_'))
    )

    // Build tool-specific customer intelligence clauses
    const clauses: React.ReactNode[] = []

    // 1. Stripe
    if (connectedProviders.has('stripe') || stripeItems.length > 0) {
      if (stripeItems.length >= 2) {
        const name1 = getCleanAccountName(stripeItems[0])
        const name2 = getCleanAccountName(stripeItems[1])
        clauses.push(
          <span key="stripe">
            Across <InlineTool name="Stripe" icon="/logos/stripe.svg" />, {renderAccountLink(name1)} {getAccountReason(stripeItems[0])}, and {renderAccountLink(name2)} {getAccountReason(stripeItems[1])}.
          </span>
        )
      } else if (stripeItems.length === 1) {
        const name1 = getCleanAccountName(stripeItems[0])
        clauses.push(
          <span key="stripe">
            Across <InlineTool name="Stripe" icon="/logos/stripe.svg" />, {renderAccountLink(name1)} {getAccountReason(stripeItems[0])}.
          </span>
        )
      } else {
        clauses.push(
          <span key="stripe">
            Across <InlineTool name="Stripe" icon="/logos/stripe.svg" />, billing pipelines and subscriptions are active with no overdue invoices.
          </span>
        )
      }
    }

    // 2. PostHog
    if (connectedProviders.has('posthog') || posthogItems.length > 0) {
      if (posthogItems.length >= 2) {
        const name1 = getCleanAccountName(posthogItems[0])
        const name2 = getCleanAccountName(posthogItems[1])
        clauses.push(
          <span key="posthog">
            Across <InlineTool name="PostHog" icon="/logos/posthog.svg" />, {renderAccountLink(name1)} {getAccountReason(posthogItems[0])}, while {renderAccountLink(name2)} {getAccountReason(posthogItems[1])}.
          </span>
        )
      } else if (posthogItems.length === 1) {
        const name1 = getCleanAccountName(posthogItems[0])
        clauses.push(
          <span key="posthog">
            Across <InlineTool name="PostHog" icon="/logos/posthog.svg" />, {renderAccountLink(name1)} {getAccountReason(posthogItems[0])}.
          </span>
        )
      } else {
        clauses.push(
          <span key="posthog">
            Across <InlineTool name="PostHog" icon="/logos/posthog.svg" />, telemetry indicates steady user retention and healthy session engagement.
          </span>
        )
      }
    }

    // 3. Gmail
    if (connectedProviders.has('gmail') || gmailItems.length > 0) {
      if (gmailItems.length > 0) {
        const name1 = getCleanAccountName(gmailItems[0])
        clauses.push(
          <span key="gmail">
            Across <InlineTool name="Gmail" icon="/logos/gmail.svg" />, customer inquiries regarding {renderAccountLink(name1)} require follow-up.
          </span>
        )
      } else {
        clauses.push(
          <span key="gmail">
            Across <InlineTool name="Gmail" icon="/logos/gmail.svg" />, inbox threads are clear with no pending replies or unaddressed churn emails.
          </span>
        )
      }
    }

    // 4. Intercom
    if (connectedProviders.has('intercom') || intercomItems.length > 0) {
      if (intercomItems.length > 0) {
        const name1 = getCleanAccountName(intercomItems[0])
        clauses.push(
          <span key="intercom">
            Across <InlineTool name="Intercom" icon="/logos/intercom.svg" />, open customer conversations report that {renderAccountLink(name1)} {getAccountReason(intercomItems[0])}.
          </span>
        )
      } else {
        clauses.push(
          <span key="intercom">
            Across <InlineTool name="Intercom" icon="/logos/intercom.svg" />, customer support channels have no unresolved escalation tickets.
          </span>
        )
      }
    }

    // 5. Remaining non-categorized items
    if (otherItems.length > 0) {
      const topOther = otherItems.slice(0, 2)
      clauses.push(
        <span key="other">
          Additionally,{' '}
          {topOther.map((item, idx) => {
            const name = getCleanAccountName(item)
            return (
              <React.Fragment key={idx}>
                {renderAccountLink(name)} {getAccountReason(item)}
                {idx < topOther.length - 1 ? ', and ' : '.'}
              </React.Fragment>
            )
          })}
        </span>
      )
    }

    if (clauses.length === 0) {
      return (
        <p className="text-zinc-300 leading-relaxed text-[14.5px]">
          Across your connected workspace, all customer accounts are healthy. Subscriptions and communication channels are fully up to date with no detected payment failures or retention risks.
        </p>
      )
    }

    return (
      <p className="text-zinc-300 leading-relaxed text-[14.5px] space-x-1.5">
        {clauses.map((clause, idx) => (
          <React.Fragment key={idx}>
            {clause}{' '}
          </React.Fragment>
        ))}
      </p>
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
          <h1 className="text-[17px] font-medium tracking-tight">
            <span className="brief-shimmer-text">Brief</span>
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
          <div className="w-full pt-10 pb-36 h-full overflow-y-auto no-scrollbar [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
            {/* Header Greeting — Restored silver shimmer typography */}
            <div className="mb-2">
              <h2 className="text-[17px] font-medium tracking-tight text-white">
                <span className="silver-shimmer-text">Hey {userName}</span>, {greeting}.
              </h2>
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
                {/* Single Cohesive Editorial Narrative */}
                {renderEditorialParagraph()}

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
