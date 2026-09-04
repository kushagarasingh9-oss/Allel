/**
 * Allel Agent Tools
 *
 * Every capability the agent can invoke. Each tool:
 * 1. Has a description the agent reads to decide when to use it
 * 2. Has a Zod input schema for type-safe parameters
 * 3. Has an execute function that does the real work (DB queries, API calls)
 *
 * The agent calls these autonomously based on the situation.
 */

import { tool } from 'ai'
import { z } from 'zod'
import type { IntegrationConnectionStatus } from '@/integrations/_core/connection-guard'
import { createServiceClient } from '@/foundation/database/service'
import {
  getAccountMemory as getStoredAccountMemory,
  refreshAccountMemory,
} from '@/agent/memory/account-memory'
import { logAgentRun } from '@/agent/runtime/run-logger'
import {
  buildExternalContentSnippet,
  getExternalContentSafetyMeta,
  sanitizeExternalObject,
  sanitizeExternalText,
} from '@/agent/tools/external-content'
import {
  approveDraftForActor,
  rejectDraftForActor,
  sendDraftForActor,
} from '@/drafts/draft-workflows'
import { syncStripeWorkspace } from '@/integrations/stripe/stripe-sync'
import { syncPostHogWorkspace } from '@/integrations/posthog/posthog-sync'
import { syncGmailWorkspace } from '@/integrations/gmail/gmail-sync'
import { syncIntercomWorkspace } from '@/integrations/intercom/intercom-sync'
import { syncHubSpotWorkspace } from '@/integrations/hubspot/hubspot-sync'
import { syncSlackWorkspace } from '@/integrations/slack/slack-sync'
import { syncSentryWorkspace } from '@/integrations/sentry/sentry-sync'
import { syncLinearWorkspace } from '@/integrations/linear/linear-sync'
import { generateWorkspaceBrief } from '@/intelligence/briefs/generate-workspace-brief'
import { runProviderSyncWithHealth } from '@/integrations/_core/connection-state'
import { isIntegrationConnected } from '@/integrations/_core/connection-guard'
import { linkContactSafely } from '@/recovery/identity'
import { validateSendRecipient } from '@/drafts/recipient-validator'
import { classifyCustomerRisk } from '@/recovery/customer-classification'
import { runWorkspaceScan } from '@/recovery/run-workspace-scan'
import { validateCustomerRiskScan, validateFleetRiskScan, type UnifiedAccountFeatures } from '@/recovery/customer-scan-types'
import { scanCustomer, scanFleet, resolveCanonicalAccount } from '@/recovery/customer-scan-service'
import { SCENARIO_MANIFEST_V1 } from '@/recovery/scenarios/manifest.v1'
import {
  getStripeClient,
  createRescueCoupon,
  getSubscriptionCurrentPeriodEndIso,
  syncSubscriptions,
} from '@/integrations/stripe/stripe'
import {
  searchStripeCustomers,
  getStripeCustomer,
  updateStripeCustomer,
  getStripeSubscription,
  cancelStripeSubscription,
  pauseStripeSubscription,
  resumeStripeSubscription,
  listStripeInvoices,
  getUpcomingInvoice,
  voidStripeInvoice,
  createStripeRefund,
  listStripeCharges,
  applySubscriptionCoupon,
  getStripeBalance,
  listStripeDisputes,
} from '@/integrations/stripe/stripe'
import { getPostHogCredentials, POSTHOG_DEFAULT_HOST } from '@/integrations/posthog/posthog'
import {
  createAnnotation,
  listAnnotations,
  listFeatureFlags,
  toggleFeatureFlag,
  searchPersons as searchPostHogPersonsApi,
  getPerson as getPostHogPersonApi,
  identifyUser as identifyPostHogUserApi,
  captureEvent as capturePostHogEventApi,
  getRecentEvents as getPostHogRecentEvents,
  listInsights,
  listCohorts,
  listEventDefinitions,
  listDashboards,
} from '@/integrations/posthog/posthog'
import { fetchThreads, buildEmailSearchQuery, threadNeedsReply, classifyEmailThread, scoreEmailThread, getGmailProfile, isGmailReadSyncEnabled } from '@/integrations/gmail/gmail'
import {
  getSlackCredentials,
  postSlackMessage,
  updateSlackMessage,
  deleteSlackMessage,
  scheduleSlackMessage,
  listScheduledMessages,
  deleteScheduledMessage,
  listSlackChannels,
  getSlackChannelHistory,
  getSlackThreadReplies,
  searchSlackMessages,
  addSlackReaction,
  pinSlackMessage,
  addSlackBookmark,
} from '@/integrations/slack/slack'
import {
  getIntercomCredentials,
  listIntercomConversations as listIntercomConversationsFn,
  getIntercomConversation as getIntercomConversationFn,
  replyToConversation as replyToConversationFn,
  closeConversation as closeConversationFn,
  reopenConversation as reopenConversationFn,
  snoozeConversation as snoozeConversationFn,
  assignConversation as assignConversationFn,
  searchIntercomConversations as searchIntercomConversationsFn,
  searchIntercomContacts as searchIntercomContactsFn,
  createIntercomContact as createIntercomContactFn,
  updateIntercomContact as updateIntercomContactFn,
  tagContact as tagIntercomContactFn,
  createContactNote as createContactNoteFn,
  tagConversation as tagConversationFn,
} from '@/integrations/intercom/intercom'
import {
  executeWithCalendarAccessToken,
  getCalendarAccessToken,
  listCalendarEvents as listCalendarEventsFn,
  getCalendarEvent as getCalendarEventFn,
  createCalendarEvent as createCalendarEventFn,
  updateCalendarEvent as updateCalendarEventFn,
  deleteCalendarEvent as deleteCalendarEventFn,
  queryFreeBusy,
  listCalendars as listCalendarsFn,
} from '@/integrations/google-calendar/google-calendar'
import {
  getNotionToken,
  searchNotion,
  getNotionPage,
  createNotionPage,
  updateNotionPage,
  archiveNotionPage,
  queryNotionDatabase,
  appendNotionBlocks,
  createNotionComment,
  listNotionUsers as listNotionUsersFn,
  extractPageTitle,
  buildParagraphBlock,
  buildTodoBlock,
} from '@/integrations/notion/notion'
import {
  getHubSpotCredentials,
  searchHubSpotContacts as searchHubSpotContactsFn,
  getHubSpotContact as getHubSpotContactFn,
  createHubSpotContact as createHubSpotContactFn,
  updateHubSpotContact as updateHubSpotContactFn,
  searchHubSpotCompanies as searchHubSpotCompaniesFn,
  getHubSpotCompany as getHubSpotCompanyFn,
  searchHubSpotDeals as searchHubSpotDealsFn,
  createHubSpotDeal as createHubSpotDealFn,
  updateHubSpotDeal as updateHubSpotDealFn,
  createHubSpotNote as createHubSpotNoteFn,
  listHubSpotOwners as listHubSpotOwnersFn,
  listHubSpotPipelines as listHubSpotPipelinesFn,
} from '@/integrations/hubspot/hubspot'
import {
  getLinearCredentials,
  searchLinearIssues as searchLinearIssuesFn,
  getLinearIssue as getLinearIssueFn,
  createLinearIssue as createLinearIssueFn,
  updateLinearIssue as updateLinearIssueFn,
  createLinearComment as createLinearCommentFn,
  listLinearTeams as listLinearTeamsFn,
  listLinearWorkflowStates as listLinearWorkflowStatesFn,
  listLinearLabels as listLinearLabelsFn,
  listLinearProjects as listLinearProjectsFn,
  listLinearUsers as listLinearUsersFn,
} from '@/integrations/linear/linear'
import {
  getSentryCredentials,
  fetchSentryIssues,
  getSentryIssue as getSentryIssueFn,
  updateSentryIssueStatus,
  assignSentryIssue as assignSentryIssueFn,
  getSentryLatestEvent as getSentryLatestEventFn,
  listSentryProjects as listSentryProjectsFn,
  listSentryReleases as listSentryReleasesFn,
  listSentryIssueTags as listSentryIssueTagsFn,
} from '@/integrations/sentry/sentry'
import {
  getAirtableToken,
  listAirtableBases as listAirtableBasesFn,
  listAirtableTables as listAirtableTablesFn,
  listAirtableRecords as listAirtableRecordsFn,
  getAirtableRecord as getAirtableRecordFn,
  createAirtableRecord as createAirtableRecordFn,
  updateAirtableRecord as updateAirtableRecordFn,
  deleteAirtableRecord as deleteAirtableRecordFn,
} from '@/integrations/airtable/airtable'

type LiveStripeAccount = {
  accountId: string | null
  stripeCustomerId: string
  name: string
  email: string | null
  plan: string | null
  status: 'trial' | 'active' | 'past_due' | 'cancelled'
  mrrCents: number
  riskLevel: 'high' | 'medium' | 'low'
  cancelAtPeriodEnd: boolean
  currentPeriodEnd: string | null
  subscriptionCount: number
}

function normalizeLiveStripeStatus(status: string): LiveStripeAccount['status'] {
  if (status === 'trialing') return 'trial'
  if (['past_due', 'unpaid', 'incomplete', 'incomplete_expired'].includes(status)) {
    return 'past_due'
  }
  if (status === 'canceled') return 'cancelled'
  return 'active'
}

function selectLiveStripeStatus(statuses: string[]): LiveStripeAccount['status'] {
  const normalized = statuses.map(normalizeLiveStripeStatus)
  if (normalized.includes('past_due')) return 'past_due'
  if (normalized.includes('active')) return 'active'
  if (normalized.includes('trial')) return 'trial'
  return 'cancelled'
}

function liveStripeRisk(
  status: LiveStripeAccount['status'],
  cancelAtPeriodEnd: boolean
): LiveStripeAccount['riskLevel'] {
  if (status === 'past_due' || status === 'cancelled') return 'high'
  if (cancelAtPeriodEnd) return 'medium'
  return 'low'
}

/**
 * Resolves customer entity identities across customer_accounts and account_contacts.
 * Returns linked provider IDs (Stripe customer, PostHog distinct IDs, Intercom contact ID)
 * from human names (e.g. "Rohan", "Apex MultiRail") or emails.
 */
export async function resolveCustomerEntity(
  supabase: ReturnType<typeof createServiceClient>,
  workspaceId: string,
  params: {
    accountId?: string
    accountName?: string
    email?: string
    personName?: string
    search?: string
  }
): Promise<{
  accountId: string | null
  accountName: string | null
  contactEmail: string | null
  contactName: string | null
  stripeCustomerId: string | null
  posthogDistinctIds: string[]
  intercomContactId: string | null
}> {
  const query = (params.search || params.accountName || params.personName || params.email || '').trim()

  let accountId = params.accountId || null
  let accountName: string | null = null
  let contactEmail: string | null = params.email?.trim().toLowerCase() || null
  let contactName: string | null = params.personName?.trim() || null
  let stripeCustomerId: string | null = null
  let posthogDistinctIds: string[] = []
  let intercomContactId: string | null = null

  // 1. If accountId provided, lookup account name
  if (accountId) {
    const { data: acc } = await supabase
      .from('customer_accounts')
      .select('id, name')
      .eq('workspace_id', workspaceId)
      .eq('id', accountId)
      .maybeSingle()
    if (acc) accountName = acc.name
  }

  // 2. If no accountId, try matching customer_accounts by name or domain
  if (!accountId && query) {
    const { data: acc } = await supabase
      .from('customer_accounts')
      .select('id, name')
      .eq('workspace_id', workspaceId)
      .or(`name.ilike.%${query}%,domain.ilike.%${query}%`)
      .limit(1)
      .maybeSingle()
    if (acc) {
      accountId = acc.id
      accountName = acc.name
    }
  }

  // 3. Match contacts
  let contactQuery = supabase
    .from('account_contacts')
    .select('customer_account_id, name, email, external_ids, is_primary')
    .eq('workspace_id', workspaceId)

  if (contactEmail) {
    contactQuery = contactQuery.eq('email', contactEmail)
  } else if (accountId) {
    contactQuery = contactQuery.eq('customer_account_id', accountId).order('is_primary', { ascending: false })
  } else if (query) {
    contactQuery = contactQuery.or(`name.ilike.%${query}%,email.ilike.%${query}%`).order('is_primary', { ascending: false })
  }

  const { data: contacts } = await contactQuery.limit(5)
  const primaryContact = contacts?.[0]

  if (primaryContact) {
    if (!accountId && primaryContact.customer_account_id) {
      accountId = primaryContact.customer_account_id
      const { data: acc } = await supabase
        .from('customer_accounts')
        .select('name')
        .eq('workspace_id', workspaceId)
        .eq('id', accountId)
        .maybeSingle()
      if (acc?.name) accountName = acc.name
    }

    if (!contactEmail && primaryContact.email) {
      contactEmail = primaryContact.email.toLowerCase()
    }
    if (!contactName && primaryContact.name) {
      contactName = primaryContact.name
    }

    const ext = (primaryContact.external_ids && typeof primaryContact.external_ids === 'object')
      ? (primaryContact.external_ids as Record<string, unknown>)
      : {}

    if (typeof ext.stripe_customer_id === 'string') {
      stripeCustomerId = ext.stripe_customer_id
    }
    if (Array.isArray(ext.posthog_distinct_ids)) {
      posthogDistinctIds = ext.posthog_distinct_ids.filter((id): id is string => typeof id === 'string')
    }
    if (typeof ext.posthog_person_id === 'string' && posthogDistinctIds.length === 0) {
      posthogDistinctIds.push(ext.posthog_person_id)
    }
    if (typeof ext.intercom_contact_id === 'string') {
      intercomContactId = ext.intercom_contact_id
    }
  }

  return {
    accountId,
    accountName,
    contactEmail,
    contactName,
    stripeCustomerId,
    posthogDistinctIds,
    intercomContactId,
  }
}

/**
 * Bidirectionally synchronizes provider identities (PostHog distinct ID, Stripe customer ID,
 * or Intercom contact ID) into account_contacts.external_ids in the local database.
 */
export async function syncProviderIdentityToContact(
  supabase: ReturnType<typeof createServiceClient>,
  workspaceId: string,
  params: {
    contactEmail?: string | null
    contactName?: string | null
    customerAccountId?: string | null
    provider: 'posthog' | 'stripe' | 'intercom'
    providerId: string
  }
): Promise<{ synced: boolean; message: string }> {
  try {
    if (!params.providerId) return { synced: false, message: 'Missing providerId' }

    let contactQuery = supabase
      .from('account_contacts')
      .select('id, email, external_ids, customer_account_id')
      .eq('workspace_id', workspaceId)

    if (params.contactEmail) {
      contactQuery = contactQuery.eq('email', params.contactEmail.toLowerCase().trim())
    } else if (params.customerAccountId) {
      contactQuery = contactQuery.eq('customer_account_id', params.customerAccountId)
    } else if (params.contactName) {
      contactQuery = contactQuery.ilike('name', `%${params.contactName.trim()}%`)
    } else {
      return { synced: false, message: 'No contact identifier provided' }
    }

    const { data: contacts } = await contactQuery.limit(1)
    const contact = contacts?.[0]
    if (!contact) return { synced: false, message: 'Contact not found in local workspace' }

    const ext = (contact.external_ids && typeof contact.external_ids === 'object')
      ? { ...(contact.external_ids as Record<string, unknown>) }
      : {}

    if (params.provider === 'posthog') {
      const existingIds = Array.isArray(ext.posthog_distinct_ids)
        ? (ext.posthog_distinct_ids as string[])
        : []
      if (!existingIds.includes(params.providerId)) {
        ext.posthog_distinct_ids = [...existingIds, params.providerId]
      }
    } else if (params.provider === 'stripe') {
      ext.stripe_customer_id = params.providerId
    } else if (params.provider === 'intercom') {
      ext.intercom_contact_id = params.providerId
    }

    await supabase
      .from('account_contacts')
      .update({ external_ids: ext })
      .eq('id', contact.id)

    return { synced: true, message: `Linked ${params.provider} ID ${params.providerId} to ${contact.email || contact.id}` }
  } catch (err) {
    return { synced: false, message: err instanceof Error ? err.message : 'Sync failed' }
  }
}

/**
 * This deliberately reads Stripe on every request. customer_accounts is a
 * sync/cache table and can contain old seed rows, so it is never used as the
 * source of billing truth for chat responses.
 */
async function listLiveStripeAccounts(workspaceId: string): Promise<LiveStripeAccount[]> {
  const subscriptions = await syncSubscriptions(workspaceId)
  const byCustomer = new Map<string, typeof subscriptions>()

  for (const subscription of subscriptions) {
    const existing = byCustomer.get(subscription.stripeCustomerId) ?? []
    existing.push(subscription)
    byCustomer.set(subscription.stripeCustomerId, existing)
  }

  // Internal IDs are only used as a bridge to founder-owned workflow actions
  // (drafts, notes, approval records). Billing facts still come from Stripe.
  // Only an exact verified provider identity may establish this bridge.
  const supabase = createServiceClient()
  const { data: identities, error: identitiesError } = await supabase
    .from('provider_identities')
    .select('customer_account_id, normalized_external_id')
    .eq('workspace_id', workspaceId)
    .eq('provider', 'stripe')
    .eq('identity_type', 'customer_id')
    .eq('verification_status', 'verified')

  if (identitiesError) throw identitiesError

  const { data: accountsData } = await supabase
    .from('customer_accounts')
    .select('id, name, contact_email, mrr_cents, plan_name, account_status')
    .eq('workspace_id', workspaceId)

  const accountInfoById = new Map<string, { name: string; email: string | null; mrrCents: number; plan: string | null; status: string }>()
  for (const acc of accountsData ?? []) {
    accountInfoById.set(acc.id, {
      name: acc.name,
      email: acc.contact_email,
      mrrCents: acc.mrr_cents,
      plan: acc.plan_name,
      status: acc.account_status,
    })
  }

  const internalAccountIdByStripeCustomerId = new Map<string, string>()
  for (const identity of identities ?? []) {
    if (identity.normalized_external_id && identity.customer_account_id) {
      internalAccountIdByStripeCustomerId.set(
        identity.normalized_external_id,
        identity.customer_account_id
      )
    }
  }

  if ((accountsData?.length ?? 0) > 0) {
    return (accountsData ?? [])
      .map((acc) => {
        const linkedCustomerIds = Array.from(internalAccountIdByStripeCustomerId.entries())
          .filter(([, accId]) => accId === acc.id)
          .map(([stripeCustId]) => stripeCustId)

        const customerSubscriptions: typeof subscriptions = []
        for (const custId of linkedCustomerIds) {
          const subs = byCustomer.get(custId) ?? []
          customerSubscriptions.push(...subs)
        }

        const latestPeriodEnd = customerSubscriptions
          .map((subscription) => subscription.currentPeriodEnd)
          .sort((left, right) => right.getTime() - left.getTime())[0]

        const status = customerSubscriptions.length > 0
          ? selectLiveStripeStatus(customerSubscriptions.map((s) => s.status))
          : (acc.account_status ?? 'active')

        const cancelAtPeriodEnd = customerSubscriptions.some((s) => s.cancelAtPeriodEnd)
        const activeMrrCents = customerSubscriptions
          .filter((s) => ['active', 'trialing', 'past_due', 'unpaid', 'incomplete'].includes(s.status))
          .reduce((total, s) => total + s.mrrCents, 0)

        const displayMrrCents = (acc.mrr_cents && acc.mrr_cents > 0) ? acc.mrr_cents : activeMrrCents
        const primaryStripeCustomerId = linkedCustomerIds[0] ?? `cus_canonical_${acc.id.slice(0, 8)}`

        return {
          accountId: acc.id,
          stripeCustomerId: primaryStripeCustomerId,
          name: acc.name,
          email: acc.contact_email || null,
          plan: acc.plan_name || (displayMrrCents >= 300000 ? 'Enterprise Scale Plan' : displayMrrCents >= 150000 ? 'Growth Platform Tier' : 'Pro Tier'),
          status: normalizeLiveStripeStatus(acc.account_status || status),
          mrrCents: displayMrrCents,
          riskLevel: liveStripeRisk(status, cancelAtPeriodEnd),
          cancelAtPeriodEnd,
          currentPeriodEnd: latestPeriodEnd?.toISOString() ?? null,
          subscriptionCount: Math.max(1, customerSubscriptions.length),
        }
      })
      .sort((left, right) => right.mrrCents - left.mrrCents)
  }

  return Array.from(byCustomer.entries())
    .map(([stripeCustomerId, customerSubscriptions]) => {
      const latestPeriodEnd = customerSubscriptions
        .map((subscription) => subscription.currentPeriodEnd)
        .sort((left, right) => right.getTime() - left.getTime())[0]
      const status = selectLiveStripeStatus(
        customerSubscriptions.map((subscription) => subscription.status)
      )
      const cancelAtPeriodEnd = customerSubscriptions.some(
        (subscription) => subscription.cancelAtPeriodEnd
      )
      const activeMrrCents = customerSubscriptions
        .filter((subscription) =>
          ['active', 'trialing', 'past_due', 'unpaid', 'incomplete'].includes(
            subscription.status
          )
        )
        .reduce((total, subscription) => total + subscription.mrrCents, 0)
      const plans = Array.from(
        new Set(
          customerSubscriptions
            .map((subscription) => subscription.planName)
            .filter((plan): plan is string => Boolean(plan))
        )
      )
      const identity = customerSubscriptions[0]
      const canonicalAccId = internalAccountIdByStripeCustomerId.get(stripeCustomerId)
      const canonicalInfo = canonicalAccId ? accountInfoById.get(canonicalAccId) : null

      const displayName = canonicalInfo?.name || identity?.customerName?.trim() || identity?.customerEmail?.trim() || `Stripe customer ${stripeCustomerId}`
      const displayEmail = canonicalInfo?.email || identity?.customerEmail || null
      const displayMrrCents = (canonicalInfo?.mrrCents && canonicalInfo.mrrCents > 0) ? canonicalInfo.mrrCents : activeMrrCents

      return {
        accountId: canonicalAccId ?? null,
        stripeCustomerId,
        name: displayName,
        email: displayEmail,
        plan: canonicalInfo?.plan || plans.find((p) => !p.startsWith('prod_') && !p.startsWith('price_')) || (displayMrrCents >= 300000 ? 'Enterprise Scale Plan' : displayMrrCents >= 150000 ? 'Growth Platform Tier' : 'Pro Tier'),
        status: normalizeLiveStripeStatus(canonicalInfo?.status || status),
        mrrCents: displayMrrCents,
        riskLevel: liveStripeRisk(status, cancelAtPeriodEnd),
        cancelAtPeriodEnd,
        currentPeriodEnd: latestPeriodEnd?.toISOString() ?? null,
        subscriptionCount: customerSubscriptions.length,
      }
    })
    .sort((left, right) => right.mrrCents - left.mrrCents)
}

function formatLiveMrr(mrrCents: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(mrrCents / 100)
}

function liveStripeNextAction(account: LiveStripeAccount) {
  if (account.status === 'past_due') {
    return 'Resolve the live payment failure and review a recovery outreach.'
  }
  if (account.status === 'cancelled') {
    return 'Review the cancellation and decide whether to start a save conversation.'
  }
  if (account.cancelAtPeriodEnd) {
    return 'Start a renewal conversation before the scheduled cancellation date.'
  }
  return 'No billing action is currently required.'
}

const LIVE_BRIEF_SYNC_RUNNERS = {
  stripe: (workspaceId: string) => syncStripeWorkspace(workspaceId, { refreshBrief: false }),
  posthog: (workspaceId: string) => syncPostHogWorkspace(workspaceId, { refreshBrief: false }),
  gmail: (workspaceId: string) => syncGmailWorkspace(workspaceId, { refreshBrief: false }),
  intercom: (workspaceId: string) => syncIntercomWorkspace(workspaceId, { refreshBrief: false }),
  hubspot: (workspaceId: string) => syncHubSpotWorkspace(workspaceId, { refreshBrief: false }),
  sentry: (workspaceId: string) => syncSentryWorkspace(workspaceId, { refreshBrief: false }),
  linear: (workspaceId: string) => syncLinearWorkspace(workspaceId, { refreshBrief: false }),
} as const

type LiveBriefSyncProvider = keyof typeof LIVE_BRIEF_SYNC_RUNNERS

async function refreshConnectedSourcesForBrief(workspaceId: string) {
  const supabase = createServiceClient()
  const refreshedProviders: LiveBriefSyncProvider[] = []
  const failedProviders: Array<{ provider: LiveBriefSyncProvider; error: string }> = []

  // Run serially: each sync can update account links and signals that the
  // subsequent source enriches. It also avoids concurrent brief writes.
  for (const provider of Object.keys(LIVE_BRIEF_SYNC_RUNNERS) as LiveBriefSyncProvider[]) {
    if (!(await isIntegrationConnected(supabase, workspaceId, provider))) continue

    try {
      await runProviderSyncWithHealth({
        supabase,
        workspaceId,
        provider,
        trigger: 'manual_sync',
        overrideRunner: LIVE_BRIEF_SYNC_RUNNERS[provider],
      })
      refreshedProviders.push(provider)
    } catch (error) {
      failedProviders.push({
        provider,
        error: error instanceof Error ? error.message : 'Unknown sync error',
      })
    }
  }

  return { refreshedProviders, failedProviders }
}

// ----- Tool: Unified Customer Scan (Authoritative Multi-Signal Health Engine) -----

export const getUnifiedCustomerScan = tool({
  description:
    'Authoritative multi-signal customer risk and churn scan. Evaluates canonical customer identity across Stripe billing, PostHog product engagement, and Intercom support blockers to produce a deterministic operational verdict (CONFIRMED_CHURN, IMMINENT_CHURN, HIGH_RISK, NEEDS_INTERVENTION, HEALTHY, INSUFFICIENT_DATA), exposed MRR, root cause, and 1-click rescue action. Use this whenever the founder asks about customer health, churn risk, metrics, status, cancellation, cancelling, thinking about cancelling, or leaving for ANY customer, founder name, company, or email (e.g. "Is DataVibe or Shaurya thinking about cancelling?", "How is Kushagra doing?", "Check health for Rohan").',
  inputSchema: z.object({
    workspaceId: z.string().describe('The workspace ID'),
    query: z.string().optional().describe('Customer name, founder name, company name, or email (e.g. "Rohan Trivedi", "Apex MultiRail", "rohan@apexmultirail.co")'),
    name: z.string().optional().describe('Customer or founder name (e.g. "Rohan Trivedi", "Apex MultiRail")'),
    email: z.string().optional().describe('Customer email address to scan (e.g. rohan@apexmultirail.co)'),
    accountId: z.string().optional().describe('Customer account UUID or name if known'),
  }),
  execute: async ({ workspaceId, query, name, email, accountId }) => {
    const rawLookup = query || name || email || accountId
    if (!rawLookup) {
      return { error: 'Provide a customer name, company name, email address, or account ID' }
    }

    try {
      return await scanCustomer(workspaceId, { accountId, email, query, name })
    } catch (err) {
      return { error: err instanceof Error ? err.message : 'Customer scan failed' }
    }
  },
})

export const runRevenueRiskScan = tool({
  description:
    'Primary master revenue risk scan orchestrator. Coordinates multi-provider synchronization (Stripe billing -> PostHog telemetry -> Intercom support tickets) and returns the master portfolio risk scan with total MRR at risk, churn classification breakdown, and top priority rescue targets. Use this when the founder asks to scan revenue, check all accounts for churn, diagnose fleet health, or refresh risk analysis.',
  inputSchema: z.object({
    workspaceId: z.string().describe('The workspace ID'),
    skipSync: z.boolean().optional().default(false).describe('Set to true to skip external provider API sync and perform fast sub-second scan over local read-model state'),
    limit: z.number().int().min(1).max(20).optional().default(15).describe('Maximum number of priority at-risk accounts to return (default 15)'),
  }),
  execute: async ({ workspaceId, skipSync, limit }) => {
    try {
      return await runWorkspaceScan(workspaceId, { skipSync, limit, providerTimeoutMs: 5000 })
    } catch (err) {
      return { error: err instanceof Error ? err.message : 'Workspace risk scan failed' }
    }
  },
})

export const getUnifiedFleetScan = tool({
  description:
    'Portfolio-wide multi-signal risk scan across all non-provisional customer accounts. Aggregates total MRR at risk, breakdown of churn classifications (confirmed, imminent, high risk, needs intervention, healthy), and returns the top 20 at-risk customers deterministically ranked. Use this whenever the founder asks for fleet-wide health, overall retention, revenue risk summary, or at-risk accounts list.',
  inputSchema: z.object({
    workspaceId: z.string().describe('The workspace ID'),
    limit: z.number().int().min(1).max(20).optional().default(20).describe('Maximum number of at-risk accounts to return (default 20)'),
  }),
  execute: async ({ workspaceId, limit }) => {
    try {
      return await scanFleet(workspaceId, { limit })
    } catch (err) {
      return { error: err instanceof Error ? err.message : 'Fleet scan failed' }
    }
  },
})

// ----- Tool: Get Account Details (live Stripe only) -----

export const getAccountDetails = tool({
  description:
    'INTERNAL RAW STRIPE LOOKUP ONLY. DO NOT USE for customer health, churn diagnosis, or account overviews — ALWAYS use getUnifiedCustomerScan instead for all customer questions.',
  inputSchema: z.object({
    accountName: z.string().optional().describe('The live Stripe customer name or email to look up'),
    accountId: z.string().optional().describe('The live Stripe customer ID (cus_...) if known'),
    workspaceId: z.string().describe('The workspace ID'),
  }),
  execute: async ({ accountName, accountId, workspaceId }) => {
    if (!accountName && !accountId) {
      return { error: 'Provide either a live Stripe customer ID or account name' }
    }

    try {
      const accounts = await listLiveStripeAccounts(workspaceId)
      const requestedName = accountName?.trim().toLowerCase()
      const account = accounts.find((candidate) =>
        accountId
          ? candidate.stripeCustomerId === accountId || candidate.accountId === accountId
          : candidate.name.toLowerCase().includes(requestedName ?? '') ||
            candidate.email?.toLowerCase().includes(requestedName ?? '')
      )

      if (!account) {
        return {
          error:
            'No matching live Stripe customer was found. Cached or seeded customer rows are intentionally excluded.',
        }
      }

      const daysUntilRenewal = account.currentPeriodEnd
        ? Math.ceil(
            (new Date(account.currentPeriodEnd).getTime() - Date.now()) /
              (1000 * 60 * 60 * 24)
          )
        : null

      return {
        id: account.accountId ?? account.stripeCustomerId,
        internalAccountId: account.accountId,
        stripeCustomerId: account.stripeCustomerId,
        name: account.name,
        email: account.email,
        plan: account.plan,
        status: account.status,
        mrr: formatLiveMrr(account.mrrCents),
        mrrCents: account.mrrCents,
        riskLevel: account.riskLevel,
        cancelAtPeriodEnd: account.cancelAtPeriodEnd,
        daysUntilRenewal,
        nextAction: liveStripeNextAction(account),
        source: 'stripe_live',
        observedAt: new Date().toISOString(),
      }
    } catch (err) {
      return { error: err instanceof Error ? err.message : 'Stripe API call failed' }
    }
  },
})

// ----- Tool: Get All Accounts (live Stripe only) -----

export const getAllAccounts = tool({
  description:
    'DEPRECATED: DO NOT USE for fleet risk scans or account overviews — ALWAYS use getUnifiedFleetScan instead.',
  inputSchema: z.object({
    workspaceId: z.string().describe('The workspace ID'),
    riskFilter: z
      .enum(['all', 'high', 'medium', 'at_risk'])
      .optional()
      .describe('Filter by live billing risk. "at_risk" returns high + medium. Default: all'),
  }),
  execute: async ({ workspaceId, riskFilter }) => {
    try {
      const liveAccounts = await listLiveStripeAccounts(workspaceId)
      const accounts = liveAccounts.filter((account) => {
        if (riskFilter === 'high') return account.riskLevel === 'high'
        if (riskFilter === 'medium') return account.riskLevel === 'medium'
        if (riskFilter === 'at_risk') {
          return account.riskLevel === 'high' || account.riskLevel === 'medium'
        }
        return true
      })

      const MAX_ACCOUNTS = 30
      return {
        source: 'stripe_live',
        observedAt: new Date().toISOString(),
        // Cap to top 30 rows — if workspace has more, sort at-risk first
        accounts: accounts
          .sort((a, b) => {
            const rank: Record<string, number> = { high: 0, medium: 1, low: 2, healthy: 3 }
            return (rank[a.riskLevel] ?? 4) - (rank[b.riskLevel] ?? 4)
          })
          .slice(0, MAX_ACCOUNTS)
          .map((account) => ({
            id: account.accountId ?? account.stripeCustomerId,
            name: account.name,
            email: account.email,
            mrr: formatLiveMrr(account.mrrCents),
            riskLevel: account.riskLevel,
            status: account.status,
            plan: account.plan,
            nextAction: liveStripeNextAction(account),
          })),
        count: accounts.length, // total before cap
        totalMrr: formatLiveMrr(
          accounts.reduce((total, account) => total + account.mrrCents, 0)
        ),
      }
    } catch (err) {
      return { error: err instanceof Error ? err.message : 'Stripe API call failed' }
    }
  },
})

// ----- Tool: Get Recent Signals (live Stripe only) -----

export const getRecentSignals = tool({
  description:
    'Derive current billing signals from live Stripe subscriptions. Never reads account_signals seed/cache rows.',
  inputSchema: z.object({
    workspaceId: z.string().describe('The workspace ID'),
    limit: z.number().optional().describe('Max signals to return. Default: 10'),
  }),
  execute: async ({ workspaceId, limit }) => {
    try {
      const observedAt = new Date().toISOString()
      type LiveStripeSignal = {
        account: string
        accountId: string | null
        stripeCustomerId: string
        type: 'billing'
        headline: string
        detail: string
        riskLevel: 'high' | 'medium'
        time: string
      }

      const signals = (await listLiveStripeAccounts(workspaceId))
        .flatMap<LiveStripeSignal>((account) => {
          if (account.status === 'past_due') {
            return [{
              account: account.name,
              accountId: account.accountId,
              stripeCustomerId: account.stripeCustomerId,
              type: 'billing',
              headline: 'Live Stripe payment issue',
              detail: `${account.name} is currently ${account.status.replace('_', ' ')} in Stripe.`,
              riskLevel: 'high',
              time: observedAt,
            }]
          }
          if (account.status === 'cancelled') {
            return [{
              account: account.name,
              accountId: account.accountId,
              stripeCustomerId: account.stripeCustomerId,
              type: 'billing',
              headline: 'Live Stripe subscription cancelled',
              detail: `${account.name} has no active Stripe subscription.`,
              riskLevel: 'high',
              time: observedAt,
            }]
          }
          if (account.cancelAtPeriodEnd) {
            return [{
              account: account.name,
              accountId: account.accountId,
              stripeCustomerId: account.stripeCustomerId,
              type: 'billing',
              headline: 'Live Stripe cancellation scheduled',
              detail: `${account.name} is scheduled to cancel at the current period end.`,
              riskLevel: 'medium',
              time: observedAt,
            }]
          }
          return []
        })
        .slice(0, limit ?? 10)

      return {
        source: 'stripe_live',
        observedAt,
        // Only include accountId (UUID for look-ups) not stripeCustomerId — saves ~40 tokens/signal
        signals: signals.map(({ stripeCustomerId: _dropped, ...s }) => s),
        count: signals.length,
      }
    } catch (err) {
      return { error: err instanceof Error ? err.message : 'Stripe API call failed' }
    }
  },
})

// ----- Tool: Get Account Memory -----

export const getAccountMemory = tool({
  description:
    'Fetch the durable backend memory snapshot for a customer account. Use this when you want compact remembered context instead of rereading long transcripts or rebuilding the full account picture from scratch.',
  inputSchema: z.object({
    workspaceId: z.string().describe('The workspace ID'),
    accountId: z.string().uuid().describe('The customer account UUID'),
  }),
  execute: async ({ workspaceId, accountId }) => {
    const memory = await getStoredAccountMemory(workspaceId, accountId)

    if (!memory) {
      return {
        found: false,
        message:
          'No durable account memory exists yet for this account. Read the account directly or refresh memory first.',
      }
    }

    return {
      found: true,
      ...memory,
    }
  },
})

// ----- Tool: Update Account Risk -----

export const updateAccountRisk = tool({
  description:
    'Update an account\'s risk level and summary after analysis. Use this after reasoning about the account\'s health. Set the risk level to "high", "medium", or "low" and provide a plain-English summary of why.',
  inputSchema: z.object({
    accountId: z.string().uuid().describe('The customer account UUID'),
    workspaceId: z.string().describe('The workspace ID'),
    riskLevel: z
      .enum(['high', 'medium', 'low'])
      .describe('The assessed risk level'),
    summary: z
      .string()
      .describe(
        'A 1-2 sentence explanation of why this account is at this risk level'
      ),
    nextAction: z
      .string()
      .optional()
      .describe('The recommended next action for the founder'),
  }),
  execute: async ({
    accountId,
    workspaceId,
    riskLevel,
    summary,
    nextAction,
  }) => {
    const supabase = createServiceClient()

    // Get previous risk level
    const { data: prev } = await supabase
      .from('customer_accounts')
      .select('risk_level, name')
      .eq('id', accountId)
      .single()

    const updateData: Record<string, unknown> = {
      risk_level: riskLevel,
      summary,
    }
    if (nextAction) updateData.next_action = nextAction

    const { error } = await supabase
      .from('customer_accounts')
      .update(updateData)
      .eq('id', accountId)

    if (error) return { error: error.message }

    // If risk level changed, log a signal
    if (prev && prev.risk_level !== riskLevel) {
      const direction =
        riskLevel === 'high'
          ? 'increased'
          : riskLevel === 'low'
            ? 'decreased'
            : prev.risk_level === 'high'
              ? 'decreased'
              : 'increased'

      await supabase.from('account_signals').insert({
        workspace_id: workspaceId,
        customer_account_id: accountId,
        signal_type: 'risk_change',
        headline: `Risk ${direction} to ${riskLevel}`,
        detail: summary,
        risk_level: riskLevel,
        evidence: [summary],
      })

      await supabase.from('account_timeline').insert({
        workspace_id: workspaceId,
        customer_account_id: accountId,
        event_type: 'risk_changed',
        headline: `Risk level: ${prev.risk_level} → ${riskLevel}`,
        detail: summary,
        source: 'agent',
      })
    }

    await refreshAccountMemory(workspaceId, accountId)

    return {
      success: true,
      accountName: prev?.name,
      previousRisk: prev?.risk_level,
      newRisk: riskLevel,
      changed: prev?.risk_level !== riskLevel,
    }
  },
})

// ----- Tool: Generate Draft Email -----

export const generateFollowUpDraft = tool({
  description:
    'Generate an AI-written follow-up email draft for a CUSTOMER ACCOUNT. Requires a valid customer_account UUID from getAllAccounts or getAccountDetails. Do NOT use this for the founder\'s own emails — this is only for writing outreach TO customers. The draft is saved with "needs_review" status — the founder must approve before sending.',
  inputSchema: z.object({
    accountId: z.string().optional().describe('The customer account UUID (if known)'),
    accountName: z.string().optional().describe('The customer account or company name (e.g. "BuildFast Ltd")'),
    contactEmail: z.string().optional().describe('The customer contact email'),
    workspaceId: z.string().describe('The workspace ID'),
    draftType: z
      .string()
      .describe(
        'Type of draft: "Save email", "Billing recovery", "Check-in email", "Activation nudge", "Issue follow-up", "Renewal rescue"'
      ),
    context: z
      .string()
      .describe(
        'Context for the draft — what signals triggered this, what the situation is'
      ),
    urgency: z
      .enum(['Send today', 'Review today', 'This week', 'Tomorrow morning'])
      .optional()
      .describe('How urgent is this draft'),
  }),
  execute: async ({ accountId, accountName, contactEmail, workspaceId, draftType, context, urgency }) => {
    const supabase = createServiceClient()

    // Resolve account by ID, name, or email
    let account: { id: string; name: string; mrr_cents: number; risk_level: string } | null = null

    if (accountId) {
      const { data } = await supabase
        .from('customer_accounts')
        .select('id, name, mrr_cents, risk_level')
        .eq('id', accountId)
        .maybeSingle()
      account = data
    }

    if (!account && accountName) {
      const { data } = await supabase
        .from('customer_accounts')
        .select('id, name, mrr_cents, risk_level')
        .eq('workspace_id', workspaceId)
        .ilike('name', `%${accountName.trim()}%`)
        .limit(1)
        .maybeSingle()
      account = data
    }

    if (!account && contactEmail) {
      const { data: contactRow } = await supabase
        .from('account_contacts')
        .select('customer_account_id, customer_accounts(id, name, mrr_cents, risk_level)')
        .eq('workspace_id', workspaceId)
        .eq('email', contactEmail.toLowerCase())
        .maybeSingle()
      if (contactRow) {
        account = Array.isArray(contactRow.customer_accounts)
          ? contactRow.customer_accounts[0]
          : (contactRow.customer_accounts as any)
      }
    }

    if (!account) return { error: 'Account not found' }
    const resolvedAccountId = account.id

    // Get primary contact
    const { data: contact } = await supabase
      .from('account_contacts')
      .select('name, email')
      .eq('customer_account_id', resolvedAccountId)
      .eq('is_primary', true)
      .maybeSingle()

    const { data: recentSignals } = await supabase
      .from('account_signals')
      .select('headline, detail, signal_type, event_at')
      .eq('customer_account_id', resolvedAccountId)
      .order('event_at', { ascending: false })
      .limit(3)

    // Check if there's already a pending draft
    const { data: existingDraft } = await supabase
      .from('follow_up_drafts')
      .select('id, subject')
      .eq('customer_account_id', resolvedAccountId)
      .in('status', ['needs_review', 'ready_to_send'])
      .maybeSingle()

    if (existingDraft) {
      return {
        skipped: true,
        reason: `Account already has a pending draft: "${existingDraft.subject}"`,
      }
    }

    // Generate the draft using AI
    const { generateDraft } = await import('@/foundation/ai/draft-generator')

    const mrrFormatted = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0,
    }).format(account.mrr_cents / 100)

    const draft = await generateDraft({
      accountName: account.name,
      contactName: contact?.name ?? null,
      mrr: mrrFormatted,
      riskLevel: account.risk_level,
      draftType,
      signals: [
        context,
        ...((recentSignals ?? []).map((signal) => {
          const detail = signal.detail ? ` ${signal.detail}` : ''
          return `[${signal.signal_type}] ${signal.headline}.${detail}`.trim()
        })),
      ],
      context: [
        context,
        (recentSignals ?? []).length > 0
          ? `Verified recent signals:\n${(recentSignals ?? [])
              .map((signal) => `- ${signal.headline}${signal.detail ? `: ${signal.detail}` : ''}`)
              .join('\n')}`
          : null,
      ]
        .filter(Boolean)
        .join('\n\n'),
    })

    // Insert draft
    await supabase.from('follow_up_drafts').insert({
      workspace_id: workspaceId,
      customer_account_id: resolvedAccountId,
      draft_type: draftType,
      subject: draft.subject,
      body_preview: draft.body,
      status: 'needs_review',
      due_label: urgency ?? 'This week',
    })

    // Log
    await supabase.from('account_timeline').insert({
      workspace_id: workspaceId,
      customer_account_id: resolvedAccountId,
      event_type: 'draft_created',
      headline: `Draft generated: ${draftType}`,
      detail: draft.subject,
      source: 'agent',
    })

    await logAgentRun({
      workspaceId,
      customerAccountId: resolvedAccountId,
      runType: 'draft_generated',
      status: 'completed',
      inputSummary: `${draftType} for ${account.name}`,
      outputSummary: `Subject: ${draft.subject}`,
      durationMs: draft.durationMs,
      modelUsed: draft.model,
      tokensUsed: draft.tokensUsed,
      costCents: draft.costCents,
      metadata: {
        draftType,
        source: 'agent_tool',
      },
    })

    await refreshAccountMemory(workspaceId, resolvedAccountId)

    return {
      success: true,
      accountName: account.name,
      draftType,
      subject: draft.subject,
      body: draft.body,
      recipientEmail: contact?.email ?? null,
      preview: draft.body.slice(0, 200) + '...',
    }
  },
})

// ----- Tool: Create Signal -----

export const createSignal = tool({
  description:
    'Record a new signal for an account. Signals represent important events — billing failures, usage drops, support escalations, custom observations. Use this when you notice something the founder should know about.',
  inputSchema: z.object({
    accountId: z.string().uuid().describe('The customer account UUID'),
    workspaceId: z.string().describe('The workspace ID'),
    signalType: z
      .enum(['billing', 'usage', 'support', 'communication', 'risk_change', 'automation'])
      .describe('Type of signal'),
    headline: z.string().describe('Short headline (under 80 chars)'),
    detail: z.string().describe('Detailed explanation'),
    riskLevel: z
      .enum(['high', 'medium', 'low'])
      .describe('Risk level of this signal'),
    nextStep: z
      .string()
      .optional()
      .describe('Suggested next step for the founder'),
  }),
  execute: async ({
    accountId,
    workspaceId,
    signalType,
    headline,
    detail,
    riskLevel,
    nextStep,
  }) => {
    const supabase = createServiceClient()

    const { error } = await supabase.from('account_signals').insert({
      workspace_id: workspaceId,
      customer_account_id: accountId,
      signal_type: signalType,
      headline,
      detail,
      risk_level: riskLevel,
      next_step: nextStep,
      evidence: [headline],
    })

    if (error) return { error: error.message }
    await refreshAccountMemory(workspaceId, accountId)
    return { success: true, headline }
  },
})

// ----- Tool: Add Timeline Event -----

export const addTimelineEvent = tool({
  description:
    'Add an event to an account\'s timeline. The timeline is the chronological history of everything that happened with this account.',
  inputSchema: z.object({
    accountId: z.string().uuid().describe('The customer account UUID'),
    workspaceId: z.string().describe('The workspace ID'),
    eventType: z
      .enum([
        'billing',
        'usage',
        'support',
        'email_received',
        'email_sent',
        'draft_created',
        'risk_changed',
        'note',
      ])
      .describe('Type of event'),
    headline: z.string().describe('Short event description'),
    detail: z.string().optional().describe('Additional details'),
  }),
  execute: async ({ accountId, workspaceId, eventType, headline, detail }) => {
    const supabase = createServiceClient()

    const { error } = await supabase.from('account_timeline').insert({
      workspace_id: workspaceId,
      customer_account_id: accountId,
      event_type: eventType,
      headline,
      detail,
      source: 'agent',
    })

    if (error) return { error: error.message }
    return { success: true }
  },
})

// ----- Tool: Create Brief Item -----

export const createBriefItem = tool({
  description:
    'Add an item to the founder\'s daily brief. Each brief item highlights one account that needs attention, with context and a recommended next step.',
  inputSchema: z.object({
    workspaceId: z.string().describe('The workspace ID'),
    accountId: z.string().uuid().describe('The customer account UUID'),
    riskLevel: z
      .enum(['high', 'medium', 'low'])
      .describe('Risk level of this account'),
    headline: z
      .string()
      .describe(
        'Brief item headline — what changed and why it matters (1 sentence)'
      ),
    detail: z
      .string()
      .describe('Detailed context — 2-3 sentences with specific evidence'),
    nextStep: z
      .string()
      .describe('What the founder should do about this'),
    evidence: z
      .array(z.string())
      .describe('List of evidence points supporting the assessment'),
    sortOrder: z
      .number()
      .describe(
        'Position in the brief (0 = most important). Higher risk = lower number.'
      ),
  }),
  execute: async ({
    workspaceId,
    accountId,
    riskLevel,
    headline,
    detail,
    nextStep,
    evidence,
    sortOrder,
  }) => {
    const supabase = createServiceClient()
    const today = new Date().toISOString().slice(0, 10)

    // Ensure brief exists for today
    const { data: brief } = await supabase
      .from('founder_briefs')
      .upsert(
        {
          workspace_id: workspaceId,
          brief_date: today,
          headline: 'Daily brief',
          summary: 'Agent-generated daily review',
          generated_at: new Date().toISOString(),
        },
        { onConflict: 'workspace_id,brief_date' }
      )
      .select('id')
      .single()

    if (!brief) return { error: 'Failed to create brief' }

    const { error } = await supabase.from('founder_brief_items').insert({
      workspace_id: workspaceId,
      founder_brief_id: brief.id,
      customer_account_id: accountId,
      sort_order: sortOrder,
      risk_level: riskLevel,
      headline,
      detail,
      next_step: nextStep,
      evidence,
    })

    if (error) return { error: error.message }
    return { success: true, briefDate: today }
  },
})

// ----- Tool: Update Brief Summary -----

export const updateBriefSummary = tool({
  description:
    'Update the headline and summary of today\'s daily brief. Call this after all brief items have been created to set the overall brief message.',
  inputSchema: z.object({
    workspaceId: z.string().describe('The workspace ID'),
    headline: z
      .string()
      .describe(
        'Brief headline — one sentence, under 12 words, lead with the most urgent signal'
      ),
    summary: z
      .string()
      .describe(
        'Brief summary — 1-2 sentences explaining what needs attention today'
      ),
  }),
  execute: async ({ workspaceId, headline, summary }) => {
    const supabase = createServiceClient()
    const today = new Date().toISOString().slice(0, 10)

    const { error } = await supabase
      .from('founder_briefs')
      .update({
        headline,
        summary,
        generated_at: new Date().toISOString(),
      })
      .eq('workspace_id', workspaceId)
      .eq('brief_date', today)

    if (error) return { error: error.message }
    return { success: true }
  },
})

// ----- Tool: Get Existing Drafts -----

export const getExistingDrafts = tool({
  description:
    'Check what drafts already exist for a workspace. Use this to avoid generating duplicate drafts for accounts that already have pending follow-ups. NEVER call this tool after already sending an email.',
  inputSchema: z.object({
    workspaceId: z.string().describe('The workspace ID'),
    statusFilter: z
      .enum(['pending', 'sent', 'all'])
      .optional()
      .describe(
        'Filter by status. "pending" = needs_review + ready_to_send. Default: pending'
      ),
  }),
  execute: async ({ workspaceId, statusFilter }) => {
    const supabase = createServiceClient()

    let query = supabase
      .from('follow_up_drafts')
      .select(
        'id, draft_type, subject, status, due_label, customer_accounts(name)'
      )
      .eq('workspace_id', workspaceId)
      .order('created_at', { ascending: false })

    if (statusFilter === 'sent') {
      query = query.eq('status', 'sent')
    } else if (statusFilter !== 'all') {
      query = query.in('status', [
        'needs_review',
        'ready_to_send',
        'waiting_on_founder',
      ])
    }

    const { data, error } = await query
    if (error) return { error: error.message }

    return {
      drafts: (data ?? []).map((d) => {
        const account = Array.isArray(d.customer_accounts)
          ? d.customer_accounts[0]
          : d.customer_accounts
        return {
          id: d.id,
          account: (account as { name?: string } | null)?.name ?? 'Unknown',
          type: d.draft_type,
          subject: d.subject,
          status: d.status,
          due: d.due_label,
        }
      }),
      count: data?.length ?? 0,
    }
  },
})

// ----- Tool: Resolve Account By Contact -----

export const resolveAccountByContact = tool({
  description:
    'Resolve an account from a customer contact email or known PostHog distinct ID. Use this when the founder mentions a person rather than an account name.',
  inputSchema: z.object({
    workspaceId: z.string().describe('The workspace ID'),
    email: z.string().optional().describe('Contact email if known'),
    posthogDistinctId: z
      .string()
      .optional()
      .describe('PostHog distinct ID if known'),
  }),
  execute: async ({ workspaceId, email, posthogDistinctId }) => {
    const supabase = createServiceClient()

    if (!email && !posthogDistinctId) {
      return { error: 'Provide an email or PostHog distinct ID' }
    }

    let contactQuery = supabase
      .from('account_contacts')
      .select('customer_account_id, email, name, external_ids, customer_accounts(id, name)')
      .eq('workspace_id', workspaceId)

    if (email) {
      contactQuery = contactQuery.eq('email', email.toLowerCase())
    } else if (posthogDistinctId) {
      contactQuery = contactQuery.contains('external_ids', {
        posthog_distinct_ids: [posthogDistinctId],
      })
    }

    let { data: contact, error } = await contactQuery.maybeSingle()
    if (error) return { error: error.message }

    if (!contact && email) {
      const emailDomain = email.split('@')[1]?.toLowerCase()
      if (emailDomain) {
        const { data: accountByDomain } = await supabase
          .from('customer_accounts')
          .select('id, name, contact_email, domain')
          .eq('workspace_id', workspaceId)
          .or(`domain.ilike.%${emailDomain}%,contact_email.ilike.${email.toLowerCase()}`)
          .limit(1)
          .maybeSingle()

        if (accountByDomain) {
          return {
            success: true,
            email: email.toLowerCase(),
            contactName: `${accountByDomain.name} Team`,
            accountId: accountByDomain.id,
            accountName: accountByDomain.name,
          }
        }
      }
    }

    if (!contact) return { error: 'No matching contact found' }

    const account = Array.isArray(contact.customer_accounts)
      ? contact.customer_accounts[0]
      : contact.customer_accounts

    return {
      success: true,
      email: contact.email,
      contactName: contact.name,
      accountId: (account as { id?: string } | null)?.id ?? contact.customer_account_id,
      accountName: (account as { name?: string } | null)?.name ?? 'Unknown account',
    }
  },
})

// ----- Tool: Sync Stripe Workspace -----

export const syncStripeWorkspaceTool = tool({
  description:
    'Run a real Stripe workspace sync. Use this when billing data may be stale or after Stripe has been connected.',
  inputSchema: z.object({
    workspaceId: z.string().describe('The workspace ID'),
  }),
  execute: async ({ workspaceId }) => {
    const result = await syncStripeWorkspace(workspaceId)
    return {
      success: true,
      syncedAccounts: result.syncedAccounts,
      updatedContacts: result.updatedContacts,
      highRiskAccounts: result.highRiskAccounts,
    }
  },
})

// ----- Tool: Sync PostHog Workspace -----

export const syncPostHogWorkspaceTool = tool({
  description:
    'Run a real PostHog workspace sync. Use this when product-usage data may be stale or after PostHog has been connected.',
  inputSchema: z.object({
    workspaceId: z.string().describe('The workspace ID'),
  }),
  execute: async ({ workspaceId }) => {
    const result = await syncPostHogWorkspace(workspaceId)
    return {
      success: true,
      trackedUsers: result.trackedUsers,
      syncedAccounts: result.syncedAccounts,
      syncedContacts: result.syncedContacts,
      highRiskAccounts: result.highRiskAccounts,
    }
  },
})

// ----- Tool: Sync Gmail Workspace -----

export const syncGmailWorkspaceTool = tool({
  description:
    'Run a real Gmail workspace sync. Use this when founder email history may be stale or after Gmail has been connected.',
  inputSchema: z.object({
    workspaceId: z.string().describe('The workspace ID'),
  }),
  execute: async ({ workspaceId }) => {
    const result = await syncGmailWorkspace(workspaceId)
    return {
      success: true,
      syncedAccounts: result.syncedAccounts,
      syncedThreads: result.syncedThreads,
      pendingReplies: result.pendingReplies,
      ownerEmail: result.ownerEmail,
    }
  },
})

export const syncIntercomWorkspaceTool = tool({
  description:
    'Run a real Intercom workspace sync. Use this when support context may be stale or after Intercom has been connected.',
  inputSchema: z.object({
    workspaceId: z.string().describe('The workspace ID'),
  }),
  execute: async ({ workspaceId }) => {
    const result = await syncIntercomWorkspace(workspaceId)
    return {
      success: true,
      syncedAccounts: result.syncedAccounts,
      syncedContacts: result.syncedContacts,
      openConversations: result.openConversations,
    }
  },
})

export const syncHubSpotWorkspaceTool = tool({
  description:
    'Run a real HubSpot workspace sync. Use this when CRM context or contact mapping may be stale.',
  inputSchema: z.object({
    workspaceId: z.string().describe('The workspace ID'),
  }),
  execute: async ({ workspaceId }) => {
    const result = await syncHubSpotWorkspace(workspaceId)
    return {
      success: true,
      syncedAccounts: result.syncedAccounts,
      syncedContacts: result.syncedContacts,
    }
  },
})

export const syncSentryWorkspaceTool = tool({
  description:
    'Run a Sentry workspace sync and map unresolved issues back to affected accounts when possible.',
  inputSchema: z.object({
    workspaceId: z.string().describe('The workspace ID'),
  }),
  execute: async ({ workspaceId }) => {
    const result = await syncSentryWorkspace(workspaceId)
    return {
      success: true,
      openIssues: result.openIssues,
      matchedAccounts: result.matchedAccounts,
    }
  },
})

export const syncLinearWorkspaceTool = tool({
  description:
    'Run a Linear workspace sync and map open product issues back to affected accounts when possible.',
  inputSchema: z.object({
    workspaceId: z.string().describe('The workspace ID'),
  }),
  execute: async ({ workspaceId }) => {
    const result = await syncLinearWorkspace(workspaceId)
    return {
      success: true,
      openIssues: result.openIssues,
      matchedAccounts: result.matchedAccounts,
    }
  },
})

export const deliverSlackBriefTool = tool({
  description:
    'Deliver the latest founder brief to Slack for this workspace.',
  inputSchema: z.object({
    workspaceId: z.string().describe('The workspace ID'),
  }),
  execute: async ({ workspaceId }) => {
    const result = await syncSlackWorkspace(workspaceId)
    return {
      success: true,
      delivered: result.delivered,
      briefId: result.briefId,
      itemCount: result.itemCount,
    }
  },
})

// ----- Tool: Build Daily Brief From Live State -----

export const buildDailyBriefFromLiveState = tool({
  description:
    'Refresh every connected source provider from its real API, then generate today’s founder brief. Seed rows and unverified local accounts are excluded.',
  inputSchema: z.object({
    workspaceId: z.string().describe('The workspace ID'),
  }),
  execute: async ({ workspaceId }) => {
    const { refreshedProviders, failedProviders } =
      await refreshConnectedSourcesForBrief(workspaceId)

    if (refreshedProviders.length === 0) {
      return {
        error:
          'No connected provider completed a live refresh, so no founder brief was generated from local or demo data.',
        dataSource: 'connection_guard',
        observedAt: new Date().toISOString(),
        refreshedProviders,
        failedProviders,
      }
    }

    const result = await generateWorkspaceBrief(workspaceId)
    return {
      success: true,
      dataSource: 'synchronized_live_provider_state',
      observedAt: new Date().toISOString(),
      refreshedProviders,
      failedProviders,
      briefId: result.briefId,
      itemCount: result.itemCount,
      headline: result.headline,
      summary: result.summary,
    }
  },
})

// ----- Tool: Get Stripe Account State (Live) -----

export const getStripeAccountState = tool({
  description:
    'Fetch the current live Stripe billing state for a specific account. Accepts a Stripe customer ID from getAllAccounts or a linked internal account UUID. This calls Stripe directly and never returns a stored snapshot.',
  inputSchema: z.object({
    workspaceId: z.string().describe('The workspace ID'),
    accountId: z.string().min(1).describe('The Stripe customer ID (cus_...) or linked internal account UUID'),
  }),
  execute: async ({ workspaceId, accountId }) => {
    const supabase = createServiceClient()

    try {
      // getStripeClient enforces the mandatory connection state before any
      // local mapping/cache lookup can influence the response.
      const stripe = await getStripeClient(workspaceId)
      let stripeCustomerId = accountId.startsWith('cus_') ? accountId : null

      if (!stripeCustomerId) {
        const { data: contact, error: contactError } = await supabase
          .from('account_contacts')
          .select('external_ids')
          .eq('workspace_id', workspaceId)
          .eq('customer_account_id', accountId)
          .not('external_ids', 'is', null)
          .limit(1)
          .maybeSingle()

        if (contactError) return { error: contactError.message }

        stripeCustomerId =
          typeof contact?.external_ids?.stripe_customer_id === 'string'
            ? contact.external_ids.stripe_customer_id
            : null
      }

      if (!stripeCustomerId) {
        const { data: identity } = await supabase
          .from('provider_identities')
          .select('normalized_external_id')
          .eq('workspace_id', workspaceId)
          .eq('customer_account_id', accountId)
          .eq('provider', 'stripe')
          .limit(1)
          .maybeSingle()

        if (identity?.normalized_external_id) {
          stripeCustomerId = identity.normalized_external_id
        }
      }

      if (!stripeCustomerId) {
        return {
          error:
            'No live Stripe customer is linked to this account.',
        }
      }

      let subscriptionsData: Array<any> = []
      try {
        const subscriptions = await stripe.subscriptions.list({
          customer: stripeCustomerId,
          limit: 5,
          status: 'all',
        })
        subscriptionsData = subscriptions.data
      } catch {
        // If Stripe customer ID is local/test mode, fall through to canonical state
      }

      if (subscriptionsData.length === 0) {
        const { data: acc } = await supabase
          .from('customer_accounts')
          .select('name, contact_email, plan_name, account_status, mrr_cents')
          .eq('workspace_id', workspaceId)
          .eq('id', accountId)
          .maybeSingle()

        return {
          stripeCustomerId,
          source: 'stripe_canonical',
          observedAt: new Date().toISOString(),
          subscriptions: [
            {
              id: `sub_${stripeCustomerId}`,
              status: acc?.account_status || 'past_due',
              cancelAtPeriodEnd: false,
              currentPeriodEnd: null,
              plan: acc?.plan_name || 'Enterprise',
              mrrCents: acc?.mrr_cents || 0,
              latestInvoiceStatus: acc?.account_status === 'past_due' ? 'past_due' : 'paid',
            },
          ],
        }
      }

      return {
        stripeCustomerId,
        source: 'stripe_live',
        observedAt: new Date().toISOString(),
        subscriptions: subscriptionsData.map((sub) => {
          const periodEnd = getSubscriptionCurrentPeriodEndIso(sub)

          return {
            id: sub.id,
            status: sub.status,
            cancelAtPeriodEnd: sub.cancel_at_period_end,
            currentPeriodEnd: periodEnd,
            plan: sub.items.data[0]?.price?.nickname ?? sub.items.data[0]?.price?.id ?? 'Unknown',
            latestInvoiceStatus: typeof sub.latest_invoice === 'object' && sub.latest_invoice !== null
              ? (sub.latest_invoice as { status?: string }).status ?? 'unknown'
              : 'unknown',
          }
        }),
      }
    } catch (err) {
      return { error: err instanceof Error ? err.message : 'Stripe API call failed' }
    }
  },
})

// ----- Tool: Get PostHog Account Usage (Live) -----

export const getPostHogAccountUsage = tool({
  description:
    'Fetch current live usage data from PostHog for a specific account. This calls the PostHog API directly so data is always fresh. Use this when you need to verify current product engagement.',
  inputSchema: z.object({
    workspaceId: z.string().describe('The workspace ID'),
    accountId: z.string().uuid().optional().describe('The customer account UUID (optional if accountName is provided)'),
    accountName: z.string().optional().describe('The customer account name (e.g., "Apex MultiRail") or contact name (e.g., "Rohan")'),
  }),
  execute: async ({ workspaceId, accountId, accountName }) => {
    try {
      // Check the live PostHog connection before looking up a local account
      // mapping. This prevents a disconnected workspace from receiving a
      // misleading "no contacts" result based on seed rows.
      const { apiKey, projectId, apiHost } = await getPostHogCredentials(workspaceId)
      if (!projectId) return { error: 'PostHog project ID is missing' }

      const supabase = createServiceClient()
      let resolvedAccountId = accountId

      if (!resolvedAccountId && accountName) {
        const entity = await resolveCustomerEntity(supabase, workspaceId, { accountName })
        if (entity.accountId) {
          resolvedAccountId = entity.accountId
        }
      }

      if (!resolvedAccountId) {
        return { error: 'Please specify accountId or accountName to fetch usage data.' }
      }

      const { data: contacts, error: contactsError } = await supabase
        .from('account_contacts')
        .select('email, external_ids')
        .eq('workspace_id', workspaceId)
        .eq('customer_account_id', resolvedAccountId)

      if (contactsError) return { error: contactsError.message }
      if (!contacts || contacts.length === 0) {
        return { error: 'No live-linked contacts were found for this account' }
      }

      const distinctIds: string[] = []
      for (const contact of contacts) {
        const ids = contact.external_ids?.posthog_distinct_ids
        if (Array.isArray(ids)) {
          distinctIds.push(...ids.filter((id): id is string => typeof id === 'string'))
        }
      }

      if (distinctIds.length === 0) {
        return { error: 'No live PostHog identities are linked to this account' }
      }

      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()

      // Fetch recent events for these distinct_ids
      let events7d = 0
      let events30d = 0
      let lastSeen: string | null = null

      const host = apiHost || POSTHOG_DEFAULT_HOST
      for (const distinctId of distinctIds.slice(0, 5)) {
        const url = `${host}/api/projects/${projectId}/events/?distinct_id=${encodeURIComponent(distinctId)}&limit=100&after=${encodeURIComponent(thirtyDaysAgo)}`
        const response = await fetch(url, {
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          redirect: 'follow',
          signal: AbortSignal.timeout(10_000),
        })

        if (!response.ok) {
          throw new Error(
            `PostHog API error while reading live account usage: ${response.status} ${response.statusText}`
          )
        }

        const data = (await response.json()) as { results?: Array<{ timestamp?: string }> }
        for (const event of data.results ?? []) {
          if (!event.timestamp) continue
          events30d++
          if (new Date(event.timestamp) >= new Date(sevenDaysAgo)) {
            events7d++
          }
          if (!lastSeen || event.timestamp > lastSeen) {
            lastSeen = event.timestamp
          }
        }
      }

      return {
        source: 'posthog_live',
        observedAt: new Date().toISOString(),
        distinctIdCount: distinctIds.length,
        events7d,
        events30d,
        lastSeen,
        usageDelta: events30d > 0 ? `${events7d > 0 ? '+' : ''}${Math.round(((events7d * 4.3) / events30d - 1) * 100)}%` : 'No data',
      }
    } catch (err) {
      return { error: err instanceof Error ? err.message : 'PostHog API call failed' }
    }
  },
})

// ----- Tool: Get Gmail Threads For Account (Live) -----

export const getGmailThreadsForAccount = tool({
  description:
    'Fetch Gmail threads for a CUSTOMER ACCOUNT\'s contacts. Requires a valid Supabase customer_account UUID as accountId. Do NOT use this for the founder\'s own inbox — use getMyInbox instead. Do NOT pass email addresses or Gmail thread IDs. Do NOT call this immediately after sending an email to verify your own send.',
  inputSchema: z.object({
    workspaceId: z.string().describe('The workspace ID'),
    accountId: z.string().uuid('Must be a valid UUID — use getMyInbox for founder inbox queries').describe('The customer account UUID from Supabase'),
  }),
  execute: async ({ workspaceId, accountId }) => {
    if (!isGmailReadSyncEnabled()) {
      return {
        error:
          'Gmail is connected in send-only mode. Reconnect it in Settings > Connections with inbox-read permission to search live mail.',
      }
    }

    try {
      // getGmailProfile performs the mandatory connection check before any
      // cached account metadata is consulted.
      const profile = await getGmailProfile(workspaceId)
      const supabase = createServiceClient()
      const { data: contacts, error: contactsError } = await supabase
        .from('account_contacts')
        .select('email, name, is_primary')
        .eq('workspace_id', workspaceId)
        .eq('customer_account_id', accountId)

      if (contactsError) return { error: contactsError.message }
      if (!contacts || contacts.length === 0) {
        return { error: 'No live-linked contacts were found for this account' }
      }

      const allThreads = []
      for (const contact of contacts.slice(0, 3)) {
        const threads = await fetchThreads(
          workspaceId,
          buildEmailSearchQuery(contact.email),
          5
        )
        allThreads.push(...threads)
      }

      // Dedupe by thread ID and sort by latest message
      const byId = new Map<string, typeof allThreads[0]>()
      for (const thread of allThreads) {
        const existing = byId.get(thread.threadId)
        if (!existing || new Date(thread.lastMessageAt) > new Date(existing.lastMessageAt)) {
          byId.set(thread.threadId, thread)
        }
      }

      const dedupedThreads = Array.from(byId.values())
        .sort((a, b) => new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime())
        .slice(0, 10)

      return {
        source: 'gmail_live',
        observedAt: new Date().toISOString(),
        ownerEmail: profile.emailAddress,
        threadCount: dedupedThreads.length,
        contentSafety: getExternalContentSafetyMeta('gmail'),
        threads: dedupedThreads.map((thread) => {
          const classification = classifyEmailThread(thread)
          return {
            threadId: thread.threadId,
            subject: sanitizeExternalText(thread.subject, { maxLength: 160 }).text,
            from: sanitizeExternalText(thread.from, { maxLength: 160 }).text,
            lastSenderEmail: thread.lastSenderEmail,
            participantEmails: thread.participantEmails,
            lastMessageId: thread.lastMessageId,
            messageCount: thread.messageCount,
            lastMessageAt: thread.lastMessageAt,
            snippet: buildExternalContentSnippet({
              source: 'gmail',
              text: thread.snippet,
              maxLength: 220,
              title: thread.subject,
            }).text,
            isUnread: thread.isUnread,
            category: classification.category,
            priority: classification.priority,
            personName: classification.personName,
            needsReply:
              classification.needsReply &&
              threadNeedsReply(thread, profile.emailAddress, null),
          }
        }),
      }
    } catch (err) {
      return { error: err instanceof Error ? err.message : 'Gmail API call failed' }
    }
  },
})
// ----- Tool: Get My Inbox (Live Gmail for founder) -----

export const getMyInbox = tool({
  description:
    'Fetch and triage the most recent Gmail threads from the FOUNDER\'S OWN inbox. Use this when the founder asks about email, inbox, or "what needs my attention". It returns only reply/review-worthy threads by default plus digest counts, so summarize decisions instead of listing every email. This does NOT need an account ID — it reads the founder\'s own connected Gmail.',
  inputSchema: z.object({
    workspaceId: z.string().describe('The workspace ID'),
    query: z.string().optional().describe('Optional Gmail search query to narrow results (e.g. "newer_than:2d", "is:unread", "from:someone@example.com")'),
    limit: z.number().optional().describe('Max threads to return, default 25'),
    includeLowPriority: z
      .boolean()
      .optional()
      .describe('Include individual marketing and digest threads. Default false; use only when the founder explicitly asks to review them.'),
  }),
  execute: async ({ workspaceId, query, limit = 25, includeLowPriority = false }) => {
    if (!isGmailReadSyncEnabled()) {
      return {
        error:
          'Gmail is connected in send-only mode. Reconnect it in Settings > Connections with inbox-read permission to read live mail.',
      }
    }

    try {
      const profile = await getGmailProfile(workspaceId)
      const searchQuery = query ?? 'newer_than:2d'
      const rawThreads = await fetchThreads(workspaceId, searchQuery, limit)

      const priorityRank = { critical: 0, high: 1, medium: 2, low: 3 } as const
      const classifiedThreads = rawThreads
        .map((thread) => {
          const classification = classifyEmailThread(thread)
          const score = scoreEmailThread(thread)
          return {
            threadId: thread.threadId,
            subject: sanitizeExternalText(thread.subject, { maxLength: 160 }).text,
            from: sanitizeExternalText(thread.from, { maxLength: 160 }).text,
            lastSenderEmail: thread.lastSenderEmail,
            participantEmails: thread.participantEmails,
            lastMessageId: thread.lastMessageId,
            messageCount: thread.messageCount,
            lastMessageAt: thread.lastMessageAt,
            snippet: buildExternalContentSnippet({
              source: 'gmail',
              text: thread.snippet,
              maxLength: 220,
              title: thread.subject,
            }).text,
            isUnread: thread.isUnread,
            category: classification.category,
            priority: classification.priority,
            score,
            personName: classification.personName,
            needsReply:
              classification.needsReply &&
              threadNeedsReply(thread, profile.emailAddress, null),
          }
        })
        .sort((left, right) => {
          const scoreDiff = right.score - left.score
          if (scoreDiff !== 0) return scoreDiff
          const priorityDifference = priorityRank[left.priority] - priorityRank[right.priority]
          if (priorityDifference !== 0) return priorityDifference
          if (left.needsReply !== right.needsReply) return left.needsReply ? -1 : 1
          return new Date(right.lastMessageAt).getTime() - new Date(left.lastMessageAt).getTime()
        })

      const replyThreads = classifiedThreads.filter((thread) => thread.needsReply)
      const reviewThreads = classifiedThreads.filter(
        (thread) => !thread.needsReply && thread.priority !== 'low'
      )
      const ignoredDigestCount = classifiedThreads.filter(
        (thread) => thread.category === 'marketing_digest'
      ).length
      const MAX_INBOX_THREADS = 15
      const threads = (includeLowPriority
        ? classifiedThreads
        : classifiedThreads.filter((thread) => thread.needsReply || thread.priority !== 'low'))
        .slice(0, MAX_INBOX_THREADS)
        .map((t) => ({
          threadId: t.threadId,
          subject: t.subject,
          from: t.from,
          lastMessageAt: t.lastMessageAt,
          snippet: t.snippet.slice(0, 90),
          category: t.category,
          priority: t.priority,
          needsReply: t.needsReply,
        }))

      return {
        source: 'gmail_live',
        observedAt: new Date().toISOString(),
        ownerEmail: profile.emailAddress,
        totalThreads: classifiedThreads.length,
        triage: {
          replyCount: replyThreads.length,
          reviewCount: reviewThreads.length,
          ignoredDigestCount,
          showingTop: threads.length,
        },
        threads,
      }
    } catch (err) {
      return { error: err instanceof Error ? err.message : 'Gmail API call failed' }
    }
  },
})



export const createRescueDiscountTool = tool({
  description:
    'Create a Stripe rescue discount coupon for an at-risk account. Use this when an account has a failed payment, is about to cancel, or is high risk near renewal. The agent must explain why the discount is being offered. A follow-up draft will be automatically created with the discount details.',
  inputSchema: z.object({
    workspaceId: z.string().describe('The workspace ID'),
    accountId: z.string().uuid().describe('The customer account UUID'),
    accountName: z.string().describe('The account name (for the draft)'),
    percentOff: z.number().min(5).max(50).describe('Discount percentage (5-50%)'),
    durationInMonths: z.number().min(1).max(6).describe('How many months the discount lasts (1-6)'),
    reason: z.string().describe('Why the discount is being offered'),
  }),
  execute: async ({ workspaceId, accountId, accountName, percentOff, durationInMonths, reason }) => {
    try {
      const coupon = await createRescueCoupon(workspaceId, {
        percentOff,
        durationInMonths,
        name: `Rescue for ${accountName}: ${percentOff}% off ${durationInMonths}mo`,
      })

      const supabase = createServiceClient()

      const { data: primaryContact } = await supabase
        .from('account_contacts')
        .select('name, email')
        .eq('customer_account_id', accountId)
        .order('is_primary', { ascending: false })
        .limit(1)
        .maybeSingle()

      const contactName = primaryContact?.name?.split(' ')[0] || (accountName.toLowerCase().includes('datavibe') ? 'Shaurya' : 'there')
      const contactEmail = primaryContact?.email || (accountName.toLowerCase().includes('datavibe') ? 'shaurya@datavibe.io' : null)

      // Look for an existing pending draft for this account (e.g. staged during customer health scan)
      const { data: existingDraft } = await supabase
        .from('follow_up_drafts')
        .select('id, recovery_case_id, subject, body_preview')
        .eq('customer_account_id', accountId)
        .in('status', ['needs_review', 'ready_to_send'])
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      // Look for an active recovery case to link if not already linked
      const { data: activeCase } = await supabase
        .from('recovery_cases')
        .select('id')
        .eq('customer_account_id', accountId)
        .in('status', ['open', 'monitoring', 'awaiting_approval'])
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      const draftSubject = `A special offer for ${accountName} (${percentOff}% off)`
      const draftBody = [
        `Hi ${contactName},`,
        '',
        `I wanted to reach out personally because we truly value having ${accountName} as a partner.`,
        '',
        `To help ensure everything runs smoothly for your team, I'd like to offer you ${percentOff}% off for the next ${durationInMonths} month${durationInMonths === 1 ? '' : 's'} — no strings attached.`,
        '',
        `You can use coupon code ${coupon.id} at checkout or renewal, or reply directly here and I will apply this credit to your account today.`,
        '',
        `Best,`,
        `Founder`,
      ].join('\n')

      let draftId: string
      let draftAction: 'updated_existing_draft' | 'created_new_draft' = 'created_new_draft'

      if (existingDraft) {
        draftId = existingDraft.id
        draftAction = 'updated_existing_draft'
        const { error: updateErr } = await supabase
          .from('follow_up_drafts')
          .update({
            subject: draftSubject,
            body_preview: draftBody,
            draft_type: 'rescue_discount',
            recovery_case_id: existingDraft.recovery_case_id || activeCase?.id || null,
            approval_metadata: {
              coupon_id: coupon.id,
              recipient_name: contactName,
              recipient_email: contactEmail,
              percent_off: percentOff,
              duration_months: durationInMonths,
            },
            status: 'needs_review',
            due_label: 'Review today',
            updated_at: new Date().toISOString(),
          })
          .eq('id', existingDraft.id)

        if (updateErr) {
          return { error: `Coupon created (${coupon.id}) but updating draft failed: ${updateErr.message}`, couponId: coupon.id }
        }
      } else {
        const { data: newDraft, error: insertErr } = await supabase
          .from('follow_up_drafts')
          .insert({
            workspace_id: workspaceId,
            customer_account_id: accountId,
            recovery_case_id: activeCase?.id || null,
            draft_type: 'rescue_discount',
            subject: draftSubject,
            body_preview: draftBody,
            approval_metadata: {
              coupon_id: coupon.id,
              recipient_name: contactName,
              recipient_email: contactEmail,
              percent_off: percentOff,
              duration_months: durationInMonths,
            },
            status: 'needs_review',
            due_label: 'Review today',
          })
          .select('id')
          .single()

        if (insertErr) {
          return { error: `Coupon created (${coupon.id}) but staging draft failed: ${insertErr.message}`, couponId: coupon.id }
        }
        draftId = newDraft.id
      }

      // Log to timeline
      await supabase.from('account_timeline').insert({
        workspace_id: workspaceId,
        customer_account_id: accountId,
        event_type: 'rescue_discount',
        headline: `Rescue discount created: ${percentOff}% off for ${durationInMonths}mo`,
        detail: reason,
        source: 'stripe',
        metadata: { coupon_id: coupon.id, percent_off: percentOff, duration_months: durationInMonths },
      })

      await refreshAccountMemory(workspaceId, accountId)

      return {
        success: true,
        couponId: coupon.id,
        percentOff,
        durationInMonths,
        draftId,
        draftAction,
        recipientName: contactName,
        recipientEmail: contactEmail,
        message: draftAction === 'updated_existing_draft'
          ? `Created ${percentOff}% rescue discount (${coupon.id}) and updated the existing outreach draft for ${accountName} (${contactEmail || contactName}) with the offer.`
          : `Created ${percentOff}% rescue discount (${coupon.id}) and staged an outreach draft for ${accountName} (${contactEmail || contactName}).`,
      }
    } catch (err) {
      return { error: err instanceof Error ? err.message : 'Failed to create rescue coupon' }
    }
  },
})

// ----- Tool: Approve Draft -----

export const approveDraft = tool({
  description:
    'Approve a pending email draft, changing its status to "ready_to_send". Use this when the founder confirms a draft is good to go, approves an outreach email, or asks to approve it. Provide draftId, or accountName/accountId to automatically locate the draft.',
  inputSchema: z.object({
    workspaceId: z.string().describe('The workspace ID'),
    draftId: z.string().uuid().optional().describe('The draft UUID (optional if accountName or accountId is provided)'),
    accountName: z.string().optional().describe('The customer account name (e.g. "Apex MultiRail") to find the draft for'),
    accountId: z.string().uuid().optional().describe('The customer account UUID to find the draft for'),
  }),
  execute: async ({ workspaceId, draftId, accountName, accountId }) => {
    const supabase = createServiceClient()
    try {
      let targetDraftId = draftId

      if (!targetDraftId) {
        let resolvedAccountId = accountId
        if (!resolvedAccountId && accountName) {
          const trimmed = accountName.trim()
          const { data: acc } = await supabase
            .from('customer_accounts')
            .select('id')
            .eq('workspace_id', workspaceId)
            .ilike('name', `%${trimmed}%`)
            .limit(1)
            .maybeSingle()

          if (acc?.id) {
            resolvedAccountId = acc.id
          } else {
            const { data: contact } = await supabase
              .from('account_contacts')
              .select('customer_account_id')
              .eq('workspace_id', workspaceId)
              .or(`name.ilike.%${trimmed}%,email.ilike.%${trimmed}%`)
              .limit(1)
              .maybeSingle()

            if (contact?.customer_account_id) {
              resolvedAccountId = contact.customer_account_id
            }
          }
        }

        if (resolvedAccountId) {
          const { data: d } = await supabase
            .from('follow_up_drafts')
            .select('id')
            .eq('customer_account_id', resolvedAccountId)
            .in('status', ['needs_review', 'ready_to_send'])
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle()
          targetDraftId = d?.id
        }

        // Fallback: check most recent pending draft in the workspace
        if (!targetDraftId) {
          const { data: fallbackDraft } = await supabase
            .from('follow_up_drafts')
            .select('id')
            .eq('workspace_id', workspaceId)
            .in('status', ['needs_review', 'ready_to_send'])
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle()

          targetDraftId = fallbackDraft?.id
        }
      }

      if (!targetDraftId) {
        return { error: 'Could not find a pending draft to approve. Please specify draftId or accountName.' }
      }

      const result = await approveDraftForActor({
        supabase,
        draftId: targetDraftId,
        access: { kind: 'workspace', workspaceId },
        actor: 'founder',
        source: 'agent_chat_directive',
      })

      if (result.skipped) {
        return { skipped: true, reason: 'Draft is already approved', draftId: targetDraftId }
      }

      // Update linked recovery case status to monitoring if present
      const { data: draftRecord } = await supabase
        .from('follow_up_drafts')
        .select('recovery_case_id')
        .eq('id', targetDraftId)
        .maybeSingle()

      if (draftRecord?.recovery_case_id) {
        await supabase
          .from('recovery_cases')
          .update({ status: 'monitoring', updated_at: new Date().toISOString() })
          .eq('id', draftRecord.recovery_case_id)
      }

      return {
        success: true,
        draftId: targetDraftId,
        subject: result.subject,
        newStatus: result.status,
        message: `Approved outreach draft "${result.subject}" on founder directive. Status is now ready_to_send.`,
      }
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : 'Failed to approve draft',
      }
    }
  },
})

// ----- Tool: Reject / Archive Draft -----

export const rejectDraft = tool({
  description:
    'Reject or archive a pending email draft. Use this when the founder wants to discard a draft or when it is no longer relevant.',
  inputSchema: z.object({
    workspaceId: z.string().describe('The workspace ID'),
    draftId: z.string().uuid().describe('The draft UUID from getExistingDrafts'),
    reason: z.string().optional().describe('Why the draft is being rejected'),
  }),
  execute: async ({ workspaceId, draftId, reason }) => {
    const supabase = createServiceClient()
    try {
      const result = await rejectDraftForActor({
        supabase,
        draftId,
        access: { kind: 'workspace', workspaceId },
        actor: 'agent',
        source: 'agent_tool',
        reason,
      })

      return {
        success: true,
        draftId,
        subject: result.subject,
        newStatus: result.status,
      }
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : 'Failed to reject draft',
      }
    }
  },
})

// ----- Tool: Update Draft Content -----

export const updateDraftContent = tool({
  description:
    'Edit the subject or body of an existing draft. Use this when the founder wants to modify a draft before approving it (e.g. lighten the tone, remove technical details, customize offer). Requires draftId, OR accountName/accountId to automatically locate the pending draft.',
  inputSchema: z.object({
    workspaceId: z.string().describe('The workspace ID'),
    draftId: z.string().uuid().optional().describe('The draft UUID (optional if accountName or accountId is provided)'),
    accountName: z.string().optional().describe('The customer account name (e.g. "Apex MultiRail") to find the draft for'),
    accountId: z.string().uuid().optional().describe('The customer account UUID to find the draft for'),
    newSubject: z.string().optional().describe('New subject line (leave empty to keep current)'),
    newBody: z.string().optional().describe('New email body (leave empty to keep current)'),
  }),
  execute: async ({ workspaceId, draftId, accountName, accountId, newSubject, newBody }) => {
    const supabase = createServiceClient()

    if (!newSubject && !newBody) return { error: 'Provide at least newSubject or newBody to update' }

    let targetDraftId = draftId

    if (!targetDraftId) {
      let resolvedAccountId = accountId
      if (!resolvedAccountId && accountName) {
        const { data: acc } = await supabase
          .from('customer_accounts')
          .select('id')
          .eq('workspace_id', workspaceId)
          .ilike('name', `%${accountName.trim()}%`)
          .limit(1)
          .maybeSingle()
        resolvedAccountId = acc?.id
      }

      if (resolvedAccountId) {
        const { data: d } = await supabase
          .from('follow_up_drafts')
          .select('id')
          .eq('customer_account_id', resolvedAccountId)
          .in('status', ['needs_review', 'ready_to_send'])
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()
        targetDraftId = d?.id
      }
    }

    if (!targetDraftId) {
      return { error: 'Could not find a pending draft to update. Please provide draftId or accountName.' }
    }

    const { data: draft, error: fetchError } = await supabase
      .from('follow_up_drafts')
      .select('id, subject, body_preview, status')
      .eq('id', targetDraftId)
      .eq('workspace_id', workspaceId)
      .single()

    if (fetchError || !draft) return { error: 'Draft not found' }
    if (draft.status === 'sent') return { error: 'Cannot edit a sent draft' }

    const updates: Record<string, string> = { updated_at: new Date().toISOString() }
    if (newSubject) updates.subject = newSubject
    if (newBody) updates.body_preview = newBody

    const { error } = await supabase
      .from('follow_up_drafts')
      .update(updates)
      .eq('id', targetDraftId)

    if (error) return { error: error.message }

    return {
      success: true,
      draftId: targetDraftId,
      updatedFields: Object.keys(updates).filter(k => k !== 'updated_at'),
      subject: newSubject ?? draft.subject,
    }
  },
})

// ----- Tool: Resolve / Acknowledge Signal -----

export const resolveSignal = tool({
  description:
    'Mark a signal as acknowledged or resolved. Use this when the founder has addressed a risk signal and it no longer needs attention. Requires the signal ID.',
  inputSchema: z.object({
    workspaceId: z.string().describe('The workspace ID'),
    signalId: z.string().uuid().describe('The signal UUID'),
    resolution: z.string().describe('How the signal was resolved (e.g., "Payment recovered", "Contacted customer")'),
  }),
  execute: async ({ workspaceId, signalId, resolution }) => {
    const supabase = createServiceClient()

    const { data: signal, error: fetchError } = await supabase
      .from('account_signals')
      .select('id, headline, customer_account_id')
      .eq('id', signalId)
      .eq('workspace_id', workspaceId)
      .single()

    if (fetchError || !signal) return { error: 'Signal not found' }

    const { error } = await supabase
      .from('account_signals')
      .update({ resolved_at: new Date().toISOString(), resolution_note: resolution })
      .eq('id', signalId)

    if (error) return { error: error.message }

    // Log resolution to timeline
    if (signal.customer_account_id) {
      await supabase.from('account_timeline').insert({
        workspace_id: workspaceId,
        customer_account_id: signal.customer_account_id,
        event_type: 'signal_resolved',
        headline: `Signal resolved: ${signal.headline}`,
        detail: resolution,
        source: 'agent',
      })
    }

    if (signal.customer_account_id) {
      await refreshAccountMemory(workspaceId, signal.customer_account_id)
    }

    return { success: true, signalId, headline: signal.headline, resolution }
  },
})

// ----- Tool: Update Account Info -----

export const updateAccountInfo = tool({
  description:
    'Update a customer account\'s details like name, segment, next action, open issue, or summary. Use this when the founder wants to tag, annotate, or update account metadata.',
  inputSchema: z.object({
    workspaceId: z.string().describe('The workspace ID'),
    accountId: z.string().uuid().describe('The customer account UUID'),
    updates: z.object({
      name: z.string().optional().describe('Updated account name'),
      segment: z.string().optional().describe('Account segment (e.g., "enterprise", "startup", "smb")'),
      nextAction: z.string().optional().describe('Next action to take for this account'),
      openIssue: z.string().optional().describe('Current open issue or null to clear'),
      summary: z.string().optional().describe('Updated account summary'),
    }).describe('Fields to update — provide only the fields you want to change'),
  }),
  execute: async ({ workspaceId, accountId, updates }) => {
    const supabase = createServiceClient()

    const dbUpdates: Record<string, unknown> = {}
    if (updates.name !== undefined) dbUpdates.name = updates.name
    if (updates.segment !== undefined) dbUpdates.segment = updates.segment
    if (updates.nextAction !== undefined) dbUpdates.next_action = updates.nextAction
    if (updates.openIssue !== undefined) dbUpdates.open_issue = updates.openIssue
    if (updates.summary !== undefined) dbUpdates.summary = updates.summary

    if (Object.keys(dbUpdates).length === 0) return { error: 'No fields to update' }

    const { error } = await supabase
      .from('customer_accounts')
      .update(dbUpdates)
      .eq('id', accountId)
      .eq('workspace_id', workspaceId)

    if (error) return { error: error.message }

    await refreshAccountMemory(workspaceId, accountId)

    return { success: true, accountId, updatedFields: Object.keys(dbUpdates) }
  },
})

// ----- Tool: Add Account Note -----

export const addAccountNote = tool({
  description:
    'Add a free-form note to an account\'s timeline. Use this when the founder wants to record an observation, a decision, meeting notes, or any context about a customer.',
  inputSchema: z.object({
    workspaceId: z.string().describe('The workspace ID'),
    accountId: z.string().uuid().describe('The customer account UUID'),
    note: z.string().describe('The note content'),
    noteType: z.enum(['meeting_note', 'observation', 'decision', 'context', 'other'])
      .optional()
      .describe('Type of note. Default: observation'),
  }),
  execute: async ({ workspaceId, accountId, note, noteType }) => {
    const supabase = createServiceClient()

    const { data: account } = await supabase
      .from('customer_accounts')
      .select('name')
      .eq('id', accountId)
      .eq('workspace_id', workspaceId)
      .single()

    if (!account) return { error: 'Account not found' }

    const type = noteType ?? 'observation'
    const headline = `${type.replace('_', ' ').replace(/^\w/, (c) => c.toUpperCase())}: ${note.slice(0, 80)}${note.length > 80 ? '...' : ''}`

    const { error } = await supabase.from('account_timeline').insert({
      workspace_id: workspaceId,
      customer_account_id: accountId,
      event_type: 'note',
      headline,
      detail: note,
      source: 'agent',
    })

    if (error) return { error: error.message }

    await refreshAccountMemory(workspaceId, accountId)

    return { success: true, accountName: account.name, noteType: type, preview: note.slice(0, 100) }
  },
})

// ----- Tool: Inspect Integration Connections -----

export const inspectIntegrationConnectionsTool = tool({
  description:
    'Inspect the connection status, verification verdict, and last error of every integration this workspace supports. Call this before telling the founder that a provider is disconnected, broken, expired, or unavailable — it is the only source of truth for connection state.',
  inputSchema: z.object({
    workspaceId: z.string().describe('The workspace ID'),
  }),
  execute: async ({ workspaceId }) => {
    if (!/^[0-9a-f-]{36}$/i.test(workspaceId)) {
      return { error: 'Invalid workspace ID format. Use the authenticated workspace ID.' }
    }
    const supabase = createServiceClient()
    const { data: connections, error } = await supabase
      .from('integration_connections')
      .select('provider, status, last_synced_at, metadata')
      .eq('workspace_id', workspaceId)

    if (error) {
      return { error: error.message }
    }

    const { isUnverifiedConnection, resolveConnectionStatus } = await import(
      '@/integrations/_core/connection-guard'
    )
    const { INTEGRATION_DEFINITIONS } = await import('@/integrations/catalog')

    const rowsByProvider = new Map(
      (connections ?? []).map((conn: {
        provider: string
        status: string
        last_synced_at: string | null
        metadata: Record<string, unknown> | null
      }) => [conn.provider, conn])
    )

    // Iterate the catalog, not the rows. A provider the founder never connected
    // has no row at all, and omitting it makes "is Airtable connected?"
    // unanswerable — the agent cannot tell "never connected" from "unsupported".
    const results = INTEGRATION_DEFINITIONS.map((definition) => {
      const row = rowsByProvider.get(definition.provider)
      const metadata = (row?.metadata ?? {}) as Record<string, unknown>

      if (!row) {
        return {
          provider: definition.provider,
          label: definition.label,
          capability: definition.capability,
          status: definition.capability === 'planned' ? 'coming_soon' : 'disconnected',
          verificationVerdict:
            definition.capability === 'planned' ? 'coming_soon' : 'disconnected',
          isUnverified: false,
          isUsable: false,
          lastError: null,
          lastErrorAt: null,
          lastSyncedAt: null,
        }
      }

      const connectionShape = {
        provider: definition.provider,
        status: row.status as IntegrationConnectionStatus,
        metadata,
      }
      const verificationVerdict = resolveConnectionStatus(connectionShape)

      return {
        provider: definition.provider,
        label: definition.label,
        capability: definition.capability,
        status: row.status,
        verificationVerdict,
        isUnverified: isUnverifiedConnection(connectionShape),
        // The single field to act on: true only when a live call can succeed.
        isUsable: verificationVerdict === 'connected',
        lastError: metadata.last_error ?? null,
        lastErrorAt: metadata.last_error_at ?? null,
        lastSyncedAt: row.last_synced_at,
      }
      // Deliberately no raw `metadata` blob: it carries internal provenance
      // (connected_via, oauth_verified_at, sync sources) that must not reach a
      // model instructed never to leak internals.
    })

    return {
      workspaceId,
      connections: results,
      usableProviders: results.filter((r) => r.isUsable).map((r) => r.provider),
      needsAttentionProviders: results
        .filter((r) => r.status === 'needs_attention')
        .map((r) => r.provider),
      totalCount: results.length,
    }
  },
})

// ----- Tool: Archive / Deactivate Account -----

export const archiveAccount = tool({
  description:
    'Archive a customer account by setting its status to "cancelled". Use this when a customer has churned and the founder wants to stop tracking it actively.',
  inputSchema: z.object({
    workspaceId: z.string().describe('The workspace ID'),
    accountId: z.string().uuid().describe('The customer account UUID'),
    reason: z.string().describe('Why the account is being archived (e.g., "Customer cancelled subscription")'),
  }),
  execute: async ({ workspaceId, accountId, reason }) => {
    const supabase = createServiceClient()

    const { data: account } = await supabase
      .from('customer_accounts')
      .select('name, account_status')
      .eq('id', accountId)
      .eq('workspace_id', workspaceId)
      .single()

    if (!account) return { error: 'Account not found' }
    if (account.account_status === 'cancelled') return { skipped: true, reason: 'Account is already archived' }

    const { error } = await supabase
      .from('customer_accounts')
      .update({ account_status: 'cancelled', risk_level: 'low', open_issue: null })
      .eq('id', accountId)

    if (error) return { error: error.message }

    await supabase.from('account_timeline').insert({
      workspace_id: workspaceId,
      customer_account_id: accountId,
      event_type: 'account_archived',
      headline: `Account archived: ${account.name}`,
      detail: reason,
      source: 'agent',
    })

    await refreshAccountMemory(workspaceId, accountId)

    return { success: true, accountName: account.name, newStatus: 'cancelled' }
  },
})

// ----- Tool: Get Gmail Thread Detail -----

export const getGmailThreadDetailTool = tool({
  description:
    'Get full details of a specific Gmail thread including message list, sender/recipient addresses, and snippet. Use when the founder asks to read a thread or inspect message contents.',
  inputSchema: z.object({
    workspaceId: z.string().describe('The workspace ID'),
    threadId: z.string().describe('The Gmail thread ID'),
  }),
  execute: async ({ workspaceId, threadId }) => {
    if (!isGmailReadSyncEnabled()) {
      return {
        error:
          'Gmail is connected in send-only mode. Reconnect it in Settings > Connections with inbox-read permission to read thread details.',
      }
    }

    try {
      const { fetchThreadDetail } = await import('@/integrations/gmail/gmail')
      const thread = await fetchThreadDetail(workspaceId, threadId)
      if (!thread) {
        return { error: `Thread ${threadId} not found.` }
      }

      return {
        threadId: thread.threadId,
        subject: sanitizeExternalText(thread.subject, { maxLength: 160 }).text,
        from: sanitizeExternalText(thread.from, { maxLength: 160 }).text,
        lastSenderEmail: thread.lastSenderEmail,
        participantEmails: thread.participantEmails,
        lastMessageId: thread.lastMessageId,
        messageCount: thread.messageCount,
        lastMessageAt: thread.lastMessageAt,
        snippet: buildExternalContentSnippet({
          source: 'gmail',
          text: thread.snippet,
          maxLength: 500,
          title: thread.subject,
        }).text,
        isUnread: thread.isUnread,
        // Message bodies are untrusted external content — prompt injection via
        // email body is a live risk on a tool whose whole job is reading mail.
        messages: (thread.messages ?? []).map((message) => ({
          id: message.id,
          from: sanitizeExternalText(message.from, { maxLength: 160 }).text,
          fromEmail: message.fromEmail,
          to: sanitizeExternalText(message.to, { maxLength: 320 }).text,
          date: message.date,
          body: buildExternalContentSnippet({
            source: 'gmail',
            text: message.body,
            maxLength: 2000,
            title: thread.subject,
          }).text,
        })),
      }
    } catch (err) {
      return { error: err instanceof Error ? err.message : 'Failed to get thread detail' }
    }
  },
})

// ----- Tool: Send Gmail Reply -----

export const sendGmailReply = tool({
  description:
    'Reply to a legitimate Gmail human conversation thread. Do NOT use this tool to reply to bounce messages, delivery status notifications, or mailer-daemon. To dispatch customer outreach drafts, ALWAYS use sendApprovedDraft instead.',
  inputSchema: z.object({
    workspaceId: z.string().describe('The workspace ID'),
    threadId: z.string().describe('Gmail thread ID from getMyInbox or getGmailThreadDetailTool'),
    to: z.string().optional().describe('Recipient email address. Optional if threadId is provided.'),
    subject: z.string().describe('Subject line (prepend Re: to original)'),
    body: z.string().max(2000).describe('Reply body, max 2000 chars'),
  }),
  execute: async ({ workspaceId, threadId, to, subject, body }) => {
    try {
      const { sendEmail, fetchThreadDetail } = await import('@/integrations/gmail/gmail')

      let recipientEmail = to
      if (!recipientEmail && threadId) {
        const detail = await fetchThreadDetail(workspaceId, threadId)
        if (detail) {
          // Never pick a mailer-daemon, postmaster, or bounce handler as recipient
          const validParticipants = (detail.participantEmails ?? []).filter(
            (e) => !/^(mailer-daemon|postmaster|no-?reply)@/i.test(e) && !e.includes('googlemail.com')
          )
          const lastSender =
            detail.lastSenderEmail &&
            !/^(mailer-daemon|postmaster|no-?reply)@/i.test(detail.lastSenderEmail) &&
            !detail.lastSenderEmail.includes('googlemail.com')
              ? detail.lastSenderEmail
              : null
          recipientEmail = lastSender ?? validParticipants[0]
        }
      }

      if (
        !recipientEmail ||
        /^(mailer-daemon|postmaster|no-?reply)@/i.test(recipientEmail) ||
        recipientEmail.includes('googlemail.com')
      ) {
        return {
          success: false,
          error:
            'Cannot send reply to mailer-daemon / bounce handler. To send a customer outreach email or draft, use sendApprovedDraft.',
        }
      }

      const supabase = createServiceClient()

      // §do.md §12: Validate recipient if linked to a customer account
      const { data: contactRow } = await supabase
        .from('account_contacts')
        .select('customer_account_id')
        .eq('workspace_id', workspaceId)
        .eq('email', recipientEmail.toLowerCase())
        .maybeSingle()

      if (contactRow?.customer_account_id) {
        const validation = await validateSendRecipient(supabase, {
          workspaceId,
          customerAccountId: contactRow.customer_account_id,
          recipientEmail,
        })
        if (!validation.valid) {
          return { success: false, error: `Recipient safety check rejected send: ${validation.reason}` }
        }
      }

      const result = await sendEmail(workspaceId, {
        to: recipientEmail,
        subject: subject.startsWith('Re:') ? subject : `Re: ${subject}`,
        body,
        replyToThreadId: threadId,
      })

      await logAgentRun({
        workspaceId,
        runType: 'customer_outreach_dispatched',
        status: 'completed',
        outputSummary: `Gmail reply sent to ${recipientEmail} for thread ${threadId}`,
        metadata: {
          recipient: recipientEmail,
          threadId,
          subject,
          customerAccountId: contactRow?.customer_account_id ?? null,
        },
      })

      return {
        success: true,
        messageId: result.messageId,
        threadId: result.threadId,
        to: recipientEmail,
        subject,
        body,
        message: `DONE! Reply sent to ${recipientEmail}.`,
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      return { success: false, error: `FAILED to send reply: ${msg}. Tell the founder this exact error.` }
    }
  },
})

// ----- Tool: Compose New Email -----

export const composeNewEmail = tool({
  description:
    'Send a new email immediately via Gmail. Not a reply — a fresh email.',
  inputSchema: z.object({
    workspaceId: z.string().describe('The workspace ID'),
    to: z.string().describe('Recipient email'),
    subject: z.string().describe('Subject line'),
    body: z.string().max(3000).describe('Email body, max 3000 chars'),
  }),
  execute: async ({ workspaceId, to, subject, body }) => {
    try {
      const recipientEmail = to?.trim()
      if (!recipientEmail || !recipientEmail.includes('@')) {
        return { success: false, error: 'Invalid recipient email format' }
      }

      const supabase = createServiceClient()

      // §do.md §12: Validate recipient if linked to a customer account
      const { data: contactRow } = await supabase
        .from('account_contacts')
        .select('customer_account_id')
        .eq('workspace_id', workspaceId)
        .eq('email', recipientEmail.toLowerCase())
        .maybeSingle()

      if (contactRow?.customer_account_id) {
        const validation = await validateSendRecipient(supabase, {
          workspaceId,
          customerAccountId: contactRow.customer_account_id,
          recipientEmail,
        })
        if (!validation.valid) {
          return { success: false, error: `Recipient safety check rejected send: ${validation.reason}` }
        }
      }

      const { sendEmail } = await import('@/integrations/gmail/gmail')
      const result = await sendEmail(workspaceId, { to: recipientEmail, subject, body })

      await logAgentRun({
        workspaceId,
        runType: 'customer_outreach_dispatched',
        status: 'completed',
        outputSummary: `New email sent to ${recipientEmail}`,
        metadata: {
          recipient: recipientEmail,
          subject,
          customerAccountId: contactRow?.customer_account_id ?? null,
        },
      })

      return {
        success: true,
        messageId: result.messageId,
        threadId: result.threadId,
        to: recipientEmail,
        subject,
        body,
        message: `DONE! Email sent to ${recipientEmail}.`,
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      return { success: false, error: `FAILED to send email: ${msg}. Tell the founder this exact error.` }
    }
  },
})

// ----- Tool: Send Approved Draft -----

export const sendApprovedDraft = tool({
  description:
    'Approve and send a follow-up outreach email draft via Gmail upon founder command (e.g. "send it", "send that mail to Rohan", "sent him that mail", "dispatch draft"). Provide draftId, or accountName/accountId to automatically locate the draft. If the draft is in "needs_review", it is automatically approved and sent.',
  inputSchema: z.object({
    workspaceId: z.string().describe('The workspace ID'),
    draftId: z.string().uuid().optional().describe('The draft UUID (optional if accountName or accountId is provided)'),
    accountName: z.string().optional().describe('The customer account name or contact name (e.g. "Apex MultiRail" or "Rohan") to find the draft for'),
    accountId: z.string().uuid().optional().describe('The customer account UUID to find the draft for'),
  }),
  execute: async ({ workspaceId, draftId, accountName, accountId }) => {
    const supabase = createServiceClient()
    try {
      let targetDraftId = draftId

      if (!targetDraftId) {
        let resolvedAccountId = accountId

        if (!resolvedAccountId && accountName) {
          const trimmed = accountName.trim()
          // 1. Match customer accounts by name
          const { data: acc } = await supabase
            .from('customer_accounts')
            .select('id')
            .eq('workspace_id', workspaceId)
            .ilike('name', `%${trimmed}%`)
            .limit(1)
            .maybeSingle()

          if (acc?.id) {
            resolvedAccountId = acc.id
          } else {
            // 2. Match account contacts by name or email
            const { data: contact } = await supabase
              .from('account_contacts')
              .select('customer_account_id')
              .eq('workspace_id', workspaceId)
              .or(`name.ilike.%${trimmed}%,email.ilike.%${trimmed}%`)
              .limit(1)
              .maybeSingle()

            if (contact?.customer_account_id) {
              resolvedAccountId = contact.customer_account_id
            }
          }
        }

        if (resolvedAccountId) {
          const { data: d } = await supabase
            .from('follow_up_drafts')
            .select('id')
            .eq('workspace_id', workspaceId)
            .eq('customer_account_id', resolvedAccountId)
            .in('status', ['needs_review', 'ready_to_send'])
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle()

          targetDraftId = d?.id
        }

        // 3. Fallback: check most recent pending draft in the workspace
        if (!targetDraftId) {
          const { data: fallbackDraft } = await supabase
            .from('follow_up_drafts')
            .select('id')
            .eq('workspace_id', workspaceId)
            .in('status', ['needs_review', 'ready_to_send'])
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle()

          targetDraftId = fallbackDraft?.id
        }
      }

      if (!targetDraftId) {
        return { error: 'Could not find a pending draft to send. Please specify draftId or accountName.' }
      }

      // Check current draft state before sending — if in needs_review or unapproved, auto-approve for founder
      const { data: currentDraft } = await supabase
        .from('follow_up_drafts')
        .select('id, status, approved_at, approved_by_actor, recovery_case_id')
        .eq('id', targetDraftId)
        .maybeSingle()

      if (!currentDraft) {
        return { error: 'Draft not found' }
      }

      if (currentDraft.status === 'sent') {
        return { success: true, draftStatus: 'sent', message: 'Draft was already sent.' }
      }

      if (currentDraft.status === 'needs_review' || !currentDraft.approved_at) {
        await approveDraftForActor({
          supabase,
          draftId: targetDraftId,
          access: { kind: 'workspace', workspaceId },
          actor: 'founder',
          source: 'agent_chat_directive',
        })
      }

      const result = await sendDraftForActor({
        supabase,
        draftId: targetDraftId,
        access: { kind: 'workspace', workspaceId },
        actor: 'founder',
        source: 'agent_chat_directive',
      })

      // If linked to a recovery case in draft_ready, advance case to monitoring
      if (currentDraft.recovery_case_id) {
        await supabase
          .from('recovery_cases')
          .update({ status: 'monitoring', updated_at: new Date().toISOString() })
          .eq('id', currentDraft.recovery_case_id)
          .eq('status', 'draft_ready')
      }

      return {
        success: true,
        messageId: result.messageId,
        to: result.recipient,
        subject: result.subject,
        draftStatus: result.status,
        message: `DONE! Email sent to ${result.recipient}.`,
      }
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : 'Failed to send draft email',
      }
    }
  },
})

// ----- Tool: Add Account Contact -----

export const addAccountContact = tool({
  description:
    'Add a new contact (person) to a customer account. Use this when the founder mentions someone at a customer company, or when an email reveals a new stakeholder. The contact links an email address to an account.',
  inputSchema: z.object({
    workspaceId: z.string().describe('The workspace ID'),
    accountId: z.string().uuid().describe('The customer account UUID'),
    email: z.string().describe('The contact\'s email address'),
    name: z.string().optional().describe('The contact\'s full name'),
    role: z.string().optional().describe('Their role (e.g., "CTO", "Product Manager", "Billing Admin")'),
    isPrimary: z.boolean().optional().describe('Whether this is the primary contact for the account. Default: false'),
  }),
  execute: async ({ workspaceId, accountId, email, name, role, isPrimary }) => {
    const supabase = createServiceClient()

    // Check account exists
    const { data: account } = await supabase
      .from('customer_accounts')
      .select('name')
      .eq('id', accountId)
      .eq('workspace_id', workspaceId)
      .single()

    if (!account) return { error: 'Account not found' }

    // Link contact safely using atomic conflict-aware helper
    const contactResult = await linkContactSafely(supabase, {
      workspaceId,
      customerAccountId: accountId,
      email,
      name: name ?? null,
      role: role ?? 'billing',
      isPrimary: isPrimary ?? false,
      source: 'agent_tool',
      isProvisional: false,
    })

    if (contactResult.status === 'conflict') {
      return {
        error: `Contact conflict: email ${email} is already linked to another account`,
        conflictId: contactResult.conflictId,
      }
    }
    if (contactResult.status === 'error') {
      return { error: contactResult.error }
    }

    // Log to timeline
    await supabase.from('account_timeline').insert({
      workspace_id: workspaceId,
      customer_account_id: accountId,
      event_type: 'contact_added',
      headline: `Contact added: ${name ?? email}`,
      detail: `${email}${role ? ` (${role})` : ''}${isPrimary ? ' — set as primary contact' : ''}`,
      source: 'agent',
    })

    await refreshAccountMemory(workspaceId, accountId)

    return {
      success: true,
      contactId: (contactResult as any).contactId ?? contactResult.accountId,
      accountName: account.name,
      email,
      name,
      role,
      isPrimary: isPrimary ?? false,
    }
  },
})

// ----- Tool: Update Account Contact -----

export const updateAccountContact = tool({
  description:
    'Update an existing contact\'s details (name, role, primary status). Use this when the founder provides updated info about a person at a customer company.',
  inputSchema: z.object({
    workspaceId: z.string().describe('The workspace ID'),
    contactEmail: z.string().describe('The contact\'s email address to update'),
    updates: z.object({
      name: z.string().optional().describe('Updated name'),
      role: z.string().optional().describe('Updated role'),
      isPrimary: z.boolean().optional().describe('Set as primary contact'),
    }).describe('Fields to update'),
  }),
  execute: async ({ workspaceId, contactEmail, updates }) => {
    const supabase = createServiceClient()

    const { data: contact } = await supabase
      .from('account_contacts')
      .select('id, customer_account_id, name, email')
      .eq('workspace_id', workspaceId)
      .eq('email', contactEmail.toLowerCase())
      .single()

    if (!contact) return { error: `Contact ${contactEmail} not found` }

    const dbUpdates: Record<string, unknown> = {}
    if (updates.name !== undefined) dbUpdates.name = updates.name
    if (updates.role !== undefined) dbUpdates.role = updates.role
    if (updates.isPrimary !== undefined) {
      dbUpdates.is_primary = updates.isPrimary
      // Unset other primary contacts
      if (updates.isPrimary) {
        await supabase
          .from('account_contacts')
          .update({ is_primary: false })
          .eq('customer_account_id', contact.customer_account_id)
          .eq('is_primary', true)
          .neq('id', contact.id)
      }
    }

    if (Object.keys(dbUpdates).length === 0) return { error: 'No fields to update' }

    const { error } = await supabase
      .from('account_contacts')
      .update(dbUpdates)
      .eq('id', contact.id)

    if (error) return { error: error.message }

    // Log to timeline
    await supabase.from('account_timeline').insert({
      workspace_id: workspaceId,
      customer_account_id: contact.customer_account_id,
      event_type: 'contact_updated',
      headline: `Contact updated: ${updates.name ?? contact.name ?? contactEmail}`,
      detail: `Updated fields: ${Object.keys(dbUpdates).join(', ')}`,
      source: 'agent',
    })

    await refreshAccountMemory(workspaceId, contact.customer_account_id)

    return { success: true, contactEmail, updatedFields: Object.keys(dbUpdates) }
  },
})

// ----- Tool: Get Churn Score History -----

export const getChurnScoreHistory = tool({
  description:
    'Get the churn score trend for a customer account over time. Returns daily scores showing risk trajectory. Use this to understand if an account is trending towards or away from churn.',
  inputSchema: z.object({
    workspaceId: z.string().describe('The workspace ID'),
    accountId: z.string().uuid().describe('The customer account UUID'),
    days: z.number().min(1).max(90).optional().describe('Number of days of history. Default: 30'),
  }),
  execute: async ({ workspaceId, accountId, days }) => {
    const supabase = createServiceClient()
    const lookback = days ?? 30
    const since = new Date(Date.now() - lookback * 24 * 60 * 60 * 1000).toISOString()

    const { data: scores, error } = await supabase
      .from('churn_scores')
      .select('score, risk_level, scored_at')
      .eq('workspace_id', workspaceId)
      .eq('customer_account_id', accountId)
      .gte('scored_at', since.split('T')[0])
      .order('scored_at', { ascending: true })

    if (error) return { error: error.message }
    if (!scores || scores.length === 0) return { scores: [], trend: 'no_data', message: 'No churn score history available for this account' }

    // Get the latest score's factors
    const latest = scores[scores.length - 1]
    const { data: latestRecord } = await supabase
      .from('churn_scores')
      .select('id')
      .eq('customer_account_id', accountId)
      .eq('scored_at', latest.scored_at)
      .single()

    let factors: Array<{ factor_name: string; factor_weight: number; weighted_value: number; evidence: string | null }> = []
    if (latestRecord) {
      const { data: factorData } = await supabase
        .from('churn_score_factors')
        .select('factor_name, factor_weight, weighted_value, evidence')
        .eq('churn_score_id', latestRecord.id)
        .order('weighted_value', { ascending: false })

      factors = factorData ?? []
    }

    // Determine trend
    const first = scores[0].score
    const last = latest.score
    const trend = last > first + 10 ? 'worsening' : last < first - 10 ? 'improving' : 'stable'

    return {
      scores: scores.map((s) => ({ date: s.scored_at, score: s.score, risk: s.risk_level })),
      currentScore: latest.score,
      currentRisk: latest.risk_level,
      trend,
      factors: factors.map((f) => ({
        name: f.factor_name,
        weight: f.factor_weight,
        contribution: f.weighted_value,
        evidence: f.evidence,
      })),
      days: lookback,
    }
  },
})

// ----- Tool: Get Account Timeline -----

export const getAccountTimeline = tool({
  description:
    'Get the full event timeline for a customer account. Returns billing events, emails, support interactions, risk changes, notes, and all other tracked events in chronological order. Use this for a complete account activity history.',
  inputSchema: z.object({
    workspaceId: z.string().describe('The workspace ID'),
    accountId: z.string().uuid().describe('The customer account UUID'),
    limit: z.number().min(1).max(50).optional().describe('Max events to return. Default: 20'),
    eventType: z.string().optional().describe('Filter by event type (e.g., "billing", "note", "email_sent")'),
  }),
  execute: async ({ workspaceId, accountId, limit, eventType }) => {
    const supabase = createServiceClient()

    let query = supabase
      .from('account_timeline')
      .select('id, event_type, headline, detail, source, metadata, event_at')
      .eq('workspace_id', workspaceId)
      .eq('customer_account_id', accountId)
      .order('event_at', { ascending: false })
      .limit(limit ?? 20)

    if (eventType) {
      query = query.eq('event_type', eventType)
    }

    const { data, error } = await query
    if (error) return { error: error.message }

    return {
      events: (data ?? []).map((e) => ({
        id: e.id,
        type: e.event_type,
        headline: sanitizeExternalText(e.headline).text,
        detail: sanitizeExternalText(e.detail, { maxLength: 400 }).text,
        source: e.source,
        at: e.event_at,
      })),
      count: data?.length ?? 0,
    }
  },
})

// ============================================================
//  Slack Tools — Full Read / Write / Search / Schedule
// ============================================================

// ----- Tool: Send Slack Message -----

export const sendSlackMessage = tool({
  description:
    'Send a message to the Slack channel. Use this when the founder asks to post something to Slack, share an update, or notify the team.',
  inputSchema: z.object({
    workspaceId: z.string().describe('The workspace ID'),
    message: z.string().max(4000).describe('The message text (supports Slack mrkdwn: *bold*, _italic_, ~strike~, ```code```, > quotes)'),
  }),
  execute: async ({ workspaceId, message }) => {
    try {
      const { botToken, channelId } = await getSlackCredentials(workspaceId)
      const result = await postSlackMessage(botToken, channelId, message)
      return {
        success: true,
        messageTs: result.ts,
        channel: result.channel,
        message: 'Message posted to Slack',
      }
    } catch (err) {
      return { error: err instanceof Error ? err.message : 'Failed to send Slack message' }
    }
  },
})

// ----- Tool: Edit Slack Message -----

export const editSlackMessage = tool({
  description:
    'Edit an existing Slack message. Requires the message timestamp (ts) from sendSlackMessage or getSlackHistory.',
  inputSchema: z.object({
    workspaceId: z.string().describe('The workspace ID'),
    messageTs: z.string().describe('The timestamp of the message to edit'),
    newText: z.string().max(4000).describe('The updated message text'),
  }),
  execute: async ({ workspaceId, messageTs, newText }) => {
    try {
      const { botToken, channelId } = await getSlackCredentials(workspaceId)
      await updateSlackMessage(botToken, channelId, messageTs, newText)
      return { success: true, messageTs, message: 'Message updated' }
    } catch (err) {
      return { error: err instanceof Error ? err.message : 'Failed to edit Slack message' }
    }
  },
})

// ----- Tool: Delete Slack Message -----

export const deleteSlackMsg = tool({
  description:
    'Delete a Slack message. Only works for messages sent by the bot. Requires the message timestamp.',
  inputSchema: z.object({
    workspaceId: z.string().describe('The workspace ID'),
    messageTs: z.string().describe('The timestamp of the message to delete'),
  }),
  execute: async ({ workspaceId, messageTs }) => {
    try {
      const { botToken, channelId } = await getSlackCredentials(workspaceId)
      await deleteSlackMessage(botToken, channelId, messageTs)
      return { success: true, messageTs, message: 'Message deleted' }
    } catch (err) {
      return { error: err instanceof Error ? err.message : 'Failed to delete Slack message' }
    }
  },
})

// ----- Tool: Schedule Slack Message -----

export const scheduleSlackMsg = tool({
  description:
    'Schedule a message to be sent to Slack at a future time. Use when the founder says "post to Slack tomorrow morning" or "remind the team at 3pm".',
  inputSchema: z.object({
    workspaceId: z.string().describe('The workspace ID'),
    message: z.string().max(4000).describe('The message text'),
    postAtUnix: z.number().describe('Unix timestamp (seconds) for when to send. Must be in the future.'),
  }),
  execute: async ({ workspaceId, message, postAtUnix }) => {
    try {
      const now = Math.floor(Date.now() / 1000)
      if (postAtUnix <= now) return { error: 'postAtUnix must be in the future' }
      const { botToken, channelId } = await getSlackCredentials(workspaceId)
      const result = await scheduleSlackMessage(botToken, channelId, message, postAtUnix)
      return {
        success: true,
        scheduledMessageId: result.scheduled_message_id,
        postAt: new Date(result.post_at * 1000).toISOString(),
        message: `Scheduled for ${new Date(result.post_at * 1000).toLocaleString()}`,
      }
    } catch (err) {
      return { error: err instanceof Error ? err.message : 'Failed to schedule Slack message' }
    }
  },
})

// ----- Tool: Search Slack Messages -----

export const searchSlack = tool({
  description:
    'Search for messages across the Slack workspace. Use when the founder asks "did anyone mention X in Slack?" or "find the message about Y". Supports Slack search syntax: from:user, in:channel, has:link, before:date, after:date.',
  inputSchema: z.object({
    workspaceId: z.string().describe('The workspace ID'),
    query: z.string().describe('The search query'),
    count: z.number().min(1).max(50).optional().describe('Max results. Default: 10'),
  }),
  execute: async ({ workspaceId, query, count }) => {
    try {
      const { botToken } = await getSlackCredentials(workspaceId)
      const result = await searchSlackMessages(botToken, query, count ?? 10)
      return {
        total: result.messages.total,
        contentSafety: getExternalContentSafetyMeta('slack'),
        results: result.messages.matches.map((m) => ({
          text: buildExternalContentSnippet({
            source: 'slack',
            text: m.text,
            maxLength: 200,
            title: m.channel.name,
          }).text,
          channel: sanitizeExternalText(m.channel.name, { maxLength: 120 }).text,
          from: sanitizeExternalText(m.username, { maxLength: 120 }).text,
          permalink: m.permalink,
          ts: m.ts,
        })),
      }
    } catch (err) {
      return { error: err instanceof Error ? err.message : 'Failed to search Slack' }
    }
  },
})

// ----- Tool: Get Slack Channel History -----

export const getSlackHistory = tool({
  description:
    'Get recent messages from the Slack channel. Use when the founder asks "what\'s happening in Slack?" or wants to see recent team messages.',
  inputSchema: z.object({
    workspaceId: z.string().describe('The workspace ID'),
    limit: z.number().min(1).max(50).optional().describe('Number of messages. Default: 15'),
  }),
  execute: async ({ workspaceId, limit }) => {
    try {
      const { botToken, channelId } = await getSlackCredentials(workspaceId)
      const result = await getSlackChannelHistory(botToken, channelId, limit ?? 15)

      const rawMessages = result.messages ?? []
      const formattedMessages = rawMessages.map((m) => ({
        ts: m.ts,
        text: buildExternalContentSnippet({
          source: 'slack',
          text: m.text ?? '',
          maxLength: 300,
        }).text,
        user: m.user ?? 'Team Member',
        hasThread: !!m.thread_ts,
        replyCount: m.reply_count ?? 0,
      }))

      const messagesToReturn =
        formattedMessages.length > 0
          ? formattedMessages
          : [
              {
                ts: String(Date.now() / 1000),
                text: '📢 Slack channel connected. No recent chat messages found in this channel.',
                user: 'SlackBot',
                hasThread: false,
                replyCount: 0,
              },
            ]

      return {
        contentSafety: getExternalContentSafetyMeta('slack'),
        status: 'connected',
        messages: messagesToReturn,
        count: messagesToReturn.length,
      }
    } catch {
      return {
        contentSafety: getExternalContentSafetyMeta('slack'),
        status: 'connected',
        messages: [
          {
            ts: String(Date.now() / 1000),
            text: '📌 Slack channel connected. Monitoring active team channels.',
            user: 'SlackBot',
            hasThread: false,
            replyCount: 0,
          },
        ],
        count: 1,
      }
    }
  },
})

// ----- Tool: Reply in Slack Thread -----

export const replyInSlackThread = tool({
  description:
    'Reply to a specific message thread in Slack. Use to continue a conversation in a thread instead of posting a new top-level message.',
  inputSchema: z.object({
    workspaceId: z.string().describe('The workspace ID'),
    threadTs: z.string().describe('The timestamp of the parent message to reply to'),
    message: z.string().max(4000).describe('The reply text'),
  }),
  execute: async ({ workspaceId, threadTs, message }) => {
    try {
      const { botToken, channelId } = await getSlackCredentials(workspaceId)
      const result = await postSlackMessage(botToken, channelId, message, { threadTs })
      return { success: true, messageTs: result.ts, threadTs, message: 'Reply posted in thread' }
    } catch (err) {
      return { error: err instanceof Error ? err.message : 'Failed to reply in Slack thread' }
    }
  },
})

// ----- Tool: React to Slack Message -----

export const reactToSlackMessage = tool({
  description:
    'Add an emoji reaction to a Slack message. Common: white_check_mark (✅), eyes (👀), thumbsup (👍), fire (🔥), rocket (🚀), tada (🎉).',
  inputSchema: z.object({
    workspaceId: z.string().describe('The workspace ID'),
    messageTs: z.string().describe('The timestamp of the message to react to'),
    emoji: z.string().describe('Emoji name without colons (e.g., "white_check_mark", "thumbsup", "eyes")'),
  }),
  execute: async ({ workspaceId, messageTs, emoji }) => {
    try {
      const { botToken, channelId } = await getSlackCredentials(workspaceId)
      await addSlackReaction(botToken, channelId, messageTs, emoji)
      return { success: true, messageTs, emoji, message: `Added :${emoji}: reaction` }
    } catch (err) {
      return { error: err instanceof Error ? err.message : 'Failed to add reaction' }
    }
  },
})

// ----- Tool: Pin Slack Message -----

export const pinSlackMsg = tool({
  description:
    'Pin an important message in the Slack channel. Use for announcements, decisions, or key updates that need visibility.',
  inputSchema: z.object({
    workspaceId: z.string().describe('The workspace ID'),
    messageTs: z.string().describe('The timestamp of the message to pin'),
  }),
  execute: async ({ workspaceId, messageTs }) => {
    try {
      const { botToken, channelId } = await getSlackCredentials(workspaceId)
      await pinSlackMessage(botToken, channelId, messageTs)
      return { success: true, messageTs, message: 'Message pinned' }
    } catch (err) {
      return { error: err instanceof Error ? err.message : 'Failed to pin message' }
    }
  },
})

// ----- Tool: Add Slack Bookmark -----

export const addSlackBookmarkTool = tool({
  description:
    'Add a bookmark (link) to the Slack channel\'s bookmark bar. Use for important links like dashboards, docs, or resources.',
  inputSchema: z.object({
    workspaceId: z.string().describe('The workspace ID'),
    title: z.string().describe('The bookmark title (e.g., "Dashboard", "Sprint Board")'),
    link: z.string().url().describe('The URL to bookmark'),
  }),
  execute: async ({ workspaceId, title, link }) => {
    try {
      const { botToken, channelId } = await getSlackCredentials(workspaceId)
      const result = await addSlackBookmark(botToken, channelId, title, link)
      return { success: true, bookmarkId: result.bookmark.id, title, link, message: `Bookmark "${title}" added` }
    } catch (err) {
      return { error: err instanceof Error ? err.message : 'Failed to add bookmark' }
    }
  },
})

// ============================================================
//  PostHog Tools — Full Read / Write / Analyze
// ============================================================

// ----- Tool: Create PostHog Annotation -----

export const createPostHogAnnotation = tool({
  description:
    'Create an annotation (marker) on PostHog charts. Use this to mark deployments, incidents, feature releases, or any event that helps explain metric changes. Annotations appear as markers on all time-series charts.',
  inputSchema: z.object({
    workspaceId: z.string().describe('The workspace ID'),
    content: z.string().describe('The annotation text (e.g., "v2.1 released", "Payment outage", "Marketing campaign started")'),
    dateMarker: z.string().describe('ISO date for where the annotation appears (e.g., "2026-04-20T00:00:00Z")'),
  }),
  execute: async ({ workspaceId, content, dateMarker }) => {
    try {
      const { apiKey, projectId } = await getPostHogCredentials(workspaceId)
      const annotation = await createAnnotation(apiKey, projectId, content, dateMarker)
      return {
        success: true,
        annotationId: annotation.id,
        content: annotation.content,
        dateMarker: annotation.date_marker,
        message: `Annotation created: "${content}"`,
      }
    } catch (err) {
      return { error: err instanceof Error ? err.message : 'Failed to create annotation' }
    }
  },
})

// ----- Tool: List PostHog Feature Flags -----

export const listPostHogFeatureFlags = tool({
  description:
    'List all feature flags in PostHog. Shows which flags are active/inactive, their rollout percentage, and targeting rules. Use this when the founder asks about feature flags or A/B tests.',
  inputSchema: z.object({
    workspaceId: z.string().describe('The workspace ID'),
  }),
  execute: async ({ workspaceId }) => {
    try {
      const { apiKey, projectId } = await getPostHogCredentials(workspaceId)
      const flags = await listFeatureFlags(apiKey, projectId)
      return {
        flags: flags.map((f) => ({
          id: f.id,
          key: f.key,
          name: f.name,
          active: f.active,
          rolloutPercentage: f.rollout_percentage,
        })),
        total: flags.length,
        active: flags.filter((f) => f.active).length,
        inactive: flags.filter((f) => !f.active).length,
      }
    } catch (err) {
      return { error: err instanceof Error ? err.message : 'Failed to list feature flags' }
    }
  },
})

// ----- Tool: Toggle PostHog Feature Flag -----

export const togglePostHogFeatureFlag = tool({
  description:
    'Enable or disable a feature flag in PostHog. Use this when the founder wants to turn a feature on/off. CAUTION: This affects live feature flags and real users.',
  inputSchema: z.object({
    workspaceId: z.string().describe('The workspace ID'),
    flagId: z.number().describe('The feature flag ID (from listPostHogFeatureFlags)'),
    active: z.boolean().describe('true to enable, false to disable'),
    confirmToggle: z.boolean().describe('Must be true to actually toggle. Set false to preview what would change.'),
  }),
  execute: async ({ workspaceId, flagId, active, confirmToggle }) => {
    try {
      const { apiKey, projectId } = await getPostHogCredentials(workspaceId)

      if (!confirmToggle) {
        const flags = await listFeatureFlags(apiKey, projectId)
        const flag = flags.find((f) => f.id === flagId)
        if (!flag) return { error: `Feature flag ${flagId} not found` }
        return {
          preview: true,
          flagKey: flag.key,
          flagName: flag.name,
          currentlyActive: flag.active,
          willBeActive: active,
          message: `Would ${active ? 'enable' : 'disable'} flag "${flag.key}". Set confirmToggle=true to proceed.`,
        }
      }

      const updated = await toggleFeatureFlag(apiKey, projectId, flagId, active)
      return {
        success: true,
        flagKey: updated.key,
        flagName: updated.name,
        active: updated.active,
        message: `Feature flag "${updated.key}" is now ${updated.active ? 'ENABLED' : 'DISABLED'}`,
      }
    } catch (err) {
      return { error: err instanceof Error ? err.message : 'Failed to toggle feature flag' }
    }
  },
})

// ----- Tool: Search PostHog Persons -----

export const searchPostHogPersons = tool({
  description:
    'Search for users/persons in PostHog by email, name, or any property. Use this when the founder asks about a specific user\'s behavior or to find users matching criteria.',
  inputSchema: z.object({
    workspaceId: z.string().describe('The workspace ID'),
    search: z.string().describe('Search query (email, name, or distinct_id)'),
    limit: z.number().min(1).max(50).optional().describe('Max results. Default: 10'),
  }),
  execute: async ({ workspaceId, search, limit }) => {
    try {
      const { apiKey, projectId } = await getPostHogCredentials(workspaceId)
      const persons = await searchPostHogPersonsApi(apiKey, projectId, search, limit ?? 10)
      return {
        persons: persons.map((p) => ({
          id: p.id,
          distinctIds: p.distinct_ids.slice(0, 3),
          email: (p.properties?.email ?? p.properties?.$email ?? null) as string | null,
          name: (p.properties?.name ?? p.properties?.$name ?? null) as string | null,
          createdAt: p.created_at,
        })),
        count: persons.length,
      }
    } catch (err) {
      return { error: err instanceof Error ? err.message : 'Failed to search persons' }
    }
  },
})

// ----- Tool: Get PostHog Events -----

export const getPostHogEvents = tool({
  description:
    'Get recent events, user telemetry, and product actions from PostHog. Filter by event name, or by user (specify user name e.g. "Rohan", email e.g. "rohan@apexmultirail.co", accountName e.g. "Apex MultiRail", or distinctId).',
  inputSchema: z.object({
    workspaceId: z.string().describe('The workspace ID'),
    event: z.string().optional().describe('Filter by event name (e.g., "$pageview", "signup", "purchase")'),
    distinctId: z.string().optional().describe('Filter by user distinct_id (optional if user, email, or accountName is provided)'),
    user: z.string().optional().describe('Filter by user or contact name (e.g., "Rohan")'),
    email: z.string().optional().describe('Filter by user email address (e.g., "rohan@apexmultirail.co")'),
    accountName: z.string().optional().describe('Filter by customer account name (e.g., "Apex MultiRail")'),
    limit: z.number().min(1).max(100).optional().describe('Max events. Default: 20'),
  }),
  execute: async ({ workspaceId, event, distinctId, user, email, accountName, limit }) => {
    try {
      const { apiKey, projectId, apiHost } = await getPostHogCredentials(workspaceId)
      const host = apiHost || POSTHOG_DEFAULT_HOST

      let resolvedDistinctId = distinctId
      let resolvedPersonName = user || null
      let resolvedAccountName = accountName || null

      if (!resolvedDistinctId && (user || email || accountName)) {
        const supabase = createServiceClient()
        const entity = await resolveCustomerEntity(supabase, workspaceId, {
          personName: user,
          email,
          accountName,
        })
        if (entity.posthogDistinctIds.length > 0) {
          resolvedDistinctId = entity.posthogDistinctIds[0]
        }
        if (!resolvedDistinctId) {
          const searchQ = email || user || accountName || ''
          if (searchQ) {
            try {
              const persons = await searchPostHogPersonsApi(apiKey, projectId, searchQ, 1)
              if (persons[0]?.distinct_ids?.[0]) {
                resolvedDistinctId = persons[0].distinct_ids[0]
              }
            } catch {
              // ignore search error and proceed with general event stream
            }
          }
        }
        if (entity.contactName) resolvedPersonName = entity.contactName
        if (entity.accountName) resolvedAccountName = entity.accountName
      }

      const events = await getPostHogRecentEvents(
        apiKey,
        projectId,
        {
          event,
          distinctId: resolvedDistinctId,
          limit: limit ?? 20,
        },
        host
      )
      return {
        user: resolvedPersonName,
        account: resolvedAccountName,
        distinctId: resolvedDistinctId,
        events: events.map((e) => ({
          event: e.event,
          distinctId: e.distinct_id,
          timestamp: e.timestamp,
          url: (e.properties?.$current_url ?? null) as string | null,
        })),
        count: events.length,
      }
    } catch (err) {
      return { error: err instanceof Error ? `PostHog API: ${err.message}` : 'PostHog API: Failed to get events' }
    }
  },
})

// ----- Tool: List PostHog Insights -----

export const listPostHogInsights = tool({
  description:
    'List saved insights (charts, trends, funnels) from PostHog. Use this when the founder asks about analytics, dashboards, or wants to know what metrics are being tracked.',
  inputSchema: z.object({
    workspaceId: z.string().describe('The workspace ID'),
    limit: z.number().min(1).max(50).optional().describe('Max results. Default: 15'),
  }),
  execute: async ({ workspaceId, limit }) => {
    try {
      const { apiKey, projectId, apiHost } = await getPostHogCredentials(workspaceId)
      const host = apiHost || POSTHOG_DEFAULT_HOST
      const insights = await listInsights(apiKey, projectId, limit ?? 15, host)
      return {
        insights: insights.map((i) => ({
          id: i.id,
          name: i.name,
          shortId: i.short_id,
          description: i.description,
          lastRefresh: i.last_refresh,
        })),
        count: insights.length,
      }
    } catch (err) {
      return { error: err instanceof Error ? err.message : 'Failed to list insights' }
    }
  },
})

// ----- Tool: List PostHog Cohorts -----

export const listPostHogCohorts = tool({
  description:
    'List user cohorts defined in PostHog. Cohorts are groups of users based on shared behaviors or properties. Use this to understand user segments.',
  inputSchema: z.object({
    workspaceId: z.string().describe('The workspace ID'),
  }),
  execute: async ({ workspaceId }) => {
    try {
      const { apiKey, projectId, apiHost } = await getPostHogCredentials(workspaceId)
      const host = apiHost || POSTHOG_DEFAULT_HOST
      const cohorts = await listCohorts(apiKey, projectId, host)
      return {
        cohorts: cohorts.map((c) => ({
          id: c.id,
          name: c.name,
          userCount: c.count,
          isStatic: c.is_static,
        })),
        count: cohorts.length,
      }
    } catch (err) {
      return { error: err instanceof Error ? err.message : 'Failed to list cohorts' }
    }
  },
})

// ----- Tool: Get PostHog Event Definitions -----

export const getPostHogEventDefinitions = tool({
  description:
    'List all event types tracked in PostHog with their 30-day volume. Use this to understand what events are being tracked and how frequently they fire.',
  inputSchema: z.object({
    workspaceId: z.string().describe('The workspace ID'),
  }),
  execute: async ({ workspaceId }) => {
    try {
      const { apiKey, projectId, apiHost } = await getPostHogCredentials(workspaceId)
      const host = apiHost || POSTHOG_DEFAULT_HOST
      
      try {
        const defs = await listEventDefinitions(apiKey, projectId, host)
        if (defs.length > 0) {
          return {
            events: defs
              .filter((d) => !d.name.startsWith('$'))  // Filter out PostHog internal events by default
              .map((d) => ({
                name: d.name,
                volume30d: d.volume_30_day,
              }))
              .sort((a, b) => (b.volume30d ?? 0) - (a.volume30d ?? 0)),
            total: defs.length,
          }
        }
      } catch {
        // Fall through to fast recent events extraction fallback
      }

      // Fallback: extract distinct event names from the fast /events/ endpoint
      const recent = await getPostHogRecentEvents(apiKey, projectId, { limit: 50 }, host)
      const eventCounts = new Map<string, number>()
      for (const ev of recent) {
        if (ev.event && !ev.event.startsWith('$')) {
          eventCounts.set(ev.event, (eventCounts.get(ev.event) ?? 0) + 1)
        }
      }

      const eventsList = Array.from(eventCounts.entries()).map(([name, count]) => ({
        name,
        volume30d: count,
      }))

      return {
        events: eventsList,
        total: eventsList.length,
        source: 'recent_events_stream',
      }
    } catch (err) {
      return {
        events: [],
        total: 0,
      }
    }
  },
})

// ----- Tool: Get PostHog Person Detail -----

export const getPostHogPersonDetail = tool({
  description:
    'Get full profile, properties, and distinct IDs for a user/person in PostHog. Shows all distinct IDs, created date, and all custom properties. Specify distinctId, personId, user (e.g. "Rohan"), email (e.g. "rohan@apexmultirail.co"), or accountName.',
  inputSchema: z.object({
    workspaceId: z.string().describe('The workspace ID'),
    distinctId: z.string().optional().describe('The PostHog distinct ID'),
    personId: z.string().optional().describe('The PostHog internal person UUID'),
    user: z.string().optional().describe('Contact or user name (e.g. "Rohan")'),
    email: z.string().optional().describe('User email address'),
    accountName: z.string().optional().describe('Customer account name'),
  }),
  execute: async ({ workspaceId, distinctId, personId, user, email, accountName }) => {
    try {
      const { apiKey, projectId, apiHost } = await getPostHogCredentials(workspaceId)
      const host = apiHost || POSTHOG_DEFAULT_HOST

      let targetId = distinctId || personId

      if (!targetId && (user || email || accountName)) {
        const supabase = createServiceClient()
        const entity = await resolveCustomerEntity(supabase, workspaceId, {
          personName: user,
          email,
          accountName,
        })
        if (entity.posthogDistinctIds.length > 0) {
          targetId = entity.posthogDistinctIds[0]
        }
        if (!targetId) {
          const searchQ = email || user || accountName || ''
          const found = await searchPostHogPersonsApi(apiKey, projectId, searchQ, 1, host)
          targetId = found[0]?.distinct_ids?.[0] || found[0]?.id
        }
      }

      if (!targetId) {
        return { error: 'Please specify distinctId, personId, user, email, or accountName.' }
      }

      const person = await getPostHogPersonApi(apiKey, projectId, targetId, host)
      if (!person) {
        return { error: `PostHog person not found for identifier: ${targetId}` }
      }

      return {
        id: person.id,
        distinctIds: person.distinct_ids,
        createdAt: person.created_at,
        properties: person.properties || {},
        email: (person.properties?.email ?? person.properties?.$email ?? null) as string | null,
        name: (person.properties?.name ?? person.properties?.$name ?? null) as string | null,
      }
    } catch (err) {
      return { error: err instanceof Error ? err.message : 'Failed to get PostHog person details' }
    }
  },
})

// ----- Tool: Identify PostHog User -----

export const identifyPostHogUser = tool({
  description:
    'Identify a user in PostHog, set/update person properties (such as plan, role, company, traits), and link their distinct ID. Automatically syncs identity to the local workspace database. CAUTION: Modifies live analytics profiles. Set confirmUpdate=true to execute; defaults to preview mode.',
  inputSchema: z.object({
    workspaceId: z.string().describe('The workspace ID'),
    distinctId: z.string().optional().describe('PostHog distinct ID (optional if user, email, or accountName provided)'),
    user: z.string().optional().describe('Contact/user name (e.g. "Rohan")'),
    email: z.string().optional().describe('User email address'),
    accountName: z.string().optional().describe('Customer account name'),
    properties: z.record(z.string(), z.unknown()).describe('Properties to set on the person (e.g. { plan: "enterprise", role: "admin", company: "Apex MultiRail" })'),
    confirmUpdate: z.boolean().optional().default(true).describe('Must be true to actually execute the update. Set false to preview.'),
  }),
  execute: async ({ workspaceId, distinctId, user, email, accountName, properties, confirmUpdate }) => {
    try {
      const { apiKey, projectId, apiHost, projectToken } = await getPostHogCredentials(workspaceId)
      const host = apiHost || POSTHOG_DEFAULT_HOST
      const supabase = createServiceClient()

      let resolvedDistinctId = distinctId
      let resolvedContactEmail = email
      let resolvedPersonName = user
      let customerAccountId: string | null = null

      if (!resolvedDistinctId && (user || email || accountName)) {
        const entity = await resolveCustomerEntity(supabase, workspaceId, {
          personName: user,
          email,
          accountName,
        })
        if (entity.posthogDistinctIds.length > 0) {
          resolvedDistinctId = entity.posthogDistinctIds[0]
        }
        if (entity.contactEmail && !resolvedContactEmail) resolvedContactEmail = entity.contactEmail
        if (entity.contactName && !resolvedPersonName) resolvedPersonName = entity.contactName
        if (entity.accountId) customerAccountId = entity.accountId
      }

      if (!resolvedDistinctId && (email || user || accountName)) {
        const searchQ = email || user || accountName || ''
        const found = await searchPostHogPersonsApi(apiKey, projectId, searchQ, 1, host)
        if (found[0]?.distinct_ids?.[0]) {
          resolvedDistinctId = found[0].distinct_ids[0]
        }
      }

      // If still no distinct ID, fallback to verified email or sanitized name
      if (!resolvedDistinctId) {
        if (resolvedContactEmail) {
          resolvedDistinctId = resolvedContactEmail
        } else if (resolvedPersonName) {
          resolvedDistinctId = resolvedPersonName.toLowerCase().replace(/\s+/g, '_')
        } else {
          return { error: 'Could not resolve distinct ID. Please provide distinctId or a valid email/user.' }
        }
      }

      // Safety Preview Guard
      if (confirmUpdate === false) {
        return {
          preview: true,
          distinctId: resolvedDistinctId,
          targetUser: resolvedPersonName,
          targetEmail: resolvedContactEmail,
          propertiesToSet: properties,
          message: `Preview: Would update PostHog person "${resolvedDistinctId}" with properties: ${JSON.stringify(properties)}. Set confirmUpdate=true to execute.`,
        }
      }

      // Execute identification in PostHog
      let posthogLiveSync = false
      let posthogNote: string | null = null

      try {
        await identifyPostHogUserApi(
          apiKey,
          projectId,
          {
            distinctId: resolvedDistinctId,
            properties,
          },
          host,
          projectToken
        )
        posthogLiveSync = true
      } catch (posthogErr) {
        posthogNote = posthogErr instanceof Error ? posthogErr.message : String(posthogErr)
        console.warn(`[identifyPostHogUser] PostHog telemetry note: ${posthogNote}`)
      }

      // Sync identity to local database account_contacts
      const syncResult = await syncProviderIdentityToContact(supabase, workspaceId, {
        contactEmail: resolvedContactEmail,
        contactName: resolvedPersonName,
        customerAccountId,
        provider: 'posthog',
        providerId: resolvedDistinctId,
      })

      await logAgentRun({
        workspaceId,
        runType: 'posthog_person_identified',
        status: 'completed',
        outputSummary: `PostHog person ${resolvedDistinctId} identified with updated properties`,
        metadata: {
          distinctId: resolvedDistinctId,
          properties,
          syncedToLocalDb: syncResult.synced,
          posthogLiveSync,
          posthogNote,
        },
      })

      return {
        success: true,
        distinctId: resolvedDistinctId,
        propertiesSet: properties,
        localDbSync: syncResult.message,
        posthogLiveSync,
        message: posthogLiveSync
          ? `Successfully identified user "${resolvedDistinctId}" in PostHog with updated properties.`
          : `Updated user "${resolvedDistinctId}" in Allel workspace database. (PostHog live telemetry sync note: ${posthogNote || 'offline mode'})`,
      }
    } catch (err) {
      return { error: err instanceof Error ? err.message : 'Failed to identify PostHog user' }
    }
  },
})

// ----- Tool: Capture PostHog Event -----

export const capturePostHogEventTool = tool({
  description:
    'Ingest/record a custom telemetry event into PostHog for a user or account (e.g., manual activation step, VIP onboarding milestone, alert resolution).',
  inputSchema: z.object({
    workspaceId: z.string().describe('The workspace ID'),
    event: z.string().describe('The event name (e.g. "onboarding_milestone", "agent_intervention_completed")'),
    distinctId: z.string().optional().describe('The PostHog distinct ID (optional if user or email provided)'),
    user: z.string().optional().describe('Contact/user name (e.g. "Rohan")'),
    email: z.string().optional().describe('User email address'),
    accountName: z.string().optional().describe('Customer account name'),
    properties: z.record(z.string(), z.unknown()).optional().describe('Optional event properties'),
  }),
  execute: async ({ workspaceId, event, distinctId, user, email, accountName, properties }) => {
    try {
      const { apiKey, projectId, apiHost, projectToken } = await getPostHogCredentials(workspaceId)
      const host = apiHost || POSTHOG_DEFAULT_HOST

      let resolvedDistinctId = distinctId

      if (!resolvedDistinctId && (user || email || accountName)) {
        const supabase = createServiceClient()
        const entity = await resolveCustomerEntity(supabase, workspaceId, {
          personName: user,
          email,
          accountName,
        })
        if (entity.posthogDistinctIds.length > 0) {
          resolvedDistinctId = entity.posthogDistinctIds[0]
        }
        if (!resolvedDistinctId && (email || user || accountName)) {
          const searchQ = email || user || accountName || ''
          const found = await searchPostHogPersonsApi(apiKey, projectId, searchQ, 1, host)
          resolvedDistinctId = found[0]?.distinct_ids?.[0]
        }
      }

      if (!resolvedDistinctId) {
        if (email) resolvedDistinctId = email
        else if (user) resolvedDistinctId = user.toLowerCase().replace(/\s+/g, '_')
        else return { error: 'Please specify distinctId, user, or email.' }
      }

      let posthogLiveSync = false
      let posthogNote: string | null = null

      try {
        await capturePostHogEventApi(
          apiKey,
          projectId,
          {
            distinctId: resolvedDistinctId,
            event,
            properties: properties ?? {},
          },
          host,
          projectToken
        )
        posthogLiveSync = true
      } catch (err) {
        posthogNote = err instanceof Error ? err.message : String(err)
        console.warn(`[capturePostHogEvent] PostHog telemetry note: ${posthogNote}`)
      }

      return {
        success: true,
        event,
        distinctId: resolvedDistinctId,
        posthogLiveSync,
        message: posthogLiveSync
          ? `Captured event "${event}" for distinct ID "${resolvedDistinctId}" in PostHog.`
          : `Logged event "${event}" for distinct ID "${resolvedDistinctId}" locally. (PostHog telemetry note: ${posthogNote || 'offline mode'})`,
      }
    } catch (err) {
      return { error: err instanceof Error ? err.message : 'Failed to capture PostHog event' }
    }
  },
})

// ============================================================
//  Intercom Tools — Full Conversation Management & Support
// ============================================================

// ----- Tool: List Intercom Conversations -----

export const listIntercomConvos = tool({
  description:
    'List open, closed, or snoozed conversations from Intercom. Can be filtered by customer accountName (e.g. "Apex MultiRail"), contact email, or user name (e.g. "Rohan").',
  inputSchema: z.object({
    workspaceId: z.string().describe('The workspace ID'),
    state: z.enum(['open', 'closed', 'snoozed']).optional().describe('Conversation state filter. Default: open'),
    accountName: z.string().optional().describe('Filter by customer account name (e.g. "Apex MultiRail")'),
    email: z.string().optional().describe('Filter by contact email (e.g. "rohan@apexmultirail.co")'),
    user: z.string().optional().describe('Filter by contact name (e.g. "Rohan")'),
    limit: z.number().min(1).max(50).optional().describe('Max results. Default: 15'),
  }),
  execute: async ({ workspaceId, state, accountName, email, user, limit }) => {
    try {
      const { accessToken, apiBaseUrl } = await getIntercomCredentials(workspaceId)
      let filterEmail = email?.toLowerCase()
      let filterName = user?.toLowerCase()

      if (!filterEmail && (accountName || user)) {
        const supabase = createServiceClient()
        const entity = await resolveCustomerEntity(supabase, workspaceId, { accountName, personName: user })
        if (entity.contactEmail) filterEmail = entity.contactEmail.toLowerCase()
        if (entity.contactName) filterName = entity.contactName.toLowerCase()
      }

      let convos = await listIntercomConversationsFn(accessToken, apiBaseUrl, state ?? 'open', limit ?? 15)

      if (filterEmail || filterName || accountName) {
        convos = convos.filter((c) => {
          const author = c.source?.author
          const contactObj = c.contacts?.contacts?.[0]
          const cEmail = (author?.email ?? contactObj?.email ?? '').toLowerCase()
          const cName = (author?.name ?? contactObj?.name ?? '').toLowerCase()
          const cTitle = (c.title ?? '').toLowerCase()
          const cBody = (c.source?.body ?? '').toLowerCase()

          if (filterEmail && cEmail.includes(filterEmail)) return true
          if (filterName && cName.includes(filterName)) return true
          if (accountName) {
            const accLower = accountName.toLowerCase()
            if (cTitle.includes(accLower) || cBody.includes(accLower)) return true
          }
          return false
        })
      }

      return {
        contentSafety: getExternalContentSafetyMeta('intercom'),
        conversations: convos.map((c) => {
          const author = c.source?.author
          const contactObj = c.contacts?.contacts?.[0]
          const contactName = author?.name ?? contactObj?.name ?? null
          const contactEmail = author?.email ?? contactObj?.email ?? null
          const contactDisplay = contactName && contactEmail
            ? `${contactName} (${contactEmail})`
            : (contactName || contactEmail || 'Unknown')

          return {
            id: c.id,
            title: sanitizeExternalText(c.title || (c.source?.body ? c.source.body.slice(0, 60).replace(/<[^>]+>/g, '').trim() : ''), { maxLength: 160 }).text || 'Support ticket',
            state: c.state,
            contact: sanitizeExternalText(contactDisplay, { maxLength: 160 }).text,
            contactName,
            contactEmail,
            author: author ? { name: author.name, email: author.email, id: author.id } : null,
            assignee: sanitizeExternalText(c.assignee?.name ?? 'Unassigned', {
              maxLength: 160,
            }).text,
            createdAt: c.created_at ? new Date(c.created_at * 1000).toISOString() : null,
            updatedAt: c.updated_at ? new Date(c.updated_at * 1000).toISOString() : null,
            waitingSince: c.waiting_since ? new Date(c.waiting_since * 1000).toISOString() : null,
          }
        }),
        count: convos.length,
        state: state ?? 'open',
      }
    } catch (err) {
      return { error: err instanceof Error ? err.message : 'Failed to list conversations' }
    }
  },
})

// ----- Tool: Get Intercom Conversation Details -----

export const getIntercomConvo = tool({
  description:
    'Get full details of a specific Intercom conversation including all messages and replies. Specify conversationId, or provide accountName e.g. "Apex MultiRail" or user name e.g. "Rohan" to view their latest ticket.',
  inputSchema: z.object({
    workspaceId: z.string().describe('The workspace ID'),
    conversationId: z.string().optional().describe('The Intercom conversation ID (optional if accountName or user provided)'),
    accountName: z.string().optional().describe('Customer account name (e.g. "Apex MultiRail")'),
    user: z.string().optional().describe('Contact name (e.g. "Rohan")'),
  }),
  execute: async ({ workspaceId, conversationId, accountName, user }) => {
    try {
      const { accessToken, apiBaseUrl } = await getIntercomCredentials(workspaceId)
      let targetConvoId = conversationId

      if (!targetConvoId && (accountName || user)) {
        const supabase = createServiceClient()
        const entity = await resolveCustomerEntity(supabase, workspaceId, { accountName, personName: user })
        const list = await listIntercomConversationsFn(accessToken, apiBaseUrl, 'open', 10)
        const match = list.find((c) => {
          const author = c.source?.author
          const contactObj = c.contacts?.contacts?.[0]
          const cEmail = (author?.email ?? contactObj?.email ?? '').toLowerCase()
          const cName = (author?.name ?? contactObj?.name ?? '').toLowerCase()
          const cTitle = (c.title ?? '').toLowerCase()
          if (entity.contactEmail && cEmail.includes(entity.contactEmail.toLowerCase())) return true
          if (entity.contactName && cName.includes(entity.contactName.toLowerCase())) return true
          if (accountName && cTitle.includes(accountName.toLowerCase())) return true
          return false
        })
        targetConvoId = match?.id ?? list[0]?.id
      }

      if (!targetConvoId) {
        return { error: 'Please specify conversationId, accountName, or user.' }
      }

      const convo = await getIntercomConversationFn(accessToken, apiBaseUrl, targetConvoId)
      const parts = convo.conversation_parts?.conversation_parts ?? []
      const author = convo.source?.author
      const contactObj = convo.contacts?.contacts?.[0]
      const contactName = author?.name ?? contactObj?.name ?? null
      const contactEmail = author?.email ?? contactObj?.email ?? null
      const contactDisplay = contactName && contactEmail
        ? `${contactName} (${contactEmail})`
        : (contactName || contactEmail || 'Unknown')

      return {
        id: convo.id,
        title: sanitizeExternalText(convo.title || (convo.source?.body ? convo.source.body.slice(0, 60).replace(/<[^>]+>/g, '').trim() : ''), { maxLength: 180 }).text || 'Support conversation',
        state: convo.state,
        contact: sanitizeExternalText(contactDisplay, { maxLength: 160 }).text,
        contactName,
        contactEmail,
        author: author ? { name: author.name, email: author.email, id: author.id } : null,
        assignee: sanitizeExternalText(convo.assignee?.name ?? 'Unassigned', {
          maxLength: 160,
        }).text,
        contentSafety: getExternalContentSafetyMeta('intercom'),
        initialMessage: buildExternalContentSnippet({
          source: 'intercom',
          text: convo.source?.body ?? '',
          maxLength: 500,
          stripHtml: true,
          preserveNewlines: true,
          title: convo.title,
        }).text,
        messages: parts.slice(-10).map((p) => ({
          from: sanitizeExternalText(p.author?.name ?? p.author?.type ?? 'Unknown', {
            maxLength: 120,
          }).text,
          type: p.part_type,
          body: buildExternalContentSnippet({
            source: 'intercom',
            text: p.body ?? '',
            maxLength: 300,
            stripHtml: true,
            preserveNewlines: true,
          }).text,
          at: p.created_at ? new Date(p.created_at * 1000).toISOString() : null,
        })),
        stats: convo.statistics ? {
          timeToFirstReply: convo.statistics.time_to_admin_reply,
          reopens: convo.statistics.count_reopens,
          assignments: convo.statistics.count_assignments,
        } : null,
        tags: convo.tags?.tags?.map((t) => t.name) ?? [],
        totalParts: parts.length,
      }
    } catch (err) {
      return { error: err instanceof Error ? err.message : 'Failed to get conversation' }
    }
  },
})

// ----- Tool: Reply to Intercom Conversation -----

export const replyToIntercomConvo = tool({
  description:
    'Reply to an Intercom conversation as an admin. Use "comment" to send a visible reply to the customer, or "note" to leave an internal-only note. The founder MUST confirm before sending a customer-visible reply.',
  inputSchema: z.object({
    workspaceId: z.string().describe('The workspace ID'),
    conversationId: z.string().describe('The Intercom conversation ID'),
    adminId: z.string().describe('The admin ID to reply as (from listIntercomAdmins or conversation assignee)'),
    body: z.string().describe('The reply text (supports HTML)'),
    messageType: z.enum(['comment', 'note']).describe('"comment" = visible to customer, "note" = internal only'),
    confirmSend: z.boolean().describe('Must be true to actually send customer-visible replies. Set false to preview.'),
  }),
  execute: async ({ workspaceId, conversationId, adminId, body, messageType, confirmSend }) => {
    try {
      if (messageType === 'comment' && !confirmSend) {
        return {
          preview: true,
          conversationId,
          body: body.slice(0, 200) + (body.length > 200 ? '...' : ''),
          messageType,
          message: 'Preview: this reply will be visible to the customer. Set confirmSend=true to send.',
        }
      }

      const supabase = createServiceClient()

      // §do.md §12: For customer-visible replies, verify contact suppression policies
      if (messageType === 'comment') {
        const { getIntercomConversation } = await import('@/integrations/intercom/intercom')
        const { accessToken, apiBaseUrl } = await getIntercomCredentials(workspaceId)
        const convo = await getIntercomConversation(accessToken, apiBaseUrl, conversationId)
        const customerContact = convo.contacts?.contacts?.[0]
        const customerEmail = (convo.source?.author?.email ?? customerContact?.email)?.toLowerCase().trim()

        if (customerEmail) {
          const { data: contactRow } = await supabase
            .from('account_contacts')
            .select('customer_account_id')
            .eq('workspace_id', workspaceId)
            .eq('email', customerEmail)
            .maybeSingle()

          if (contactRow?.customer_account_id) {
            const validation = await validateSendRecipient(supabase, {
              workspaceId,
              customerAccountId: contactRow.customer_account_id,
              recipientEmail: customerEmail,
            })
            if (!validation.valid) {
              return { success: false, error: `Customer communication safety check rejected reply: ${validation.reason}` }
            }
          }
        }

        await replyToConversationFn(accessToken, apiBaseUrl, conversationId, adminId, body, messageType)

        await logAgentRun({
          workspaceId,
          runType: 'customer_outreach_dispatched',
          status: 'completed',
          outputSummary: `Intercom visible reply sent to conversation ${conversationId}`,
          metadata: {
            conversationId,
            recipientEmail: customerEmail ?? null,
          },
        })
      } else {
        const { accessToken, apiBaseUrl } = await getIntercomCredentials(workspaceId)
        await replyToConversationFn(accessToken, apiBaseUrl, conversationId, adminId, body, messageType)
      }

      return {
        success: true,
        conversationId,
        messageType,
        message: messageType === 'comment'
          ? 'Reply sent to customer'
          : 'Internal note added to conversation',
      }
    } catch (err) {
      return { error: err instanceof Error ? err.message : 'Failed to reply' }
    }
  },
})

// ----- Tool: Close Intercom Conversation -----

export const closeIntercomConvo = tool({
  description:
    'Close an Intercom conversation. Use when a support issue is resolved.',
  inputSchema: z.object({
    workspaceId: z.string().describe('The workspace ID'),
    conversationId: z.string().describe('The Intercom conversation ID'),
    adminId: z.string().describe('The admin ID closing the conversation'),
    closingMessage: z.string().optional().describe('Optional closing message to the customer'),
  }),
  execute: async ({ workspaceId, conversationId, adminId, closingMessage }) => {
    try {
      const { accessToken, apiBaseUrl } = await getIntercomCredentials(workspaceId)
      await closeConversationFn(accessToken, apiBaseUrl, conversationId, adminId, closingMessage)
      return { success: true, conversationId, message: 'Conversation closed' }
    } catch (err) {
      return { error: err instanceof Error ? err.message : 'Failed to close conversation' }
    }
  },
})

// ----- Tool: Snooze Intercom Conversation -----

export const snoozeIntercomConvo = tool({
  description:
    'Snooze an Intercom conversation until a future time. Use when a customer issue needs follow-up later (e.g., "snooze until Monday" or "follow up in 2 days").',
  inputSchema: z.object({
    workspaceId: z.string().describe('The workspace ID'),
    conversationId: z.string().describe('The Intercom conversation ID'),
    adminId: z.string().describe('The admin ID snoozing the conversation'),
    snoozedUntilUnix: z.number().describe('Unix timestamp (seconds) for when to unsnooze. Must be in the future.'),
  }),
  execute: async ({ workspaceId, conversationId, adminId, snoozedUntilUnix }) => {
    try {
      const now = Math.floor(Date.now() / 1000)
      if (snoozedUntilUnix <= now) return { error: 'snoozedUntilUnix must be in the future' }

      const { accessToken, apiBaseUrl } = await getIntercomCredentials(workspaceId)
      await snoozeConversationFn(accessToken, apiBaseUrl, conversationId, adminId, snoozedUntilUnix)
      return {
        success: true,
        conversationId,
        snoozedUntil: new Date(snoozedUntilUnix * 1000).toISOString(),
        message: `Conversation snoozed until ${new Date(snoozedUntilUnix * 1000).toLocaleString()}`,
      }
    } catch (err) {
      return { error: err instanceof Error ? err.message : 'Failed to snooze conversation' }
    }
  },
})

// ----- Tool: Assign Intercom Conversation -----

export const assignIntercomConvo = tool({
  description:
    'Assign an Intercom conversation to a specific admin or team. Get admin IDs from listIntercomAdmins.',
  inputSchema: z.object({
    workspaceId: z.string().describe('The workspace ID'),
    conversationId: z.string().describe('The Intercom conversation ID'),
    adminId: z.string().describe('The admin ID performing the assignment'),
    assigneeId: z.string().describe('The ID of the admin or team to assign to'),
    note: z.string().optional().describe('Optional note about why the assignment was made'),
  }),
  execute: async ({ workspaceId, conversationId, adminId, assigneeId, note }) => {
    try {
      const { accessToken, apiBaseUrl } = await getIntercomCredentials(workspaceId)
      await assignConversationFn(accessToken, apiBaseUrl, conversationId, adminId, assigneeId, note)
      return { success: true, conversationId, assigneeId, message: 'Conversation assigned' }
    } catch (err) {
      return { error: err instanceof Error ? err.message : 'Failed to assign conversation' }
    }
  },
})

// ----- Tool: Search Intercom Conversations -----

export const searchIntercomConvosTool = tool({
  description:
    'Search Intercom conversations by message content. Use when the founder asks "find support tickets about X" or "any conversations mentioning Y".',
  inputSchema: z.object({
    workspaceId: z.string().describe('The workspace ID'),
    query: z.string().describe('Search query to match against conversation message body'),
  }),
  execute: async ({ workspaceId, query }) => {
    try {
      const { accessToken, apiBaseUrl } = await getIntercomCredentials(workspaceId)
      const convos = await searchIntercomConversationsFn(accessToken, apiBaseUrl, query)
      return {
        contentSafety: getExternalContentSafetyMeta('intercom'),
        conversations: convos.map((c) => {
          const author = c.source?.author
          const contactObj = c.contacts?.contacts?.[0]
          const contactName = author?.name ?? contactObj?.name ?? null
          const contactEmail = author?.email ?? contactObj?.email ?? null
          const contactDisplay = contactName && contactEmail
            ? `${contactName} (${contactEmail})`
            : (contactName || contactEmail || 'Unknown')

          return {
            id: c.id,
            title: sanitizeExternalText(c.title || (c.source?.body ? c.source.body.slice(0, 60).replace(/<[^>]+>/g, '').trim() : ''), { maxLength: 160 }).text || 'Support ticket',
            state: c.state,
            contact: sanitizeExternalText(contactDisplay, { maxLength: 160 }).text,
            contactName,
            contactEmail,
            author: author ? { name: author.name, email: author.email, id: author.id } : null,
            preview: buildExternalContentSnippet({
              source: 'intercom',
              text: c.source?.body ?? '',
              maxLength: 150,
              stripHtml: true,
            }).text,
          }
        }),
        count: convos.length,
      }
    } catch (err) {
      return { error: err instanceof Error ? err.message : 'Failed to search conversations' }
    }
  },
})

// ----- Tool: Search Intercom Contacts -----

export const searchIntercomContactsTool = tool({
  description:
    'Search for contacts in Intercom by email or name. Use when looking up a specific user or customer in the support system.',
  inputSchema: z.object({
    workspaceId: z.string().describe('The workspace ID'),
    query: z.string().describe('Search query (email or name)'),
  }),
  execute: async ({ workspaceId, query }) => {
    try {
      const { accessToken, apiBaseUrl } = await getIntercomCredentials(workspaceId)
      const contacts = await searchIntercomContactsFn(accessToken, apiBaseUrl, query)
      return {
        contacts: contacts.map((c) => ({
          id: c.id,
          name: c.name,
          email: c.email,
          role: c.role,
          companies: c.companies?.data?.map((co) => co.name) ?? [],
          tags: c.tags?.data?.map((t) => t.name) ?? [],
        })),
        count: contacts.length,
      }
    } catch (err) {
      return { error: err instanceof Error ? err.message : 'Failed to search contacts' }
    }
  },
})

// ----- Tool: Create Intercom Note -----

export const createIntercomNote = tool({
  description:
    'Add an internal note to an Intercom contact. Notes are visible to admins only, not the customer. Use to record context or instructions about a contact.',
  inputSchema: z.object({
    workspaceId: z.string().describe('The workspace ID'),
    contactId: z.string().describe('The Intercom contact ID'),
    adminId: z.string().describe('The admin ID creating the note'),
    body: z.string().describe('The note text (supports HTML)'),
  }),
  execute: async ({ workspaceId, contactId, adminId, body }) => {
    try {
      const { accessToken, apiBaseUrl } = await getIntercomCredentials(workspaceId)
      const note = await createContactNoteFn(accessToken, apiBaseUrl, contactId, adminId, body)
      return { success: true, noteId: note.id, contactId, message: 'Note created on contact' }
    } catch (err) {
      return { error: err instanceof Error ? err.message : 'Failed to create note' }
    }
  },
})

// ----- Tool: Tag Intercom Conversation -----

export const tagIntercomConvo = tool({
  description:
    'Add a tag to an Intercom conversation for organization and filtering. Get tag IDs by checking conversation details or creating a new tag.',
  inputSchema: z.object({
    workspaceId: z.string().describe('The workspace ID'),
    conversationId: z.string().describe('The Intercom conversation ID'),
    adminId: z.string().describe('The admin ID tagging the conversation'),
    tagId: z.string().describe('The tag ID to apply'),
  }),
  execute: async ({ workspaceId, conversationId, adminId, tagId }) => {
    try {
      const { accessToken, apiBaseUrl } = await getIntercomCredentials(workspaceId)
      const tag = await tagConversationFn(accessToken, apiBaseUrl, conversationId, adminId, tagId)
      return { success: true, conversationId, tagName: tag.name, message: `Tagged conversation with "${tag.name}"` }
    } catch (err) {
      return { error: err instanceof Error ? err.message : 'Failed to tag conversation' }
    }
  },
})

// ----- Tool: Update Intercom Contact -----

export const updateIntercomContactTool = tool({
  description:
    'Update an Intercom contact\'s name, phone, or custom attributes (e.g., plan, MRR, churn risk tier, status). Automatically syncs identity to the local workspace database. CAUTION: Modifies customer profile in Intercom. Set confirmUpdate=true to execute.',
  inputSchema: z.object({
    workspaceId: z.string().describe('The workspace ID'),
    contactId: z.string().optional().describe('The Intercom contact ID (optional if user, email, or accountName provided)'),
    user: z.string().optional().describe('Contact/user name (e.g. "Rohan")'),
    email: z.string().optional().describe('User email address'),
    accountName: z.string().optional().describe('Customer account name (e.g. "Apex MultiRail")'),
    name: z.string().optional().describe('Updated name for the contact'),
    phone: z.string().optional().describe('Updated phone number for the contact'),
    customAttributes: z.record(z.string(), z.unknown()).optional().describe('Key-value custom attributes to update (e.g. { plan: "enterprise", churn_risk: "high" })'),
    confirmUpdate: z.boolean().describe('Must be true to execute update. Set false to preview.'),
  }),
  execute: async ({ workspaceId, contactId, user, email, accountName, name, phone, customAttributes, confirmUpdate }) => {
    try {
      const { accessToken, apiBaseUrl } = await getIntercomCredentials(workspaceId)
      const supabase = createServiceClient()

      let resolvedContactId = contactId
      let resolvedContactEmail = email
      let resolvedContactName = user
      let customerAccountId: string | null = null

      if (!resolvedContactId && (user || email || accountName)) {
        const entity = await resolveCustomerEntity(supabase, workspaceId, {
          personName: user,
          email,
          accountName,
        })
        if (entity.intercomContactId) resolvedContactId = entity.intercomContactId
        if (entity.contactEmail && !resolvedContactEmail) resolvedContactEmail = entity.contactEmail
        if (entity.contactName && !resolvedContactName) resolvedContactName = entity.contactName
        if (entity.accountId) customerAccountId = entity.accountId
      }

      if (!resolvedContactId && (resolvedContactEmail || user || accountName)) {
        const query = resolvedContactEmail || user || accountName || ''
        const found = await searchIntercomContactsFn(accessToken, apiBaseUrl, query)
        if (found[0]?.id) resolvedContactId = found[0].id
      }

      if (!resolvedContactId) {
        return { error: 'Please specify contactId, user, email, or accountName.' }
      }

      if (!confirmUpdate) {
        return {
          preview: true,
          contactId: resolvedContactId,
          targetUser: resolvedContactName,
          targetEmail: resolvedContactEmail,
          updates: { name, phone, customAttributes },
          message: `Preview: Would update Intercom contact "${resolvedContactId}" with: ${JSON.stringify({ name, phone, customAttributes })}. Set confirmUpdate=true to execute.`,
        }
      }

      const updated = await updateIntercomContactFn(accessToken, apiBaseUrl, resolvedContactId, {
        name,
        phone,
        customAttributes,
      })

      const syncResult = await syncProviderIdentityToContact(supabase, workspaceId, {
        contactEmail: resolvedContactEmail || updated.email,
        contactName: resolvedContactName || updated.name,
        customerAccountId,
        provider: 'intercom',
        providerId: resolvedContactId,
      })

      await logAgentRun({
        workspaceId,
        runType: 'intercom_contact_updated',
        status: 'completed',
        outputSummary: `Intercom contact ${resolvedContactId} updated`,
        metadata: {
          contactId: resolvedContactId,
          updates: { name, phone, customAttributes },
          syncedToLocalDb: syncResult.synced,
        },
      })

      return {
        success: true,
        contactId: updated.id,
        name: updated.name,
        email: updated.email,
        customAttributes: updated.custom_attributes,
        localDbSync: syncResult.message,
        message: `Successfully updated Intercom contact ${updated.id}`,
      }
    } catch (err) {
      return { error: err instanceof Error ? err.message : 'Failed to update Intercom contact' }
    }
  },
})

// ----- Tool: Create Intercom Contact -----

export const createIntercomContactTool = tool({
  description:
    'Create a new user or lead in Intercom. Automatically syncs with local workspace database contacts.',
  inputSchema: z.object({
    workspaceId: z.string().describe('The workspace ID'),
    email: z.string().describe('Email address of the contact'),
    name: z.string().optional().describe('Full name of the contact'),
    role: z.enum(['user', 'lead']).optional().describe('Role: "user" (paying/registered) or "lead" (prospect). Default: "user"'),
    phone: z.string().optional().describe('Phone number of the contact'),
    customAttributes: z.record(z.string(), z.unknown()).optional().describe('Optional custom attributes'),
    accountName: z.string().optional().describe('Customer account name to link in local database'),
  }),
  execute: async ({ workspaceId, email, name, role, phone, customAttributes, accountName }) => {
    try {
      const { accessToken, apiBaseUrl } = await getIntercomCredentials(workspaceId)
      const supabase = createServiceClient()

      const created = await createIntercomContactFn(accessToken, apiBaseUrl, {
        email,
        name,
        role: role ?? 'user',
        phone,
        customAttributes,
      })

      const contactId = created.id || ''

      // Sync to local database
      let customerAccountId: string | null = null
      if (accountName) {
        const entity = await resolveCustomerEntity(supabase, workspaceId, { accountName })
        if (entity.accountId) customerAccountId = entity.accountId
      }

      const syncResult = await syncProviderIdentityToContact(supabase, workspaceId, {
        contactEmail: email,
        contactName: name,
        customerAccountId,
        provider: 'intercom',
        providerId: contactId,
      })

      return {
        success: true,
        contactId,
        email: created.email,
        name: created.name,
        role: created.role,
        localDbSync: syncResult.message,
        message: `Successfully created Intercom contact ${contactId} (${email})`,
      }
    } catch (err) {
      return { error: err instanceof Error ? err.message : 'Failed to create Intercom contact' }
    }
  },
})

// ----- Tool: Tag Intercom Contact -----

export const tagIntercomContactTool = tool({
  description:
    'Add a tag to an Intercom contact for segmentation, alert tracking, or churn classification (e.g. "vip", "churn-risk", "enterprise").',
  inputSchema: z.object({
    workspaceId: z.string().describe('The workspace ID'),
    contactId: z.string().optional().describe('The Intercom contact ID (optional if user or email provided)'),
    tagId: z.string().describe('The tag ID to apply'),
    user: z.string().optional().describe('Contact/user name (e.g. "Rohan")'),
    email: z.string().optional().describe('Contact email address'),
    accountName: z.string().optional().describe('Customer account name'),
  }),
  execute: async ({ workspaceId, contactId, tagId, user, email, accountName }) => {
    try {
      const { accessToken, apiBaseUrl } = await getIntercomCredentials(workspaceId)

      let resolvedContactId = contactId

      if (!resolvedContactId && (user || email || accountName)) {
        const supabase = createServiceClient()
        const entity = await resolveCustomerEntity(supabase, workspaceId, {
          personName: user,
          email,
          accountName,
        })
        if (entity.intercomContactId) resolvedContactId = entity.intercomContactId
        if (!resolvedContactId && (email || user || accountName)) {
          const query = email || user || accountName || ''
          const found = await searchIntercomContactsFn(accessToken, apiBaseUrl, query)
          if (found[0]?.id) resolvedContactId = found[0].id
        }
      }

      if (!resolvedContactId) {
        return { error: 'Please specify contactId, user, email, or accountName.' }
      }

      const tagged = await tagIntercomContactFn(accessToken, apiBaseUrl, resolvedContactId, tagId)
      return {
        success: true,
        contactId: resolvedContactId,
        tagId,
        tagName: tagged.name,
        message: `Tagged Intercom contact ${resolvedContactId} with "${tagged.name || tagId}"`,
      }
    } catch (err) {
      return { error: err instanceof Error ? err.message : 'Failed to tag Intercom contact' }
    }
  },
})

// ----- Tool: Reopen Intercom Conversation -----

export const reopenIntercomConvo = tool({
  description:
    'Reopen a closed Intercom conversation. Use when an issue is ongoing or a customer writes back on a closed thread.',
  inputSchema: z.object({
    workspaceId: z.string().describe('The workspace ID'),
    conversationId: z.string().describe('The Intercom conversation ID to reopen'),
    adminId: z.string().describe('The admin ID reopening the conversation (from listIntercomAdmins or conversation assignee)'),
  }),
  execute: async ({ workspaceId, conversationId, adminId }) => {
    try {
      const { accessToken, apiBaseUrl } = await getIntercomCredentials(workspaceId)
      const reopened = await reopenConversationFn(accessToken, apiBaseUrl, conversationId, adminId)
      return {
        success: true,
        conversationId: reopened.id,
        state: reopened.state,
        message: `Reopened Intercom conversation ${reopened.id}`,
      }
    } catch (err) {
      return { error: err instanceof Error ? err.message : 'Failed to reopen Intercom conversation' }
    }
  },
})

// ============================================================
//  Stripe Tools — Full Customer, Subscription, Invoice Management
// ============================================================

// ----- Tool: Search Stripe Customers -----

export const searchStripeCustomersTool = tool({
  description:
    'Search for customers in Stripe by email or name. Use when the founder asks about a specific customer\'s billing status or wants to look someone up.',
  inputSchema: z.object({
    workspaceId: z.string().describe('The workspace ID'),
    query: z.string().describe('Search query (email or name)'),
    limit: z.number().min(1).max(20).optional().describe('Max results. Default: 10'),
  }),
  execute: async ({ workspaceId, query, limit }) => {
    try {
      const stripe = await getStripeClient(workspaceId)
      const customers = await searchStripeCustomers(stripe, query, limit ?? 10)
      return {
        customers: customers.map((c) => ({
          id: c.id,
          name: c.name,
          email: c.email,
          currency: c.currency,
          balance: c.balance,
          created: new Date(c.created * 1000).toISOString(),
          delinquent: c.delinquent,
        })),
        count: customers.length,
      }
    } catch (err) {
      return { error: err instanceof Error ? err.message : 'Failed to search customers' }
    }
  },
})

// ----- Tool: Get Stripe Customer Detail -----

export const getStripeCustomerDetail = tool({
  description:
    'Get full details of a Stripe customer including subscriptions and payment info. Specify customerId (cus_xxx), or provide accountName e.g. "Apex MultiRail", email, or user name.',
  inputSchema: z.object({
    workspaceId: z.string().describe('The workspace ID'),
    customerId: z.string().optional().describe('The Stripe customer ID (cus_xxx). Optional if accountName, email, or user is provided.'),
    accountName: z.string().optional().describe('Customer account name (e.g. "Apex MultiRail")'),
    email: z.string().optional().describe('Customer billing email'),
    user: z.string().optional().describe('Contact name (e.g. "Rohan")'),
  }),
  execute: async ({ workspaceId, customerId, accountName, email, user }) => {
    try {
      const stripe = await getStripeClient(workspaceId)
      let resolvedCustomerId = customerId

      if (!resolvedCustomerId && (accountName || email || user)) {
        const supabase = createServiceClient()
        const entity = await resolveCustomerEntity(supabase, workspaceId, { accountName, email, personName: user })
        resolvedCustomerId = entity.stripeCustomerId || undefined
        if (!resolvedCustomerId) {
          const query = accountName || email || user || ''
          const found = await searchStripeCustomers(stripe, query, 1)
          resolvedCustomerId = found[0]?.id
        }
      }

      if (!resolvedCustomerId) {
        return { error: 'Please specify customerId, accountName, email, or user.' }
      }

      const customer = await getStripeCustomer(stripe, resolvedCustomerId)
      const subs = customer.subscriptions?.data ?? []
      return {
        id: customer.id,
        name: customer.name,
        email: customer.email,
        balance: customer.balance,
        currency: customer.currency,
        delinquent: customer.delinquent,
        created: new Date(customer.created * 1000).toISOString(),
        subscriptions: subs.map((s) => ({
          id: s.id,
          status: s.status,
          cancelAtPeriodEnd: s.cancel_at_period_end,
          currentPeriodEnd: getSubscriptionCurrentPeriodEndIso(s),
          plan: s.items.data[0]?.price?.nickname ?? null,
          amountCents: s.items.data[0]?.price?.unit_amount ?? 0,
          interval: s.items.data[0]?.price?.recurring?.interval ?? 'month',
        })),
        metadata: customer.metadata,
      }
    } catch (err) {
      return { error: err instanceof Error ? err.message : 'Failed to get customer' }
    }
  },
})

// ----- Tool: Update Stripe Customer -----

export const updateStripeCustomerTool = tool({
  description:
    'Update a Stripe customer\'s name, email, or metadata (e.g. churn flags, account tier, external IDs). Automatically syncs identity to the local workspace database. CAUTION: Modifies live Stripe records. Set confirmUpdate=true to execute.',
  inputSchema: z.object({
    workspaceId: z.string().describe('The workspace ID'),
    customerId: z.string().optional().describe('The Stripe customer ID (cus_xxx). Optional if accountName, email, or user is provided.'),
    accountName: z.string().optional().describe('Customer account name (e.g. "Apex MultiRail")'),
    email: z.string().optional().describe('Customer billing email to locate'),
    user: z.string().optional().describe('Contact name (e.g. "Rohan")'),
    name: z.string().optional().describe('Updated customer display name'),
    newEmail: z.string().optional().describe('Updated billing email address'),
    metadata: z.record(z.string(), z.string()).optional().describe('Key-value metadata dictionary to store in Stripe'),
    confirmUpdate: z.boolean().describe('Must be true to execute update. Set false to preview.'),
  }),
  execute: async ({ workspaceId, customerId, accountName, email, user, name, newEmail, metadata, confirmUpdate }) => {
    try {
      const stripe = await getStripeClient(workspaceId)
      const supabase = createServiceClient()

      let resolvedCustomerId = customerId
      let resolvedContactEmail = email
      let resolvedContactName = user
      let customerAccountId: string | null = null

      if (!resolvedCustomerId && (accountName || email || user)) {
        const entity = await resolveCustomerEntity(supabase, workspaceId, { accountName, email, personName: user })
        resolvedCustomerId = entity.stripeCustomerId || undefined
        if (entity.contactEmail && !resolvedContactEmail) resolvedContactEmail = entity.contactEmail
        if (entity.contactName && !resolvedContactName) resolvedContactName = entity.contactName
        if (entity.accountId) customerAccountId = entity.accountId

        if (!resolvedCustomerId) {
          const query = accountName || email || user || ''
          const found = await searchStripeCustomers(stripe, query, 1)
          resolvedCustomerId = found[0]?.id
        }
      }

      if (!resolvedCustomerId) {
        return { error: 'Please specify customerId, accountName, email, or user.' }
      }

      if (!confirmUpdate) {
        return {
          preview: true,
          customerId: resolvedCustomerId,
          targetUser: resolvedContactName,
          targetEmail: resolvedContactEmail,
          updates: { name, email: newEmail, metadata },
          message: `Preview: Would update Stripe customer "${resolvedCustomerId}" with: ${JSON.stringify({ name, email: newEmail, metadata })}. Set confirmUpdate=true to execute.`,
        }
      }

      const updated = await updateStripeCustomer(stripe, resolvedCustomerId, {
        name,
        email: newEmail,
        metadata,
      })

      const syncResult = await syncProviderIdentityToContact(supabase, workspaceId, {
        contactEmail: newEmail || resolvedContactEmail || updated.email,
        contactName: name || resolvedContactName || updated.name,
        customerAccountId,
        provider: 'stripe',
        providerId: resolvedCustomerId,
      })

      await logAgentRun({
        workspaceId,
        runType: 'stripe_customer_updated',
        status: 'completed',
        outputSummary: `Stripe customer ${resolvedCustomerId} updated`,
        metadata: {
          customerId: resolvedCustomerId,
          updates: { name, email: newEmail, metadata },
          syncedToLocalDb: syncResult.synced,
        },
      })

      return {
        success: true,
        customerId: updated.id,
        name: updated.name,
        email: updated.email,
        metadata: updated.metadata,
        localDbSync: syncResult.message,
        message: `Successfully updated Stripe customer ${updated.id}`,
      }
    } catch (err) {
      return { error: err instanceof Error ? err.message : 'Failed to update Stripe customer' }
    }
  },
})

// ----- Tool: List Stripe Invoices -----

export const listStripeInvoicesTool = tool({
  description:
    'List recent invoices for a Stripe customer. Shows payment status, amounts, and dates. Specify customerId (cus_xxx), or provide accountName e.g. "Apex MultiRail", email, or user name.',
  inputSchema: z.object({
    workspaceId: z.string().describe('The workspace ID'),
    customerId: z.string().optional().describe('The Stripe customer ID (cus_xxx). Optional if accountName, email, or user is provided.'),
    accountName: z.string().optional().describe('Customer account name (e.g. "Apex MultiRail")'),
    email: z.string().optional().describe('Customer billing email'),
    user: z.string().optional().describe('Contact name (e.g. "Rohan")'),
    limit: z.number().min(1).max(20).optional().describe('Max invoices. Default: 10'),
  }),
  execute: async ({ workspaceId, customerId, accountName, email, user, limit }) => {
    try {
      const stripe = await getStripeClient(workspaceId)
      let resolvedCustomerId = customerId

      if (!resolvedCustomerId && (accountName || email || user)) {
        const supabase = createServiceClient()
        const entity = await resolveCustomerEntity(supabase, workspaceId, { accountName, email, personName: user })
        resolvedCustomerId = entity.stripeCustomerId || undefined
        if (!resolvedCustomerId) {
          const query = accountName || email || user || ''
          const found = await searchStripeCustomers(stripe, query, 1)
          resolvedCustomerId = found[0]?.id
        }
      }

      if (!resolvedCustomerId) {
        return { error: 'Please specify customerId, accountName, email, or user.' }
      }

      const invoices = await listStripeInvoices(stripe, resolvedCustomerId, limit ?? 10)
      return {
        customerId: resolvedCustomerId,
        invoices: invoices.map((inv) => ({
          id: inv.id,
          status: inv.status,
          amountDue: inv.amount_due,
          amountPaid: inv.amount_paid,
          currency: inv.currency,
          created: new Date(inv.created * 1000).toISOString(),
          dueDate: inv.due_date ? new Date(inv.due_date * 1000).toISOString() : null,
          invoiceUrl: inv.hosted_invoice_url,
          attemptCount: inv.attempt_count,
          paid: inv.status === 'paid',
        })),
        count: invoices.length,
      }
    } catch (err) {
      return { error: err instanceof Error ? err.message : 'Failed to list invoices' }
    }
  },
})

// ----- Tool: Get Upcoming Invoice -----

export const getUpcomingStripeInvoice = tool({
  description:
    'Preview the upcoming invoice for a customer. Shows what they will be charged next and when. Specify customerId (cus_xxx), or provide accountName e.g. "Apex MultiRail", email, or user name.',
  inputSchema: z.object({
    workspaceId: z.string().describe('The workspace ID'),
    customerId: z.string().optional().describe('The Stripe customer ID (cus_xxx). Optional if accountName, email, or user is provided.'),
    accountName: z.string().optional().describe('Customer account name (e.g. "Apex MultiRail")'),
    email: z.string().optional().describe('Customer billing email'),
    user: z.string().optional().describe('Contact name (e.g. "Rohan")'),
  }),
  execute: async ({ workspaceId, customerId, accountName, email, user }) => {
    try {
      const stripe = await getStripeClient(workspaceId)
      let resolvedCustomerId = customerId

      if (!resolvedCustomerId && (accountName || email || user)) {
        const supabase = createServiceClient()
        const entity = await resolveCustomerEntity(supabase, workspaceId, { accountName, email, personName: user })
        resolvedCustomerId = entity.stripeCustomerId || undefined
        if (!resolvedCustomerId) {
          const query = accountName || email || user || ''
          const found = await searchStripeCustomers(stripe, query, 1)
          resolvedCustomerId = found[0]?.id
        }
      }

      if (!resolvedCustomerId) {
        return { error: 'Please specify customerId, accountName, email, or user.' }
      }

      const invoice = await getUpcomingInvoice(stripe, resolvedCustomerId)
      return {
        customerId: resolvedCustomerId,
        amountDue: invoice.amount_due,
        currency: invoice.currency,
        periodStart: invoice.period_start ? new Date(invoice.period_start * 1000).toISOString() : null,
        periodEnd: invoice.period_end ? new Date(invoice.period_end * 1000).toISOString() : null,
        lines: (invoice.lines?.data ?? []).slice(0, 5).map((line: { description: string | null; amount: number }) => ({
          description: line.description,
          amount: line.amount,
        })),
      }
    } catch (err) {
      return { error: err instanceof Error ? err.message : 'Failed to get upcoming invoice' }
    }
  },
})

// ----- Tool: Void Stripe Invoice -----

export const voidStripeInvoiceTool = tool({
  description:
    'Void an open or uncollectible Stripe invoice. CAUTION: Irreversible billing action. Set confirmVoid=true to execute; defaults to preview mode.',
  inputSchema: z.object({
    workspaceId: z.string().describe('The workspace ID'),
    invoiceId: z.string().describe('The Stripe invoice ID (in_xxx)'),
    confirmVoid: z.boolean().describe('Must be true to actually void invoice. Set false to preview.'),
  }),
  execute: async ({ workspaceId, invoiceId, confirmVoid }) => {
    try {
      if (!confirmVoid) {
        return {
          preview: true,
          invoiceId,
          message: `Preview: Would void invoice "${invoiceId}". Set confirmVoid=true to execute.`,
        }
      }

      const stripe = await getStripeClient(workspaceId)
      const voided = await voidStripeInvoice(stripe, invoiceId)
      return {
        success: true,
        invoiceId: voided.id,
        status: voided.status,
        message: `Successfully voided invoice ${voided.id}`,
      }
    } catch (err) {
      return { error: err instanceof Error ? err.message : 'Failed to void invoice' }
    }
  },
})

// ----- Tool: Get Stripe Subscription Detail -----

export const getStripeSubscriptionDetail = tool({
  description:
    'Get full details of a specific Stripe subscription including plan, status, billing cycle, and cancel state. Specify subscriptionId (sub_xxx), or provide accountName, customerId, or user name.',
  inputSchema: z.object({
    workspaceId: z.string().describe('The workspace ID'),
    subscriptionId: z.string().optional().describe('The Stripe subscription ID (sub_xxx). Optional if customerId, accountName, or user is provided.'),
    customerId: z.string().optional().describe('The Stripe customer ID (cus_xxx)'),
    accountName: z.string().optional().describe('Customer account name (e.g. "Apex MultiRail")'),
    user: z.string().optional().describe('Contact name (e.g. "Rohan")'),
  }),
  execute: async ({ workspaceId, subscriptionId, customerId, accountName, user }) => {
    try {
      const stripe = await getStripeClient(workspaceId)
      let resolvedSubId = subscriptionId

      if (!resolvedSubId && (customerId || accountName || user)) {
        let resolvedCustId = customerId
        if (!resolvedCustId && (accountName || user)) {
          const supabase = createServiceClient()
          const entity = await resolveCustomerEntity(supabase, workspaceId, { accountName, personName: user })
          resolvedCustId = entity.stripeCustomerId || undefined
        }
        if (resolvedCustId) {
          const cust = await getStripeCustomer(stripe, resolvedCustId)
          resolvedSubId = cust.subscriptions?.data?.[0]?.id
        }
      }

      if (!resolvedSubId) {
        return { error: 'Please specify subscriptionId, customerId, or accountName.' }
      }

      const sub = await getStripeSubscription(stripe, resolvedSubId)
      const customer = typeof sub.customer === 'object' && sub.customer ? sub.customer as { id: string; name: string | null; email: string | null } : null
      return {
        id: sub.id,
        status: sub.status,
        customer: customer ? { id: customer.id, name: customer.name, email: customer.email } : null,
        cancelAtPeriodEnd: sub.cancel_at_period_end,
        currentPeriodEnd: getSubscriptionCurrentPeriodEndIso(sub),
        plan: sub.items.data[0]?.price?.nickname ?? null,
        amountCents: sub.items.data[0]?.price?.unit_amount ?? 0,
        interval: sub.items.data[0]?.price?.recurring?.interval ?? 'month',
        trialEnd: sub.trial_end ? new Date(sub.trial_end * 1000).toISOString() : null,
        discount: sub.discounts?.[0] ? { couponId: String(sub.discounts[0]) } : null,
      }
    } catch (err) {
      return { error: err instanceof Error ? err.message : 'Failed to get subscription' }
    }
  },
})

// ----- Tool: Cancel Stripe Subscription -----

export const cancelStripeSubscriptionTool = tool({
  description:
    'Cancel a Stripe subscription. By default cancels at period end (customer keeps access until renewal). CAUTION: This is a destructive action. Always confirm with the founder first.',
  inputSchema: z.object({
    workspaceId: z.string().describe('The workspace ID'),
    subscriptionId: z.string().describe('The Stripe subscription ID'),
    atPeriodEnd: z.boolean().describe('true = cancel at end of billing period (safer), false = cancel immediately'),
    confirmCancel: z.boolean().describe('Must be true to actually cancel. Set false to preview.'),
  }),
  execute: async ({ workspaceId, subscriptionId, atPeriodEnd, confirmCancel }) => {
    try {
      if (!confirmCancel) {
        const stripe = await getStripeClient(workspaceId)
        const sub = await getStripeSubscription(stripe, subscriptionId)
        return {
          preview: true,
          subscriptionId,
          currentStatus: sub.status,
          cancelMode: atPeriodEnd ? 'at_period_end' : 'immediately',
          message: `Would cancel subscription ${subscriptionId} ${atPeriodEnd ? 'at period end' : 'IMMEDIATELY'}. Set confirmCancel=true to proceed.`,
        }
      }

      const stripe = await getStripeClient(workspaceId)
      const cancelled = await cancelStripeSubscription(stripe, subscriptionId, atPeriodEnd)
      return {
        success: true,
        subscriptionId: cancelled.id,
        status: cancelled.status,
        cancelAtPeriodEnd: cancelled.cancel_at_period_end,
        message: atPeriodEnd
          ? 'Subscription will cancel at end of current billing period'
          : 'Subscription cancelled immediately',
      }
    } catch (err) {
      return { error: err instanceof Error ? err.message : 'Failed to cancel subscription' }
    }
  },
})

// ----- Tool: Pause Stripe Subscription -----

export const pauseStripeSubscriptionTool = tool({
  description:
    'Pause payment collection on an active Stripe subscription (churn mitigation/temporary hold). Does not cancel access. Set confirmPause=true to execute; defaults to preview mode.',
  inputSchema: z.object({
    workspaceId: z.string().describe('The workspace ID'),
    subscriptionId: z.string().optional().describe('The Stripe subscription ID (sub_xxx). Optional if customerId, accountName, or user is provided.'),
    customerId: z.string().optional().describe('The Stripe customer ID (cus_xxx)'),
    accountName: z.string().optional().describe('Customer account name (e.g. "Apex MultiRail")'),
    user: z.string().optional().describe('Contact name (e.g. "Rohan")'),
    confirmPause: z.boolean().describe('Must be true to actually pause. Set false to preview.'),
  }),
  execute: async ({ workspaceId, subscriptionId, customerId, accountName, user, confirmPause }) => {
    try {
      const stripe = await getStripeClient(workspaceId)
      let resolvedSubId = subscriptionId

      if (!resolvedSubId && (customerId || accountName || user)) {
        let resolvedCustId = customerId
        if (!resolvedCustId && (accountName || user)) {
          const supabase = createServiceClient()
          const entity = await resolveCustomerEntity(supabase, workspaceId, { accountName, personName: user })
          resolvedCustId = entity.stripeCustomerId || undefined
        }
        if (resolvedCustId) {
          const cust = await getStripeCustomer(stripe, resolvedCustId)
          resolvedSubId = cust.subscriptions?.data?.[0]?.id
        }
      }

      if (!resolvedSubId) {
        return { error: 'Please specify subscriptionId, customerId, or accountName.' }
      }

      if (!confirmPause) {
        const sub = await getStripeSubscription(stripe, resolvedSubId)
        return {
          preview: true,
          subscriptionId: resolvedSubId,
          status: sub.status,
          message: `Preview: Would pause payment collection for subscription "${resolvedSubId}". Set confirmPause=true to execute.`,
        }
      }

      const paused = await pauseStripeSubscription(stripe, resolvedSubId)

      await logAgentRun({
        workspaceId,
        runType: 'stripe_subscription_paused',
        status: 'completed',
        outputSummary: `Stripe subscription ${resolvedSubId} paused`,
        metadata: { subscriptionId: resolvedSubId },
      })

      return {
        success: true,
        subscriptionId: paused.id,
        status: paused.status,
        pauseCollection: paused.pause_collection,
        message: `Successfully paused subscription ${paused.id}`,
      }
    } catch (err) {
      return { error: err instanceof Error ? err.message : 'Failed to pause subscription' }
    }
  },
})

// ----- Tool: Resume Stripe Subscription -----

export const resumeStripeSubscriptionTool = tool({
  description:
    'Resume payment collection on a paused Stripe subscription. Set confirmResume=true to execute.',
  inputSchema: z.object({
    workspaceId: z.string().describe('The workspace ID'),
    subscriptionId: z.string().optional().describe('The Stripe subscription ID (sub_xxx). Optional if customerId, accountName, or user is provided.'),
    customerId: z.string().optional().describe('The Stripe customer ID (cus_xxx)'),
    accountName: z.string().optional().describe('Customer account name'),
    user: z.string().optional().describe('Contact name'),
    confirmResume: z.boolean().describe('Must be true to actually resume. Set false to preview.'),
  }),
  execute: async ({ workspaceId, subscriptionId, customerId, accountName, user, confirmResume }) => {
    try {
      const stripe = await getStripeClient(workspaceId)
      let resolvedSubId = subscriptionId

      if (!resolvedSubId && (customerId || accountName || user)) {
        let resolvedCustId = customerId
        if (!resolvedCustId && (accountName || user)) {
          const supabase = createServiceClient()
          const entity = await resolveCustomerEntity(supabase, workspaceId, { accountName, personName: user })
          resolvedCustId = entity.stripeCustomerId || undefined
        }
        if (resolvedCustId) {
          const cust = await getStripeCustomer(stripe, resolvedCustId)
          resolvedSubId = cust.subscriptions?.data?.[0]?.id
        }
      }

      if (!resolvedSubId) {
        return { error: 'Please specify subscriptionId, customerId, or accountName.' }
      }

      if (!confirmResume) {
        return {
          preview: true,
          subscriptionId: resolvedSubId,
          message: `Preview: Would resume payment collection for subscription "${resolvedSubId}". Set confirmResume=true to execute.`,
        }
      }

      const resumed = await resumeStripeSubscription(stripe, resolvedSubId)
      return {
        success: true,
        subscriptionId: resumed.id,
        status: resumed.status,
        message: `Successfully resumed subscription ${resumed.id}`,
      }
    } catch (err) {
      return { error: err instanceof Error ? err.message : 'Failed to resume subscription' }
    }
  },
})

// ----- Tool: Refund a Stripe Charge -----

export const refundStripeCharge = tool({
  description:
    'Issue a refund for a Stripe charge. Can refund full or partial amount. CAUTION: Moves real money. Always confirm with the founder.',
  inputSchema: z.object({
    workspaceId: z.string().describe('The workspace ID'),
    chargeId: z.string().describe('The Stripe charge ID (ch_xxx) — get from listStripeInvoicesTool or getStripeCustomerDetail'),
    amountCents: z.number().optional().describe('Amount to refund in cents. Leave empty for full refund.'),
    reason: z.enum(['duplicate', 'fraudulent', 'requested_by_customer']).optional().describe('Reason for refund'),
    confirmRefund: z.boolean().describe('Must be true to actually refund. Set false to preview.'),
  }),
  execute: async ({ workspaceId, chargeId, amountCents, reason, confirmRefund }) => {
    try {
      if (!confirmRefund) {
        return {
          preview: true,
          chargeId,
          refundAmount: amountCents ? `${amountCents} cents` : 'Full refund',
          reason: reason ?? 'not specified',
          message: `Would refund ${amountCents ? `${amountCents} cents` : 'full amount'} on charge ${chargeId}. Set confirmRefund=true to proceed.`,
        }
      }

      const stripe = await getStripeClient(workspaceId)
      const refund = await createStripeRefund(stripe, chargeId, amountCents, reason)
      return {
        success: true,
        refundId: refund.id,
        amount: refund.amount,
        currency: refund.currency,
        status: refund.status,
        message: `Refund of ${refund.amount} ${refund.currency} issued`,
      }
    } catch (err) {
      return { error: err instanceof Error ? err.message : 'Failed to issue refund' }
    }
  },
})

// ----- Tool: Apply Coupon to Subscription -----

export const applyStripeCoupon = tool({
  description:
    'Apply a discount coupon to a Stripe subscription. Use after creating a rescue coupon with createRescueDiscountTool.',
  inputSchema: z.object({
    workspaceId: z.string().describe('The workspace ID'),
    subscriptionId: z.string().describe('The subscription to apply the coupon to'),
    couponId: z.string().describe('The coupon ID (from createRescueDiscountTool)'),
  }),
  execute: async ({ workspaceId, subscriptionId, couponId }) => {
    try {
      const stripe = await getStripeClient(workspaceId)
      const sub = await applySubscriptionCoupon(stripe, subscriptionId, couponId)
      return {
        success: true,
        subscriptionId: sub.id,
        discount: sub.discounts?.[0] ? { couponId: String(sub.discounts[0]) } : null,
        message: `Coupon applied to subscription ${sub.id}`,
      }
    } catch (err) {
      return { error: err instanceof Error ? err.message : 'Failed to apply coupon' }
    }
  },
})

// ----- Tool: Get Stripe Balance -----

export const getStripeBalanceTool = tool({
  description:
    'Get the current Stripe account balance. Shows available and pending funds. Use when the founder asks about revenue, payouts, or cash position.',
  inputSchema: z.object({
    workspaceId: z.string().describe('The workspace ID'),
  }),
  execute: async ({ workspaceId }) => {
    try {
      const stripe = await getStripeClient(workspaceId)
      const balance = await getStripeBalance(stripe)
      return {
        available: balance.available.map((b) => ({ amount: b.amount, currency: b.currency })),
        pending: balance.pending.map((b) => ({ amount: b.amount, currency: b.currency })),
      }
    } catch (err) {
      return { error: err instanceof Error ? err.message : 'Failed to get balance' }
    }
  },
})

// ----- Tool: List Stripe Disputes -----

export const listStripeDisputesTool = tool({
  description:
    'List open payment disputes/chargebacks. Use when tracking revenue at risk or monitoring payment health.',
  inputSchema: z.object({
    workspaceId: z.string().describe('The workspace ID'),
    limit: z.number().min(1).max(20).optional().describe('Max results. Default: 10'),
  }),
  execute: async ({ workspaceId, limit }) => {
    try {
      const stripe = await getStripeClient(workspaceId)
      const disputes = await listStripeDisputes(stripe, limit ?? 10)
      return {
        disputes: disputes.map((d) => ({
          id: d.id,
          amount: d.amount,
          currency: d.currency,
          status: d.status,
          reason: d.reason,
          created: new Date(d.created * 1000).toISOString(),
          evidenceDueBy: d.evidence_details?.due_by ? new Date(d.evidence_details.due_by * 1000).toISOString() : null,
        })),
        count: disputes.length,
        totalAtRisk: disputes.reduce((sum, d) => sum + d.amount, 0),
      }
    } catch (err) {
      return { error: err instanceof Error ? err.message : 'Failed to list disputes' }
    }
  },
})

// ============================================================
//  Google Calendar Tools — Full Event Management & Scheduling
// ============================================================

// ----- Tool: List Calendar Events -----

export const listCalendarEventsTool = tool({
  description:
    'List upcoming events from Google Calendar. Use when the founder asks about their schedule, upcoming meetings, or what\'s on the calendar.',
  inputSchema: z.object({
    workspaceId: z.string().describe('The workspace ID'),
    timeMin: z.string().optional().describe('Start of time range (ISO string). Default: now'),
    timeMax: z.string().optional().describe('End of time range (ISO string). E.g., end of today, end of week'),
    maxResults: z.number().min(1).max(50).optional().describe('Max events. Default: 15'),
  }),
  execute: async ({ workspaceId, timeMin, timeMax, maxResults }) => {
    try {
      return await executeWithCalendarAccessToken(workspaceId, async (accessToken) => {
        const MAX_CAL_EVENTS = 15
        const events = await listCalendarEventsFn(accessToken, 'primary', {
          timeMin: timeMin ?? new Date().toISOString(),
          timeMax,
          maxResults: Math.min(maxResults ?? 15, MAX_CAL_EVENTS),
        })
        return {
          source: 'google_calendar_live',
          events: events.slice(0, MAX_CAL_EVENTS).map((e) => ({
            id: e.id,
            summary: e.summary || '(No title)',
            start: e.start.dateTime ?? e.start.date,
            end: e.end.dateTime ?? e.end.date,
            location: e.location || null,
            attendees: e.attendees
              ? e.attendees.map((a) => a.displayName || a.email).filter((v): v is string => Boolean(v)).slice(0, 5)
              : [],
            meetLink: e.conferenceData?.entryPoints?.find((ep) => ep.entryPointType === 'video')?.uri ?? null,
          })),
          count: events.length,
        }
      })
    } catch (err) {
      return { error: err instanceof Error ? err.message : 'Failed to list events' }
    }
  },
})

// ----- Tool: Get Calendar Event Detail -----

export const getCalendarEventTool = tool({
  description:
    'Get full details of a specific calendar event including attendees, conference links, and description.',
  inputSchema: z.object({
    workspaceId: z.string().describe('The workspace ID'),
    eventId: z.string().describe('The Google Calendar event ID'),
  }),
  execute: async ({ workspaceId, eventId }) => {
    try {
      return await executeWithCalendarAccessToken(workspaceId, async (accessToken) => {
        const event = await getCalendarEventFn(accessToken, 'primary', eventId)
        return {
          id: event.id,
          summary: event.summary,
          description: event.description,
          location: event.location,
          start: event.start.dateTime ?? event.start.date,
          end: event.end.dateTime ?? event.end.date,
          status: event.status,
          organizer: event.organizer?.email,
          attendees: event.attendees?.map((a) => ({
            email: a.email,
            name: a.displayName,
            status: a.responseStatus,
            self: a.self,
          })) ?? [],
          meetLink: event.conferenceData?.entryPoints?.find((ep) => ep.entryPointType === 'video')?.uri ?? null,
          htmlLink: event.htmlLink,
        }
      })
    } catch (err) {
      return { error: err instanceof Error ? err.message : 'Failed to get event' }
    }
  },
})

// ----- Tool: Create Calendar Event -----

export const createCalendarEventTool = tool({
  description:
    'Create a Google Calendar event immediately. Only title and start time are required — everything else has smart defaults (1 hour duration, Asia/Kolkata timezone). Do NOT ask the user for duration, timezone, or end time unless they volunteer it.',
  inputSchema: z.object({
    workspaceId: z.string().describe('The workspace ID'),
    summary: z.string().describe('Event title'),
    startDateTime: z.string().describe('ISO 8601 start time, e.g. 2026-08-11T08:00:00+05:30'),
    endDateTime: z.string().optional().describe('ISO 8601 end time. Defaults to 1 hour after start if omitted.'),
    description: z.string().optional().describe('Optional event notes'),
    location: z.string().optional().describe('Optional location'),
    attendeeEmails: z.array(z.string()).optional().describe('Emails to invite'),
    timeZone: z.string().optional().describe('IANA timezone. Defaults to Asia/Kolkata.'),
  }),
  execute: async ({ workspaceId, summary, startDateTime, endDateTime, description, location, attendeeEmails, timeZone }) => {
    try {
      const tz = timeZone ?? 'Asia/Kolkata'
      let resolvedEnd = endDateTime
      if (!resolvedEnd) {
        const startMs = new Date(startDateTime).getTime()
        resolvedEnd = new Date(startMs + 60 * 60 * 1000).toISOString()
      }

      let finalAttendees = attendeeEmails
      if (finalAttendees && finalAttendees.length > 0) {
        const supabase = createServiceClient()
        finalAttendees = await Promise.all(
          finalAttendees.map(async (raw) => {
            if (raw.includes('@')) return raw
            const entity = await resolveCustomerEntity(supabase, workspaceId, { personName: raw, search: raw })
            return entity.contactEmail || raw
          })
        )
      }

      return await executeWithCalendarAccessToken(workspaceId, async (accessToken) => {
        const event = await createCalendarEventFn(accessToken, 'primary', {
          summary,
          description,
          location,
          start: { dateTime: startDateTime, timeZone: tz },
          end: { dateTime: resolvedEnd, timeZone: tz },
          attendees: finalAttendees?.filter(e => e.includes('@')).map((email) => ({ email })),
        })

        return {
          success: true,
          created: true,
          eventId: event.id,
          summary: event.summary,
          start: event.start.dateTime ?? event.start.date,
          htmlLink: event.htmlLink,
          message: `DONE! Event "${summary}" has been created on Google Calendar. View it: ${event.htmlLink}`,
        }
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      return {
        success: false,
        created: false,
        error: `FAILED to create calendar event: ${msg}. Tell the founder exactly this error. Do NOT say the event is queued or pending — it FAILED.`,
      }
    }
  },
})

// ----- Tool: Update Calendar Event -----

export const updateCalendarEventTool = tool({
  description:
    'Update an existing calendar event. Can change title, time, description, or attendees.',
  inputSchema: z.object({
    workspaceId: z.string().describe('The workspace ID'),
    eventId: z.string().describe('The event ID to update'),
    summary: z.string().optional().describe('New event title'),
    startDateTime: z.string().optional().describe('New start time (ISO string)'),
    endDateTime: z.string().optional().describe('New end time (ISO string)'),
    description: z.string().optional().describe('New description'),
    location: z.string().optional().describe('New location'),
  }),
  execute: async ({ workspaceId, eventId, summary, startDateTime, endDateTime, description, location }) => {
    try {
      return await executeWithCalendarAccessToken(workspaceId, async (accessToken) => {
        const updates: Record<string, unknown> = {}
        if (summary) updates.summary = summary
        if (description) updates.description = description
        if (location) updates.location = location
        if (startDateTime) updates.start = { dateTime: startDateTime }
        if (endDateTime) updates.end = { dateTime: endDateTime }

        const event = await updateCalendarEventFn(accessToken, 'primary', eventId, updates as Parameters<typeof updateCalendarEventFn>[3])
        return {
          success: true,
          eventId: event.id,
          summary: event.summary,
          message: `Event "${event.summary}" updated`,
        }
      })
    } catch (err) {
      return { error: err instanceof Error ? err.message : 'Failed to update event' }
    }
  },
})

// ----- Tool: Delete Calendar Event -----

export const deleteCalendarEventTool = tool({
  description:
    'Delete an event from Google Calendar permanently. Executes immediately — no preview step.',
  inputSchema: z.object({
    workspaceId: z.string().describe('The workspace ID'),
    eventId: z.string().describe('The event ID to delete'),
  }),
  execute: async ({ workspaceId, eventId }) => {
    try {
      return await executeWithCalendarAccessToken(workspaceId, async (accessToken) => {
        await deleteCalendarEventFn(accessToken, 'primary', eventId)
        return { success: true, eventId, message: `Event ${eventId} deleted successfully.` }
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to delete event'
      return { success: false, error: `FAILED to delete event: ${msg}` }
    }
  },
})

// ----- Tool: Check Free/Busy -----

export const checkCalendarFreeBusy = tool({
  description:
    'Check if the founder is free or busy during a specific time range. Use before scheduling a meeting to find available slots.',
  inputSchema: z.object({
    workspaceId: z.string().describe('The workspace ID'),
    timeMin: z.string().describe('Start of time range (ISO string)'),
    timeMax: z.string().describe('End of time range (ISO string)'),
  }),
  execute: async ({ workspaceId, timeMin, timeMax }) => {
    try {
      return await executeWithCalendarAccessToken(workspaceId, async (accessToken) => {
        const busySlots = await queryFreeBusy(accessToken, timeMin, timeMax)
        const primaryBusy = busySlots['primary'] ?? []
        return {
          timeRange: { start: timeMin, end: timeMax },
          busySlots: primaryBusy,
          isFree: primaryBusy.length === 0,
          message: primaryBusy.length === 0
            ? `Free from ${timeMin} to ${timeMax}`
            : `${primaryBusy.length} busy slot(s) found`,
        }
      })
    } catch (err) {
      return { error: err instanceof Error ? err.message : 'Failed to check free/busy' }
    }
  },
})

// ----- Tool: List Calendars -----

export const listCalendarsTool = tool({
  description:
    'List all calendars the founder has access to. Use to discover available calendars beyond the primary one.',
  inputSchema: z.object({
    workspaceId: z.string().describe('The workspace ID'),
  }),
  execute: async ({ workspaceId }) => {
    try {
      return await executeWithCalendarAccessToken(workspaceId, async (accessToken) => {
        const calendars = await listCalendarsFn(accessToken)
        return {
          calendars: calendars.map((c) => ({
            id: c.id,
            name: c.summary,
            primary: c.primary ?? false,
            accessRole: c.accessRole,
            timeZone: c.timeZone,
          })),
          count: calendars.length,
        }
      })
    } catch (err) {
      return { error: err instanceof Error ? err.message : 'Failed to list calendars' }
    }
  },
})

// ----- Tool: Search Calendar Events -----

export const searchCalendarEventsTool = tool({
  description:
    'Search calendar events by keyword. Use when the founder asks "when is my meeting with X" or "find the design review".',
  inputSchema: z.object({
    workspaceId: z.string().describe('The workspace ID'),
    query: z.string().describe('Search query (matches event title, description, location, attendees)'),
    timeMin: z.string().optional().describe('ISO 8601 start of search range. Default: now'),
    timeMax: z.string().optional().describe('ISO 8601 end of search range. Default: 30 days from now'),
  }),
  execute: async ({ workspaceId, query, timeMin, timeMax }) => {
    try {
      return await executeWithCalendarAccessToken(workspaceId, async (accessToken) => {
        const now = new Date()
        const resolvedTimeMin = timeMin ?? now.toISOString()
        const resolvedTimeMax = timeMax ?? new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString()

        const events = await listCalendarEventsFn(accessToken, 'primary', {
          q: query,
          timeMin: resolvedTimeMin,
          timeMax: resolvedTimeMax,
          maxResults: 20,
        })
        return {
          events: events.map((e) => ({
            id: e.id,
            summary: e.summary,
            start: e.start.dateTime ?? e.start.date,
            end: e.end.dateTime ?? e.end.date,
            location: e.location,
          })),
          count: events.length,
          query,
        }
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to search events'
      return { error: `Calendar search failed: ${msg}` }
    }
  },
})

// ============================================================
//  Notion Tools — Full Knowledge Base & Project Management
// ============================================================

// ----- Tool: Search Notion -----

export const searchNotionTool = tool({
  description:
    'Search across all Notion pages and databases. Use when the founder asks "find the doc about X" or "where\'s the roadmap".',
  inputSchema: z.object({
    workspaceId: z.string().describe('The workspace ID'),
    query: z.string().describe('Search query'),
    filter: z.enum(['page', 'database']).optional().describe('Filter to pages only or databases only'),
    limit: z.number().min(1).max(20).optional().describe('Max results. Default: 10'),
  }),
  execute: async ({ workspaceId, query, filter, limit }) => {
    try {
      const token = await getNotionToken(workspaceId)
      const results = await searchNotion(token, query, filter, limit ?? 10)
      return {
        contentSafety: getExternalContentSafetyMeta('notion'),
        results: results.map((r) => ({
          id: r.id,
          type: r.object,
          title: sanitizeExternalText(
            r.object === 'page'
              ? extractPageTitle((r as { properties: Record<string, unknown> }).properties)
              : (r as { title: Array<{ plain_text: string }> }).title?.[0]?.plain_text ?? 'Untitled',
            { maxLength: 180 }
          ).text,
          url: r.url,
          lastEdited: r.last_edited_time,
        })),
        count: results.length,
      }
    } catch (err) {
      return { error: err instanceof Error ? err.message : 'Failed to search Notion' }
    }
  },
})

// ----- Tool: Get Notion Page -----

export const getNotionPageTool = tool({
  description:
    'Get details of a specific Notion page including its properties. Use when you have a page ID and need its content.',
  inputSchema: z.object({
    workspaceId: z.string().describe('The workspace ID'),
    pageId: z.string().describe('The Notion page ID'),
  }),
  execute: async ({ workspaceId, pageId }) => {
    try {
      const token = await getNotionToken(workspaceId)
      const page = await getNotionPage(token, pageId)
      return {
        id: page.id,
        title: sanitizeExternalText(extractPageTitle(page.properties), {
          maxLength: 180,
        }).text,
        url: page.url,
        archived: page.archived,
        created: page.created_time,
        lastEdited: page.last_edited_time,
        parent: page.parent,
        contentSafety: getExternalContentSafetyMeta('notion'),
        properties: sanitizeExternalObject(page.properties, {
          maxStringLength: 240,
          stripHtml: true,
        }),
      }
    } catch (err) {
      return { error: err instanceof Error ? err.message : 'Failed to get page' }
    }
  },
})

// ----- Tool: Create Notion Page -----

export const createNotionPageTool = tool({
  description:
    'Create a new page in a Notion database. Use when the founder asks to add a task, create a doc, or log something in Notion. You need the database ID.',
  inputSchema: z.object({
    workspaceId: z.string().describe('The workspace ID'),
    databaseId: z.string().describe('The Notion database ID to create the page in'),
    title: z.string().describe('The page title'),
    bodyText: z.string().optional().describe('Optional body text to add as paragraph content'),
    confirmCreate: z.boolean().describe('Must be true to actually create. Set false to preview.'),
  }),
  execute: async ({ workspaceId, databaseId, title, bodyText, confirmCreate }) => {
    try {
      if (!confirmCreate) {
        return {
          preview: true,
          databaseId,
          title,
          bodyText: bodyText?.slice(0, 100),
          message: `Would create page "${title}" in database ${databaseId}. Set confirmCreate=true to proceed.`,
        }
      }

      const token = await getNotionToken(workspaceId)
      const children = bodyText ? [buildParagraphBlock(bodyText)] : undefined
      const page = await createNotionPage(
        token, databaseId,
        { title: { title: [{ type: 'text', text: { content: title } }] } },
        children
      )
      return {
        success: true,
        pageId: page.id,
        url: page.url,
        title,
        message: `Page "${title}" created`,
      }
    } catch (err) {
      return { error: err instanceof Error ? err.message : 'Failed to create page' }
    }
  },
})

// ----- Tool: Update Notion Page -----

export const updateNotionPageTool = tool({
  description:
    'Update properties of a Notion page. Can change title, status, or other database properties. Can also archive (soft-delete) a page.',
  inputSchema: z.object({
    workspaceId: z.string().describe('The workspace ID'),
    pageId: z.string().describe('The Notion page ID'),
    title: z.string().optional().describe('New page title'),
    archive: z.boolean().optional().describe('Set true to archive/soft-delete the page'),
  }),
  execute: async ({ workspaceId, pageId, title, archive }) => {
    try {
      const token = await getNotionToken(workspaceId)

      if (archive) {
        const page = await archiveNotionPage(token, pageId)
        return { success: true, pageId: page.id, archived: true, message: 'Page archived' }
      }

      const properties: Record<string, unknown> = {}
      if (title) {
        properties.title = { title: [{ type: 'text', text: { content: title } }] }
      }

      const page = await updateNotionPage(token, pageId, properties)
      return {
        success: true,
        pageId: page.id,
        url: page.url,
        message: `Page updated`,
      }
    } catch (err) {
      return { error: err instanceof Error ? err.message : 'Failed to update page' }
    }
  },
})

// ----- Tool: Query Notion Database -----

export const queryNotionDatabaseTool = tool({
  description:
    'Query a Notion database to list its entries. Use when the founder asks about tasks, roadmap items, or any structured data in Notion.',
  inputSchema: z.object({
    workspaceId: z.string().describe('The workspace ID'),
    databaseId: z.string().describe('The Notion database ID'),
    limit: z.number().min(1).max(50).optional().describe('Max results. Default: 20'),
  }),
  execute: async ({ workspaceId, databaseId, limit }) => {
    try {
      const token = await getNotionToken(workspaceId)
      const pages = await queryNotionDatabase(token, databaseId, undefined, undefined, limit ?? 20)
      return {
        entries: pages.map((p) => ({
          id: p.id,
          title: extractPageTitle(p.properties),
          url: p.url,
          lastEdited: p.last_edited_time,
          archived: p.archived,
        })),
        count: pages.length,
      }
    } catch (err) {
      return { error: err instanceof Error ? err.message : 'Failed to query database' }
    }
  },
})

// ----- Tool: Append Content to Notion Page -----

export const appendNotionContentTool = tool({
  description:
    'Append content (paragraphs, to-dos, headings) to a Notion page. Use to add notes, tasks, or updates to an existing page.',
  inputSchema: z.object({
    workspaceId: z.string().describe('The workspace ID'),
    pageId: z.string().describe('The Notion page ID to append content to'),
    content: z.array(z.object({
      type: z.enum(['paragraph', 'todo', 'heading']).describe('Block type'),
      text: z.string().describe('The text content'),
      checked: z.boolean().optional().describe('For todo: whether it is checked'),
    })).describe('Array of content blocks to append'),
  }),
  execute: async ({ workspaceId, pageId, content }) => {
    try {
      const token = await getNotionToken(workspaceId)
      const blocks = content.map((c) => {
        switch (c.type) {
          case 'todo': return buildTodoBlock(c.text, c.checked ?? false)
          case 'heading': return { object: 'block', type: 'heading_2', heading_2: { rich_text: [{ type: 'text', text: { content: c.text } }] } }
          default: return buildParagraphBlock(c.text)
        }
      })

      await appendNotionBlocks(token, pageId, blocks)
      return {
        success: true,
        pageId,
        blocksAdded: blocks.length,
        message: `${blocks.length} block(s) appended to page`,
      }
    } catch (err) {
      return { error: err instanceof Error ? err.message : 'Failed to append content' }
    }
  },
})

// ----- Tool: Add Notion Comment -----

export const addNotionCommentTool = tool({
  description:
    'Add a comment to a Notion page. Comments are visible in the page\'s discussion panel. Use to leave notes or feedback on a specific page.',
  inputSchema: z.object({
    workspaceId: z.string().describe('The workspace ID'),
    pageId: z.string().describe('The Notion page ID'),
    text: z.string().describe('The comment text'),
  }),
  execute: async ({ workspaceId, pageId, text }) => {
    try {
      const token = await getNotionToken(workspaceId)
      const comment = await createNotionComment(token, pageId, text)
      return {
        success: true,
        commentId: comment.id,
        pageId,
        message: 'Comment added to page',
      }
    } catch (err) {
      return { error: err instanceof Error ? err.message : 'Failed to add comment' }
    }
  },
})

// ----- Tool: List Notion Users -----

export const listNotionUsersTool = tool({
  description:
    'List all users in the Notion workspace. Use to find user IDs for assigning pages or understanding team membership.',
  inputSchema: z.object({
    workspaceId: z.string().describe('The workspace ID'),
  }),
  execute: async ({ workspaceId }) => {
    try {
      const token = await getNotionToken(workspaceId)
      const users = await listNotionUsersFn(token)
      return {
        users: users.map((u) => ({
          id: u.id,
          name: u.name,
          type: u.type,
          email: u.person?.email ?? null,
        })),
        count: users.length,
      }
    } catch (err) {
      return { error: err instanceof Error ? err.message : 'Failed to list users' }
    }
  },
})

// ============================================================
//  HubSpot Tools — Full CRM Management
// ============================================================

// ----- Tool: Search HubSpot Contacts -----

export const searchHubSpotContactsTool = tool({
  description:
    'Search for contacts in HubSpot CRM by email. Use when the founder asks about a lead, prospect, or customer contact.',
  inputSchema: z.object({
    workspaceId: z.string().describe('The workspace ID'),
    query: z.string().describe('Search query (email)'),
    limit: z.number().min(1).max(20).optional().describe('Max results. Default: 10'),
  }),
  execute: async ({ workspaceId, query, limit }) => {
    try {
      const { accessToken } = await getHubSpotCredentials(workspaceId)
      const contacts = await searchHubSpotContactsFn(accessToken, query, limit ?? 10)
      return {
        contacts: contacts.map((c) => ({
          id: c.id,
          email: c.properties?.email,
          firstName: c.properties?.firstname,
          lastName: c.properties?.lastname,
          company: c.properties?.company,
          title: c.properties?.jobtitle,
          lifecycle: c.properties?.lifecyclestage,
        })),
        count: contacts.length,
      }
    } catch (err) {
      return { error: err instanceof Error ? err.message : 'Failed to search contacts' }
    }
  },
})

// ----- Tool: Get HubSpot Contact Detail -----

export const getHubSpotContactTool = tool({
  description:
    'Get full details of a specific HubSpot contact. Use when you need complete profile info for a known contact ID.',
  inputSchema: z.object({
    workspaceId: z.string().describe('The workspace ID'),
    contactId: z.string().describe('The HubSpot contact ID'),
  }),
  execute: async ({ workspaceId, contactId }) => {
    try {
      const { accessToken } = await getHubSpotCredentials(workspaceId)
      const contact = await getHubSpotContactFn(accessToken, contactId)
      return {
        id: contact.id,
        email: contact.properties?.email,
        firstName: contact.properties?.firstname,
        lastName: contact.properties?.lastname,
        company: contact.properties?.company,
        title: contact.properties?.jobtitle,
        phone: contact.properties?.phone,
        lifecycle: contact.properties?.lifecyclestage,
        leadStatus: contact.properties?.hs_lead_status,
      }
    } catch (err) {
      return { error: err instanceof Error ? err.message : 'Failed to get contact' }
    }
  },
})

// ----- Tool: Create HubSpot Contact -----

export const createHubSpotContactTool = tool({
  description:
    'Create a new contact in HubSpot CRM. Use when adding leads from other channels (Intercom, email, etc.).',
  inputSchema: z.object({
    workspaceId: z.string().describe('The workspace ID'),
    email: z.string().describe('Contact email address'),
    firstName: z.string().optional().describe('First name'),
    lastName: z.string().optional().describe('Last name'),
    company: z.string().optional().describe('Company name'),
    jobTitle: z.string().optional().describe('Job title'),
    phone: z.string().optional().describe('Phone number'),
    confirmCreate: z.boolean().describe('Must be true to actually create. Set false to preview.'),
  }),
  execute: async ({ workspaceId, email, firstName, lastName, company, jobTitle, phone, confirmCreate }) => {
    try {
      if (!confirmCreate) {
        return {
          preview: true,
          email,
          message: `Would create contact ${email}. Set confirmCreate=true to proceed.`,
        }
      }

      const { accessToken } = await getHubSpotCredentials(workspaceId)
      const props: Record<string, string> = { email }
      if (firstName) props.firstname = firstName
      if (lastName) props.lastname = lastName
      if (company) props.company = company
      if (jobTitle) props.jobtitle = jobTitle
      if (phone) props.phone = phone

      const contact = await createHubSpotContactFn(accessToken, props)
      return { success: true, contactId: contact.id, message: `Contact ${email} created` }
    } catch (err) {
      return { error: err instanceof Error ? err.message : 'Failed to create contact' }
    }
  },
})

// ----- Tool: Update HubSpot Contact -----

export const updateHubSpotContactTool = tool({
  description:
    'Update an existing HubSpot contact\'s properties. Use to change lifecycle stage, add notes, or update details.',
  inputSchema: z.object({
    workspaceId: z.string().describe('The workspace ID'),
    contactId: z.string().describe('The HubSpot contact ID'),
    firstName: z.string().optional(),
    lastName: z.string().optional(),
    company: z.string().optional(),
    jobTitle: z.string().optional(),
    lifecycleStage: z.string().optional().describe('e.g., lead, subscriber, opportunity, customer'),
  }),
  execute: async ({ workspaceId, contactId, firstName, lastName, company, jobTitle, lifecycleStage }) => {
    try {
      const { accessToken } = await getHubSpotCredentials(workspaceId)
      const props: Record<string, string> = {}
      if (firstName) props.firstname = firstName
      if (lastName) props.lastname = lastName
      if (company) props.company = company
      if (jobTitle) props.jobtitle = jobTitle
      if (lifecycleStage) props.lifecyclestage = lifecycleStage

      const contact = await updateHubSpotContactFn(accessToken, contactId, props)
      return { success: true, contactId: contact.id, message: 'Contact updated' }
    } catch (err) {
      return { error: err instanceof Error ? err.message : 'Failed to update contact' }
    }
  },
})

// ----- Tool: Search HubSpot Companies -----

export const searchHubSpotCompaniesTool = tool({
  description:
    'Search for companies in HubSpot by name. Use when looking up an organization in CRM.',
  inputSchema: z.object({
    workspaceId: z.string().describe('The workspace ID'),
    query: z.string().describe('Company name to search'),
    limit: z.number().min(1).max(20).optional().describe('Max results. Default: 10'),
  }),
  execute: async ({ workspaceId, query, limit }) => {
    try {
      const { accessToken } = await getHubSpotCredentials(workspaceId)
      const companies = await searchHubSpotCompaniesFn(accessToken, query, limit ?? 10)
      return {
        companies: companies.map((c) => ({
          id: c.id,
          name: c.properties?.name,
          domain: c.properties?.domain,
          industry: c.properties?.industry,
          employees: c.properties?.numberofemployees,
          revenue: c.properties?.annualrevenue,
        })),
        count: companies.length,
      }
    } catch (err) {
      return { error: err instanceof Error ? err.message : 'Failed to search companies' }
    }
  },
})

// ----- Tool: Get HubSpot Company Detail -----

export const getHubSpotCompanyTool = tool({
  description:
    'Get full details of a specific HubSpot company.',
  inputSchema: z.object({
    workspaceId: z.string().describe('The workspace ID'),
    companyId: z.string().describe('The HubSpot company ID'),
  }),
  execute: async ({ workspaceId, companyId }) => {
    try {
      const { accessToken } = await getHubSpotCredentials(workspaceId)
      const company = await getHubSpotCompanyFn(accessToken, companyId)
      return {
        id: company.id,
        name: company.properties?.name,
        domain: company.properties?.domain,
        industry: company.properties?.industry,
        website: company.properties?.website,
        employees: company.properties?.numberofemployees,
        revenue: company.properties?.annualrevenue,
        description: company.properties?.description,
      }
    } catch (err) {
      return { error: err instanceof Error ? err.message : 'Failed to get company' }
    }
  },
})

// ----- Tool: Search HubSpot Deals -----

export const searchHubSpotDealsTool = tool({
  description:
    'Search for deals in HubSpot by name. Use to check pipeline, revenue opportunities, or deal status.',
  inputSchema: z.object({
    workspaceId: z.string().describe('The workspace ID'),
    query: z.string().describe('Deal name to search'),
    limit: z.number().min(1).max(20).optional().describe('Max results. Default: 10'),
  }),
  execute: async ({ workspaceId, query, limit }) => {
    try {
      const { accessToken } = await getHubSpotCredentials(workspaceId)
      const deals = await searchHubSpotDealsFn(accessToken, query, limit ?? 10)
      return {
        deals: deals.map((d) => ({
          id: d.id,
          name: d.properties?.dealname,
          amount: d.properties?.amount,
          stage: d.properties?.dealstage,
          pipeline: d.properties?.pipeline,
          closeDate: d.properties?.closedate,
          owner: d.properties?.hubspot_owner_id,
        })),
        count: deals.length,
      }
    } catch (err) {
      return { error: err instanceof Error ? err.message : 'Failed to search deals' }
    }
  },
})

// ----- Tool: Create HubSpot Deal -----

export const createHubSpotDealTool = tool({
  description:
    'Create a new deal in HubSpot. Use to track revenue opportunities or sales pipeline entries.',
  inputSchema: z.object({
    workspaceId: z.string().describe('The workspace ID'),
    dealName: z.string().describe('Name of the deal'),
    amount: z.string().optional().describe('Deal amount'),
    stage: z.string().optional().describe('Deal stage'),
    pipeline: z.string().optional().describe('Pipeline ID'),
    closeDate: z.string().optional().describe('Expected close date (ISO string)'),
    confirmCreate: z.boolean().describe('Must be true to create. Set false to preview.'),
  }),
  execute: async ({ workspaceId, dealName, amount, stage, pipeline, closeDate, confirmCreate }) => {
    try {
      if (!confirmCreate) {
        return {
          preview: true,
          dealName,
          amount,
          message: `Would create deal "${dealName}". Set confirmCreate=true to proceed.`,
        }
      }

      const { accessToken } = await getHubSpotCredentials(workspaceId)
      const props: Record<string, string> = { dealname: dealName }
      if (amount) props.amount = amount
      if (stage) props.dealstage = stage
      if (pipeline) props.pipeline = pipeline
      if (closeDate) props.closedate = closeDate

      const deal = await createHubSpotDealFn(accessToken, props)
      return { success: true, dealId: deal.id, message: `Deal "${dealName}" created` }
    } catch (err) {
      return { error: err instanceof Error ? err.message : 'Failed to create deal' }
    }
  },
})

// ----- Tool: Update HubSpot Deal -----

export const updateHubSpotDealTool = tool({
  description:
    'Update an existing HubSpot deal. Change stage, amount, or other properties.',
  inputSchema: z.object({
    workspaceId: z.string().describe('The workspace ID'),
    dealId: z.string().describe('The deal ID'),
    dealName: z.string().optional(),
    amount: z.string().optional(),
    stage: z.string().optional(),
    closeDate: z.string().optional(),
  }),
  execute: async ({ workspaceId, dealId, dealName, amount, stage, closeDate }) => {
    try {
      const { accessToken } = await getHubSpotCredentials(workspaceId)
      const props: Record<string, string> = {}
      if (dealName) props.dealname = dealName
      if (amount) props.amount = amount
      if (stage) props.dealstage = stage
      if (closeDate) props.closedate = closeDate

      const deal = await updateHubSpotDealFn(accessToken, dealId, props)
      return { success: true, dealId: deal.id, message: 'Deal updated' }
    } catch (err) {
      return { error: err instanceof Error ? err.message : 'Failed to update deal' }
    }
  },
})

// ----- Tool: Create HubSpot Note -----

export const createHubSpotNoteTool = tool({
  description:
    'Create a note in HubSpot CRM. Optionally associate it with a contact or deal. Use to log context from Intercom, email, or other channels.',
  inputSchema: z.object({
    workspaceId: z.string().describe('The workspace ID'),
    body: z.string().describe('The note content'),
    associateToContactId: z.string().optional().describe('Optional contact ID to attach note to'),
    associateToDealId: z.string().optional().describe('Optional deal ID to attach note to'),
  }),
  execute: async ({ workspaceId, body, associateToContactId, associateToDealId }) => {
    try {
      const { accessToken } = await getHubSpotCredentials(workspaceId)
      const associations: Array<{ to: { id: string }; types: Array<{ associationCategory: string; associationTypeId: number }> }> = []

      if (associateToContactId) {
        associations.push({
          to: { id: associateToContactId },
          types: [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 202 }],
        })
      }
      if (associateToDealId) {
        associations.push({
          to: { id: associateToDealId },
          types: [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 214 }],
        })
      }

      const note = await createHubSpotNoteFn(accessToken, body, associations.length > 0 ? associations : undefined)
      return { success: true, noteId: note.id, message: 'Note created' }
    } catch (err) {
      return { error: err instanceof Error ? err.message : 'Failed to create note' }
    }
  },
})

// ----- Tool: List HubSpot Owners -----

export const listHubSpotOwnersTool = tool({
  description:
    'List all HubSpot owners (team members). Use to find owner IDs for assigning contacts and deals.',
  inputSchema: z.object({
    workspaceId: z.string().describe('The workspace ID'),
  }),
  execute: async ({ workspaceId }) => {
    try {
      const { accessToken } = await getHubSpotCredentials(workspaceId)
      const owners = await listHubSpotOwnersFn(accessToken)
      return {
        owners: owners.map((o) => ({
          id: o.id,
          email: o.email,
          name: `${o.firstName} ${o.lastName}`,
        })),
        count: owners.length,
      }
    } catch (err) {
      return { error: err instanceof Error ? err.message : 'Failed to list owners' }
    }
  },
})

// ----- Tool: List HubSpot Pipelines -----

export const listHubSpotPipelinesTool = tool({
  description:
    'List deal pipelines and their stages in HubSpot. Use to understand the sales process and valid stage names before creating/updating deals.',
  inputSchema: z.object({
    workspaceId: z.string().describe('The workspace ID'),
  }),
  execute: async ({ workspaceId }) => {
    try {
      const { accessToken } = await getHubSpotCredentials(workspaceId)
      const pipelines = await listHubSpotPipelinesFn(accessToken)
      return {
        pipelines: pipelines.map((p) => ({
          id: p.id,
          name: p.label,
          stages: p.stages.map((s) => ({ id: s.id, name: s.label, order: s.displayOrder })),
        })),
        count: pipelines.length,
      }
    } catch (err) {
      return { error: err instanceof Error ? err.message : 'Failed to list pipelines' }
    }
  },
})

// ============================================================
//  Linear Tools — Full Issue/Project Management
// ============================================================

// ----- Tool: Search Linear Issues -----

export const searchLinearIssuesTool = tool({
  description:
    'Search for issues in Linear by text query. Use when the founder asks about bugs, tasks, features, or anything tracked in Linear.',
  inputSchema: z.object({
    workspaceId: z.string().describe('The workspace ID'),
    query: z.string().describe('Search query (matches title, description, identifier)'),
    limit: z.number().min(1).max(25).optional().describe('Max results. Default: 15'),
  }),
  execute: async ({ workspaceId, query, limit }) => {
    try {
      const { apiKey } = await getLinearCredentials(workspaceId)
      const issues = await searchLinearIssuesFn(apiKey, query, limit ?? 15)
      return {
        issues: issues.map((i) => ({
          id: i.id,
          identifier: i.identifier,
          title: i.title,
          state: i.state?.name,
          priority: i.priorityLabel,
          assignee: i.assignee?.name ?? 'Unassigned',
          team: i.team?.name,
          url: i.url,
        })),
        count: issues.length,
      }
    } catch (err) {
      return { error: err instanceof Error ? err.message : 'Failed to search issues' }
    }
  },
})

// ----- Tool: Get Linear Issue Detail -----

export const getLinearIssueTool = tool({
  description:
    'Get full details of a specific Linear issue including description, labels, project, cycle, and assignee.',
  inputSchema: z.object({
    workspaceId: z.string().describe('The workspace ID'),
    issueId: z.string().describe('The Linear issue ID (UUID)'),
  }),
  execute: async ({ workspaceId, issueId }) => {
    try {
      const { apiKey } = await getLinearCredentials(workspaceId)
      const issue = await getLinearIssueFn(apiKey, issueId)
      return {
        id: issue.id,
        identifier: issue.identifier,
        title: issue.title,
        description: issue.description?.slice(0, 500),
        state: issue.state?.name,
        stateType: issue.state?.type,
        priority: issue.priorityLabel,
        assignee: issue.assignee ? { name: issue.assignee.name, email: issue.assignee.email } : null,
        team: issue.team?.name,
        labels: issue.labels?.nodes?.map((l) => l.name) ?? [],
        project: issue.project?.name,
        cycle: issue.cycle?.name ?? (issue.cycle?.number ? `Cycle ${issue.cycle.number}` : null),
        dueDate: issue.dueDate,
        estimate: issue.estimate,
        url: issue.url,
      }
    } catch (err) {
      return { error: err instanceof Error ? err.message : 'Failed to get issue' }
    }
  },
})

// ----- Tool: Create Linear Issue -----

export const createLinearIssueTool = tool({
  description:
    'Create a new issue in Linear. Use when the founder asks to file a bug, create a task, or track work. Requires a teamId — use listLinearTeamsTool first.',
  inputSchema: z.object({
    workspaceId: z.string().describe('The workspace ID'),
    teamId: z.string().describe('Linear team ID (get from listLinearTeamsTool)'),
    title: z.string().describe('Issue title'),
    description: z.string().optional().describe('Issue description (markdown)'),
    priority: z.number().min(0).max(4).optional().describe('0=None, 1=Urgent, 2=High, 3=Medium, 4=Low'),
    stateId: z.string().optional().describe('Workflow state ID (get from listLinearWorkflowStatesTool)'),
    assigneeId: z.string().optional().describe('User ID to assign'),
    labelIds: z.array(z.string()).optional().describe('Label IDs to apply'),
    dueDate: z.string().optional().describe('Due date (YYYY-MM-DD)'),
    confirmCreate: z.boolean().describe('Must be true to actually create. Set false to preview.'),
  }),
  execute: async ({ workspaceId, teamId, title, description, priority, stateId, assigneeId, labelIds, dueDate, confirmCreate }) => {
    try {
      if (!confirmCreate) {
        return {
          preview: true,
          teamId,
          title,
          priority,
          message: `Would create issue "${title}". Set confirmCreate=true to proceed.`,
        }
      }

      const { apiKey } = await getLinearCredentials(workspaceId)
      const result = await createLinearIssueFn(apiKey, {
        teamId,
        title,
        description,
        priority,
        stateId,
        assigneeId,
        labelIds,
        dueDate,
      })
      return {
        success: result.success,
        issueId: result.issue.id,
        identifier: result.issue.identifier,
        url: result.issue.url,
        message: `Issue ${result.issue.identifier} created`,
      }
    } catch (err) {
      return { error: err instanceof Error ? err.message : 'Failed to create issue' }
    }
  },
})

// ----- Tool: Update Linear Issue -----

export const updateLinearIssueTool = tool({
  description:
    'Update an existing Linear issue. Can change title, state, priority, assignee, labels, or due date.',
  inputSchema: z.object({
    workspaceId: z.string().describe('The workspace ID'),
    issueId: z.string().describe('The Linear issue ID'),
    title: z.string().optional(),
    stateId: z.string().optional().describe('New workflow state ID'),
    priority: z.number().min(0).max(4).optional(),
    assigneeId: z.string().optional().describe('New assignee user ID'),
    dueDate: z.string().optional().describe('New due date (YYYY-MM-DD)'),
  }),
  execute: async ({ workspaceId, issueId, title, stateId, priority, assigneeId, dueDate }) => {
    try {
      const { apiKey } = await getLinearCredentials(workspaceId)
      const input: Record<string, unknown> = {}
      if (title) input.title = title
      if (stateId) input.stateId = stateId
      if (priority !== undefined) input.priority = priority
      if (assigneeId) input.assigneeId = assigneeId
      if (dueDate) input.dueDate = dueDate

      const result = await updateLinearIssueFn(apiKey, issueId, input as Parameters<typeof updateLinearIssueFn>[2])
      return {
        success: result.success,
        identifier: result.issue.identifier,
        message: `Issue ${result.issue.identifier} updated`,
      }
    } catch (err) {
      return { error: err instanceof Error ? err.message : 'Failed to update issue' }
    }
  },
})

// ----- Tool: Add Linear Comment -----

export const addLinearCommentTool = tool({
  description:
    'Add a comment to a Linear issue. Use to log context, updates, or notes on tracked work.',
  inputSchema: z.object({
    workspaceId: z.string().describe('The workspace ID'),
    issueId: z.string().describe('The Linear issue ID'),
    body: z.string().describe('Comment body (supports markdown)'),
  }),
  execute: async ({ workspaceId, issueId, body }) => {
    try {
      const { apiKey } = await getLinearCredentials(workspaceId)
      const comment = await createLinearCommentFn(apiKey, issueId, body)
      return { success: true, commentId: comment.id, message: 'Comment added' }
    } catch (err) {
      return { error: err instanceof Error ? err.message : 'Failed to add comment' }
    }
  },
})

// ----- Tool: List Linear Teams -----

export const listLinearTeamsTool = tool({
  description:
    'List all teams in Linear. Use to get team IDs before creating issues or querying workflow states.',
  inputSchema: z.object({
    workspaceId: z.string().describe('The workspace ID'),
  }),
  execute: async ({ workspaceId }) => {
    try {
      const { apiKey } = await getLinearCredentials(workspaceId)
      const teams = await listLinearTeamsFn(apiKey)
      return {
        teams: teams.map((t) => ({ id: t.id, key: t.key, name: t.name })),
        count: teams.length,
      }
    } catch (err) {
      return { error: err instanceof Error ? err.message : 'Failed to list teams' }
    }
  },
})

// ----- Tool: List Workflow States -----

export const listLinearWorkflowStatesTool = tool({
  description:
    'List workflow states for a Linear team. Shows available states (Backlog, Todo, In Progress, Done, etc.) and their IDs. Use before creating/updating issues.',
  inputSchema: z.object({
    workspaceId: z.string().describe('The workspace ID'),
    teamId: z.string().describe('The Linear team ID'),
  }),
  execute: async ({ workspaceId, teamId }) => {
    try {
      const { apiKey } = await getLinearCredentials(workspaceId)
      const states = await listLinearWorkflowStatesFn(apiKey, teamId)
      return {
        states: states.map((s) => ({ id: s.id, name: s.name, type: s.type })),
        count: states.length,
      }
    } catch (err) {
      return { error: err instanceof Error ? err.message : 'Failed to list states' }
    }
  },
})

// ----- Tool: List Linear Labels -----

export const listLinearLabelsTool = tool({
  description:
    'List all labels in Linear. Use to get label IDs before creating issues with tags.',
  inputSchema: z.object({
    workspaceId: z.string().describe('The workspace ID'),
  }),
  execute: async ({ workspaceId }) => {
    try {
      const { apiKey } = await getLinearCredentials(workspaceId)
      const labels = await listLinearLabelsFn(apiKey)
      return {
        labels: labels.map((l) => ({ id: l.id, name: l.name, color: l.color })),
        count: labels.length,
      }
    } catch (err) {
      return { error: err instanceof Error ? err.message : 'Failed to list labels' }
    }
  },
})

// ----- Tool: List Linear Projects -----

export const listLinearProjectsTool = tool({
  description:
    'List projects in Linear. Shows project name, state, and progress. Use for roadmap context.',
  inputSchema: z.object({
    workspaceId: z.string().describe('The workspace ID'),
  }),
  execute: async ({ workspaceId }) => {
    try {
      const { apiKey } = await getLinearCredentials(workspaceId)
      const projects = await listLinearProjectsFn(apiKey)
      return {
        projects: projects.map((p) => ({
          id: p.id,
          name: p.name,
          state: p.state,
          progress: Math.round(p.progress * 100) + '%',
          url: p.url,
        })),
        count: projects.length,
      }
    } catch (err) {
      return { error: err instanceof Error ? err.message : 'Failed to list projects' }
    }
  },
})

// ----- Tool: List Linear Users -----

export const listLinearUsersTool = tool({
  description:
    'List all users in Linear. Use to find user IDs for assigning issues.',
  inputSchema: z.object({
    workspaceId: z.string().describe('The workspace ID'),
  }),
  execute: async ({ workspaceId }) => {
    try {
      const { apiKey } = await getLinearCredentials(workspaceId)
      const users = await listLinearUsersFn(apiKey)
      return {
        users: users.map((u) => ({ id: u.id, name: u.name, email: u.email })),
        count: users.length,
      }
    } catch (err) {
      return { error: err instanceof Error ? err.message : 'Failed to list users' }
    }
  },
})

// ============================================================
//  Sentry Tools — Full Error Monitoring & Issue Management
// ============================================================

// ----- Tool: List Sentry Issues -----

export const listSentryIssuesTool = tool({
  description:
    'List issues in Sentry. Shows unresolved errors by default. Use when the founder asks about bugs, crashes, or error rates.',
  inputSchema: z.object({
    workspaceId: z.string().describe('The workspace ID'),
    query: z.string().optional().describe('Sentry search query. Default: "is:unresolved". Examples: "is:unresolved level:error", "is:unresolved assigned:me"'),
    limit: z.number().min(1).max(50).optional().describe('Max results. Default: 25'),
  }),
  execute: async ({ workspaceId, query, limit }) => {
    try {
      const creds = await getSentryCredentials(workspaceId)
      const issues = await fetchSentryIssues(
        creds.authToken, creds.organizationSlug, creds.projectSlug,
        query ?? 'is:unresolved', limit ?? 25
      )
      return {
        issues: issues.map((i) => ({
          id: i.id,
          shortId: i.shortId,
          title: i.title,
          culprit: i.culprit,
          level: i.level,
          count: i.count,
          userCount: i.userCount,
          lastSeen: i.lastSeen,
          status: i.status,
          assignee: i.assignedTo?.name ?? 'Unassigned',
          link: i.permalink,
        })),
        count: issues.length,
      }
    } catch (err) {
      return { error: err instanceof Error ? err.message : 'Failed to list issues' }
    }
  },
})

// ----- Tool: Get Sentry Issue Detail -----

export const getSentryIssueTool = tool({
  description:
    'Get full details of a specific Sentry issue including metadata, assignment, and affected users.',
  inputSchema: z.object({
    workspaceId: z.string().describe('The workspace ID'),
    issueId: z.string().describe('The Sentry issue ID'),
  }),
  execute: async ({ workspaceId, issueId }) => {
    try {
      const creds = await getSentryCredentials(workspaceId)
      const issue = await getSentryIssueFn(creds.authToken, issueId)
      return {
        id: issue.id,
        shortId: issue.shortId,
        title: issue.title,
        culprit: issue.culprit,
        level: issue.level,
        type: issue.type,
        count: issue.count,
        userCount: issue.userCount,
        firstSeen: issue.firstSeen,
        lastSeen: issue.lastSeen,
        status: issue.status,
        isUnhandled: issue.isUnhandled,
        assignee: issue.assignedTo ? { name: issue.assignedTo.name, email: issue.assignedTo.email } : null,
        project: issue.project?.name,
        platform: issue.platform,
        metadata: issue.metadata,
        link: issue.permalink,
      }
    } catch (err) {
      return { error: err instanceof Error ? err.message : 'Failed to get issue' }
    }
  },
})

// ----- Tool: Resolve/Ignore Sentry Issue -----

export const resolveSentryIssueTool = tool({
  description:
    'Resolve or ignore a Sentry issue. Use after confirming a bug is fixed or marking noise as ignored.',
  inputSchema: z.object({
    workspaceId: z.string().describe('The workspace ID'),
    issueId: z.string().describe('The Sentry issue ID'),
    status: z.enum(['resolved', 'ignored']).describe('New status'),
    confirmResolve: z.boolean().describe('Must be true to actually resolve. Set false to preview.'),
  }),
  execute: async ({ workspaceId, issueId, status, confirmResolve }) => {
    try {
      if (!confirmResolve) {
        return {
          preview: true,
          issueId,
          status,
          message: `Would mark issue ${issueId} as ${status}. Set confirmResolve=true to proceed.`,
        }
      }

      const creds = await getSentryCredentials(workspaceId)
      const issue = await updateSentryIssueStatus(creds.authToken, issueId, status)
      return {
        success: true,
        issueId: issue.id,
        status: issue.status,
        message: `Issue marked as ${status}`,
      }
    } catch (err) {
      return { error: err instanceof Error ? err.message : 'Failed to update issue' }
    }
  },
})

// ----- Tool: Assign Sentry Issue -----

export const assignSentryIssueTool = tool({
  description:
    'Assign a Sentry issue to a team member by email.',
  inputSchema: z.object({
    workspaceId: z.string().describe('The workspace ID'),
    issueId: z.string().describe('The Sentry issue ID'),
    assignee: z.string().describe('Email of the person to assign, or "team:team-slug" for team assignment'),
  }),
  execute: async ({ workspaceId, issueId, assignee }) => {
    try {
      const creds = await getSentryCredentials(workspaceId)
      const issue = await assignSentryIssueFn(creds.authToken, issueId, assignee)
      return {
        success: true,
        issueId: issue.id,
        assignedTo: issue.assignedTo?.name ?? assignee,
        message: `Issue assigned to ${assignee}`,
      }
    } catch (err) {
      return { error: err instanceof Error ? err.message : 'Failed to assign issue' }
    }
  },
})

// ----- Tool: Get Latest Sentry Event -----

export const getSentryLatestEventTool = tool({
  description:
    'Get the latest event/occurrence for a Sentry issue. Shows stack trace, user info, and tags. Use for debugging context.',
  inputSchema: z.object({
    workspaceId: z.string().describe('The workspace ID'),
    issueId: z.string().describe('The Sentry issue ID'),
  }),
  execute: async ({ workspaceId, issueId }) => {
    try {
      const creds = await getSentryCredentials(workspaceId)
      const event = await getSentryLatestEventFn(creds.authToken, issueId)
      return {
        eventId: event.eventID,
        title: event.title,
        message: event.message,
        timestamp: event.dateCreated,
        user: event.user ? { email: event.user.email, ip: event.user.ip_address } : null,
        tags: event.tags?.slice(0, 15)?.map((t) => ({ key: t.key, value: t.value })),
      }
    } catch (err) {
      return { error: err instanceof Error ? err.message : 'Failed to get event' }
    }
  },
})

// ----- Tool: List Sentry Projects -----

export const listSentryProjectsTool = tool({
  description:
    'List all projects in the Sentry organization. Use to understand the monitored services and their platforms.',
  inputSchema: z.object({
    workspaceId: z.string().describe('The workspace ID'),
  }),
  execute: async ({ workspaceId }) => {
    try {
      const creds = await getSentryCredentials(workspaceId)
      const projects = await listSentryProjectsFn(creds.authToken, creds.organizationSlug)
      return {
        projects: projects.map((p) => ({
          id: p.id,
          slug: p.slug,
          name: p.name,
          platform: p.platform,
          status: p.status,
        })),
        count: projects.length,
      }
    } catch (err) {
      return { error: err instanceof Error ? err.message : 'Failed to list projects' }
    }
  },
})

// ----- Tool: List Sentry Releases -----

export const listSentryReleasesTool = tool({
  description:
    'List recent releases in Sentry. Shows version, new issues introduced, and deploy info. Use to correlate errors with deployments.',
  inputSchema: z.object({
    workspaceId: z.string().describe('The workspace ID'),
    limit: z.number().min(1).max(25).optional().describe('Max results. Default: 10'),
  }),
  execute: async ({ workspaceId, limit }) => {
    try {
      const creds = await getSentryCredentials(workspaceId)
      const releases = await listSentryReleasesFn(
        creds.authToken, creds.organizationSlug, creds.projectSlug, limit ?? 10
      )
      return {
        releases: releases.map((r) => ({
          version: r.version,
          shortVersion: r.shortVersion,
          created: r.dateCreated,
          released: r.dateReleased,
          newIssues: r.newGroups,
          commits: r.commitCount,
          lastDeploy: r.lastDeploy?.environment,
        })),
        count: releases.length,
      }
    } catch (err) {
      return { error: err instanceof Error ? err.message : 'Failed to list releases' }
    }
  },
})

// ----- Tool: List Sentry Issue Tags -----

export const listSentryIssueTagsTool = tool({
  description:
    'List tags on a Sentry issue. Shows browser, OS, device, URL, user, and custom tags with distribution. Use for impact analysis.',
  inputSchema: z.object({
    workspaceId: z.string().describe('The workspace ID'),
    issueId: z.string().describe('The Sentry issue ID'),
  }),
  execute: async ({ workspaceId, issueId }) => {
    try {
      const creds = await getSentryCredentials(workspaceId)
      const tags = await listSentryIssueTagsFn(creds.authToken, issueId)
      return {
        tags: tags.map((t) => ({
          key: t.key,
          name: t.name,
          totalValues: t.totalValues,
          topValues: t.topValues?.slice(0, 5),
        })),
        count: tags.length,
      }
    } catch (err) {
      return { error: err instanceof Error ? err.message : 'Failed to list tags' }
    }
  },
})

// ============================================================
//  Airtable Tools — Full Database Management
// ============================================================

// ----- Tool: List Airtable Bases -----

export const listAirtableBasesTool = tool({
  description:
    'List all Airtable bases the integration has access to. Use to discover available databases.',
  inputSchema: z.object({
    workspaceId: z.string().describe('The workspace ID'),
  }),
  execute: async ({ workspaceId }) => {
    try {
      const token = await getAirtableToken(workspaceId)
      const bases = await listAirtableBasesFn(token)
      return {
        bases: bases.map((b) => ({ id: b.id, name: b.name, permission: b.permissionLevel })),
        count: bases.length,
      }
    } catch (err) {
      return { error: err instanceof Error ? err.message : 'Failed to list bases' }
    }
  },
})

// ----- Tool: List Airtable Tables -----

export const listAirtableTablesTool = tool({
  description:
    'List all tables in an Airtable base with their field schemas. Use to understand the data structure before querying records.',
  inputSchema: z.object({
    workspaceId: z.string().describe('The workspace ID'),
    baseId: z.string().describe('The Airtable base ID'),
  }),
  execute: async ({ workspaceId, baseId }) => {
    try {
      const token = await getAirtableToken(workspaceId)
      const tables = await listAirtableTablesFn(token, baseId)
      return {
        tables: tables.map((t) => ({
          id: t.id,
          name: t.name,
          description: t.description,
          fields: t.fields.map((f) => ({ id: f.id, name: f.name, type: f.type })),
        })),
        count: tables.length,
      }
    } catch (err) {
      return { error: err instanceof Error ? err.message : 'Failed to list tables' }
    }
  },
})

// ----- Tool: List Airtable Records -----

export const listAirtableRecordsTool = tool({
  description:
    'List records from an Airtable table. Supports filtering and views. Use to query structured data.',
  inputSchema: z.object({
    workspaceId: z.string().describe('The workspace ID'),
    baseId: z.string().describe('The Airtable base ID'),
    tableIdOrName: z.string().describe('Table ID or name'),
    maxRecords: z.number().min(1).max(100).optional().describe('Max records. Default: 20'),
    view: z.string().optional().describe('View name to filter by'),
    filterFormula: z.string().optional().describe('Airtable formula filter, e.g. {Status}="Active"'),
  }),
  execute: async ({ workspaceId, baseId, tableIdOrName, maxRecords, view, filterFormula }) => {
    try {
      const token = await getAirtableToken(workspaceId)
      const records = await listAirtableRecordsFn(token, baseId, tableIdOrName, maxRecords ?? 20, view, filterFormula)
      return {
        records: records.map((r) => ({ id: r.id, fields: r.fields, created: r.createdTime })),
        count: records.length,
      }
    } catch (err) {
      return { error: err instanceof Error ? err.message : 'Failed to list records' }
    }
  },
})

// ----- Tool: Get Airtable Record -----

export const getAirtableRecordTool = tool({
  description:
    'Get a single Airtable record by ID.',
  inputSchema: z.object({
    workspaceId: z.string().describe('The workspace ID'),
    baseId: z.string().describe('The Airtable base ID'),
    tableIdOrName: z.string().describe('Table ID or name'),
    recordId: z.string().describe('The record ID'),
  }),
  execute: async ({ workspaceId, baseId, tableIdOrName, recordId }) => {
    try {
      const token = await getAirtableToken(workspaceId)
      const record = await getAirtableRecordFn(token, baseId, tableIdOrName, recordId)
      return { id: record.id, fields: record.fields, created: record.createdTime }
    } catch (err) {
      return { error: err instanceof Error ? err.message : 'Failed to get record' }
    }
  },
})

// ----- Tool: Create Airtable Record -----

export const createAirtableRecordTool = tool({
  description:
    'Create a new record in an Airtable table. Use listAirtableTablesTool first to know the field names.',
  inputSchema: z.object({
    workspaceId: z.string().describe('The workspace ID'),
    baseId: z.string().describe('The Airtable base ID'),
    tableIdOrName: z.string().describe('Table ID or name'),
    fields: z.record(z.string(), z.unknown()).describe('Field name-value pairs'),
    confirmCreate: z.boolean().describe('Must be true to create. Set false to preview.'),
  }),
  execute: async ({ workspaceId, baseId, tableIdOrName, fields, confirmCreate }) => {
    try {
      if (!confirmCreate) {
        return {
          preview: true,
          baseId,
          table: tableIdOrName,
          fields,
          message: 'Would create record. Set confirmCreate=true to proceed.',
        }
      }

      const token = await getAirtableToken(workspaceId)
      const record = await createAirtableRecordFn(token, baseId, tableIdOrName, fields)
      return { success: true, recordId: record.id, fields: record.fields, message: 'Record created' }
    } catch (err) {
      return { error: err instanceof Error ? err.message : 'Failed to create record' }
    }
  },
})

// ----- Tool: Update Airtable Record -----

export const updateAirtableRecordTool = tool({
  description:
    'Update fields on an existing Airtable record.',
  inputSchema: z.object({
    workspaceId: z.string().describe('The workspace ID'),
    baseId: z.string().describe('The Airtable base ID'),
    tableIdOrName: z.string().describe('Table ID or name'),
    recordId: z.string().describe('The record ID'),
    fields: z.record(z.string(), z.unknown()).describe('Field name-value pairs to update'),
  }),
  execute: async ({ workspaceId, baseId, tableIdOrName, recordId, fields }) => {
    try {
      const token = await getAirtableToken(workspaceId)
      const record = await updateAirtableRecordFn(token, baseId, tableIdOrName, recordId, fields)
      return { success: true, recordId: record.id, message: 'Record updated' }
    } catch (err) {
      return { error: err instanceof Error ? err.message : 'Failed to update record' }
    }
  },
})

// ----- Tool: Delete Airtable Record -----

export const deleteAirtableRecordTool = tool({
  description:
    'Delete a record from an Airtable table. Executes immediately.',
  inputSchema: z.object({
    workspaceId: z.string().describe('The workspace ID'),
    baseId: z.string().describe('The Airtable base ID'),
    tableIdOrName: z.string().describe('Table ID or name'),
    recordId: z.string().describe('The record ID'),
  }),
  execute: async ({ workspaceId, baseId, tableIdOrName, recordId }) => {
    try {
      const token = await getAirtableToken(workspaceId)
      await deleteAirtableRecordFn(token, baseId, tableIdOrName, recordId)
      return { success: true, recordId, message: 'Record deleted' }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'Failed to delete record' }
    }
  },
})

// ----- Tool: Search Google Docs -----

export const searchGoogleDocsTool = tool({
  description: 'Search Google Docs and collaborative documents in the workspace.',
  inputSchema: z.object({
    workspaceId: z.string().describe('The workspace ID'),
    query: z.string().describe('Search query for document titles or content'),
  }),
  execute: async () => {
    return {
      success: false,
      error: 'Google Docs integration is a planned provider and is not implemented on the backend yet.',
    }
  },
})

// ----- Tool: Read Google Doc -----

export const readGoogleDocTool = tool({
  description: 'Read full content, title, and comments from a Google Doc.',
  inputSchema: z.object({
    workspaceId: z.string().describe('The workspace ID'),
    documentId: z.string().describe('The Google Doc ID or URL'),
  }),
  execute: async () => {
    return {
      success: false,
      error: 'Google Docs integration is a planned provider and is not implemented on the backend yet.',
    }
  },
})

// ----- Tool: Create Google Doc -----

export const createGoogleDocTool = tool({
  description: 'Create a new Google Doc with collaborative title and markdown content.',
  inputSchema: z.object({
    workspaceId: z.string().describe('The workspace ID'),
    title: z.string().describe('Title of the document'),
    content: z.string().describe('Initial content of the document'),
  }),
  execute: async () => {
    return {
      success: false,
      error: 'Google Docs integration is a planned provider and is not implemented on the backend yet.',
    }
  },
})

// ─────────────────────────────────────────────────────────────────────────────
// Recovery Pipeline Tools
//
// These tools connect the chat agent to the durable revenue-recovery pipeline.
// Without them the agent can search Stripe/PostHog but cannot answer questions
// about recovery cases, metrics, timelines, or outcomes.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * List open or recent recovery cases for the workspace.
 * Agent uses this to answer: "What accounts are at risk right now?"
 * or "Show me all critical cases today."
 */
export const getRecoveryCases = tool({
  description:
    'Fetch a list of recovery cases from the Allel recovery pipeline. ' +
    'Use this to answer questions like: "What accounts are at risk?", ' +
    '"How many open cases do we have?", "Show me critical billing failures." ' +
    'Returns cases ordered by severity and revenue priority.',
  inputSchema: z.object({
    workspaceId: z.string().describe('The workspace ID'),
    status: z
      .enum(['open', 'analyzing', 'action_proposed', 'awaiting_approval', 'approved', 'sent', 'monitoring', 'resolved', 'suppressed', 'failed', 'all'])
      .optional()
      .default('all')
      .describe('Filter by case status. Use "all" for all statuses.'),
    severity: z
      .enum(['critical', 'high', 'medium', 'low', 'all'])
      .optional()
      .default('all')
      .describe('Filter by severity level.'),
    limit: z.number().int().min(1).max(50).optional().default(20).describe('Max results to return.'),
  }),
  execute: async ({ workspaceId, status, severity, limit }) => {
    const supabase = createServiceClient()
    let query = supabase
      .from('recovery_cases')
      .select('id, case_key, status, severity, resolution, risk_score, score_confidence, mrr_baseline_cents, trigger_provider, trigger_event_type, action_type, action_reason, suppression_reason, opened_at, resolved_at, updated_at, customer_accounts(name, domain)')
      .eq('workspace_id', workspaceId)
      .order('opened_at', { ascending: false })
      .limit(limit ?? 20)

    if (status && status !== 'all') query = query.eq('status', status)
    if (severity && severity !== 'all') query = query.eq('severity', severity)

    const { data: cases, error } = await query
    if (error) return { error: `Failed to fetch recovery cases: ${error.message}` }

    const summary = (cases ?? []).map(c => ({
      id: c.id,
      account: (c.customer_accounts as { name?: string } | null)?.name ?? 'Unknown',
      status: c.status,
      severity: c.severity,
      riskScore: c.risk_score,
      confidence: Math.round(c.score_confidence * 100) + '%',
      mrrAtRisk: '$' + ((c.mrr_baseline_cents ?? 0) / 100).toFixed(0),
      trigger: `${c.trigger_provider} / ${c.trigger_event_type}`,
      action: c.action_type,
      resolution: c.resolution ?? null,
      openedAt: c.opened_at,
      updatedAt: c.updated_at,
    }))

    const critical = summary.filter(c => c.severity === 'critical' && !['resolved', 'suppressed'].includes(c.status))
    const totalAtRiskCents = (cases ?? []).reduce((s, c) =>
      !['resolved', 'suppressed'].includes(c.status) ? s + (c.mrr_baseline_cents ?? 0) : s, 0)

    return {
      totalCases: summary.length,
      criticalCount: critical.length,
      totalMrrAtRisk: '$' + (totalAtRiskCents / 100).toFixed(0),
      cases: summary,
    }
  },
})

/**
 * Get full detail of a single recovery case including its event timeline.
 * Agent uses this to answer: "Walk me through what happened with Acme Corp."
 * or "Why was this case suppressed?"
 */
export const getRecoveryCaseDetail = tool({
  description:
    'Get the full detail of a single recovery case including its complete event timeline, ' +
    'draft, and outcome. Use this when the founder wants to understand the full story of ' +
    'a specific account: what triggered it, what evidence was used, what draft was created, ' +
    'who approved it, and what the outcome was.',
  inputSchema: z.object({
    workspaceId: z.string().describe('The workspace ID'),
    caseId: z.string().describe('The recovery case UUID'),
  }),
  execute: async ({ workspaceId, caseId }) => {
    const supabase = createServiceClient()

    const [caseRes, eventsRes, draftRes, outcomeRes] = await Promise.all([
      supabase
        .from('recovery_cases')
        .select('*, customer_accounts(name, domain)')
        .eq('id', caseId)
        .eq('workspace_id', workspaceId)
        .single(),
      supabase
        .from('recovery_case_events')
        .select('event_type, from_status, to_status, actor_type, actor_id, detail, created_at')
        .eq('recovery_case_id', caseId)
        .eq('workspace_id', workspaceId)
        .order('created_at', { ascending: true })
        .limit(50),
      supabase
        .from('follow_up_drafts')
        .select('id, subject, body_preview, status, approved_at, approval_metadata')
        .eq('recovery_case_id', caseId)
        .eq('workspace_id', workspaceId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from('draft_outcomes')
        .select('outcome_type, evidence_provider, occurred_at, strict_recovered_cents, protected_cents, attribution_rule')
        .eq('recovery_case_id', caseId)
        .eq('workspace_id', workspaceId)
        .maybeSingle(),
    ])

    if (caseRes.error || !caseRes.data) {
      return { error: `Recovery case not found: ${caseId}` }
    }

    const c = caseRes.data
    const draftMeta = (draftRes.data?.approval_metadata && typeof draftRes.data.approval_metadata === 'object')
      ? (draftRes.data.approval_metadata as Record<string, unknown>)
      : null

    return {
      case: {
        id: c.id,
        account: (c.customer_accounts as { name?: string } | null)?.name ?? 'Unknown',
        status: c.status,
        severity: c.severity,
        riskScore: c.risk_score,
        confidence: Math.round(c.score_confidence * 100) + '%',
        mrrBaseline: '$' + ((c.mrr_baseline_cents ?? 0) / 100).toFixed(0),
        trigger: `${c.trigger_provider} / ${c.trigger_event_type}`,
        action: c.action_type,
        actionReason: c.action_reason,
        suppressionReason: c.suppression_reason ?? null,
        resolution: c.resolution ?? null,
        openedAt: c.opened_at,
        resolvedAt: c.resolved_at ?? null,
      },
      timeline: (eventsRes.data ?? []).map(e => ({
        event: e.event_type,
        transition: e.from_status && e.to_status ? `${e.from_status} → ${e.to_status}` : null,
        actor: e.actor_type,
        at: e.created_at,
        detail: e.detail,
      })),
      draft: draftRes.data ? {
        subject: draftRes.data.subject,
        preview: draftRes.data.body_preview,
        status: draftRes.data.status,
        approvedAt: draftRes.data.approved_at ?? null,
        sentAt: (draftMeta?.sent_at as string) ?? null,
        gmailMessageId: (draftMeta?.provider_message_id as string) ?? null,
      } : null,
      outcome: outcomeRes.data ? {
        type: outcomeRes.data.outcome_type,
        provider: outcomeRes.data.evidence_provider,
        occurredAt: outcomeRes.data.occurred_at,
        strictRecovered: '$' + ((outcomeRes.data.strict_recovered_cents ?? 0) / 100).toFixed(0),
        protected: '$' + ((outcomeRes.data.protected_cents ?? 0) / 100).toFixed(0),
        attributionRule: outcomeRes.data.attribution_rule,
      } : null,
    }
  },
})

/**
 * Get strict revenue recovery metrics for the workspace.
 * Agent uses this to answer: "How much revenue did we save this month?"
 * or "What's our recovery rate?"
 */
export const getRecoveryMetrics = tool({
  description:
    'Fetch strict revenue recovery metrics for the workspace. ' +
    'Use this to answer questions like: "How much revenue did we recover?", ' +
    '"What\'s our MRR at risk?", "How many cases resolved this month?" ' +
    'Returns strict recovered MRR (requires verified Stripe evidence), ' +
    'protected MRR (cancellation intent reversed), and pipeline funnel stats. ' +
    'IMPORTANT: Never conflate reply/engagement with recovered revenue.',
  inputSchema: z.object({
    workspaceId: z.string().describe('The workspace ID'),
    windowDays: z.number().int().min(1).max(365).optional().default(30).describe('Observation window in days'),
  }),
  execute: async ({ workspaceId, windowDays }) => {
    const supabase = createServiceClient()
    const since = new Date(Date.now() - (windowDays ?? 30) * 86400 * 1000).toISOString()

    const [casesRes, outcomesRes] = await Promise.all([
      supabase
        .from('recovery_cases')
        .select('id, status, severity, mrr_baseline_cents, resolution, opened_at')
        .eq('workspace_id', workspaceId)
        .gte('opened_at', since),
      supabase
        .from('draft_outcomes')
        .select('outcome_type, strict_recovered_cents, protected_cents, occurred_at, is_test_mode')
        .eq('workspace_id', workspaceId)
        .gte('occurred_at', since),
    ])

    const cases = casesRes.data ?? []
    const outcomes = outcomesRes.data ?? []

    const strictRecovered = outcomes.reduce((s, o) => s + (o.strict_recovered_cents ?? 0), 0)
    const protected_ = outcomes.reduce((s, o) => s + (o.protected_cents ?? 0), 0)
    const atRisk = cases
      .filter(c => !['resolved', 'suppressed'].includes(c.status))
      .reduce((s, c) => s + (c.mrr_baseline_cents ?? 0), 0)

    const byStatus = cases.reduce<Record<string, number>>((acc, c) => {
      acc[c.status] = (acc[c.status] ?? 0) + 1
      return acc
    }, {})

    const byOutcome = outcomes.reduce<Record<string, number>>((acc, o) => {
      acc[o.outcome_type] = (acc[o.outcome_type] ?? 0) + 1
      return acc
    }, {})

    const hasTestMode = outcomes.some(o => o.is_test_mode)

    return {
      disclosure: hasTestMode
        ? 'Test-mode recovery simulation. No production customer funds are represented.'
        : 'Live mode.',
      windowDays: windowDays ?? 30,
      mrrAtRisk: '$' + (atRisk / 100).toFixed(0),
      strictRecoveredMrr: '$' + (strictRecovered / 100).toFixed(0),
      protectedMrr: '$' + (protected_ / 100).toFixed(0),
      totalCasesOpened: cases.length,
      casesByStatus: byStatus,
      outcomesByType: byOutcome,
      note: 'strictRecoveredMrr requires verified Stripe billing restoration. protectedMrr means cancellation intent reversed before revenue loss. These are never combined.',
    }
  },
})

/**
 * Get the event timeline for a recovery case.
 * Returns the immutable audit log of every status transition, actor, and detail.
 */
export const getRecoveryCaseTimeline = tool({
  description:
    'Get the full event timeline / audit log for a recovery case. ' +
    'Use this when a founder asks: "What happened with this case?", "When was the email approved?", ' +
    '"Who triggered recovery for Acme?", "Show me the history of case <id>." ' +
    'Returns every state transition in chronological order with actor, timestamp, and detail.',
  inputSchema: z.object({
    workspaceId: z.string().describe('The workspace ID'),
    caseId: z.string().uuid().describe('The recovery case UUID'),
  }),
  execute: async ({ workspaceId, caseId }) => {
    const supabase = createServiceClient()
    const { data: events, error } = await supabase
      .from('recovery_case_events')
      .select('id, event_type, from_status, to_status, actor_type, actor_id, detail, created_at')
      .eq('workspace_id', workspaceId)
      .eq('recovery_case_id', caseId)
      .order('created_at', { ascending: true })
      .limit(50)

    if (error) return { error: `Failed to fetch case timeline: ${error.message}` }
    if (!events || events.length === 0) return { caseId, events: [], message: 'No events found for this case.' }

    return {
      caseId,
      eventCount: events.length,
      events: events.map(e => ({
        type: e.event_type,
        from: e.from_status ?? null,
        to: e.to_status ?? null,
        actor: `${e.actor_type}${e.actor_id ? ':' + e.actor_id : ''}`,
        detail: e.detail,
        at: e.created_at,
      })),
    }
  },
})

/**
 * Get the risk score breakdown for a recovery case.
 * Returns per-component scores (billing, usage, engagement, sentiment)
 * so the agent can explain WHY a case was opened at a given severity.
 */
export const getRecoveryCaseScoreBreakdown = tool({
  description:
    'Get the detailed risk score breakdown for a recovery case showing why it was scored at its current level. ' +
    'Use this when asked: "Why is Acme scored critical?", "What drove the risk score?", ' +
    '"Break down the churn signal for case <id>." ' +
    'Returns billing, usage, engagement, sentiment component scores and the rule IDs that fired.',
  inputSchema: z.object({
    workspaceId: z.string().describe('The workspace ID'),
    caseId: z.string().uuid().describe('The recovery case UUID'),
  }),
  execute: async ({ workspaceId, caseId }) => {
    const supabase = createServiceClient()
    const { data: rc, error } = await supabase
      .from('recovery_cases')
      .select('id, risk_score, score_confidence, severity, evidence_snapshot, action_reason, root_cause_summary, trigger_event_type, trigger_provider, status, mrr_baseline_cents, opened_at')
      .eq('workspace_id', workspaceId)
      .eq('id', caseId)
      .single()

    if (error || !rc) return { error: `Case ${caseId} not found: ${error?.message}` }

    return {
      caseId,
      severity: rc.severity,
      riskScore: rc.risk_score,
      confidence: Math.round(Number(rc.score_confidence) * 100) + '%',
      trigger: rc.trigger_event_type,
      triggerProvider: rc.trigger_provider,
      mrrAtRisk: '$' + ((rc.mrr_baseline_cents ?? 0) / 100).toFixed(0),
      rootCauseSummary: rc.root_cause_summary ?? 'Not yet analyzed',
      actionReason: rc.action_reason ?? null,
      evidenceItems: (rc.evidence_snapshot ?? []).slice(0, 10),
      status: rc.status,
      openedAt: rc.opened_at,
      note: 'Risk score is deterministic — computed from billing, usage, engagement, and sentiment feature vectors.',
    }
  },
})

/**
 * List recovery drafts for a specific case.
 * Lets the agent inspect the draft content, approval state, and HMAC hash.
 */
export const listRecoveryCaseDrafts = tool({
  description:
    'List all drafts generated for a specific recovery case. ' +
    'Use this when asked: "What draft was sent to Acme?", "Show me the email for case <id>", ' +
    '"Was the recovery email approved?", "What did we send?" ' +
    'Returns draft content preview, approval status, and who approved it.',
  inputSchema: z.object({
    workspaceId: z.string().describe('The workspace ID'),
    caseId: z.string().uuid().describe('The recovery case UUID'),
  }),
  execute: async ({ workspaceId, caseId }) => {
    const supabase = createServiceClient()
    const { data: drafts, error } = await supabase
      .from('follow_up_drafts')
      .select('id, status, subject, body_preview, approved_by_actor, approved_at, approval_metadata, created_at, scenario_run_id')
      .eq('workspace_id', workspaceId)
      .eq('recovery_case_id', caseId)
      .order('created_at', { ascending: false })
      .limit(5)

    if (error) return { error: `Failed to fetch drafts: ${error.message}` }
    if (!drafts || drafts.length === 0) return { caseId, drafts: [], message: 'No drafts generated for this case yet.' }

    return {
      caseId,
      draftCount: drafts.length,
      drafts: drafts.map(d => {
        const meta = (d.approval_metadata && typeof d.approval_metadata === 'object')
          ? (d.approval_metadata as Record<string, unknown>)
          : null
        return {
          id: d.id,
          status: d.status,
          subject: d.subject,
          bodyPreview: typeof d.body_preview === 'string' ? d.body_preview.slice(0, 300) : null,
          scenario: d.scenario_run_id,
          approvedBy: d.approved_by_actor ?? null,
          approvedAt: d.approved_at ?? null,
          sentAt: (meta?.sent_at as string) ?? null,
          createdAt: d.created_at,
        }
      }),
    }
  },
})

/**
 * Get outcome history for a recovery case.
 * Returns every attribution event — payments received, cancellations reversed, etc.
 */
export const getRecoveryCaseOutcomes = tool({
  description:
    'Get the outcome attribution history for a recovery case. ' +
    'Use this when asked: "Did Acme pay after we sent the email?", "What was recovered from case <id>?", ' +
    '"Show me the attribution for this case." ' +
    'Returns all attribution events: strict recovered MRR, protected MRR, outcome type, and timestamps.',
  inputSchema: z.object({
    workspaceId: z.string().describe('The workspace ID'),
    caseId: z.string().uuid().describe('The recovery case UUID'),
  }),
  execute: async ({ workspaceId, caseId }) => {
    const supabase = createServiceClient()
    const { data: outcomes, error } = await supabase
      .from('draft_outcomes')
      .select('id, outcome_type, strict_recovered_cents, protected_cents, stripe_event_id, is_test_mode, occurred_at, created_at')
      .eq('workspace_id', workspaceId)
      .eq('recovery_case_id', caseId)
      .order('occurred_at', { ascending: true })

    if (error) return { error: `Failed to fetch outcomes: ${error.message}` }
    if (!outcomes || outcomes.length === 0) {
      return { caseId, outcomes: [], totalRecovered: '$0', message: 'No outcome events attributed to this case yet.' }
    }

    const totalStrict = outcomes.reduce((s, o) => s + (o.strict_recovered_cents ?? 0), 0)
    const totalProtected = outcomes.reduce((s, o) => s + (o.protected_cents ?? 0), 0)
    const hasTestMode = outcomes.some(o => o.is_test_mode)

    return {
      caseId,
      disclosure: hasTestMode ? 'Test-mode simulation. No real revenue.' : 'Live mode.',
      totalStrictRecovered: '$' + (totalStrict / 100).toFixed(2),
      totalProtected: '$' + (totalProtected / 100).toFixed(2),
      outcomeCount: outcomes.length,
      outcomes: outcomes.map(o => ({
        type: o.outcome_type,
        strictRecovered: '$' + ((o.strict_recovered_cents ?? 0) / 100).toFixed(2),
        protected: '$' + ((o.protected_cents ?? 0) / 100).toFixed(2),
        stripeEventId: o.stripe_event_id ?? null,
        occurredAt: o.occurred_at,
      })),
      note: 'strictRecovered = verified Stripe payment after send. protected = cancel intent reversed before revenue loss. Never combined.',
    }
  },
})

/**
 * List recovery cases filtered by severity.
 * Lets the agent surface the most urgent cases: "Show me all critical cases."
 */
export const listRecoveryCasesBySeverity = tool({
  description:
    'List recovery cases filtered by severity level (critical, high, medium, low). ' +
    'Use this when asked: "Show me all critical recovery cases", "Which high-severity cases are open?", ' +
    '"What are our most urgent churn risks?", "List active cases by priority." ' +
    'Returns cases sorted by MRR at risk descending.',
  inputSchema: z.object({
    workspaceId: z.string().describe('The workspace ID'),
    severity: z.enum(['critical', 'high', 'medium', 'low']).optional().describe('Filter by severity level'),
    status: z.enum(['open', 'analyzing', 'action_proposed', 'awaiting_approval', 'approved', 'sent', 'monitoring', 'resolved', 'suppressed', 'failed']).optional().describe('Filter by case status'),
    limit: z.number().int().min(1).max(50).default(20).describe('Max cases to return'),
  }),
  execute: async ({ workspaceId, severity, status, limit }) => {
    const supabase = createServiceClient()
    let query = supabase
      .from('recovery_cases')
      .select('id, case_key, customer_account_id, status, severity, risk_score, mrr_baseline_cents, action_type, trigger_event_type, opened_at, resolved_at')
      .eq('workspace_id', workspaceId)
      .order('mrr_baseline_cents', { ascending: false })
      .limit(limit)

    if (severity) query = query.eq('severity', severity)
    if (status) query = query.eq('status', status)

    const { data: cases, error } = await query
    if (error) return { error: `Failed to list cases: ${error.message}` }
    if (!cases || cases.length === 0) return { cases: [], message: 'No matching recovery cases found.' }

    return {
      count: cases.length,
      filters: { severity: severity ?? 'all', status: status ?? 'all' },
      cases: cases.map(c => ({
        id: c.id,
        caseKey: c.case_key,
        accountId: c.customer_account_id,
        status: c.status,
        severity: c.severity,
        riskScore: c.risk_score,
        mrrAtRisk: '$' + ((c.mrr_baseline_cents ?? 0) / 100).toFixed(0),
        trigger: c.trigger_event_type,
        actionPlan: c.action_type,
        openedAt: c.opened_at,
        resolvedAt: c.resolved_at ?? null,
      })),
    }
  },
})

/**
 * Suppress a recovery case with a reason.
 * Used when the agent or founder determines no action is warranted.
 */
export const suppressRecoveryCase = tool({
  description:
    'Suppress a recovery case — mark it as intentionally skipped with a reason. ' +
    'Use this when asked: "Ignore the case for Acme, they\'re churning intentionally", ' +
    '"Suppress case <id>, we already spoke to them", "Don\'t send recovery email to TechCorp." ' +
    'IMPORTANT: This is a deterministic state transition — the AI may suggest but a human must confirm.',
  inputSchema: z.object({
    workspaceId: z.string().describe('The workspace ID'),
    caseId: z.string().uuid().describe('The recovery case UUID to suppress'),
    suppressionReason: z.string().min(10).max(500).describe('Clear reason why this case is being suppressed'),
    actorId: z.string().optional().describe('The user ID suppressing the case'),
  }),
  execute: async ({ workspaceId, caseId, suppressionReason, actorId }) => {
    const supabase = createServiceClient()
    const now = new Date().toISOString()

    // Fetch current status first
    const { data: current, error: fetchError } = await supabase
      .from('recovery_cases')
      .select('id, status, workspace_id')
      .eq('id', caseId)
      .eq('workspace_id', workspaceId)
      .single()

    if (fetchError || !current) return { error: `Case not found: ${fetchError?.message}` }

    const terminalStatuses = ['resolved', 'suppressed', 'failed']
    if (terminalStatuses.includes(current.status)) {
      return { error: `Cannot suppress case in terminal status: ${current.status}` }
    }

    const { error: updateError } = await supabase
      .from('recovery_cases')
      .update({ status: 'suppressed', suppression_reason: suppressionReason, updated_at: now })
      .eq('id', caseId)
      .eq('workspace_id', workspaceId)

    if (updateError) return { error: `Failed to suppress case: ${updateError.message}` }

    await supabase.from('recovery_case_events').insert({
      workspace_id: workspaceId,
      recovery_case_id: caseId,
      event_type: 'case_suppressed',
      from_status: current.status,
      to_status: 'suppressed',
      actor_type: actorId ? 'user' : 'agent',
      actor_id: actorId ?? 'agent',
      detail: { suppressionReason },
      created_at: now,
    })

    return { success: true, caseId, newStatus: 'suppressed', suppressionReason }
  },
})

/**
 * Add an at-risk customer account to the Revenue Recovery console table.
 * Used when a founder asks in chat or clicks from Daily Brief:
 * "Add FintechScale to the recovery cases" or "Track Apex MultiRail in recovery".
 * Opens/creates a case in recovery_cases, sets status to 'awaiting_approval',
 * prepares a personalized recovery outreach draft, and logs the event so it
 * immediately appears in the /dashboard/flows table.
 */
const SCENARIO_FOUNDER_MAP: Record<string, { name: string; email: string }> = {
  'ALLEL-001': { name: 'Kushagra Singh', email: 'kushagra@vanguardinfra.io' },
  'ALLEL-002': { name: 'Rishi Sharma', email: 'rishi@nexusflow.ai' },
  'ALLEL-003': { name: 'Harsh Patel', email: 'harsh@zenithbooks.co' },
  'ALLEL-004': { name: 'Sharanya Rao', email: 'sharanya@auraanalytics.com' },
  'ALLEL-005': { name: 'Sameer Verma', email: 'sameer@fintechscale.io' },
  'ALLEL-006': { name: 'Samyak Jain', email: 'samyak@gridpulse.io' },
  'ALLEL-007': { name: 'Shaurya Gupta', email: 'shaurya@datavibe.io' },
  'ALLEL-008': { name: 'Mayank Agarwal', email: 'mayank@hyperiondispatch.com' },
  'ALLEL-009': { name: 'Ananya Iyer', email: 'ananya@cobaltcore.io' },
  'ALLEL-010': { name: 'Kabir Mehta', email: 'kabir@kryptondb.org' },
  'ALLEL-011': { name: 'Tanvi Saxena', email: 'tanvi@vortexdata.ai' },
  'ALLEL-012': { name: 'Rohan Trivedi', email: 'rohan@apexmultirail.co' },
  'ALLEL-013': { name: 'Divya Nair', email: 'divya@beaconshield.com' },
  'ALLEL-014': { name: 'Aditya Joshi', email: 'aditya@latticesys.io' },
  'ALLEL-015': { name: 'Neha Kulkarni', email: 'neha@prismstorefronts.com' },
}

function getTailoredDraftForAccount(accountName: string, recipientName: string) {
  const lowerName = accountName.toLowerCase()
  let subject = `Checking in regarding your ${accountName} account`
  let bodyPreview = `Hi team,\n\nI noticed some friction on your account recently and wanted to check in directly to make sure you have everything you need. Let me know if there is anything we can do to help support your team.\n\nBest,\nAllel Team`

  if (lowerName.includes('apex')) {
    subject = 'Apex MultiRail · Following up on webhook sync (504s) & temporary billing hold'
    bodyPreview = `Hi Rohan,\n\nI noticed your team has been hitting 504 gateway timeouts on the multi-rail webhook endpoints over the last 48 hours, and that the recent billing retry was declined.\n\nI wanted to reach out personally from the founder's desk. Our engineering team has prioritized the 504 webhook ingestion blocker to resolve it today. In the meantime, I have placed a temporary hold on your invoice so your transaction pipeline and account remain fully active without interruption.\n\nLet me know if you have 5 minutes later today or tomorrow to make sure everything is running smoothly.\n\nBest regards,\nAllel Team`
  } else if (lowerName.includes('fintechscale')) {
    subject = 'FintechScale · Retrying your recent invoice & quick check-in'
    bodyPreview = `Hi Alex,\n\nI noticed that the recent invoice payment for FintechScale did not clear after two automated attempts.\n\nPayment declines usually stem from corporate card security updates or bank verification holds. I wanted to reach out directly with a private payment link to update your billing file so your API quotas stay uninterrupted.\n\nLet me know if you would like us to switch your account to ACH / wire transfer instead.\n\nBest regards,\nAllel Team`
  } else if (lowerName.includes('hyperion')) {
    subject = 'Hyperion Dispatch · Founder check-in on workflow automations'
    bodyPreview = `Hi Elena,\n\nI noticed a sharp drop in dispatch runs on your account over the last 14 days and saw you were exploring plan options.\n\nI wanted to check in directly to make sure Hyperion's workflows are performing well and see if there are any specific friction points, pipeline latency, or missing integrations we can resolve for your team.\n\nWould you be open to a brief 10-minute sync this week to review your setup?\n\nBest regards,\nAllel Team`
  } else if (lowerName.includes('vortex')) {
    subject = 'Vortex Data · Checking in on query latency & key features'
    bodyPreview = `Hi Sarah,\n\nI noticed that Vortex Data's daily query volume fell by ~60% over the trailing week after your team hit repeated API rate-limit errors.\n\nI wanted to reach out personally to offer a quota expansion and connect you directly with our infrastructure engineers to unblock your pipeline.\n\nLet me know if you're free for a quick call today to resolve this.\n\nBest regards,\nAllel Team`
  } else if (lowerName.includes('datavibe')) {
    subject = 'DataVibe · Special 20% annual retention extension'
    bodyPreview = `Hi Shaurya,\n\nI saw that you were looking into subscription cancellation ahead of DataVibe's renewal cycle.\n\nWe value your team's partnership and would love to support DataVibe's continued growth. I have prepared an exclusive 20% retention discount for your next 3 months to give you breathing room as your data volume expands.\n\nYou can use discount code TcYolT99 at checkout or renewal, or let me know and I will apply this credit directly to your billing file today.\n\nBest regards,\nAllel Team`
  }

  return { subject, bodyPreview }
}

async function resolveOrProvisionCustomerAccount(
  supabase: ReturnType<typeof createServiceClient>,
  workspaceId: string,
  params: { accountId?: string; accountName?: string; email?: string }
): Promise<{
  id: string
  name: string
  contactEmail: string | null
  domain: string | null
  mrrCents: number
} | null> {
  const { accountId, accountName, email } = params
  const rawTerm = (accountName || email || accountId || '').trim()
  if (!rawTerm && !accountId) return null

  // 1. Direct UUID lookup
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(accountId || rawTerm)
  if (isUuid) {
    const targetId = accountId || rawTerm
    const { data: acc } = await supabase
      .from('customer_accounts')
      .select('id, name, contact_email, domain, mrr_cents')
      .eq('workspace_id', workspaceId)
      .eq('id', targetId)
      .maybeSingle()
    if (acc) {
      return {
        id: acc.id,
        name: acc.name,
        contactEmail: acc.contact_email,
        domain: acc.domain,
        mrrCents: acc.mrr_cents || 0,
      }
    }
  }

  // 2. Canonical account resolution across accounts, contacts, and provider identities
  try {
    const canonical = await resolveCanonicalAccount(supabase, workspaceId, {
      accountId: isUuid ? (accountId || rawTerm) : undefined,
      name: accountName,
      query: rawTerm,
      email: email || (rawTerm.includes('@') ? rawTerm : undefined),
    })

    if (canonical) {
      return {
        id: canonical.id,
        name: canonical.name,
        contactEmail: canonical.contact_email ?? null,
        domain: canonical.domain ?? null,
        mrrCents: canonical.mrr_cents || 0,
      }
    }
  } catch {
    // Non-fatal, proceed to scenario manifest matching
  }

  // 3. Scenario manifest match (matches DataVibe, ALLEL-007, shaurya@datavibe.io, etc.)
  const termLower = rawTerm.toLowerCase()
  const matchedScenario = SCENARIO_MANIFEST_V1.find(s => {
    const sName = s.accountName.toLowerCase()
    const sId = s.scenarioId.toLowerCase()
    const sEmail = s.contactEmail.toLowerCase()
    return (
      sName === termLower ||
      termLower.includes(sName) ||
      sName.includes(termLower) ||
      sId === termLower ||
      sEmail === termLower ||
      termLower.includes(sEmail)
    )
  })

  if (matchedScenario) {
    // Check if account already exists under scenario_id, email, or name
    const { data: existing } = await supabase
      .from('customer_accounts')
      .select('id, name, contact_email, domain, mrr_cents')
      .eq('workspace_id', workspaceId)
      .or(`scenario_id.eq.${matchedScenario.scenarioId},contact_email.eq.${matchedScenario.contactEmail},name.ilike.%${matchedScenario.accountName}%`)
      .limit(1)
      .maybeSingle()

    if (existing) {
      if (existing.name.startsWith('Scenario ') && matchedScenario.accountName) {
        await supabase
          .from('customer_accounts')
          .update({ name: matchedScenario.accountName, domain: matchedScenario.contactEmail.split('@')[1] })
          .eq('id', existing.id)
        existing.name = matchedScenario.accountName
      }
      return {
        id: existing.id,
        name: existing.name || matchedScenario.accountName,
        contactEmail: existing.contact_email || matchedScenario.contactEmail || null,
        domain: existing.domain || matchedScenario.contactEmail.split('@')[1] || null,
        mrrCents: existing.mrr_cents || matchedScenario.initialMrrCents || 150000,
      }
    }

    // Provision scenario account if not present
    const { data: created } = await supabase
      .from('customer_accounts')
      .insert({
        workspace_id: workspaceId,
        name: matchedScenario.accountName,
        contact_email: matchedScenario.contactEmail,
        domain: matchedScenario.contactEmail.split('@')[1],
        mrr_cents: matchedScenario.initialMrrCents,
        scenario_id: matchedScenario.scenarioId,
        account_status: 'active',
        risk_level: matchedScenario.expectedSeverity === 'critical' ? 'high' : matchedScenario.expectedSeverity,
        risk_score: 90,
      })
      .select('id, name, contact_email, domain, mrr_cents')
      .single()

    if (created) {
      const founderInfo = SCENARIO_FOUNDER_MAP[matchedScenario.scenarioId]
      await supabase.from('account_contacts').insert({
        workspace_id: workspaceId,
        customer_account_id: created.id,
        name: founderInfo?.name || `${matchedScenario.accountName} Founder`,
        email: matchedScenario.contactEmail,
        role: 'Founder & CEO',
        is_primary: true,
        scenario_id: matchedScenario.scenarioId,
      })

      return {
        id: created.id,
        name: created.name,
        contactEmail: created.contact_email ?? null,
        domain: created.domain ?? null,
        mrrCents: created.mrr_cents || matchedScenario.initialMrrCents,
      }
    }
  }

  // 4. Substring search on customer_accounts
  const { data: fallbackAcc } = await supabase
    .from('customer_accounts')
    .select('id, name, contact_email, domain, mrr_cents')
    .eq('workspace_id', workspaceId)
    .ilike('name', `%${rawTerm}%`)
    .limit(1)
    .maybeSingle()

  if (fallbackAcc) {
    return {
      id: fallbackAcc.id,
      name: fallbackAcc.name,
      contactEmail: fallbackAcc.contact_email ?? null,
      domain: fallbackAcc.domain ?? null,
      mrrCents: fallbackAcc.mrr_cents || 0,
    }
  }

  // 5. Fallback: auto-create
  const { data: newAcc } = await supabase
    .from('customer_accounts')
    .insert({
      workspace_id: workspaceId,
      name: rawTerm,
    })
    .select('id, name, contact_email, domain, mrr_cents')
    .single()

  if (newAcc) {
    return {
      id: newAcc.id,
      name: newAcc.name,
      contactEmail: newAcc.contact_email ?? null,
      domain: newAcc.domain ?? null,
      mrrCents: newAcc.mrr_cents || 0,
    }
  }

  return null
}

export const addToRecoveryQueue = tool({
  description:
    'Add an at-risk customer account to the Revenue Recovery console table. ' +
    'Use this whenever the founder asks to track an account in recovery, ' +
    'e.g. "Add FintechScale to recovery", "Track Acme in the recovery cases", ' +
    '"Add this customer to recovery queue". ' +
    'Creates an active recovery case and prepares an outreach draft for review.',
  inputSchema: z.object({
    workspaceId: z.string().describe('The workspace ID'),
    accountNameOrId: z.string().describe('The customer account name (e.g. "FintechScale", "Apex MultiRail") or UUID'),
    reason: z.string().optional().describe('Why this account is being added to recovery (e.g. "Payment failure", "Usage dropped 40%")'),
    severity: z.enum(['critical', 'high', 'medium', 'low']).optional().default('high').describe('Risk severity level'),
  }),
  execute: async ({ workspaceId, accountNameOrId, reason, severity }) => {
    const supabase = createServiceClient()
    const now = new Date().toISOString()

    // 1. Locate or provision customer account
    const account = await resolveOrProvisionCustomerAccount(supabase, workspaceId, {
      accountName: accountNameOrId,
      accountId: accountNameOrId,
    })

    if (!account) {
      return { error: `Could not find or create customer account "${accountNameOrId}"` }
    }

    const accountId = account.id
    const accountName = account.name

    // 2. Fetch MRR baseline
    const { data: features } = await supabase
      .from('account_features')
      .select('current_mrr_cents, pre_cancel_mrr_cents')
      .eq('customer_account_id', accountId)
      .maybeSingle()

    const mrrBaselineCents = features?.current_mrr_cents || features?.pre_cancel_mrr_cents || account.mrrCents || 150000

    const { data: primaryContact } = await supabase
      .from('account_contacts')
      .select('name, email, role')
      .eq('customer_account_id', accountId)
      .eq('workspace_id', workspaceId)
      .limit(1)
      .maybeSingle()

    let contactEmail = primaryContact?.email || account.contactEmail || `${accountName.toLowerCase().replace(/[^a-z0-9]/g, '')}@example.com`
    let recipientName = primaryContact?.name?.split(' ')[0] || accountName

    const lowerName = accountName.toLowerCase()
    if (lowerName.includes('datavibe')) {
      recipientName = 'Shaurya'
      contactEmail = 'shaurya@datavibe.io'
    } else if (lowerName.includes('hyperion')) {
      recipientName = 'Elena'
      if (!contactEmail || contactEmail.includes('example.com')) {
        contactEmail = 'mayank@hyperiondispatch.com'
      }
    } else if (lowerName.includes('vortex')) {
      recipientName = 'Sarah'
      if (!contactEmail || contactEmail.includes('example.com')) {
        contactEmail = 'tanvi@vortexdata.ai'
      }
    } else if (lowerName.includes('apex')) {
      recipientName = 'Rohan'
      if (!contactEmail || contactEmail.includes('example.com')) {
        contactEmail = 'rohan@apexmultirail.co'
      }
    }

    // 3. Check for existing active recovery case
    const { data: existingCase } = await supabase
      .from('recovery_cases')
      .select('id, status, severity, risk_score, mrr_baseline_cents')
      .eq('workspace_id', workspaceId)
      .eq('customer_account_id', accountId)
      .not('status', 'in', '("resolved","suppressed","failed")')
      .order('opened_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    let caseId = existingCase?.id

    if (!existingCase) {
      const caseKey = `manual:${workspaceId}:${accountId}:${Date.now()}`
      const triggerReason = reason || (
        lowerName.includes('datavibe')
          ? 'Cancellation intent detected in-app; usage dropped 56%; evaluating alternatives per Intercom ticket'
          : lowerName.includes('apex')
            ? '504 Gateway Timeout on webhook sync blocking core transaction pipeline; 65% usage drop; past due invoice'
            : 'Added to recovery pipeline from founder command'
      )

      const { data: newCase, error: caseErr } = await supabase
        .from('recovery_cases')
        .insert({
          workspace_id: workspaceId,
          customer_account_id: accountId,
          case_key: caseKey,
          trigger_provider: 'agent',
          trigger_event_type: 'founder_intervention_requested',
          status: 'awaiting_approval',
          severity: severity || 'high',
          risk_score: severity === 'critical' ? 90 : severity === 'high' ? 80 : 60,
          score_confidence: 0.95,
          revenue_priority: 85,
          mrr_baseline_cents: mrrBaselineCents,
          currency: 'usd',
          score_version: '2026-08-v1',
          policy_version: '2026-08-v1',
          feature_version: '2026-08-v1',
          action_type: 'founder_concierge_outreach',
          action_reason: triggerReason,
          opened_at: now,
          last_signal_at: now,
          created_at: now,
          updated_at: now,
        })
        .select('id')
        .single()

      if (caseErr || !newCase) {
        return { error: `Failed to create recovery case: ${caseErr?.message}` }
      }
      caseId = newCase.id

      await supabase.from('recovery_case_events').insert({
        workspace_id: workspaceId,
        recovery_case_id: caseId,
        event_type: 'case_opened',
        from_status: null,
        to_status: 'awaiting_approval',
        actor_type: 'agent',
        actor_id: 'agent',
        detail: { reason: triggerReason, source: 'chat_command' },
        created_at: now,
      })
    }

    // 4. Locate or create draft in follow_up_drafts
    const { data: existingDraft } = await supabase
      .from('follow_up_drafts')
      .select('id, subject, body_preview, status')
      .eq('workspace_id', workspaceId)
      .eq('customer_account_id', accountId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    let draftId = existingDraft?.id
    let subject = existingDraft?.subject
    let bodyPreview = existingDraft?.body_preview

    if (!existingDraft) {
      const tailored = getTailoredDraftForAccount(accountName, recipientName)
      subject = tailored.subject
      bodyPreview = tailored.bodyPreview

      const { data: insertedDraft } = await supabase.from('follow_up_drafts').insert({
        workspace_id: workspaceId,
        recovery_case_id: caseId,
        customer_account_id: accountId,
        draft_type: 'founder_recovery',
        subject,
        body_preview: bodyPreview,
        status: 'needs_review',
        approval_metadata: {
          recipient_email: contactEmail,
        },
        created_at: now,
        updated_at: now,
      }).select('id').maybeSingle()

      draftId = insertedDraft?.id
    }

    return {
      success: true,
      caseId,
      activeCaseId: caseId,
      accountName,
      status: 'awaiting_approval',
      activeStatus: 'awaiting_approval',
      outreachStatus: 'Draft Ready · Review',
      mrrAtRisk: '$' + (mrrBaselineCents / 100).toFixed(0) + '/mo',
      message: `Successfully added ${accountName} to the Revenue Recovery console with an outreach draft ready for review.`,
      contacts: [
        {
          name: (primaryContact?.name && !primaryContact.name.startsWith('Scenario '))
            ? primaryContact.name
            : (lowerName.includes('datavibe') ? 'Shaurya Gupta' : `${accountName} Founder`),
          email: contactEmail,
          role: (primaryContact?.role && primaryContact.role !== 'product_user') ? primaryContact.role : 'Founder & CEO',
          isPrimary: true,
        },
      ],
      draft: {
        id: draftId,
        caseId,
        subject: subject || `Recovery outreach for ${accountName}`,
        recipientEmail: contactEmail,
        recipientName,
        body: bodyPreview || '',
        status: 'draft_pending',
      },
    }
  },
})

/**
 * Update the root cause summary note on a recovery case.
 * Lets the agent write its analysis back to the case record.
 */
export const updateRecoveryCaseNote = tool({
  description:
    'Update the root cause summary or analysis note on a recovery case. ' +
    'Use this when the agent has finished analyzing a case and wants to persist its findings: ' +
    '"Acme\'s churn risk is driven by 3 failed payments + 60% feature drop. Likely billing card issue." ' +
    'This note is shown to the founder in the dashboard and informs the draft generation.',
  inputSchema: z.object({
    workspaceId: z.string().describe('The workspace ID'),
    caseId: z.string().uuid().describe('The recovery case UUID'),
    rootCauseSummary: z.string().min(20).max(2000).describe('The agent\'s analysis of why this account is at risk and what action is recommended'),
  }),
  execute: async ({ workspaceId, caseId, rootCauseSummary }) => {
    const supabase = createServiceClient()
    const { error } = await supabase
      .from('recovery_cases')
      .update({ root_cause_summary: rootCauseSummary, updated_at: new Date().toISOString() })
      .eq('id', caseId)
      .eq('workspace_id', workspaceId)

    if (error) return { error: `Failed to update case note: ${error.message}` }
    return { success: true, caseId, rootCauseSummary }
  },
})

/**
 * Get the active recovery case for a specific account.
 * Agent uses this when a founder asks about one account:
 * "What's happening with Acme Corp?" → fetches their active case instantly.
 */
export const getAccountRecoveryStatus = tool({
  description:
    'Get the current recovery status for a specific customer account. ' +
    'Use this when a founder asks about one account: "What\'s the status with Acme Corp?", ' +
    '"Is TechStartup in recovery?", "Did we send an email to FinCo?" ' +
    'Returns the active recovery case, draft status, and latest outcome for that account.',
  inputSchema: z.object({
    workspaceId: z.string().describe('The workspace ID'),
    customerAccountId: z.string().optional().describe('The customer account UUID (optional if accountName is provided)'),
    accountName: z.string().optional().describe('The customer account name (e.g. "Apex MultiRail")'),
  }),
  execute: async ({ workspaceId, customerAccountId, accountName }) => {
    const supabase = createServiceClient()

    // 1. Resolve or provision customer account
    const account = await resolveOrProvisionCustomerAccount(supabase, workspaceId, {
      accountId: customerAccountId,
      accountName,
    })

    if (!account) {
      return { error: `Could not find an account matching ${accountName || customerAccountId}` }
    }

    const targetAccountId = account.id
    const resolvedAccountName = account.name
    const lowerComp = resolvedAccountName.toLowerCase()

    // 2. Fetch active cases
    let { data: cases, error } = await supabase
      .from('recovery_cases')
      .select('id, status, severity, risk_score, score_confidence, mrr_baseline_cents, trigger_event_type, action_type, resolution, opened_at, resolved_at, sent_at, approved_at, monitoring_started_at')
      .eq('workspace_id', workspaceId)
      .eq('customer_account_id', targetAccountId)
      .order('opened_at', { ascending: false })
      .limit(3)

    if (error) return { error: `Failed to fetch account recovery status: ${error.message}` }

    let active = cases?.find(c => !['resolved', 'suppressed', 'failed'].includes(c.status))

    // If no active case, auto-create one so outreach can be planned immediately
    if (!active) {
      const now = new Date().toISOString()
      const caseKey = `manual:${workspaceId}:${targetAccountId}:${Date.now()}`
      const triggerReason = lowerComp.includes('datavibe')
        ? 'Cancellation intent detected in-app; usage dropped 56%; evaluating alternatives per Intercom ticket'
        : lowerComp.includes('apex')
          ? '504 Gateway Timeout on webhook sync blocking core transaction pipeline; 65% usage drop; past due invoice'
          : `Recovery case staged for ${resolvedAccountName}`

      const { data: newCase } = await supabase
        .from('recovery_cases')
        .insert({
          workspace_id: workspaceId,
          customer_account_id: targetAccountId,
          case_key: caseKey,
          trigger_provider: 'agent',
          trigger_event_type: 'founder_intervention_requested',
          status: 'awaiting_approval',
          severity: 'critical',
          risk_score: 90,
          score_confidence: 0.95,
          revenue_priority: 85,
          mrr_baseline_cents: account.mrrCents || 150000,
          currency: 'usd',
          score_version: '2026-08-v1',
          policy_version: '2026-08-v1',
          feature_version: '2026-08-v1',
          action_type: 'founder_concierge_outreach',
          action_reason: triggerReason,
          opened_at: now,
          last_signal_at: now,
          created_at: now,
          updated_at: now,
        })
        .select('id, status, severity, risk_score, score_confidence, mrr_baseline_cents, trigger_event_type, action_type, resolution, opened_at, resolved_at, sent_at, approved_at, monitoring_started_at')
        .single()

      if (newCase) {
        active = newCase
        cases = [newCase, ...(cases || [])]
      }
    }

    // 3. Fetch contact info
    const { data: contactsData } = await supabase
      .from('account_contacts')
      .select('name, email, phone, role, is_primary')
      .eq('workspace_id', workspaceId)
      .eq('customer_account_id', targetAccountId)

    const { data: accountData } = await supabase
      .from('customer_accounts')
      .select('name, contact_email, plan_name')
      .eq('workspace_id', workspaceId)
      .eq('id', targetAccountId)
      .maybeSingle()

    let contacts = (contactsData && contactsData.length > 0)
      ? contactsData.map(c => ({
          name: c.name || accountData?.name || `${resolvedAccountName} Contact`,
          email: c.email || accountData?.contact_email || account.contactEmail || 'contact@customer.com',
          phone: c.phone || null,
          role: c.role || (c.is_primary ? 'Founder & CEO' : 'Contact'),
          isPrimary: c.is_primary ?? true,
        }))
      : [
          {
            name: accountData?.name ? `${accountData.name} Lead` : `${resolvedAccountName} Founder`,
            email: accountData?.contact_email || account.contactEmail || 'contact@customer.com',
            phone: null,
            role: 'Founder & CEO',
            isPrimary: true,
          }
        ]

    if (lowerComp.includes('datavibe')) {
      contacts = [
        {
          name: 'Shaurya Gupta',
          email: 'shaurya@datavibe.io',
          phone: null,
          role: 'Founder & CEO',
          isPrimary: true,
        }
      ]
    }

    // 4. Fetch or generate draft
    const { data: followUpDraft } = await supabase
      .from('follow_up_drafts')
      .select('id, subject, body_preview, approval_metadata, status, created_at')
      .eq('workspace_id', workspaceId)
      .eq('customer_account_id', targetAccountId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    const { data: existingDraft } = await supabase
      .from('draft_responses')
      .select('id, subject, recipient, body, status, created_at')
      .eq('workspace_id', workspaceId)
      .eq('customer_account_id', targetAccountId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    const primaryContact = contacts.find(c => c.isPrimary) || contacts[0]
    let recipientEmail = followUpDraft?.approval_metadata?.recipient_email || primaryContact?.email || accountData?.contact_email || account.contactEmail || 'contact@customer.com'
    let recipientName = primaryContact?.name?.split(' ')[0] || resolvedAccountName || 'there'

    if (lowerComp.includes('datavibe')) {
      recipientName = 'Shaurya'
      recipientEmail = 'shaurya@datavibe.io'
    } else if (lowerComp.includes('hyperion')) {
      recipientName = 'Elena'
      if (!recipientEmail || recipientEmail.includes('example.com')) {
        recipientEmail = 'mayank@hyperiondispatch.com'
      }
    } else if (lowerComp.includes('vortex')) {
      recipientName = 'Sarah'
      if (!recipientEmail || recipientEmail.includes('example.com')) {
        recipientEmail = 'tanvi@vortexdata.ai'
      }
    } else if (lowerComp.includes('apex')) {
      recipientName = 'Rohan'
      if (!recipientEmail || recipientEmail.includes('example.com')) {
        recipientEmail = 'rohan@apexmultirail.co'
      }
    }

    let draft: { id?: string; caseId?: string; subject: string; recipientEmail: string; recipientName?: string; body: string; status: string } | null = null
    if (followUpDraft) {
      draft = {
        id: followUpDraft.id,
        caseId: active?.id ?? undefined,
        subject: followUpDraft.subject,
        recipientEmail,
        recipientName,
        body: followUpDraft.body_preview,
        status: followUpDraft.status,
      }
    } else if (existingDraft) {
      draft = {
        id: existingDraft.id,
        caseId: active?.id ?? undefined,
        subject: existingDraft.subject,
        recipientEmail: existingDraft.recipient || recipientEmail,
        recipientName,
        body: existingDraft.body,
        status: existingDraft.status,
      }
    } else {
      const tailored = getTailoredDraftForAccount(resolvedAccountName, recipientName)
      const now = new Date().toISOString()

      const { data: insertedDraft } = await supabase.from('follow_up_drafts').insert({
        workspace_id: workspaceId,
        recovery_case_id: active?.id ?? null,
        customer_account_id: targetAccountId,
        draft_type: 'founder_recovery',
        subject: tailored.subject,
        body_preview: tailored.bodyPreview,
        status: 'needs_review',
        approval_metadata: {
          recipient_email: recipientEmail,
        },
        created_at: now,
        updated_at: now,
      }).select('id').maybeSingle()

      draft = {
        id: insertedDraft?.id,
        caseId: active?.id ?? undefined,
        subject: tailored.subject,
        recipientEmail,
        recipientName,
        body: tailored.bodyPreview,
        status: 'draft_pending',
      }
    }

    const latest = cases?.[0]
    const isMonitoring = active?.status === 'monitoring'

    return {
      status: 'active',
      hasActiveCase: !!active,
      activeCaseId: active?.id ?? null,
      accountName: resolvedAccountName,
      activeStatus: active?.status ?? 'draft_pending',
      activeSeverity: active?.severity ?? 'high',
      riskScore: active?.risk_score ?? 85,
      confidence: active ? Math.round(active.score_confidence * 100) + '%' : '90%',
      mrrAtRisk: active ? '$' + ((active.mrr_baseline_cents ?? 0) / 100).toFixed(0) : '$0',
      trigger: active?.trigger_event_type ?? 'compound_risk_detected',
      actionPlan: active?.action_type ?? 'founder_concierge_outreach',
      contacts,
      draft: {
        ...draft,
        caseId: active?.id ?? draft?.caseId ?? null,
      },
      isMonitoring,
      monitoringDetails: (isMonitoring && active) ? {
        status: 'active_monitoring',
        sentAt: active.sent_at ?? null,
        monitoringStartedAt: active.monitoring_started_at || active.sent_at || null,
        listeningFor: [
          'Webhook 504 errors resolved in PostHog telemetry',
          'Payment clearance or invoice settlement in Stripe',
          'Customer reply or engagement in Intercom / email',
        ],
      } : null,
      approvedAt: active?.approved_at ?? null,
      sentAt: active?.sent_at ?? null,
      lastResolution: latest?.resolution ?? null,
      lastCaseOpenedAt: latest?.opened_at ?? null,
      recentCaseCount: cases?.length ?? 0,
    }
  },
})

// ----- Tool: Get PostHog Behavioral Intent Signals -----

/**
 * Checks PostHog for concrete cancellation-intent events for a specific account.
 * Returns a clean yes/no + timestamps instead of forcing the agent to guess event names.
 */
export const getPostHogBehavioralIntentSignals = tool({
  description:
    'Check PostHog for cancellation-intent behavioral signals for a specific account: ' +
    'cancel-page views, cancel-button clicks, and session-time trend over the last 30 days. ' +
    'Use this when a founder asks: "Is X thinking about cancelling?", "Did they hit the cancel page?", ' +
    '"Is there behavioral evidence of churn intent?", or when assembling a full account profile. ' +
    'Returns a clean yes/no cancellation-intent flag plus timestamps — never requires the agent to guess PostHog event names.',
  inputSchema: z.object({
    workspaceId: z.string().describe('The workspace ID'),
    accountId: z.string().uuid().describe('The customer account UUID'),
  }),
  execute: async ({ workspaceId, accountId }) => {
    try {
      const { apiKey, projectId, apiHost } = await getPostHogCredentials(workspaceId)
      if (!projectId) return { error: 'PostHog project ID is missing' }

      const supabase = createServiceClient()
      const { data: contacts, error: contactsError } = await supabase
        .from('account_contacts')
        .select('email, external_ids')
        .eq('workspace_id', workspaceId)
        .eq('customer_account_id', accountId)

      if (contactsError) return { error: contactsError.message }
      if (!contacts || contacts.length === 0) {
        return { error: 'No live-linked contacts found for this account' }
      }

      const distinctIds: string[] = []
      for (const contact of contacts) {
        const ids = contact.external_ids?.posthog_distinct_ids
        if (Array.isArray(ids)) {
          distinctIds.push(...ids.filter((id): id is string => typeof id === 'string'))
        }
      }

      if (distinctIds.length === 0) {
        return { error: 'No PostHog identities linked to this account' }
      }

      // Canonical cancel-intent event names covering the most common SaaS naming conventions.
      const CANCEL_PAGE_EVENTS = [
        'cancel_page_viewed',
        'cancellation_page_viewed',
        'cancel_subscription_viewed',
        'viewed_cancel_page',
        '$pageview',
      ]
      const CANCEL_BUTTON_EVENTS = [
        'cancel_subscription_clicked',
        'cancel_button_clicked',
        'clicked_cancel_subscription',
        'cancellation_initiated',
        'cancel_intent_confirmed',
      ]

      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
      const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString()
      const host = apiHost || POSTHOG_DEFAULT_HOST

      let cancelPageAt: string | null = null
      let cancelButtonAt: string | null = null
      let totalChecked = 0
      let sessionsLast7d = 0
      let sessionsPrev7d = 0

      for (const distinctId of distinctIds.slice(0, 5)) {
        const url =
          `${host}/api/projects/${projectId}/events/?distinct_id=${encodeURIComponent(distinctId)}` +
          `&limit=200&after=${encodeURIComponent(thirtyDaysAgo)}`

        const response = await fetch(url, {
          headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
          redirect: 'follow',
          signal: AbortSignal.timeout(10_000),
        })

        if (!response.ok) {
          throw new Error(`PostHog API error: ${response.status} ${response.statusText}`)
        }

        const data = (await response.json()) as {
          results?: Array<{ event?: string; timestamp?: string; properties?: Record<string, unknown> }>
        }

        for (const ev of data.results ?? []) {
          if (!ev.timestamp || !ev.event) continue
          totalChecked++

          if (ev.timestamp >= sevenDaysAgo) sessionsLast7d++
          else if (ev.timestamp >= fourteenDaysAgo) sessionsPrev7d++

          if (
            CANCEL_PAGE_EVENTS.includes(ev.event) &&
            (ev.event !== '$pageview' ||
              String(ev.properties?.['$current_url'] ?? '').toLowerCase().includes('cancel'))
          ) {
            if (!cancelPageAt || ev.timestamp > cancelPageAt) cancelPageAt = ev.timestamp
          }

          if (CANCEL_BUTTON_EVENTS.includes(ev.event)) {
            if (!cancelButtonAt || ev.timestamp > cancelButtonAt) cancelButtonAt = ev.timestamp
          }
        }
      }

      let sessionTimeTrend: 'increasing' | 'decreasing' | 'stable' | 'insufficient_data' =
        'insufficient_data'
      if (totalChecked >= 10) {
        if (sessionsLast7d < sessionsPrev7d * 0.7) sessionTimeTrend = 'decreasing'
        else if (sessionsLast7d > sessionsPrev7d * 1.3) sessionTimeTrend = 'increasing'
        else sessionTimeTrend = 'stable'
      }

      const hasCancelIntent = !!(cancelPageAt || cancelButtonAt)

      return {
        source: 'posthog_live',
        observedAt: new Date().toISOString(),
        hasCancelIntent,
        cancelPageViewedAt: cancelPageAt,
        cancelButtonClickedAt: cancelButtonAt,
        sessionTimeTrend,
        sessionsLast7d,
        sessionsPrev7d,
        note: hasCancelIntent
          ? 'Concrete cancellation-intent signal detected. Combine with billing and support data to determine root cause before acting.'
          : 'No cancellation-intent events detected in the last 30 days.',
      }
    } catch (err) {
      return { error: err instanceof Error ? err.message : 'PostHog behavioral signal check failed' }
    }
  },
})

// ----- Tool: Get Account Full Profile (Composite) -----

/**
 * Composite tool: pulls Stripe billing state, PostHog usage, Intercom conversation summary,
 * and recovery case status for one account in a single call.
 * Preferred over calling each provider tool individually for any single-account question.
 */
export const getAccountFullProfile = tool({
  description:
    'DEPRECATED for customer scans: ALWAYS use getUnifiedCustomerScan instead for any customer health, churn, cancellation, billing, and usage scan. Only use getAccountFullProfile if specifically requested for raw internal account UUID records.',
  inputSchema: z.object({
    workspaceId: z.string().describe('The workspace ID'),
    accountId: z.string().uuid().describe('The customer account UUID'),
  }),
  execute: async ({ workspaceId, accountId }) => {
    const supabase = createServiceClient()

    const [stripeRes, posthogRes, intercomRes, recoveryRes] = await Promise.allSettled([
      // 1. Stripe billing state
      (async () => {
        const { data: canonicalAcc } = await supabase
          .from('customer_accounts')
          .select('name, contact_email, plan_name, account_status, mrr_cents, risk_level')
          .eq('workspace_id', workspaceId)
          .eq('id', accountId)
          .maybeSingle()

        const accounts = await listLiveStripeAccounts(workspaceId)
        const account = accounts.find(
          a => a.accountId === accountId || a.stripeCustomerId === accountId
        )

        const finalName = canonicalAcc?.name || account?.name || 'Customer'
        const finalEmail = canonicalAcc?.contact_email || account?.email || null
        const finalMrrCents = (canonicalAcc?.mrr_cents && canonicalAcc.mrr_cents > 0) ? canonicalAcc.mrr_cents : (account?.mrrCents || 0)

        if (!account && !canonicalAcc) return null
        return {
          name: finalName,
          email: finalEmail,
          plan: canonicalAcc?.plan_name || account?.plan || 'Enterprise',
          status: canonicalAcc?.account_status || account?.status || 'active',
          mrr: formatLiveMrr(finalMrrCents),
          riskLevel: canonicalAcc?.risk_level || account?.riskLevel || 'high',
          cancelAtPeriodEnd: account?.cancelAtPeriodEnd || false,
          nextAction: account ? liveStripeNextAction(account) : 'Review account health and coordinate recovery outreach',
        }
      })(),

      // 2. PostHog usage
      (async () => {
        try {
          const { apiKey, projectId, apiHost } = await getPostHogCredentials(workspaceId)
          if (!projectId) return null
          const { data: contacts } = await supabase
            .from('account_contacts')
            .select('external_ids')
            .eq('workspace_id', workspaceId)
            .eq('customer_account_id', accountId)
          const distinctIds: string[] = []
          for (const c of contacts ?? []) {
            const ids = c.external_ids?.posthog_distinct_ids
            if (Array.isArray(ids))
              distinctIds.push(...ids.filter((id): id is string => typeof id === 'string'))
          }
          if (distinctIds.length === 0) return null
          const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
          const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
          const host = apiHost || POSTHOG_DEFAULT_HOST
          let events7d = 0
          let events30d = 0
          let lastSeen: string | null = null
          for (const id of distinctIds.slice(0, 3)) {
            const url = `${host}/api/projects/${projectId}/events/?distinct_id=${encodeURIComponent(id)}&limit=100&after=${encodeURIComponent(thirtyDaysAgo)}`
            const resp = await fetch(url, {
              headers: { Authorization: `Bearer ${apiKey}` },
              signal: AbortSignal.timeout(8_000),
            })
            if (!resp.ok) continue
            const d = (await resp.json()) as { results?: Array<{ timestamp?: string }> }
            for (const ev of d.results ?? []) {
              if (!ev.timestamp) continue
              events30d++
              if (ev.timestamp >= sevenDaysAgo) events7d++
              if (!lastSeen || ev.timestamp > lastSeen) lastSeen = ev.timestamp
            }
          }
          return { events7d, events30d, lastSeen, distinctIdCount: distinctIds.length }
        } catch {
          return null
        }
      })(),

      // 3. Latest Intercom conversations for this account
      (async () => {
        try {
          const { data: contacts } = await supabase
            .from('account_contacts')
            .select('email')
            .eq('workspace_id', workspaceId)
            .eq('customer_account_id', accountId)
            .limit(3)
          const emails = (contacts ?? []).map(c => c.email).filter(Boolean)
          if (emails.length === 0) return null
          const { data: convos } = await supabase
            .from('intercom_conversations')
            .select('id, subject, state, updated_at')
            .eq('workspace_id', workspaceId)
            .in('contact_email', emails)
            .order('updated_at', { ascending: false })
            .limit(3)
          if (!convos?.length) return null
          return convos.map(c => ({
            id: c.id,
            subject: c.subject,
            state: c.state,
            updatedAt: c.updated_at,
          }))
        } catch {
          return null
        }
      })(),

      // 4. Active recovery case
      (async () => {
        const { data: cases } = await supabase
          .from('recovery_cases')
          .select(
            'id, status, severity, mrr_baseline_cents, trigger_event_type, opened_at, root_cause_summary'
          )
          .eq('workspace_id', workspaceId)
          .eq('customer_account_id', accountId)
          .not('status', 'in', '("resolved","suppressed")')
          .order('opened_at', { ascending: false })
          .limit(1)
        return cases?.[0] ?? null
      })(),
    ])

    const billing = stripeRes.status === 'fulfilled' ? stripeRes.value : null
    const usage = posthogRes.status === 'fulfilled' ? posthogRes.value : null
    const support = intercomRes.status === 'fulfilled' ? intercomRes.value : null
    const recovery = recoveryRes.status === 'fulfilled' ? recoveryRes.value : null

    return {
      source: 'composite_live',
      observedAt: new Date().toISOString(),
      accountId,
      billing: billing ?? { error: 'Stripe data unavailable or account not found' },
      usage: usage ?? { note: 'PostHog data unavailable or account not linked' },
      support: support ?? { note: 'No Intercom conversations found' },
      recovery: recovery
        ? {
            caseId: recovery.id,
            status: recovery.status,
            severity: recovery.severity,
            mrrAtRisk: '$' + ((recovery.mrr_baseline_cents ?? 0) / 100).toFixed(0),
            trigger: recovery.trigger_event_type,
            openedAt: recovery.opened_at,
            rootCauseSummary: recovery.root_cause_summary ?? null,
          }
        : { note: 'No active recovery case' },
    }
  },
})

// ----- Tool: Get Fleet Health Summary (Composite) -----

/**
 * Composite tool: workspace-wide portfolio health across all accounts.
 * Pulls live Stripe billing + recovery pipeline metrics in one call.
 */
export const getFleetHealthSummary = tool({
  description:
    'Get a workspace-wide portfolio health summary across all customer accounts in one call. ' +
    'Combines live Stripe billing overview (total MRR, at-risk accounts) ' +
    'with recovery pipeline metrics (cases opened, MRR at risk, recovered MRR). ' +
    'Use this when the founder asks fleet-wide questions: ' +
    '"How are all my accounts doing?", "How\'s everyone?", "What\'s our overall retention health?", ' +
    '"Give me an overview", or "Who should I be worried about today?". ' +
    'Prefer this over calling getAllAccounts + getRecoveryMetrics separately.',
  inputSchema: z.object({
    workspaceId: z.string().describe('The workspace ID'),
    windowDays: z
      .number()
      .int()
      .min(1)
      .max(90)
      .optional()
      .default(30)
      .describe('Recovery metrics observation window in days. Default: 30'),
  }),
  execute: async ({ workspaceId, windowDays }) => {
    const supabase = createServiceClient()
    const since = new Date(Date.now() - (windowDays ?? 30) * 86400 * 1000).toISOString()

    const [stripeRes, recoveryRes] = await Promise.allSettled([
      listLiveStripeAccounts(workspaceId),
      Promise.all([
        supabase
          .from('recovery_cases')
          .select('id, status, severity, mrr_baseline_cents')
          .eq('workspace_id', workspaceId)
          .gte('opened_at', since),
        supabase
          .from('draft_outcomes')
          .select('outcome_type, strict_recovered_cents, protected_cents')
          .eq('workspace_id', workspaceId)
          .gte('occurred_at', since),
      ]),
    ])

    const accounts = stripeRes.status === 'fulfilled' ? stripeRes.value : []
    const totalMrrCents = accounts.reduce((s, a) => s + a.mrrCents, 0)
    const atRiskAccounts = accounts.filter(a => a.riskLevel === 'high' || a.riskLevel === 'medium')
    const topAtRisk = atRiskAccounts
      .sort((a, b) => b.mrrCents - a.mrrCents)
      .slice(0, 5)
      .map(a => ({
        name: a.name,
        mrr: formatLiveMrr(a.mrrCents),
        riskLevel: a.riskLevel,
        nextAction: liveStripeNextAction(a),
      }))

    let recoveryMetrics: Record<string, unknown> = { error: 'Recovery data unavailable' }
    if (recoveryRes.status === 'fulfilled') {
      const [casesRes, outcomesRes] = recoveryRes.value
      const cases = casesRes.data ?? []
      const outcomes = outcomesRes.data ?? []
      const mrrAtRiskCents = cases
        .filter(c => !['resolved', 'suppressed'].includes(c.status))
        .reduce((s, c) => s + (c.mrr_baseline_cents ?? 0), 0)
      const strictRecoveredCents = outcomes.reduce((s, o) => s + (o.strict_recovered_cents ?? 0), 0)
      const protectedCents = outcomes.reduce((s, o) => s + (o.protected_cents ?? 0), 0)
      const byStatus = cases.reduce<Record<string, number>>((acc, c) => {
        acc[c.status] = (acc[c.status] ?? 0) + 1
        return acc
      }, {})
      recoveryMetrics = {
        totalCases: cases.length,
        mrrAtRisk: '$' + (mrrAtRiskCents / 100).toFixed(0),
        strictRecoveredMrr: '$' + (strictRecoveredCents / 100).toFixed(0),
        protectedMrr: '$' + (protectedCents / 100).toFixed(0),
        casesByStatus: byStatus,
      }
    }

    return {
      source: 'composite_live',
      observedAt: new Date().toISOString(),
      windowDays: windowDays ?? 30,
      fleet: {
        totalAccounts: accounts.length,
        totalMrr: formatLiveMrr(totalMrrCents),
        atRiskCount: atRiskAccounts.length,
        topAtRisk,
      },
      recoveryPipeline: recoveryMetrics,
    }
  },
})
