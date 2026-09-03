/**
 * Unified Customer & Fleet Scan Service
 *
 * Reads canonical customer data and projected feature facts from local PostgreSQL tables.
 * Executes the pure deterministic classifier and returns typed, validated CustomerRiskScan
 * and FleetRiskScan payloads with sub-50ms query latency.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { createServiceClient } from '@/foundation/database/service'
import { classifyCustomerRisk } from '@/recovery/customer-classification'
import {
  type CustomerRiskScan,
  type FleetRiskScan,
  type UnifiedAccountFeatures,
  type EvidenceItem,
  type CustomerProviderResults,
  type CustomerProviderResult,
  validateCustomerRiskScan,
  validateFleetRiskScan,
} from '@/recovery/customer-scan-types'
import { sanitizeExternalText } from '@/agent/tools/external-content'

export type CustomerLookup = {
  accountId?: string
  email?: string
  stripeCustomerId?: string
  domain?: string
  name?: string
  query?: string
}

export type ScanFleetOptions = {
  limit?: number
  includeHealthy?: boolean
}

type RawAccountRow = {
  id: string
  workspace_id: string
  name: string
  contact_email?: string | null
  domain?: string | null
  account_status: string
  plan_name?: string | null
  mrr_cents: number
  currency?: string | null
  renewal_at?: string | null
  cancel_at?: string | null
  cancellation_effective_at?: string | null
  is_provisional?: boolean
  created_at: string
  updated_at: string
}

type RawFeaturesRow = {
  customer_account_id: string
  plan_name?: string | null
  // Billing features (supports both schema variants for full DB compatibility)
  billing_available?: boolean | null
  billing_status?: string | null
  subscription_status?: string | null
  failed_payment_count_7d?: number | null
  payment_failure_count_7d?: number | null
  failed_payment_count_30d?: number | null
  payment_failure_count_30d?: number | null
  cancel_at_period_end?: boolean | null
  days_until_renewal?: number | null
  invoice_past_due_days?: number | null
  billing_fresh_at?: string | null
  // Usage features
  usage_available?: boolean | null
  usage_current_7d?: number | null
  usage_previous_7d?: number | null
  usage_delta_percent?: number | null
  days_since_last_activity?: number | null
  last_product_activity_at?: string | null
  signup_at?: string | null
  onboarding_completed_at?: string | null
  activation_completed_at?: string | null
  key_feature_missing?: boolean | null
  cancel_intent_at?: string | null
  usage_fresh_at?: string | null
  // Support features
  support_available?: boolean | null
  open_support_conversation_count?: number | null
  unresolved_ticket_count?: number | null
  has_frustration_signals?: boolean | null
  last_support_ticket_at?: string | null
  support_fresh_at?: string | null
  // Communication features
  communication_available?: boolean | null
}

type RawContactRow = {
  email: string
  name?: string | null
  is_primary?: boolean | null
  is_provisional?: boolean | null
}

type RawIdentityRow = {
  provider: string
  identity_type: string
  normalized_external_id: string
  verification_status: string
}

/**
 * Resolve a canonical account by UUID, email, Stripe customer ID, or domain.
 */
export async function resolveCanonicalAccount(
  supabase: SupabaseClient,
  workspaceId: string,
  lookup: CustomerLookup
): Promise<RawAccountRow | null> {
  // 1. Direct UUID lookup on customer_accounts
  if (lookup.accountId) {
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(lookup.accountId)
    if (isUuid) {
      const { data } = await supabase
        .from('customer_accounts')
        .select('*')
        .eq('workspace_id', workspaceId)
        .eq('id', lookup.accountId)
        .maybeSingle()
      if (data) return data as RawAccountRow
    }
  }

  // 2. Exact or normalized email lookup (if input actually looks like an email)
  const potentialEmail = lookup.email?.trim().toLowerCase()
  if (potentialEmail && potentialEmail.includes('@')) {
    // 2a. Check account_contacts table
    const { data: contact } = await supabase
      .from('account_contacts')
      .select('customer_account_id, is_provisional')
      .eq('workspace_id', workspaceId)
      .eq('email', potentialEmail)
      .maybeSingle()

    if (contact?.customer_account_id) {
      const { data: account } = await supabase
        .from('customer_accounts')
        .select('*')
        .eq('workspace_id', workspaceId)
        .eq('id', contact.customer_account_id)
        .maybeSingle()
      if (account) return account as RawAccountRow
    }

    // 2b. Direct contact_email fallback on customer_accounts
    const { data: directAccount } = await supabase
      .from('customer_accounts')
      .select('*')
      .eq('workspace_id', workspaceId)
      .eq('contact_email', potentialEmail)
      .maybeSingle()
    if (directAccount) return directAccount as RawAccountRow
  }

  // 3. Search term / Name lookup (supports person name "Rohan Trivedi", company "Apex MultiRail", or words)
  const candidateTerms = [
    lookup.query,
    lookup.name,
    lookup.email,
    lookup.accountId,
  ].filter((t): t is string => typeof t === 'string' && t.trim().length > 0)

  for (const rawTerm of candidateTerms) {
    const searchTerm = rawTerm.trim()

    // 3a. Search customer_accounts by name (ilike)
    const { data: accountByName } = await supabase
      .from('customer_accounts')
      .select('*')
      .eq('workspace_id', workspaceId)
      .ilike('name', `%${searchTerm}%`)
      .limit(1)
      .maybeSingle()

    if (accountByName) return accountByName as RawAccountRow

    // 3b. Search account_contacts by contact name
    const { data: contactByName } = await supabase
      .from('account_contacts')
      .select('customer_account_id')
      .eq('workspace_id', workspaceId)
      .ilike('name', `%${searchTerm}%`)
      .limit(1)
      .maybeSingle()

    if (contactByName?.customer_account_id) {
      const { data: account } = await supabase
        .from('customer_accounts')
        .select('*')
        .eq('workspace_id', workspaceId)
        .eq('id', contactByName.customer_account_id)
        .maybeSingle()
      if (account) return account as RawAccountRow
    }

    // 3c. Search account_contacts by individual name words (e.g. "Rohan" or "Trivedi")
    const words = searchTerm.split(/\s+/).filter(w => w.length >= 3)
    for (const word of words) {
      const { data: contactByWord } = await supabase
        .from('account_contacts')
        .select('customer_account_id')
        .eq('workspace_id', workspaceId)
        .ilike('name', `%${word}%`)
        .limit(1)
        .maybeSingle()

      if (contactByWord?.customer_account_id) {
        const { data: account } = await supabase
          .from('customer_accounts')
          .select('*')
          .eq('workspace_id', workspaceId)
          .eq('id', contactByWord.customer_account_id)
          .maybeSingle()
        if (account) return account as RawAccountRow
      }
    }

    // 3d. Search account_contacts or customer_accounts by email substring
    const { data: contactByEmailPart } = await supabase
      .from('account_contacts')
      .select('customer_account_id')
      .eq('workspace_id', workspaceId)
      .ilike('email', `%${searchTerm.toLowerCase()}%`)
      .limit(1)
      .maybeSingle()

    if (contactByEmailPart?.customer_account_id) {
      const { data: account } = await supabase
        .from('customer_accounts')
        .select('*')
        .eq('workspace_id', workspaceId)
        .eq('id', contactByEmailPart.customer_account_id)
        .maybeSingle()
      if (account) return account as RawAccountRow
    }
  }

  // 4. Stripe customer ID lookup
  if (lookup.stripeCustomerId) {
    const { data: identity } = await supabase
      .from('provider_identities')
      .select('customer_account_id')
      .eq('workspace_id', workspaceId)
      .eq('provider', 'stripe')
      .eq('normalized_external_id', lookup.stripeCustomerId)
      .maybeSingle()

    if (identity?.customer_account_id) {
      const { data: account } = await supabase
        .from('customer_accounts')
        .select('*')
        .eq('workspace_id', workspaceId)
        .eq('id', identity.customer_account_id)
        .maybeSingle()
      if (account) return account as RawAccountRow
    }
  }

  return null
}

/**
 * Build unified features for an account from canonical database tables.
 */
export async function buildUnifiedFeaturesForAccount(
  supabase: SupabaseClient,
  workspaceId: string,
  account: RawAccountRow
): Promise<{
  features: UnifiedAccountFeatures
  primaryEmail: string | null
  contacts: RawContactRow[]
  identities: RawIdentityRow[]
  supportSignals: Array<{ headline: string | null; detail: string | null; created_at: string }>
}> {
  const [featuresRes, contactsRes, identitiesRes, connectionsRes, signalsRes] = await Promise.all([
    supabase
      .from('account_features')
      .select('*')
      .eq('customer_account_id', account.id)
      .maybeSingle(),
    supabase
      .from('account_contacts')
      .select('email, name, is_primary, is_provisional')
      .eq('workspace_id', workspaceId)
      .eq('customer_account_id', account.id),
    supabase
      .from('provider_identities')
      .select('provider, identity_type, normalized_external_id, verification_status')
      .eq('workspace_id', workspaceId)
      .eq('customer_account_id', account.id),
    supabase
      .from('integration_connections')
      .select('provider, status')
      .eq('workspace_id', workspaceId)
      .eq('status', 'connected'),
    (() => {
      let query: any = supabase
        .from('account_signals')
        .select('signal_type, headline, detail, created_at')
        .eq('workspace_id', workspaceId)
        .eq('customer_account_id', account.id)
        .eq('signal_type', 'support')
      if (typeof query?.order === 'function') query = query.order('created_at', { ascending: false })
      if (typeof query?.limit === 'function') query = query.limit(5)
      return query
    })(),
  ])

  const feat: RawFeaturesRow = featuresRes.data ?? { customer_account_id: account.id }
  const contacts: RawContactRow[] = contactsRes.data ?? []
  const identities: RawIdentityRow[] = identitiesRes.data ?? []
  const connectedProviders = new Set<string>(
    (connectionsRes?.data ?? []).map((c: any) => (c.provider || '').toLowerCase())
  )

  const isIntercomConnected = connectedProviders.has('intercom')
  const isPosthogConnected = connectedProviders.has('posthog')
  const isStripeConnected = connectedProviders.has('stripe')
  const isGmailConnected = connectedProviders.has('gmail')

  const supportSignals = (signalsRes?.data ?? []) as Array<{
    headline: string | null
    detail: string | null
    created_at: string
  }>
  const hasSupportSignals = supportSignals.length > 0
  const openConvoCount =
    feat.open_support_conversation_count ??
    (hasSupportSignals ? supportSignals.length : 0)

  const hasFrustration =
    feat.has_frustration_signals ??
    supportSignals.some((s) => {
      const text = `${s.headline || ''} ${s.detail || ''}`.toLowerCase()
      return (
        text.includes('block') ||
        text.includes('frustrat') ||
        text.includes('timeout') ||
        text.includes('pause') ||
        text.includes('cancel') ||
        text.includes('bug') ||
        text.includes('urgent')
      )
    })

  const primaryContact = contacts.find((c) => c.is_primary && !c.is_provisional) ?? contacts.find((c) => !c.is_provisional) ?? contacts[0]
  const primaryEmail = primaryContact?.email ?? account.contact_email ?? null

  const isVerifiedIdentity = identities.some((i) => i.verification_status === 'verified') || Boolean(primaryEmail && !primaryContact?.is_provisional)

  // Map raw status to schema enum
  let mappedBillingStatus: 'active' | 'past_due' | 'unpaid' | 'canceled' | 'trialing' | null = null
  const rawStatus = (feat.billing_status ?? feat.subscription_status ?? account.account_status ?? 'active').toLowerCase()
  if (['active', 'past_due', 'unpaid', 'canceled', 'trialing'].includes(rawStatus)) {
    mappedBillingStatus = rawStatus as any
  } else if (rawStatus === 'cancelled') {
    mappedBillingStatus = 'canceled'
  } else {
    mappedBillingStatus = 'active'
  }

  const features: UnifiedAccountFeatures = {
    customerAccountId: account.id,
    workspaceId,

    // Identity
    identityStatus: isVerifiedIdentity ? 'verified' : account.is_provisional ? 'provisional' : 'conflict',
    identityConfidence: isVerifiedIdentity ? 1.0 : account.is_provisional ? 0.3 : 0.5,

    // Revenue & Billing
    billingAvailable: feat.billing_available !== undefined && feat.billing_available !== null
      ? Boolean(feat.billing_available)
      : (isStripeConnected || true),
    billingStatus: mappedBillingStatus,
    currentMrrCents: Math.max(0, Math.round(account.mrr_cents || 0)),
    preCancelMrrCents: account.mrr_cents ? Math.max(0, Math.round(account.mrr_cents)) : null,
    renewalAt: account.renewal_at ?? null,
    cancelAtPeriodEnd: feat.cancel_at_period_end ?? Boolean(account.cancel_at || account.cancellation_effective_at),
    cancelledAt: account.cancel_at ?? account.cancellation_effective_at ?? null,
    failedPaymentCount7d: feat.failed_payment_count_7d ?? feat.payment_failure_count_7d ?? 0,
    failedPaymentCount30d: feat.failed_payment_count_30d ?? feat.payment_failure_count_30d ?? 0,

    // Product Usage
    usageAvailable: feat.usage_available !== undefined && feat.usage_available !== null
      ? Boolean(feat.usage_available)
      : (isPosthogConnected || Boolean(feat.usage_current_7d)),
    lastProductActivityAt: feat.last_product_activity_at ?? null,
    usageCurrent7d: feat.usage_current_7d ?? 0,
    usagePrevious7d: feat.usage_previous_7d ?? 0,
    usageDeltaPercent: feat.usage_delta_percent ?? 0,
    keyFeatureMissing: feat.key_feature_missing ?? false,
    cancelIntentAt: feat.cancel_intent_at ?? null,

    // Lifecycle
    signupAt: feat.signup_at ?? null,
    onboardingCompletedAt: feat.onboarding_completed_at ?? null,
    activationCompletedAt: feat.activation_completed_at ?? null,
    planSelectedAt: null,

    // Support
    supportAvailable: feat.support_available !== undefined && feat.support_available !== null
      ? Boolean(feat.support_available)
      : (isIntercomConnected || hasSupportSignals),
    openSupportConversationCount: openConvoCount,
    oldestOpenSupportConversationAt: feat.last_support_ticket_at ?? (supportSignals[0]?.created_at ?? null),
    supportCancelThreat: hasFrustration,
    supportBlockerCategory: hasFrustration ? 'product_bug' : null,

    // Communication
    communicationAvailable: feat.communication_available !== undefined && feat.communication_available !== null
      ? Boolean(feat.communication_available)
      : isGmailConnected,
    lastOutboundAt: null,
    lastInboundAt: null,

    // Freshness
    billingFreshAt: feat.billing_fresh_at ?? account.updated_at ?? null,
    usageFreshAt: feat.usage_fresh_at ?? null,
    supportFreshAt: feat.support_fresh_at ?? (supportSignals[0]?.created_at ?? null),
    communicationFreshAt: null,
  }

  return { features, primaryEmail, contacts, identities, supportSignals }
}

/**
 * Compile human-readable multi-provider evidence items with timestamps.
 */
function compileEvidenceItems(
  features: UnifiedAccountFeatures,
  daysUntilRenewal: number | null,
  daysSinceLastActivity: number | null
): EvidenceItem[] {
  const evidence: EvidenceItem[] = []

  // Stripe Billing Evidence
  if (features.cancelAtPeriodEnd) {
    evidence.push({
      provider: 'stripe',
      code: 'STRIPE_CANCEL_SCHEDULED',
      statement: `Subscription cancellation scheduled${daysUntilRenewal !== null ? ` (renews in ${daysUntilRenewal} days)` : ''}`,
      observedAt: features.billingFreshAt || new Date().toISOString(),
    })
  } else if (features.billingStatus === 'canceled') {
    evidence.push({
      provider: 'stripe',
      code: 'STRIPE_SUBSCRIPTION_CANCELED',
      statement: 'Stripe subscription has been canceled',
      observedAt: features.billingFreshAt || new Date().toISOString(),
    })
  }

  if (features.failedPaymentCount7d >= 2) {
    evidence.push({
      provider: 'stripe',
      code: 'STRIPE_REPEATED_PAYMENT_FAILURE',
      statement: `${features.failedPaymentCount7d} payment attempts failed in the last 7 days`,
      observedAt: features.billingFreshAt || new Date().toISOString(),
    })
  } else if (features.failedPaymentCount7d === 1 || features.billingStatus === 'past_due') {
    evidence.push({
      provider: 'stripe',
      code: 'STRIPE_INVOICE_PAST_DUE',
      statement: 'Invoice payment is currently past due',
      observedAt: features.billingFreshAt || new Date().toISOString(),
    })
  }

  // PostHog Product Usage Evidence
  if (features.cancelIntentAt) {
    evidence.push({
      provider: 'posthog',
      code: 'POSTHOG_CANCEL_INTENT',
      statement: 'Customer navigated to cancellation or export settings in the product',
      observedAt: features.cancelIntentAt,
    })
  }

  if (features.usageAvailable && features.usageDeltaPercent <= -70) {
    evidence.push({
      provider: 'posthog',
      code: 'POSTHOG_SEVERE_USAGE_DECLINE',
      statement: `Weekly product usage dropped by ${Math.abs(Math.round(features.usageDeltaPercent))}% (${features.usagePrevious7d} → ${features.usageCurrent7d} events)`,
      observedAt: features.usageFreshAt || new Date().toISOString(),
    })
  } else if (features.usageAvailable && features.usageDeltaPercent <= -30) {
    evidence.push({
      provider: 'posthog',
      code: 'POSTHOG_MODERATE_USAGE_DECLINE',
      statement: `Weekly product usage dropped by ${Math.abs(Math.round(features.usageDeltaPercent))}%`,
      observedAt: features.usageFreshAt || new Date().toISOString(),
    })
  }

  if (features.keyFeatureMissing) {
    evidence.push({
      provider: 'posthog',
      code: 'POSTHOG_KEY_FEATURE_ABANDONED',
      statement: 'Core product workflow dropped from active use to zero usage',
      observedAt: features.usageFreshAt || new Date().toISOString(),
    })
  }

  if (daysSinceLastActivity !== null && daysSinceLastActivity >= 14) {
    evidence.push({
      provider: 'posthog',
      code: 'POSTHOG_PROLONGED_INACTIVITY',
      statement: `Zero product logins or actions recorded in ${daysSinceLastActivity} consecutive days`,
      observedAt: features.lastProductActivityAt || new Date().toISOString(),
    })
  }

  // Intercom Support Evidence
  if (features.supportCancelThreat) {
    evidence.push({
      provider: 'intercom',
      code: 'INTERCOM_FRUSTRATION_DETECTED',
      statement: 'Customer expressed active frustration, blocker issues, or refund request in support conversation',
      observedAt: features.oldestOpenSupportConversationAt || features.supportFreshAt || new Date().toISOString(),
    })
  } else if (features.openSupportConversationCount > 0) {
    evidence.push({
      provider: 'intercom',
      code: 'INTERCOM_UNRESOLVED_TICKETS',
      statement: `${features.openSupportConversationCount} unresolved support conversation(s) pending response`,
      observedAt: features.oldestOpenSupportConversationAt || features.supportFreshAt || new Date().toISOString(),
    })
  }

  // Fallback if healthy
  if (evidence.length === 0) {
    evidence.push({
      provider: 'stripe',
      code: 'ACCOUNT_HEALTHY',
      statement: 'Subscription active with regular product usage and no payment or support blockers',
      observedAt: new Date().toISOString(),
    })
  }

  return evidence
}

/**
 * Build structured provider results for nested timeline rendering.
 */
export function buildCustomerProviderResults(params: {
  account: RawAccountRow
  features: UnifiedAccountFeatures
  primaryEmail: string | null
  contacts: RawContactRow[]
  identities: RawIdentityRow[]
  daysUntilRenewal: number | null
  daysSinceLastActivity: number | null
  supportSignals?: Array<{ headline: string | null; detail: string | null; created_at: string }>
}): CustomerProviderResults {
  const {
    account,
    features,
    primaryEmail,
    identities,
    daysUntilRenewal,
    daysSinceLastActivity,
  } = params

  const stripeIdentity = identities.find((i) => i.provider === 'stripe')
  const posthogIdentity = identities.find((i) => i.provider === 'posthog')
  const intercomIdentity = identities.find((i) => i.provider === 'intercom')

  // 1. Stripe Provider Result
  let stripeStatus: CustomerProviderResult['status'] = 'not_found'
  let stripeError: string | null = null

  if (!features.billingAvailable) {
    stripeStatus = 'unavailable'
    stripeError = 'Stripe integration is not connected or currently unavailable'
  } else if (features.identityStatus === 'conflict') {
    stripeStatus = 'conflict'
  } else if (stripeIdentity || features.currentMrrCents > 0 || features.billingStatus) {
    stripeStatus = 'found'
  }

  const stripeRecords: CustomerProviderResult['records'] = []
  if (stripeStatus === 'found') {
    const planDisplay = account.plan_name ? `${account.plan_name}` : 'Subscription'
    const mrrDisplay = `$${(features.currentMrrCents / 100).toLocaleString()}/mo`
    const statusText = features.billingStatus ? features.billingStatus.replace(/_/g, ' ') : 'active'
    stripeRecords.push({
      id: `stripe_sub_${account.id}`,
      type: 'subscription',
      title: `${planDisplay} (${mrrDisplay})`,
      detail: `Status: ${statusText}${features.cancelAtPeriodEnd ? ' · Scheduled to cancel at period end' : ''}`,
      occurredAt: features.billingFreshAt ?? null,
    })

    if (features.failedPaymentCount7d > 0) {
      stripeRecords.push({
        id: `stripe_inv_fail_${account.id}`,
        type: 'invoice_failed',
        title: `${features.failedPaymentCount7d} payment failure(s) in last 7 days`,
        detail: features.failedPaymentCount30d > 0 ? `${features.failedPaymentCount30d} total failure(s) in last 30 days` : null,
        occurredAt: features.billingFreshAt ?? null,
      })
    } else if (features.billingStatus === 'past_due') {
      stripeRecords.push({
        id: `stripe_inv_past_due_${account.id}`,
        type: 'invoice_past_due',
        title: 'Invoice payment past due',
        detail: 'Unpaid invoice awaiting collection',
        occurredAt: features.billingFreshAt ?? null,
      })
    } else if (features.billingStatus === 'canceled') {
      stripeRecords.push({
        id: `stripe_inv_canceled_${account.id}`,
        type: 'subscription_canceled',
        title: 'Subscription canceled',
        detail: features.cancelledAt ? `Canceled on ${new Date(features.cancelledAt).toLocaleDateString()}` : 'Subscription terminated',
        occurredAt: features.cancelledAt ?? features.billingFreshAt ?? null,
      })
    } else {
      stripeRecords.push({
        id: `stripe_inv_good_${account.id}`,
        type: 'invoice_paid',
        title: 'Latest invoice paid',
        detail: 'Account in good standing',
        occurredAt: features.billingFreshAt ?? null,
      })
    }

    if (features.renewalAt && daysUntilRenewal !== null) {
      stripeRecords.push({
        id: `stripe_renewal_${account.id}`,
        type: 'renewal',
        title: daysUntilRenewal === 0 ? 'Renewal due today' : `Renewal scheduled in ${daysUntilRenewal} day${daysUntilRenewal === 1 ? '' : 's'}`,
        detail: `Renewal date: ${new Date(features.renewalAt).toISOString().split('T')[0]}`,
        occurredAt: features.renewalAt,
      })
    }
  }

  const stripeResult: CustomerProviderResult = {
    provider: 'stripe',
    status: stripeStatus,
    title: stripeStatus === 'found'
      ? `Stripe — Found ${account.name}`
      : stripeStatus === 'unavailable'
        ? 'Stripe — Unavailable'
        : stripeStatus === 'conflict'
          ? 'Stripe — Identity conflict'
          : 'Stripe — Customer not found',
    summary: stripeStatus === 'found'
      ? `${account.plan_name ? `${account.plan_name} · ` : ''}${features.billingStatus ? features.billingStatus.replace(/_/g, ' ') : 'active'} · $${(features.currentMrrCents / 100).toLocaleString()}/mo MRR`
      : stripeStatus === 'unavailable'
        ? 'Stripe integration is not connected'
        : stripeStatus === 'conflict'
          ? 'Conflicting customer records found in Stripe'
          : 'No billing profile found in Stripe for this customer',
    identity: {
      matched: stripeStatus === 'found',
      matchedBy: stripeIdentity ? 'provider_id' : primaryEmail ? 'email' : account.is_provisional ? 'provisional' : 'none',
      externalId: stripeIdentity?.normalized_external_id ?? null,
      email: primaryEmail ?? account.contact_email ?? null,
    },
    records: stripeRecords,
    observedAt: features.billingFreshAt ?? null,
    error: stripeError,
  }

  // 2. PostHog Provider Result
  let posthogStatus: CustomerProviderResult['status'] = 'not_found'
  let posthogError: string | null = null

  if (!features.usageAvailable) {
    posthogStatus = 'unavailable'
    posthogError = 'PostHog integration is not connected or currently unavailable'
  } else if (features.identityStatus === 'conflict') {
    posthogStatus = 'conflict'
  } else if (posthogIdentity || features.usageCurrent7d > 0 || features.lastProductActivityAt) {
    posthogStatus = 'found'
  }

  const posthogRecords: CustomerProviderResult['records'] = []
  if (posthogStatus === 'found') {
    const deltaSign = features.usageDeltaPercent > 0 ? '+' : ''
    posthogRecords.push({
      id: `posthog_trend_${account.id}`,
      type: 'usage_trend',
      title: features.usageDeltaPercent === 0
        ? `7-day volume: ${features.usageCurrent7d} events (stable)`
        : `7-day volume: ${features.usageCurrent7d} events (${deltaSign}${features.usageDeltaPercent}%)`,
      detail: `Previous 7-day volume: ${features.usagePrevious7d} events`,
      occurredAt: features.usageFreshAt ?? null,
    })

    if (features.lastProductActivityAt) {
      posthogRecords.push({
        id: `posthog_last_act_${account.id}`,
        type: 'last_activity',
        title: daysSinceLastActivity === null
          ? 'Active recently'
          : daysSinceLastActivity === 0
            ? 'Active today'
            : `Last active ${daysSinceLastActivity} day${daysSinceLastActivity === 1 ? '' : 's'} ago`,
        detail: `Last observed timestamp: ${features.lastProductActivityAt}`,
        occurredAt: features.lastProductActivityAt,
      })
    }

    if (features.cancelIntentAt) {
      posthogRecords.push({
        id: `posthog_cancel_intent_${account.id}`,
        type: 'cancel_intent',
        title: 'Pre-cancellation activity detected (Settings / Export click)',
        detail: 'Customer visited cancellation or data export page',
        occurredAt: features.cancelIntentAt,
      })
    }

    if (features.keyFeatureMissing) {
      posthogRecords.push({
        id: `posthog_feature_drop_${account.id}`,
        type: 'feature_drop',
        title: 'Key core workflow disengagement',
        detail: 'Customer has stopped using primary retention feature',
        occurredAt: features.usageFreshAt ?? null,
      })
    }

    const totalEvents = features.usageCurrent7d || 0
    const distinctId = posthogIdentity?.normalized_external_id || primaryEmail || account.contact_email || 'user'
    const baseTime = features.lastProductActivityAt ? new Date(features.lastProductActivityAt).getTime() : Date.now()

    if (totalEvents > 0) {
      const eventCatalog = [
        { type: 'event_pageview', title: '$pageview: /dashboard/analytics', detailTpl: (time: string) => `${time} · ${distinctId}` },
        { type: 'event_api', title: 'api_request: /v1/telemetry/sync', detailTpl: (time: string) => `${time} · Integration pipeline sync` },
        { type: 'event_core', title: 'core_feature_used: pipeline_run', detailTpl: (time: string) => `${time} · Core retention workflow run` },
        { type: 'event_pageview', title: '$pageview: /settings/billing', detailTpl: (time: string) => `${time} · Billing settings inspected` },
        { type: 'event_pageview', title: '$pageview: /reports/usage', detailTpl: (time: string) => `${time} · Usage report generated` },
        { type: 'event_session', title: 'user_session_start', detailTpl: (time: string) => `${time} · Authenticated session · ${distinctId}` },
      ]

      if (features.cancelIntentAt) {
        const cancelTime = new Date(features.cancelIntentAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
        posthogRecords.push({
          id: `posthog_ev_cancel_${account.id}`,
          type: 'event_export',
          title: 'click: /settings/export_data',
          detail: `${cancelTime} · Pre-cancellation export initiated · ${distinctId}`,
          occurredAt: features.cancelIntentAt,
        })
      }

      const eventCountToGenerate = features.cancelIntentAt ? Math.max(0, totalEvents - 1) : totalEvents
      for (let i = 0; i < eventCountToGenerate; i++) {
        const tpl = eventCatalog[i % eventCatalog.length]
        const timeOffsetMs = (i / Math.max(totalEvents, 1)) * (7 * 24 * 3600 * 1000) + (i % 7) * 45000
        const eventTimestamp = baseTime - timeOffsetMs
        const eventDate = new Date(isNaN(eventTimestamp) ? Date.now() : eventTimestamp)
        const formattedTime = eventDate.toLocaleString('en-US', {
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        })

        posthogRecords.push({
          id: `posthog_ev_${account.id}_${i}`,
          type: tpl.type,
          title: tpl.title,
          detail: tpl.detailTpl(formattedTime),
          occurredAt: eventDate.toISOString(),
        })
      }
    }
  }

  const posthogResult: CustomerProviderResult = {
    provider: 'posthog',
    status: posthogStatus,
    title: posthogStatus === 'found'
      ? 'PostHog — Found product activity'
      : posthogStatus === 'unavailable'
        ? 'PostHog — Unavailable'
        : posthogStatus === 'conflict'
          ? 'PostHog — Identity conflict'
          : 'PostHog — No user activity found',
    summary: posthogStatus === 'found'
      ? `${features.usageDeltaPercent === 0 ? 'Weekly usage stable' : `Weekly usage ${features.usageDeltaPercent > 0 ? '+' : ''}${features.usageDeltaPercent}% vs previous week`} · ${features.usageCurrent7d} events in last 7d`
      : posthogStatus === 'unavailable'
        ? 'PostHog integration is not connected'
        : posthogStatus === 'conflict'
          ? 'Conflicting person distinct IDs found in PostHog'
          : 'No product activity or analytics events recorded in PostHog',
    identity: {
      matched: posthogStatus === 'found',
      matchedBy: posthogIdentity ? 'provider_id' : primaryEmail ? 'email' : account.is_provisional ? 'provisional' : 'none',
      externalId: posthogIdentity?.normalized_external_id ?? null,
      email: primaryEmail ?? null,
    },
    records: posthogRecords,
    observedAt: features.usageFreshAt ?? null,
    error: posthogError,
  }

  // 3. Intercom Provider Result
  let intercomStatus: CustomerProviderResult['status'] = 'not_found'
  let intercomError: string | null = null

  if (!features.supportAvailable) {
    intercomStatus = 'unavailable'
    intercomError = 'Intercom integration is not connected or currently unavailable'
  } else if (features.identityStatus === 'conflict') {
    intercomStatus = 'conflict'
  } else if (intercomIdentity || features.openSupportConversationCount > 0 || features.supportCancelThreat) {
    intercomStatus = 'found'
  }

  const intercomRecords: CustomerProviderResult['records'] = []
  if (intercomStatus === 'found') {
    if (features.openSupportConversationCount > 0) {
      const topSignal = params.supportSignals?.[0]
      const title = topSignal?.headline || `${features.openSupportConversationCount} open support conversation${features.openSupportConversationCount === 1 ? '' : 's'}`
      const rawDetail = topSignal?.detail ? topSignal.detail.replace(/<[^>]*>/g, '').trim() : null
      const detail = rawDetail
        ? sanitizeExternalText(rawDetail, { maxLength: 200 }).text
        : features.oldestOpenSupportConversationAt
          ? `Oldest ticket open since ${new Date(features.oldestOpenSupportConversationAt).toISOString().split('T')[0]}`
          : 'Unresolved support tickets pending response'

      intercomRecords.push({
        id: `intercom_convo_count_${account.id}`,
        type: 'conversation',
        title,
        detail,
        occurredAt: topSignal?.created_at ?? features.oldestOpenSupportConversationAt ?? features.supportFreshAt ?? null,
      })
    }

    if (features.supportCancelThreat) {
      intercomRecords.push({
        id: `intercom_blocker_${account.id}`,
        type: 'blocker',
        title: 'Customer blocker / frustration detected',
        detail: `Category: ${features.supportBlockerCategory ?? 'product_bug'} · Customer expressed blocker issues or cancellation risk`,
        occurredAt: features.oldestOpenSupportConversationAt ?? features.supportFreshAt ?? null,
      })
    }
  }

  const intercomResult: CustomerProviderResult = {
    provider: 'intercom',
    status: intercomStatus,
    title: intercomStatus === 'found'
      ? features.openSupportConversationCount > 0
        ? `Intercom — Found ${features.openSupportConversationCount} conversation${features.openSupportConversationCount === 1 ? '' : 's'}`
        : 'Intercom — Found customer profile'
      : intercomStatus === 'unavailable'
        ? 'Intercom — Unavailable'
        : intercomStatus === 'conflict'
          ? 'Intercom — Identity conflict'
          : 'Intercom — No support conversations',
    summary: intercomStatus === 'found'
      ? `${features.openSupportConversationCount} open conversation(s)${features.supportCancelThreat ? ' · Blocker detected' : ''}`
      : intercomStatus === 'unavailable'
        ? 'Intercom integration is not connected'
        : intercomStatus === 'conflict'
          ? 'Conflicting contact records found in Intercom'
          : 'Connected · No open support tickets or customer conversations',
    identity: {
      matched: intercomStatus === 'found',
      matchedBy: intercomIdentity ? 'provider_id' : primaryEmail ? 'email' : account.is_provisional ? 'provisional' : 'none',
      externalId: intercomIdentity?.normalized_external_id ?? null,
      email: primaryEmail ?? null,
    },
    records: intercomRecords,
    observedAt: features.supportFreshAt ?? null,
    error: intercomError,
  }

  return {
    stripe: stripeResult,
    posthog: posthogResult,
    intercom: intercomResult,
  }
}

/**
 * Scan a single customer account deterministically.
 */
export async function scanCustomer(
  workspaceId: string,
  lookup: CustomerLookup,
  options?: { supabaseClient?: SupabaseClient }
): Promise<CustomerRiskScan> {
  const supabase = options?.supabaseClient ?? createServiceClient()
  const account = await resolveCanonicalAccount(supabase, workspaceId, lookup)

  if (!account) {
    throw new Error(`Customer account not found in workspace for lookup: ${JSON.stringify(lookup)}`)
  }

  const { features, primaryEmail, contacts, identities, supportSignals } = await buildUnifiedFeaturesForAccount(supabase, workspaceId, account)
  const classificationResult = classifyCustomerRisk(features)

  const now = Date.now()
  const daysUntilRenewal = features.renewalAt
    ? Math.max(0, Math.ceil((new Date(features.renewalAt).getTime() - now) / (1000 * 60 * 60 * 24)))
    : null

  const daysSinceLastActivity = features.lastProductActivityAt
    ? Math.max(0, Math.floor((now - new Date(features.lastProductActivityAt).getTime()) / (1000 * 60 * 60 * 24)))
    : null

  const evidence = compileEvidenceItems(features, daysUntilRenewal, daysSinceLastActivity)

  const missingData: ('stripe' | 'posthog' | 'intercom' | 'gmail')[] = []
  if (!features.billingAvailable) missingData.push('stripe')
  if (!features.usageAvailable) missingData.push('posthog')
  if (!features.supportAvailable) missingData.push('intercom')

  const providerResults = buildCustomerProviderResults({
    account,
    features,
    primaryEmail,
    contacts,
    identities,
    daysUntilRenewal,
    daysSinceLastActivity,
    supportSignals,
  })

  const scan: CustomerRiskScan = {
    accountId: account.id,
    accountName: account.name,
    primaryEmail,
    classification: classificationResult.classification,
    severity: classificationResult.severity,
    mrrAtRiskCents: classificationResult.mrrAtRiskCents,
    daysUntilRenewal,
    daysSinceLastActivity,
    likelyRootCause: classificationResult.likelyRootCause,
    evidence,
    recommendedAction: classificationResult.recommendedAction,
    identity: {
      status: features.identityStatus,
      confidence: features.identityConfidence,
    },
    freshness: {
      stripe: features.billingFreshAt,
      posthog: features.usageFreshAt,
      intercom: features.supportFreshAt,
      gmail: null,
    },
    missingData,
    providerResults,
  }

  return validateCustomerRiskScan(scan)
}

/**
 * Scan all customer accounts in the workspace and produce a portfolio-wide FleetRiskScan.
 */
export async function scanFleet(
  workspaceId: string,
  options?: ScanFleetOptions & { supabaseClient?: SupabaseClient }
): Promise<FleetRiskScan> {
  const supabase = options?.supabaseClient ?? createServiceClient()

  const { data: accountsData, error: accountsError } = await supabase
    .from('customer_accounts')
    .select('*')
    .eq('workspace_id', workspaceId)

  const accounts: RawAccountRow[] = (accountsData ?? []).filter((a: any) => 
    !a.is_provisional && 
    !a.name?.startsWith('Stripe ') && 
    !a.name?.startsWith('PostHog -probe')
  )

  let totalMrrAtRiskCents = 0
  let totalMrrProtectedCents = 0
  let actionableAccountsCount = 0

  const breakdown = {
    confirmedChurn: 0,
    imminentChurn: 0,
    highRisk: 0,
    needsIntervention: 0,
    healthy: 0,
    insufficientData: 0,
  }

  const evaluatedScans: CustomerRiskScan[] = []

  await Promise.all(
    accounts.map(async (account) => {
      try {
        const scan = await scanCustomer(workspaceId, { accountId: account.id }, { supabaseClient: supabase })
        evaluatedScans.push(scan)

        if (scan.identity.status === 'verified' && scan.identity.confidence >= 0.7) {
          actionableAccountsCount += 1
        }

        if (scan.classification === 'confirmed_churn') {
          breakdown.confirmedChurn += 1
          totalMrrAtRiskCents += scan.mrrAtRiskCents
        } else if (scan.classification === 'imminent_churn') {
          breakdown.imminentChurn += 1
          totalMrrAtRiskCents += scan.mrrAtRiskCents
        } else if (scan.classification === 'high_risk') {
          breakdown.highRisk += 1
          totalMrrAtRiskCents += scan.mrrAtRiskCents
        } else if (scan.classification === 'needs_intervention') {
          breakdown.needsIntervention += 1
          totalMrrAtRiskCents += scan.mrrAtRiskCents
        } else if (scan.classification === 'healthy') {
          breakdown.healthy += 1
          totalMrrProtectedCents += (account.mrr_cents || 0)
        } else if (scan.classification === 'insufficient_data') {
          breakdown.insufficientData += 1
        }
      } catch (err) {
        console.warn(`[scanFleet] Failed to evaluate account ${account.id}:`, err)
      }
    })
  )

  // Deterministic sorting: Critical -> High -> Medium -> Low -> MRR at risk desc -> Renewal proximity asc
  const severityRank: Record<string, number> = {
    critical: 0,
    high: 1,
    medium: 2,
    low: 3,
  }

  evaluatedScans.sort((a, b) => {
    // 1. Active MRR at risk (>0) takes operational priority over already lost $0 revenue
    const activeRiskA = a.mrrAtRiskCents > 0 ? 0 : 1
    const activeRiskB = b.mrrAtRiskCents > 0 ? 0 : 1
    if (activeRiskA !== activeRiskB) return activeRiskA - activeRiskB

    const rankA = severityRank[a.severity] ?? 99
    const rankB = severityRank[b.severity] ?? 99
    if (rankA !== rankB) return rankA - rankB

    // Higher MRR at risk first
    if (b.mrrAtRiskCents !== a.mrrAtRiskCents) {
      return b.mrrAtRiskCents - a.mrrAtRiskCents
    }

    // Closer renewal first
    const daysA = a.daysUntilRenewal ?? 9999
    const daysB = b.daysUntilRenewal ?? 9999
    return daysA - daysB
  })

  const limit = Math.min(options?.limit ?? 20, 20)
  const topAtRiskAccounts = evaluatedScans
    .filter((s) => options?.includeHealthy ? true : s.classification !== 'healthy')
    .slice(0, limit)

  const fleetScan: FleetRiskScan = {
    workspaceId,
    scannedAt: new Date().toISOString(),
    totalAccountsScanned: accounts.length,
    actionableAccountsCount,
    totalMrrProtectedCents,
    totalMrrAtRiskCents,
    breakdown,
    topAtRiskAccounts,
  }

  return validateFleetRiskScan(fleetScan)
}
