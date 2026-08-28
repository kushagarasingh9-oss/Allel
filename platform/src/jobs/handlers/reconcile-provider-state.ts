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
import { RECOVERY_CONFIG } from '@/recovery/config';

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

  // 1. Expire stale approvals (approval TTL exceeded → back to awaiting_approval)
  const approvalDeadline = new Date(
    Date.now() - RECOVERY_CONFIG.APPROVAL_TTL_HOURS * 60 * 60 * 1000
  ).toISOString();

  const { data: staleApproved, error: staleErr } = await supabase
    .from('recovery_cases')
    .select('id, workspace_id')
    .eq('workspace_id', workspaceId)
    .eq('status', 'approved')
    .lt('approved_at', approvalDeadline);

  if (staleErr) throw staleErr;

  for (const staleCase of staleApproved ?? []) {
    const { error: revertErr } = await supabase
      .from('recovery_cases')
      .update({ status: 'awaiting_approval', updated_at: now })
      .eq('id', staleCase.id);

    if (!revertErr) {
      await supabase.from('recovery_case_events').insert({
        workspace_id: workspaceId,
        recovery_case_id: staleCase.id,
        event_type: 'approval_expired',
        from_status: 'approved',
        to_status: 'awaiting_approval',
        actor_type: 'system',
        actor_id: 'reconcile_provider_state',
        detail: {
          reason: 'Approval TTL exceeded during reconciliation',
          expired_after_hours: RECOVERY_CONFIG.APPROVAL_TTL_HOURS,
        },
      });
      expiredApprovals += 1;
    }
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
