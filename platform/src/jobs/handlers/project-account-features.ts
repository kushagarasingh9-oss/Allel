/**
 * Project Account Features — Durable worker job handler
 *
 * §40.9: Uses the typed ProviderFeatureProjection patch from the provider event.
 * Only enqueues evaluation when material change or hard-event/outcome candidate.
 */

import { SupabaseClient } from '@supabase/supabase-js';
import { JobExecutionContext, JobExecutionResult } from '@/jobs/types';
import { projectAccountFeatures } from '@/recovery/features';

export async function handleProjectAccountFeatures(
  supabase: SupabaseClient,
  context: JobExecutionContext
): Promise<JobExecutionResult> {
  const payload = context.job.payload;
  const workspaceId = context.workspaceId || payload.workspaceId;
  const customerAccountId = payload.customerAccountId;

  if (!workspaceId || !customerAccountId) {
    throw new Error('project_account_features requires workspaceId and customerAccountId');
  }

  // §40.9: Use the typed patch from provider projection (not an absent default)
  const patch = payload.patch || {};
  const evidence = payload.evidence || [];
  const outcomeCandidate = payload.outcomeCandidate || null;

  // 1. Project features with the real provider patch
  const { features, materialChange, currentHash } = await projectAccountFeatures(supabase, {
    workspaceId,
    customerAccountId,
    patch,
  });

  // §40.9: Only enqueue evaluation when:
  // - material feature change, OR
  // - hard event (payment failure, subscription cancellation), OR
  // - outcome candidate (invoice paid, cancellation reversed)
  const isHardEvent = [
    'invoice.payment_failed',
    'customer.subscription.deleted',
    'customer.subscription.updated',
  ].includes(payload.triggerEventType || '');

  const shouldEvaluate = materialChange || isHardEvent || outcomeCandidate !== null;

  if (!shouldEvaluate) {
    return { success: true, workspaceId };
  }

  // 2. Enqueue evaluation
  const idempotencyKey = `ws:${workspaceId}:account:${customerAccountId}:eval:${currentHash.slice(0, 16)}`;

  return {
    success: true,
    workspaceId,
    nextJob: {
      jobType: 'evaluate_recovery_case',
      idempotencyKey,
      workspaceId,
      webhookEventId: payload.triggerEventId,
      payload: {
        workspaceId,
        customerAccountId,
        triggerProvider: payload.triggerProvider || 'stripe',
        triggerEventType: payload.triggerEventType || 'sync',
        triggerEventId: payload.triggerEventId,
        scenarioId: payload.scenarioId,
        occurredAt: payload.occurredAt,
        evidence,
        outcomeCandidate,
        mrrBaselineCents: features.currentMrrCents || features.preCancelMrrCents || payload.mrrBaselineCents || 0,
      },
    },
  };
}
