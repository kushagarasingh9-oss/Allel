import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/foundation/database/server';
import { ensureWorkspaceForUser } from '@/data/workspaces/ensure-workspace';
import { enqueueWorkflowJob } from '@/jobs/queue';
import { RecoveryApiError, requireWorkspaceRole } from '@/recovery/api-auth';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ caseId: string }> }
) {
  const { caseId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const workspace = await ensureWorkspaceForUser(user);

  try {
    await requireWorkspaceRole(supabase, {
      workspaceId: workspace.id,
      userId: user.id,
      roles: ['owner', 'admin'],
    });

    const { data: recoveryCase, error: caseError } = await supabase
      .from('recovery_cases')
      .select('id, customer_account_id, trigger_provider, mrr_baseline_cents, status, updated_at')
      .eq('id', caseId)
      .eq('workspace_id', workspace.id)
      .single();

    if (caseError || !recoveryCase) {
      return NextResponse.json({ error: 'Case not found' }, { status: 404 });
    }

    if (!['open', 'analyzing'].includes(recoveryCase.status)) {
      return NextResponse.json(
        { error: 'Case is not replayable in its current state', code: 'CASE_NOT_REPLAYABLE' },
        { status: 409 }
      );
    }

    const { data: activeJob, error: activeJobError } = await supabase
      .from('workflow_jobs')
      .select('id')
      .eq('workspace_id', workspace.id)
      .eq('recovery_case_id', caseId)
      .in('status', ['pending', 'running'])
      .limit(1)
      .maybeSingle();
    if (activeJobError) throw new Error(`Failed to validate replay state: ${activeJobError.message}`);
    if (activeJob) {
      return NextResponse.json(
        { error: 'Case already has an active workflow job', code: 'CASE_REPLAY_IN_PROGRESS' },
        { status: 409 }
      );
    }

    // Append replay audit event
    const { error: auditError } = await supabase.from('recovery_case_events').insert({
      workspace_id: workspace.id,
      recovery_case_id: caseId,
      event_type: 'operator_replay_requested',
      actor_type: 'founder',
      actor_id: user.id,
      detail: { requestedAt: new Date().toISOString() },
    });
    if (auditError) throw new Error(`Failed to record replay audit event: ${auditError.message}`);

    // Enqueue evaluation job
    const idempotencyKey = `ws:${workspace.id}:case:${caseId}:replay:${recoveryCase.updated_at}`;
    const { job } = await enqueueWorkflowJob(supabase, {
      workspaceId: workspace.id,
      recoveryCaseId: caseId,
      jobType: 'evaluate_recovery_case',
      idempotencyKey,
      payload: {
        workspaceId: workspace.id,
        customerAccountId: recoveryCase.customer_account_id,
        triggerProvider: recoveryCase.trigger_provider,
        triggerEventType: 'operator_replay',
        mrrBaselineCents: recoveryCase.mrr_baseline_cents,
      },
    });

    return NextResponse.json({
      replayed: true,
      caseId,
      jobId: job?.id,
    });
  } catch (error: any) {
    console.error(`[api/recovery/cases/${caseId}/replay] Failed replay`, error);
    if (error instanceof RecoveryApiError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    return NextResponse.json(
      { error: 'Failed to replay case', code: 'RECOVERY_CASE_REPLAY_FAILED' },
      { status: 500 }
    );
  }
}
