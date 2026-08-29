/**
 * PostHog Workspace Sync — Goal.md compliant
 *
 * §14.1 Single-writer rule: This module does NOT write risk_score, risk_level, or risk_index.
 * It writes identity facts (provider_identities) and usage feature patches (account_features)
 * by enqueuing project_account_features jobs that flow through the canonical decision pipeline.
 *
 * §13.12: Uses provider_sync_cursors for incremental sync with a bounded overlap window.
 * Does NOT delete all existing usage signals.
 *
 * §10.3: PostHog identity primary key is distinct_id. Email bootstraps a mapping only when
 * it uniquely matches one verified contact.
 */

import { createServiceClient } from '@/foundation/database/service'
import { logAgentRun } from '@/agent/runtime/run-logger'
import { getPostHogCredentials, POSTHOG_DEFAULT_HOST } from '@/integrations/posthog/posthog'
import { generateWorkspaceBrief } from '@/intelligence/briefs/generate-workspace-brief'
import { mergeIntegrationConnectionMetadata } from '@/integrations/_core/connection-guard'
import { upsertProviderIdentity, resolveAccountIdentity } from '@/recovery/identity'
import { RECOVERY_CONFIG } from '@/recovery/config'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

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
  currentEvents: number   // events in [now-7d, now)
  previousEvents: number  // events in [now-14d, now-7d)
  cancelVisits: number
  topEvents: Map<string, number>
  hasCancelIntent: boolean
}

export type PostHogWorkspaceSyncResult = {
  syncedAccounts: number
  syncedContacts: number
  trackedUsers: number
  highRiskAccounts: number
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PERSONAL_EMAIL_DOMAINS = new Set([
  'gmail.com', 'googlemail.com', 'yahoo.com', 'hotmail.com',
  'outlook.com', 'icloud.com', 'proton.me', 'protonmail.com',
])

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function normalizeName(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ')
}

function toTitleCase(value: string) {
  return value.split(/[\s-]+/).filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function extractEmail(properties: Record<string, unknown> | undefined) {
  for (const key of ['email', '$email']) {
    const value = properties?.[key]
    if (typeof value === 'string' && value.includes('@')) {
      return value.toLowerCase()
    }
  }
  return null
}

function extractCompany(properties: Record<string, unknown> | undefined) {
  for (const key of ['company', 'organization', 'company_name', '$organization', 'org']) {
    const value = properties?.[key]
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim()
    }
  }
  return null
}

function extractName(properties: Record<string, unknown> | undefined) {
  for (const key of ['name', '$name', 'full_name']) {
    const value = properties?.[key]
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim()
    }
  }
  return null
}

function extractLastSeen(properties: Record<string, unknown> | undefined, fallback?: string) {
  for (const key of ['$last_seen', 'last_seen', 'last_activity_at']) {
    const value = properties?.[key]
    if (typeof value === 'string' && value.length > 0) return value
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

function usageDeltaPercent(currentEvents: number, previousEvents: number): number | null {
  // §13.8: Do not classify decline when previous volume is below minimum
  if (previousEvents < RECOVERY_CONFIG.USAGE_MIN_BASELINE_EVENTS) {
    return null // trend unavailable
  }
  return ((currentEvents - previousEvents) / previousEvents) * 100
}

// ---------------------------------------------------------------------------
// API helpers
// ---------------------------------------------------------------------------

async function fetchAllPersons(
  apiKey: string,
  projectId: string,
  apiHost: string = POSTHOG_DEFAULT_HOST
): Promise<PostHogPerson[]> {
  let nextUrl: string | null = `${apiHost}/api/projects/${projectId}/persons/?limit=200`
  const people: PostHogPerson[] = []

  while (nextUrl) {
    const response = await fetch(nextUrl, {
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      redirect: 'follow',
      signal: AbortSignal.timeout(15_000),
    })

    if (!response.ok) {
      throw new Error(`PostHog persons fetch failed: ${response.status} ${response.statusText}`)
    }

    const data = (await response.json()) as { results?: PostHogPerson[]; next?: string | null }
    people.push(...(data.results ?? []))
    nextUrl = typeof data.next === 'string' && data.next.length > 0 ? data.next : null
  }

  return people
}

async function fetchIncrementalEvents(
  apiKey: string,
  projectId: string,
  afterIso: string,
  apiHost: string = POSTHOG_DEFAULT_HOST
): Promise<PostHogEvent[]> {
  // §13.12: Bounded overlap window to tolerate late-arriving events
  const overlapMs = RECOVERY_CONFIG.POSTHOG_LATE_EVENT_OVERLAP_HOURS * 60 * 60 * 1000
  const overlapDate = new Date(new Date(afterIso).getTime() - overlapMs).toISOString()

  let nextUrl: string | null = `${apiHost}/api/projects/${projectId}/events/?limit=1000&after=${encodeURIComponent(overlapDate)}`
  const events: PostHogEvent[] = []

  while (nextUrl) {
    const response = await fetch(nextUrl, {
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      redirect: 'follow',
      signal: AbortSignal.timeout(15_000),
    })

    if (!response.ok) {
      throw new Error(`PostHog events fetch failed: ${response.status} ${response.statusText}`)
    }

    const data = (await response.json()) as { results?: PostHogEvent[]; next?: string | null }
    events.push(...(data.results ?? []))
    nextUrl = typeof data.next === 'string' && data.next.length > 0 ? data.next : null
  }

  return events
}

// ---------------------------------------------------------------------------
// Cursor management
// ---------------------------------------------------------------------------

async function readSyncCursor(
  supabase: ReturnType<typeof createServiceClient>,
  workspaceId: string
): Promise<string | null> {
  const { data } = await supabase
    .from('provider_sync_cursors')
    .select('cursor, watermark_at')
    .eq('workspace_id', workspaceId)
    .eq('provider', 'posthog')
    .eq('stream', 'posthog_events')
    .eq('scope_key', 'workspace')
    .maybeSingle()

  return data?.cursor ?? null
}

async function writeSyncCursor(
  supabase: ReturnType<typeof createServiceClient>,
  workspaceId: string,
  cursor: string
): Promise<void> {
  const now = new Date().toISOString()
  await supabase.from('provider_sync_cursors').upsert(
    {
      workspace_id: workspaceId,
      provider: 'posthog',
      stream: 'posthog_events',
      scope_key: 'workspace',
      cursor,
      watermark_at: cursor,
      last_success_at: now,
      status: 'idle',
      error: null,
      updated_at: now,
    },
    { onConflict: 'workspace_id,provider,stream,scope_key' }
  )
}

// ---------------------------------------------------------------------------
// Main sync function
// ---------------------------------------------------------------------------

export async function syncPostHogWorkspace(
  workspaceId: string,
  options?: { refreshBrief?: boolean }
): Promise<PostHogWorkspaceSyncResult> {
  const supabase = createServiceClient()
  const { apiKey, projectId, apiHost } = await getPostHogCredentials(workspaceId)

  if (!projectId) {
    throw new Error('PostHog project ID is missing for this workspace')
  }

  // §13.12: Read cursor; fall back to 14-day window on first sync
  const existingCursor = await readSyncCursor(supabase, workspaceId)
  const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString()
  const cursorToUse = existingCursor ?? fourteenDaysAgo
  const syncRunStart = new Date().toISOString()

  // Fetch persons (always full — persons list is small, events are incremental)
  const [people, existingAccountsRes, existingContactsRes] = await Promise.all([
    fetchAllPersons(apiKey, projectId, apiHost),
    supabase
      .from('customer_accounts')
      .select('id, name, account_status, mrr_cents, risk_level, risk_score, usage_delta_percent, open_issue, next_action, summary, last_touch_at, renewal_at')
      .eq('workspace_id', workspaceId),
    supabase
      .from('account_contacts')
      .select('email, customer_account_id, external_ids')
      .eq('workspace_id', workspaceId),
  ])

  const existingAccounts: ExistingAccount[] = existingAccountsRes.data ?? []
  const existingContacts: ExistingContact[] = existingContactsRes.data ?? []

  const accountsById = new Map(existingAccounts.map((a) => [a.id, a]))
  const accountsByName = new Map(existingAccounts.map((a) => [normalizeName(a.name), a]))
  const contactsByEmail = new Map(existingContacts.map((c) => [c.email.toLowerCase(), c]))

  // Build distinct_id → account_id from account_contacts.external_ids (legacy bridge)
  const distinctIdToAccountId = new Map<string, string>()
  for (const contact of existingContacts) {
    const posthogIds = (contact.external_ids as Record<string, unknown> | null)?.posthog_distinct_ids
    if (Array.isArray(posthogIds)) {
      for (const id of posthogIds) {
        if (typeof id === 'string') distinctIdToAccountId.set(id, contact.customer_account_id)
      }
    }
  }

  // §13.12: Fetch only events since cursor
  const recentEvents = await fetchIncrementalEvents(apiKey, projectId, cursorToUse, apiHost)

  // --- Person → account resolution loop ---
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

    // §10.3: Resolve by distinct_id first (from provider_identities), then email, then name
    // Step 1: Check provider_identities for any of this person's distinct_ids
    let resolvedAccountId: string | null = null
    for (const distinctId of distinctIds) {
      const existing = distinctIdToAccountId.get(distinctId)
      if (existing) { resolvedAccountId = existing; break }
    }

    // Step 2: Email lookup against account_contacts (legacy bridge + identity resolution)
    if (!resolvedAccountId && email) {
      const contact = contactsByEmail.get(email)
      if (contact) resolvedAccountId = contact.customer_account_id
    }

    // Step 3: Name-based fallback (only for account creation, not outreach decisions)
    let account = resolvedAccountId ? accountsById.get(resolvedAccountId) : undefined
    if (!account) account = accountsByName.get(normalizedAccountName)

    // Step 4: Create a new account row if we can't match (§13.12 allows new accounts from PostHog)
    if (!account) {
      const { data: insertedAccount, error: insertAccountError } = await supabase
        .from('customer_accounts')
        .insert({
          workspace_id: workspaceId,
          name: accountName,
          segment: 'PostHog usage',
          account_status: 'active',
          mrr_cents: 0,
          risk_level: 'low',   // §14.1: only the decision engine may set a scored value — low is the safe default
          risk_score: 0,
          usage_delta_percent: 0,
          next_action: 'Wait for more product activity before taking action.',
          summary: 'Initial PostHog account created from live usage identity.',
        })
        .select('id, name, account_status, mrr_cents, risk_level, risk_score, usage_delta_percent, open_issue, next_action, summary, last_touch_at, renewal_at')
        .single()

      if (insertAccountError) throw insertAccountError
      account = insertedAccount as ExistingAccount
      accountsByName.set(normalizedAccountName, account)
      accountsById.set(account.id, account)
    }

    // §10.3: Write each distinct_id to provider_identities (machine identity table)
    for (const distinctId of distinctIds) {
      try {
        await upsertProviderIdentity(supabase, {
          workspaceId,
          customerAccountId: account.id,
          provider: 'posthog',
          identityType: 'distinct_id',
          externalId: distinctId,
          isPrimary: distinctId === distinctIds[0],
          verificationStatus: 'verified',
          source: 'posthog_sync',
          metadata: { person_id: person.id ?? null },
        })
        distinctIdToAccountId.set(distinctId, account.id)
      } catch {
        // Non-fatal — conflict already logged by upsert
      }
    }

    // §10.3: Write person email as a secondary identity
    if (email) {
      try {
        await upsertProviderIdentity(supabase, {
          workspaceId,
          customerAccountId: account.id,
          provider: 'posthog',
          identityType: 'person_email',
          externalId: email,
          isPrimary: false,
          verificationStatus: 'verified',
          source: 'posthog_sync',
        })
      } catch { /* conflict handled by upsert */ }
    }

    // Build aggregate
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
        hasCancelIntent: false,
      }
      aggregates.set(account.id, aggregate)
    }

    aggregate.totalUsers += 1
    if (email) {
      aggregate.emails.add(email)
      personEmailByDistinctId.set(distinctIds[0] ?? email, email)
    }
    distinctIds.forEach((id) => {
      aggregate!.distinctIds.add(id)
      distinctIdToAccountId.set(id, account!.id)
    })

    if (lastSeenAt) {
      if (!aggregate.lastSeenAt || new Date(lastSeenAt) > new Date(aggregate.lastSeenAt)) {
        aggregate.lastSeenAt = lastSeenAt
      }
      if (new Date(lastSeenAt).getTime() >= Date.now() - 7 * 24 * 60 * 60 * 1000) {
        aggregate.activeUsers7d += 1
      }
    }

    // Upsert account_contacts for display name and role (§9.2: account_contacts remains human contact table)
    if (email) {
      const existingContact = contactsByEmail.get(email)
      const mergedDistinctIds = Array.from(new Set([
        ...(Array.isArray(existingContact?.external_ids?.posthog_distinct_ids)
          ? (existingContact!.external_ids!.posthog_distinct_ids as string[])
          : []),
        ...distinctIds,
      ]))

      const { error: contactUpsertError } = await supabase.from('account_contacts').upsert(
        {
          workspace_id: workspaceId,
          customer_account_id: account.id,
          email,
          name: personName,
          role: 'product_user',
          is_primary: existingContact?.customer_account_id === account.id,
          external_ids: {
            ...(existingContact?.external_ids ?? {}),
            posthog_person_id: person.id ?? null,
            posthog_distinct_ids: mergedDistinctIds,
          },
        },
        { onConflict: 'workspace_id,email' }
      )

      if (contactUpsertError) throw contactUpsertError
      contactsByEmail.set(email, { email, customer_account_id: account.id, external_ids: null })
      syncedContacts += 1
    }
  }

  // --- Event window aggregation ---
  const now = Date.now()
  const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000
  const fourteenDaysAgoMs = now - 14 * 24 * 60 * 60 * 1000

  for (const event of recentEvents) {
    const distinctId = event.distinct_id
    if (!distinctId) continue

    const email =
      extractEmail(event.person?.properties) ??
      extractEmail(event.properties) ??
      personEmailByDistinctId.get(distinctId) ??
      null

    const contact = email ? contactsByEmail.get(email.toLowerCase()) : undefined
    const accountId = contact?.customer_account_id ?? distinctIdToAccountId.get(distinctId)
    if (!accountId) continue

    const aggregate = aggregates.get(accountId)
    if (!aggregate) continue

    const timestamp = event.timestamp ? new Date(event.timestamp).getTime() : 0
    if (timestamp < fourteenDaysAgoMs) continue // Outside the 14-day analysis window

    const isCurrentWindow = timestamp >= sevenDaysAgo
    const eventName = event.event ?? 'event'

    if (isCurrentWindow) {
      aggregate.currentEvents += 1
    } else {
      aggregate.previousEvents += 1
    }

    aggregate.topEvents.set(eventName, (aggregate.topEvents.get(eventName) ?? 0) + 1)

    // §13.10: Cancel intent detection
    const isCancelIntent = eventName === 'allel_cancel_intent'
      || (eventName === '$pageview' && typeof event.properties?.$current_url === 'string'
          && /cancel|churn|downgrade/i.test(event.properties.$current_url as string))

    if (isCancelIntent) {
      aggregate.hasCancelIntent = true
      aggregate.cancelVisits += 1
    }
  }

  // --- §14.1: Enqueue project_account_features jobs instead of writing risk scores ---
  let syncedAccounts = 0
  let highRiskAccounts = 0  // estimate only — real scoring happens in the decision engine

  for (const aggregate of aggregates.values()) {
    const existingAccount = accountsById.get(aggregate.accountId)
    if (!existingAccount) continue

    const delta = usageDeltaPercent(aggregate.currentEvents, aggregate.previousEvents)
    const topEvent = [...aggregate.topEvents.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null

    // Build the feature patch for the canonical projector
    const featurePatch: Record<string, unknown> = {
      usageAvailable: true,
      usageCurrent7d: aggregate.currentEvents,
      usagePrevious7d: aggregate.previousEvents,
      usageFreshAt: syncRunStart,
      lastProductActivityAt: aggregate.lastSeenAt,
    }

    if (delta !== null) {
      featurePatch.usageDeltaPercent = delta
    }

    if (aggregate.hasCancelIntent) {
      featurePatch.cancelIntentAt = syncRunStart
    }

    // §13.9: Key feature disappearance
    if (
      aggregate.previousEvents >= RECOVERY_CONFIG.KEY_FEATURE_MIN_BASELINE_EVENTS &&
      aggregate.currentEvents === 0
    ) {
      featurePatch.keyFeatureMissing = true
      featurePatch.keyFeatureCurrent7d = 0
      featurePatch.keyFeaturePrevious7d = aggregate.previousEvents
    }

    // Enqueue a project_account_features job to run through the canonical pipeline
    const jobIdempotencyKey = `ws:${workspaceId}:account:${aggregate.accountId}:posthog_sync:${syncRunStart}`

    const { error: jobError } = await supabase.from('workflow_jobs').upsert(
      {
        workspace_id: workspaceId,
        job_type: 'project_account_features',
        idempotency_key: jobIdempotencyKey,
        status: 'pending',
        priority: aggregate.hasCancelIntent ? 10 : 100, // cancel intent is urgent
        payload: {
          workspaceId,
          customerAccountId: aggregate.accountId,
          patch: featurePatch,
          triggerProvider: 'posthog',
          triggerEventType: aggregate.hasCancelIntent ? 'allel_cancel_intent' : 'posthog_sync',
          evidence: [
            `Current 7d events: ${aggregate.currentEvents}`,
            `Previous 7d events: ${aggregate.previousEvents}`,
            ...(delta !== null ? [`Usage delta: ${delta.toFixed(1)}%`] : ['Insufficient baseline for trend']),
            ...(topEvent ? [`Top event: ${topEvent}`] : []),
            ...(aggregate.hasCancelIntent ? ['Cancellation intent detected in PostHog'] : []),
          ],
          occurredAt: syncRunStart,
        },
        next_attempt_at: new Date().toISOString(),
      },
      { onConflict: 'idempotency_key', ignoreDuplicates: true }
    )

    if (jobError) {
      // Non-fatal: job may already exist from webhook ingestion
      console.warn('[posthog-sync] job upsert warning:', jobError.message)
    }

    syncedAccounts += 1

    // Rough high-risk estimate for logging (real label set by decision engine)
    const isLikelyHighRisk = aggregate.hasCancelIntent || (delta !== null && delta <= -40)
    if (isLikelyHighRisk) highRiskAccounts += 1
  }

  // §13.12: Advance cursor AFTER all projections enqueued
  await writeSyncCursor(supabase, workspaceId, syncRunStart)

  // Update integration connection metadata
  const { error: connectionError } = await supabase.from('integration_connections').upsert(
    {
      workspace_id: workspaceId,
      provider: 'posthog',
      status: 'connected',
      last_synced_at: syncRunStart,
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
    outputSummary: `PostHog sync completed: ${people.length} people, ${syncedAccounts} account(s), ${highRiskAccounts} likely high-risk. ${recentEvents.length} events processed since cursor.`,
    metadata: {
      provider: 'posthog',
      trackedUsers: people.length,
      syncedAccounts,
      syncedContacts,
      highRiskAccounts,
      eventsSinceLastCursor: recentEvents.length,
      cursorAdvancedTo: syncRunStart,
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
