import { SupabaseClient } from '@supabase/supabase-js';
import { JobExecutionContext, JobExecutionResult } from '@/jobs/types';
import { syncGmailRecoveryHistory } from '@/integrations/gmail/gmail-recovery-history';

export async function handleSyncGmailHistory(
  _supabase: SupabaseClient,
  context: JobExecutionContext
): Promise<JobExecutionResult> {
  const workspaceId = context.workspaceId || context.job.workspaceId;

  if (!workspaceId) {
    throw new Error('sync_gmail_history requires workspaceId');
  }

  // A disconnected or expired Gmail integration is actionable failure state,
  // not a successful empty sync. The durable job retry/error path owns the
  // visible remediation and ensures we never silently lose reply evidence.
  await syncGmailRecoveryHistory(workspaceId);
  return { success: true, workspaceId };
}
