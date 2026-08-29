/**
 * Reconcile Provider State — Durable worker job handler
 *
 * §11.12: Backstop for missed webhooks, stuck cases, expired approvals,
 * and monitoring deadlines. Runs from the daily cron reconciliation loop.
 *
 * For each workspace: re-runs Stripe reconciliation on active subscriptions
 * and closes monitoring cases that have passed their outcome deadline.
 */

import { SupabaseClient } from '@supabase/supabase-js';
import { JobExecutionContext, JobExecutionResult } from '@/jobs/types';
import { transitionRecoveryCase } from '@/recovery/transitions';

export async function handleReconcileProviderState(
  supabase: SupabaseClient,
  context: JobExecutionContext
): Promise<JobExecutionResult> {
  const payload = context.job.payload;
  const workspaceId = context.workspaceId || payload.workspaceId;

  if (!workspaceId) {
    throw new Error('reconcile_provider_state requires workspaceId');
  }

  const now = new Date().toISOString();
  let reconciledCases = 0;
  let expiredApprovals = 0;

  // 1. Expire the exact draft approval lifetime. Critical cases use a shorter
  // TTL, so the per-draft timestamp is authoritative rather than a global
  // back-calculation from the case's approved_at.
  const { data: expiredDrafts, error: staleErr } = await supabase
    .from('follow_up_drafts')
    .select('id, recovery_case_id, content_hash')
    .eq('workspace_id', workspaceId)
    .eq('status', 'ready_to_send')
    .not('recovery_case_id', 'is', null)
    .lt('approval_expires_at', now);

  if (staleErr) throw staleErr;

  for (const draft of expiredDrafts ?? []) {
    if (!draft.recovery_case_id) continue;

    await transitionRecoveryCase(supabase, {
      workspaceId,
      caseId: draft.recovery_case_id,
      targetStatus: 'awaiting_approval',
      actorType: 'system',
      actorId: 'reconcile_provider_state',
      eventType: 'approval_expired',
      detail: { reason: 'Draft-specific approval TTL elapsed; re-verification queued' },
      workflowJobId: context.job.id,
    });

    const { error: resetDraftError } = await supabase
      .from('follow_up_drafts')
      .update({
        status: 'needs_review',
        approved_at: null,
        approved_by_actor: null,
        approved_content_hash: null,
        approval_expires_at: null,
        approval_metadata: {},
        send_idempotency_key: null,
        send_error: null,
      })
      .eq('id', draft.id)
      .eq('workspace_id', workspaceId);
    if (resetDraftError) throw new Error(`Failed to reset expired draft ${draft.id}: ${resetDraftError.message}`);

    const verifyKey = `ws:${workspaceId}:draft:${draft.id}:verify:expiry:${draft.content_hash}`;
    const { error: verifyEnqueueError } = await supabase.from('workflow_jobs').upsert(
      {
        workspace_id: workspaceId,
        recovery_case_id: draft.recovery_case_id,
        job_type: 'verify_case_draft',
        idempotency_key: verifyKey,
        status: 'pending',
        priority: 30,
        payload: {
          workspaceId,
          recoveryCaseId: draft.recovery_case_id,
          draftId: draft.id,
          contentHash: draft.content_hash,
          reason: 'approval_expired',
        },
        next_attempt_at: now,
      },
      { onConflict: 'idempotency_key', ignoreDuplicates: true }
    );
    if (verifyEnqueueError) throw new Error(`Failed to queue re-verification: ${verifyEnqueueError.message}`);
    expiredApprovals += 1;
  }

  // 2. Classify monitoring cases that have passed their outcome deadline
  const { data: deadlinePassed, error: deadlineErr } = await supabase
    .from('recovery_cases')
    .select('id, workspace_id, mrr_baseline_cents')
    .eq('workspace_id', workspaceId)
    .eq('status', 'monitoring')
    .lt('outcome_deadline_at', now);

  if (deadlineErr) throw deadlineErr;

  for (const expiredCase of deadlinePassed ?? []) {
    // Enqueue outcome classification rather than transitioning directly
    const idempotencyKey = `ws:${workspaceId}:case:${expiredCase.id}:classify:deadline_expired:v1`;

    await supabase.from('workflow_jobs').upsert(
      {
        workspace_id: workspaceId,
        recovery_case_id: expiredCase.id,
        job_type: 'classify_case_outcome',
        idempotency_key: idempotencyKey,
        status: 'pending',
        priority: 50,
        payload: {
          workspaceId,
          recoveryCaseId: expiredCase.id,
          trigger: 'deadline_expired',
          occurredAt: now,
        },
        next_attempt_at: now,
      },
      { onConflict: 'idempotency_key', ignoreDuplicates: true }
    );

    reconciledCases += 1;
  }

  return {
    success: true,
    workspaceId,
  };
}
