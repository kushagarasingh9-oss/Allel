import { SupabaseClient } from '@supabase/supabase-js';
import { JobExecutionContext, JobExecutionResult } from '../types';
import { resolveAccountIdentity } from '../../recovery/identity';
import { CanonicalProviderEvent, IdentityType } from '../../recovery/types';

export async function handleProcessProviderEvent(
  supabase: SupabaseClient,
  context: JobExecutionContext
): Promise<JobExecutionResult> {
  const event = context.job.payload as CanonicalProviderEvent;
  const workspaceId = context.workspaceId || event.workspaceId;

  if (!workspaceId) {
    throw new Error('process_provider_event requires workspaceId');
  }

  // 1. Determine identity type
  let identityType: IdentityType = 'customer_id';
  let externalId = event.primaryExternalIdentity || event.providerAccountId || '';

  if (event.provider === 'stripe') {
    if (event.eventType.startsWith('customer.subscription')) {
      identityType = 'subscription_id';
    } else if (event.eventType.startsWith('invoice')) {
      identityType = 'invoice_customer_id';
    } else {
      identityType = 'customer_id';
    }
  } else if (event.provider === 'posthog') {
    identityType = 'distinct_id';
  } else if (event.provider === 'gmail') {
    identityType = 'email_address';
  }

  if (!externalId) {
    // If no explicit identity, mark event unmapped and complete
    await supabase
      .from('webhook_events')
      .update({
        identity_status: 'unmapped',
        status: 'completed',
        completed_at: new Date().toISOString(),
      })
      .eq('id', event.eventId);

    return { success: true };
  }

  // 2. Resolve account identity
  const resolution = await resolveAccountIdentity(supabase, {
    workspaceId,
    provider: event.provider,
    identityType,
    externalId,
    scenarioMetadata: event.scenarioId ? { scenarioId: event.scenarioId } : undefined,
  });

  // 3. Update webhook_events row
  await supabase
    .from('webhook_events')
    .update({
      identity_status: resolution.status,
      customer_account_id: resolution.customerAccountId,
      status: 'completed',
      completed_at: new Date().toISOString(),
    })
    .eq('id', event.eventId);

  if (resolution.status !== 'verified' || !resolution.customerAccountId) {
    // Unmapped or conflict - do not mutate account
    return { success: true };
  }

  // 4. Enqueue feature projection job
  const idempotencyKey = `ws:${workspaceId}:account:${resolution.customerAccountId}:project_features:${event.eventId}`;

  return {
    success: true,
    nextJob: {
      jobType: 'project_account_features',
      idempotencyKey,
      workspaceId,
      webhookEventId: event.eventId,
      payload: {
        workspaceId,
        customerAccountId: resolution.customerAccountId,
        triggerProvider: event.provider,
        triggerEventType: event.eventType,
        triggerEventId: event.eventId,
        scenarioId: event.scenarioId,
        occurredAt: event.occurredAt,
      },
    },
  };
}
