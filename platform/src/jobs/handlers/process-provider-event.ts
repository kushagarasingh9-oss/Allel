/**
 * Process Provider Event — Durable worker job handler
 *
 * §40.8: Loads the persisted webhook_events row instead of trusting queue payload.
 * Extracts identity from the actual provider payload.
 * Calls provider-specific projection to build a typed feature patch.
 */

import { SupabaseClient } from '@supabase/supabase-js';
import { JobExecutionContext, JobExecutionResult } from '@/jobs/types';
import { resolveAccountIdentity } from '@/recovery/identity';
import { IdentityType } from '@/recovery/types';
import {
  extractStripeIdentity,
  extractPostHogIdentity,
  projectProviderEvent,
} from '@/recovery/provider-projection';
import { sanitizeCustomerText } from '@/recovery/redaction';

export async function handleProcessProviderEvent(
  supabase: SupabaseClient,
  context: JobExecutionContext
): Promise<JobExecutionResult> {
  const payload = context.job.payload;
  const workspaceId = context.workspaceId || payload.workspaceId;
  const webhookEventId = payload.webhookEventId || context.job.webhookEventId;

  if (!workspaceId) {
    throw new Error('process_provider_event requires workspaceId');
  }

  if (!webhookEventId) {
    throw new Error('process_provider_event requires webhookEventId');
  }

  // §40.8 step 1: Load the persisted event from webhook_events
  const { data: eventRow, error: eventError } = await supabase
    .from('webhook_events')
    .select('*')
    .eq('id', webhookEventId)
    .single();

  if (eventError || !eventRow) {
    throw new Error(`webhook event ${webhookEventId} not found: ${eventError?.message}`);
  }

  // §40.8: Verify job workspace equals event workspace
  if (eventRow.workspace_id && eventRow.workspace_id !== workspaceId) {
    throw new Error(`workspace mismatch: job=${workspaceId}, event=${eventRow.workspace_id}`);
  }

  // §40.8: Check event not in conflict state
  if (eventRow.error && eventRow.error.includes('CONFLICT')) {
    const { error: markError } = await supabase
      .from('webhook_events')
      .update({ processed: true, processed_at: new Date().toISOString() })
      .eq('id', webhookEventId);

    if (markError) {
      console.error('[process-provider-event] failed to mark conflict event processed:', markError.message);
    }
    return { success: true, workspaceId };
  }

  // §40.8: Check event payload exists
  if (!eventRow.payload || typeof eventRow.payload !== 'object') {
    throw new Error(`webhook event ${webhookEventId} has no payload`);
  }

  const provider = eventRow.provider as 'stripe' | 'posthog' | 'gmail';
  const eventType = eventRow.event_type;
  const occurredAt = eventRow.occurred_at || eventRow.received_at;
  const providerPayload = eventRow.payload as Record<string, any>;

  // §40.8: Extract identity from persisted provider payload
  let identityType: IdentityType = 'customer_id';
  let externalId: string | null = null;
  let fallbackEmail: string | null = null;

  if (provider === 'stripe') {
    const identity = extractStripeIdentity(eventType, providerPayload);
    identityType = identity.identityType;
    externalId = identity.externalId;
    fallbackEmail = extractFallbackEmail(provider, providerPayload);
  } else if (provider === 'posthog') {
    const identity = extractPostHogIdentity(providerPayload);
    identityType = identity.identityType as IdentityType;
    externalId = identity.externalId;
    fallbackEmail = extractFallbackEmail(provider, providerPayload);
  } else if (provider === 'gmail') {
    // A bound Gmail thread is authoritative for replies. Email is only the
    // unique-contact fallback when the thread has not been observed before.
    identityType = 'gmail_thread_id';
    externalId = typeof providerPayload.thread_id === 'string' ? providerPayload.thread_id : null;
    fallbackEmail = extractFallbackEmail(provider, providerPayload);
  }

  if (!externalId) {
    // §40.8: Mark as unmapped — no account mutation
    const { error: updateError } = await supabase
      .from('webhook_events')
      .update({
        identity_status: 'unmapped',
        processed: true,
        processed_at: new Date().toISOString(),
      })
      .eq('id', webhookEventId);

    if (updateError) {
      throw new Error(`failed to mark event unmapped: ${updateError.message}`);
    }
    return { success: true, workspaceId };
  }

  // §40.8: Resolve account identity
  const resolution = await resolveAccountIdentity(supabase, {
    workspaceId,
    provider,
    identityType,
    externalId,
    scenarioMetadata: eventRow.scenario_id
      ? {
          scenarioId: eventRow.scenario_id,
          scenarioRunId: eventRow.scenario_run_id ?? null,
        }
      : undefined,
    fallbackEmail,
  });

  // §40.8: Update webhook_events — only columns that exist
  const { error: updateError } = await supabase
    .from('webhook_events')
    .update({
      identity_status: resolution.status,
      customer_account_id: resolution.customerAccountId,
      processed: true,
      processed_at: new Date().toISOString(),
      error: null,
    })
    .eq('id', webhookEventId);

  if (updateError) {
    throw new Error(`failed to update webhook event: ${updateError.message}`);
  }

  if (resolution.status !== 'verified' || !resolution.customerAccountId) {
    // Unmapped or conflict — do not mutate account
    return { success: true, workspaceId };
  }

  // §40.5.1: Build typed provider projection from persisted payload
  // For subscription.deleted, we need prior MRR to preserve pre-cancel baseline
  let priorMrrCents: number | null = null;
  if (provider === 'stripe' && eventType === 'customer.subscription.deleted') {
    const { data: featureRow } = await supabase
      .from('account_features')
      .select('current_mrr_cents')
      .eq('customer_account_id', resolution.customerAccountId)
      .maybeSingle();

    priorMrrCents = featureRow?.current_mrr_cents ?? null;
  }

  let projection = projectProviderEvent({
    webhookEventId,
    providerEventId: eventRow.external_id || webhookEventId,
    provider,
    eventType,
    payload: providerPayload,
    occurredAt,
    priorMrrCents,
  });

  // §40.8: Unsupported event types are deliberate no-ops
  if (!projection) {
    return { success: true, workspaceId };
  }

  if (provider === 'gmail') {
    const isRecoveryReply = await isGmailRecoveryReply({
      supabase,
      workspaceId,
      customerAccountId: resolution.customerAccountId,
      threadId: typeof providerPayload.thread_id === 'string' ? providerPayload.thread_id : null,
      occurredAt,
    });

    if (!isRecoveryReply) {
      // New inbound mail can refresh communication context, but it cannot be
      // counted as recovery engagement until it is newer than an Allel send
      // and bound to a sent recovery draft (or its uniquely resolved account).
      const patch = { ...projection.patch };
      delete patch.unrepliedOutboundCount;
      projection = { ...projection, patch, outcomeCandidate: null };
    } else {
      await recordGmailReplyTimeline({
        supabase,
        workspaceId,
        customerAccountId: resolution.customerAccountId,
        messageId: typeof providerPayload.message_id === 'string' ? providerPayload.message_id : eventRow.external_id || webhookEventId,
        threadId: typeof providerPayload.thread_id === 'string' ? providerPayload.thread_id : null,
        fromAddress: typeof providerPayload.from_address === 'string' ? providerPayload.from_address : null,
        subject: typeof providerPayload.subject === 'string' ? providerPayload.subject : 'Customer reply received',
        snippet: typeof providerPayload.snippet === 'string' ? providerPayload.snippet : '',
        occurredAt,
      });
    }
  }

  // Enqueue feature projection job with the typed patch
  const idempotencyKey = `ws:${workspaceId}:account:${resolution.customerAccountId}:project_features:${webhookEventId}`;

  return {
    success: true,
    workspaceId,
    nextJob: {
      jobType: 'project_account_features',
      idempotencyKey,
      workspaceId,
      webhookEventId,
      payload: {
        workspaceId,
        customerAccountId: resolution.customerAccountId,
        triggerProvider: provider,
        triggerEventType: eventType,
        triggerEventId: webhookEventId,
        providerEventId: eventRow.external_id || webhookEventId,
        scenarioId: eventRow.scenario_id,
        scenarioRunId: eventRow.scenario_run_id || context.job.scenarioRunId || null,
        occurredAt,
        identityConfidence: resolution.confidence,
        isTestMode: eventRow.test_mode === true,
        // §40.5.1: Pass the typed projection patch from persisted event
        patch: projection.patch,
        evidence: projection.evidence,
        outcomeCandidate: projection.outcomeCandidate,
        mrrBaselineCents: priorMrrCents,
      },
    },
  };
}

async function recordGmailReplyTimeline(input: {
  supabase: SupabaseClient;
  workspaceId: string;
  customerAccountId: string;
  messageId: string;
  threadId: string | null;
  fromAddress: string | null;
  subject: string;
  snippet: string;
  occurredAt: string;
}) {
  const { data: existing, error: lookupError } = await input.supabase
    .from('account_timeline')
    .select('id')
    .eq('workspace_id', input.workspaceId)
    .eq('customer_account_id', input.customerAccountId)
    .eq('event_type', 'email_received')
    .contains('metadata', { gmail_message_id: input.messageId })
    .maybeSingle();
  if (lookupError) throw new Error(`Failed to check Gmail reply timeline: ${lookupError.message}`);
  if (existing) return;

  const { error } = await input.supabase.from('account_timeline').insert({
    workspace_id: input.workspaceId,
    customer_account_id: input.customerAccountId,
    event_type: 'email_received',
    headline: `Customer replied in Gmail: ${sanitizeCustomerText(input.subject).slice(0, 120)}`,
    detail: sanitizeCustomerText(input.snippet).slice(0, 500),
    source: 'gmail',
    metadata: {
      gmail_message_id: input.messageId,
      gmail_thread_id: input.threadId,
      from_address: input.fromAddress,
    },
    event_at: input.occurredAt,
  });
  if (error) throw new Error(`Failed to append Gmail reply timeline: ${error.message}`);
}

async function isGmailRecoveryReply(input: {
  supabase: SupabaseClient;
  workspaceId: string;
  customerAccountId: string;
  threadId: string | null;
  occurredAt: string;
}): Promise<boolean> {
  const { data: sentDrafts, error } = await input.supabase
    .from('follow_up_drafts')
    .select('provider_thread_id, sent_at')
    .eq('workspace_id', input.workspaceId)
    .eq('customer_account_id', input.customerAccountId)
    .not('recovery_case_id', 'is', null)
    .eq('status', 'sent')
    .not('sent_at', 'is', null)
    .lt('sent_at', input.occurredAt);

  if (error) throw new Error(`Failed to validate Gmail reply attribution: ${error.message}`);
  if (!sentDrafts || sentDrafts.length === 0) return false;

  // A reply can resolve recovery engagement only when Gmail binds it to the
  // exact thread created by a confirmed recovery send. Account-level identity
  // alone is insufficient: one contact can have unrelated conversations.
  return Boolean(
    input.threadId && sentDrafts.some((draft) => draft.provider_thread_id === input.threadId)
  );
}

function extractFallbackEmail(
  provider: 'stripe' | 'posthog' | 'gmail',
  payload: Record<string, any>
): string | null {
  if (provider === 'stripe') {
    const email = payload.customer_email ?? payload.receipt_email;
    return typeof email === 'string' ? email : null;
  }

  if (provider === 'posthog') {
    const email =
      payload.person?.properties?.email ??
      payload.person?.properties?.$email ??
      payload.properties?.email ??
      payload.properties?.$email;
    return typeof email === 'string' ? email : null;
  }

  return typeof payload.from_address === 'string' ? payload.from_address : null;
}
