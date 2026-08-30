/**
 * PostHog Webhook Handler — Bounded Atomic Ingress
 *
 * POST /api/webhooks/posthog
 *
 * §40.7: Reduced to bounded ingress work only.
 * All business mutations happen in durable worker jobs.
 *
 * §40.7.2: Stable event ID order: $insert_id → UUID → SHA-256 fingerprint.
 */

import { createHmac, createHash, timingSafeEqual } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/foundation/database/service'
import { buildCanonicalProviderEvent } from '@/recovery/events'
import { RECOVERY_CONFIG } from '@/recovery/config'

export async function POST(request: NextRequest) {
  // §40.7: Reject oversized bodies
  const contentLength = request.headers.get('content-length')
  if (contentLength && parseInt(contentLength, 10) > 500_000) {
    return NextResponse.json({ error: 'Payload too large' }, { status: 413 })
  }

  const body = await request.text()

  // Signature verification
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

  const distinctId = typeof payload.distinct_id === 'string' ? payload.distinct_id : null
  const eventName = payload.event ?? payload.hook?.event ?? 'action_fired'

  // §40.7.2: Stable event ID — never use Date.now()
  const eventUuid = computeStablePostHogEventId(payload, distinctId, eventName, body)

  const occurredAt = payload.properties?.timestamp
    || (payload.properties?.['$timestamp'] as string | undefined)
    || new Date().toISOString()
  const scenarioId = getScenarioId(payload)
  const scenarioRunId = getScenarioRunId(payload)
  const declaredTestMode = payload.properties?.allel_test_mode
  if (typeof declaredTestMode === 'boolean' && declaredTestMode !== RECOVERY_CONFIG.TEST_MODE) {
    return NextResponse.json({ error: 'Test-mode event does not match this recovery environment' }, { status: 409 })
  }
  if (
    RECOVERY_CONFIG.TEST_MODE &&
    (!scenarioId || !scenarioId.startsWith(RECOVERY_CONFIG.SCENARIO_PREFIX))
  ) {
    return NextResponse.json({ error: 'Test-mode PostHog events require a valid allel_scenario_id' }, { status: 400 })
  }

  // Resolve workspace via provider_identities then email fallback
  let workspaceId: string | null = null
  try {
    workspaceId = await resolveWorkspaceForPostHog(supabase, distinctId, payload)
  } catch (err) {
    console.error('[posthog-webhook] workspace resolution failed:', err)
  }

  // Build canonical envelope
  const canonicalEvent = buildCanonicalProviderEvent({
    workspaceId,
    provider: 'posthog',
    providerEventId: eventUuid,
    eventType: eventName,
    occurredAt,
    primaryExternalIdentity: distinctId,
    scenarioId,
    scenarioRunId,
    rawPayload: body,
    testMode: RECOVERY_CONFIG.TEST_MODE,
  })

  // Call atomic ingestion RPC
  const jobIdempotencyKey = workspaceId
    ? `ws:${workspaceId}:event:${eventUuid}:process:v1`
    : null

  const { data: ingestResult, error: ingestError } = await supabase.rpc(
    'ingest_provider_event_and_job',
    {
      p_event_id: canonicalEvent.eventId,
      p_workspace_id: workspaceId,
      p_provider: 'posthog',
      p_event_type: eventName,
      p_external_id: eventUuid,
      p_dedupe_key: canonicalEvent.dedupeKey,
      p_payload_hash: canonicalEvent.payloadHash,
      p_occurred_at: canonicalEvent.occurredAt,
      p_payload: payload as unknown as Record<string, unknown>,
      p_test_mode: canonicalEvent.testMode,
      p_scenario_id: canonicalEvent.scenarioId,
      p_scenario_run_id: canonicalEvent.scenarioRunId,
      p_job_idempotency: jobIdempotencyKey,
    }
  )

  if (ingestError) {
    console.error('[posthog-webhook] ingest RPC error:', ingestError.message)
    return NextResponse.json({ error: 'Ingestion failed' }, { status: 500 })
  }

  // §40.7: No synchronous side effects — no timeline inserts, no notifyFounder

  const result = Array.isArray(ingestResult) ? ingestResult[0] : ingestResult
  return NextResponse.json({
    received: true,
    eventId: result?.event_id ?? canonicalEvent.eventId,
    deduplicated: result?.deduplicated ?? false,
    conflict: result?.conflict ?? false,
  })
}

// ---------------------------------------------------------------------------
// §40.7.2  Stable PostHog event ID
// ---------------------------------------------------------------------------

function computeStablePostHogEventId(
  payload: PostHogWebhookPayload,
  distinctId: string | null,
  eventName: string,
  rawBody: string
): string {
  // 1. $insert_id
  const insertId = payload.properties?.$insert_id
  if (typeof insertId === 'string' && insertId.length > 0) {
    return insertId
  }

  // 2. Provider UUID
  const uuid = payload.properties?.uuid
  if (typeof uuid === 'string' && uuid.length > 0) {
    return uuid
  }

  // 3. SHA-256 fingerprint — deterministic across retries
  const timestamp = payload.properties?.timestamp || ''
  const fingerprint = createHash('sha256')
    .update(`${distinctId || ''}\u0000${eventName}\u0000${timestamp}\u0000${rawBody}`)
    .digest('hex')
    .slice(0, 32)

  return `ph_${fingerprint}`
}

// ---------------------------------------------------------------------------
// §40.5.6  PostHog workspace resolution
// ---------------------------------------------------------------------------

async function resolveWorkspaceForPostHog(
  supabase: ReturnType<typeof import('@/foundation/database/service').createServiceClient>,
  distinctId: string | null,
  payload: PostHogWebhookPayload
): Promise<string | null> {
  // 1. provider_identities match for distinct_id (verified only)
  if (distinctId) {
    const { data: identity } = await supabase
      .from('provider_identities')
      .select('workspace_id')
      .eq('provider', 'posthog')
      .eq('identity_type', 'distinct_id')
      .eq('normalized_external_id', distinctId.trim())
      .eq('verification_status', 'verified')
      .limit(2)

    if (identity && identity.length === 1) {
      return identity[0].workspace_id
    }
  }

  // 2. Email fallback — unique non-provisional match only
  const email = resolvePayloadEmail(payload)
  if (email) {
    const { data: contact } = await supabase
      .from('account_contacts')
      .select('workspace_id')
      .eq('is_provisional', false)
      .eq('email', email)
      .limit(2)

    if (contact && contact.length === 1) {
      return contact[0].workspace_id
    }
  }

  return null
}

function getScenarioId(payload: PostHogWebhookPayload): string | null {
  const value = payload.properties?.allel_scenario_id
  return typeof value === 'string' && value.length <= 120 ? value : null
}

function getScenarioRunId(payload: PostHogWebhookPayload): string | null {
  const value = payload.properties?.allel_test_run ?? payload.properties?.scenario_run_id
  return typeof value === 'string' && value.length > 0 && value.length <= 160 ? value : null
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

type PostHogWebhookPayload = {
  event?: string
  distinct_id?: string
  person?: {
    properties?: Record<string, unknown>
  }
  properties?: Record<string, any>
  hook?: {
    event?: string
    target?: string
  }
}
