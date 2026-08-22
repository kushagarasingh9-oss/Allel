/**
 * Generate Case Draft — Durable worker job handler
 *
 * §40.5.5: Schema-valid draft insert.
 * §40.11: Safe generation with verified contacts and proper fallback.
 */

import crypto from 'crypto';
import { SupabaseClient } from '@supabase/supabase-js';
import { generateObject } from 'ai';
import { getLanguageModel } from '../../ai/ai';
import { JobExecutionContext, JobExecutionResult } from '../types';
import { RecoveryDraftSchema } from '../../recovery/schemas';
import { RecoveryDraft } from '../../recovery/types';

export function computeContentHash(params: {
  workspaceId?: string;
  caseId: string;
  recipientEmail: string;
  subject: string;
  bodyText: string;
  actionVersion?: number;
  offerId?: string | null;
}): string {
  // §40.11: One canonical hash contract used for generation, edit, approval, and send
  const normalized = [
    params.workspaceId || '',
    params.caseId,
    params.recipientEmail.trim().toLowerCase(),
    params.subject.trim().replace(/\r\n/g, '\n'),
    params.bodyText.trim().replace(/\r\n/g, '\n'),
    params.offerId || 'null',
    params.actionVersion || 1,
  ].join('::');
  return crypto.createHash('sha256').update(normalized).digest('hex');
}

export async function handleGenerateCaseDraft(
  supabase: SupabaseClient,
  context: JobExecutionContext
): Promise<JobExecutionResult> {
  const payload = context.job.payload;
  const workspaceId = context.workspaceId || payload.workspaceId;
  const recoveryCaseId = payload.recoveryCaseId || context.job.recoveryCaseId;

  if (!workspaceId || !recoveryCaseId) {
    throw new Error('generate_case_draft requires workspaceId and recoveryCaseId');
  }

  // 1. Fetch case — require status action_proposed (§40.11)
  const { data: caseRow, error: caseError } = await supabase
    .from('recovery_cases')
    .select('*, customer_accounts(*)')
    .eq('id', recoveryCaseId)
    .eq('workspace_id', workspaceId)
    .single();

  if (caseError || !caseRow) {
    throw new Error(`Case ${recoveryCaseId} not found: ${caseError?.message}`);
  }

  if (caseRow.status !== 'action_proposed') {
    throw new Error(`Case ${recoveryCaseId} status is ${caseRow.status}, expected action_proposed`);
  }

  // §40.11: Load one verified primary contact — fail safely when none exists
  let recipientEmail: string | null = null;

  // Try payload override first
  if (payload.recipientEmail && payload.recipientEmail !== 'customer@example.com') {
    recipientEmail = payload.recipientEmail;
  }

  // Try customer_accounts.contact_email
  if (!recipientEmail && caseRow.customer_accounts?.contact_email) {
    recipientEmail = caseRow.customer_accounts.contact_email;
  }

  // Try account_contacts
  if (!recipientEmail) {
    const { data: contact, error: contactError } = await supabase
      .from('account_contacts')
      .select('email')
      .eq('customer_account_id', caseRow.customer_account_id)
      .eq('workspace_id', workspaceId)
      .not('email', 'is', null)
      .limit(1)
      .maybeSingle();

    if (contactError) {
      throw new Error(`Failed to load contact: ${contactError.message}`);
    }
    recipientEmail = contact?.email || null;
  }

  // §40.11: Never substitute customer@example.com
  if (!recipientEmail || recipientEmail === 'customer@example.com') {
    throw new Error(`No verified recipient for case ${recoveryCaseId}`);
  }

  // §40.5.5: Make generation idempotent by case + action_version
  const actionVersion = caseRow.action_version || 1;
  const { data: existingDraft } = await supabase
    .from('follow_up_drafts')
    .select('id, status')
    .eq('recovery_case_id', recoveryCaseId)
    .eq('action_version', actionVersion)
    .is('superseded_at', null)
    .maybeSingle();

  // §40.5.5: Never overwrite an approved or sent draft
  if (existingDraft && ['ready_to_send', 'sent'].includes(existingDraft.status)) {
    return { success: true, workspaceId };
  }

  const analysis = payload.analysis;
  let draft: RecoveryDraft;
  let usedFallback = false;

  try {
    const prompt = `Write a concise, human, founder-voiced retention rescue email for customer "${caseRow.customer_accounts?.name}":\nRecipient: ${recipientEmail}\nAction Type: ${caseRow.action_type}\nPrimary Cause: ${analysis?.primaryCause || 'billing'}\nSummary: ${analysis?.summary || caseRow.action_reason}\nTone: ${analysis?.recommendedTone || 'helpful'}\nNext Step: ${analysis?.recommendedNextStep || 'Update billing details'}\n\nRules:\n- Max 180 words\n- Subject max 78 chars\n- One clear call to action\n- Never mention internal risk scores, churn predictions, or surveillance\n- Never invent discounts or coupons`;

    const result = await generateObject({
      model: getLanguageModel(),
      schema: RecoveryDraftSchema,
      prompt,
    });

    draft = result.object;
  } catch (_err) {
    // §40.11: Deterministic fallback — record in run metadata
    usedFallback = true;
    const accountName = caseRow.customer_accounts?.name || 'there';
    if (caseRow.action_type === 'billing_recovery_email') {
      draft = {
        caseId: recoveryCaseId,
        actionType: caseRow.action_type,
        recipientEmail,
        subject: `Quick note regarding your ${accountName} subscription`,
        bodyText: `Hi ${accountName},\n\nWe noticed an issue processing your latest invoice. To ensure your service continues without interruption, could you please take a moment to update your payment method?\n\nLet us know if you have any questions or need assistance.\n\nBest,\nThe Team`,
        evidenceIdsUsed: [],
        offerId: null,
        callToAction: 'Update billing method',
        safetyNotes: ['Deterministic fallback template — model unavailable'],
      };
    } else {
      draft = {
        caseId: recoveryCaseId,
        actionType: caseRow.action_type,
        recipientEmail,
        subject: `Checking in from ${accountName}`,
        bodyText: `Hi ${accountName},\n\nI wanted to personally reach out and see how everything is going with your account. Is there anything we can help you with or improve to make sure you are getting the most value?\n\nLooking forward to hearing your thoughts.\n\nBest,\nThe Team`,
        evidenceIdsUsed: [],
        offerId: null,
        callToAction: 'Reply with feedback',
        safetyNotes: ['Deterministic fallback template — model unavailable'],
      };
    }
  }

  // Override recipient from verified contact
  draft.recipientEmail = recipientEmail;

  const bodyFull = draft.bodyText;
  const bodyPreview = bodyFull.slice(0, 200);

  const contentHash = computeContentHash({
    workspaceId,
    caseId: recoveryCaseId,
    recipientEmail: draft.recipientEmail,
    subject: draft.subject,
    bodyText: bodyFull,
    actionVersion,
    offerId: draft.offerId,
  });

  // §40.5.5: Supersede existing unapproved draft
  if (existingDraft) {
    const { error: supersedError } = await supabase
      .from('follow_up_drafts')
      .update({ superseded_at: new Date().toISOString() })
      .eq('id', existingDraft.id);

    if (supersedError) {
      console.error('[generate-case-draft] failed to supersede draft:', supersedError.message);
    }
  }

  // §40.5.5: Insert schema-valid draft — correct columns only
  const { data: createdDraft, error: draftError } = await supabase
    .from('follow_up_drafts')
    .insert({
      workspace_id: workspaceId,
      customer_account_id: caseRow.customer_account_id,
      recovery_case_id: recoveryCaseId,
      draft_type: 'email',               // §40.5.5: required field
      status: 'needs_review',             // §40.5.5: not 'pending_review'
      recipient_email: draft.recipientEmail,
      subject: draft.subject,
      body_preview: bodyPreview,
      body_full: bodyFull,                // §40.5.5: full body stored
      content_hash: contentHash,
      action_version: actionVersion,
    })
    .select('id')
    .single();

  if (draftError || !createdDraft) {
    // §40.11: Insertion failure is a job failure
    throw new Error(`Failed to create draft: ${draftError?.message}`);
  }

  // 3. Enqueue verification job
  const verifyIdempotencyKey = `ws:${workspaceId}:draft:${createdDraft.id}:verify:v${actionVersion}`;

  return {
    success: true,
    workspaceId,
    nextJob: {
      jobType: 'verify_case_draft',
      idempotencyKey: verifyIdempotencyKey,
      workspaceId,
      recoveryCaseId,
      payload: {
        workspaceId,
        recoveryCaseId,
        draftId: createdDraft.id,
        contentHash,
        usedFallback,
      },
    },
  };
}
