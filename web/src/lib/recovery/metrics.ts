import { SupabaseClient } from '@supabase/supabase-js';
import { RecoveryMetrics } from './types';
import { RECOVERY_CONFIG } from './config';

export async function calculateRecoveryMetrics(
  supabase: SupabaseClient,
  workspaceId: string,
  options?: { testMode?: boolean }
): Promise<RecoveryMetrics> {
  const isTestMode = options?.testMode ?? RECOVERY_CONFIG.TEST_MODE;
  const observationStart = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const observationEnd = new Date().toISOString();

  // 1. Query all recovery cases in workspace
  const { data: cases } = await supabase
    .from('recovery_cases')
    .select('id, status, resolution, mrr_baseline_cents, created_at')
    .eq('workspace_id', workspaceId);

  // 2. Query all draft outcomes in workspace
  const { data: outcomes } = await supabase
    .from('draft_outcomes')
    .select('recovery_case_id, outcome_type, strict_recovered_cents, protected_cents')
    .eq('workspace_id', workspaceId);

  let strictRecoveredCents = 0;
  let protectedCents = 0;
  let atRiskCents = 0;
  let engagedCases = 0;
  let productRecoveredCases = 0;
  let churnedCases = 0;
  let pendingCases = 0;
  let unknownCases = 0;

  const seenOutcomeCases = new Set<string>();

  if (outcomes) {
    for (const outcome of outcomes) {
      if (outcome.recovery_case_id && !seenOutcomeCases.has(outcome.recovery_case_id)) {
        seenOutcomeCases.add(outcome.recovery_case_id);
        strictRecoveredCents += outcome.strict_recovered_cents || 0;
        protectedCents += outcome.protected_cents || 0;
      }
    }
  }

  if (cases) {
    for (const c of cases) {
      if (['open', 'analyzing', 'action_proposed', 'awaiting_approval', 'approved', 'sent', 'monitoring'].includes(c.status)) {
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
