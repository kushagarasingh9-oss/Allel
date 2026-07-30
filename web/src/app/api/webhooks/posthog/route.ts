/**
 * PostHog Webhook Handler
 *
 * POST /api/webhooks/posthog
 *
 * Handles PostHog action webhooks for usage threshold alerts.
 */

import { createHmac, randomUUID } from 'crypto'
import { after, NextRequest, NextResponse } from 'next/server'
import {
  enqueueAccountMemoryRefresh,
  processQueuedAccountMemoryRefreshes,
} from '@/lib/agent/account-memory'
import {
  buildPostHogWebhookJobs,
  logWorkflowStage,
  runWorkflowAgentJobs,
} from '@/lib/agent/workflows'
import { generateWorkspaceBrief } from '@/lib/briefs/generate-workspace-brief'
import { createServiceClient } from '@/lib/supabase/service'
import { notifyFounder } from '@/lib/notifications/notify-founder'

function assertNoDbError(
  context: string,
  error: { message: string } | null
): asserts error is null {
  if (error) {
    throw new Error(`[posthog-webhook] ${context}: ${error.message}`)
  }
}

async function refreshWebhookAccountMemory(
  workspaceId: string,
  accountId: string
) {
  await enqueueAccountMemoryRefresh(workspaceId, accountId)
  await processQueuedAccountMemoryRefreshes({
    workspaceId,
    limit: 1,
    concurrency: 1,
  })
}

function schedulePostHogWebhookFollowUp(input: {
  workspaceId: string
  workflowId: string
  accountId: string
  eventName: string
  eventDescription: string
  event: string | undefined
  distinctId: string | null
  webhookEventId: string
}) {
  after(async () => {
    try {
      await runWorkflowAgentJobs({
        workspaceId: input.workspaceId,
        workflowId: input.workflowId,
        runType: 'posthog_webhook',
        defaultPersonaId: 'sarah',
        customerAccountId: input.accountId,
        jobs: buildPostHogWebhookJobs(input.eventDescription),
        sharedMetadata: {
          event: input.event,
          distinctId: input.distinctId,
          webhookEventId: input.webhookEventId,
        },
      })

      const followUpBriefStartedAt = Date.now()
      const followUpBrief = await generateWorkspaceBrief(input.workspaceId)

      await logWorkflowStage({
        workspaceId: input.workspaceId,
        workflowId: input.workflowId,
        runType: 'posthog_webhook',
        stage: 'brief_refresh',
        customerAccountId: input.accountId,
        inputSummary: 'Refresh founder brief after PostHog webhook follow-up',
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
      console.error('[posthog-webhook] Agent trigger failed:', err)
      await logWorkflowStage({
        workspaceId: input.workspaceId,
        workflowId: input.workflowId,
        runType: 'posthog_webhook',
        stage: 'workflow_failed',
        status: 'failed',
        customerAccountId: input.accountId,
        outputSummary: `PostHog webhook follow-up failed for ${input.eventName}`,
        error: err instanceof Error ? err.message : 'Unknown follow-up error',
        metadata: {
          event: input.event,
          distinctId: input.distinctId,
          webhookEventId: input.webhookEventId,
        },
      })

      try {
        const fallbackBriefStartedAt = Date.now()
        const fallbackBrief = await generateWorkspaceBrief(input.workspaceId)

        await logWorkflowStage({
          workspaceId: input.workspaceId,
          workflowId: input.workflowId,
          runType: 'posthog_webhook',
          stage: 'brief_refresh',
          customerAccountId: input.accountId,
          inputSummary: 'Refresh founder brief after PostHog webhook failure fallback',
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
        console.error('[posthog-webhook] Brief refresh failed:', briefErr)
      }
    }
  })
}

export async function POST(request: NextRequest) {
  const body = await request.text()

  // ── Security: Verify webhook signature (mandatory) ──
  const signature = request.headers.get('x-posthog-signature')
  const webhookSecret = process.env.POSTHOG_WEBHOOK_SECRET

  if (!webhookSecret) {
    console.error('[posthog-webhook] POSTHOG_WEBHOOK_SECRET is not configured')
    return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 })
  }

  if (!signature) {
    return NextResponse.json({ error: 'Missing signature header' }, { status: 400 })
  }

  const expectedSig = createHmac('sha256', webhookSecret).update(body).digest('hex')
  if (signature !== expectedSig) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  let payload: PostHogWebhookPayload
  try {
    payload = JSON.parse(body) as PostHogWebhookPayload
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const supabase = createServiceClient()

  // Resolve workspace from the PostHog event
  const email = resolvePayloadEmail(payload)
  const distinctId = typeof payload.distinct_id === 'string' ? payload.distinct_id : null

  const contact = await resolveContact(supabase, email, distinctId)

  if (!contact) {
    return NextResponse.json({ received: true, mapped: false })
  }

  const { workspace_id: workspaceId, customer_account_id: accountId } = contact
  const workflowId = randomUUID()

  // Build a stable external_id for idempotency
  const payloadTimestamp = typeof payload.properties?.timestamp === 'string'
    ? payload.properties.timestamp
    : typeof payload.properties?.uuid === 'string'
      ? payload.properties.uuid
      : null
  const stableExternalId =
    typeof payload.distinct_id === 'string' && payload.event
      ? `${payload.distinct_id}:${payload.event}:${payloadTimestamp ?? 'no-ts'}`
      : null

  // Idempotency: skip if this event was already processed
  if (stableExternalId) {
    const { data: existingEvent, error: existingError } = await supabase
      .from('webhook_events')
      .select('id, processed')
      .eq('provider', 'posthog')
      .eq('external_id', stableExternalId)
      .maybeSingle()
    assertNoDbError('check existing PostHog webhook event', existingError)

    if (existingEvent?.processed) {
      return NextResponse.json({ received: true, deduplicated: true })
    }
  }

  // Log raw event
  const { data: loggedEvent, error: webhookError } = await supabase
    .from('webhook_events')
    .insert({
      workspace_id: workspaceId,
      provider: 'posthog',
      event_type: payload.event ?? payload.hook?.event ?? 'action_fired',
      external_id: stableExternalId,
      payload: payload as unknown as Record<string, unknown>,
      processed: false,
    })
    .select('id')
    .single()
  assertNoDbError('insert webhook event', webhookError)

  // Process the event
  try {
    if (payload.event === '$pageview' && payload.properties?.$current_url?.includes('/cancel')) {
      // Cancellation page visit
      const { error: signalError } = await supabase.from('account_signals').insert({
        workspace_id: workspaceId,
        customer_account_id: accountId,
        signal_type: 'usage',
        headline: 'Cancellation page visited',
        detail: `${email} visited the cancellation page.`,
        next_step: 'Draft a save email immediately.',
        evidence: ['User visited cancellation page'],
        risk_level: 'high',
      })
      assertNoDbError('insert cancellation-page signal', signalError)

      const { error: timelineError } = await supabase.from('account_timeline').insert({
        workspace_id: workspaceId,
        customer_account_id: accountId,
        event_type: 'usage',
        headline: 'Cancellation page visited',
        source: 'posthog',
      })
      assertNoDbError('insert cancellation-page timeline event', timelineError)

      await refreshWebhookAccountMemory(workspaceId, accountId)
    } else if (payload.hook?.event === 'action_performed') {
      // Generic action trigger — check if it's a usage threshold alert
      const actionName = payload.hook?.target ?? payload.event ?? 'Unknown action'
      
      const { error: signalError } = await supabase.from('account_signals').insert({
        workspace_id: workspaceId,
        customer_account_id: accountId,
        signal_type: 'usage',
        headline: `Usage action: ${actionName}`,
        detail: `PostHog action triggered for ${email}.`,
        risk_level: 'medium',
      })
      assertNoDbError('insert generic PostHog signal', signalError)

      const { error: timelineError } = await supabase.from('account_timeline').insert({
        workspace_id: workspaceId,
        customer_account_id: accountId,
        event_type: 'usage',
        headline: `Action: ${actionName}`,
        source: 'posthog',
        metadata: { event: payload.event, properties: payload.properties },
      })
      assertNoDbError('insert generic PostHog timeline event', timelineError)

      await refreshWebhookAccountMemory(workspaceId, accountId)
    }

    const eventName = payload.hook?.target ?? payload.event ?? 'unknown'
    const eventDesc =
      payload.event === '$pageview' &&
      payload.properties?.$current_url?.includes('/cancel')
        ? `Cancellation page visited by ${email}`
        : `PostHog action: ${eventName} by ${email}`

    await logWorkflowStage({
      workspaceId,
      workflowId,
      runType: 'posthog_webhook',
      stage: 'webhook_ingest',
      customerAccountId: accountId,
      inputSummary: `Process PostHog event ${eventName}`,
      outputSummary: `Normalized PostHog event ${eventDesc}`,
      metadata: {
        event: payload.event,
        distinctId,
        webhookEventId: loggedEvent.id,
      },
    })

    const briefStartedAt = Date.now()
    const initialBrief = await generateWorkspaceBrief(workspaceId)
    await logWorkflowStage({
      workspaceId,
      workflowId,
      runType: 'posthog_webhook',
      stage: 'brief_refresh',
      customerAccountId: accountId,
      inputSummary: 'Refresh founder brief after PostHog webhook ingestion',
      outputSummary: `Generated founder brief with ${initialBrief.itemCount} items`,
      durationMs: Date.now() - briefStartedAt,
      metadata: {
        phase: 'before_follow_up',
        briefId: initialBrief.briefId,
        headline: initialBrief.headline,
        itemCount: initialBrief.itemCount,
      },
    })

    schedulePostHogWebhookFollowUp({
      workspaceId,
      workflowId,
      accountId,
      eventName,
      eventDescription: eventDesc,
      event: payload.event,
      distinctId,
      webhookEventId: loggedEvent.id,
    })

    const { error: processedError } = await supabase
      .from('webhook_events')
      .update({ processed: true, processed_at: new Date().toISOString() })
      .eq('id', loggedEvent.id)
    assertNoDbError('mark webhook event processed', processedError)

    // --- Real-time founder notification ---
    const { data: account } = await supabase
      .from('customer_accounts')
      .select('name, mrr_cents')
      .eq('id', accountId)
      .single()

    const isCancellationPage =
      payload.event === '$pageview' &&
      payload.properties?.$current_url?.includes('/cancel')

    notifyFounder({
      workspaceId,
      severity: isCancellationPage ? 'critical' : 'urgent',
      headline: isCancellationPage
        ? 'Cancellation page visited'
        : `Usage alert: ${eventName}`,
      detail: isCancellationPage
        ? `${email} just visited the cancellation page. Immediate intervention recommended.`
        : `PostHog action "${eventName}" triggered for ${email}.`,
      accountName: account?.name ?? undefined,
      mrrCents: account?.mrr_cents ?? undefined,
      source: 'posthog_webhook',
      dashboardPath: `/dashboard/accounts/${accountId}`,
    })

  } catch (err) {
    console.error('PostHog webhook processing error:', err)
    const { error: updateError } = await supabase
      .from('webhook_events')
      .update({ error: err instanceof Error ? err.message : 'Unknown error' })
      .eq('id', loggedEvent.id)
    if (updateError) {
      console.error('[posthog-webhook] Failed to update webhook error log:', updateError)
    }
  }

  return NextResponse.json({ received: true, mapped: true })
}

function resolvePayloadEmail(payload: PostHogWebhookPayload) {
  const possibleEmails = [
    payload.person?.properties?.email,
    payload.person?.properties?.$email,
    payload.properties?.email,
    payload.properties?.$email,
  ]

  for (const value of possibleEmails) {
    if (typeof value === 'string' && value.includes('@')) {
      return value.toLowerCase()
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

// ----- Types -----

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
