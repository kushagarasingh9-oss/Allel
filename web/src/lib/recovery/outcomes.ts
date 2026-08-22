import { SupabaseClient } from '@supabase/supabase-js';
import { CaseResolution, Provider, RecoveryCase } from './types';
import { transitionRecoveryCase } from './transitions';
import { RECOVERY_CONFIG } from './config';

export async function processOutcomeEvidence(
  supabase: SupabaseClient,
  params: {
    workspaceId: string;
    customerAccountId: string;
    evidenceProvider: Provider;
    evidenceEventType: string;
    evidenceEventId?: string | null;
    evidenceExternalId?: string | null;
    occurredAt?: string;
    isTestMode?: boolean;
    stripeInvoiceId?: string | null;
    stripeSubscriptionId?: string | null;
    usageRebound?: boolean;
    customerReplied?: boolean;
  }
): Promise<{ resolvedCase: RecoveryCase | null; outcomeType: CaseResolution | null; recoveredCents: number; protectedCents: number }> {
  const now = new Date().toISOString();
  const occurredAt = params.occurredAt || now;

  // 1. Find matching open/monitoring recovery case
  const { data: openCases } = await supabase
    .from('recovery_cases')
    .select('*')
    .eq('workspace_id', params.workspaceId)
    .eq('customer_account_id', params.customerAccountId)
    .in('status', ['open', 'analyzing', 'action_proposed', 'awaiting_approval', 'approved', 'sent', 'monitoring'])
    .order('opened_at', { ascending: false });

  if (!openCases || openCases.length === 0) {
    return { resolvedCase: null, outcomeType: null, recoveredCents: 0, protectedCents: 0 };
  }

  const activeCase = openCases[0];
  let outcomeType: CaseResolution | null = null;
  let strictRecoveredCents = 0;
  let protectedCents = 0;

  // 2. Classify evidence
  // Billing payment success -> Strict recovery
  if (params.evidenceProvider === 'stripe' && params.evidenceEventType === 'invoice.paid') {
    outcomeType = 'strictly_recovered';
    strictRecoveredCents = activeCase.mrr_baseline_cents;
  } else if (params.evidenceProvider === 'stripe' && params.evidenceEventType === 'customer.subscription.updated') {
    // If subscription was reactivated or cancel_at_period_end removed
    if (activeCase.trigger_event_type.includes('cancel')) {
      outcomeType = 'protected';
      protectedCents = activeCase.mrr_baseline_cents;
    }
  } else if (params.usageRebound) {
    outcomeType = 'product_recovered';
  } else if (params.customerReplied) {
    outcomeType = 'engaged';
  }

  if (!outcomeType) {
    return { resolvedCase: null, outcomeType: null, recoveredCents: 0, protectedCents: 0 };
  }

  // 3. Record in draft_outcomes table
  await supabase.from('draft_outcomes').insert({
    workspace_id: params.workspaceId,
    customer_account_id: params.customerAccountId,
    recovery_case_id: activeCase.id,
    outcome_type: outcomeType,
    evidence_provider: params.evidenceProvider,
    evidence_event_id: params.evidenceEventId || null,
    evidence_external_id: params.evidenceExternalId || null,
    occurred_at: occurredAt,
    attribution_rule: 'deterministic_case_match',
    attribution_version: RECOVERY_CONFIG.ATTRIBUTION_VERSION,
    mrr_baseline_cents: activeCase.mrr_baseline_cents,
    strict_recovered_cents: strictRecoveredCents,
    protected_cents: protectedCents,
    is_test_mode: params.isTestMode ?? RECOVERY_CONFIG.TEST_MODE,
  });

  // 4. Transition case if terminal (strictly_recovered or protected resolves the case)
  let updatedCase = activeCase;
  if (outcomeType === 'strictly_recovered' || outcomeType === 'protected') {
    updatedCase = await transitionRecoveryCase(supabase, {
      workspaceId: params.workspaceId,
      caseId: activeCase.id,
      targetStatus: 'resolved',
      resolution: outcomeType,
      actorType: 'system',
      actorId: 'outcome_classifier',
      eventType: outcomeType === 'strictly_recovered' ? 'billing_recovered' : 'case_resolved',
      detail: {
        strictRecoveredCents,
        protectedCents,
        evidenceEventType: params.evidenceEventType,
      },
    });
  } else {
    // Append outcome event without closing case
    await supabase.from('recovery_case_events').insert({
      workspace_id: params.workspaceId,
      recovery_case_id: activeCase.id,
      event_type: outcomeType === 'engaged' ? 'reply_observed' : 'usage_recovered',
      from_status: activeCase.status,
      to_status: activeCase.status,
      actor_type: 'provider',
      actor_id: params.evidenceProvider,
      detail: { outcomeType },
      created_at: now,
    });
  }

  return {
    resolvedCase: updatedCase,
    outcomeType,
    recoveredCents: strictRecoveredCents,
    protectedCents,
  };
}
