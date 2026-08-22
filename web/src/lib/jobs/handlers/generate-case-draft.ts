import crypto from 'crypto';
import { SupabaseClient } from '@supabase/supabase-js';
import { generateObject } from 'ai';
import { getLanguageModel } from '../../ai/ai';
import { JobExecutionContext, JobExecutionResult } from '../types';
import { RecoveryDraftSchema } from '../../recovery/schemas';
import { RecoveryDraft } from '../../recovery/types';

export function computeContentHash(params: {
  caseId: string;
  recipientEmail: string;
  subject: string;
  bodyText: string;
  actionVersion?: number;
}): string {
  const normalized = [
    params.caseId,
    params.recipientEmail.trim().toLowerCase(),
    params.subject.trim().replace(/\r\n/g, '\n'),
    params.bodyText.trim().replace(/\r\n/g, '\n'),
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

  // 1. Fetch case and contact
  const { data: caseRow, error: caseError } = await supabase
    .from('recovery_cases')
    .select('*, customer_accounts(*)')
    .eq('id', recoveryCaseId)
    .single();

  if (caseError || !caseRow) {
    throw new Error(`Case ${recoveryCaseId} not found`);
  }

  // Fetch primary contact email
  let recipientEmail = payload.recipientEmail || caseRow.customer_accounts?.contact_email;
  if (!recipientEmail) {
    const { data: contact } = await supabase
      .from('account_contacts')
      .select('email')
      .eq('customer_account_id', caseRow.customer_account_id)
      .limit(1)
      .maybeSingle();
    recipientEmail = contact?.email || 'customer@example.com';
  }

  const analysis = payload.analysis;
  let draft: RecoveryDraft;

  try {
    const prompt = `Write a concise, human, founder-voiced retention rescue email for customer "${caseRow.customer_accounts?.name}":
Recipient: ${recipientEmail}
Action Type: ${caseRow.action_type}
Primary Cause: ${analysis?.primaryCause || 'billing'}
Summary: ${analysis?.summary || caseRow.action_reason}
Tone: ${analysis?.recommendedTone || 'helpful'}
Next Step: ${analysis?.recommendedNextStep || 'Update billing details'}

Rules:
- Max 180 words
- Subject max 78 chars
- One clear call to action
- Never mention internal risk scores, churn predictions, or surveillance
- Never invent discounts or coupons`;

    const result = await generateObject({
      model: getLanguageModel(),
      schema: RecoveryDraftSchema,
      prompt,
    });

    draft = result.object;
  } catch (_err) {
    // Deterministic fallback templates
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
        safetyNotes: ['Standard billing recovery template'],
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
        safetyNotes: ['Standard checkin template'],
      };
    }
  }

  const contentHash = computeContentHash({
    caseId: recoveryCaseId,
    recipientEmail: draft.recipientEmail,
    subject: draft.subject,
    bodyText: draft.bodyText,
    actionVersion: 1,
  });

  // 2. Insert into follow_up_drafts table
  const { data: createdDraft, error: draftError } = await supabase
    .from('follow_up_drafts')
    .insert({
      workspace_id: workspaceId,
      customer_account_id: caseRow.customer_account_id,
      recovery_case_id: recoveryCaseId,
      status: 'pending_review',
      channel: 'email',
      recipient_email: draft.recipientEmail,
      subject: draft.subject,
      body_preview: draft.bodyText.slice(0, 200),
      body_full: draft.bodyText,
      content_hash: contentHash,
      action_version: 1,
      created_by_actor: 'agent',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .select('id')
    .single();

  if (draftError || !createdDraft) {
    throw new Error(`Failed to create follow up draft: ${draftError?.message}`);
  }

  // 3. Enqueue verification job
  const verifyIdempotencyKey = `ws:${workspaceId}:draft:${createdDraft.id}:verify:v1`;

  return {
    success: true,
    nextJob: {
      jobType: 'verify_case_draft',
      idempotencyKey: verifyIdempotencyKey,
      workspaceId,
      recoveryCaseId,
      payload: {
        workspaceId,
        recoveryCaseId,
        draftId: createdDraft.id,
        draft,
        contentHash,
      },
    },
  };
}
