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
import { upsertProviderIdentity } from '@/recovery/identity'

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
}

type ExistingContact = {
  email: string
  customer_account_id: string
}

export type StripeWorkspaceSyncResult = {
  syncedAccounts: number
  updatedContacts: number
  highRiskAccounts: number
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
        .select('id, name, usage_delta_percent, open_issue, last_touch_at, renewal_at, account_status, mrr_cents')
        .eq('workspace_id', workspaceId),
      supabase
        .from('account_contacts')
        .select('email, customer_account_id')
        .eq('workspace_id', workspaceId),
    ])

  if (accountsError) throw accountsError
  if (contactsError) throw contactsError

  const accountsById = new Map(
    ((existingAccounts as ExistingAccount[] | null) ?? []).map((a) => [a.id, a])
  )
  const accountsByName = new Map(
    ((existingAccounts as ExistingAccount[] | null) ?? []).map((a) => [a.name, a])
  )
  const contactsByEmail = new Map(
    ((existingContacts as ExistingContact[] | null) ?? []).map((c) => [c.email.toLowerCase(), c])
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

  for (const subscription of subscriptions) {
    const accountName =
      subscription.customerName?.trim() ||
      subscription.customerEmail?.trim() ||
      `Stripe ${subscription.stripeCustomerId.slice(-8)}`

    const accountStatus = normalizeAccountStatus(subscription.status)
    const renewalAt = subscription.currentPeriodEnd.toISOString()

    // §10.2: Resolution order — Stripe customer ID first, email fallback
    const byStripeId = stripeIdToAccountId.get(subscription.stripeCustomerId)
    const existingContact = subscription.customerEmail
      ? contactsByEmail.get(subscription.customerEmail.toLowerCase())
      : undefined
    const existingAccount =
      (byStripeId ? accountsById.get(byStripeId) : undefined) ??
      (existingContact ? accountsById.get(existingContact.customer_account_id) : undefined) ??
      accountsByName.get(accountName) ??
      null

    // §13.5: Capture pre-cancel MRR before setting current to 0
    const isNowCancelled = accountStatus === 'cancelled'
    const wasActive = existingAccount && existingAccount.account_status !== 'cancelled'
    const preCancelMrr = isNowCancelled && wasActive
      ? (existingAccount?.mrr_cents ?? subscription.mrrCents)
      : null

    // §14.1: No risk_score or risk_level computed here.
    // Billing facts only — decision engine owns scoring.
    const accountPayload = {
      workspace_id: workspaceId,
      name: accountName,
      segment: 'Stripe customer',
      plan_name: subscription.planName,
      account_status: accountStatus,
      mrr_cents: isNowCancelled ? 0 : subscription.mrrCents,
      // Preserve existing risk fields — do not overwrite them here
      usage_delta_percent: existingAccount?.usage_delta_percent ?? 0,
      open_issue: existingAccount?.open_issue ?? null,
      next_action: buildNextAction(accountStatus),
      last_touch_at: existingAccount?.last_touch_at ?? null,
      renewal_at: renewalAt,
    }

    let customerAccountId = existingAccount?.id ?? null

    if (customerAccountId) {
      const { error: updateError } = await supabase
        .from('customer_accounts')
        .update(accountPayload)
        .eq('id', customerAccountId)

      if (updateError) throw updateError
    } else {
      const { data: insertedAccount, error: insertError } = await supabase
        .from('customer_accounts')
        .insert(accountPayload)
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
      }
      accountsById.set(insertedId, record)
      accountsByName.set(accountName, record)
    }

    // §10.2: Write Stripe customer_id to provider_identities
    if (customerAccountId) {
      try {
        await upsertProviderIdentity(supabase, {
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
        stripeIdToAccountId.set(subscription.stripeCustomerId, customerAccountId)
      } catch {
        // Non-fatal — upsert handles conflicts
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
      } catch { /* non-fatal */ }
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

      // Use 'medium' as a conservative default — decision engine will compute the real label
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
        risk_level: 'medium', // conservative placeholder — decision engine scores this
      })

      if (signalError) throw signalError

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
              cancelAtPeriodEnd: null, // reconciliation will set this from live subscription
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

    // Upsert account_contacts for human display (email is the bridge to PostHog identity)
    if (subscription.customerEmail && customerAccountId) {
      const { error: contactUpsertError } = await supabase.from('account_contacts').upsert(
        {
          workspace_id: workspaceId,
          customer_account_id: customerAccountId,
          email: subscription.customerEmail,
          name: subscription.customerName,
          role: 'billing',
          is_primary: true,
          external_ids: {
            stripe_customer_id: subscription.stripeCustomerId,
            stripe_subscription_id: subscription.subscriptionId,
          },
        },
        { onConflict: 'workspace_id,email' }
      )

      if (contactUpsertError) throw contactUpsertError

      contactsByEmail.set(subscription.customerEmail.toLowerCase(), {
        email: subscription.customerEmail,
        customer_account_id: customerAccountId,
      })
      updatedContacts += 1
    }
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
      }),
    },
    { onConflict: 'workspace_id,provider' }
  )

  if (connectionError) throw connectionError

  await logAgentRun({
    workspaceId,
    runType: 'integration_synced',
    status: 'completed',
    outputSummary: `Stripe sync completed: ${syncedAccounts} account(s), ${updatedContacts} contact(s), ${highRiskAccounts} accounts with billing issues queued for scoring.`,
    metadata: {
      provider: 'stripe',
      syncedAccounts,
      updatedContacts,
      highRiskAccounts,
    },
  })

  if (options?.refreshBrief ?? true) await generateWorkspaceBrief(workspaceId)

  return {
    syncedAccounts,
    updatedContacts,
    highRiskAccounts,
  }
}
