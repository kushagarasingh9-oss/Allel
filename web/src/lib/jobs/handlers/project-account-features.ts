import { SupabaseClient } from '@supabase/supabase-js';
import { JobExecutionContext, JobExecutionResult } from '../types';
import { projectAccountFeatures } from '../../recovery/features';

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

  // 1. Project features
  const { features, materialChange, currentHash } = await projectAccountFeatures(supabase, {
    workspaceId,
    customerAccountId,
    patch: payload.patch,
  });

  // 2. If material change or explicit trigger, enqueue evaluation
  const idempotencyKey = `ws:${workspaceId}:account:${customerAccountId}:eval:${currentHash.slice(0, 16)}`;

  return {
    success: true,
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
        mrrBaselineCents: features.currentMrrCents || features.preCancelMrrCents || 0,
      },
    },
  };
}
