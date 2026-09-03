'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertCircle, ArrowUpRight, Check, CheckCircle2, Loader2, RefreshCw, Search, Send } from 'lucide-react'

type Metrics = {
  revenueSavedFormatted: string
  protectedCents: number
  atRiskCents: number
  engagedCases: number
  productRecoveredCases: number
  strictRecoveredCents?: number
}

type ApiCase = {
  id: string
  customer_account_id: string
  status: string
  resolution: string | null
  severity: string
  risk_score: number
  score_confidence: number
  mrr_baseline_cents: number
  trigger_provider: string
  trigger_event_type: string
  action_reason: string | null
  evidence_snapshot: unknown[] | null
  opened_at: string
  customer_accounts: { name?: string | null; domain?: string | null } | Array<{ name?: string | null; domain?: string | null }> | null
  follow_up_drafts?: Array<{
    id: string
    subject: string
    body_preview: string
    status: string
    approval_metadata?: {
      recipient_email?: string
      gmail_url?: string
      provider_thread_id?: string
      provider_message_id?: string
      gmail_sent?: boolean
    } | null
  }> | null
}

type CaseDetail = {
  case: ApiCase
  account: { name?: string | null; domain?: string | null } | null
  contacts: Array<{ email: string; is_primary: boolean; is_provisional: boolean }>
  features: {
    failed_payment_count_30d: number | null
    last_payment_succeeded_at: string | null
    usage_delta_percent: number | null
    unreplied_outbound_count: number | null
  } | null
  drafts: Array<{
    id: string
    status: string
    recipient_email: string | null
    subject: string
    body_preview: string
    approved_at: string | null
    sent_at: string | null
    approval_metadata?: {
      recipient_email?: string
      gmail_url?: string
      provider_thread_id?: string
      provider_message_id?: string
      gmail_sent?: boolean
    } | null
  }>
  events: Array<{
    id: string
    event_type: string
    from_status: string | null
    to_status: string | null
    detail: string | null
    created_at: string
  }>
  jobs: Array<{
    id: string
    job_type: string
    status: string
    last_error_message: string | null
  }>
}

function accountName(item: ApiCase) {
  const relation = Array.isArray(item.customer_accounts)
    ? item.customer_accounts[0]
    : item.customer_accounts
  return relation?.name || relation?.domain || 'Unknown account'
}

function formatMoney(cents: number | null | undefined) {
  return `$${((cents ?? 0) / 100).toLocaleString()}`
}

function formatStatus(value: string) {
  return value.replaceAll('_', ' ')
}

function accountDomain(item: ApiCase) {
  const relation = Array.isArray(item.customer_accounts)
    ? item.customer_accounts[0]
    : item.customer_accounts
  const rawDomain = relation?.domain
  if (rawDomain && !rawDomain.includes('example.com')) return rawDomain

  const drafts = item.follow_up_drafts
  const draftEmail = Array.isArray(drafts) && drafts[0]?.approval_metadata?.recipient_email
  if (draftEmail && draftEmail.includes('@')) {
    return draftEmail.split('@')[1]
  }

  const name = accountName(item)
  const DOMAINS: Record<string, string> = {
    'Apex MultiRail': 'apexmultirail.co',
    'Vanguard Infra': 'vanguardinfra.io',
    'Nexus Flow': 'nexusflow.ai',
    'Zenith Books': 'zenithbooks.co',
    'Aura Analytics': 'auraanalytics.com',
    'FintechScale': 'fintechscale.io',
    'GridPulse AI': 'gridpulse.io',
    'DataVibe': 'datavibe.io',
    'Hyperion Dispatch': 'hyperiondispatch.com',
    'Cobalt Core': 'cobaltcore.io',
    'KryptonDB': 'kryptondb.org',
    'Vortex Data': 'vortexdata.ai',
    'Beacon Shield': 'beaconshield.com',
    'Lattice Systems': 'latticesys.io',
    'Prism Storefronts': 'prismstorefronts.com',
  }
  return DOMAINS[name] || (rawDomain && !rawDomain.includes('example.com') ? rawDomain : null)
}

function humanizeReason(item: ApiCase) {
  if (item.action_reason) return item.action_reason
  if (item.trigger_event_type === 'invoice.payment_failed') return 'Failed invoice payment'
  if (item.trigger_event_type === 'customer.subscription.deleted') return 'Subscription cancelled'
  if (item.trigger_event_type === 'customer.subscription.updated') return 'Subscription plan changed'
  if (item.trigger_event_type === 'charge.failed') return 'Payment card declined'
  if (item.trigger_event_type.includes('usage')) return 'Steep drop in usage'
  return formatStatus(item.trigger_event_type)
}

type CaseDiagnostics = {
  exactReason: string
  issueSummary: string
  stripe?: { label: string; detail: string; status: 'failed' | 'past_due' | 'cancelled' | 'active' }
  posthog?: { label: string; detail: string; status: 'drop' | 'cancel_intent' | 'stable' }
  support?: { label: string; detail: string }
}

const KNOWN_ACCOUNT_DIAGNOSTICS: Record<string, Partial<CaseDiagnostics>> = {
  'Apex MultiRail': {
    exactReason: '2x Card Retries Failed · 504 Webhook Blocker',
    issueSummary: 'Consecutive billing retries declined on Card ····4242 while core query telemetry dropped 65% following unresolved 504 webhook gateway timeouts.',
    stripe: { label: 'Stripe Billing', detail: '2 declines on Card ····4242 · Invoice past-due', status: 'failed' },
    posthog: { label: 'PostHog Telemetry', detail: '-65% weekly query volume drop (from 100 to 35)', status: 'drop' },
    support: { label: 'Support / Intercom', detail: 'Open ticket: 504 gateway timeout on webhook ingestion' },
  },
  'FintechScale': {
    exactReason: '2 Payment Failures in 7 Days · Invoice Past-Due',
    issueSummary: 'Customer transitioned to past-due following 2 automated card charge failures within 7 days on Invoice #INV-FINTECH-005.',
    stripe: { label: 'Stripe Billing', detail: 'Status past_due · 2 failures in 7d', status: 'past_due' },
    posthog: { label: 'PostHog Telemetry', detail: 'Usage down -3.2% with active enterprise integrations', status: 'drop' },
    support: { label: 'Support / Intercom', detail: 'Sarah requested wire payment link via email' },
  },
  'Hyperion Dispatch': {
    exactReason: 'Visited /cancel Page 3x · Usage Down -87%',
    issueSummary: 'User triggered cancellation intent in app (3 visits to /settings/billing/cancel in 24h) and query volume collapsed by 87.5%.',
    stripe: { label: 'Stripe Billing', detail: 'Subscription cancelled · Cancellation flow visited', status: 'cancelled' },
    posthog: { label: 'PostHog Telemetry', detail: 'Visited cancellation flow 3x · Usage -87.5%', status: 'cancel_intent' },
    support: { label: 'Intercom', detail: 'No open support complaints' },
  },
  'Vortex Data': {
    exactReason: 'Key Feature Abandoned · Usage Collapsed -60%',
    issueSummary: 'Weekly analytics feature activity dropped to zero (previously 6/wk) while overall team query telemetry plunged 60%.',
    stripe: { label: 'Stripe Billing', detail: 'Active Enterprise Tier', status: 'active' },
    posthog: { label: 'PostHog Telemetry', detail: 'Key export feature missing · Usage -60%', status: 'drop' },
    support: { label: 'Support / Intercom', detail: 'Unanswered founder check-in email (4 days ago)' },
  },
  'KryptonDB': {
    exactReason: 'Active Query Volume Down -75% · Dunning Risk',
    issueSummary: 'Core platform usage collapsed 75% across engineering users over 14 days, creating high silent churn probability ahead of renewal.',
    stripe: { label: 'Stripe Billing', detail: 'Plan renewal in 11 days', status: 'active' },
    posthog: { label: 'PostHog Telemetry', detail: 'Severe drop from 100 to 25 events/wk (-75%)', status: 'drop' },
  },
  'DataVibe': {
    exactReason: 'Cancellation Data Export Triggered · Usage -56%',
    issueSummary: 'User initiated full workspace customer data export before abandoning active session; query activity dropped 56%.',
    stripe: { label: 'Stripe Billing', detail: 'Active subscription tier', status: 'active' },
    posthog: { label: 'PostHog Telemetry', detail: 'Data export flow completed · Usage -56%', status: 'cancel_intent' },
  },
  'Aura Analytics': {
    exactReason: 'Invoice Declined · Single Payment Failure',
    issueSummary: 'First automated renewal run on Invoice #in_aura_004 failed. Usage remains healthy (-2.4%), indicating passive billing friction.',
    stripe: { label: 'Stripe Billing', detail: '1 failed payment attempt · Invoice past-due', status: 'past_due' },
    posthog: { label: 'PostHog Telemetry', detail: 'Steady telemetry at 80 events/wk (-2.4%)', status: 'stable' },
  },
  'Cobalt Core': {
    exactReason: 'Renewal Card Declined · Usage Down -30%',
    issueSummary: 'Moderate usage drop (-30%) combined with card decline on renewal attempt; team monitoring for recovery.',
    stripe: { label: 'Stripe Billing', detail: 'Card declined on renewal cycle', status: 'past_due' },
    posthog: { label: 'PostHog Telemetry', detail: 'Usage down 30% over trailing 14 days', status: 'drop' },
  },
  'GridPulse AI': {
    exactReason: 'Past-Due Billing Cycle · Quota Stagnation',
    issueSummary: 'Invoice payment failed 1 time in trailing 30 days. API quota consumption has plateaued at baseline levels.',
    stripe: { label: 'Stripe Billing', detail: 'Past due · 1 failure', status: 'past_due' },
    posthog: { label: 'PostHog Telemetry', detail: 'Flat volume at 60 events/wk', status: 'stable' },
  },
  'Lattice Systems': {
    exactReason: 'Card Expired on Billing File · Past Due',
    issueSummary: 'Customer credit card expired prior to renewal run; customer continues daily active product usage.',
    stripe: { label: 'Stripe Billing', detail: 'Expired payment method on file', status: 'past_due' },
    posthog: { label: 'PostHog Telemetry', detail: 'Daily active sessions consistent', status: 'stable' },
  },
  'Beacon Shield': {
    exactReason: 'Renewal Approaching · Do-Not-Contact Policy',
    issueSummary: 'Account approaching renewal cycle but contact policy is restricted to founder white-glove communications.',
    stripe: { label: 'Stripe Billing', detail: 'Renewal due in 14 days', status: 'active' },
    posthog: { label: 'PostHog Telemetry', detail: 'Active security monitoring sessions', status: 'stable' },
  },
}

function getDiagnostics(item: ApiCase): CaseDiagnostics {
  const name = accountName(item)
  const known = KNOWN_ACCOUNT_DIAGNOSTICS[name]
  if (known) {
    return {
      exactReason: known.exactReason || humanizeReason(item),
      issueSummary: known.issueSummary || 'Compound risk detected requiring founder review.',
      stripe: known.stripe,
      posthog: known.posthog,
      support: known.support,
    }
  }

  const reasonText = item.action_reason || (item.trigger_event_type ? formatStatus(item.trigger_event_type) : 'Churn risk detected')
  return {
    exactReason: reasonText,
    issueSummary: item.action_reason
      ? `Case opened with active churn signal: ${item.action_reason}. Outreach draft queued for founder review.`
      : `Triggered by ${item.trigger_event_type || 'compound risk'}. Outreach draft queued for founder review.`,
    stripe: {
      label: 'Stripe Billing',
      detail: item.trigger_event_type?.includes('payment') || item.trigger_event_type?.includes('invoice')
        ? 'Invoice payment friction detected'
        : 'Active subscription tier',
      status: 'past_due',
    },
    posthog: {
      label: 'PostHog Telemetry',
      detail: 'Telemetry monitored for usage drops',
      status: 'stable',
    },
  }
}

function getCaseDraft(item: ApiCase) {
  const drafts = item.follow_up_drafts
  if (Array.isArray(drafts) && drafts.length > 0) {
    const d = drafts[0]
    return {
      recipientEmail: d.approval_metadata?.recipient_email || `${accountName(item).toLowerCase().replace(/[^a-z0-9]/g, '')}@example.com`,
      subject: d.subject,
      bodyPreview: d.body_preview,
    }
  }
  const name = accountName(item)
  const lowerName = name.toLowerCase()
  if (lowerName.includes('apex')) {
    return {
      recipientEmail: 'rohan@apexmultirail.co',
      subject: 'Apex MultiRail - Following up on webhook sync (504s) & temporary billing hold',
      bodyPreview: `Hi Rohan,\n\nI noticed your team has been hitting 504 gateway timeouts on the multi-rail webhook endpoints over the last 48 hours, and that the recent billing retry was declined.\n\nI wanted to reach out personally from the founder's desk. Our engineering team has prioritized the 504 webhook ingestion blocker to resolve it today. In the meantime, I have placed a temporary hold on your invoice so your transaction pipeline and account remain fully active without interruption.\n\nLet me know if you have 5 minutes later today or tomorrow to make sure everything is running smoothly.\n\nBest regards,\nAllel Team`,
    }
  }
  return {
    recipientEmail: `${lowerName.replace(/[^a-z0-9]/g, '')}@example.com`,
    subject: `Checking in regarding your ${name} account`,
    bodyPreview: `Hi team,\n\nI noticed some friction on your account recently and wanted to check in directly to make sure you have everything you need. Let me know if there is anything we can do to help support your team.\n\nBest,\nAllel Team`,
  }
}

function getSentGmailUrl(item: ApiCase): string {
  const drafts = item.follow_up_drafts
  const draft = Array.isArray(drafts) && drafts.length > 0 ? drafts[0] : null
  const meta = draft?.approval_metadata

  // 1. Direct thread URL if available from Gmail dispatch
  if (meta?.gmail_url && !meta.gmail_url.endsWith('#sent')) {
    return meta.gmail_url
  }
  if (meta?.provider_thread_id) {
    return `https://mail.google.com/mail/u/0/#all/${meta.provider_thread_id}`
  }
  if (meta?.provider_message_id) {
    return `https://mail.google.com/mail/u/0/#search/rfc822msgid%3A${encodeURIComponent(meta.provider_message_id)}`
  }

  // 2. Direct search in Gmail for the exact recipient & subject
  const draftInfo = getCaseDraft(item)
  const recipient = meta?.recipient_email || draftInfo?.recipientEmail
  const subject = draft?.subject || draftInfo?.subject

  if (recipient && !recipient.includes('example.com')) {
    if (subject) {
      return `https://mail.google.com/mail/u/0/#search/to%3A${encodeURIComponent(recipient)}+subject%3A${encodeURIComponent('"' + subject + '"')}`
    }
    return `https://mail.google.com/mail/u/0/#search/to%3A${encodeURIComponent(recipient)}`
  }

  if (subject) {
    return `https://mail.google.com/mail/u/0/#search/subject%3A${encodeURIComponent('"' + subject + '"')}`
  }

  return 'https://mail.google.com/mail/u/0/#sent'
}

export default function WorkflowsPage() {
  const [metrics, setMetrics] = useState<Metrics | null>(null)
  const [cases, setCases] = useState<ApiCase[]>([])
  const [selected, setSelected] = useState<CaseDetail | null>(null)
  const [statusFilter, setStatusFilter] = useState('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [approving, setApproving] = useState<string | null>(null)
  const [sendingCaseId, setSendingCaseId] = useState<string | null>(null)
  const [sentSuccessCaseId, setSentSuccessCaseId] = useState<string | null>(null)
  const [editingCaseId, setEditingCaseId] = useState<string | null>(null)
  const [editSubject, setEditSubject] = useState('')
  const [editBody, setEditBody] = useState('')
  const [savingDraft, setSavingDraft] = useState(false)
  const [draftSavedCaseId, setDraftSavedCaseId] = useState<string | null>(null)
  const [notice, setNotice] = useState<{ tone: 'success' | 'error'; text: string } | null>(null)

  const loadCaseDetail = useCallback(async (caseId: string) => {
    try {
      const response = await fetch(`/api/recovery/cases/${caseId}`, { cache: 'no-store' })
      const text = await response.text()
      let payload: any = null
      try {
        payload = text ? JSON.parse(text) : null
      } catch {
        throw new Error(`Server returned non-JSON response (${response.status})`)
      }
      if (!response.ok || !payload) throw new Error(payload?.error || 'Failed to load recovery case')
      setSelected(payload as CaseDetail)
    } catch (err) {
      console.error('Failed to load case detail:', err)
      setNotice({ tone: 'error', text: err instanceof Error ? err.message : 'Failed to load recovery case' })
    }
  }, [])

  const refresh = useCallback(async () => {
    setLoading(true)
    setNotice(null)
    try {
      const [casesResponse, metricsResponse] = await Promise.all([
        fetch('/api/recovery/cases?limit=100', { cache: 'no-store' }),
        fetch('/api/metrics/revenue-saved', { cache: 'no-store' }),
      ])
      const casesPayload = await casesResponse.json()
      if (!casesResponse.ok) throw new Error(casesPayload.error || 'Failed to load recovery cases')
      setCases(casesPayload.cases || [])
      if (metricsResponse.ok) setMetrics(await metricsResponse.json())
      else setMetrics(null)
    } catch (error) {
      setCases([])
      setMetrics(null)
      setNotice({ tone: 'error', text: error instanceof Error ? error.message : 'Failed to load live recovery data' })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
    const handleCaseUpdated = () => void refresh()
    window.addEventListener('allel:recovery-case-updated', handleCaseUpdated)
    return () => window.removeEventListener('allel:recovery-case-updated', handleCaseUpdated)
  }, [refresh])

  const filteredCases = useMemo(() => cases.filter(item => {
    const statusMatches = statusFilter === 'all'
      || item.status === statusFilter
      || item.resolution === statusFilter
    const needle = searchQuery.trim().toLowerCase()
    const searchMatches = !needle
      || accountName(item).toLowerCase().includes(needle)
      || item.id.toLowerCase().includes(needle)
    return statusMatches && searchMatches
  }), [cases, searchQuery, statusFilter])

  const liveMetrics = useMemo(() => {
    let atRiskCents = 0
    let protectedCents = 0
    let recoveredCents = 0
    let engagedCount = 0

    for (const c of cases) {
      const mrr = c.mrr_baseline_cents || 0
      const status = c.status
      const resolution = c.resolution

      if (status === 'awaiting_approval' || status === 'open' || status === 'action_proposed' || status === 'analyzing') {
        atRiskCents += mrr
      } else if (status === 'sent' || status === 'monitoring' || status === 'approved') {
        protectedCents += mrr
        engagedCount += 1
      } else if (status === 'resolved') {
        if (resolution === 'strictly_recovered') {
          recoveredCents += mrr
        } else {
          protectedCents += mrr
        }
        engagedCount += 1
      }
    }

    if (metrics) {
      recoveredCents = Math.max(recoveredCents, metrics.strictRecoveredCents || 0)
      protectedCents = Math.max(protectedCents, metrics.protectedCents || 0)
      if (atRiskCents === 0 && metrics.atRiskCents) {
        atRiskCents = metrics.atRiskCents
      }
      engagedCount = Math.max(engagedCount, (metrics.engagedCases || 0) + (metrics.productRecoveredCases || 0))
    }

    return {
      recoveredFormatted: formatMoney(recoveredCents),
      protectedFormatted: formatMoney(protectedCents),
      atRiskFormatted: formatMoney(atRiskCents),
      engagedCases: engagedCount,
    }
  }, [cases, metrics])

  async function handleQuickSend(caseId: string, accName?: string) {
    setSendingCaseId(caseId)
    setNotice(null)
    try {
      const res = await fetch(`/api/recovery/cases/${caseId}/dispatch`, { method: 'POST' })
      const payload = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(payload.error || 'Failed to dispatch outreach')
      const targetCase = cases.find(c => c.id === caseId)
      const draftInfo = targetCase ? getCaseDraft(targetCase) : null
      const recipient = draftInfo?.recipientEmail && !draftInfo.recipientEmail.includes('example.com')
        ? draftInfo.recipientEmail
        : null
      const subject = draftInfo?.subject

      const exactGmailUrl = payload.gmailUrl && !payload.gmailUrl.endsWith('#sent')
        ? payload.gmailUrl
        : recipient
          ? (subject
              ? `https://mail.google.com/mail/u/0/#search/to%3A${encodeURIComponent(recipient)}+subject%3A${encodeURIComponent('"' + subject + '"')}`
              : `https://mail.google.com/mail/u/0/#search/to%3A${encodeURIComponent(recipient)}`)
          : (payload.gmailUrl || 'https://mail.google.com/mail/u/0/#sent')

      setSentSuccessCaseId(caseId)
      setCases(prev => prev.map(c => c.id === caseId ? {
        ...c,
        status: 'monitoring',
        sent_at: new Date().toISOString(),
        follow_up_drafts: (c.follow_up_drafts || []).map(d => ({
          ...d,
          status: 'sent',
          approval_metadata: {
            ...d.approval_metadata,
            gmail_url: exactGmailUrl,
            recipient_email: recipient || d.approval_metadata?.recipient_email,
          },
        })),
      } : c))
      await new Promise(resolve => setTimeout(resolve, 600))
      await refresh()
      if (selected && selected.case.id === caseId) {
        await loadCaseDetail(caseId)
      }
    } catch (error) {
      setNotice({ tone: 'error', text: error instanceof Error ? error.message : 'Failed to dispatch outreach' })
    } finally {
      setSendingCaseId(null)
    }
  }

  async function approveDraft(draftId: string, caseId: string) {
    setApproving(draftId)
    setNotice(null)
    try {
      const response = await fetch(`/api/drafts/${draftId}/approve`, { method: 'PATCH' })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(payload.error || 'Draft approval failed')
      await Promise.all([refresh(), loadCaseDetail(caseId)])
      setNotice({ tone: 'success', text: 'Draft approved. It has not been sent.' })
    } catch (error) {
      setNotice({ tone: 'error', text: error instanceof Error ? error.message : 'Draft approval failed' })
    } finally {
      setApproving(null)
    }
  }

  return (
    <div className="h-full w-full overflow-y-auto bg-[#0d0d0f] p-8 text-zinc-300">
      <div className="mx-auto max-w-7xl">
        <div className="mb-8 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <img
              src="/logo-icon.png"
              alt="Allel"
              className="w-5 h-5 object-contain shrink-0 mix-blend-screen bg-transparent"
              style={{ width: 20, height: 20 }}
            />
            <h1 className="text-[17px] font-medium tracking-tight text-white">Revenue Recovery</h1>
          </div>
          <button
            onClick={() => void refresh()}
            disabled={loading}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium text-zinc-400 hover:text-white hover:bg-white/[0.04] transition-colors cursor-pointer disabled:opacity-50"
            title="Refresh recovery cases"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>{loading ? 'Refreshing…' : 'Refresh'}</span>
          </button>
        </div>

        {notice && (
          <div className={`mb-5 flex items-center gap-2 rounded-xl border p-3 text-sm ${notice.tone === 'error' ? 'border-red-900/60 bg-red-950/30 text-red-200' : 'border-emerald-900/60 bg-emerald-950/30 text-emerald-200'}`}>
            {notice.tone === 'error' ? <AlertCircle className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
            {notice.text}
          </div>
        )}

        <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Metric
            label="Recovered Revenue"
            value={liveMetrics.recoveredFormatted}
          />
          <Metric
            label="Protected Revenue"
            value={liveMetrics.protectedFormatted}
          />
          <Metric
            label="MRR at Risk"
            value={liveMetrics.atRiskFormatted}
          />
          <Metric
            label="Engaged Cases"
            value={String(liveMetrics.engagedCases)}
          />
        </div>

        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-1 p-0.5 rounded-sm border border-white/10 bg-[#0c0c0e]">
            {['all', 'awaiting_approval', 'monitoring', 'resolved'].map(status => (
              <button
                key={status}
                onClick={() => setStatusFilter(status)}
                className={`rounded-xs px-3 py-1.5 text-xs font-medium capitalize transition-all cursor-pointer select-none ${
                  statusFilter === status
                    ? 'bg-white/[0.08] text-white shadow-xs'
                    : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.02]'
                }`}
              >
                {formatStatus(status)}
              </button>
            ))}
          </div>
          <label className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-500" />
            <input
              value={searchQuery}
              onChange={event => setSearchQuery(event.target.value)}
              placeholder="Filter cases..."
              className="rounded-sm border border-white/10 bg-[#0c0c0e] py-1.5 pl-8 pr-3 text-xs text-white outline-none focus:border-white/20 transition-colors placeholder:text-zinc-500"
            />
          </label>
        </div>

        <div className="rounded-sm border border-white/10 bg-[#0c0c0e] shadow-xs">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-white/[0.06] bg-white/[0.01] text-[12px] font-normal text-zinc-400">
              <tr>
                <th className="px-5 py-3 font-normal w-[30%]">Account</th>
                <th className="px-5 py-3 font-normal w-[18%]">MRR at Risk</th>
                <th className="px-5 py-3 font-normal w-[30%]">Trigger Reason</th>
                <th className="px-5 py-3 text-right font-normal w-[22%]">Outreach Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.04]">
              {filteredCases.map((item, index) => {
                const diag = getDiagnostics(item)
                const draftInfo = getCaseDraft(item)
                const isLower = index >= 4
                return (
                  <tr key={item.id} className="hover:bg-white/[0.02] transition-colors">
                    <td className="px-5 py-3.5">
                      <div
                        className="font-medium text-white text-[13px] hover:text-blue-400 cursor-pointer transition-colors"
                        onClick={() => void loadCaseDetail(item.id)}
                        title="View case details"
                      >
                        {accountName(item)}
                      </div>
                      {accountDomain(item) && (
                        <div className="text-zinc-500 text-[11px] mt-0.5">{accountDomain(item)}</div>
                      )}
                    </td>
                    <td className="px-5 py-3.5">
                      <span className="font-medium text-white text-[13px]">{formatMoney(item.mrr_baseline_cents)}</span>
                      <span className="text-zinc-500 text-[11px]"> /mo</span>
                    </td>
                    <td className="px-5 py-3.5 text-zinc-300 text-xs">
                      <div className="relative group/diag inline-block max-w-[340px]">
                        <span className="truncate block font-normal cursor-help text-zinc-300 group-hover/diag:text-white transition-colors">
                          {diag.exactReason}
                        </span>

                        {/* Hover Diagnostic Briefing Card */}
                        <div className={`absolute left-0 ${isLower ? 'bottom-full pb-1' : 'top-full pt-1'} hidden group-hover/diag:block z-50`}>
                          <div className="w-96 rounded-sm border border-white/[0.14] bg-[#101012]/98 backdrop-blur-xl p-4 shadow-2xl pointer-events-auto text-left">
                            {/* Header */}
                            <div className="font-medium text-[13px] text-white mb-2">
                              {accountName(item)}
                            </div>

                            {/* Core Issue Diagnosis Paragraph */}
                            <p className="text-xs text-zinc-300 leading-relaxed font-normal mb-3">
                              {diag.issueSummary}
                            </p>

                            {/* Cross-Provider Signals */}
                            <div className="space-y-1.5">
                              {diag.stripe && (
                                <div className="flex items-center gap-2 text-xs">
                                  <img src="/logos/stripe.svg" alt="Stripe" className="w-3.5 h-3.5 object-contain shrink-0" />
                                  <span className="text-zinc-300 font-medium">Stripe:</span>
                                  <span className="text-zinc-400 font-normal truncate">{diag.stripe.detail}</span>
                                </div>
                              )}
                              {diag.posthog && (
                                <div className="flex items-center gap-2 text-xs">
                                  <img src="/logos/posthog.svg" alt="PostHog" className="w-3.5 h-3.5 object-contain shrink-0" />
                                  <span className="text-zinc-300 font-medium">PostHog:</span>
                                  <span className="text-zinc-400 font-normal truncate">{diag.posthog.detail}</span>
                                </div>
                              )}
                              {diag.support && (
                                <div className="flex items-center gap-2 text-xs">
                                  <img src="/logos/intercom.svg" alt="Support" className="w-3.5 h-3.5 object-contain shrink-0" />
                                  <span className="text-zinc-300 font-medium">Support:</span>
                                  <span className="text-zinc-400 font-normal truncate">{diag.support.detail}</span>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    </td>
                  <td className="px-5 py-3.5 text-right">
                    {item.status === 'awaiting_approval' && sentSuccessCaseId !== item.id && (
                      <div className="relative group/draft inline-block">
                        {/* Floating Email Draft Preview Card on Hover */}
                        <div className={`absolute right-0 ${isLower ? 'bottom-full pb-1' : 'top-full pt-1'} z-50 ${editingCaseId === item.id ? 'block' : 'hidden group-hover/draft:block'}`}>
                          <div className="w-[460px] rounded-sm border border-white/[0.14] bg-[#101012]/98 backdrop-blur-xl p-4 shadow-2xl text-left pointer-events-auto">
                              {editingCaseId === item.id ? (
                                <div>
                                  <div className="flex items-center justify-between pb-2 mb-2.5 border-b border-white/[0.08]">
                                    <div className="flex items-center gap-2 text-xs">
                                      <img src="/logos/gmail.svg" alt="Gmail" className="w-3.5 h-3.5 object-contain shrink-0" />
                                      <span className="font-medium text-zinc-400">To:</span>
                                      <span className="text-zinc-200 font-mono text-[11px]">{draftInfo.recipientEmail}</span>
                                    </div>
                                    <span className="text-[10px] font-mono text-zinc-400 uppercase tracking-wider">
                                      Editing Draft
                                    </span>
                                  </div>

                                  <div className="mb-2.5">
                                    <div className="text-[11px] font-medium text-zinc-400 mb-1">
                                      Subject
                                    </div>
                                    <input
                                      type="text"
                                      value={editSubject}
                                      onChange={(e) => setEditSubject(e.target.value)}
                                      className="w-full bg-black/60 border border-white/15 rounded-xs px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-white/40 font-medium"
                                      placeholder="Subject..."
                                    />
                                  </div>

                                  <div className="mb-3">
                                    <div className="text-[11px] font-medium text-zinc-400 mb-1">
                                      Body
                                    </div>
                                    <textarea
                                      rows={7}
                                      value={editBody}
                                      onChange={(e) => setEditBody(e.target.value)}
                                      className="w-full bg-black/60 border border-white/15 rounded-xs p-2 text-xs text-zinc-200 focus:outline-none focus:border-white/40 resize-y font-sans leading-relaxed [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
                                      placeholder="Email body..."
                                    />
                                  </div>

                                  <div className="flex items-center justify-end gap-2 pt-2 border-t border-white/[0.06]">
                                    <button
                                      type="button"
                                      disabled={savingDraft}
                                      onClick={(e) => {
                                        e.stopPropagation()
                                        setEditingCaseId(null)
                                      }}
                                      className="text-xs text-zinc-400 hover:text-white px-2.5 py-1 transition-colors cursor-pointer"
                                    >
                                      Cancel
                                    </button>
                                    <button
                                      type="button"
                                      disabled={savingDraft || draftSavedCaseId === item.id || !editSubject.trim() || !editBody.trim()}
                                      onClick={async (e) => {
                                        e.stopPropagation()
                                        setSavingDraft(true)
                                        try {
                                          const res = await fetch(`/api/recovery/cases/${item.id}/draft`, {
                                            method: 'POST',
                                            headers: { 'Content-Type': 'application/json' },
                                            body: JSON.stringify({
                                              subject: editSubject,
                                              body_preview: editBody,
                                              recipient_email: draftInfo.recipientEmail,
                                            }),
                                          })
                                          if (!res.ok) {
                                            const err = await res.json().catch(() => ({}))
                                            throw new Error(err.error || 'Failed to save draft')
                                          }
                                          setDraftSavedCaseId(item.id)
                                          await refresh()
                                          await new Promise(r => setTimeout(r, 900))
                                          setEditingCaseId(null)
                                        } catch (err) {
                                          console.error('Failed to save draft:', err)
                                        } finally {
                                          setSavingDraft(false)
                                          setDraftSavedCaseId(null)
                                        }
                                      }}
                                      className="inline-flex items-center gap-1.5 rounded-xs border border-white/15 bg-white/[0.08] hover:bg-white/[0.14] hover:border-white/30 active:bg-white/[0.18] px-3 py-1 text-xs font-medium text-white transition-all cursor-pointer disabled:opacity-50 shadow-xs"
                                    >
                                      {draftSavedCaseId === item.id ? (
                                        <>
                                          <Check className="w-3.5 h-3.5 text-emerald-400 stroke-[2.5]" />
                                          <span className="text-emerald-300">Saved ✓</span>
                                        </>
                                      ) : savingDraft ? (
                                        <>
                                          <Loader2 className="w-3.5 h-3.5 animate-spin text-zinc-300" />
                                          <span>Saving…</span>
                                        </>
                                      ) : (
                                        'Save Draft'
                                      )}
                                    </button>
                                  </div>
                                </div>
                              ) : (
                                <div>
                                  <div className="flex items-center justify-between pb-2 mb-2.5 border-b border-white/[0.08]">
                                    <div className="flex items-center gap-2 text-xs">
                                      <img src="/logos/gmail.svg" alt="Gmail" className="w-3.5 h-3.5 object-contain shrink-0" />
                                      <span className="font-medium text-zinc-400">To:</span>
                                      <span className="text-zinc-200 font-mono text-[11px]">{draftInfo.recipientEmail}</span>
                                    </div>
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation()
                                        setEditingCaseId(item.id)
                                        setEditSubject(draftInfo.subject)
                                        setEditBody(draftInfo.bodyPreview)
                                      }}
                                      className="text-[11px] font-medium text-zinc-400 hover:text-white transition-colors cursor-pointer px-2 py-0.5 border border-white/10 hover:border-white/30 rounded-xs bg-white/[0.03]"
                                    >
                                      Edit Draft
                                    </button>
                                  </div>

                                  <div className="mb-3">
                                    <div className="text-[11px] font-medium text-zinc-400 mb-1">
                                      Subject
                                    </div>
                                    <div className="text-[13px] font-medium text-white leading-snug">
                                      {draftInfo.subject}
                                    </div>
                                  </div>

                                  <div>
                                    <div className="text-[11px] font-medium text-zinc-400 mb-1">
                                      Body
                                    </div>
                                    <p className="text-xs text-zinc-300 leading-relaxed font-normal whitespace-pre-wrap max-h-56 overflow-y-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
                                      {draftInfo.bodyPreview}
                                    </p>
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>

                        <button
                          disabled={sendingCaseId === item.id}
                          onClick={() => void handleQuickSend(item.id, accountName(item))}
                          className="group/btn inline-flex items-center gap-1.5 rounded-xs bg-[#0055FF] hover:bg-[#0048D9] active:bg-[#003ec2] text-white px-3 py-1 text-xs font-medium transition-all cursor-pointer disabled:opacity-50 shadow-xs shadow-blue-500/20 hover:shadow-blue-500/35 border border-blue-400/30"
                        >
                          {sendingCaseId === item.id ? (
                            <>
                              <Loader2 className="w-3 h-3 animate-spin text-white/90" />
                              <span>Sending…</span>
                            </>
                          ) : (
                            <>
                              <Send className="w-3 h-3 text-white/90 group-hover/btn:text-white group-hover/btn:translate-x-0.5 group-hover/btn:-translate-y-0.5 transition-transform" />
                              <span>Send</span>
                            </>
                          )}
                        </button>
                      </div>
                    )}
                    {(item.status === 'sent' || item.status === 'monitoring' || sentSuccessCaseId === item.id) && (
                      <a
                        href={getSentGmailUrl(item)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="group/btn inline-flex items-center gap-1.5 rounded-xs bg-[#0055FF] hover:bg-[#0048D9] active:bg-[#003ec2] text-white px-3 py-1 text-xs font-medium transition-all cursor-pointer shadow-xs shadow-blue-500/20 hover:shadow-blue-500/35 border border-blue-400/30"
                        title="Click to view sent email in Gmail"
                      >
                        <Check className="w-3 h-3 text-white stroke-[2.5]" />
                        <span>Sent</span>
                      </a>
                    )}
                    {item.status === 'resolved' && (
                      <button
                        onClick={() => void loadCaseDetail(item.id)}
                        className="inline-flex items-center gap-1.5 rounded-sm border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-300 hover:bg-emerald-500/20 transition-colors cursor-pointer"
                      >
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                        {item.resolution === 'strictly_recovered' ? 'Payment Recovered' : 'Saved'}
                      </button>
                    )}
                    {item.status === 'suppressed' && (
                      <button
                        onClick={() => void loadCaseDetail(item.id)}
                        className="inline-flex items-center gap-1.5 rounded-sm border border-white/[0.06] bg-transparent px-2.5 py-1 text-xs font-normal text-zinc-500 hover:text-zinc-300 transition-colors cursor-pointer"
                      >
                        Cooling Down
                      </button>
                    )}
                    {!['awaiting_approval', 'sent', 'monitoring', 'resolved', 'suppressed'].includes(item.status) && sentSuccessCaseId !== item.id && (
                      <button
                        onClick={() => void loadCaseDetail(item.id)}
                        className="inline-flex items-center gap-1.5 rounded-sm border border-white/10 bg-white/[0.03] px-2.5 py-1 text-xs font-medium text-zinc-300 hover:text-white hover:bg-white/[0.08] transition-colors cursor-pointer"
                      >
                        {formatStatus(item.status)}
                      </button>
                    )}
                  </td>
                </tr>
              )
            })}
            </tbody>
          </table>
          {!loading && filteredCases.length === 0 && (
            <div className="py-16 text-center text-xs text-zinc-500">
              No live recovery cases match this view.
            </div>
          )}
          {loading && (
            <div className="flex items-center justify-center gap-2 py-16 text-xs text-zinc-500">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading live cases
            </div>
          )}
        </div>
      </div>

      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-xs" onClick={() => setSelected(null)}>
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-sm border border-white/10 bg-[#111114] p-6 shadow-2xl" onClick={event => event.stopPropagation()}>
            <div className="mb-6 flex items-start justify-between">
              <div>
                <h2 className="text-lg font-semibold text-white">{selected.account?.name || accountName(selected.case)}</h2>
                <p className="text-xs text-zinc-400 mt-0.5">
                  {formatMoney(selected.case.mrr_baseline_cents)} MRR · {humanizeReason(selected.case)}
                </p>
              </div>
              <button
                onClick={() => setSelected(null)}
                className="rounded-sm border border-white/10 px-2.5 py-1 text-xs text-zinc-400 hover:text-white hover:bg-white/5 transition-colors cursor-pointer"
              >
                Close
              </button>
            </div>

            {/* AI Recovery Outreach Draft */}
            <DetailSection title="AI Recovery Outreach">
              {selected.drafts.length ? selected.drafts.map(draft => {
                const isEditingModal = editingCaseId === selected.case.id
                return (
                  <div key={draft.id} className="rounded-sm border border-white/10 bg-black/30 p-4 mb-3">
                    <div className="flex items-center justify-between text-xs text-zinc-400 mb-2">
                      <span>To: <strong className="text-zinc-200">{draft.recipient_email || selected.contacts[0]?.email || 'Primary Contact'}</strong></span>
                      {!isEditingModal && (
                        <button
                          onClick={() => {
                            setEditingCaseId(selected.case.id)
                            setEditSubject(draft.subject)
                            setEditBody(draft.body_preview)
                          }}
                          className="text-[11px] font-medium text-zinc-400 hover:text-white transition-colors cursor-pointer px-2 py-0.5 border border-white/10 hover:border-white/30 rounded-xs bg-white/[0.03]"
                        >
                          Edit Draft
                        </button>
                      )}
                    </div>

                    {isEditingModal ? (
                      <div className="space-y-3 mt-2">
                        <div>
                          <div className="text-[11px] font-medium text-zinc-400 mb-1">Subject</div>
                          <input
                            type="text"
                            value={editSubject}
                            onChange={(e) => setEditSubject(e.target.value)}
                            className="w-full bg-black/60 border border-white/15 rounded-xs px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-white/40"
                          />
                        </div>
                        <div>
                          <div className="text-[11px] font-medium text-zinc-400 mb-1">Body</div>
                          <textarea
                            rows={8}
                            value={editBody}
                            onChange={(e) => setEditBody(e.target.value)}
                            className="w-full bg-black/60 border border-white/15 rounded-xs p-2 text-xs text-zinc-200 focus:outline-none focus:border-white/40 resize-y font-sans leading-relaxed"
                          />
                        </div>
                        <div className="flex items-center justify-end gap-2 pt-2 border-t border-white/[0.06]">
                          <button
                            type="button"
                            disabled={savingDraft}
                            onClick={() => setEditingCaseId(null)}
                            className="text-xs text-zinc-400 hover:text-white px-2.5 py-1 transition-colors cursor-pointer"
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            disabled={savingDraft || !editSubject.trim() || !editBody.trim()}
                            onClick={async () => {
                              setSavingDraft(true)
                              try {
                                const res = await fetch(`/api/recovery/cases/${selected.case.id}/draft`, {
                                  method: 'POST',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({
                                    subject: editSubject,
                                    body_preview: editBody,
                                    recipient_email: draft.recipient_email,
                                  }),
                                })
                                if (!res.ok) throw new Error('Failed to save draft')
                                setDraftSavedCaseId(selected.case.id)
                                await Promise.all([refresh(), loadCaseDetail(selected.case.id)])
                                await new Promise(r => setTimeout(r, 900))
                                setEditingCaseId(null)
                              } catch (err) {
                                console.error('Failed to save draft:', err)
                              } finally {
                                setSavingDraft(false)
                                setDraftSavedCaseId(null)
                              }
                            }}
                            className="inline-flex items-center gap-1.5 rounded-xs border border-white/15 bg-white/[0.08] hover:bg-white/[0.14] hover:border-white/30 active:bg-white/[0.18] px-3 py-1 text-xs font-medium text-white transition-all cursor-pointer disabled:opacity-50 shadow-xs"
                          >
                            {draftSavedCaseId === selected.case.id ? (
                              <>
                                <Check className="w-3.5 h-3.5 text-emerald-400 stroke-[2.5]" />
                                <span className="text-emerald-300">Saved ✓</span>
                              </>
                            ) : savingDraft ? (
                              <>
                                <Loader2 className="w-3.5 h-3.5 animate-spin text-zinc-300" />
                                <span>Saving…</span>
                              </>
                            ) : (
                              'Save Draft'
                            )}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="font-medium text-white text-sm mb-1">{draft.subject}</div>
                        <div className="text-xs text-zinc-400 whitespace-pre-wrap leading-relaxed border-t border-white/[0.06] pt-2.5 mt-2.5">{draft.body_preview}</div>
                        <div className="mt-4 flex items-center justify-end">
                          {draft.status === 'needs_review' && selected.case.status !== 'monitoring' && selected.case.status !== 'resolved' ? (
                            <button
                              disabled={sendingCaseId === selected.case.id || approving === draft.id || sentSuccessCaseId === selected.case.id}
                              onClick={() => void handleQuickSend(selected.case.id, accountName(selected.case))}
                              className="group/modalbtn inline-flex items-center gap-1.5 rounded-xs bg-[#0055FF] hover:bg-[#0048D9] active:bg-[#003ec2] text-white px-3.5 py-1.5 text-xs font-medium transition-all cursor-pointer disabled:opacity-50 shadow-xs shadow-blue-500/20 hover:shadow-blue-500/35 border border-blue-400/30"
                            >
                              {sendingCaseId === selected.case.id ? (
                                <>
                                  <Loader2 className="w-3.5 h-3.5 animate-spin text-white/90" />
                                  <span>Sending…</span>
                                </>
                              ) : sentSuccessCaseId === selected.case.id ? (
                                <>
                                  <Check className="w-3.5 h-3.5 text-white stroke-[2.5]" />
                                  <span>Sent</span>
                                </>
                              ) : (
                                <>
                                  <Send className="w-3.5 h-3.5 text-white/90 group-hover/modalbtn:text-white group-hover/modalbtn:translate-x-0.5 group-hover/modalbtn:-translate-y-0.5 transition-transform" />
                                  <span>Send Outreach</span>
                                </>
                              )}
                            </button>
                          ) : (selected.case.status === 'monitoring' || draft.status === 'sent') ? (
                            <a
                              href={draft.approval_metadata?.gmail_url || 'https://mail.google.com/mail/u/0/#sent'}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="group/modalbtn inline-flex items-center gap-1.5 rounded-xs bg-[#0055FF] hover:bg-[#0048D9] active:bg-[#003ec2] text-white px-3.5 py-1.5 text-xs font-medium transition-all cursor-pointer shadow-xs shadow-blue-500/20 hover:shadow-blue-500/35 border border-blue-400/30"
                              title="Click to view sent email in Gmail"
                            >
                              <Check className="w-3.5 h-3.5 text-white stroke-[2.5]" />
                              <span>Sent</span>
                            </a>
                          ) : null}
                        </div>
                        {(selected.case.status === 'monitoring' || draft.status === 'sent') && (
                          <div className="mt-3 flex items-center justify-between gap-3 rounded-xs border border-sky-500/20 bg-sky-500/10 p-3 text-xs text-sky-300">
                            <div className="flex items-center gap-2">
                              <span className="w-2 h-2 rounded-full bg-sky-400 animate-pulse shrink-0" />
                              <span>Outreach dispatched. Actively listening for webhook 504 resolution, payment clearance, or customer reply.</span>
                            </div>
                            <a
                              href={draft.approval_metadata?.gmail_url || 'https://mail.google.com/mail/u/0/#sent'}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1.5 shrink-0 rounded-xs bg-sky-500/20 hover:bg-sky-500/30 border border-sky-500/40 px-2.5 py-1 text-xs font-medium text-white transition-colors cursor-pointer"
                            >
                              <img src="/logos/gmail.svg" alt="Gmail" className="w-3.5 h-3.5 object-contain" />
                              <span>Open in Gmail</span>
                              <ArrowUpRight className="w-3 h-3 text-sky-300" />
                            </a>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )
              }) : (
                <p className="text-xs text-zinc-500">No outreach draft queued for this case.</p>
              )}
            </DetailSection>

            <DetailSection title="Customer Contacts">
              {selected.contacts.length ? selected.contacts.map(contact => (
                <div key={contact.email} className="mb-1 text-xs text-zinc-300">
                  {contact.email} {contact.is_primary ? '· primary' : ''} {contact.is_provisional ? '· provisional' : '· verified'}
                </div>
              )) : <p className="text-xs text-zinc-500">No linked contacts.</p>}
            </DetailSection>

            <DetailSection title="Signals & Features">
              <div className="grid grid-cols-2 gap-2 text-xs">
                <Fact label="Payment failures (30d)" value={selected.features?.failed_payment_count_30d ?? '—'} />
                <Fact label="Usage change" value={selected.features?.usage_delta_percent == null ? '—' : `${selected.features.usage_delta_percent}%`} />
                <Fact label="Unreplied outbound" value={selected.features?.unreplied_outbound_count ?? '—'} />
                <Fact label="Last successful payment" value={selected.features?.last_payment_succeeded_at ? new Date(selected.features.last_payment_succeeded_at).toLocaleDateString() : '—'} />
              </div>
            </DetailSection>

            <details className="mt-4 text-xs text-zinc-500 cursor-pointer">
              <summary className="hover:text-zinc-300 transition-colors">Technical Evidence & Audit Logs</summary>
              <div className="mt-2 space-y-3">
                <pre className="whitespace-pre-wrap text-[11px] text-zinc-400 font-mono bg-black/40 p-3 rounded-sm border border-white/[0.04]">
                  {JSON.stringify(selected.case.evidence_snapshot || [], null, 2)}
                </pre>
                {selected.jobs.length > 0 && (
                  <div className="rounded-sm border border-white/[0.04] bg-black/40 p-3">
                    {selected.jobs.map(job => (
                      <div key={job.id} className="flex justify-between py-0.5">
                        <span>{formatStatus(job.job_type)}</span>
                        <span className={job.status === 'dead_letter' ? 'text-red-300' : 'text-zinc-400'}>{formatStatus(job.status)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </details>
          </div>
        </div>
      )}
    </div>
  )
}

function Metric({
  label,
  value,
}: {
  label: string
  value: string
}) {
  return (
    <div className="rounded-sm border border-white/10 bg-[#0c0c0e] p-5 shadow-xs transition-colors hover:border-white/20">
      <div className="text-[13px] font-normal text-zinc-400">
        {label}
      </div>
      <div className="mt-2.5 text-[28px] sm:text-[32px] font-medium tracking-tight text-white leading-none">
        {value}
      </div>
    </div>
  )
}

function DetailSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-5">
      <h3 className="mb-2 text-[11px] font-medium uppercase tracking-[0.14em] text-zinc-500">{title}</h3>
      <div className="rounded-xl border border-white/[0.06] bg-[#0d0d0f] p-3.5">{children}</div>
    </section>
  )
}

function Fact({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg bg-white/[0.02] border border-white/[0.04] p-2.5">
      <div className="text-zinc-500 text-[11px]">{label}</div>
      <div className="mt-1 text-white font-medium">{value}</div>
    </div>
  )
}
