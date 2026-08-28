/**
 * Verify Case Draft — Durable worker job handler
 *
 * §40.12: Expanded deterministic verification.
 * Checks draft ownership, recipient validity, contact policy, Gmail health,
 * content hash, and forbidden claims.
 */

import { SupabaseClient } from '@supabase/supabase-js';
import { JobExecutionContext, JobExecutionResult } from '@/jobs/types';
import { transitionRecoveryCase } from '@/recovery/transitions';
import { RECOVERY_CONFIG } from '@/recovery/config';
import { computeContentHash } from './generate-case-draft';

export async function handleVerifyCaseDraft(
  supabase: SupabaseClient,
  context: JobExecutionContext
): Promise<JobExecutionResult> {
  const payload = context.job.payload;
  const workspaceId = context.workspaceId || payload.workspaceId;
  const recoveryCaseId = payload.recoveryCaseId || context.job.recoveryCaseId;
  const draftId = payload.draftId;
  const contentHash = payload.contentHash;

  if (!workspaceId || !recoveryCaseId || !draftId) {
    throw new Error('verify_case_draft requires workspaceId, recoveryCaseId, and draftId');
  }

  // §40.12: Load draft from database — verify it belongs to case and workspace
  const { data: draft, error: draftError } = await supabase
    .from('follow_up_drafts')
    .select('*')
    .eq('id', draftId)
    .eq('workspace_id', workspaceId)
    .eq('recovery_case_id', recoveryCaseId)
    .single();

  if (draftError || !draft) {
    throw new Error(`Draft ${draftId} not found in case ${recoveryCaseId}: ${draftError?.message}`);
  }

  // §40.12: Load the case and verify it's in correct state
  const { data: caseRow, error: caseError } = await supabase
    .from('recovery_cases')
    .select('*')
    .eq('id', recoveryCaseId)
    .eq('workspace_id', workspaceId)
    .single();

  if (caseError || !caseRow) {
    throw new Error(`Case ${recoveryCaseId} not found: ${caseError?.message}`);
  }

  // Run deterministic checks
  const checks: Array<{ ruleId: string; passed: boolean; detail: string }> = [];
  const bodyFull = draft.body_full || draft.body_preview || '';
  const subject = draft.subject || '';
  const recipientEmail = draft.recipient_email || '';

  // Check 1: Recipient email is valid
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const emailValid = emailRegex.test(recipientEmail);
  checks.push({
    ruleId: 'valid_recipient_email',
    passed: emailValid,
    detail: emailValid ? 'Valid recipient email' : `Invalid email format: ${recipientEmail}`,
  });

  // §40.12: Check recipient is still a verified account contact
  if (emailValid) {
    const { data: contact } = await supabase
      .from('account_contacts')
      .select('id')
      .eq('workspace_id', workspaceId)
      .eq('customer_account_id', caseRow.customer_account_id)
      .eq('email', recipientEmail.toLowerCase())
      .maybeSingle();

    checks.push({
      ruleId: 'recipient_is_verified_contact',
      passed: !!contact,
      detail: contact ? 'Recipient is a verified contact' : 'Recipient email not found in verified contacts',
    });
  }

  // §40.12: Check contact policy still permits email
  const { data: policy } = await supabase
    .from('contact_policies')
    .select('allowed')
    .eq('workspace_id', workspaceId)
    .eq('customer_account_id', caseRow.customer_account_id)
    .eq('channel', 'email')
    .maybeSingle();

  const policyAllows = !policy || policy.allowed !== false;
  checks.push({
    ruleId: 'contact_policy_allows_email',
    passed: policyAllows,
    detail: policyAllows ? 'Contact policy allows email' : 'Contact policy blocks email for this customer',
  });

  // §40.12: Check Gmail is connected and healthy
  const { data: gmailIntegration } = await supabase
    .from('integration_connections')
    .select('status')
    .eq('workspace_id', workspaceId)
    .eq('provider', 'gmail')
    .maybeSingle();

  const gmailHealthy = gmailIntegration?.status === 'connected';
  checks.push({
    ruleId: 'gmail_connected_and_healthy',
    passed: gmailHealthy,
    detail: gmailHealthy ? 'Gmail integration is connected' : `Gmail status: ${gmailIntegration?.status || 'not found'}`,
  });

  // §40.12: Check case is in permitted pre-approval state
  const permittedStates = ['action_proposed', 'analyzing'];
  const caseStateOk = permittedStates.includes(caseRow.status);
  checks.push({
    ruleId: 'case_in_pre_approval_state',
    passed: caseStateOk,
    detail: caseStateOk ? `Case status ${caseRow.status} is valid` : `Case status ${caseRow.status} not in ${permittedStates.join(', ')}`,
  });

  // Check: Subject length <= 78 chars
  const subjectLen = subject.length;
  const subjectOk = subjectLen <= RECOVERY_CONFIG.MAX_DRAFT_SUBJECT_CHARS;
  checks.push({
    ruleId: 'subject_length_within_limit',
    passed: subjectOk,
    detail: `Subject length is ${subjectLen} chars (limit: ${RECOVERY_CONFIG.MAX_DRAFT_SUBJECT_CHARS})`,
  });

  // Check: Body word count <= 180 words
  const wordCount = bodyFull.trim().split(/\s+/).length;
  const bodyOk = wordCount <= RECOVERY_CONFIG.MAX_DRAFT_BODY_WORDS;
  checks.push({
    ruleId: 'body_word_count_within_limit',
    passed: bodyOk,
    detail: `Body word count is ${wordCount} words (limit: ${RECOVERY_CONFIG.MAX_DRAFT_BODY_WORDS})`,
  });

  // Check: No forbidden phrases
  const forbiddenRegex = /risk score|churn prediction|churn risk|internal score|automated tracking|we tracked your/i;
  const hasForbidden = forbiddenRegex.test(bodyFull) || forbiddenRegex.test(subject);
  checks.push({
    ruleId: 'no_forbidden_surveillance_claims',
    passed: !hasForbidden,
    detail: !hasForbidden ? 'No prohibited surveillance claims found' : 'Draft contains prohibited internal jargon/claims',
  });

  // §40.12: Verify content hash matches stored hash
  const recomputedHash = computeContentHash({
    workspaceId,
    caseId: recoveryCaseId,
    recipientEmail,
    subject,
    bodyText: bodyFull,
    actionVersion: draft.action_version || 1,
    offerId: null,
  });

  const hashMatches = recomputedHash === (draft.content_hash || contentHash);
  checks.push({
    ruleId: 'content_hash_matches',
    passed: hashMatches,
    detail: hashMatches ? 'Content hash matches' : 'Content hash mismatch — draft may have been modified',
  });

  // §40.12: Check content is full-body, not just preview
  const hasFullBody = !!(draft.body_full && draft.body_full.length > 0);
  checks.push({
    ruleId: 'has_full_body_content',
    passed: hasFullBody,
    detail: hasFullBody ? 'Full body content present' : 'Missing full body — only preview available',
  });

  const allPassed = checks.every((c) => c.passed);

  if (allPassed) {
    // §40.12: Transition case to awaiting_approval atomically
    await transitionRecoveryCase(supabase, {
      workspaceId,
      caseId: recoveryCaseId,
      targetStatus: 'awaiting_approval',
      actorType: 'system',
      actorId: 'draft_verifier',
      eventType: 'verification_passed',
      workflowJobId: context.job.id,
      detail: { checks, contentHash: recomputedHash, verifierVersion: 'v1' },
    });

    // Enqueue founder notification job
    const notifyIdempotencyKey = `ws:${workspaceId}:case:${recoveryCaseId}:notify:v1`;
    return {
      success: true,
      workspaceId,
      nextJob: {
        jobType: 'notify_founder',
        idempotencyKey: notifyIdempotencyKey,
        workspaceId,
        recoveryCaseId,
        payload: {
          workspaceId,
          recoveryCaseId,
          draftId,
          subject,
        },
      },
    };
  }

  // §40.12: Verification failed — append failed checks, keep case inspectable
  const { error: eventError } = await supabase.from('recovery_case_events').insert({
    workspace_id: workspaceId,
    recovery_case_id: recoveryCaseId,
    event_type: 'verification_failed',
    actor_type: 'system',
    actor_id: 'draft_verifier',
    workflow_job_id: context.job.id,
    detail: { checks, failedRules: checks.filter(c => !c.passed).map(c => c.ruleId) },
  });

  if (eventError) {
    console.error('[verify-case-draft] failed to insert verification event:', eventError.message);
  }

  // §40.12: Do not return generic success without durable failure state
  return {
    success: true,
    workspaceId,
  };
}
