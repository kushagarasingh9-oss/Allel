/**
 * Stripe Webhook Handler — Bounded Atomic Ingress
 *
 * POST /api/webhooks/stripe
 *
 * §40.7: Reduced to bounded ingress work only.
 * All business mutations (timeline, notifications, account updates)
 * happen in durable worker jobs, not here.
 *
 * Handles:
 * - invoice.payment_failed
 * - customer.subscription.updated
 * - customer.subscription.deleted
 * - invoice.paid
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/foundation/database/service'
import { verifyWebhookSignature } from '@/integrations/stripe/stripe'
import { buildCanonicalProviderEvent } from '@/recovery/events'
import { RECOVERY_CONFIG } from '@/recovery/config'
import type Stripe from 'stripe'

export async function POST(request: NextRequest) {
  // §40.7: Reject oversized bodies
  const contentLength = request.headers.get('content-length')
  if (contentLength && parseInt(contentLength, 10) > 500_000) {
    return NextResponse.json({ error: 'Payload too large' }, { status: 413 })
  }

  // §40.7 step 2: Read the raw body once
  const body = await request.text()
  const signature = request.headers.get('stripe-signature')

  if (!signature) {
    return NextResponse.json({ error: 'Missing stripe-signature header' }, { status: 400 })
  }

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET
  if (!webhookSecret) {
    return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 })
  }

  // §40.7 step 3: Verify signature using raw bytes
  let event: Stripe.Event
  try {
    event = verifyWebhookSignature(body, signature, webhookSecret)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Invalid signature'
    return NextResponse.json({ error: message }, { status: 400 })
  }

  // §40.7 step 4: Parse only after signature verification (already done by verifyWebhookSignature)

  if ((!event.livemode) !== RECOVERY_CONFIG.TEST_MODE) {
    return NextResponse.json({ error: 'Stripe event mode does not match this recovery environment' }, { status: 409 })
  }

  const supabase = createServiceClient()

  // §40.7 step 5: Extract stable provider event ID
  const providerEventId = event.id

  // §40.5.6 + §40.7 step 6: Resolve workspace through customer identity
  const eventObj = event.data.object as unknown as Record<string, unknown>
  const customerId = typeof eventObj.customer === 'string' ? eventObj.customer : null
  const scenarioId = typeof eventObj.metadata === 'object' && eventObj.metadata !== null
    ? (eventObj.metadata as Record<string, string>).allel_scenario_id
      ?? (eventObj.metadata as Record<string, string>).scenario_id
      ?? null
    : null
  const scenarioRunId = typeof eventObj.metadata === 'object' && eventObj.metadata !== null
    ? (eventObj.metadata as Record<string, string>).allel_test_run
      ?? (eventObj.metadata as Record<string, string>).scenario_run_id
      ?? null
    : null

  if (RECOVERY_CONFIG.TEST_MODE) {
    if (!scenarioId || !scenarioId.startsWith(RECOVERY_CONFIG.SCENARIO_PREFIX)) {
      return NextResponse.json({ error: 'Test-mode Stripe events require a valid allel_scenario_id' }, { status: 400 })
    }
    if (!scenarioRunId) {
      return NextResponse.json({ error: 'Test-mode Stripe events require a valid allel_test_run or scenario_run_id' }, { status: 400 })
    }
  }

  let workspaceId: string | null = null
  try {
    workspaceId = await resolveWorkspaceForStripeEvent(supabase, customerId, eventObj)
  } catch (resolveErr) {
    console.error('[stripe-webhook] workspace resolution failed:', resolveErr)
  }

  if (RECOVERY_CONFIG.TEST_MODE && workspaceId && scenarioRunId) {
    const { data: runRow } = await supabase
      .from('recovery_scenario_runs')
      .select('id, status, test_mode')
      .eq('id', scenarioRunId)
      .eq('workspace_id', workspaceId)
      .eq('test_mode', true)
      .eq('status', 'active')
      .maybeSingle()

    if (!runRow) {
      return NextResponse.json({ error: 'Active scenario run not found for workspace in test mode' }, { status: 403 })
    }
  }

  // §40.7 step 7: Build the canonical envelope
  const canonicalEvent = buildCanonicalProviderEvent({
    workspaceId,
    provider: 'stripe',
    providerEventId,
    eventType: event.type,
    occurredAt: new Date(event.created * 1000).toISOString(),
    primaryExternalIdentity: customerId,
    scenarioId,
    scenarioRunId,
    rawPayload: body,
    testMode: !event.livemode,
  })

  // §40.7 step 8: Call atomic database ingestion RPC
  const jobIdempotencyKey = workspaceId
    ? `ws:${workspaceId}:event:${providerEventId}:process:v1`
    : null

  const { data: ingestResult, error: ingestError } = await supabase.rpc(
    'ingest_provider_event_and_job',
    {
      p_event_id: canonicalEvent.eventId,
      p_workspace_id: workspaceId,
      p_provider: 'stripe',
      p_event_type: event.type,
      p_external_id: providerEventId,
      p_dedupe_key: canonicalEvent.dedupeKey,
      p_payload_hash: canonicalEvent.payloadHash,
      p_occurred_at: canonicalEvent.occurredAt,
      p_payload: event.data.object as unknown as Record<string, unknown>,
      p_test_mode: canonicalEvent.testMode,
      p_scenario_id: scenarioId,
      p_scenario_run_id: scenarioRunId,
      p_job_idempotency: jobIdempotencyKey,
    }
  )

  if (ingestError) {
    console.error('[stripe-webhook] ingest RPC error:', ingestError.message)
    return NextResponse.json({ error: 'Ingestion failed' }, { status: 500 })
  }

  // §40.7 step 9: Return success only after the transaction committed
  const result = Array.isArray(ingestResult) ? ingestResult[0] : ingestResult
  return NextResponse.json({
    received: true,
    eventId: result?.event_id ?? canonicalEvent.eventId,
    deduplicated: result?.deduplicated ?? false,
    conflict: result?.conflict ?? false,
  })
}

// ---------------------------------------------------------------------------
// §40.5.6  Workspace resolution order
// ---------------------------------------------------------------------------

async function resolveWorkspaceForStripeEvent(
  supabase: ReturnType<typeof createServiceClient>,
  customerId: string | null,
  eventObj: Record<string, unknown>
): Promise<string | null> {
  // 1. provider_identities match for Stripe customer ID (verified only)
  if (customerId) {
    const { data: identity, error: identityError } = await supabase
      .from('provider_identities')
      .select('workspace_id')
      .eq('provider', 'stripe')
      .eq('identity_type', 'customer_id')
      .eq('normalized_external_id', customerId.trim())
      .eq('verification_status', 'verified')
      .limit(2)

    if (!identityError && identity && identity.length === 1) {
      return identity[0].workspace_id
    }
    // §40.5.6: If two workspaces claim the same ID, classify as conflict — return null
    if (identity && identity.length > 1) {
      console.warn(`[stripe-webhook] conflict: ${identity.length} workspaces claim customer ${customerId}`)
      return null
    }
  }

  // 2. Legacy account_contacts.external_ids match (non-provisional only)
  if (customerId) {
    const { data: contact, error: contactError } = await supabase
      .from('account_contacts')
      .select('workspace_id')
      .eq('is_provisional', false)
      .contains('external_ids', { stripe_customer_id: customerId })
      .limit(2)

    if (!contactError && contact && contact.length === 1) {
      return contact[0].workspace_id
    }
  }

  // 3. Email fallback (non-provisional only)
  let email: string | null = null
  if (typeof eventObj.customer_email === 'string') {
    email = eventObj.customer_email
  } else if (typeof eventObj.receipt_email === 'string') {
    email = eventObj.receipt_email
  }

  if (email) {
    const { data: contact, error: contactError } = await supabase
      .from('account_contacts')
      .select('workspace_id')
      .eq('is_provisional', false)
      .eq('email', email.toLowerCase())
      .limit(2)

    if (!contactError && contact && contact.length === 1) {
      return contact[0].workspace_id
    }
  }

  // §40.5.6 step 6: Could not resolve — will be stored as unmapped
  return null
}
