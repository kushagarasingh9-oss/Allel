import crypto from 'crypto';
import { SupabaseClient } from '@supabase/supabase-js';
import { JobExecutionContext, JobExecutionResult } from '../types';
import { transitionRecoveryCase } from '../../recovery/transitions';
import { sendDraftWithGmail } from '../../drafts/send-draft';

export async function handleSendApprovedDraft(
  supabase: SupabaseClient,
  context: JobExecutionContext
): Promise<JobExecutionResult> {
  const payload = context.job.payload;
  const workspaceId = context.workspaceId || payload.workspaceId;
  const draftId = payload.draftId;
  const recoveryCaseId = payload.recoveryCaseId || context.job.recoveryCaseId;

  if (!workspaceId || !draftId) {
    throw new Error('send_approved_draft requires workspaceId and draftId');
  }

  // 1. Fetch draft
  const { data: draft, error: draftError } = await supabase
    .from('follow_up_drafts')
    .select('*')
    .eq('id', draftId)
    .eq('workspace_id', workspaceId)
    .single();

  if (draftError || !draft) {
    throw new Error(`Draft ${draftId} not found in workspace ${workspaceId}`);
  }

  // 2. Validate approval provenance
  if (draft.status !== 'approved' && draft.status !== 'ready_to_send') {
    throw new Error(`Draft ${draftId} is not in approved/ready_to_send status (status: ${draft.status})`);
  }

  if (draft.approved_content_hash && draft.content_hash && draft.approved_content_hash !== draft.content_hash) {
    throw new Error(`Draft ${draftId} content hash mismatch; re-approval required`);
  }

  // 3. Execute Send
  const sendResult = await sendDraftWithGmail(supabase, draftId, {
    actor: 'founder',
    metadata: { via: 'recovery_job_queue' },
  });

  // 4. If case exists, transition to 'sent' then 'monitoring'
  if (recoveryCaseId) {
    await transitionRecoveryCase(supabase, {
      workspaceId,
      caseId: recoveryCaseId,
      targetStatus: 'sent',
      actorType: 'worker',
      actorId: context.workerId,
      eventType: 'send_succeeded',
      workflowJobId: context.job.id,
      detail: {
        draftId,
        providerMessageId: sendResult.messageId || `msg_${crypto.randomUUID()}`,
        providerThreadId: sendResult.threadId,
      },
    });

    await transitionRecoveryCase(supabase, {
      workspaceId,
      caseId: recoveryCaseId,
      targetStatus: 'monitoring',
      actorType: 'system',
      actorId: 'monitoring_daemon',
      eventType: 'monitoring_started',
      workflowJobId: context.job.id,
    });
  }

  return { success: true };
}
