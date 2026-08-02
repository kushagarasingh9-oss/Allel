import { createServiceClient } from '@/lib/supabase/service'
import { logAgentRun } from '@/lib/agent/run-logger'
import { buildSignalsFromAccount, scoreAccount } from '@/lib/engine/score-engine'
import { getPostHogCredentials } from './posthog'
import { generateWorkspaceBrief } from '@/lib/briefs/generate-workspace-brief'
import { mergeIntegrationConnectionMetadata } from './connection-guard'

type ExistingAccount = {
  id: string
  name: string
  account_status: string
  mrr_cents: number
  risk_level: string
  risk_score: number
  usage_delta_percent: number
  open_issue: string | null
  next_action: string | null
  summary: string | null
  last_touch_at: string | null
  renewal_at: string | null
}

type ExistingContact = {
  email: string
  customer_account_id: string
  external_ids: Record<string, unknown> | null
}

type PostHogPerson = {
  id?: string
  distinct_ids?: string[]
  created_at?: string
  properties?: Record<string, unknown>
}

type PostHogEvent = {
  event?: string
  distinct_id?: string
  timestamp?: string
  properties?: Record<string, unknown>
  person?: {
    properties?: Record<string, unknown>
  }
}

type AccountAggregate = {
  accountId: string
  accountName: string
  emails: Set<string>
  distinctIds: Set<string>
  totalUsers: number
  activeUsers7d: number
  lastSeenAt: string | null
  currentEvents: number
  previousEvents: number
  cancelVisits: number
  topEvents: Map<string, number>
}

export type PostHogWorkspaceSyncResult = {
  syncedAccounts: number
  syncedContacts: number
  trackedUsers: number
  highRiskAccounts: number
}

const PERSONAL_EMAIL_DOMAINS = new Set([
  'gmail.com',
  'googlemail.com',
  'yahoo.com',
  'hotmail.com',
  'outlook.com',
  'icloud.com',
  'proton.me',
  'protonmail.com',
])

function normalizeName(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
}

function toTitleCase(value: string) {
  return value
    .split(/[\s-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function extractEmail(properties: Record<string, unknown> | undefined) {
  const possibleKeys = ['email', '$email']
  for (const key of possibleKeys) {
    const value = properties?.[key]
    if (typeof value === 'string' && value.includes('@')) {
      return value.toLowerCase()
    }
  }
  return null
}

function extractCompany(properties: Record<string, unknown> | undefined) {
  const possibleKeys = ['company', 'organization', 'company_name', '$organization', 'org']
  for (const key of possibleKeys) {
    const value = properties?.[key]
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim()
    }
  }
  return null
}

function extractName(properties: Record<string, unknown> | undefined) {
  const possibleKeys = ['name', '$name', 'full_name']
  for (const key of possibleKeys) {
    const value = properties?.[key]
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim()
    }
  }
  return null
}

function extractLastSeen(properties: Record<string, unknown> | undefined, fallback?: string) {
  const possibleKeys = ['$last_seen', 'last_seen', 'last_activity_at']
  for (const key of possibleKeys) {
    const value = properties?.[key]
    if (typeof value === 'string' && value.length > 0) {
      return value
    }
  }
  return fallback ?? null
}

function emailDomain(email: string) {
  return email.split('@')[1]?.toLowerCase() ?? ''
}

function accountNameFromIdentity(email: string | null, company: string | null, name: string | null) {
  if (company) return company

  if (email) {
    const domain = emailDomain(email)
    if (domain && !PERSONAL_EMAIL_DOMAINS.has(domain)) {
      return toTitleCase(domain.split('.')[0] ?? domain)
    }
  }

  return name ?? 'PostHog account'
}

function usageDeltaPercent(currentEvents: number, previousEvents: number) {
  if (previousEvents === 0) {
    return currentEvents > 0 ? 100 : 0
  }

  return Math.round(((currentEvents - previousEvents) / previousEvents) * 100)
}

function buildUsageNextAction(scoreRisk: 'high' | 'medium' | 'low', cancelVisits: number) {
  if (cancelVisits > 0) {
    return 'Review cancellation intent and send a founder save note today.'
  }

  if (scoreRisk === 'high') {
    return 'Review the usage drop and send a check-in today.'
  }

  if (scoreRisk === 'medium') {
    return 'Watch this account and review the latest product activity.'
  }

  return 'No immediate action needed.'
}

async function fetchAllPersons(
  apiKey: string,
  projectId: string
): Promise<PostHogPerson[]> {
  let nextUrl: string | null = `https://app.posthog.com/api/projects/${projectId}/persons/?limit=200`
  const people: PostHogPerson[] = []

  while (nextUrl) {
    const response = await fetch(nextUrl, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
    })

    if (!response.ok) {
      throw new Error(`PostHog persons fetch failed: ${response.status} ${response.statusText}`)
    }

    const data = (await response.json()) as {
      results?: PostHogPerson[]
      next?: string | null
    }

    people.push(...(data.results ?? []))
    nextUrl = typeof data.next === 'string' && data.next.length > 0 ? data.next : null
  }

  return people
}

async function fetchRecentEvents(
  apiKey: string,
  projectId: string,
  afterIso: string
): Promise<PostHogEvent[]> {
  let nextUrl: string | null = `https://app.posthog.com/api/projects/${projectId}/events/?limit=1000&after=${encodeURIComponent(
    afterIso
  )}`
  const events: PostHogEvent[] = []

  while (nextUrl) {
    const response = await fetch(nextUrl, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
    })

    if (!response.ok) {
      throw new Error(`PostHog events fetch failed: ${response.status} ${response.statusText}`)
    }

    const data = (await response.json()) as {
      results?: PostHogEvent[]
      next?: string | null
    }

    events.push(...(data.results ?? []))
    nextUrl = typeof data.next === 'string' && data.next.length > 0 ? data.next : null
  }

  return events
}

export async function syncPostHogWorkspace(
  workspaceId: string,
  options?: { refreshBrief?: boolean }
): Promise<PostHogWorkspaceSyncResult> {
  const supabase = createServiceClient()
  const { apiKey, projectId } = await getPostHogCredentials(workspaceId)

  if (!projectId) {
    throw new Error('PostHog project ID is missing for this workspace')
  }

  const [people, existingAccountsRes, existingContactsRes] = await Promise.all([
    fetchAllPersons(apiKey, projectId),
    supabase
      .from('customer_accounts')
      .select(
        'id, name, account_status, mrr_cents, risk_level, risk_score, usage_delta_percent, open_issue, next_action, summary, last_touch_at, renewal_at'
      )
      .eq('workspace_id', workspaceId),
    supabase
      .from('account_contacts')
      .select('email, customer_account_id, external_ids')
      .eq('workspace_id', workspaceId),
  ])

  if (existingAccountsRes.error) throw existingAccountsRes.error
  if (existingContactsRes.error) throw existingContactsRes.error

  const existingAccounts = (existingAccountsRes.data as ExistingAccount[] | null) ?? []
  const existingContacts = (existingContactsRes.data as ExistingContact[] | null) ?? []

  const contactsByEmail = new Map(existingContacts.map((contact) => [contact.email.toLowerCase(), contact]))
  const accountsByName = new Map(existingAccounts.map((account) => [normalizeName(account.name), account]))
  const accountsById = new Map(existingAccounts.map((account) => [account.id, account]))
  const distinctIdToAccountId = new Map<string, string>()

  existingContacts.forEach((contact) => {
    const externalIds = contact.external_ids ?? {}
    const posthogDistinctIds = externalIds.posthog_distinct_ids
    if (Array.isArray(posthogDistinctIds)) {
      posthogDistinctIds.forEach((value) => {
        if (typeof value === 'string') {
          distinctIdToAccountId.set(value, contact.customer_account_id)
        }
      })
    }
  })

  const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString()
  const recentEvents = await fetchRecentEvents(apiKey, projectId, fourteenDaysAgo)

  const personEmailByDistinctId = new Map<string, string>()
  const aggregates = new Map<string, AccountAggregate>()
  let syncedContacts = 0

  for (const person of people) {
    const properties = person.properties ?? {}
    const email = extractEmail(properties)
    const company = extractCompany(properties)
    const personName = extractName(properties)
    const accountName = accountNameFromIdentity(email, company, personName)
    const normalizedAccountName = normalizeName(accountName)
    const distinctIds = person.distinct_ids ?? []
    const lastSeenAt = extractLastSeen(properties, person.created_at)

    let account =
      (email ? accountsById.get(contactsByEmail.get(email)?.customer_account_id ?? '') : undefined) ??
      (distinctIds
        .map((distinctId) => distinctIdToAccountId.get(distinctId))
        .find((value): value is string => typeof value === 'string')
        ? accountsById.get(
            distinctIds
              .map((distinctId) => distinctIdToAccountId.get(distinctId))
              .find((value): value is string => typeof value === 'string') ?? ''
          )
        : undefined) ??
      accountsByName.get(normalizedAccountName)

    if (!account) {
      const { data: insertedAccount, error: insertAccountError } = await supabase
        .from('customer_accounts')
        .insert({
          workspace_id: workspaceId,
          name: accountName,
          segment: 'PostHog usage',
          account_status: 'active',
          mrr_cents: 0,
          risk_level: 'low',
          risk_score: 0,
          usage_delta_percent: 0,
          next_action: 'Wait for more product activity before taking action.',
          summary: 'Initial PostHog account created from live usage identity.',
        })
        .select(
          'id, name, account_status, mrr_cents, risk_level, risk_score, usage_delta_percent, open_issue, next_action, summary, last_touch_at, renewal_at'
        )
        .single()

      if (insertAccountError) throw insertAccountError

      account = insertedAccount as ExistingAccount
      accountsByName.set(normalizedAccountName, account)
      accountsById.set(account.id, account)
    }

    let aggregate = aggregates.get(account.id)
    if (!aggregate) {
      aggregate = {
        accountId: account.id,
        accountName: account.name,
        emails: new Set<string>(),
        distinctIds: new Set<string>(),
        totalUsers: 0,
        activeUsers7d: 0,
        lastSeenAt: null,
        currentEvents: 0,
        previousEvents: 0,
        cancelVisits: 0,
        topEvents: new Map<string, number>(),
      }
      aggregates.set(account.id, aggregate)
    }

    aggregate.totalUsers += 1

    if (email) {
      aggregate.emails.add(email)
    }

    distinctIds.forEach((distinctId) => {
      aggregate?.distinctIds.add(distinctId)
      if (email) {
        personEmailByDistinctId.set(distinctId, email)
      }
      distinctIdToAccountId.set(distinctId, account!.id)
    })

    if (lastSeenAt) {
      if (!aggregate.lastSeenAt || new Date(lastSeenAt) > new Date(aggregate.lastSeenAt)) {
        aggregate.lastSeenAt = lastSeenAt
      }

      if (new Date(lastSeenAt).getTime() >= Date.now() - 7 * 24 * 60 * 60 * 1000) {
        aggregate.activeUsers7d += 1
      }
    }

    if (email) {
      const existingContact = contactsByEmail.get(email)
      const mergedDistinctIds = Array.from(
        new Set([
          ...(Array.isArray(existingContact?.external_ids?.posthog_distinct_ids)
            ? existingContact?.external_ids?.posthog_distinct_ids.filter(
                (value): value is string => typeof value === 'string'
              )
            : []),
          ...distinctIds,
        ])
      )

      const { error: contactUpsertError } = await supabase.from('account_contacts').upsert(
        {
          workspace_id: workspaceId,
          customer_account_id: account.id,
          email,
          name: personName,
          role: 'product_user',
          is_primary: existingContact?.customer_account_id === account.id ? true : false,
          external_ids: {
            ...(existingContact?.external_ids ?? {}),
            posthog_person_id: person.id ?? null,
            posthog_distinct_ids: mergedDistinctIds,
          },
        },
        { onConflict: 'workspace_id,email' }
      )

      if (contactUpsertError) throw contactUpsertError

      contactsByEmail.set(email, {
        email,
        customer_account_id: account.id,
        external_ids: {
          ...(existingContact?.external_ids ?? {}),
          posthog_person_id: person.id ?? null,
          posthog_distinct_ids: mergedDistinctIds,
        },
      })
      syncedContacts += 1
    }
  }

  const now = Date.now()
  const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000

  recentEvents.forEach((event) => {
    const distinctId = event.distinct_id
    if (!distinctId) return

    const email =
      extractEmail(event.person?.properties) ??
      extractEmail(event.properties) ??
      personEmailByDistinctId.get(distinctId) ??
      null

    const contact = email ? contactsByEmail.get(email.toLowerCase()) : undefined
    const accountId = contact?.customer_account_id ?? distinctIdToAccountId.get(distinctId)
    if (!accountId) return

    const aggregate = aggregates.get(accountId)
    if (!aggregate) return

    const timestamp = event.timestamp ? new Date(event.timestamp).getTime() : 0
    const isCurrentWindow = timestamp >= sevenDaysAgo
    const eventName = event.event ?? 'event'

    if (isCurrentWindow) {
      aggregate.currentEvents += 1
    } else {
      aggregate.previousEvents += 1
    }

    aggregate.topEvents.set(eventName, (aggregate.topEvents.get(eventName) ?? 0) + 1)

    const currentUrl =
      typeof event.properties?.$current_url === 'string' ? event.properties.$current_url : null
    if (currentUrl?.includes('/cancel')) {
      aggregate.cancelVisits += 1
    }
  })

  let syncedAccounts = 0
  let highRiskAccounts = 0

  // Clear stale usage signals before re-creating (idempotent re-sync)
  const { error: clearSignalsError } = await supabase
    .from('account_signals')
    .delete()
    .eq('workspace_id', workspaceId)
    .eq('signal_type', 'usage')

  if (clearSignalsError) throw clearSignalsError

  for (const aggregate of aggregates.values()) {
    const existingAccount = accountsById.get(aggregate.accountId)
    if (!existingAccount) continue

    const delta = usageDeltaPercent(aggregate.currentEvents, aggregate.previousEvents)
    const topEvent = [...aggregate.topEvents.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null

    const score = scoreAccount(
      buildSignalsFromAccount({
        mrr_cents: existingAccount.mrr_cents,
        usage_delta_percent: delta,
        risk_level: existingAccount.risk_level,
        open_issue: existingAccount.open_issue,
        last_touch_at: existingAccount.last_touch_at,
        renewal_at: existingAccount.renewal_at,
        account_status: existingAccount.account_status,
      })
    )

    const detailSuffix =
      aggregate.currentEvents === 0 && aggregate.previousEvents === 0
        ? 'No qualifying PostHog events were seen in the last 14 days.'
        : `Tracked ${aggregate.currentEvents} events in the last 7 days vs ${aggregate.previousEvents} in the prior 7 days.`

    const { error: accountUpdateError } = await supabase
      .from('customer_accounts')
      .update({
        usage_delta_percent: delta,
        risk_level: score.riskLevel,
        risk_score: score.score,
        summary: `${score.summary} ${detailSuffix}`,
        next_action: buildUsageNextAction(score.riskLevel, aggregate.cancelVisits),
      })
      .eq('id', aggregate.accountId)

    if (accountUpdateError) throw accountUpdateError

    syncedAccounts += 1
    if (score.riskLevel === 'high') {
      highRiskAccounts += 1
    }

    if (delta <= -20 || aggregate.cancelVisits > 0) {
      const signalHeadline =
        aggregate.cancelVisits > 0
          ? 'Cancellation intent detected'
          : `Usage dropped ${Math.abs(delta)}%`
      const signalDetail =
        aggregate.cancelVisits > 0
          ? `${aggregate.accountName} had ${aggregate.cancelVisits} cancellation-page visit${
              aggregate.cancelVisits === 1 ? '' : 's'
            } in PostHog.`
          : `${aggregate.accountName} dropped from ${aggregate.previousEvents} to ${aggregate.currentEvents} tracked events across the last two 7-day windows.`

      const { error: signalError } = await supabase.from('account_signals').insert({
        workspace_id: workspaceId,
        customer_account_id: aggregate.accountId,
        signal_type: 'usage',
        headline: signalHeadline,
        detail: signalDetail,
        next_step: buildUsageNextAction(score.riskLevel, aggregate.cancelVisits),
        evidence: [
          `Current 7d events: ${aggregate.currentEvents}`,
          `Previous 7d events: ${aggregate.previousEvents}`,
          ...(topEvent ? [`Top event: ${topEvent}`] : []),
        ],
        risk_level: score.riskLevel,
      })

      if (signalError) throw signalError

      // Deduplicate timeline entries by account + event type + metadata
      const timelineMetadata = {
        current_events: aggregate.currentEvents,
        previous_events: aggregate.previousEvents,
        top_event: topEvent,
      }

      const { data: existingTimelineEvent, error: existingTimelineError } = await supabase
        .from('account_timeline')
        .select('id')
        .eq('workspace_id', workspaceId)
        .eq('customer_account_id', aggregate.accountId)
        .eq('event_type', 'usage')
        .contains('metadata', {
          current_events: aggregate.currentEvents,
          previous_events: aggregate.previousEvents,
        })
        .maybeSingle()

      if (existingTimelineError) throw existingTimelineError

      if (!existingTimelineEvent) {
        const { error: timelineError } = await supabase.from('account_timeline').insert({
          workspace_id: workspaceId,
          customer_account_id: aggregate.accountId,
          event_type: 'usage',
          headline: signalHeadline,
          detail: signalDetail,
          source: 'posthog',
          metadata: timelineMetadata,
        })

        if (timelineError) throw timelineError
      }
    }
  }

  const { error: connectionError } = await supabase.from('integration_connections').upsert(
    {
      workspace_id: workspaceId,
      provider: 'posthog',
      status: 'connected',
      last_synced_at: new Date().toISOString(),
      metadata: await mergeIntegrationConnectionMetadata(supabase, workspaceId, 'posthog', {
        project_id: projectId,
        coverage: `${people.length} people synced across ${syncedAccounts} account(s)`,
        synced_people: people.length,
        synced_accounts: syncedAccounts,
      }),
    },
    { onConflict: 'workspace_id,provider' }
  )

  if (connectionError) throw connectionError

  await logAgentRun({
    workspaceId,
    runType: 'integration_synced',
    status: 'completed',
    outputSummary: `PostHog sync completed: ${people.length} people, ${syncedAccounts} account(s), ${highRiskAccounts} high-risk account(s).`,
    metadata: {
      provider: 'posthog',
      trackedUsers: people.length,
      syncedAccounts,
      syncedContacts,
      highRiskAccounts,
    },
  })

  if (options?.refreshBrief ?? true) await generateWorkspaceBrief(workspaceId)

  return {
    syncedAccounts,
    syncedContacts,
    trackedUsers: people.length,
    highRiskAccounts,
  }
}
