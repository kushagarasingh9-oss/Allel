import { SupabaseClient } from '@supabase/supabase-js';
import { JobExecutionContext, JobExecutionResult } from '@/jobs/types';
import { syncGmailWorkspace } from '@/integrations/gmail/gmail-sync';

export async function handleSyncGmailHistory(
  _supabase: SupabaseClient,
  context: JobExecutionContext
): Promise<JobExecutionResult> {
  const workspaceId = context.workspaceId || context.job.workspaceId;

  if (!workspaceId) {
    throw new Error('sync_gmail_history requires workspaceId');
  }

  try {
    await syncGmailWorkspace(workspaceId);
    return { success: true };
  } catch (_err) {
    // Non-fatal if Gmail is not connected
    return { success: true };
  }
}
