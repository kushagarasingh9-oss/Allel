import type { SupabaseClient } from '@supabase/supabase-js';
import { ScenarioRunError } from './runs';

type ResetCounts = Record<string, number>;

/**
 * Removes one explicit test scenario run and only rows owned by that run.
 * Workspace-wide cleanup is intentionally impossible through this function.
 */
export async function resetScenarios(
  supabase: SupabaseClient,
  input: { workspaceId: string; scenarioRunId: string; testMode: boolean }
): Promise<{ resetCount: number; counts: ResetCounts }> {
  if (input.testMode !== true) {
    throw new ScenarioRunError('Scenario reset is allowed only in explicit test mode');
  }
  if (!input.scenarioRunId) {
    throw new ScenarioRunError('Scenario reset requires a scenario run ID');
  }

  const { data: scenarioRun, error: runError } = await supabase
    .from('recovery_scenario_runs')
    .select('id, workspace_id, test_mode, status')
    .eq('id', input.scenarioRunId)
    .eq('workspace_id', input.workspaceId)
    .maybeSingle();

  if (runError) throw new ScenarioRunError(`Unable to validate scenario run: ${runError.message}`);
  if (!scenarioRun || scenarioRun.test_mode !== true) {
    throw new ScenarioRunError('Scenario run was not found in this test workspace');
  }
  if (scenarioRun.status === 'reset') {
    return { resetCount: 0, counts: {} };
  }

  const { data: caseRows, error: casesLookupError } = await supabase
    .from('recovery_cases')
    .select('id')
    .eq('workspace_id', input.workspaceId)
    .eq('scenario_run_id', input.scenarioRunId);
  if (casesLookupError) throw new ScenarioRunError(`Unable to load scenario cases: ${casesLookupError.message}`);

  const { data: accountRows, error: accountsLookupError } = await supabase
    .from('customer_accounts')
    .select('id')
    .eq('workspace_id', input.workspaceId)
    .eq('scenario_run_id', input.scenarioRunId);
  if (accountsLookupError) throw new ScenarioRunError(`Unable to load scenario accounts: ${accountsLookupError.message}`);

  const caseIds = (caseRows || []).map((row) => row.id);
  const accountIds = (accountRows || []).map((row) => row.id);
  const counts: ResetCounts = {};

  const deleteByRun = async (table: string) => {
    const { count, error } = await supabase
      .from(table)
      .delete({ count: 'exact' })
      .eq('workspace_id', input.workspaceId)
      .eq('scenario_run_id', input.scenarioRunId);
    if (error) throw new ScenarioRunError(`Unable to reset ${table}: ${error.message}`);
    counts[table] = (counts[table] || 0) + (count || 0);
  };

  const deleteByCaseIds = async (table: string) => {
    if (caseIds.length === 0) return;
    const { count, error } = await supabase
      .from(table)
      .delete({ count: 'exact' })
      .eq('workspace_id', input.workspaceId)
      .in('recovery_case_id', caseIds);
    if (error) throw new ScenarioRunError(`Unable to reset ${table}: ${error.message}`);
    counts[table] = (counts[table] || 0) + (count || 0);
  };

  const deleteByAccountIds = async (table: string) => {
    if (accountIds.length === 0) return;
    const { count, error } = await supabase
      .from(table)
      .delete({ count: 'exact' })
      .eq('workspace_id', input.workspaceId)
      .in('customer_account_id', accountIds);
    if (error) throw new ScenarioRunError(`Unable to reset ${table}: ${error.message}`);
    counts[table] = (counts[table] || 0) + (count || 0);
  };

  // Dependents first. Every deletion is both workspace and run/account/case
  // scoped, so a different scenario run and ordinary workspace data survive.
  await deleteByRun('draft_outcomes');
  await deleteByRun('follow_up_drafts');
  await deleteByRun('workflow_jobs');
  await deleteByRun('score_snapshots');
  await deleteByRun('agent_runs');
  await deleteByCaseIds('recovery_case_events');
  await deleteByRun('recovery_cases');
  await deleteByRun('webhook_events');
  await deleteByAccountIds('account_timeline');
  await deleteByRun('account_features');
  await deleteByRun('provider_identities');
  await deleteByRun('contact_policies');
  await deleteByRun('account_contacts');
  await deleteByRun('customer_accounts');

  const { error: completeError } = await supabase
    .from('recovery_scenario_runs')
    .update({ status: 'reset', reset_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('id', input.scenarioRunId)
    .eq('workspace_id', input.workspaceId)
    .eq('test_mode', true);
  if (completeError) throw new ScenarioRunError(`Unable to mark scenario run reset: ${completeError.message}`);

  return { resetCount: accountIds.length, counts };
}
