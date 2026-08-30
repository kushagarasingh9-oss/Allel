/**
 * Stripe Workspace Sync — Goal.md compliant
 *
 * §14.1 Single-writer rule: This module does NOT write risk_score or risk_level.
 * It writes billing facts and identity mappings, then enqueues project_account_features
 * jobs so the canonical decision pipeline owns scoring.
 *
 * §10.2: Stripe customer ID is the primary identity key.
 * Email is a fallback, not the primary Stripe key.
 *
 * §13.5: Pre-cancel MRR is captured before zeroing current MRR.
 */

import { createServiceClient } from '@/foundation/database/service'
import { logAgentRun } from '@/agent/runtime/run-logger'
import { syncSubscriptions } from '@/integrations/stripe/stripe'
import { generateWorkspaceBrief } from '@/intelligence/briefs/generate-workspace-brief'
import { mergeIntegrationConnectionMetadata } from '@/integrations/_core/connection-guard'
import {
  upsertProviderIdentity,
  linkContactSafely,
  promoteCustomerIdentitySafely,
  SyncIdentityResult,
} from '@/recovery/identity'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ExistingAccount = {
  id: string
  name: string
  usage_delta_percent: number
  open_issue: string | null
  last_touch_at: string | null
  renewal_at: string | null
  account_status: string
  mrr_cents: number
  is_provisional?: boolean
}

type ExistingContact = {
  email: string
  customer_account_id: string
  is_provisional?: boolean
}

export type StripeWorkspaceSyncResult = {
  syncedAccounts: number
  updatedContacts: number
  highRiskAccounts: number
  identityConflicts: number
  provisionalAccounts: number
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function normalizeAccountStatus(status: string): 'trial' | 'active' | 'past_due' | 'cancelled' {
  switch (status) {
    case 'trialing':
      return 'trial'
    case 'past_due':
    case 'unpaid':
    case 'incomplete':
    case 'incomplete_expired':
      return 'past_due'
    case 'canceled':
      return 'cancelled'
    default:
      return 'active'
  }
}

function buildNextAction(accountStatus: string): string {
  if (accountStatus === 'past_due') {
    return 'Review billing recovery outreach and approve a payment nudge.'
  }
  if (accountStatus === 'cancelled') {
    return 'Review the save motion and decide whether to reach out manually.'
  }
  return 'No immediate billing action needed.'
}

// ---------------------------------------------------------------------------
// Main sync function
// ---------------------------------------------------------------------------

export async function syncStripeWorkspace(
  workspaceId: string,
  options?: { refreshBrief?: boolean }
): Promise<StripeWorkspaceSyncResult> {
  const supabase = createServiceClient()
  const subscriptions = await syncSubscriptions(workspaceId)
  const syncRunStart = new Date().toISOString()

  const [{ data: existingAccounts, error: accountsError }, { data: existingContacts, error: contactsError }] =
    await Promise.all([
      supabase
        .from('customer_accounts')
        .select('id, name, usage_delta_percent, open_issue, last_touch_at, renewal_at, account_status, mrr_cents, is_provisional')
        .eq('workspace_id', workspaceId),
      supabase
        .from('account_contacts')
        .select('email, customer_account_id, is_provisional')
        .eq('workspace_id', workspaceId),
    ])

  if (accountsError) throw accountsError
  if (contactsError) throw contactsError

  const accountsById = new Map(
    ((existingAccounts as ExistingAccount[] | null) ?? []).map((a) => [a.id, a])
  )
  const accountsByName = new Map(
    ((existingAccounts as ExistingAccount[] | null) ?? []).map((a) => [
      a.name.trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' '),
      a,
    ])
  )
  // Only non-provisional contacts can be used for verified cross-provider resolution
  const contactsByEmail = new Map(
    ((existingContacts as ExistingContact[] | null) ?? [])
      .filter((c) => !c.is_provisional)
      .map((c) => [c.email.toLowerCase(), c])
  )

  // Also resolve by provider_identities (Stripe customer_id → account)
  const { data: stripeIdentities } = await supabase
    .from('provider_identities')
    .select('customer_account_id, normalized_external_id')
    .eq('workspace_id', workspaceId)
    .eq('provider', 'stripe')
    .eq('identity_type', 'customer_id')
    .eq('verification_status', 'verified')

  const stripeIdToAccountId = new Map<string, string>(
    (stripeIdentities ?? []).map((r: { normalized_external_id: string; customer_account_id: string }) => [
      r.normalized_external_id,
      r.customer_account_id,
    ])
  )

  let syncedAccounts = 0
  let updatedContacts = 0
  let highRiskAccounts = 0
  let identityConflicts = 0
  let provisionalAccounts = 0

  for (const subscription of subscriptions) {
    const accountName =
      subscription.customerName?.trim() ||
      subscription.customerEmail?.trim() ||
      `Stripe ${subscription.stripeCustomerId.slice(-8)}`

    const accountStatus = normalizeAccountStatus(subscription.status)
    const renewalAt = subscription.currentPeriodEnd.toISOString()

    // §10.2: Resolution order — Stripe customer ID first, then verified non-provisional contact email.
    // Name matching MUST NEVER mutate an existing account (§do.md §2).
    const byStripeId = stripeIdToAccountId.get(subscription.stripeCustomerId)
    const existingContact = subscription.customerEmail
      ? contactsByEmail.get(subscription.customerEmail.toLowerCase())
      : undefined

    let resolvedAccount: ExistingAccount | null = null
    if (byStripeId) {
      resolvedAccount = accountsById.get(byStripeId) ?? null
    } else if (existingContact) {
      resolvedAccount = accountsById.get(existingContact.customer_account_id) ?? null
    } else {
      // Check if name matches an existing account only for conflict reporting
      const normalizedName = accountName.trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ')
      const nameCandidate = accountsByName.get(normalizedName)
      if (nameCandidate) {
        console.warn(`[stripe-sync] Stripe customer "${accountName}" (${subscription.stripeCustomerId}) shares name with account ${nameCandidate.id}, but has no verified identity. Creating isolated account.`)
        identityConflicts += 1
      }
      // resolvedAccount remains null -> creates a clean isolated account for this Stripe customer
    }

    const existingAccount = resolvedAccount ?? null

    // §13.5: Capture pre-cancel MRR before setting current to 0
    const isNowCancelled = accountStatus === 'cancelled'
    const wasActive = existingAccount && existingAccount.account_status !== 'cancelled'
    const preCancelMrr = isNowCancelled && wasActive
      ? (existingAccount?.mrr_cents ?? subscription.mrrCents)
      : null

    const accountPayload = {
      workspace_id: workspaceId,
      name: accountName,
      segment: 'Stripe customer',
      plan_name: subscription.planName,
      account_status: accountStatus,
      mrr_cents: isNowCancelled ? 0 : subscription.mrrCents,
      usage_delta_percent: existingAccount?.usage_delta_percent ?? 0,
      open_issue: existingAccount?.open_issue ?? null,
      next_action: buildNextAction(accountStatus),
      last_touch_at: existingAccount?.last_touch_at ?? null,
      renewal_at: renewalAt,
    }

    let customerAccountId = existingAccount?.id ?? null

    // Step 1: If creating a new account, insert it first as non-provisional
    if (!customerAccountId) {
      const { data: insertedAccount, error: insertError } = await supabase
        .from('customer_accounts')
        .insert({ ...accountPayload, is_provisional: false })
        .select('id')
        .single()

      if (insertError) throw insertError
      if (!insertedAccount?.id) {
        throw new Error('Stripe sync inserted an account without returning an id')
      }

      const insertedId: string = insertedAccount.id
      customerAccountId = insertedId

      const record: ExistingAccount = {
        id: insertedId,
        name: accountName,
        usage_delta_percent: 0,
        open_issue: null,
        last_touch_at: null,
        renewal_at: renewalAt,
        account_status: accountStatus,
        mrr_cents: isNowCancelled ? 0 : subscription.mrrCents,
        is_provisional: false,
      }
      accountsById.set(insertedId, record)
      accountsByName.set(accountName, record)
    } else if (existingAccount?.is_provisional === true) {
      // Step 1b: If account was provisional, promote it safely with authoritative Stripe evidence
      await promoteCustomerIdentitySafely(supabase, {
        workspaceId,
        customerAccountId,
        source: 'stripe_sync',
        evidence: { stripe_customer_id: subscription.stripeCustomerId },
      })
    }

    // Step 2: Establish Stripe customer_id identity safely BEFORE projecting billing facts
    let hasIdentityConflict = false

    const custResult = await upsertProviderIdentity(supabase, {
      workspaceId,
      customerAccountId,
      provider: 'stripe',
      identityType: 'customer_id',
      externalId: subscription.stripeCustomerId,
      isPrimary: true,
      verificationStatus: 'verified',
      source: 'stripe_sync',
      metadata: { subscription_id: subscription.subscriptionId },
    })

    if (custResult.status === 'ok') {
      stripeIdToAccountId.set(subscription.stripeCustomerId, customerAccountId)
    } else if (custResult.status === 'conflict') {
      console.warn(`[stripe-sync] identity conflict for stripe customer ${subscription.stripeCustomerId}:`, custResult.reason)
      identityConflicts += 1
      hasIdentityConflict = true
    } else if (custResult.status === 'error') {
      console.error(`[stripe-sync] identity write error for stripe customer ${subscription.stripeCustomerId}:`, custResult.error)
      hasIdentityConflict = true
    }

    // Link contact safely
    if (subscription.customerEmail && customerAccountId && !hasIdentityConflict) {
      const contactResult = await linkContactSafely(supabase, {
        workspaceId,
        customerAccountId,
        email: subscription.customerEmail,
        name: subscription.customerName ?? null,
        role: 'billing',
        isPrimary: true,
        externalIds: {
          stripe_customer_id: subscription.stripeCustomerId,
          stripe_subscription_id: subscription.subscriptionId,
        },
        source: 'stripe_sync',
        isProvisional: false,
      })

      if (contactResult.status === 'ok') {
        contactsByEmail.set(subscription.customerEmail.toLowerCase(), {
          email: subscription.customerEmail,
          customer_account_id: customerAccountId,
          is_provisional: false,
        })
        updatedContacts += 1
      } else if (contactResult.status === 'conflict') {
        console.warn(`[stripe-sync] contact conflict for ${subscription.customerEmail}:`, contactResult.reason)
        identityConflicts += 1
        hasIdentityConflict = true
      } else {
        console.error(`[stripe-sync] contact write error for ${subscription.customerEmail}:`, contactResult.error)
      }
    }

    // §do.md §4: If identity or contact conflict occurred, DO NOT project billing facts, signals, or feature jobs
    if (hasIdentityConflict) {
      continue
    }

    // Update existing account billing facts
    if (existingAccount) {
      const { error: updateError } = await supabase
        .from('customer_accounts')
        .update(accountPayload)
        .eq('id', customerAccountId)

      if (updateError) throw updateError
    }

    // §10.2: Subscription ID as secondary identity
    try {
      await upsertProviderIdentity(supabase, {
        workspaceId,
        customerAccountId,
        provider: 'stripe',
        identityType: 'subscription_id',
        externalId: subscription.subscriptionId,
        isPrimary: false,
        verificationStatus: 'verified',
        source: 'stripe_sync',
      })
    } catch (e) {
      console.warn('[stripe-sync] identity write warning:', e instanceof Error ? e.message : e)
    }

    // Billing attention: write timeline and account_signals for changed status
    const needsBillingAttention = accountStatus === 'past_due' || accountStatus === 'cancelled'
    const statusChanged = existingAccount?.account_status !== accountStatus

    if (customerAccountId && needsBillingAttention && statusChanged) {
      const headline = accountStatus === 'cancelled' ? 'Subscription cancelled' : 'Billing issue detected'
      const detail =
        accountStatus === 'cancelled'
          ? `${accountName} no longer has an active Stripe subscription.`
          : `${accountName} is now ${accountStatus.replace('_', ' ')} in Stripe.`

      // Dedup signal: only insert if no signal for this account+type+status exists today
      const { data: existingSignal } = await supabase
        .from('account_signals')
        .select('id')
        .eq('workspace_id', workspaceId)
        .eq('customer_account_id', customerAccountId)
        .eq('signal_type', 'billing')
        .eq('headline', headline)
        .maybeSingle()

      if (!existingSignal) {
        const { error: signalError } = await supabase.from('account_signals').insert({
          workspace_id: workspaceId,
          customer_account_id: customerAccountId,
          signal_type: 'billing',
          headline,
          detail,
          next_step: buildNextAction(accountStatus),
          evidence: [
            `Stripe subscription status: ${subscription.status}`,
            `Plan: ${subscription.planName ?? 'Unknown plan'}`,
            ...(preCancelMrr ? [`MRR at cancellation: $${(preCancelMrr / 100).toFixed(0)}`] : []),
          ],
          risk_level: 'medium',
        })

        if (signalError) throw signalError
      }

      // Deduplicated timeline entry
      const { data: existingTimeline } = await supabase
        .from('account_timeline')
        .select('id')
        .eq('workspace_id', workspaceId)
        .eq('customer_account_id', customerAccountId)
        .eq('event_type', 'billing')
        .contains('metadata', {
          stripe_subscription_id: subscription.subscriptionId,
          subscription_status: subscription.status,
        })
        .maybeSingle()

      if (!existingTimeline) {
        const { error: timelineError } = await supabase.from('account_timeline').insert({
          workspace_id: workspaceId,
          customer_account_id: customerAccountId,
          event_type: 'billing',
          headline,
          detail,
          source: 'stripe',
          metadata: {
            stripe_customer_id: subscription.stripeCustomerId,
            stripe_subscription_id: subscription.subscriptionId,
            subscription_status: subscription.status,
            pre_cancel_mrr_cents: preCancelMrr,
          },
        })

        if (timelineError) throw timelineError
      }
    }

    // §14.1: Enqueue project_account_features job so the decision engine owns scoring
    if (customerAccountId) {
      const triggerEventType = isNowCancelled
        ? 'customer.subscription.deleted'
        : accountStatus === 'past_due'
        ? 'invoice.payment_failed'
        : 'stripe_sync'

      const isCriticalEvent = isNowCancelled || accountStatus === 'past_due'
      const jobIdempotencyKey = `ws:${workspaceId}:account:${customerAccountId}:stripe_sync:${subscription.subscriptionId}:${accountStatus}:${syncRunStart}`

      const { error: jobError } = await supabase.from('workflow_jobs').upsert(
        {
          workspace_id: workspaceId,
          job_type: 'project_account_features',
          idempotency_key: jobIdempotencyKey,
          status: 'pending',
          priority: isCriticalEvent ? 10 : 100,
          payload: {
            workspaceId,
            customerAccountId,
            patch: {
              billingAvailable: true,
              billingStatus: accountStatus,
              stripeCustomerId: subscription.stripeCustomerId,
              stripeSubscriptionId: subscription.subscriptionId,
              currentMrrCents: isNowCancelled ? 0 : subscription.mrrCents,
              ...(preCancelMrr !== null ? { preCancelMrrCents: preCancelMrr } : {}),
              cancelAtPeriodEnd: null,
              billingFreshAt: syncRunStart,
              ...(subscription.status === 'trialing' ? { billingStatus: 'trial' } : {}),
            },
            triggerProvider: 'stripe',
            triggerEventType,
            evidence: [
              `Stripe subscription status: ${subscription.status}`,
              `MRR: $${(subscription.mrrCents / 100).toFixed(0)}`,
              `Plan: ${subscription.planName ?? 'Unknown plan'}`,
              `Renewal: ${renewalAt}`,
              ...(preCancelMrr !== null ? [`Pre-cancel MRR: $${(preCancelMrr / 100).toFixed(0)}`] : []),
            ],
            occurredAt: syncRunStart,
            mrrBaselineCents: preCancelMrr ?? subscription.mrrCents,
          },
          next_attempt_at: new Date().toISOString(),
        },
        { onConflict: 'idempotency_key', ignoreDuplicates: true }
      )

      if (jobError) {
        console.warn('[stripe-sync] job upsert warning:', jobError.message)
      }

      if (isCriticalEvent) highRiskAccounts += 1
    }

    syncedAccounts += 1
  }

  const syncedAt = new Date().toISOString()

  const { error: connectionError } = await supabase.from('integration_connections').upsert(
    {
      workspace_id: workspaceId,
      provider: 'stripe',
      status: 'connected',
      last_synced_at: syncedAt,
      metadata: await mergeIntegrationConnectionMetadata(supabase, workspaceId, 'stripe', {
        coverage:
          syncedAccounts > 0
            ? `${syncedAccounts} Stripe subscriptions synced`
            : 'Connected, but no subscriptions were found',
        synced_accounts: syncedAccounts,
        high_risk_accounts: highRiskAccounts,
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
    outputSummary: `Stripe sync completed: ${syncedAccounts} account(s), ${updatedContacts} contact(s), ${identityConflicts} conflict(s), ${highRiskAccounts} accounts with billing issues queued for scoring.`,
    metadata: {
      provider: 'stripe',
      syncedAccounts,
      updatedContacts,
      highRiskAccounts,
      identityConflicts,
      provisionalAccounts,
    },
  })

  if (options?.refreshBrief ?? true) await generateWorkspaceBrief(workspaceId)

  return {
    syncedAccounts,
    updatedContacts,
    highRiskAccounts,
    identityConflicts,
    provisionalAccounts,
  }
}
