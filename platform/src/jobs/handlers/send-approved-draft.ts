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
import { ensureGmailRecoveryHistoryCursor } from '@/integrations/gmail/gmail-recovery-history';
import { upsertProviderIdentity } from '@/recovery/identity';
import { projectAccountFeatures } from '@/recovery/features';
import { validateSendRecipient } from '@/drafts/recipient-validator';
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

  // Recovery sends must always be bound to a case. This prevents the durable
  // worker from becoming a generic email-sending escape hatch.
  if (!recoveryCaseId || draft.recovery_case_id !== recoveryCaseId) {
    throw new Error(`Draft ${draftId} is not bound to the requested recovery case`);
  }

  // A previous worker may have received Gmail's real IDs and persisted the
  // draft before crashing during local projection/case transitions. Resume
  // those idempotent local steps; never call Gmail a second time.
  if (draft.status === 'sent') {
    if (!draft.provider_message_id || !draft.provider_thread_id) {
      throw new Error(`Sent draft ${draftId} is missing its Gmail message or thread ID`);
    }
    return finalizeConfirmedSend({
      supabase,
      context,
      workspaceId,
      recoveryCaseId,
      draft,
      providerMessageId: draft.provider_message_id,
      providerThreadId: draft.provider_thread_id ?? null,
      sendIdempotencyKey: draft.send_idempotency_key ?? `${workspaceId}:${draftId}:confirmed`,
    });
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

  if (!draft.customer_account_id) {
    throw new Error(`Draft ${draftId} is missing customer_account_id`);
  }

  // §40.14: Revalidate recipient identity and policy immediately prior to send (TOCTOU protection)
  const recipientValidation = await validateSendRecipient(supabase, {
    workspaceId,
    customerAccountId: draft.customer_account_id,
    recipientEmail,
    requirePrimary: true,
  });

  if (!recipientValidation.valid) {
    throw new Error(`Pre-send recipient validation failed for draft ${draftId}: ${recipientValidation.reason}`);
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
    // A sent timestamp without the terminal draft status or real Gmail IDs is
    // inconsistent state, not an idempotent success. Retrying the provider
    // call here could duplicate a customer email.
    throw new Error(
      `GMAIL_SEND_RECONCILIATION_REQUIRED: draft ${draftId} has a recorded send timestamp without confirmed sent state`
    );
  }

  if (draft.send_idempotency_key === sendIdempotencyKey && !draft.sent_at) {
    // Gmail does not offer a client idempotency key. Once an attempt has been
    // recorded but no provider message ID was durably stored, delivery is
    // uncertain. Retrying would risk a second customer email, so stop for
    // explicit operator reconciliation instead of guessing.
    throw new Error(
      `GMAIL_SEND_RECONCILIATION_REQUIRED: draft ${draftId} has a prior recorded send attempt without a confirmed Gmail message ID`
    );
  }

  // Establish the Gmail history watermark before transmission. A very fast
  // reply can then be observed and routed back through the canonical outcome
  // pipeline instead of being lost in an unbounded inbox scan. Do this before
  // recording a delivery attempt so a sync outage does not look like an
  // uncertain email send.
  await ensureGmailRecoveryHistoryCursor(workspaceId);

  // §40.14: Persist send_idempotency_key immediately before calling Gmail
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
  let result;
  try {
    result = await sendEmail(workspaceId, {
      to: recipientEmail,
      subject: draft.subject,
      body: bodyFull,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await supabase
      .from('follow_up_drafts')
      .update({
        send_error: `GMAIL_SEND_RECONCILIATION_REQUIRED: ${message}`.slice(0, 1000),
      })
      .eq('id', draftId)
      .eq('workspace_id', workspaceId);
    throw new Error(
      `GMAIL_SEND_RECONCILIATION_REQUIRED: Gmail did not confirm delivery for draft ${draftId}; do not retry automatically`
    );
  }

  // §40.14: Require the real Gmail message ID — never fabricate
  const providerMessageId = result.messageId;
  const providerThreadId = result.threadId;

  if (!providerMessageId || !providerThreadId) {
    // §40.14: Gmail returned incomplete IDs — do not claim success. Both
    // message and thread IDs are required for deterministic reply attribution.
    const { error: sendErrUpdate } = await supabase
      .from('follow_up_drafts')
      .update({
        send_error: 'Gmail did not return both message and thread IDs — delivery uncertain',
      })
      .eq('id', draftId);

    if (sendErrUpdate) {
      console.error('[send-approved-draft] failed to record send error:', sendErrUpdate.message);
    }
    throw new Error('Gmail send did not return both message and thread IDs — cannot confirm delivery');
  }

  // §40.14: Store real provider IDs
  const confirmedAt = new Date().toISOString();
  const { error: postSendError } = await supabase
    .from('follow_up_drafts')
    .update({
      status: 'sent',
      sent_at: confirmedAt,
      provider_message_id: providerMessageId,
      provider_thread_id: providerThreadId,
      send_error: null,
    })
    .eq('id', draftId);

  if (postSendError) {
    // Do not retry the provider send after its real message ID has been
    // returned. The durable error makes this reconciliation work visible
    // without risking a duplicate customer email.
    throw new Error(`Gmail sent message ${providerMessageId}, but draft persistence failed: ${postSendError.message}`);
  }

  return finalizeConfirmedSend({
    supabase,
    context,
    workspaceId,
    recoveryCaseId,
    draft: { ...draft, sent_at: confirmedAt },
    providerMessageId,
    providerThreadId,
    sendIdempotencyKey,
  });
}

async function finalizeConfirmedSend(input: {
  supabase: SupabaseClient;
  context: JobExecutionContext;
  workspaceId: string;
  recoveryCaseId: string;
  draft: Record<string, any>;
  providerMessageId: string;
  providerThreadId: string | null;
  sendIdempotencyKey: string;
}): Promise<JobExecutionResult> {
  const { supabase, context, workspaceId, recoveryCaseId, draft, providerMessageId, providerThreadId, sendIdempotencyKey } = input;

  if (draft.customer_account_id && providerThreadId) {
    await upsertProviderIdentity(supabase, {
      workspaceId,
      customerAccountId: draft.customer_account_id,
      provider: 'gmail',
      identityType: 'gmail_thread_id',
      externalId: providerThreadId,
      isPrimary: true,
      source: 'gmail_recovery_send',
      metadata: { draftId: draft.id, recoveryCaseId, providerMessageId },
    });

    const { data: existingFeatures, error: featuresError } = await supabase
      .from('account_features')
      .select('unreplied_outbound_count')
      .eq('workspace_id', workspaceId)
      .eq('customer_account_id', draft.customer_account_id)
      .maybeSingle();
    if (featuresError) throw new Error(`Failed to read communication features: ${featuresError.message}`);

    const sentAt = draft.sent_at ?? new Date().toISOString();
    await projectAccountFeatures(supabase, {
      workspaceId,
      customerAccountId: draft.customer_account_id,
      patch: {
        communicationAvailable: true,
        lastOutboundAt: sentAt,
        communicationFreshAt: sentAt,
        gmailThreadId: providerThreadId,
        // The feature row has one tracked recovery thread. This assignment is
        // idempotent across a crash/retry; incrementing here would not be.
        unrepliedOutboundCount: Math.max(existingFeatures?.unreplied_outbound_count ?? 0, 1),
      },
    });

    const { data: existingTimeline, error: timelineLookupError } = await supabase
      .from('account_timeline')
      .select('id')
      .eq('workspace_id', workspaceId)
      .eq('customer_account_id', draft.customer_account_id)
      .eq('event_type', 'email_sent')
      .contains('metadata', { gmail_message_id: providerMessageId })
      .maybeSingle();
    if (timelineLookupError) throw new Error(`Failed to check Gmail send timeline: ${timelineLookupError.message}`);
    if (!existingTimeline) {
      const { error: timelineError } = await supabase.from('account_timeline').insert({
        workspace_id: workspaceId,
        customer_account_id: draft.customer_account_id,
        event_type: 'email_sent',
        headline: `Recovery email sent: ${draft.subject}`,
        detail: `Gmail message ${providerMessageId} sent after founder approval.`,
        source: 'gmail',
        metadata: {
          gmail_message_id: providerMessageId,
          gmail_thread_id: providerThreadId,
          recovery_case_id: recoveryCaseId,
          draft_id: draft.id,
        },
        event_at: sentAt,
      });
      if (timelineError) throw new Error(`Failed to append Gmail send timeline: ${timelineError.message}`);
    }
  }

  const { data: caseRow, error: caseError } = await supabase
    .from('recovery_cases')
    .select('status, workspace_id')
    .eq('id', recoveryCaseId)
    .eq('workspace_id', workspaceId)
    .single();
  if (caseError || !caseRow) throw new Error(`Case ${recoveryCaseId} not found while finalizing send`);

  if (caseRow.status === 'approved') {
    await transitionRecoveryCase(supabase, {
      workspaceId,
      caseId: recoveryCaseId,
      targetStatus: 'sent',
      actorType: 'worker',
      actorId: context.workerId,
      eventType: 'send_succeeded',
      workflowJobId: context.job.id,
      detail: { draftId: draft.id, providerMessageId, providerThreadId, sendIdempotencyKey },
    });
  }

  if (caseRow.status === 'approved' || caseRow.status === 'sent') {
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

  return {
    success: true,
    workspaceId,
    nextJob: {
      jobType: 'sync_gmail_history',
      idempotencyKey: `ws:${workspaceId}:gmail_sync:${draft.id}`,
      workspaceId,
      recoveryCaseId,
      payload: {
        workspaceId,
        recoveryCaseId,
        draftId: draft.id,
        providerThreadId,
        providerMessageId,
      },
    },
  };
}
