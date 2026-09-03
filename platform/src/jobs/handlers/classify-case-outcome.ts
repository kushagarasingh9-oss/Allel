import { SupabaseClient } from '@supabase/supabase-js';
import { JobExecutionContext, JobExecutionResult } from '@/jobs/types';
import { processOutcomeEvidence } from '@/recovery/outcomes';
import { transitionRecoveryCase } from '@/recovery/transitions';
import { CaseResolution } from '@/recovery/types';

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

  // Dedicated handler for deadline_expired trigger
  if (payload.trigger === 'deadline_expired') {
    const caseId = payload.recoveryCaseId;
    if (!caseId) {
      return { success: true };
    }

    const { data: recoveryCase } = await supabase
      .from('recovery_cases')
      .select('*')
      .eq('workspace_id', workspaceId)
      .eq('id', caseId)
      .maybeSingle();

    if (!recoveryCase) {
      return { success: true };
    }

    // Terminal states do not regress
    if (['resolved', 'suppressed', 'failed'].includes(recoveryCase.status)) {
      return { success: true };
    }

    // Check account status to decide between churned vs expired_unknown
    const { data: account } = await supabase
      .from('customer_accounts')
      .select('account_status, risk_level')
      .eq('workspace_id', workspaceId)
      .eq('id', customerAccountId)
      .maybeSingle();

    const isChurned = account?.account_status === 'cancelled' || account?.account_status === 'past_due';
    const resolution: CaseResolution = isChurned ? 'churned' : 'expired_unknown';

    await transitionRecoveryCase(supabase, {
      workspaceId,
      caseId,
      targetStatus: 'resolved',
      resolution,
      actorType: 'system',
      actorId: 'deadline_reconciliation',
      eventType: 'case_resolved',
      detail: {
        reason: 'deadline_expired',
        accountStatus: account?.account_status,
      },
    });

    await supabase.from('draft_outcomes').insert({
      workspace_id: workspaceId,
      customer_account_id: customerAccountId,
      recovery_case_id: caseId,
      outcome: resolution === 'churned' ? 'churned' : 'unknown',
      outcome_type: resolution,
      evidence_provider: 'system',
      occurred_at: payload.occurredAt || new Date().toISOString(),
      attribution_rule: 'deadline_expiry_v1',
      attribution_version: 1,
      mrr_baseline_cents: recoveryCase.mrr_baseline_cents || 0,
      strict_recovered_cents: 0,
      protected_cents: 0,
      is_test_mode: payload.isTestMode ?? false,
    });

    return { success: true };
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
    gmailThreadId: payload.gmailThreadId,
    usageRebound: payload.usageRebound,
    customerReplied: payload.customerReplied,
  });

  return { success: true };
}
