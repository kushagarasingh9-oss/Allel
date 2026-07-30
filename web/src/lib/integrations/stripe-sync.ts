import { createServiceClient } from '@/lib/supabase/service'
import { logAgentRun } from '@/lib/agent/run-logger'
import { buildSignalsFromAccount, scoreAccount } from '@/lib/engine/score-engine'
import { syncSubscriptions } from './stripe'
import { generateWorkspaceBrief } from '@/lib/briefs/generate-workspace-brief'

type ExistingAccount = {
  id: string
  name: string
  risk_level: string
  risk_score: number
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

type ExistingDraft = {
  customer_account_id: string | null
}

export type StripeWorkspaceSyncResult = {
  syncedAccounts: number
  updatedContacts: number
  highRiskAccounts: number
}

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

function buildNextAction(accountStatus: string, riskLevel: 'high' | 'medium' | 'low') {
  if (accountStatus === 'past_due') {
    return 'Review billing recovery outreach and approve a payment nudge.'
  }

  if (accountStatus === 'cancelled') {
    return 'Review the save motion and decide whether to reach out manually.'
  }

  if (riskLevel === 'high') {
    return 'Review the account and send a founder check-in.'
  }

  if (riskLevel === 'medium') {
    return 'Keep an eye on recent usage and follow-up timing.'
  }

  return 'No action needed right now.'
}

export async function syncStripeWorkspace(
  workspaceId: string
): Promise<StripeWorkspaceSyncResult> {
  const supabase = createServiceClient()
  const subscriptions = await syncSubscriptions(workspaceId)

  const [{ data: existingAccounts, error: accountsError }, { data: existingContacts, error: contactsError }] =
    await Promise.all([
      supabase
        .from('customer_accounts')
        .select(
          'id, name, risk_level, risk_score, usage_delta_percent, open_issue, last_touch_at, renewal_at, account_status, mrr_cents'
        )
        .eq('workspace_id', workspaceId),
      supabase
        .from('account_contacts')
        .select('email, customer_account_id')
        .eq('workspace_id', workspaceId),
    ])

  if (accountsError) throw accountsError
  if (contactsError) throw contactsError

  const accountsById = new Map(
    ((existingAccounts as ExistingAccount[] | null) ?? []).map((account) => [account.id, account])
  )
  const accountsByName = new Map(
    ((existingAccounts as ExistingAccount[] | null) ?? []).map((account) => [account.name, account])
  )
  const contactsByEmail = new Map(
    ((existingContacts as ExistingContact[] | null) ?? []).map((contact) => [
      contact.email.toLowerCase(),
      contact,
    ])
  )
  const { data: existingDrafts, error: draftsError } = await supabase
    .from('follow_up_drafts')
    .select('customer_account_id')
    .eq('workspace_id', workspaceId)
    .neq('status', 'sent')

  if (draftsError) throw draftsError

  const accountIdsWithPendingDrafts = new Set(
    ((existingDrafts as ExistingDraft[] | null) ?? [])
      .map((draft) => draft.customer_account_id)
      .filter((value): value is string => typeof value === 'string')
  )

  // Clear stale billing signals before re-creating (idempotent re-sync)
  const { error: clearSignalsError } = await supabase
    .from('account_signals')
    .delete()
    .eq('workspace_id', workspaceId)
    .eq('signal_type', 'billing')

  if (clearSignalsError) throw clearSignalsError

  let syncedAccounts = 0
  let updatedContacts = 0
  let highRiskAccounts = 0

  for (const subscription of subscriptions) {
    const accountName =
      subscription.customerName?.trim() ||
      subscription.customerEmail?.trim() ||
      `Stripe ${subscription.stripeCustomerId.slice(-8)}`

    const existingContact = subscription.customerEmail
      ? contactsByEmail.get(subscription.customerEmail.toLowerCase())
      : undefined
    const existingAccount =
      (existingContact ? accountsById.get(existingContact.customer_account_id) : null) ??
      accountsByName.get(accountName) ??
      null

    const accountStatus = normalizeAccountStatus(subscription.status)
    const renewalAt = subscription.currentPeriodEnd.toISOString()
    const usageDeltaPercent = existingAccount?.usage_delta_percent ?? 0
    const openIssue = existingAccount?.open_issue ?? null
    const lastTouchAt = existingAccount?.last_touch_at ?? null

    const failedPaymentCount = accountStatus === 'past_due' ? 2
      : subscription.status === 'unpaid' ? 3
      : subscription.status === 'incomplete' || subscription.status === 'incomplete_expired' ? 1
      : 0

    const score = scoreAccount(
      buildSignalsFromAccount({
        mrr_cents: subscription.mrrCents,
        usage_delta_percent: usageDeltaPercent,
        risk_level: existingAccount?.risk_level ?? 'low',
        open_issue: openIssue,
        last_touch_at: lastTouchAt,
        renewal_at: renewalAt,
        account_status: accountStatus,
      }, {
        failed_payment_count: failedPaymentCount,
      })
    )

    if (score.riskLevel === 'high') {
      highRiskAccounts += 1
    }

    const accountPayload = {
      workspace_id: workspaceId,
      name: accountName,
      segment: 'Stripe customer',
      plan_name: subscription.planName,
      account_status: accountStatus,
      mrr_cents: subscription.mrrCents,
      risk_level: score.riskLevel,
      risk_score: score.score,
      usage_delta_percent: usageDeltaPercent,
      open_issue: openIssue,
      next_action: buildNextAction(accountStatus, score.riskLevel),
      summary: score.summary,
      last_touch_at: lastTouchAt,
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

      const insertedAccountId = insertedAccount.id
      customerAccountId = insertedAccountId

      const insertedRecord: ExistingAccount = {
        id: insertedAccountId,
        name: accountName,
        risk_level: score.riskLevel,
        risk_score: score.score,
        usage_delta_percent: usageDeltaPercent,
        open_issue: openIssue,
        last_touch_at: lastTouchAt,
        renewal_at: renewalAt,
        account_status: accountStatus,
        mrr_cents: subscription.mrrCents,
      }
      accountsById.set(insertedAccountId, insertedRecord)
      accountsByName.set(accountName, insertedRecord)
    }

    syncedAccounts += 1

    const needsBillingAttention = accountStatus === 'past_due' || accountStatus === 'cancelled'
    const statusChanged = existingAccount?.account_status !== accountStatus

    if (customerAccountId && needsBillingAttention && statusChanged) {
      const headline =
        accountStatus === 'cancelled' ? 'Subscription cancelled' : 'Billing issue detected'
      const detail =
        accountStatus === 'cancelled'
          ? `${accountName} no longer has an active Stripe subscription.`
          : `${accountName} is now ${accountStatus.replace('_', ' ')} in Stripe.`

      const { error: signalError } = await supabase.from('account_signals').insert({
        workspace_id: workspaceId,
        customer_account_id: customerAccountId,
        signal_type: 'billing',
        headline,
        detail,
        next_step: buildNextAction(accountStatus, score.riskLevel),
        evidence: [
          `Stripe subscription status: ${subscription.status}`,
          `Plan: ${subscription.planName ?? 'Unknown plan'}`,
        ],
        risk_level: score.riskLevel,
      })

      if (signalError) throw signalError

      // Deduplicate timeline entries by stripe_subscription_id + status
      const { data: existingTimelineEvent, error: existingTimelineError } = await supabase
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

      if (existingTimelineError) throw existingTimelineError

      if (!existingTimelineEvent) {
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
          },
        })

        if (timelineError) throw timelineError
      }
    }

    if (customerAccountId && needsBillingAttention && !accountIdsWithPendingDrafts.has(customerAccountId)) {
      const { error: draftError } = await supabase.from('follow_up_drafts').insert({
        workspace_id: workspaceId,
        customer_account_id: customerAccountId,
        draft_type: accountStatus === 'cancelled' ? 'save_reachout' : 'billing_recovery',
        subject:
          accountStatus === 'cancelled'
            ? `I saw ${accountName} was cancelled`
            : `I saw the latest ${accountName} payment fail`,
        body_preview:
          accountStatus === 'cancelled'
            ? `Hi there,\n\nI saw the subscription for ${accountName} was cancelled and wanted to reach out directly.\n\nIf this happened because of a billing problem or something in the product, reply here and I will help sort it out personally.\n\nIf it makes sense to take another look, I am happy to jump on a quick call this week.`
            : `Hi there,\n\nI saw the latest payment for ${accountName} fail and wanted to reach out before this turns into an access problem.\n\nIf this was accidental, I can help get billing back in a good state. If something else is going on, just reply here and I will handle it personally.\n\nWould it help if I took a look with you today?`,
        status: 'needs_review',
        due_label: 'Review today',
      })

      if (draftError) throw draftError
      accountIdsWithPendingDrafts.add(customerAccountId)
    }

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
      metadata: {
        coverage:
          syncedAccounts > 0
            ? `${syncedAccounts} Stripe subscriptions synced`
            : 'Connected, but no subscriptions were found',
        synced_accounts: syncedAccounts,
        high_risk_accounts: highRiskAccounts,
      },
    },
    { onConflict: 'workspace_id,provider' }
  )

  if (connectionError) throw connectionError

  await logAgentRun({
    workspaceId,
    runType: 'integration_synced',
    status: 'completed',
    outputSummary: `Stripe sync completed: ${syncedAccounts} account(s), ${updatedContacts} contact(s), ${highRiskAccounts} high-risk account(s).`,
    metadata: {
      provider: 'stripe',
      syncedAccounts,
      updatedContacts,
      highRiskAccounts,
    },
  })

  await generateWorkspaceBrief(workspaceId)

  return {
    syncedAccounts,
    updatedContacts,
    highRiskAccounts,
  }
}
