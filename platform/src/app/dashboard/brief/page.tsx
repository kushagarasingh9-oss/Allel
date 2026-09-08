'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useChatContext } from '@/ui/chat/chat-provider'
import { DevinChatBox } from '@/ui/primitives/devin-chat-box'
import { createClient } from '@/foundation/database/client'
import {
  RefreshCw,
  ArrowRight,
  ShieldCheck,
  Zap,
  AlertTriangle,
  Sparkles,
  CheckCircle2,
  ExternalLink,
} from 'lucide-react'

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

const PROVIDER_LABELS: Record<string, string> = {
  stripe: 'Stripe',
  gmail: 'Gmail',
  posthog: 'PostHog',
  intercom: 'Intercom',
  slack: 'Slack',
  hubspot: 'HubSpot',
  linear: 'Linear',
  sentry: 'Sentry',
  google_calendar: 'Google Calendar',
}

const CORE_INTEGRATIONS = [
  {
    provider: 'stripe',
    name: 'Stripe',
    icon: '/logos/stripe.svg',
    tag: 'Billing & Subscriptions',
    desc: 'Monitors failed card charges, dunning retry attempts, and subscription churn.',
  },
  {
    provider: 'gmail',
    name: 'Gmail',
    icon: '/logos/gmail.svg',
    tag: 'Customer Inbox',
    desc: 'Surfaces unanswered founder threads, customer churn signals, and invoice updates.',
  },
  {
    provider: 'posthog',
    name: 'PostHog',
    icon: '/logos/posthog.svg',
    tag: 'Product Telemetry',
    desc: 'Flags feature usage decay, session drop-offs, and cancellation export events.',
  },
  {
    provider: 'intercom',
    name: 'Intercom',
    icon: '/logos/intercom.svg',
    tag: 'Support Messaging',
    desc: 'Catches dissatisfaction sentiment, complaint trends, and unresolved blockers.',
  },
  {
    provider: 'slack',
    name: 'Slack',
    icon: '/logos/slack.svg',
    tag: 'Team Escalations',
    desc: 'Dispatches real-time at-risk customer alerts and daily retention digests.',
  },
]

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

function formatCurrency(cents: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(cents / 100)
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

  // Format summary text into paragraphs with rich inline badges for detected providers
  const renderFormattedSummary = (text: string) => {
    if (!text) return null

    const sentences = text.split(/(?<=\.)\s+/).filter(s => s.trim().length > 0)
    if (sentences.length === 0) {
      return <p className="leading-relaxed text-zinc-300">{text}</p>
    }

    return (
      <div className="space-y-3 text-zinc-300 text-[14.5px] leading-relaxed">
        {sentences.map((sentence, idx) => {
          const trimmed = sentence.trim()
          // Match tool prefixes like "Gmail:", "Stripe:", "PostHog:", etc.
          const match = trimmed.match(
            /^(Gmail|Stripe|PostHog|Intercom|Slack|Linear|Sentry|HubSpot):\s*(.*)$/i
          )

          if (match) {
            const providerName = match[1]
            const rest = match[2]
            const providerKey = providerName.toLowerCase().replace(' ', '_')
            const icon = PROVIDER_ICONS[providerKey] || '/logos/account.svg'

            return (
              <p key={idx}>
                In <InlineTool name={providerName} icon={icon} />, {rest}
              </p>
            )
          }

          return <p key={idx}>{trimmed}</p>
        })}
      </div>
    )
  }

  return (
    <div className="flex flex-col h-screen w-full bg-[#0d0d0f] text-[#F4F4F5] relative overflow-hidden font-sans select-none">
      {/* Clean Top Header */}
      <header className="h-12 px-8 flex items-center justify-between shrink-0 bg-[#0d0d0f] z-30 border-b border-white/[0.04]">
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
          {hasConnectedIntegrations && (
            <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-white/[0.03] border border-white/[0.06] text-xs text-zinc-400">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
              <span>
                {connectedIntegrations.length}{' '}
                {connectedIntegrations.length === 1 ? 'source' : 'sources'} connected
              </span>
            </div>
          )}

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
          <div className="w-full pt-8 pb-36 h-full overflow-y-auto">
            {/* Header Greeting */}
            <div className="mb-6">
              <h2 className="text-[19px] font-medium tracking-tight text-white">
                <span className="silver-shimmer-text">Hey {userName}</span>, {greeting}.
              </h2>
              {headlineText && (
                <p className="text-xs text-zinc-400 mt-1 font-normal">
                  {headlineText}
                </p>
              )}
            </div>

            {/* Loading Skeleton */}
            {isLoading && !briefData && (
              <div className="space-y-4 animate-pulse pt-2">
                <div className="h-4 bg-white/[0.04] rounded w-3/4" />
                <div className="h-4 bg-white/[0.04] rounded w-full" />
                <div className="h-4 bg-white/[0.04] rounded w-5/6" />
                <div className="h-24 bg-white/[0.02] border border-white/[0.04] rounded-xl mt-6" />
              </div>
            )}

            {/* State 1: New User / Zero Integrations Onboarding State */}
            {!isLoading && !hasConnectedIntegrations && (
              <div className="space-y-6 animate-in fade-in duration-200">
                <div className="p-5 rounded-xl border border-white/[0.08] bg-white/[0.02] space-y-3">
                  <div className="flex items-center gap-2 text-amber-400 text-xs font-medium">
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Autonomous Daily Brief</span>
                  </div>
                  <h3 className="text-[16px] font-medium text-white tracking-tight">
                    Connect your workspace tools to activate your daily brief
                  </h3>
                  <p className="text-sm text-zinc-400 leading-relaxed">
                    Allel operates as your autonomous retention co-pilot. Every morning at 4:00 AM, the agent reviews customer accounts across your connected billing, product telemetry, and communications to flag churn risks, detect failed payments, and queue follow-up drafts for your approval.
                  </p>
                  <div className="pt-2">
                    <button
                      onClick={() => router.push('/dashboard/connections')}
                      className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-lg bg-white text-zinc-950 font-medium text-xs hover:bg-zinc-200 transition-colors cursor-pointer"
                    >
                      <span>Connect Integrations</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                <div>
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-3">
                    Supported Integrations
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {CORE_INTEGRATIONS.map(item => (
                      <div
                        key={item.provider}
                        className="p-3.5 rounded-xl border border-white/[0.06] bg-white/[0.02] hover:border-white/[0.12] transition-colors flex flex-col justify-between gap-3"
                      >
                        <div className="flex items-start gap-3">
                          <div className="w-8 h-8 rounded-lg bg-white/[0.04] border border-white/[0.08] flex items-center justify-center shrink-0">
                            <img
                              src={item.icon}
                              alt={item.name}
                              className="w-4 h-4 object-contain"
                            />
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium text-white">{item.name}</span>
                              <span className="text-[10px] text-zinc-500 font-normal">
                                {item.tag}
                              </span>
                            </div>
                            <p className="text-xs text-zinc-400 mt-1 leading-relaxed">
                              {item.desc}
                            </p>
                          </div>
                        </div>

                        <button
                          onClick={() => router.push('/dashboard/connections')}
                          className="self-end text-xs font-medium text-zinc-400 hover:text-white flex items-center gap-1 transition-colors cursor-pointer"
                        >
                          <span>Connect</span>
                          <ArrowRight className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* State 2: Active Workspace Brief */}
            {!isLoading && hasConnectedIntegrations && (
              <div className="space-y-6 animate-in fade-in duration-200 pb-4">
                {/* Active Integrations Bar */}
                <div className="flex flex-wrap items-center gap-2 py-1">
                  <span className="text-xs text-zinc-500 mr-1">Active sources:</span>
                  {connectedIntegrations.map(conn => {
                    const label = PROVIDER_LABELS[conn.provider] || conn.provider
                    const icon = PROVIDER_ICONS[conn.provider] || '/logos/account.svg'
                    return <InlineTool key={conn.provider} name={label} icon={icon} />
                  })}
                </div>

                {/* Executive Summary */}
                {summaryText ? (
                  renderFormattedSummary(summaryText)
                ) : (
                  <p className="text-sm text-zinc-400">
                    No anomalies or updates recorded in this cycle. All connected sources are monitored.
                  </p>
                )}

                {/* Actionable Accounts Section */}
                {actionableItems.length > 0 ? (
                  <div className="pt-3 space-y-3">
                    <div className="flex items-center justify-between border-b border-white/[0.06] pb-2">
                      <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                        Priority Accounts &amp; Actions
                      </h3>
                      <span className="text-xs text-zinc-500">
                        {actionableItems.length}{' '}
                        {actionableItems.length === 1 ? 'account flagged' : 'accounts flagged'}
                      </span>
                    </div>

                    <div className="space-y-3">
                      {actionableItems.map((item, idx) => {
                        const accountName =
                          item.customer_accounts?.name || item.headline.split(' ')[0]
                        const mrr = item.customer_accounts?.mrr_cents
                          ? formatCurrency(item.customer_accounts.mrr_cents) + '/mo'
                          : null

                        return (
                          <div
                            key={item.id || idx}
                            className="p-4 rounded-xl border border-white/[0.08] bg-white/[0.02] hover:bg-white/[0.04] transition-all"
                          >
                            <div className="flex items-center justify-between gap-3">
                              <div className="flex items-center gap-2">
                                <span
                                  onClick={() => handleSubmit(`Inspect customer ${accountName}`)}
                                  className="text-[14.5px] font-semibold text-white hover:underline cursor-pointer"
                                >
                                  {accountName}
                                </span>
                                {mrr && (
                                  <span className="text-xs font-mono bg-white/[0.06] px-1.5 py-0.5 rounded text-zinc-300">
                                    {mrr}
                                  </span>
                                )}
                              </div>

                              <span
                                className={`text-[11px] font-medium px-2 py-0.5 rounded-full border ${
                                  item.risk_level === 'high'
                                    ? 'border-red-500/30 bg-red-500/10 text-red-400'
                                    : item.risk_level === 'medium'
                                    ? 'border-amber-500/30 bg-amber-500/10 text-amber-400'
                                    : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
                                }`}
                              >
                                {item.risk_level === 'high'
                                  ? 'High Risk'
                                  : item.risk_level === 'medium'
                                  ? 'Medium Risk'
                                  : 'Low Risk'}
                              </span>
                            </div>

                            <p className="text-sm text-zinc-300 mt-2 leading-relaxed">
                              {item.headline}
                            </p>

                            {item.detail && item.detail !== item.headline && (
                              <p className="text-xs text-zinc-400 mt-1.5 leading-relaxed">
                                {item.detail}
                              </p>
                            )}

                            {item.evidence && item.evidence.length > 0 && (
                              <div className="flex flex-wrap gap-1.5 mt-2.5">
                                {item.evidence.slice(0, 3).map((ev, eIdx) => (
                                  <span
                                    key={eIdx}
                                    className="text-[11px] text-zinc-400 bg-white/[0.04] border border-white/[0.06] px-2 py-0.5 rounded-md"
                                  >
                                    {ev}
                                  </span>
                                ))}
                              </div>
                            )}

                            {item.next_step && (
                              <div className="mt-3 pt-2.5 border-t border-white/[0.06] flex items-center justify-between">
                                <span className="text-xs text-zinc-400">
                                  Action: <span className="text-zinc-200">{item.next_step}</span>
                                </span>
                                <button
                                  onClick={() =>
                                    handleSubmit(
                                      `Execute action for ${accountName}: ${item.next_step}`
                                    )
                                  }
                                  className="text-xs font-medium text-blue-400 hover:text-blue-300 flex items-center gap-1 transition-colors cursor-pointer"
                                >
                                  <span>Take action</span>
                                  <ArrowRight className="w-3 h-3" />
                                </button>
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                ) : (
                  <div className="p-4 rounded-xl border border-emerald-500/20 bg-emerald-500/[0.04] flex items-start gap-3">
                    <ShieldCheck className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                    <div>
                      <h4 className="text-sm font-medium text-emerald-300">
                        All accounts are healthy
                      </h4>
                      <p className="text-xs text-zinc-400 mt-1 leading-relaxed">
                        No critical churn risks, gateway timeouts, or failed payment retries were detected across your connected sources during the latest audit run.
                      </p>
                    </div>
                  </div>
                )}

                {/* Quick Action Suggestions */}
                <div className="pt-2">
                  <span className="text-xs text-zinc-500 block mb-2">Quick prompts:</span>
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => handleSubmit('Inspect all high-risk accounts and root causes')}
                      className="text-xs px-2.5 py-1 rounded-md bg-white/[0.04] hover:bg-white/[0.08] text-zinc-300 hover:text-white border border-white/[0.06] transition-colors cursor-pointer"
                    >
                      Inspect all high-risk accounts
                    </button>
                    <button
                      onClick={() => handleSubmit('Draft recovery emails for past-due accounts')}
                      className="text-xs px-2.5 py-1 rounded-md bg-white/[0.04] hover:bg-white/[0.08] text-zinc-300 hover:text-white border border-white/[0.06] transition-colors cursor-pointer"
                    >
                      Draft recovery emails
                    </button>
                    <button
                      onClick={() => handleSubmit('Audit customer health across Stripe and PostHog')}
                      className="text-xs px-2.5 py-1 rounded-md bg-white/[0.04] hover:bg-white/[0.08] text-zinc-300 hover:text-white border border-white/[0.06] transition-colors cursor-pointer"
                    >
                      Audit customer health
                    </button>
                  </div>
                </div>
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
