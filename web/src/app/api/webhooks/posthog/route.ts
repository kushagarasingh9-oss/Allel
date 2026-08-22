/**
 * PostHog Webhook Handler
 *
 * POST /api/webhooks/posthog
 *
 * Handles PostHog action webhooks for usage threshold alerts and cancellation intent.
 */

import { createHmac, timingSafeEqual } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { buildCanonicalProviderEvent } from '@/lib/recovery/events'
import { enqueueWorkflowJob } from '@/lib/jobs/queue'
import { notifyFounder } from '@/lib/notifications/notify-founder'

function assertNoDbError(
  context: string,
  error: { message: string } | null
): asserts error is null {
  if (error) {
    throw new Error(`[posthog-webhook] ${context}: ${error.message}`)
  }
}

export async function POST(request: NextRequest) {
  const body = await request.text()

  // ── Security: Timing-safe signature check ──
  const signature = request.headers.get('x-posthog-signature')
  const webhookSecret = process.env.POSTHOG_WEBHOOK_SECRET

  if (!webhookSecret) {
    return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 })
  }

  if (!signature) {
    return NextResponse.json({ error: 'Missing signature header' }, { status: 400 })
  }

  const expectedSig = createHmac('sha256', webhookSecret).update(body).digest('hex')
  const sigBuf = Buffer.from(signature, 'hex')
  const expBuf = Buffer.from(expectedSig, 'hex')

  if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  let payload: PostHogWebhookPayload
  try {
    payload = JSON.parse(body) as PostHogWebhookPayload
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const supabase = createServiceClient()

  // Resolve workspace and contact
  const email = resolvePayloadEmail(payload)
  const distinctId = typeof payload.distinct_id === 'string' ? payload.distinct_id : null
  const contact = await resolveContact(supabase, email, distinctId)
  const workspaceId = contact?.workspace_id || null

  const eventName = payload.event ?? payload.hook?.event ?? 'action_fired'
  const eventUuid = payload.properties?.$insert_id || payload.properties?.uuid || `${distinctId}:${eventName}:${Date.now()}`

  // 1. Build canonical provider event
  const canonicalEvent = buildCanonicalProviderEvent({
    workspaceId,
    provider: 'posthog',
    providerEventId: eventUuid,
    eventType: eventName,
    occurredAt: payload.properties?.timestamp || new Date().toISOString(),
    primaryExternalIdentity: distinctId,
    rawPayload: body,
  })

  // 2. Check for duplicate event
  if (workspaceId) {
    const { data: existingEvent, error: existingError } = await supabase
      .from('webhook_events')
      .select('id, processed')
      .eq('workspace_id', workspaceId)
      .eq('provider', 'posthog')
      .eq('external_id', eventUuid)
      .maybeSingle()
    assertNoDbError('check existing PostHog webhook event', existingError)

    if (existingEvent?.processed) {
      return NextResponse.json({
        received: true,
        eventId: existingEvent.id,
        deduplicated: true,
      })
    }
  }

  // 3. Insert into webhook_events
  const { data: loggedEvent, error: webhookError } = await supabase
    .from('webhook_events')
    .insert({
      id: canonicalEvent.eventId,
      workspace_id: workspaceId,
      provider: 'posthog',
      event_type: eventName,
      external_id: eventUuid,
      dedupe_key: canonicalEvent.dedupeKey,
      payload_hash: canonicalEvent.payloadHash,
      occurred_at: canonicalEvent.occurredAt,
      payload: payload as unknown as Record<string, unknown>,
      processed: false,
    })
    .select('id')
    .single()
  assertNoDbError('insert webhook event', webhookError)

  const webhookEventId = loggedEvent.id

  // 4. Enqueue durable job: process_provider_event
  if (workspaceId) {
    const jobKey = `ws:${workspaceId}:event:${eventUuid}:process:v1`
    await enqueueWorkflowJob(supabase, {
      workspaceId,
      webhookEventId,
      jobType: 'process_provider_event',
      idempotencyKey: jobKey,
      payload: canonicalEvent,
    })
  }

  // 5. Update timeline / notifications for fast feedback
  try {
    if (contact) {
      const accountId = contact.customer_account_id
      const isCancellationPage =
        payload.event === '$pageview' &&
        payload.properties?.$current_url?.includes('/cancel')

      if (isCancellationPage) {
        await supabase.from('account_timeline').insert({
          workspace_id: workspaceId!,
          customer_account_id: accountId,
          event_type: 'usage',
          headline: 'Cancellation page visited',
          source: 'posthog',
        })

        notifyFounder({
          workspaceId: workspaceId!,
          severity: 'critical',
          headline: 'Cancellation page visited',
          detail: `${email || 'User'} just visited the cancellation page. Immediate intervention recommended.`,
          source: 'posthog_webhook',
          dashboardPath: `/dashboard/accounts/${accountId}`,
        })
      }
    }
  } catch (err) {
    console.error('[posthog-webhook] Synchronous projection warning:', err)
  }

  return NextResponse.json({
    received: true,
    eventId: webhookEventId,
    deduplicated: false,
  })
}

function resolvePayloadEmail(payload: PostHogWebhookPayload): string | null {
  const possibleEmails = [
    payload.person?.properties?.email,
    payload.person?.properties?.$email,
    payload.properties?.email,
    payload.properties?.$email,
  ]

  for (const value of possibleEmails) {
    if (typeof value === 'string' && value.includes('@')) {
      return value.toLowerCase().trim()
    }
  }

  return null
}

async function resolveContact(
  supabase: ReturnType<typeof createServiceClient>,
  email: string | null,
  distinctId: string | null
) {
  if (email) {
    const { data, error } = await supabase
      .from('account_contacts')
      .select('workspace_id, customer_account_id')
      .eq('email', email)
      .maybeSingle()
    assertNoDbError('lookup account contact by email', error)
    if (data) return data
  }

  if (distinctId) {
    const { data, error } = await supabase
      .from('account_contacts')
      .select('workspace_id, customer_account_id')
      .contains('external_ids', { posthog_distinct_ids: [distinctId] })
      .limit(1)
      .maybeSingle()
    assertNoDbError('lookup account contact by PostHog distinct id', error)
    if (data) return data
  }

  return null
}

type PostHogWebhookPayload = {
  event?: string
  distinct_id?: string
  person?: {
    properties?: Record<string, unknown>
  }
  properties?: Record<string, string>
  hook?: {
    event?: string
    target?: string
  }
}
