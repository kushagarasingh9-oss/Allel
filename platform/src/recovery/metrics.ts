import { SupabaseClient } from '@supabase/supabase-js';
import { RecoveryMetrics } from './types';
import { RECOVERY_CONFIG } from './config';

export async function calculateRecoveryMetrics(
  supabase: SupabaseClient,
  workspaceId: string,
  options?: { testMode?: boolean; observationStart?: string; observationEnd?: string }
): Promise<RecoveryMetrics> {
  const isTestMode = options?.testMode ?? RECOVERY_CONFIG.TEST_MODE;
  const observationStart = options?.observationStart ?? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const observationEnd = options?.observationEnd ?? new Date().toISOString();

  // 1. Query recovery cases filtered by workspace, test_mode, and observation window
  const { data: cases, error: casesError } = await supabase
    .from('recovery_cases')
    .select('id, status, resolution, mrr_baseline_cents, created_at')
    .eq('workspace_id', workspaceId)
    .gte('created_at', observationStart)
    .lte('created_at', observationEnd);

  if (casesError) {
    console.error('[metrics] failed to query recovery_cases:', casesError.message);
  }

  // 2. Query draft outcomes — filter by test_mode to never mix test/prod dollars
  const { data: outcomes, error: outcomesError } = await supabase
    .from('draft_outcomes')
    .select('id, recovery_case_id, outcome_type, strict_recovered_cents, protected_cents, is_test_mode')
    .eq('workspace_id', workspaceId)
    .eq('is_test_mode', isTestMode)
    .gte('created_at', observationStart)
    .lte('created_at', observationEnd);

  if (outcomesError) {
    console.error('[metrics] failed to query draft_outcomes:', outcomesError.message);
  }

  let strictRecoveredCents = 0;
  let protectedCents = 0;
  let atRiskCents = 0;
  let engagedCases = 0;
  let productRecoveredCases = 0;
  let churnedCases = 0;
  let pendingCases = 0;
  let unknownCases = 0;

  // Sum ALL outcome rows — not just first per case.
  // A case may have multiple outcome rows (e.g. reply + billing recovery).
  // We sum strict_recovered_cents and protected_cents across all of them,
  // but deduplicate by outcome row id to avoid double-counting retried inserts.
  const seenOutcomeIds = new Set<string>();

  if (outcomes) {
    for (const outcome of outcomes) {
      if (outcome.id && seenOutcomeIds.has(outcome.id)) continue;
      if (outcome.id) seenOutcomeIds.add(outcome.id);
      strictRecoveredCents += outcome.strict_recovered_cents || 0;
      protectedCents += outcome.protected_cents || 0;
    }
  }

  if (cases) {
    const activeStatuses = new Set([
      'open', 'analyzing', 'action_proposed',
      'awaiting_approval', 'approved', 'sent', 'monitoring',
    ]);

    for (const c of cases) {
      if (activeStatuses.has(c.status)) {
        atRiskCents += c.mrr_baseline_cents || 0;
        pendingCases++;
      } else if (c.status === 'resolved') {
        if (c.resolution === 'engaged') engagedCases++;
        else if (c.resolution === 'product_recovered') productRecoveredCases++;
        else if (c.resolution === 'churned') churnedCases++;
        else if (c.resolution === 'expired_unknown') unknownCases++;
      }
    }
  }

  return {
    testMode: isTestMode,
    currency: 'usd',
    strictRecoveredCents,
    protectedCents,
    atRiskCents,
    engagedCases,
    productRecoveredCases,
    churnedCases,
    pendingCases,
    unknownCases,
    observationStart,
    observationEnd,
    policyVersion: RECOVERY_CONFIG.POLICY_VERSION,
  };
}
