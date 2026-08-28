import { createServiceClient } from '@/foundation/database/service'

type AccountRow = {
  id: string
  name: string
  plan_name: string | null
  account_status: string
  mrr_cents: number
  risk_level: string
  risk_score: number
  usage_delta_percent: number
  open_issue: string | null
  next_action: string | null
  summary: string | null
  renewal_at: string | null
  last_touch_at: string | null
}

type SignalRow = {
  customer_account_id: string | null
  headline: string
  detail: string
  event_at: string
}

type IntegrationRow = {
  provider: string
  status: string
  last_synced_at: string | null
  metadata: Record<string, unknown> | null
}

type TimelineRow = {
  customer_account_id: string | null
  headline: string
  detail: string | null
  event_type: string
  source: string | null
  event_at: string
}

type ContactIdentityRow = {
  customer_account_id: string
  external_ids: Record<string, unknown> | null
}

const LIVE_CONTACT_IDENTITY_KEYS = new Set([
  'stripe_customer_id',
  'stripe_subscription_id',
  'gmail_email',
  'posthog_person_id',
  'posthog_distinct_ids',
  'hubspot_contact_id',
  'hubspot_company_id',
  'intercom_contact_id',
])

function hasVerifiedLiveContactIdentity(externalIds: Record<string, unknown> | null) {
  if (!externalIds) return false

  return Object.entries(externalIds).some(([key, value]) => {
    if (!LIVE_CONTACT_IDENTITY_KEYS.has(key)) return false
    if (Array.isArray(value)) return value.length > 0
    return typeof value === 'string' ? value.trim().length > 0 : Boolean(value)
  })
}

type DraftRow = {
  customer_account_id: string | null
  status: string
  subject: string
  draft_type: string
}

const PROVIDER_LABELS: Record<string, string> = {
  stripe: 'Stripe',
  posthog: 'PostHog',
  gmail: 'Gmail',
  intercom: 'Intercom',
  slack: 'Slack',
  hubspot: 'HubSpot',
  sentry: 'Sentry',
  linear: 'Linear',
  google_calendar: 'Google Calendar',
}

export type WorkspaceBriefResult = {
  briefId: string
  itemCount: number
  headline: string
  summary: string
}

function formatCurrency(cents: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(cents / 100)
}

function humanizeRisk(riskLevel: string) {
  switch (riskLevel) {
    case 'high':
      return 'High risk'
    case 'medium':
      return 'Medium risk'
    default:
      return 'Low risk'
  }
}

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return 'never'
  const diff = Date.now() - new Date(dateStr).getTime()
  const minutes = Math.floor(diff / (1000 * 60))
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

function isUsableLiveIntegration(integration: IntegrationRow) {
  return (
    integration.status === 'connected' &&
    integration.metadata?.connected_via !== 'workspace_connect'
  )
}

// ─── Platform-centric brief generation ─────────────────────────────

function buildPlatformInsight(integration: IntegrationRow): string | null {
  const label = PROVIDER_LABELS[integration.provider] ?? integration.provider
  const meta = integration.metadata ?? {}

  if (!isUsableLiveIntegration(integration)) return null

  switch (integration.provider) {
    case 'gmail': {
      const pendingReplies = typeof meta.pending_replies === 'number' ? meta.pending_replies : 0
      const coverage = typeof meta.coverage === 'string' ? meta.coverage : null
      const ownerEmail = typeof meta.owner_email === 'string' ? meta.owner_email : null

      if (pendingReplies > 0) {
        return `Gmail: ${pendingReplies} thread${pendingReplies === 1 ? '' : 's'} waiting for your reply${coverage ? ` (${coverage})` : ''}.`
      }
      if (coverage) {
        return `Gmail: ${coverage}. All caught up — no pending replies.`
      }
      return `Gmail: Connected${ownerEmail ? ` as ${ownerEmail}` : ''}, synced ${timeAgo(integration.last_synced_at)}.`
    }

    case 'stripe': {
      const coverage = typeof meta.coverage === 'string' ? meta.coverage : null
      if (coverage) {
        return `Stripe: ${coverage}.`
      }
      return `Stripe: Connected, last synced ${timeAgo(integration.last_synced_at)}.`
    }

    case 'posthog': {
      const syncedPeople = typeof meta.synced_people === 'number' ? meta.synced_people : null
      const syncedAccounts = typeof meta.synced_accounts === 'number' ? meta.synced_accounts : null
      if (syncedPeople !== null && syncedPeople === 0) {
        return 'PostHog: Connected but no users tracked yet. Set up tracking or check your project settings.'
      }
      if (syncedPeople !== null && syncedPeople > 0) {
        return `PostHog: Tracking ${syncedPeople} user${syncedPeople === 1 ? '' : 's'} across ${syncedAccounts ?? 0} account${(syncedAccounts ?? 0) === 1 ? '' : 's'}.`
      }
      return `PostHog: Connected, last synced ${timeAgo(integration.last_synced_at)}.`
    }

    case 'intercom': {
      if (!integration.last_synced_at) {
        return 'Intercom: Connected — waiting for first sync.'
      }
      const coverage = typeof meta.coverage === 'string' ? meta.coverage : null
      if (coverage) {
        return `Intercom: ${coverage}.`
      }
      return `Intercom: Connected, last synced ${timeAgo(integration.last_synced_at)}.`
    }

    default: {
      const coverage = typeof meta.coverage === 'string' ? meta.coverage : null
      if (coverage) {
        return `${label}: ${coverage}.`
      }
      return `${label}: Connected, last synced ${timeAgo(integration.last_synced_at)}.`
    }
  }
}

function buildHeadline(
  integrations: IntegrationRow[],
  recentTimeline: TimelineRow[],
  pendingDrafts: DraftRow[],
  accounts: AccountRow[]
) {
  const connected = integrations.filter(isUsableLiveIntegration)

  if (connected.length === 0) {
    return 'Connect your tools to get started'
  }

  // Check for high-risk accounts first
  const highRisk = accounts.filter(a => a.risk_level === 'high')
  if (highRisk.length > 0) {
    return `⚠ ${highRisk.length} account${highRisk.length === 1 ? '' : 's'} need${highRisk.length === 1 ? 's' : ''} attention`
  }

  // Check for recent activity worth highlighting
  const recentEmails = recentTimeline.filter(t =>
    t.event_type === 'email_received' && isWithinHours(t.event_at, 48)
  )
  if (recentEmails.length > 0) {
    return `${recentEmails.length} new email${recentEmails.length === 1 ? '' : 's'} since last check`
  }

  // Drafts needing review
  const reviewable = pendingDrafts.filter(d => d.status === 'needs_review')
  if (reviewable.length > 0) {
    return `${reviewable.length} draft${reviewable.length === 1 ? '' : 's'} ready for your review`
  }

  // Approved/sent drafts — celebrate
  const recentSent = recentTimeline.filter(t =>
    (t.event_type === 'email_sent' || t.event_type === 'draft_approved') && isWithinHours(t.event_at, 48)
  )
  if (recentSent.length > 0) {
    return 'Your follow-ups are going out — nice work'
  }

  // Default: platform summary
  const sourceNames = connected.map(i => PROVIDER_LABELS[i.provider] ?? i.provider)
  return `${sourceNames.join(', ')} connected and syncing`
}

function isWithinHours(dateStr: string, hours: number): boolean {
  return Date.now() - new Date(dateStr).getTime() < hours * 60 * 60 * 1000
}

function buildSummary(
  integrations: IntegrationRow[],
  recentTimeline: TimelineRow[],
  pendingDrafts: DraftRow[],
  accounts: AccountRow[]
) {
  const connected = integrations.filter(isUsableLiveIntegration)

  if (connected.length === 0) {
    return 'Connect your first integration to start building your daily brief. Head to Settings → Integrations to connect Stripe, PostHog, Gmail, or Intercom.'
  }

  const parts: string[] = []

  // 1. Platform-level insights — what each connected tool is showing
  for (const integration of connected) {
    const insight = buildPlatformInsight(integration)
    if (insight) parts.push(insight)
  }

  // 2. Recent notable activity from timeline
  const recentActivity = recentTimeline.filter(t => isWithinHours(t.event_at, 72))
  const emailsReceived = recentActivity.filter(t => t.event_type === 'email_received')
  const emailsSent = recentActivity.filter(t => t.event_type === 'email_sent')
  const draftsApproved = recentActivity.filter(t => t.event_type === 'draft_approved')

  if (emailsSent.length > 0 || draftsApproved.length > 0) {
    const sentCount = emailsSent.length
    const approvedCount = draftsApproved.length
    if (sentCount > 0 && approvedCount > 0) {
      parts.push(`You've approved ${approvedCount} draft${approvedCount === 1 ? '' : 's'} and sent ${sentCount} follow-up${sentCount === 1 ? '' : 's'} recently. 🎉`)
    } else if (sentCount > 0) {
      parts.push(`${sentCount} follow-up${sentCount === 1 ? '' : 's'} sent recently. Nice.`)
    }
  }

  if (emailsReceived.length > 0) {
    // Show the most recent reply as a highlight
    const latest = emailsReceived[0]!
    const subject = latest.headline.replace('Customer replied in Gmail: ', '')
    parts.push(`Latest reply: "${subject}" — ${timeAgo(latest.event_at)}.`)
  }

  // 3. High-risk accounts (only if there are any)
  const atRisk = accounts.filter(a => a.risk_level !== 'low')
  if (atRisk.length > 0) {
    const exposedMrr = atRisk.reduce((sum, a) => sum + a.mrr_cents, 0)
    parts.push(
      `${atRisk.length} account${atRisk.length === 1 ? '' : 's'} flagged as at-risk` +
      (exposedMrr > 0 ? ` (${formatCurrency(exposedMrr)} MRR exposed)` : '') +
      '.'
    )
  }

  return parts.join(' ')
}

function buildEvidence(account: AccountRow, recentSignals: SignalRow[]) {
  const evidence: string[] = []

  evidence.push(`${humanizeRisk(account.risk_level)} at score ${account.risk_score}`)

  if (account.usage_delta_percent !== 0) {
    evidence.push(
      `Usage ${account.usage_delta_percent > 0 ? 'up' : 'down'} ${Math.abs(account.usage_delta_percent)}%`
    )
  }

  if (account.account_status !== 'active') {
    evidence.push(`Status: ${account.account_status.replace('_', ' ')}`)
  }

  if (account.open_issue) {
    evidence.push(`Open issue: ${account.open_issue}`)
  }

  recentSignals.slice(0, 2).forEach((signal) => evidence.push(signal.headline))
  return evidence.slice(0, 5)
}

function buildDetail(account: AccountRow, recentSignals: SignalRow[]) {
  const signalContext = recentSignals
    .slice(0, 2)
    .map((signal) => signal.detail)
    .filter(Boolean)
    .join(' ')

  const usageLine =
    account.usage_delta_percent === 0
      ? 'Usage is currently stable.'
      : `Usage is ${account.usage_delta_percent > 0 ? 'up' : 'down'} ${Math.abs(
          account.usage_delta_percent
        )}% compared with the last sync window.`

  const statusLine =
    account.account_status === 'active'
      ? ''
      : `Billing status is ${account.account_status.replace('_', ' ')}.`

  return [account.summary, usageLine, statusLine, signalContext]
    .filter((part) => typeof part === 'string' && part.trim().length > 0)
    .join(' ')
}

export async function generateWorkspaceBrief(
  workspaceId: string
): Promise<WorkspaceBriefResult> {
  const supabase = createServiceClient()
  const today = new Date().toISOString().slice(0, 10)

  const [
    { data: accounts, error: accountsError },
    { data: signals, error: signalsError },
    { data: drafts, error: draftsError },
    { data: integrations, error: integrationsError },
    { data: timeline, error: timelineError },
    { data: contactIdentities, error: contactIdentitiesError },
  ] = await Promise.all([
    supabase
      .from('customer_accounts')
      .select(
        'id, name, plan_name, account_status, mrr_cents, risk_level, risk_score, usage_delta_percent, open_issue, next_action, summary, renewal_at, last_touch_at'
      )
      .eq('workspace_id', workspaceId)
      .order('risk_score', { ascending: false })
      .order('mrr_cents', { ascending: false }),
    supabase
      .from('account_signals')
      .select('customer_account_id, headline, detail, event_at')
      .eq('workspace_id', workspaceId)
      .order('event_at', { ascending: false })
      .limit(40),
    supabase
      .from('follow_up_drafts')
      .select('customer_account_id, status, subject, draft_type')
      .eq('workspace_id', workspaceId)
      .neq('status', 'sent'),
    supabase
      .from('integration_connections')
      .select('provider, status, last_synced_at, metadata')
      .eq('workspace_id', workspaceId),
    supabase
      .from('account_timeline')
      .select('customer_account_id, headline, detail, event_type, source, event_at')
      .eq('workspace_id', workspaceId)
      .order('event_at', { ascending: false })
      .limit(20),
    supabase
      .from('account_contacts')
      .select('customer_account_id, external_ids')
      .eq('workspace_id', workspaceId)
      .not('external_ids', 'is', null),
  ])

  if (accountsError) throw accountsError
  if (signalsError) throw signalsError
  if (draftsError) throw draftsError
  if (integrationsError) throw integrationsError
  if (timelineError) throw timelineError
  if (contactIdentitiesError) throw contactIdentitiesError

  // A customer row by itself is not evidence of a live integration: old seed
  // rows and stale cache entries look exactly the same. Briefs include an
  // account only when a sync has attached a real provider identity to it.
  const verifiedAccountIds = new Set(
    ((contactIdentities as ContactIdentityRow[] | null) ?? [])
      .filter((contact) => hasVerifiedLiveContactIdentity(contact.external_ids))
      .map((contact) => contact.customer_account_id)
  )
  const allAccounts = ((accounts as AccountRow[] | null) ?? []).filter((account) =>
    verifiedAccountIds.has(account.id)
  )
  const typedAccounts = allAccounts.slice(0, 5)
  const typedSignals = ((signals as SignalRow[] | null) ?? []).filter(
    (signal) =>
      signal.customer_account_id !== null && verifiedAccountIds.has(signal.customer_account_id)
  )
  const typedDrafts = ((drafts as DraftRow[] | null) ?? []).filter(
    (draft) =>
      draft.customer_account_id !== null && verifiedAccountIds.has(draft.customer_account_id)
  )
  const typedIntegrations = (integrations as IntegrationRow[] | null) ?? []
  const typedTimeline = ((timeline as TimelineRow[] | null) ?? []).filter(
    (event) =>
      event.customer_account_id === null || verifiedAccountIds.has(event.customer_account_id)
  )

  const headline = buildHeadline(typedIntegrations, typedTimeline, typedDrafts, allAccounts)
  const summary = buildSummary(typedIntegrations, typedTimeline, typedDrafts, allAccounts)

  const { data: brief, error: briefError } = await supabase
    .from('founder_briefs')
    .upsert(
      {
        workspace_id: workspaceId,
        brief_date: today,
        headline,
        summary,
        generated_at: new Date().toISOString(),
      },
      { onConflict: 'workspace_id,brief_date' }
    )
    .select('id')
    .single()

  if (briefError) throw briefError

  const briefId = brief.id

  // Delete old brief items for this brief (prevents duplication across repeated syncs)
  const { error: deleteItemsError } = await supabase
    .from('founder_brief_items')
    .delete()
    .eq('founder_brief_id', briefId)

  if (deleteItemsError) throw deleteItemsError

  const itemsToInsert =
    typedAccounts.length > 0
      ? typedAccounts.map((account, index) => {
          const relatedSignals = typedSignals.filter(
            (signal) => signal.customer_account_id === account.id
          )

          return {
            workspace_id: workspaceId,
            founder_brief_id: briefId,
            customer_account_id: account.id,
            sort_order: index,
            risk_level: account.risk_level,
            headline:
              account.summary?.split('.').find((sentence) => sentence.trim().length > 0)?.trim() ??
              `${account.name} needs review`,
            detail: buildDetail(account, relatedSignals),
            next_step: account.next_action ?? 'Review the account and decide the next follow-up.',
            evidence: buildEvidence(account, relatedSignals),
          }
        })
      : [
          {
            workspace_id: workspaceId,
            founder_brief_id: briefId,
            customer_account_id: null,
            sort_order: 0,
            risk_level: 'low',
            headline: 'No live customer accounts are available yet.',
            detail:
              'Connect the core sources and run the first sync so the founder brief can start ranking real accounts.',
            next_step: 'Finish the integration setup flow.',
            evidence: ['No customer_accounts rows found for this workspace'],
          },
        ]

  const { error: insertItemsError } = await supabase
    .from('founder_brief_items')
    .insert(itemsToInsert)

  if (insertItemsError) throw insertItemsError

  return {
    briefId,
    itemCount: itemsToInsert.length,
    headline,
    summary,
  }
}
