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

  // Check if account still exists (handles purged / deleted legacy test accounts cleanly)
  const { data: accountExists } = await supabase
    .from('customer_accounts')
    .select('id')
    .eq('id', customerAccountId)
    .maybeSingle();

  if (!accountExists) {
    return {
      success: true,
      workspaceId,
      result: { skipped: true, reason: 'Customer account no longer exists' },
    };
  }

  // §40.9: Use the typed patch from provider projection (not an absent default)
  const patch = { ...(payload.patch || {}) };
  const evidence = payload.evidence || [];
  const outcomeCandidate = payload.outcomeCandidate || null;
  const scenarioRunId = context.job.scenarioRunId || payload.scenarioRunId || null;

  // Failed-payment counts are invoice-event facts, never an inference from a
  // subscription status. Recompute the bounded windows from the durable event
  // log so retries and duplicate delivery cannot inflate the count.
  if (payload.triggerProvider === 'stripe') {
    const now = Date.now();
    const [last7Days, last30Days] = await Promise.all([
      countFailedPaymentEvents(supabase, workspaceId, customerAccountId, new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString()),
      countFailedPaymentEvents(supabase, workspaceId, customerAccountId, new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString()),
    ]);
    patch.failedPaymentCount7d = last7Days;
    patch.failedPaymentCount30d = last30Days;
  }

  // 1. Project features with the real provider patch
  const { features, materialChange, currentHash } = await projectAccountFeatures(supabase, {
    workspaceId,
    customerAccountId,
    patch,
    scenarioRunId,
  });

  // Outcome evidence takes the direct project → classify path. It must not
  // create a second general-risk case before attribution resolves the existing
  // compatible case.
  if (outcomeCandidate) {
    return {
      success: true,
      workspaceId,
      nextJob: {
        jobType: 'classify_case_outcome',
        idempotencyKey: `ws:${workspaceId}:account:${customerAccountId}:outcome:${outcomeCandidate.kind}:${payload.triggerEventId || currentHash.slice(0, 16)}`,
        workspaceId,
        webhookEventId: payload.triggerEventId,
        payload: {
          workspaceId,
          customerAccountId,
          evidenceProvider: payload.triggerProvider,
          evidenceEventType: payload.triggerEventType,
          evidenceEventId: payload.triggerEventId || null,
          evidenceExternalId: payload.providerEventId || null,
          occurredAt: payload.occurredAt,
          isTestMode: payload.isTestMode === true,
          stripeInvoiceId: outcomeCandidate.invoiceId || features.lastInvoiceId,
          stripeSubscriptionId: outcomeCandidate.subscriptionId || features.stripeSubscriptionId,
          gmailThreadId: features.gmailThreadId,
          usageRebound: outcomeCandidate.kind === 'usage_rebound',
          customerReplied: outcomeCandidate.kind === 'customer_reply',
        },
      },
    };
  }

  // §40.9: Only enqueue evaluation when:
  // - material feature change, OR
  // - hard event (payment failure, subscription cancellation), OR
  // - outcome candidate (invoice paid, cancellation reversed)
  const isHardEvent = [
    'invoice.payment_failed',
    'customer.subscription.deleted',
    'customer.subscription.updated',
  ].includes(payload.triggerEventType || '');

  const shouldEvaluate = materialChange || isHardEvent;

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
        scenarioRunId,
        occurredAt: payload.occurredAt,
        evidence,
        mrrBaselineCents: selectMrrBaseline(features, patch, payload.mrrBaselineCents),
        identityConfidence: payload.identityConfidence,
        isTestMode: payload.isTestMode === true,
      },
    },
  };
}

async function countFailedPaymentEvents(
  supabase: SupabaseClient,
  workspaceId: string,
  customerAccountId: string,
  since: string
): Promise<number> {
  const { count, error } = await supabase
    .from('webhook_events')
    .select('id', { count: 'exact', head: true })
    .eq('workspace_id', workspaceId)
    .eq('provider', 'stripe')
    .eq('event_type', 'invoice.payment_failed')
    .eq('customer_account_id', customerAccountId)
    .gte('occurred_at', since)

  if (error) throw new Error(`Failed to count payment failures: ${error.message}`)
  return count ?? 0
}

function selectMrrBaseline(
  features: { currentMrrCents: number | null; preCancelMrrCents: number | null },
  patch: Record<string, unknown>,
  eventBaseline: unknown
) {
  const isCancellation = patch.currentMrrCents === 0 && typeof patch.preCancelMrrCents === 'number'
  if (isCancellation) return patch.preCancelMrrCents as number
  if (typeof eventBaseline === 'number' && eventBaseline >= 0) return eventBaseline
  return features.currentMrrCents ?? features.preCancelMrrCents ?? 0
}
