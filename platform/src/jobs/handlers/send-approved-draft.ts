/**
 * Send Approved Draft — Durable worker job handler
 *
 * §40.14: Exact-content send with all stopping rules rechecked.
 * Never fabricates Gmail message IDs.
 * Uses body_full, not body_preview.
 */

import { SupabaseClient } from '@supabase/supabase-js';
import { JobExecutionContext, JobExecutionResult } from '@/jobs/types';
import { transitionRecoveryCase } from '@/recovery/transitions';
import { sendEmail } from '@/integrations/gmail/gmail';
import { computeContentHash } from './generate-case-draft';

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

  // §40.14: Recheck ALL stopping rules before provider execution

  // Check: draft status is ready_to_send
  if (draft.status !== 'ready_to_send') {
    throw new Error(`Draft ${draftId} status is ${draft.status}, expected ready_to_send`);
  }

  // Check: linked case exists and is approved
  if (recoveryCaseId) {
    const { data: caseRow, error: caseError } = await supabase
      .from('recovery_cases')
      .select('status, workspace_id')
      .eq('id', recoveryCaseId)
      .single();

    if (caseError || !caseRow) {
      throw new Error(`Case ${recoveryCaseId} not found: ${caseError?.message}`);
    }
    if (caseRow.status !== 'approved') {
      throw new Error(`Case ${recoveryCaseId} status is ${caseRow.status}, expected approved`);
    }
    if (caseRow.workspace_id !== workspaceId) {
      throw new Error(`Case workspace mismatch`);
    }
  }

  // Check: recipient is present and valid
  const recipientEmail = draft.recipient_email;
  if (!recipientEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipientEmail)) {
    throw new Error(`Draft ${draftId} has invalid recipient: ${recipientEmail}`);
  }

  // §40.14: Check contact policy still permits email — fail-closed on DB errors
  if (draft.customer_account_id) {
    const { data: policyRows, error: policyError } = await supabase
      .from('contact_policies')
      .select('policy, address, expires_at')
      .eq('workspace_id', workspaceId)
      .eq('customer_account_id', draft.customer_account_id)
      .eq('channel', 'email');

    if (policyError) {
      // §40.14: DB error on policy check = fail closed. Never send without confirmed policy.
      throw new Error(`Contact policy DB error for account ${draft.customer_account_id}: ${policyError.message}`);
    }

    // Apply most restrictive active policy.
    const now = new Date();
    const blocked = (policyRows ?? []).some((p) => {
      if (p.expires_at && new Date(p.expires_at) < now) return false; // expired
      // For a revenue-recovery email: do_not_contact and transactional_only both block.
      return p.policy === 'do_not_contact' || p.policy === 'transactional_only';
    });

    if (blocked) {
      throw new Error(`Contact policy blocks email for account ${draft.customer_account_id}`);
    }
  }

  // §40.14: Check Gmail is connected and healthy
  const { data: gmailIntegration } = await supabase
    .from('integration_connections')
    .select('status')
    .eq('workspace_id', workspaceId)
    .eq('provider', 'gmail')
    .maybeSingle();

  if (!gmailIntegration || gmailIntegration.status !== 'connected') {
    throw new Error(`Gmail not connected for workspace ${workspaceId}`);
  }

  // §40.14: Check approval exists and is not expired
  if (!draft.approved_at) {
    throw new Error(`Draft ${draftId} has no approval`);
  }
  if (draft.approval_expires_at && new Date(draft.approval_expires_at) < new Date()) {
    throw new Error(`Draft ${draftId} approval has expired at ${draft.approval_expires_at}`);
  }

  // §40.14: Recompute hash from stored content = content_hash = approved_content_hash
  const bodyFull = draft.body_full;
  if (!bodyFull) {
    throw new Error(`Draft ${draftId} has no body_full — cannot send preview-only content`);
  }

  const recomputedHash = computeContentHash({
    workspaceId,
    caseId: recoveryCaseId || '',
    recipientEmail,
    subject: draft.subject,
    bodyText: bodyFull,
    actionVersion: draft.action_version || 1,
    offerId: null,
  });

  if (draft.content_hash && recomputedHash !== draft.content_hash) {
    throw new Error(`Draft ${draftId} content hash mismatch — content was modified`);
  }
  if (draft.approved_content_hash && recomputedHash !== draft.approved_content_hash) {
    throw new Error(`Draft ${draftId} approved content hash mismatch — re-approval required`);
  }

  // §40.14: Check no prior successful send for this logical key
  const sendIdempotencyKey = `${workspaceId}:${draftId}:${draft.approved_content_hash || recomputedHash}`;

  if (draft.send_idempotency_key === sendIdempotencyKey && draft.sent_at) {
    // Already sent with this exact content — idempotent success
    return { success: true, workspaceId };
  }

  // §40.14: Persist send_idempotency_key before calling Gmail
  const { error: preSendError } = await supabase
    .from('follow_up_drafts')
    .update({
      send_idempotency_key: sendIdempotencyKey,
    })
    .eq('id', draftId);

  if (preSendError) {
    throw new Error(`Failed to persist send_idempotency_key: ${preSendError.message}`);
  }

  // 3. Execute Send — §40.14: use the EXACT recipient, subject, body_full
  // that were loaded and verified above. Never re-fetch body_preview or
  // replace recipient_email with whatever account contact is currently primary.
  const result = await sendEmail(workspaceId, {
    to: recipientEmail,
    subject: draft.subject,
    body: bodyFull,
  });

  // §40.14: Require the real Gmail message ID — never fabricate
  const providerMessageId = result.messageId;
  const providerThreadId = result.threadId;

  if (!providerMessageId) {
    // §40.14: Gmail returned uncertain result without ID — do not claim success
    const { error: sendErrUpdate } = await supabase
      .from('follow_up_drafts')
      .update({
        send_error: 'Gmail did not return a message ID — delivery uncertain',
      })
      .eq('id', draftId);

    if (sendErrUpdate) {
      console.error('[send-approved-draft] failed to record send error:', sendErrUpdate.message);
    }
    throw new Error('Gmail send did not return a message ID — cannot confirm delivery');
  }

  // §40.14: Store real provider IDs
  const { error: postSendError } = await supabase
    .from('follow_up_drafts')
    .update({
      status: 'sent',
      sent_at: new Date().toISOString(),
      provider_message_id: providerMessageId,
      provider_thread_id: providerThreadId,
      send_error: null,
    })
    .eq('id', draftId);

  if (postSendError) {
    console.error('[send-approved-draft] failed to update draft post-send:', postSendError.message);
  }

  // 4. If case exists, transition approved → sent → monitoring
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
        providerMessageId,
        providerThreadId,
        sendIdempotencyKey,
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

    // §40.14: Enqueue Gmail history sync
    return {
      success: true,
      workspaceId,
      nextJob: {
        jobType: 'sync_gmail_history',
        idempotencyKey: `ws:${workspaceId}:gmail_sync:${draftId}`,
        workspaceId,
        recoveryCaseId,
        payload: {
          workspaceId,
          recoveryCaseId,
          draftId,
          providerThreadId,
          providerMessageId,
        },
      },
    };
  }

  return { success: true, workspaceId };
}
