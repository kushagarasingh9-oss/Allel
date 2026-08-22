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
import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { verifyWebhookSignature } from '@/lib/integrations/stripe'
import { buildCanonicalProviderEvent } from '@/lib/recovery/events'
import { enqueueWorkflowJob } from '@/lib/jobs/queue'
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

  // Resolve workspace by matching Stripe customer to account_contacts
  let workspaceId: string | null = null
  try {
    workspaceId = await resolveWorkspaceFromEvent(supabase, event)
  } catch (resolveErr) {
    console.error('[stripe-webhook] Failed to resolve workspace:', resolveErr)
  }

  const eventObj = event.data.object as unknown as Record<string, unknown>
  const customerId = typeof eventObj.customer === 'string' ? eventObj.customer : null
  const scenarioId = typeof eventObj.metadata === 'object' && eventObj.metadata !== null
    ? (eventObj.metadata as Record<string, string>).scenario_id ?? null
    : null

  // 1. Build canonical provider event
  const canonicalEvent = buildCanonicalProviderEvent({
    workspaceId,
    provider: 'stripe',
    providerEventId: event.id,
    eventType: event.type,
    occurredAt: new Date(event.created * 1000).toISOString(),
    primaryExternalIdentity: customerId,
    scenarioId,
    rawPayload: body,
    testMode: !event.livemode,
  })

  // 2. Check for duplicate event
  if (workspaceId) {
    const { data: existingEvent, error: existingError } = await supabase
      .from('webhook_events')
      .select('id, processed')
      .eq('workspace_id', workspaceId)
      .eq('provider', 'stripe')
      .eq('external_id', event.id)
      .maybeSingle()
    assertNoDbError('check existing webhook event', existingError)

    if (existingEvent?.processed) {
      return NextResponse.json({
        received: true,
        eventId: existingEvent.id,
        deduplicated: true,
      })
    }
  }

  // 3. Insert into webhook_events
  const { data: loggedEvent, error: logError } = await supabase
    .from('webhook_events')
    .insert({
      id: canonicalEvent.eventId,
      workspace_id: workspaceId,
      provider: 'stripe',
      event_type: event.type,
      external_id: event.id,
      dedupe_key: canonicalEvent.dedupeKey,
      payload_hash: canonicalEvent.payloadHash,
      occurred_at: canonicalEvent.occurredAt,
      payload: event.data.object as unknown as Record<string, unknown>,
      processed: false,
      test_mode: canonicalEvent.testMode,
      scenario_id: scenarioId,
    })
    .select('id')
    .single()
  assertNoDbError('insert webhook event', logError)

  const webhookEventId = loggedEvent.id

  // 4. Enqueue durable job: process_provider_event
  if (workspaceId) {
    const jobKey = `ws:${workspaceId}:event:${event.id}:process:v1`
    await enqueueWorkflowJob(supabase, {
      workspaceId,
      webhookEventId,
      jobType: 'process_provider_event',
      idempotencyKey: jobKey,
      payload: canonicalEvent,
    })
  }

  // 5. Update timeline / signals for fast dashboard view
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
    }

    if (affectedAccountId && workspaceId) {
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
  } catch (err) {
    console.error('[stripe-webhook] Synchronous projection warning:', err)
  }

  return NextResponse.json({
    received: true,
    eventId: webhookEventId,
    deduplicated: false,
  })
}

// ----- Helpers -----

async function resolveWorkspaceFromEvent(
  supabase: ReturnType<typeof createServiceClient>,
  event: Stripe.Event
): Promise<string | null> {
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
    .eq('email', email.toLowerCase())
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

  const { data: contact, error: contactError } = await supabase
    .from('account_contacts')
    .select('customer_account_id')
    .eq('workspace_id', workspaceId)
    .eq('email', customerEmail.toLowerCase())
    .maybeSingle()
  assertNoDbError('lookup account contact for payment failure', contactError)

  const accountId = contact?.customer_account_id
  if (accountId) {
    await supabase
      .from('customer_accounts')
      .update({ account_status: 'past_due' })
      .eq('id', accountId)

    await supabase.from('account_timeline').insert({
      workspace_id: workspaceId,
      customer_account_id: accountId,
      event_type: 'billing',
      headline: 'Payment failed',
      detail: `Invoice ${invoice.number ?? invoice.id} failed. Amount due: $${((invoice.amount_due ?? 0) / 100).toFixed(2)}`,
      source: 'stripe',
      metadata: { invoice_id: invoice.id, amount_cents: invoice.amount_due },
    })
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
  const item = subscription.items?.data?.[0]
  const unitAmount = item?.price?.unit_amount ?? 0
  const interval = item?.price?.recurring?.interval ?? 'month'

  const mrrCents =
    interval === 'year' ? Math.round(unitAmount / 12) :
    interval === 'week' ? unitAmount * 4 :
    unitAmount

  const { data: contact, error: contactError } = await supabase
    .from('account_contacts')
    .select('customer_account_id')
    .eq('workspace_id', workspaceId)
    .contains('external_ids', { stripe_customer_id: customer })
    .maybeSingle()
  assertNoDbError('lookup account contact for subscription update', contactError)

  if (contact?.customer_account_id) {
    await supabase
      .from('customer_accounts')
      .update({
        mrr_cents: mrrCents,
        account_status: subscription.status === 'active' ? 'active' : 'past_due',
      })
      .eq('id', contact.customer_account_id)
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
    await supabase
      .from('customer_accounts')
      .update({ account_status: 'cancelled', mrr_cents: 0 })
      .eq('id', contact.customer_account_id)

    await supabase.from('account_timeline').insert({
      workspace_id: workspaceId,
      customer_account_id: contact.customer_account_id,
      event_type: 'billing',
      headline: 'Subscription cancelled',
      source: 'stripe',
      metadata: { subscription_id: subscription.id },
    })
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
    .eq('email', customerEmail.toLowerCase())
    .maybeSingle()
  assertNoDbError('lookup account contact for invoice paid', contactError)

  if (contact?.customer_account_id) {
    await supabase
      .from('customer_accounts')
      .update({ account_status: 'active' })
      .eq('id', contact.customer_account_id)
      .eq('account_status', 'past_due')

    await supabase.from('account_timeline').insert({
      workspace_id: workspaceId,
      customer_account_id: contact.customer_account_id,
      event_type: 'billing',
      headline: 'Payment received',
      detail: `Invoice paid: $${((invoice.amount_paid ?? 0) / 100).toFixed(2)}`,
      source: 'stripe',
      metadata: { invoice_id: invoice.id, amount_cents: invoice.amount_paid },
    })
  }

  return contact?.customer_account_id ?? null
}
