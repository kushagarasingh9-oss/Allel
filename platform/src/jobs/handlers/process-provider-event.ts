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

  if (provider === 'stripe') {
    const identity = extractStripeIdentity(eventType, providerPayload);
    identityType = identity.identityType;
    externalId = identity.externalId;
  } else if (provider === 'posthog') {
    const identity = extractPostHogIdentity(providerPayload);
    identityType = identity.identityType as IdentityType;
    externalId = identity.externalId;
  } else if (provider === 'gmail') {
    identityType = 'email_address';
    externalId = providerPayload.from_address || null;
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
    scenarioMetadata: eventRow.scenario_id ? { scenarioId: eventRow.scenario_id } : undefined,
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

  const projection = projectProviderEvent({
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
        scenarioId: eventRow.scenario_id,
        occurredAt,
        // §40.5.1: Pass the typed projection patch from persisted event
        patch: projection.patch,
        evidence: projection.evidence,
        outcomeCandidate: projection.outcomeCandidate,
        mrrBaselineCents: priorMrrCents,
      },
    },
  };
}
