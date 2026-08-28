import { cache } from 'react'
import type { User } from '@supabase/supabase-js'
import { createClient } from '@/foundation/database/server'
import { ensureWorkspaceForUser } from '@/data/workspaces/ensure-workspace'
import { resolveConnectionStatus } from '@/integrations/_core/connection-guard'
import type {
  AccountSummary,
  ActionTask,
  BriefItem,
  DraftItem,
  IntegrationItem,
  IntegrationStatus,
  LiveSignal,
  OverviewMetric,
  RiskLevel,
} from '@/data/dashboard/mock-data'
import {
  INTEGRATION_DEFINITIONS,
  type IntegrationDefinition,
} from '@/integrations/catalog'

export type DashboardMode = 'onboarding' | 'live' | 'degraded'
export type DashboardNoticeTone = 'info' | 'warning' | 'danger'

export type DashboardNotice = {
  tone: DashboardNoticeTone
  title: string
  detail: string
}

export type OnboardingStep = {
  title: string
  description: string
  status: IntegrationStatus
  href: string
}

export type DashboardState = {
  mode: DashboardMode
  workspaceName: string
  overviewMetrics: OverviewMetric[]
  briefHeadline: string
  briefSummary: string
  briefItems: BriefItem[]
  actionItems: ActionTask[]
  accountSummaries: AccountSummary[]
  draftQueue: DraftItem[]
  liveSignals: LiveSignal[]
  integrations: IntegrationItem[]
  briefGeneratedLabel: string
  onboarding: {
    headline: string
    detail: string
    connectedCoreCount: number
    totalCoreCount: number
    steps: OnboardingStep[]
  }
  notice: DashboardNotice | null
}

type JoinedAccount =
  | { id?: string | null; name?: string | null }
  | { id?: string | null; name?: string | null }[]
  | null

type AccountRow = {
  id: string
  name: string
  segment: string | null
  mrr_cents: number
  risk_level: string
  risk_score: number
  usage_delta_percent: number
  last_touch_at: string | null
  open_issue: string | null
  next_action: string | null
  summary: string | null
}

type BriefRow = {
  id: string
  brief_date: string
  generated_at: string
  headline: string | null
  summary: string | null
}

type BriefItemRow = {
  id: string
  sort_order: number
  risk_level: string
  headline: string
  detail: string
  next_step: string
  evidence: unknown
  customer_accounts: JoinedAccount
}

type DraftRow = {
  id: string
  draft_type: string
  subject: string
  body_preview: string
  status: string
  due_label: string | null
  customer_accounts: JoinedAccount
}

type SignalRow = {
  event_at: string
  headline: string
  detail: string
  customer_accounts: JoinedAccount
}

type TimelineRow = {
  customer_account_id: string
  source: string | null
  event_type: string
}

type IntegrationRow = {
  provider: string
  status: string
  last_synced_at: string | null
  metadata: Record<string, unknown> | null
}

type TokenRow = {
  provider: string
}

type PostgrestLikeError = {
  code?: string | null
  message?: string | null
  details?: string | null
  hint?: string | null
}

const CORE_PROVIDERS = ['stripe', 'posthog', 'gmail'] as const

const INTEGRATION_CATALOG = INTEGRATION_DEFINITIONS.map((definition) => ({
  ...definition,
  name: definition.label,
}))

function formatRiskLevel(value: string | null | undefined): RiskLevel {
  switch ((value ?? '').toLowerCase()) {
    case 'high':
      return 'High'
    case 'medium':
      return 'Medium'
    default:
      return 'Low'
  }
}

function formatDraftStatus(value: string | null | undefined): DraftItem['status'] {
  switch ((value ?? '').toLowerCase()) {
    case 'ready_to_send':
      return 'Ready to send'
    case 'needs_review':
      return 'Needs review'
    default:
      return 'Waiting on founder'
  }
}

function formatCurrency(cents: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(cents / 100)
}

function readJoinedAccount(value: JoinedAccount) {
  if (Array.isArray(value)) {
    const first = value[0]
    return {
      id: typeof first?.id === 'string' && first.id.length > 0 ? first.id : null,
      name:
        typeof first?.name === 'string' && first.name.length > 0
          ? first.name
          : 'Unknown account',
    }
  }

  if (value && typeof value === 'object') {
    return {
      id: typeof value.id === 'string' && value.id.length > 0 ? value.id : null,
      name:
        typeof value.name === 'string' && value.name.length > 0
          ? value.name
          : 'Unknown account',
    }
  }

  return { id: null, name: 'Unknown account' }
}

function readEvidence(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === 'string')
  }

  return []
}

function normalizeTaskStatus(status: DraftItem['status']): ActionTask['status'] {
  switch (status) {
    case 'Needs review':
      return 'Needs approval'
    case 'Ready to send':
      return 'Ready to send'
    default:
      return 'Waiting on founder'
  }
}

function normalizeSourceLabel(source: string | null, eventType: string | null) {
  const raw = (source ?? '').toLowerCase()
  if (raw === 'stripe') return 'Stripe'
  if (raw === 'posthog') return 'PostHog'
  if (raw === 'gmail') return 'Gmail'
  if (raw === 'intercom') return 'Intercom'
  if (raw === 'hubspot') return 'HubSpot'
  if (raw === 'slack') return 'Slack'
  if (raw === 'sentry') return 'Sentry'
  if (raw === 'linear') return 'Linear'
  if (raw === 'dashboard') return 'Founder'
  if (raw === 'agent') return 'Agent'

  switch ((eventType ?? '').toLowerCase()) {
    case 'billing':
      return 'Stripe'
    case 'usage':
      return 'PostHog'
    case 'support':
      return 'Intercom'
    case 'email_sent':
    case 'email_received':
    case 'draft_created':
    case 'draft_approved':
    case 'draft_sent':
      return 'Gmail'
    default:
      return null
  }
}

function inferSourcesFromEvidence(evidence: string[]) {
  const inferred = new Set<string>()

  for (const item of evidence) {
    const text = item.toLowerCase()
    if (text.includes('payment') || text.includes('invoice') || text.includes('subscription')) {
      inferred.add('Stripe')
    }
    if (
      text.includes('usage') ||
      text.includes('active') ||
      text.includes('seat') ||
      text.includes('activation')
    ) {
      inferred.add('PostHog')
    }
    if (text.includes('ticket') || text.includes('csat') || text.includes('support')) {
      inferred.add('Intercom')
    }
    if (
      text.includes('reply') ||
      text.includes('founder touch') ||
      text.includes('email') ||
      text.includes('thread')
    ) {
      inferred.add('Gmail')
    }
    if (text.includes('error') || text.includes('endpoint') || text.includes('bug')) {
      inferred.add('Sentry')
    }
  }

  return Array.from(inferred).slice(0, 3)
}

function buildSourceMap(rows: TimelineRow[]) {
  const byAccount = new Map<string, string[]>()

  for (const row of rows) {
    const label = normalizeSourceLabel(row.source, row.event_type)
    if (!label) continue

    const current = byAccount.get(row.customer_account_id) ?? []
    if (!current.includes(label)) {
      current.push(label)
      byAccount.set(row.customer_account_id, current.slice(0, 3))
    }
  }

  return byAccount
}

function buildBriefSources(accountId: string | null, evidence: string[], sourceMap: Map<string, string[]>) {
  if (accountId) {
    const fromTimeline = sourceMap.get(accountId)
    if (fromTimeline && fromTimeline.length > 0) {
      return fromTimeline
    }
  }

  return inferSourcesFromEvidence(evidence)
}

function inferTaskKind(task: Pick<ActionTask, 'headline' | 'detail'>) {
  const text = `${task.headline} ${task.detail}`.toLowerCase()
  if (text.includes('reply') || text.includes('email') || text.includes('thread')) {
    return 'Email draft'
  }
  if (text.includes('payment') || text.includes('billing') || text.includes('renewal')) {
    return 'Billing follow-up'
  }
  if (text.includes('support') || text.includes('issue') || text.includes('bug')) {
    return 'Customer recovery'
  }
  return 'Follow-up'
}

function rankTaskStatus(status: ActionTask['status']) {
  switch (status) {
    case 'Needs approval':
      return 0
    case 'Ready to send':
      return 1
    case 'Waiting on founder':
      return 2
    default:
      return 3
  }
}

function buildActionItems(briefItems: BriefItem[], draftQueue: DraftItem[]): ActionTask[] {
  const tasks: ActionTask[] = []
  const coveredAccounts = new Set<string>()

  // Filter out auto-generated drafts from Gmail thread subjects.
  // Only keep drafts that were explicitly created for real business reasons.
  const isGarbageDraft = (draft: DraftItem) => {
    const subject = draft.subject.toLowerCase()
    // ALL "Re:" prefixed subjects are auto-generated from Gmail — filter them
    if (/^\s*re:\s/i.test(draft.subject)) return true
    // Checkin emails auto-generated by the cron are low-value
    if (draft.type === 'checkin_email') return true
    // Generic patterns
    if (subject.includes('newsletter') || subject.includes('digest') || subject.includes('weekly update')) return true
    if (subject.includes('% off') || subject.includes('last chance') || subject.includes('hours left')) return true
    return false
  }

  const validDrafts = draftQueue.filter(d => !isGarbageDraft(d))

  for (const draft of validDrafts) {
    const accountKey = draft.accountId ?? draft.account
    coveredAccounts.add(accountKey)
    tasks.push({
      id: `draft-${draft.id}`,
      account: draft.account,
      headline: draft.subject,
      detail: draft.preview,
      status: normalizeTaskStatus(draft.status),
      kind: inferTaskKind({ headline: draft.subject, detail: draft.preview }),
      due: draft.due,
      requiresApproval: draft.status !== 'Ready to send',
      sources:
        draft.sources ??
        briefItems.find((item) => (item.accountId ?? item.account) === accountKey)?.sources ??
        [],
    })
  }

  for (const item of briefItems) {
    const accountKey = item.accountId ?? item.account
    if (coveredAccounts.has(accountKey)) {
      continue
    }

    // Only create tasks from brief items that have real risk
    if (item.risk === 'Low') continue

    tasks.push({
      id: `brief-${item.id ?? accountKey}`,
      account: item.account,
      headline: item.nextStep,
      detail: `${item.headline} ${item.detail}`.trim(),
      status: 'Open',
      kind: inferTaskKind({ headline: item.nextStep, detail: item.detail }),
      due: 'Today',
      requiresApproval: false,
      sources: item.sources,
    })
  }

  return tasks.sort((left, right) => rankTaskStatus(left.status) - rankTaskStatus(right.status))
}

function formatSyncLabel(lastSyncedAt: string | null, status: IntegrationStatus) {
  if (status === 'Coming soon') return 'Planned for upcoming release'
  if (status === 'Disconnected') return 'Not connected yet'
  if (!lastSyncedAt) return 'Sync pending'

  const date = new Date(lastSyncedAt)
  return `Synced ${date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  })}`
}

function formatBriefGeneratedLabel(value: string | null) {
  if (!value) return 'Awaiting first brief'

  const date = new Date(value)
  return `${date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  })} brief generated`
}

function isPostgrestLikeError(error: unknown): error is PostgrestLikeError {
  return Boolean(error) && typeof error === 'object'
}

function formatWorkspaceLoadError(error: unknown) {
  if (
    isPostgrestLikeError(error) &&
    typeof error.message === 'string' &&
    error.message.includes('infinite recursion detected in policy for relation "workspace_members"')
  ) {
    return {
      title: 'Supabase RLS policy is misconfigured.',
      detail:
        'The `workspace_members` select policy is recursively querying itself. Run the `20260408_fix_workspace_members_rls_recursion.sql` migration in the Supabase SQL editor, then refresh this page.',
    }
  }

  if (
    isPostgrestLikeError(error) &&
    error.code === 'PGRST205' &&
    typeof error.message === 'string' &&
    error.message.includes('public.workspace_members')
  ) {
    return {
      title: 'Supabase schema is not installed yet.',
      detail:
        'Your connected Supabase project is missing the product tables, starting with `workspace_members`. Run the SQL files in the `supabase/migrations` directory inside the Supabase SQL editor, then refresh this page.',
    }
  }

  return {
    title: 'Workspace data could not be loaded.',
    detail:
      error instanceof Error
        ? error.message
        : isPostgrestLikeError(error) && typeof error.message === 'string'
          ? error.message
          : 'The dashboard could not read the current workspace state.',
  }
}

function getOnboardingCopy(connectedCoreCount: number) {
  if (connectedCoreCount === 0) {
    return {
      headline: 'Connect your first sources.',
      detail:
        'Start with Stripe, PostHog, and Gmail so the product can see billing, usage, and founder follow-up activity in one place.',
    }
  }

  if (connectedCoreCount < CORE_PROVIDERS.length) {
    return {
      headline: 'Keep wiring the core stack.',
      detail:
        'You have part of the picture connected. Finish the core sources so the brief can reason across revenue, usage, and follow-up context.',
    }
  }

  return {
    headline: 'Connections are in place.',
    detail:
      'The workspace is ready, but no live customer state has been ingested yet. The dashboard will fill in once real sync data starts landing.',
  }
}

function normalizeStatus(
  definition: IntegrationDefinition,
  row: IntegrationRow | undefined,
  hasToken: boolean,
  suppressStoredRows: boolean
): IntegrationStatus {
  if (suppressStoredRows) {
    return definition.core ? 'Disconnected' : 'Coming soon'
  }

  const resolved = resolveConnectionStatus(
    row
      ? {
          provider: row.provider,
          status: row.status as any,
          metadata: row.metadata,
        }
      : null,
    hasToken
  )

  if (resolved === 'connected') return 'Connected'
  if (resolved === 'needs_attention') return 'Needs attention'
  if (resolved === 'disconnected') return 'Disconnected'
  return definition.core ? 'Disconnected' : 'Coming soon'
}

function buildIntegrationItems(
  rows: IntegrationRow[],
  tokenProviders: Set<string>,
  suppressStoredRows: boolean
) {
  const rowsByProvider = new Map(rows.map((row) => [row.provider, row]))

  return INTEGRATION_CATALOG.map((definition) => {
    const row = rowsByProvider.get(definition.provider)
    const status = normalizeStatus(
      definition,
      row,
      tokenProviders.has(definition.provider),
      suppressStoredRows
    )

    let value = definition.comingSoonValue
    if (status === 'Connected') {
      value =
        typeof row?.metadata?.coverage === 'string'
          ? row.metadata.coverage
          : 'Connected'
    } else if (status === 'Needs attention') {
      value =
        typeof row?.metadata?.coverage === 'string'
          ? row.metadata.coverage
          : 'Reconnect required'
    } else if (status === 'Disconnected') {
      value = definition.disconnectedValue
    }

    return {
      name: definition.name,
      status,
      description: definition.description,
      sync: formatSyncLabel(row?.last_synced_at ?? null, status),
      value,
    } satisfies IntegrationItem
  })
}

function buildBaseState(
  workspaceName: string,
  mode: DashboardMode,
  integrations: IntegrationItem[],
  notice: DashboardNotice | null,
  briefGeneratedLabel: string
): DashboardState {
  const connectedCoreCount = integrations.filter(
    (integration) =>
      ['Stripe', 'PostHog', 'Gmail'].includes(integration.name) &&
      integration.status === 'Connected'
  ).length

  const onboardingCopy = getOnboardingCopy(connectedCoreCount)

  return {
    mode,
    workspaceName,
    overviewMetrics: [],
    briefHeadline: 'Connect sources to generate the first brief.',
    briefSummary:
      'Once billing, usage, support, and founder email are connected, the brief will turn those signals into one clear operating view.',
    briefItems: [],
    actionItems: [],
    accountSummaries: [],
    draftQueue: [],
    liveSignals: [],
    integrations,
    briefGeneratedLabel,
    onboarding: {
      headline: onboardingCopy.headline,
      detail: onboardingCopy.detail,
      connectedCoreCount,
      totalCoreCount: CORE_PROVIDERS.length,
      steps: integrations
        .filter((integration) => ['Stripe', 'PostHog', 'Gmail'].includes(integration.name))
        .map((integration) => ({
          title: integration.name,
          description: integration.description,
          status: integration.status,
          href: '/dashboard/settings',
        })),
    },
    notice,
  }
}

const buildDashboardState = cache(
  async (userId: string | null, email: string | null): Promise<DashboardState> => {
    const emptyIntegrations = buildIntegrationItems([], new Set(), false)

    if (!userId) {
      return buildBaseState(
        'Allel',
        'degraded',
        emptyIntegrations,
        {
          tone: 'danger',
          title: 'No user session available.',
          detail: 'Sign in again to load workspace data.',
        },
        'Awaiting first brief'
      )
    }

    const supabase = await createClient()
    const user = { id: userId, email } as User

    try {
      const workspace = await ensureWorkspaceForUser(user)

      const [
        accountsRes,
        latestBriefRes,
        draftsRes,
        signalsRes,
        integrationsRes,
        tokenRowsRes,
        contactsCountRes,
      ] = await Promise.all([
        supabase
          .from('customer_accounts')
          .select(
            'id, name, segment, mrr_cents, risk_level, risk_score, usage_delta_percent, last_touch_at, open_issue, next_action, summary'
          )
          .eq('workspace_id', workspace.id)
          .order('risk_score', { ascending: false })
          .order('mrr_cents', { ascending: false }),
        supabase
          .from('founder_briefs')
          .select('id, brief_date, generated_at, headline, summary')
          .eq('workspace_id', workspace.id)
          .order('brief_date', { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from('follow_up_drafts')
          .select(
            'id, draft_type, subject, body_preview, status, due_label, customer_accounts(id, name)'
          )
          .eq('workspace_id', workspace.id)
          .order('created_at', { ascending: false }),
        supabase
          .from('account_signals')
          .select('event_at, headline, detail, customer_accounts(id, name)')
          .eq('workspace_id', workspace.id)
          .order('event_at', { ascending: false })
          .limit(4),
        supabase
          .from('integration_connections')
          .select('provider, status, last_synced_at, metadata')
          .eq('workspace_id', workspace.id)
          .order('provider'),
        supabase
          .from('integration_tokens')
          .select('provider')
          .eq('workspace_id', workspace.id),
        supabase
          .from('account_contacts')
          .select('id', { count: 'exact', head: true })
          .eq('workspace_id', workspace.id),
      ])

      if (
        accountsRes.error ||
        latestBriefRes.error ||
        draftsRes.error ||
        signalsRes.error ||
        integrationsRes.error ||
        tokenRowsRes.error ||
        contactsCountRes.error
      ) {
        throw (
          accountsRes.error ??
          latestBriefRes.error ??
          draftsRes.error ??
          signalsRes.error ??
          integrationsRes.error ??
          tokenRowsRes.error ??
          contactsCountRes.error
        )
      }

      const latestBrief = latestBriefRes.data as BriefRow | null

      const briefItemsRes = latestBrief
        ? await supabase
            .from('founder_brief_items')
            .select(
              'id, sort_order, risk_level, headline, detail, next_step, evidence, customer_accounts(id, name)'
            )
            .eq('workspace_id', workspace.id)
            .eq('founder_brief_id', latestBrief.id)
            .order('sort_order', { ascending: true })
        : { data: [], error: null }

      if (briefItemsRes.error) {
        throw briefItemsRes.error
      }

      const accounts = (accountsRes.data as AccountRow[] | null) ?? []
      const drafts = (draftsRes.data as DraftRow[] | null) ?? []
      const signals = (signalsRes.data as SignalRow[] | null) ?? []
      const integrationRows = (integrationsRes.data as IntegrationRow[] | null) ?? []
      const tokenRows = (tokenRowsRes.data as TokenRow[] | null) ?? []
      const briefItems = (briefItemsRes.data as BriefItemRow[] | null) ?? []
      const contactsCount = contactsCountRes.count ?? 0
      const relatedAccountIds = [
        ...briefItems.map((item) => readJoinedAccount(item.customer_accounts).id),
        ...drafts.map((draft) => readJoinedAccount(draft.customer_accounts).id),
      ]
        .filter((value): value is string => Boolean(value))
        .filter((value, index, values) => values.indexOf(value) === index)

      const briefAccountIds = relatedAccountIds
      const timelineRowsRes =
        briefAccountIds.length > 0
          ? await supabase
              .from('account_timeline')
              .select('customer_account_id, source, event_type')
              .eq('workspace_id', workspace.id)
              .in('customer_account_id', briefAccountIds)
              .order('event_at', { ascending: false })
              .limit(80)
          : { data: [], error: null }

      if (timelineRowsRes.error) {
        throw timelineRowsRes.error
      }

      const timelineRows = (timelineRowsRes.data as TimelineRow[] | null) ?? []
      const sourceMap = buildSourceMap(timelineRows)

      const tokenProviders = new Set(tokenRows.map((row) => row.provider))
      const hasStoredWorkspaceData =
        accounts.length > 0 ||
        drafts.length > 0 ||
        signals.length > 0 ||
        briefItems.length > 0 ||
        contactsCount > 0

      const hasLegacySeededWorkspace =
        hasStoredWorkspaceData && tokenProviders.size === 0 && contactsCount === 0

      const integrations = buildIntegrationItems(
        integrationRows,
        tokenProviders,
        hasLegacySeededWorkspace
      )

      const hasLiveWorkspaceData =
        !hasLegacySeededWorkspace &&
        (accounts.length > 0 ||
          drafts.length > 0 ||
          signals.length > 0 ||
          briefItems.length > 0 ||
          contactsCount > 0)

      if (!hasLiveWorkspaceData) {
        return buildBaseState(
          workspace.name,
          'onboarding',
          integrations,
          hasLegacySeededWorkspace
            ? {
                tone: 'warning',
                title: 'Old seeded records are no longer treated as live data.',
                detail:
                  'This workspace contains earlier demo-style records. Connect real sources to replace them with actual customer state.',
              }
            : null,
          formatBriefGeneratedLabel(latestBrief?.generated_at ?? null)
        )
      }

      const accountsAtRisk = accounts.filter((account) => account.risk_level !== 'low')
      const revenueExposedCents = accountsAtRisk.reduce(
        (sum, account) => sum + account.mrr_cents,
        0
      )
      const connectedSources = integrations.filter(
        (integration) => integration.status === 'Connected'
      ).length
      const mappedBriefItems = briefItems.map((item) => {
        const joinedAccount = readJoinedAccount(item.customer_accounts)
        const evidence = readEvidence(item.evidence)

        return {
          id: item.id,
          accountId: joinedAccount.id ?? undefined,
          account: joinedAccount.name,
          risk: formatRiskLevel(item.risk_level),
          headline: item.headline,
          detail: item.detail,
          evidence,
          nextStep: item.next_step,
          sources: buildBriefSources(joinedAccount.id, evidence, sourceMap),
        } satisfies BriefItem
      })
      const mappedDraftQueue = drafts.map((draft) => {
        const joinedAccount = readJoinedAccount(draft.customer_accounts)

        return {
          id: draft.id,
          accountId: joinedAccount.id ?? undefined,
          account: joinedAccount.name,
          type: draft.draft_type,
          subject: draft.subject,
          preview: draft.body_preview,
          status: formatDraftStatus(draft.status),
          due: draft.due_label ?? 'Needs scheduling',
          sources: buildBriefSources(joinedAccount.id, [], sourceMap),
        } satisfies DraftItem
      })
      const briefHeadline =
        latestBrief?.headline?.trim() ||
        (accountsAtRisk.length > 0
          ? `${accountsAtRisk.length} account${accountsAtRisk.length === 1 ? '' : 's'} need founder attention`
          : 'No urgent churn risks in the latest review')
      const briefSummary =
        latestBrief?.summary?.trim() ||
        `The brief is built from ${
          integrations
            .filter((integration) => integration.status === 'Connected')
            .map((integration) => integration.name)
            .join(', ') || 'connected sources'
        } and prioritizes concrete follow-up work.`

      return {
        ...buildBaseState(
          workspace.name,
          'live',
          integrations,
          null,
          formatBriefGeneratedLabel(latestBrief?.generated_at ?? null)
        ),
        overviewMetrics: [
          {
            label: 'Accounts at risk',
            value: String(accountsAtRisk.length),
            change: `${accounts.filter((account) => account.risk_level === 'high').length} high risk`,
            detail:
              'Accounts ranked by churn exposure, usage declines, and support friction.',
          },
          {
            label: 'Revenue exposed',
            value: formatCurrency(revenueExposedCents),
            change: 'Trailing 30 days',
            detail:
              'Recurring revenue currently tied to medium and high churn-risk accounts.',
          },
          {
            label: 'Drafts ready',
            value: String(
              drafts.filter((draft) => draft.status === 'ready_to_send').length
            ),
            change: `${drafts.length} total drafts`,
            detail:
              'Follow-up emails prepared by the agent and waiting for approval.',
          },
          {
            label: 'Coverage',
            value: `${connectedSources} sources`,
            change: integrations
              .filter((integration) => integration.status === 'Connected')
              .map((integration) => integration.name)
              .join(', '),
            detail:
              'The daily brief combines billing, product usage, support, and founder email context.',
          },
        ],
        briefHeadline,
        briefSummary,
        briefItems: mappedBriefItems,
        actionItems: buildActionItems(mappedBriefItems, mappedDraftQueue),
        accountSummaries: accounts.map((account) => ({
          id: account.id,
          name: account.name,
          segment: account.segment ?? 'Unassigned',
          mrr: formatCurrency(account.mrr_cents),
          risk: formatRiskLevel(account.risk_level),
          usageDelta: `${account.usage_delta_percent > 0 ? '+' : ''}${account.usage_delta_percent}%`,
          lastTouch: account.last_touch_at
            ? new Date(account.last_touch_at).toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
              })
            : 'No touch yet',
          openIssue: account.open_issue ?? 'None',
          nextAction: account.next_action ?? 'Review account health',
        })),
        draftQueue: mappedDraftQueue,
        liveSignals: signals.map((signal) => ({
          time: new Date(signal.event_at).toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit',
            hour12: false,
          }),
          label: signal.headline,
          detail: (() => {
            const joinedAccount = readJoinedAccount(signal.customer_accounts)
            return joinedAccount.name === 'Unknown account'
              ? signal.detail
              : `${joinedAccount.name}: ${signal.detail}`
          })(),
        })),
      }
    } catch (error) {
      console.warn('[dashboard/data] Entering degraded mode', error)
      const formattedError = formatWorkspaceLoadError(error)

      return buildBaseState(
        email ? `${email.split('@')[0]}'s Workspace` : 'Allel',
        'degraded',
        emptyIntegrations,
        {
          tone: 'danger',
          title: formattedError.title,
          detail: formattedError.detail,
        },
        'Awaiting first brief'
      )
    }
  }
)

export async function getDashboardStateForUser(
  user: { id: string; email?: string | null } | null
) {
  return buildDashboardState(user?.id ?? null, user?.email ?? null)
}
