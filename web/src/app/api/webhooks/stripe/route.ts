/**
 * Stripe Webhook Handler
 *
 * POST /api/webhooks/stripe
 *
 * Handles:
 * - invoice.payment_failed
 * - customer.subscription.updated
 * - customer.subscription.deleted
 * - invoice.paid
 */

import { randomUUID } from 'crypto'
import { after, NextRequest, NextResponse } from 'next/server'
import {
  enqueueAccountMemoryRefresh,
  processQueuedAccountMemoryRefreshes,
} from '@/lib/agent/account-memory'
import {
  buildStripeWebhookJobs,
  logWorkflowStage,
  runWorkflowAgentJobs,
} from '@/lib/agent/workflows'
import { generateWorkspaceBrief } from '@/lib/briefs/generate-workspace-brief'
import { createServiceClient } from '@/lib/supabase/service'
import { verifyWebhookSignature } from '@/lib/integrations/stripe'
import { notifyFounder } from '@/lib/notifications/notify-founder'
import type Stripe from 'stripe'

function assertNoDbError(
  context: string,
  error: { message: string } | null
): asserts error is null {
  if (error) {
    throw new Error(`[stripe-webhook] ${context}: ${error.message}`)
  }
}

async function refreshWebhookAccountMemory(
  workspaceId: string | null,
  accountId: string | null
) {
  if (!workspaceId || !accountId) return

  await enqueueAccountMemoryRefresh(workspaceId, accountId)
  await processQueuedAccountMemoryRefreshes({
    workspaceId,
    limit: 1,
    concurrency: 1,
  })
}

/**
 * Fire-and-forget agent trigger for webhook events.
 */
async function runAgentForWebhook(
  workspaceId: string,
  workflowId: string,
  eventType: string,
  email: string | null,
  accountId: string | null,
  webhookEventId: string | null
) {
  await runWorkflowAgentJobs({
    workspaceId,
    workflowId,
    runType: 'stripe_webhook',
    defaultPersonaId: 'sarah',
    customerAccountId: accountId,
    jobs: buildStripeWebhookJobs(eventType, email),
    sharedMetadata: {
      eventType,
      email,
      webhookEventId,
    },
  })
}

function scheduleStripeWebhookFollowUp(input: {
  workspaceId: string
  workflowId: string
  eventType: string
  email: string | null
  accountId: string | null
  webhookEventId: string | null
  eventId: string
}) {
  after(async () => {
    try {
      await runAgentForWebhook(
        input.workspaceId,
        input.workflowId,
        input.eventType,
        input.email,
        input.accountId,
        input.webhookEventId
      )

      const followUpBriefStartedAt = Date.now()
      const followUpBrief = await generateWorkspaceBrief(input.workspaceId)

      await logWorkflowStage({
        workspaceId: input.workspaceId,
        workflowId: input.workflowId,
        runType: 'stripe_webhook',
        stage: 'brief_refresh',
        customerAccountId: input.accountId,
        inputSummary: 'Refresh founder brief after Stripe webhook follow-up',
        outputSummary: `Generated founder brief with ${followUpBrief.itemCount} items`,
        durationMs: Date.now() - followUpBriefStartedAt,
        metadata: {
          phase: 'after_follow_up',
          briefId: followUpBrief.briefId,
          headline: followUpBrief.headline,
          itemCount: followUpBrief.itemCount,
        },
      })
    } catch (err) {
      console.error('[stripe-webhook] Agent trigger failed:', err)
      await logWorkflowStage({
        workspaceId: input.workspaceId,
        workflowId: input.workflowId,
        runType: 'stripe_webhook',
        stage: 'workflow_failed',
        status: 'failed',
        customerAccountId: input.accountId,
        outputSummary: `Stripe webhook follow-up failed for ${input.eventType}`,
        error: err instanceof Error ? err.message : 'Unknown follow-up error',
        metadata: {
          eventId: input.eventId,
          eventType: input.eventType,
          webhookEventId: input.webhookEventId,
        },
      })

      try {
        const fallbackBriefStartedAt = Date.now()
        const fallbackBrief = await generateWorkspaceBrief(input.workspaceId)

        await logWorkflowStage({
          workspaceId: input.workspaceId,
          workflowId: input.workflowId,
          runType: 'stripe_webhook',
          stage: 'brief_refresh',
          customerAccountId: input.accountId,
          inputSummary: 'Refresh founder brief after Stripe webhook failure fallback',
          outputSummary: `Generated founder brief with ${fallbackBrief.itemCount} items`,
          durationMs: Date.now() - fallbackBriefStartedAt,
          metadata: {
            phase: 'failure_fallback',
            briefId: fallbackBrief.briefId,
            headline: fallbackBrief.headline,
            itemCount: fallbackBrief.itemCount,
          },
        })
      } catch (briefErr) {
        console.error('[stripe-webhook] Brief refresh failed:', briefErr)
      }
    }
  })
}

export async function POST(request: NextRequest) {
  const body = await request.text()
  const signature = request.headers.get('stripe-signature')

  if (!signature) {
    return NextResponse.json({ error: 'Missing stripe-signature header' }, { status: 400 })
  }

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET
  if (!webhookSecret) {
    return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 })
  }

  let event: Stripe.Event
  try {
    event = verifyWebhookSignature(body, signature, webhookSecret)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Invalid signature'
    return NextResponse.json({ error: message }, { status: 400 })
  }

  const supabase = createServiceClient()
  let webhookEventId: string | null = null
  const workflowId = randomUUID()

  // Log raw webhook event
  // Find workspace by matching Stripe customer to account_contacts
  let workspaceId: string | null = null
  try {
    workspaceId = await resolveWorkspaceFromEvent(supabase, event)
  } catch (resolveErr) {
    // Don't let resolution failures crash the webhook — log and continue
    console.error('[stripe-webhook] Failed to resolve workspace:', resolveErr)
  }

  if (workspaceId) {
    // Idempotency: skip if this Stripe event was already processed
    const { data: existingEvent, error: existingError } = await supabase
      .from('webhook_events')
      .select('id, processed')
      .eq('provider', 'stripe')
      .eq('external_id', event.id)
      .maybeSingle()
    assertNoDbError('check existing webhook event', existingError)

    if (existingEvent?.processed) {
      return NextResponse.json({ received: true, deduplicated: true })
    }

    if (existingEvent) {
      webhookEventId = existingEvent.id
    } else {
      const { data: loggedEvent, error: logError } = await supabase
        .from('webhook_events')
        .insert({
          workspace_id: workspaceId,
          provider: 'stripe',
          event_type: event.type,
          external_id: event.id,
          payload: event.data.object as unknown as Record<string, unknown>,
          processed: false,
        })
        .select('id')
        .single()
      assertNoDbError('insert webhook event', logError)
      webhookEventId = loggedEvent.id
    }
  }

  try {
    let affectedAccountId: string | null = null

    switch (event.type) {
      case 'invoice.payment_failed':
        affectedAccountId = await handlePaymentFailed(supabase, event, workspaceId)
        break
      case 'customer.subscription.updated':
        affectedAccountId = await handleSubscriptionUpdated(supabase, event, workspaceId)
        break
      case 'customer.subscription.deleted':
        affectedAccountId = await handleSubscriptionDeleted(supabase, event, workspaceId)
        break
      case 'invoice.paid':
        affectedAccountId = await handleInvoicePaid(supabase, event, workspaceId)
        break
      default:
        // Log but don't process
        break
    }

    if (webhookEventId && workspaceId) {
      await logWorkflowStage({
        workspaceId,
        workflowId,
        runType: 'stripe_webhook',
        stage: 'webhook_ingest',
        customerAccountId: affectedAccountId,
        inputSummary: `Process Stripe event ${event.type}`,
        outputSummary: `Normalized Stripe webhook event ${event.type}`,
        metadata: {
          eventId: event.id,
          eventType: event.type,
          webhookEventId,
        },
      })

      const briefStartedAt = Date.now()
      const initialBrief = await generateWorkspaceBrief(workspaceId)
      await logWorkflowStage({
        workspaceId,
        workflowId,
        runType: 'stripe_webhook',
        stage: 'brief_refresh',
        customerAccountId: affectedAccountId,
        inputSummary: 'Refresh founder brief after Stripe webhook ingestion',
        outputSummary: `Generated founder brief with ${initialBrief.itemCount} items`,
        durationMs: Date.now() - briefStartedAt,
        metadata: {
          phase: 'before_follow_up',
          briefId: initialBrief.briefId,
          headline: initialBrief.headline,
          itemCount: initialBrief.itemCount,
        },
      })

      // Trigger the agent to analyze this event, then rebuild the brief from the
      // resulting live state so there is a single owner for founder_briefs.
      const eventObj = event.data.object as unknown as Record<string, unknown>
      const customerEmail = typeof eventObj.customer_email === 'string'
        ? eventObj.customer_email
        : typeof eventObj.receipt_email === 'string'
          ? eventObj.receipt_email
          : null

      scheduleStripeWebhookFollowUp({
        workspaceId,
        workflowId,
        eventType: event.type,
        email: customerEmail,
        accountId: affectedAccountId,
        webhookEventId,
        eventId: event.id,
      })

      const { error: processedError } = await supabase
        .from('webhook_events')
        .update({ processed: true, processed_at: new Date().toISOString() })
        .eq('id', webhookEventId)
      assertNoDbError('mark webhook event processed', processedError)

      // --- Real-time founder notification ---
      if (affectedAccountId) {
        const { data: account } = await supabase
          .from('customer_accounts')
          .select('name, mrr_cents')
          .eq('id', affectedAccountId)
          .single()

        const accountName = account?.name ?? undefined
        const mrrCents = account?.mrr_cents ?? undefined

        switch (event.type) {
          case 'invoice.payment_failed': {
            const invoice = event.data.object as Stripe.Invoice
            const amount = ((invoice.amount_due ?? 0) / 100).toFixed(2)
            notifyFounder({
              workspaceId,
              severity: 'critical',
              headline: 'Payment failed',
              detail: `Invoice payment of $${amount} failed. The account has been marked as past due. A recovery draft will be generated shortly.`,
              accountName,
              mrrCents,
              source: 'stripe_webhook',
              dashboardPath: `/dashboard/accounts/${affectedAccountId}`,
            })
            break
          }
          case 'customer.subscription.deleted':
            notifyFounder({
              workspaceId,
              severity: 'critical',
              headline: 'Subscription cancelled',
              detail: 'Customer subscription has been cancelled. Immediate save email recommended.',
              accountName,
              mrrCents,
              source: 'stripe_webhook',
              dashboardPath: `/dashboard/accounts/${affectedAccountId}`,
            })
            break
          case 'invoice.paid': {
            const paidInvoice = event.data.object as Stripe.Invoice
            const paidAmount = ((paidInvoice.amount_paid ?? 0) / 100).toFixed(2)
            notifyFounder({
              workspaceId,
              severity: 'info',
              headline: 'Payment received',
              detail: `Invoice paid: $${paidAmount}. Account billing status restored to active.`,
              accountName,
              mrrCents,
              source: 'stripe_webhook',
              dashboardPath: `/dashboard/accounts/${affectedAccountId}`,
            })
            break
          }
        }
      }
    }
  } catch (err) {
    // Log error but return 200 to prevent Stripe retries on our errors
    if (webhookEventId) {
      const { error: updateError } = await supabase
        .from('webhook_events')
        .update({ error: err instanceof Error ? err.message : 'Unknown error' })
        .eq('id', webhookEventId)
      if (updateError) {
        console.error('[stripe-webhook] Failed to update webhook error log', updateError)
      }
    }
  }

  return NextResponse.json({ received: true })
}

// ----- Helpers -----

async function resolveWorkspaceFromEvent(
  supabase: ReturnType<typeof createServiceClient>,
  event: Stripe.Event
): Promise<string | null> {
  // Try to get customer email from event
  const obj = event.data.object as unknown as Record<string, unknown>
  let email: string | null = null

  if (typeof obj.customer_email === 'string') {
    email = obj.customer_email
  } else if (typeof obj.receipt_email === 'string') {
    email = obj.receipt_email
  }

  if (!email) return null

  const { data, error } = await supabase
    .from('account_contacts')
    .select('workspace_id')
    .eq('email', email)
    .limit(1)
    .maybeSingle()
  assertNoDbError('resolve workspace from event', error)

  return data?.workspace_id ?? null
}

async function handlePaymentFailed(
  supabase: ReturnType<typeof createServiceClient>,
  event: Stripe.Event,
  workspaceId: string | null
): Promise<string | null> {
  if (!workspaceId) return null

  const invoice = event.data.object as Stripe.Invoice
  const customerEmail = invoice.customer_email

  if (!customerEmail) return null

  // Find the account
  const { data: contact, error: contactError } = await supabase
    .from('account_contacts')
    .select('customer_account_id')
    .eq('workspace_id', workspaceId)
    .eq('email', customerEmail)
    .maybeSingle()
  assertNoDbError('lookup account contact for payment failure', contactError)

  const accountId = contact?.customer_account_id

  if (accountId) {
    // Update account status
    const { error: accountError } = await supabase
      .from('customer_accounts')
      .update({ account_status: 'past_due' })
      .eq('id', accountId)
    assertNoDbError('set account status to past_due', accountError)

    // Create signal
    const { error: signalError } = await supabase.from('account_signals').insert({
      workspace_id: workspaceId,
      customer_account_id: accountId,
      signal_type: 'billing',
      headline: 'Payment failed',
      detail: `Invoice ${invoice.number ?? invoice.id} payment failed. Amount: $${((invoice.amount_due ?? 0) / 100).toFixed(2)}.`,
      next_step: 'Review the billing recovery draft and approve if appropriate.',
      evidence: ['Payment retry failed'],
      risk_level: 'high',
    })
    assertNoDbError('insert payment failed signal', signalError)

    // Add to timeline
    const { error: timelineError } = await supabase.from('account_timeline').insert({
      workspace_id: workspaceId,
      customer_account_id: accountId,
      event_type: 'billing',
      headline: 'Payment failed',
      detail: `Invoice ${invoice.number ?? invoice.id} failed. Amount due: $${((invoice.amount_due ?? 0) / 100).toFixed(2)}`,
      source: 'stripe',
      metadata: { invoice_id: invoice.id, amount_cents: invoice.amount_due },
    })
    assertNoDbError('insert payment failed timeline event', timelineError)

    await refreshWebhookAccountMemory(workspaceId, accountId)
  }

  return accountId ?? null
}

async function handleSubscriptionUpdated(
  supabase: ReturnType<typeof createServiceClient>,
  event: Stripe.Event,
  workspaceId: string | null
): Promise<string | null> {
  if (!workspaceId) return null

  const subscription = event.data.object as unknown as Stripe.Subscription & { items: { data: Array<Stripe.SubscriptionItem> } }
  const customer = subscription.customer as string
  const item = subscription.items.data[0]
  const unitAmount = item?.price?.unit_amount ?? 0
  const interval = item?.price?.recurring?.interval ?? 'month'

  const mrrCents =
    interval === 'year' ? Math.round(unitAmount / 12) :
    interval === 'week' ? unitAmount * 4 :
    unitAmount

  // Get renewal date from the first subscription item (Stripe v22+ moved current_period_end to SubscriptionItem)
  const currentPeriodEnd = (item as unknown as { current_period_end?: number })?.current_period_end

  // Find account by stripe customer ID
  const { data: contact, error: contactError } = await supabase
    .from('account_contacts')
    .select('customer_account_id')
    .eq('workspace_id', workspaceId)
    .contains('external_ids', { stripe_customer_id: customer })
    .maybeSingle()
  assertNoDbError('lookup account contact for subscription update', contactError)

  if (contact?.customer_account_id) {
    const updateData: Record<string, unknown> = {
      mrr_cents: mrrCents,
      account_status: subscription.status === 'active' ? 'active' : 'past_due',
    }
    if (currentPeriodEnd) {
      updateData.renewal_at = new Date(currentPeriodEnd * 1000).toISOString()
    }

    const { error: accountError } = await supabase
      .from('customer_accounts')
      .update(updateData)
      .eq('id', contact.customer_account_id)
    assertNoDbError('update account after subscription change', accountError)

    await refreshWebhookAccountMemory(workspaceId, contact.customer_account_id)
  }

  return contact?.customer_account_id ?? null
}

async function handleSubscriptionDeleted(
  supabase: ReturnType<typeof createServiceClient>,
  event: Stripe.Event,
  workspaceId: string | null
): Promise<string | null> {
  if (!workspaceId) return null

  const subscription = event.data.object as unknown as Stripe.Subscription
  const customer = subscription.customer as string

  const { data: contact, error: contactError } = await supabase
    .from('account_contacts')
    .select('customer_account_id')
    .eq('workspace_id', workspaceId)
    .contains('external_ids', { stripe_customer_id: customer })
    .maybeSingle()
  assertNoDbError('lookup account contact for subscription deletion', contactError)

  if (contact?.customer_account_id) {
    const { error: accountError } = await supabase
      .from('customer_accounts')
      .update({ account_status: 'cancelled', mrr_cents: 0 })
      .eq('id', contact.customer_account_id)
    assertNoDbError('mark account cancelled', accountError)

    const { error: signalError } = await supabase.from('account_signals').insert({
      workspace_id: workspaceId,
      customer_account_id: contact.customer_account_id,
      signal_type: 'billing',
      headline: 'Subscription cancelled',
      detail: 'Customer subscription has been cancelled.',
      next_step: 'Draft a save email immediately.',
      evidence: ['Subscription deleted in Stripe'],
      risk_level: 'high',
    })
    assertNoDbError('insert subscription cancelled signal', signalError)

    const { error: timelineError } = await supabase.from('account_timeline').insert({
      workspace_id: workspaceId,
      customer_account_id: contact.customer_account_id,
      event_type: 'billing',
      headline: 'Subscription cancelled',
      source: 'stripe',
      metadata: { subscription_id: subscription.id },
    })
    assertNoDbError('insert subscription cancelled timeline event', timelineError)

    await refreshWebhookAccountMemory(workspaceId, contact.customer_account_id)
  }

  return contact?.customer_account_id ?? null
}

async function handleInvoicePaid(
  supabase: ReturnType<typeof createServiceClient>,
  event: Stripe.Event,
  workspaceId: string | null
): Promise<string | null> {
  if (!workspaceId) return null

  const invoice = event.data.object as Stripe.Invoice
  const customerEmail = invoice.customer_email

  if (!customerEmail) return null

  const { data: contact, error: contactError } = await supabase
    .from('account_contacts')
    .select('customer_account_id')
    .eq('workspace_id', workspaceId)
    .eq('email', customerEmail)
    .maybeSingle()
  assertNoDbError('lookup account contact for invoice paid', contactError)

  if (contact?.customer_account_id) {
    // Reset billing status to active
    const { error: accountError } = await supabase
      .from('customer_accounts')
      .update({ account_status: 'active' })
      .eq('id', contact.customer_account_id)
      .eq('account_status', 'past_due')
    assertNoDbError('mark account active after payment', accountError)

    const { error: timelineError } = await supabase.from('account_timeline').insert({
      workspace_id: workspaceId,
      customer_account_id: contact.customer_account_id,
      event_type: 'billing',
      headline: 'Payment received',
      detail: `Invoice paid: $${((invoice.amount_paid ?? 0) / 100).toFixed(2)}`,
      source: 'stripe',
      metadata: { invoice_id: invoice.id, amount_cents: invoice.amount_paid },
    })
    assertNoDbError('insert payment received timeline event', timelineError)

    await refreshWebhookAccountMemory(workspaceId, contact.customer_account_id)
  }

  return contact?.customer_account_id ?? null
}
