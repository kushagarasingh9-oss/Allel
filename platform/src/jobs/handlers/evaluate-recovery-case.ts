import { SupabaseClient } from '@supabase/supabase-js';
import { JobExecutionContext, JobExecutionResult } from '@/jobs/types';
import { computeRiskDecision } from '@/recovery/scoring';
import { evaluateActionPolicy } from '@/recovery/policy';
import { constructCaseKey, openOrUpdateRecoveryCase } from '@/recovery/cases';
import { mapDbToAccountFeatures, AccountFeaturesDbRow } from '@/recovery/features';

export async function handleEvaluateRecoveryCase(
  supabase: SupabaseClient,
  context: JobExecutionContext
): Promise<JobExecutionResult> {
  const payload = context.job.payload;
  const workspaceId = context.workspaceId || payload.workspaceId;
  const customerAccountId = payload.customerAccountId;

  if (!workspaceId || !customerAccountId) {
    throw new Error('evaluate_recovery_case requires workspaceId and customerAccountId');
  }

  // 1. Fetch account features
  const { data: featureRow, error: featureError } = await supabase
    .from('account_features')
    .select('*')
    .eq('workspace_id', workspaceId)
    .eq('customer_account_id', customerAccountId)
    .single();

  if (featureError || !featureRow) {
    throw new Error(`Features not found for account ${customerAccountId}: ${featureError?.message}`);
  }

  // §40.5.4: Use explicit mapper — no `as unknown as`
  const features = mapDbToAccountFeatures(featureRow as AccountFeaturesDbRow);
  const mrrBaselineCents = payload.mrrBaselineCents || features.currentMrrCents || features.preCancelMrrCents || 0;

  // 2. Fetch contact policy if any
  const { data: policyRow } = await supabase
    .from('contact_policies')
    .select('*')
    .eq('workspace_id', workspaceId)
    .eq('customer_account_id', customerAccountId)
    .maybeSingle();

  // §40.10: Use identity confidence from payload (set by process-provider-event).
  // Never hard-code 1.0 — a hard-coded perfect confidence bypasses the low-confidence
  // founder-review gate in evaluateActionPolicy.
  const identityConfidence: number =
    typeof payload.identityConfidence === 'number'
      ? Math.max(0, Math.min(1, payload.identityConfidence))
      : 0.95; // conservative default when caller does not supply confidence

  // 3. Compute deterministic risk decision & action policy
  const riskDecision = computeRiskDecision(features, identityConfidence, mrrBaselineCents);
  const actionDecision = evaluateActionPolicy({
    riskDecision,
    identityConfidence,
    contactPolicy: policyRow,
  });

  // 4. Update customer_accounts table with new risk score and level
  const { error: accountUpdateError } = await supabase
    .from('customer_accounts')
    .update({
      risk_score: riskDecision.score,
      risk_level: riskDecision.severity,
      mrr_cents: features.currentMrrCents ?? 0,
      usage_delta_percent: features.usageDeltaPercent,
      updated_at: new Date().toISOString(),
    })
    .eq('id', customerAccountId);

  if (accountUpdateError) {
    throw new Error(`Failed to update customer account: ${accountUpdateError.message}`);
  }

  // 5. Construct case key and open/update case
  let triggerType: 'billing_failure' | 'subscription_cancel' | 'cancel_intent' | 'usage_decline' | 'compound' | 'general' = 'general';
  if (riskDecision.hardOverrides.includes('compound_billing_and_usage_risk')) {
    triggerType = 'compound';
  } else if (features.cancelledAt || features.cancelAtPeriodEnd) {
    triggerType = 'subscription_cancel';
  } else if (features.cancelIntentAt) {
    triggerType = 'cancel_intent';
  } else if (features.failedPaymentCount7d > 0 || features.failedPaymentCount30d > 0) {
    triggerType = 'billing_failure';
  } else if (features.usageDeltaPercent != null && features.usageDeltaPercent <= -20) {
    triggerType = 'usage_decline';
  }

  const caseKey = constructCaseKey({
    triggerType,
    accountId: customerAccountId,
    objectId: features.lastInvoiceId || features.stripeSubscriptionId,
  });

  const evidenceItems = [
    ...riskDecision.components.billing.evidenceIds.map((e) => ({
      id: e,
      domain: 'billing',
      claim: `Billing fact: ${e}`,
      timestamp: new Date().toISOString(),
    })),
    ...riskDecision.components.usage.evidenceIds.map((e) => ({
      id: e,
      domain: 'usage',
      claim: `Usage fact: ${e}`,
      timestamp: new Date().toISOString(),
    })),
  ];

  const { recoveryCase } = await openOrUpdateRecoveryCase(supabase, {
    workspaceId,
    customerAccountId,
    caseKey,
    triggerProvider: payload.triggerProvider || 'stripe',
    triggerEventType: payload.triggerEventType || 'evaluation',
    triggerEventId: payload.triggerEventId,
    scenarioId: payload.scenarioId,
    riskDecision,
    actionDecision,
    mrrBaselineCents,
    evidenceItems,
  });

  // §40.10: Record score snapshot with provider evidence IDs, component outputs, rule IDs
  const { error: snapshotError } = await supabase.from('score_snapshots').insert({
    workspace_id: workspaceId,
    customer_account_id: customerAccountId,
    recovery_case_id: recoveryCase.id,
    score: riskDecision.score,
    score_confidence: riskDecision.confidence,
    severity: riskDecision.severity,
    revenue_priority: riskDecision.revenuePriority,
    features: features as any,
    available_domains: riskDecision.availableDomains,
    hard_overrides: riskDecision.hardOverrides,
    score_version: riskDecision.scoreVersion,
    policy_version: actionDecision.policyVersion,
    trigger_event_id: payload.triggerEventId || null,
  });

  if (snapshotError) {
    // §40.10 invariant: a failed score snapshot blocks dependent workflow stages.
    // Logging and continuing would allow a case to proceed without durable scoring evidence.
    throw new Error(`Failed to insert score snapshot: ${snapshotError.message}`);
  }

  // §40.C6: Check whether this event is an outcome candidate.
  // If so, dispatch classify_case_outcome instead of (or in addition to) analysis.
  const outcomeEventTypes = new Set([
    'invoice.paid',
    'cancellation_reversed',
    'subscription.updated', // may indicate reversal
    'customer_reply',
    'usage_rebound',
  ]);

  const isOutcomeCandidate =
    payload.triggerEventType && outcomeEventTypes.has(payload.triggerEventType);

  if (isOutcomeCandidate && recoveryCase) {
    const outcomeIdempotencyKey =
      `ws:${workspaceId}:account:${customerAccountId}:outcome:${payload.triggerEventType}:${payload.triggerEventId || 'noid'}`;

    return {
      success: true,
      nextJob: {
        jobType: 'classify_case_outcome',
        idempotencyKey: outcomeIdempotencyKey,
        workspaceId,
        recoveryCaseId: recoveryCase.id,
        payload: {
          workspaceId,
          customerAccountId,
          recoveryCaseId: recoveryCase.id,
          evidenceProvider: payload.triggerProvider || 'stripe',
          evidenceEventType: payload.triggerEventType,
          evidenceEventId: payload.triggerEventId || null,
          occurredAt: payload.occurredAt || new Date().toISOString(),
          isTestMode: payload.isTestMode ?? false,
          stripeInvoiceId: payload.stripeInvoiceId || null,
          stripeSubscriptionId: payload.stripeSubscriptionId || null,
        },
      },
    };
  }

  // 6. If action requires draft and is allowed, enqueue analysis
  if (
    actionDecision.allowed &&
    actionDecision.requiresApproval &&
    ['billing_recovery_email', 'cancellation_rescue_email', 'usage_checkin_email', 'compound_recovery_email'].includes(actionDecision.actionType)
  ) {
    const analysisIdempotencyKey = `ws:${workspaceId}:case:${recoveryCase.id}:analyze:v1`;
    return {
      success: true,
      nextJob: {
        jobType: 'run_case_analysis',
        idempotencyKey: analysisIdempotencyKey,
        workspaceId,
        recoveryCaseId: recoveryCase.id,
        payload: {
          workspaceId,
          recoveryCaseId: recoveryCase.id,
          customerAccountId,
          actionType: actionDecision.actionType,
          evidenceItems,
          mrrBaselineCents,
        },
      },
    };
  }

  return { success: true };
}
