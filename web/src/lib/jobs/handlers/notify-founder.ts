import { SupabaseClient } from '@supabase/supabase-js';
import { JobExecutionContext, JobExecutionResult } from '../types';

export async function handleNotifyFounder(
  supabase: SupabaseClient,
  context: JobExecutionContext
): Promise<JobExecutionResult> {
  const payload = context.job.payload;
  const workspaceId = context.workspaceId || payload.workspaceId;
  const recoveryCaseId = payload.recoveryCaseId || context.job.recoveryCaseId;

  if (!workspaceId || !recoveryCaseId) {
    throw new Error('notify_founder requires workspaceId and recoveryCaseId');
  }

  // Record founder notification event in audit log
  await supabase.from('recovery_case_events').insert({
    workspace_id: workspaceId,
    recovery_case_id: recoveryCaseId,
    event_type: 'founder_notified',
    actor_type: 'system',
    actor_id: 'notification_service',
    workflow_job_id: context.job.id,
    detail: {
      draftId: payload.draftId,
      subject: payload.subject,
      channel: 'dashboard_inbox',
      notifiedAt: new Date().toISOString(),
    },
  });

  return { success: true };
}
