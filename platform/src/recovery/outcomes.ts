import { SupabaseClient } from '@supabase/supabase-js';
import { CaseResolution, Provider, RecoveryCase } from './types';
import { transitionRecoveryCase } from './transitions';
import { mapDbToRecoveryCase } from './cases';
import { RECOVERY_CONFIG } from './config';

/**
 * §40.19: Deterministic outcome attribution.
 *
 * Attribution gates (all must pass for strict/protected resolution):
 *  G1. Evidence occurred after case opened_at.
 *  G2. Evidence occurred before outcome_deadline_at (attribution window).
 *  G3. Test-mode isolation — evidence must match case is_test_mode.
 *  G4. Invoice ID match — invoice.paid must match the case trigger invoice
 *      or the same subscription (prevents unrelated invoices closing billing cases).
 *  G5. Trigger-type compatibility — invoice.paid only resolves billing cases;
 *      subscription.updated only resolves cancellation cases.
 */
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
    gmailThreadId?: string | null;
    usageRebound?: boolean;
    customerReplied?: boolean;
  }
): Promise<{ resolvedCase: RecoveryCase | null; outcomeType: CaseResolution | null; recoveredCents: number; protectedCents: number }> {
  const now = new Date().toISOString();
  const occurredAt = params.occurredAt || now;
  const isTestMode = params.isTestMode ?? RECOVERY_CONFIG.TEST_MODE;

  // 1. Find all open/monitoring cases for this account
  const { data: openCases, error: openCasesError } = await supabase
    .from('recovery_cases')
    .select('*')
    .eq('workspace_id', params.workspaceId)
    .eq('customer_account_id', params.customerAccountId)
    .in('status', ['open', 'analyzing', 'action_proposed', 'awaiting_approval', 'approved', 'sent', 'monitoring'])
    .order('opened_at', { ascending: false });

  if (openCasesError) {
    throw new Error(`Failed to query open recovery cases: ${openCasesError.message}`);
  }

  if (!openCases || openCases.length === 0) {
    return { resolvedCase: null, outcomeType: null, recoveredCents: 0, protectedCents: 0 };
  }

  // Pre-attribution deduplication check: avoid re-processing claimed evidence
  if (params.evidenceEventId) {
    const { data: existingByEvent } = await supabase
      .from('draft_outcomes')
      .select('id')
      .eq('workspace_id', params.workspaceId)
      .eq('evidence_event_id', params.evidenceEventId)
      .maybeSingle();
    if (existingByEvent) {
      return { resolvedCase: null, outcomeType: null, recoveredCents: 0, protectedCents: 0 };
    }
  }
  if (params.evidenceExternalId && params.evidenceProvider) {
    const { data: existingByExt } = await supabase
      .from('draft_outcomes')
      .select('id')
      .eq('workspace_id', params.workspaceId)
      .eq('evidence_provider', params.evidenceProvider)
      .eq('evidence_external_id', params.evidenceExternalId)
      .maybeSingle();
    if (existingByExt) {
      return { resolvedCase: null, outcomeType: null, recoveredCents: 0, protectedCents: 0 };
    }
  }

  // 2. Find the best matching case (apply attribution gates)
  const exactThreadCaseIds = params.customerReplied
    ? await findCasesBoundToGmailThread(supabase, params.workspaceId, params.gmailThreadId)
    : [];
  const candidateCases = exactThreadCaseIds.length > 0
    ? openCases.filter((candidate) => exactThreadCaseIds.includes(candidate.id))
    : openCases;
  const activeCaseRow = findBestAttributionCase(candidateCases, params, occurredAt, isTestMode);
  if (!activeCaseRow) {
    return { resolvedCase: null, outcomeType: null, recoveredCents: 0, protectedCents: 0 };
  }
  const activeCase = mapDbToRecoveryCase(activeCaseRow);
  const mrrBaseline: number = typeof activeCaseRow.mrr_baseline_cents === 'number' ? activeCaseRow.mrr_baseline_cents : 0;
  const caseStatus: string = typeof activeCaseRow.status === 'string' ? activeCaseRow.status : '';
  const triggerEventType: string = typeof activeCaseRow.trigger_event_type === 'string' ? activeCaseRow.trigger_event_type : '';
  const actionType: string = typeof activeCaseRow.action_type === 'string' ? activeCaseRow.action_type : '';

  let outcomeType: CaseResolution | null = null;
  let strictRecoveredCents = 0;
  let protectedCents = 0;

  // 3. Classify evidence type → outcome
  if (params.evidenceProvider === 'stripe' && params.evidenceEventType === 'invoice.paid') {
    // G5: Only resolves billing-trigger cases (not usage-only or cancel-intent-only cases)
    const isBillingCase = ['billing_failure', 'billing_recovery_email', 'compound'].some(t =>
      triggerEventType.includes(t) ||
      actionType.includes('billing') ||
      actionType.includes('compound')
    );
    if (isBillingCase) {
      outcomeType = 'strictly_recovered';
      strictRecoveredCents = mrrBaseline;
    }
  } else if (params.evidenceProvider === 'stripe' && params.evidenceEventType === 'customer.subscription.updated') {
    // Protected: cancel intent or cancel_at_period_end was reversed before billing was lost
    const isCancellationCase = triggerEventType.includes('cancel') ||
      actionType.includes('cancellation');
    if (isCancellationCase) {
      outcomeType = 'protected';
      protectedCents = mrrBaseline;
    }
  } else if (params.usageRebound) {
    outcomeType = 'product_recovered';
  } else if (params.customerReplied) {
    outcomeType = 'engaged';
  }

  if (!outcomeType) {
    return { resolvedCase: null, outcomeType: null, recoveredCents: 0, protectedCents: 0 };
  }

  // 4. Find draft ID if available
  const { data: draftRow } = await supabase
    .from('follow_up_drafts')
    .select('id')
    .eq('workspace_id', params.workspaceId)
    .eq('customer_account_id', params.customerAccountId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  // Map to legacy outcome classification column
  const outcomeEnum =
    outcomeType === 'strictly_recovered' || outcomeType === 'product_recovered'
      ? 'recovered'
      : outcomeType === 'engaged'
        ? 'responded'
        : 'unknown';

  // Record in draft_outcomes table
  const { error: insertError } = await supabase.from('draft_outcomes').insert({
    workspace_id: params.workspaceId,
    customer_account_id: params.customerAccountId,
    draft_id: draftRow?.id ?? null,
    recovery_case_id: activeCase.id,
    outcome: outcomeEnum,
    outcome_type: outcomeType,
    evidence_provider: params.evidenceProvider,
    evidence_event_id: params.evidenceEventId || null,
    evidence_external_id: params.evidenceExternalId || null,
    occurred_at: occurredAt,
    attribution_rule: 'deterministic_case_match_v2',
    attribution_version: RECOVERY_CONFIG.ATTRIBUTION_VERSION,
    mrr_baseline_cents: mrrBaseline,
    scenario_run_id: activeCaseRow.scenario_run_id || null,
    strict_recovered_cents: strictRecoveredCents,
    protected_cents: protectedCents,
    is_test_mode: isTestMode,
  });

  if (insertError) {
    // Unique violation = already attributed; do not double-count
    if (insertError.code === '23505') {
      return { resolvedCase: null, outcomeType: null, recoveredCents: 0, protectedCents: 0 };
    }
    throw new Error(`Failed to insert draft_outcome: ${insertError.message}`);
  }

  // 5. Transition case if terminal resolution
  let updatedCase: RecoveryCase = activeCase;
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
        evidenceExternalId: params.evidenceExternalId,
        attributionRule: 'deterministic_case_match_v2',
      },
    });
  } else {
    // Non-terminal: append outcome evidence event without closing case
    await supabase.from('recovery_case_events').insert({
      workspace_id: params.workspaceId,
      recovery_case_id: activeCase.id,
      event_type: params.customerReplied ? 'reply_observed' : 'usage_recovered',
      from_status: caseStatus,
      to_status: caseStatus,
      actor_type: 'provider',
      actor_id: params.evidenceProvider,
      detail: {
        outcomeType,
        evidenceEventType: params.evidenceEventType,
        evidenceExternalId: params.evidenceExternalId ?? null,
        gmailThreadId: params.gmailThreadId ?? null,
      },
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

async function findCasesBoundToGmailThread(
  supabase: SupabaseClient,
  workspaceId: string,
  gmailThreadId: string | null | undefined
): Promise<string[]> {
  if (!gmailThreadId) return [];

  const { data, error } = await supabase
    .from('follow_up_drafts')
    .select('recovery_case_id')
    .eq('workspace_id', workspaceId)
    .eq('provider_thread_id', gmailThreadId)
    .not('recovery_case_id', 'is', null);

  if (error) throw new Error(`Failed to resolve Gmail thread attribution: ${error.message}`);
  return Array.from(new Set((data ?? [])
    .map((row) => row.recovery_case_id)
    .filter((id): id is string => typeof id === 'string')));
}

/**
 * §40.19.7: Attribution-gate case selection.
 *
 * Applies all gates and returns the best matching case or null.
 * Priority: exact provider-object match > most recent compatible open case.
 */
function findBestAttributionCase(
  cases: Record<string, unknown>[],
  params: {
    evidenceEventType: string;
    stripeInvoiceId?: string | null;
    stripeSubscriptionId?: string | null;
    isTestMode?: boolean;
  },
  occurredAt: string,
  isTestMode: boolean
): Record<string, unknown> | null {
  const occurredAtMs = new Date(occurredAt).getTime();

  for (const c of cases) {
    // G3: Test-mode isolation
    // If the case has is_test_mode set, it must match the evidence test mode
    if (typeof c.is_test_mode === 'boolean' && c.is_test_mode !== isTestMode) {
      continue;
    }

    // G1: Evidence must have occurred after the case was opened
    const openedAtMs = new Date(c.opened_at as string).getTime();
    if (occurredAtMs <= openedAtMs) {
      continue;
    }

    // G2: Attribution window — evidence must arrive before outcome_deadline_at
    if (c.outcome_deadline_at) {
      const deadlineMs = new Date(c.outcome_deadline_at as string).getTime();
      if (occurredAtMs > deadlineMs) {
        continue; // outside attribution window
      }
    }

    // G4: Invoice ID match for invoice.paid events
    if (params.evidenceEventType === 'invoice.paid') {
      const evidenceSnapshot = (c.evidence_snapshot as unknown[]) || [];
      const hasInvoiceMatch = checkInvoiceMatch(
        evidenceSnapshot,
        params.stripeInvoiceId,
        params.stripeSubscriptionId,
        c
      );
      if (!hasInvoiceMatch) {
        continue; // unrelated invoice must not close this billing case
      }
    }

    // G5: Trigger compatibility
    const triggerEventType: string = typeof c.trigger_event_type === 'string' ? c.trigger_event_type : '';
    const actionType: string = typeof c.action_type === 'string' ? c.action_type : '';

    if (params.evidenceEventType === 'invoice.paid') {
      const isBillingCase = ['billing_failure', 'billing_recovery_email', 'compound'].some(t =>
        triggerEventType.includes(t) ||
        actionType.includes('billing') ||
        actionType.includes('compound')
      );
      if (!isBillingCase) {
        continue; // skip incompatible case so older compatible billing cases are inspected
      }
    } else if (params.evidenceEventType === 'customer.subscription.updated') {
      const isCancellationCase = triggerEventType.includes('cancel') || actionType.includes('cancellation');
      if (!isCancellationCase) {
        continue;
      }
    }

    return c; // first passing case wins (cases are ordered by opened_at desc)
  }

  return null;
}

/**
 * §40.19.4: Invoice attribution verification.
 *
 * invoice.paid closes a billing case only when the paid invoice relates to the case:
 *  - the evidence_snapshot contains a matching invoice or subscription ID, OR
 *  - the case trigger event explicitly references the same invoice ID, OR
 *  - the case trigger references the same subscription ID (catches later invoices on same sub).
 */
function checkInvoiceMatch(
  evidenceSnapshot: unknown[],
  stripeInvoiceId: string | null | undefined,
  stripeSubscriptionId: string | null | undefined,
  caseRow: Record<string, unknown>
): boolean {
  if (!stripeInvoiceId && !stripeSubscriptionId) {
    // No evidence to match against — do not attribute
    return false;
  }

  // Check evidence_snapshot for explicit ID references
  for (const item of evidenceSnapshot) {
    const ev = item as Record<string, unknown>;
    if (stripeInvoiceId && (ev.id === stripeInvoiceId || ev.invoiceId === stripeInvoiceId)) {
      return true;
    }
    if (stripeSubscriptionId && (ev.id === stripeSubscriptionId || ev.subscriptionId === stripeSubscriptionId)) {
      return true;
    }
  }

  // Check case key (billing_failure:{account}:{invoice_id} or subscription form)
  const caseKey = (caseRow.case_key as string) || '';
  if (stripeInvoiceId && caseKey.includes(stripeInvoiceId)) return true;
  if (stripeSubscriptionId && caseKey.includes(stripeSubscriptionId)) return true;

  // If case has no verifiable link — do not assume this invoice closes it
  return false;
}
