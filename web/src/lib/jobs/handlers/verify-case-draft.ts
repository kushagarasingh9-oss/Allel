import { SupabaseClient } from '@supabase/supabase-js';
import { JobExecutionContext, JobExecutionResult } from '../types';
import { RecoveryDraft } from '../../recovery/types';
import { transitionRecoveryCase } from '../../recovery/transitions';
import { RECOVERY_CONFIG } from '../../recovery/config';

export async function handleVerifyCaseDraft(
  supabase: SupabaseClient,
  context: JobExecutionContext
): Promise<JobExecutionResult> {
  const payload = context.job.payload;
  const workspaceId = context.workspaceId || payload.workspaceId;
  const recoveryCaseId = payload.recoveryCaseId || context.job.recoveryCaseId;
  const draftId = payload.draftId;
  const draft = payload.draft as RecoveryDraft;
  const contentHash = payload.contentHash;

  if (!workspaceId || !recoveryCaseId || !draftId || !draft) {
    throw new Error('verify_case_draft requires workspaceId, recoveryCaseId, draftId, and draft');
  }

  // 1. Run deterministic checks
  const checks: Array<{ ruleId: string; passed: boolean; detail: string }> = [];

  // Check 1: Recipient email is valid
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const emailValid = emailRegex.test(draft.recipientEmail);
  checks.push({
    ruleId: 'valid_recipient_email',
    passed: emailValid,
    detail: emailValid ? 'Valid recipient email' : `Invalid email format: ${draft.recipientEmail}`,
  });

  // Check 2: Subject length <= 78 chars
  const subjectLen = draft.subject.length;
  const subjectOk = subjectLen <= RECOVERY_CONFIG.MAX_DRAFT_SUBJECT_CHARS;
  checks.push({
    ruleId: 'subject_length_within_limit',
    passed: subjectOk,
    detail: `Subject length is ${subjectLen} chars (limit: ${RECOVERY_CONFIG.MAX_DRAFT_SUBJECT_CHARS})`,
  });

  // Check 3: Body word count <= 180 words
  const wordCount = draft.bodyText.trim().split(/\s+/).length;
  const bodyOk = wordCount <= RECOVERY_CONFIG.MAX_DRAFT_BODY_WORDS;
  checks.push({
    ruleId: 'body_word_count_within_limit',
    passed: bodyOk,
    detail: `Body word count is ${wordCount} words (limit: ${RECOVERY_CONFIG.MAX_DRAFT_BODY_WORDS})`,
  });

  // Check 4: No forbidden phrases (risk score, churn, surveillance)
  const forbiddenRegex = /risk score|churn prediction|churn risk|internal score|automated tracking|we tracked your/i;
  const hasForbidden = forbiddenRegex.test(draft.bodyText) || forbiddenRegex.test(draft.subject);
  checks.push({
    ruleId: 'no_forbidden_surveillance_claims',
    passed: !hasForbidden,
    detail: !hasForbidden ? 'No prohibited surveillance claims found' : 'Draft contains prohibited internal jargon/claims',
  });

  const allPassed = checks.every((c) => c.passed);

  // 2. If verified, transition case to 'awaiting_approval'
  if (allPassed) {
    await transitionRecoveryCase(supabase, {
      workspaceId,
      caseId: recoveryCaseId,
      targetStatus: 'awaiting_approval',
      actorType: 'system',
      actorId: 'draft_verifier',
      eventType: 'verification_passed',
      workflowJobId: context.job.id,
      detail: { checks, contentHash },
    });

    // Enqueue founder notification job
    const notifyIdempotencyKey = `ws:${workspaceId}:case:${recoveryCaseId}:notify:v1`;
    return {
      success: true,
      nextJob: {
        jobType: 'notify_founder',
        idempotencyKey: notifyIdempotencyKey,
        workspaceId,
        recoveryCaseId,
        payload: {
          workspaceId,
          recoveryCaseId,
          draftId,
          subject: draft.subject,
        },
      },
    };
  }

  // Verification failed - record failure event
  await supabase.from('recovery_case_events').insert({
    workspace_id: workspaceId,
    recovery_case_id: recoveryCaseId,
    event_type: 'verification_failed',
    actor_type: 'system',
    actor_id: 'draft_verifier',
    workflow_job_id: context.job.id,
    detail: { checks },
  });

  return { success: true };
}
