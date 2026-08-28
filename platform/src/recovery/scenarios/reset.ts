import { SupabaseClient } from '@supabase/supabase-js';

export async function resetScenarios(
  supabase: SupabaseClient,
  workspaceId: string
): Promise<{ resetCount: number }> {
  // Delete all recovery cases, draft outcomes, follow up drafts, and scenario accounts in workspace
  await supabase.from('recovery_cases').delete().eq('workspace_id', workspaceId);
  await supabase.from('draft_outcomes').delete().eq('workspace_id', workspaceId);
  await supabase.from('workflow_jobs').delete().eq('workspace_id', workspaceId);
  await supabase.from('account_features').delete().eq('workspace_id', workspaceId);
  await supabase.from('provider_identities').delete().eq('workspace_id', workspaceId);

  const { data: accounts } = await supabase
    .from('customer_accounts')
    .select('id')
    .eq('workspace_id', workspaceId)
    .ilike('name', 'Scenario %');

  const accountIds = (accounts || []).map((a) => a.id);
  if (accountIds.length > 0) {
    await supabase.from('customer_accounts').delete().in('id', accountIds);
  }

  return { resetCount: accountIds.length };
}
