import { SupabaseClient } from '@supabase/supabase-js';
import { ActionDecision, CaseStatus, Provider, RecoveryCase, RiskDecision } from './types';
import { RECOVERY_CONFIG } from './config';

export function constructCaseKey(params: {
  triggerType: 'billing_failure' | 'subscription_cancel' | 'cancel_intent' | 'usage_decline' | 'compound' | 'general';
  accountId: string;
  objectId?: string | null;
  dateKey?: string;
  testMode?: boolean;
}): string {
  const date = params.dateKey || new Date().toISOString().split('T')[0];
  // Preserve existing live case keys while isolating every test-mode case
  // from them. This avoids a migration-time collision with already-open live
  // cases and still prevents test evidence from sharing a case.
  const testSuffix = params.testMode ? ':test' : '';
  switch (params.triggerType) {
    case 'billing_failure':
      return `billing_failure:${params.accountId}:${params.objectId || date}${testSuffix}`;
    case 'subscription_cancel':
      return `subscription_cancel:${params.accountId}:${params.objectId || 'sub'}:${date}${testSuffix}`;
    case 'cancel_intent':
      return `cancel_intent:${params.accountId}:${date}${testSuffix}`;
    case 'usage_decline':
      return `usage_decline:${params.accountId}:${date}${testSuffix}`;
    case 'compound':
      return `compound:${params.accountId}:${params.objectId || date}${testSuffix}`;
    default:
      return `general:${params.accountId}:${date}${testSuffix}`;
  }
}

export function resolveOutcomeWindowDays(actionType?: string | null, triggerEventType?: string | null): number {
  const action = (actionType || '').toLowerCase();
  const trigger = (triggerEventType || '').toLowerCase();

  if (action.includes('reactivation') || trigger.includes('cancelled') || trigger.includes('canceled')) {
    return RECOVERY_CONFIG.CANCELLATION_RECOVERY_WINDOW_DAYS; // 45 days
  }
  if (action.includes('cancel') || trigger.includes('cancel')) {
    return RECOVERY_CONFIG.CANCEL_INTENT_PROTECTION_WINDOW_DAYS; // 30 days
  }
  if (action.includes('usage') || trigger.includes('usage') || action.includes('feature') || trigger.includes('feature')) {
    return RECOVERY_CONFIG.USAGE_RECOVERY_WINDOW_DAYS; // 21 days
  }
  if (action.includes('gmail') || trigger.includes('gmail') || trigger.includes('communication')) {
    return RECOVERY_CONFIG.GMAIL_ENGAGEMENT_WINDOW_DAYS; // 14 days
  }
  return RECOVERY_CONFIG.INVOICE_RECOVERY_WINDOW_DAYS; // 30 days default
}

export async function openOrUpdateRecoveryCase(
  supabase: SupabaseClient,
  params: {
    workspaceId: string;
    customerAccountId: string;
    caseKey: string;
    triggerProvider: Provider;
    triggerEventType: string;
    triggerEventId?: string | null;
    scenarioId?: string | null;
    scenarioRunId?: string | null;
    riskDecision: RiskDecision;
    actionDecision: ActionDecision;
    mrrBaselineCents: number;
    evidenceItems: Array<{ id: string; domain: string; claim: string; timestamp: string }>;
    isTestMode: boolean;
  }
): Promise<{ recoveryCase: RecoveryCase; isNew: boolean }> {
  const now = new Date().toISOString();
  const windowDays = resolveOutcomeWindowDays(params.actionDecision?.actionType, params.triggerEventType);
  const outcomeDeadlineAt = new Date(Date.now() + windowDays * 24 * 60 * 60 * 1000).toISOString();

  // Check if case exists
  const { data: existing } = await supabase
    .from('recovery_cases')
    .select('*')
    .eq('workspace_id', params.workspaceId)
    .eq('case_key', params.caseKey)
    .maybeSingle();

  if (existing) {
    // Do not regress terminal or advanced states.
    const terminalStatuses: CaseStatus[] = ['resolved', 'suppressed', 'failed'];
    const advancedStatuses: CaseStatus[] = ['awaiting_approval', 'approved', 'sent', 'monitoring'];
    const existingStatus = existing.status as CaseStatus;

    // Only advance open → analyzing if the action policy warrants it;
    // never touch terminal or already-advanced states.
    const updatedStatus: CaseStatus =
      existingStatus === 'open' && params.actionDecision.allowed && params.actionDecision.requiresApproval
        ? 'analyzing'
        : existingStatus;

    const shouldUpdateStatus =
      !terminalStatuses.includes(existingStatus) &&
      !advancedStatuses.includes(existingStatus) &&
      updatedStatus !== existingStatus;

    const currentScore = existing.risk_score;
    const newScore = Math.max(currentScore, params.riskDecision.score ?? 0);

    const updatePayload: Record<string, unknown> = {
      risk_score: newScore,
      score_confidence: Math.max(Number(existing.score_confidence), params.riskDecision.confidence),
      severity: params.riskDecision.severity,
      revenue_priority: Math.max(Number(existing.revenue_priority), params.riskDecision.revenuePriority),
      action_type: params.actionDecision.actionType,
      action_reason: params.actionDecision.actionReason,
      suppression_reason: params.actionDecision.suppressionReason,
      last_signal_at: now,
      evidence_snapshot: params.evidenceItems,
      is_test_mode: params.isTestMode,
      scenario_run_id: params.scenarioRunId || existing.scenario_run_id || null,
      updated_at: now,
    };

    // Only write status if it actually changed and we are allowed to advance it.
    if (shouldUpdateStatus) {
      updatePayload.status = updatedStatus;
    }

    const { data: updated, error: updateError } = await supabase
      .from('recovery_cases')
      .update(updatePayload)
      .eq('id', existing.id)
      .select('*')
      .single();

    if (updateError || !updated) {
      throw new Error(`Failed to update recovery case: ${updateError?.message}`);
    }

    return { recoveryCase: mapDbToRecoveryCase(updated), isNew: false };
  }

  // Open new case
  const initialStatus: CaseStatus = params.actionDecision.suppressionReason ? 'suppressed' : 'open';

  const insertPayload = {
    workspace_id: params.workspaceId,
    customer_account_id: params.customerAccountId,
    case_key: params.caseKey,
    trigger_provider: params.triggerProvider,
    trigger_event_type: params.triggerEventType,
    trigger_event_id: params.triggerEventId || null,
    scenario_id: params.scenarioId || null,
    scenario_run_id: params.scenarioRunId || null,
    status: initialStatus,
    severity: params.riskDecision.severity,
    risk_score: params.riskDecision.score ?? 0,
    score_confidence: params.riskDecision.confidence,
    revenue_priority: params.riskDecision.revenuePriority,
    mrr_baseline_cents: params.mrrBaselineCents,
    currency: 'usd',
    score_version: RECOVERY_CONFIG.SCORE_VERSION,
    policy_version: RECOVERY_CONFIG.POLICY_VERSION,
    feature_version: RECOVERY_CONFIG.FEATURE_VERSION,
    action_type: params.actionDecision.actionType,
    action_reason: params.actionDecision.actionReason,
    suppression_reason: params.actionDecision.suppressionReason,
    root_cause_summary: null,
    evidence_snapshot: params.evidenceItems,
    opened_at: now,
    last_signal_at: now,
    outcome_deadline_at: outcomeDeadlineAt,
    created_at: now,
    updated_at: now,
  };

  const { data: created, error: insertError } = await supabase
    .from('recovery_cases')
    .insert(insertPayload)
    .select('*')
    .single();

  if (insertError || !created) {
    throw new Error(`Failed to create recovery case: ${insertError?.message}`);
  }

  // Record case_opened event
  await supabase.from('recovery_case_events').insert({
    workspace_id: params.workspaceId,
    recovery_case_id: created.id,
    event_type: 'case_opened',
    from_status: null,
    to_status: initialStatus,
    actor_type: 'system',
    actor_id: 'decision_engine',
    source_provider: params.triggerProvider,
    detail: {
      caseKey: params.caseKey,
      riskScore: params.riskDecision.score,
      severity: params.riskDecision.severity,
      actionType: params.actionDecision.actionType,
    },
  });

  return { recoveryCase: mapDbToRecoveryCase(created), isNew: true };
}

export function mapDbToRecoveryCase(row: Record<string, any>): RecoveryCase {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    customerAccountId: row.customer_account_id,
    caseKey: row.case_key,
    triggerProvider: row.trigger_provider,
    triggerEventType: row.trigger_event_type,
    triggerEventId: row.trigger_event_id,
    scenarioId: row.scenario_id,
    scenarioRunId: row.scenario_run_id || null,
    status: row.status,
    resolution: row.resolution,
    severity: row.severity,
    riskScore: row.risk_score,
    scoreConfidence: Number(row.score_confidence),
    revenuePriority: Number(row.revenue_priority),
    mrrBaselineCents: row.mrr_baseline_cents,
    currency: row.currency || 'usd',
    scoreVersion: row.score_version,
    policyVersion: row.policy_version,
    featureVersion: row.feature_version,
    actionType: row.action_type,
    actionReason: row.action_reason,
    suppressionReason: row.suppression_reason,
    rootCauseSummary: row.root_cause_summary,
    evidenceSnapshot: row.evidence_snapshot || [],
    openedAt: row.opened_at,
    lastSignalAt: row.last_signal_at,
    awaitingApprovalAt: row.awaiting_approval_at,
    approvedAt: row.approved_at,
    sentAt: row.sent_at,
    monitoringStartedAt: row.monitoring_started_at,
    resolvedAt: row.resolved_at,
    outcomeDeadlineAt: row.outcome_deadline_at,
    failedAt: row.failed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
