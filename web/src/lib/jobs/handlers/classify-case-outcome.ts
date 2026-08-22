import { SupabaseClient } from '@supabase/supabase-js';
import { JobExecutionContext, JobExecutionResult } from '../types';
import { processOutcomeEvidence } from '../../recovery/outcomes';

export async function handleClassifyCaseOutcome(
  supabase: SupabaseClient,
  context: JobExecutionContext
): Promise<JobExecutionResult> {
  const payload = context.job.payload;
  const workspaceId = context.workspaceId || payload.workspaceId;
  const customerAccountId = payload.customerAccountId;

  if (!workspaceId || !customerAccountId) {
    throw new Error('classify_case_outcome requires workspaceId and customerAccountId');
  }

  await processOutcomeEvidence(supabase, {
    workspaceId,
    customerAccountId,
    evidenceProvider: payload.evidenceProvider || 'stripe',
    evidenceEventType: payload.evidenceEventType || 'invoice.paid',
    evidenceEventId: payload.evidenceEventId,
    evidenceExternalId: payload.evidenceExternalId,
    occurredAt: payload.occurredAt,
    isTestMode: payload.isTestMode,
    stripeInvoiceId: payload.stripeInvoiceId,
    stripeSubscriptionId: payload.stripeSubscriptionId,
    usageRebound: payload.usageRebound,
    customerReplied: payload.customerReplied,
  });

  return { success: true };
}
