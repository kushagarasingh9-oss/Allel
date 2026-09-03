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
import { upsertProviderIdentity, linkContactSafely } from '@/recovery/identity'
import { PERSONAL_EMAIL_DOMAINS } from '@/integrations/_core/account-match'
import { RECOVERY_CONFIG } from '@/recovery/config'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ExistingAccount = {
  id: string
  name: string
  account_status: string
  mrr_cents: number
  risk_level: string | null
  risk_score: number | null
  usage_delta_percent: number | null
  open_issue: string | null
  next_action: string | null
  summary: string | null
  last_touch_at: string | null
  renewal_at: string | null
  is_provisional?: boolean
}

type ExistingContact = {
  email: string
  customer_account_id: string
  external_ids: Record<string, unknown> | null
  is_provisional?: boolean
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

export type LifecycleEventConfig = {
  signup: string[]
  onboardingCompleted: string[]
  activationCompleted: string[]
  keyFeatureUsed: string[]
  planSelected: string[]
  cancellationIntent: string[]
  dataExportIntent: string[]
  seatContraction: string[]
}

export const DEFAULT_LIFECYCLE_CONFIG: LifecycleEventConfig = {
  signup: ['user_signed_up', 'signup_completed', '$pageview_signup'],
  onboardingCompleted: ['onboarding_completed', 'workspace_created', 'team_invited'],
  activationCompleted: ['activation_completed', 'first_workflow_run', 'integration_connected'],
  keyFeatureUsed: ['core_feature_used', 'report_generated', 'api_request_sent'],
  planSelected: ['plan_selected', 'checkout_started'],
  cancellationIntent: [
    'subscription_cancel_clicked',
    'downgrade_clicked',
    'allel_cancel_intent',
    'cancel_subscription_initiated',
  ],
  dataExportIntent: [
    'data_export_requested',
    'bulk_export_clicked',
    'csv_downloaded',
    'backup_downloaded',
    'export_all_data',
  ],
  seatContraction: [
    'member_removed',
    'seat_deleted',
    'team_member_left',
    'integration_disconnected',
    'api_key_revoked',
  ],
}

export const CANCELLATION_URL_PATTERNS: RegExp[] = [
  /\/settings\/billing\/cancel/i,
  /\/cancel-subscription/i,
  /\/downgrade/i,
  /\/billing\/delete/i,
  /\/settings\/export/i,
  /\/export-data/i,
  /cancel|churn|downgrade/i,
]

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
  signupAt: string | null
  onboardingCompletedAt: string | null
  activationCompletedAt: string | null
  hasKeyFeatureUsed: boolean
  cancelIntentAt: string | null
}

export type PostHogWorkspaceSyncResult = {
  syncedAccounts: number
  syncedContacts: number
  trackedUsers: number
  highRiskAccounts: number
  identityConflicts: number
  provisionalAccounts: number
}

// ---------------------------------------------------------------------------
// Constants
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
  apiHost?: string | null
): Promise<PostHogPerson[]> {
  const host = apiHost || POSTHOG_DEFAULT_HOST
  let nextUrl: string | null = `${host}/api/projects/${projectId}/persons/?limit=200`
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
  apiHost?: string | null
): Promise<PostHogEvent[]> {
  const host = apiHost || POSTHOG_DEFAULT_HOST
  // §13.12: Bounded overlap window to tolerate late-arriving events
  const overlapMs = RECOVERY_CONFIG.POSTHOG_LATE_EVENT_OVERLAP_HOURS * 60 * 60 * 1000
  const overlapDate = new Date(new Date(afterIso).getTime() - overlapMs).toISOString()

  let nextUrl: string | null = `${host}/api/projects/${projectId}/events/?limit=1000&after=${encodeURIComponent(overlapDate)}`
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

import type { SupabaseClient } from '@supabase/supabase-js'

export async function syncPostHogWorkspace(
  workspaceId: string,
  options?: {
    refreshBrief?: boolean
    supabaseClient?: SupabaseClient
    credentialsOverride?: { apiKey: string; projectId: string; apiHost: string | null }
  }
): Promise<PostHogWorkspaceSyncResult> {
  const supabase = options?.supabaseClient ?? createServiceClient()
  const creds = options?.credentialsOverride ?? (await getPostHogCredentials(workspaceId))
  const { apiKey, projectId, apiHost } = creds

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
  const existingContacts: (ExistingContact & { is_provisional?: boolean })[] = existingContactsRes.data ?? []

  const accountsById = new Map(existingAccounts.map((a) => [a.id, a]))
  const accountsByName = new Map(existingAccounts.map((a) => [normalizeName(a.name), a]))
  // Only non-provisional contacts on non-provisional accounts can be used for verified identity resolution
  const contactsByEmail = new Map(
    existingContacts
      .filter((c) => !c.is_provisional && accountsById.get(c.customer_account_id)?.is_provisional !== true)
      .map((c) => [c.email.toLowerCase(), c])
  )

  // §10.3: Primary distinct_id lookup from provider_identities (authoritative single source of truth)
  const { data: posthogIdentities } = await supabase
    .from('provider_identities')
    .select('normalized_external_id, customer_account_id')
    .eq('workspace_id', workspaceId)
    .eq('provider', 'posthog')
    .eq('identity_type', 'distinct_id')
    .eq('verification_status', 'verified')

  const distinctIdToAccountId = new Map<string, string>(
    (posthogIdentities ?? []).map((r: { normalized_external_id: string; customer_account_id: string }) => [
      r.normalized_external_id,
      r.customer_account_id,
    ])
  )

  // §13.12: Fetch only events since cursor
  const recentEvents = await fetchIncrementalEvents(apiKey, projectId, cursorToUse, apiHost)

  // --- Person → account resolution loop ---
  const personEmailByDistinctId = new Map<string, string>()
  const aggregates = new Map<string, AccountAggregate>()
  let syncedContacts = 0
  let provisionalAccounts = 0
  let identityConflicts = 0

  for (const person of people) {
    const properties = person.properties ?? {}
    const email = extractEmail(properties)
    const company = extractCompany(properties)
    const personName = extractName(properties)
    const distinctIds = person.distinct_ids ?? []
    const lastSeenAt = extractLastSeen(properties, person.created_at)

    // Stable account naming: use company/domain/personName or fallback to primary distinct_id
    const accountName = accountNameFromIdentity(
      email,
      company,
      personName || (distinctIds[0] ? `PostHog ${distinctIds[0].slice(-8)}` : null)
    )
    const normalizedAccountName = normalizeName(accountName)

    // §10.3: Resolve by distinct_id first (from provider_identities), then verified non-provisional email.
    // Name matching MUST NEVER attribute usage to an existing account (§do.md §3).
    let resolvedAccountId: string | null = null
    for (const distinctId of distinctIds) {
      const existing = distinctIdToAccountId.get(distinctId)
      if (existing) {
        resolvedAccountId = existing
        break
      }
    }

    // Step 2: Email lookup against account_contacts (only non-provisional contacts)
    if (!resolvedAccountId && email) {
      const contact = contactsByEmail.get(email)
      if (contact) {
        resolvedAccountId = contact.customer_account_id
      }
    }

    // Step 3: Name match is for conflict detection only — never mutates an existing account
    let account = resolvedAccountId ? accountsById.get(resolvedAccountId) : undefined
    if (!account) {
      const nameCandidate = accountsByName.get(normalizedAccountName)
      if (nameCandidate) {
        console.warn(
          `[posthog-sync] PostHog person "${accountName}" matches existing account name ${nameCandidate.id}, but has no verified identity. Creating isolated provisional account.`
        )
        identityConflicts += 1
      }
    }

    // Step 4: No verified match found — create an isolated provisional account to hold usage data.
    // Provisional accounts cannot trigger outbound actions; they await a verified identity.
    if (!account) {
      const { data: insertedAccount, error: insertAccountError } = await supabase
        .from('customer_accounts')
        .insert({
          workspace_id: workspaceId,
          name: accountName,
          segment: 'PostHog usage',
          account_status: 'active',
          mrr_cents: 0,
          usage_delta_percent: 0,
          next_action: 'Wait for more product activity before taking action.',
          summary: 'Provisional PostHog account created from live usage identity.',
        })
        .select('id, name, account_status, mrr_cents, risk_level, risk_score, usage_delta_percent, open_issue, next_action, summary, last_touch_at, renewal_at')
        .single()

      if (insertAccountError) throw insertAccountError
      account = insertedAccount as ExistingAccount
      accountsByName.set(normalizedAccountName, account)
      accountsById.set(account.id, account)
      provisionalAccounts += 1
    }

    // §10.3: Write each distinct_id to provider_identities.
    // If a conflict occurs, that distinct_id MUST NOT enter in-memory maps or aggregates (§do.md §4).
    const validDistinctIds: string[] = []
    for (const distinctId of distinctIds) {
      const idResult = await upsertProviderIdentity(supabase, {
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

      if (idResult.status === 'ok') {
        distinctIdToAccountId.set(distinctId, account.id)
        validDistinctIds.push(distinctId)
      } else if (idResult.status === 'conflict') {
        console.warn(`[posthog-sync] identity conflict for distinct_id ${distinctId}:`, idResult.reason)
        identityConflicts += 1
      } else if (idResult.status === 'error') {
        console.warn(`[posthog-sync] identity write error for distinct_id ${distinctId}:`, idResult.error)
      }
    }

    // If all distinct ID writes failed and there was no previous verified mapping, stop processing person
    if (validDistinctIds.length === 0 && !resolvedAccountId) {
      console.warn(`[posthog-sync] No valid distinct IDs established for person ${accountName}; halting attribution`)
      continue
    }

    // §10.3: Write person email as a secondary identity
    let emailWriteConflict = false
    if (email) {
      const idResult = await upsertProviderIdentity(supabase, {
        workspaceId,
        customerAccountId: account.id,
        provider: 'posthog',
        identityType: 'person_email',
        externalId: email,
        isPrimary: false,
        verificationStatus: 'inferred',
        source: 'posthog_sync',
      })
      if (idResult.status === 'conflict') {
        console.warn(`[posthog-sync] identity conflict for person_email ${email}:`, idResult.reason)
        identityConflicts += 1
        emailWriteConflict = true
      } else if (idResult.status === 'error') {
        console.warn(`[posthog-sync] identity write error for person_email ${email}:`, idResult.error)
        emailWriteConflict = true
      }
    }

    // Upsert account_contacts: provisional accounts create provisional contacts (§do.md §6)
    if (email && !emailWriteConflict) {
      const isProvisionalContact = account.is_provisional === true || !resolvedAccountId
      const contactResult = await linkContactSafely(supabase, {
        workspaceId,
        customerAccountId: account.id,
        email,
        name: personName ?? undefined,
        role: 'product_user',
        externalIds: {
          posthog_person_id: person.id ?? null,
          posthog_distinct_ids: validDistinctIds,
        },
        source: 'posthog_sync',
        isProvisional: isProvisionalContact,
      })

      if (contactResult.status === 'ok') {
        if (!isProvisionalContact) {
          contactsByEmail.set(email.toLowerCase(), {
            email,
            customer_account_id: account.id,
            external_ids: null,
            is_provisional: false,
          })
        }
        syncedContacts += 1
      } else if (contactResult.status === 'conflict') {
        console.warn(`[posthog-sync] contact conflict for ${email}:`, contactResult.reason)
        identityConflicts += 1
        // Conflict prevents this person from contributing to aggregates
        continue
      } else if (contactResult.status === 'error') {
        console.error(`[posthog-sync] contact write error for ${email}:`, contactResult.error)
        continue
      }
    }

    // Build aggregate only with valid, non-conflicting distinct IDs
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
        signupAt: null,
        onboardingCompletedAt: null,
        activationCompletedAt: null,
        hasKeyFeatureUsed: false,
        cancelIntentAt: null,
      }
      aggregates.set(account.id, aggregate)
    }

    aggregate.totalUsers += 1
    if (email && !emailWriteConflict) {
      aggregate.emails.add(email)
      personEmailByDistinctId.set(validDistinctIds[0] ?? email, email)
    }
    validDistinctIds.forEach((id) => {
      aggregate!.distinctIds.add(id)
    })

    if (lastSeenAt) {
      if (!aggregate.lastSeenAt || new Date(lastSeenAt) > new Date(aggregate.lastSeenAt)) {
        aggregate.lastSeenAt = lastSeenAt
      }
      if (new Date(lastSeenAt).getTime() >= Date.now() - 7 * 24 * 60 * 60 * 1000) {
        aggregate.activeUsers7d += 1
      }
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
    const eventTimeIso = event.timestamp ? new Date(event.timestamp).toISOString() : syncRunStart

    if (isCurrentWindow) {
      aggregate.currentEvents += 1
    } else {
      aggregate.previousEvents += 1
    }

    aggregate.topEvents.set(eventName, (aggregate.topEvents.get(eventName) ?? 0) + 1)

    // Check lifecycle milestones
    if (DEFAULT_LIFECYCLE_CONFIG.signup.includes(eventName)) {
      if (!aggregate.signupAt || new Date(eventTimeIso) < new Date(aggregate.signupAt)) {
        aggregate.signupAt = eventTimeIso
      }
    }

    if (DEFAULT_LIFECYCLE_CONFIG.onboardingCompleted.includes(eventName)) {
      if (!aggregate.onboardingCompletedAt || new Date(eventTimeIso) > new Date(aggregate.onboardingCompletedAt)) {
        aggregate.onboardingCompletedAt = eventTimeIso
      }
    }

    if (DEFAULT_LIFECYCLE_CONFIG.activationCompleted.includes(eventName)) {
      if (!aggregate.activationCompletedAt || new Date(eventTimeIso) > new Date(aggregate.activationCompletedAt)) {
        aggregate.activationCompletedAt = eventTimeIso
      }
    }

    if (DEFAULT_LIFECYCLE_CONFIG.keyFeatureUsed.includes(eventName)) {
      aggregate.hasKeyFeatureUsed = true
    }

    // §13.10: Cancel & Exfiltration intent detection
    const isCancelUrl =
      eventName === '$pageview' &&
      typeof event.properties?.$current_url === 'string' &&
      CANCELLATION_URL_PATTERNS.some((pattern) => pattern.test(event.properties!.$current_url as string))

    const isCancelIntent =
      DEFAULT_LIFECYCLE_CONFIG.cancellationIntent.includes(eventName) ||
      DEFAULT_LIFECYCLE_CONFIG.dataExportIntent.includes(eventName) ||
      DEFAULT_LIFECYCLE_CONFIG.seatContraction.includes(eventName) ||
      isCancelUrl

    if (isCancelIntent) {
      aggregate.hasCancelIntent = true
      aggregate.cancelVisits += 1
      if (!aggregate.cancelIntentAt || new Date(eventTimeIso) > new Date(aggregate.cancelIntentAt)) {
        aggregate.cancelIntentAt = eventTimeIso
      }
    }
  }

  // --- §14.1: Enqueue project_account_features jobs for verified canonical accounts ---
  let syncedAccounts = 0
  let highRiskAccounts = 0 // estimate only — real scoring happens in the decision engine

  for (const aggregate of aggregates.values()) {
    const existingAccount = accountsById.get(aggregate.accountId)
    if (!existingAccount) continue

    // Invariant: Provisional accounts must NOT enqueue feature jobs or trigger scoring
    if (existingAccount.is_provisional === true) {
      continue
    }

    syncedAccounts += 1
    const delta = usageDeltaPercent(aggregate.currentEvents, aggregate.previousEvents)
    const topEvent = [...aggregate.topEvents.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null

    // Build the feature patch for the canonical projector
    const isKeyFeatureMissing =
      !aggregate.hasKeyFeatureUsed &&
      aggregate.previousEvents >= RECOVERY_CONFIG.KEY_FEATURE_MIN_BASELINE_EVENTS

    const featurePatch: Record<string, unknown> = {
      usageAvailable: true,
      usageCurrent7d: aggregate.currentEvents,
      usagePrevious7d: aggregate.previousEvents,
      usageFreshAt: syncRunStart,
      lastProductActivityAt: aggregate.lastSeenAt,
      signupAt: aggregate.signupAt,
      onboardingCompletedAt: aggregate.onboardingCompletedAt,
      activationCompletedAt: aggregate.activationCompletedAt,
      keyFeatureMissing: isKeyFeatureMissing,
      cancelIntentAt: aggregate.hasCancelIntent ? (aggregate.cancelIntentAt || syncRunStart) : null,
    }

    if (delta !== null) {
      featurePatch.usageDeltaPercent = delta
    }

    if (isKeyFeatureMissing) {
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
        identity_conflicts: identityConflicts,
        provisional_accounts: provisionalAccounts,
        identity_health: identityConflicts > 0 ? 'degraded' : 'healthy',
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
    identityConflicts,
    provisionalAccounts,
  }
}
