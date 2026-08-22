import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { ensureWorkspaceForUser } from '@/lib/workspaces/ensure-workspace';
import { enqueueWorkflowJob } from '@/lib/jobs/queue';

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
    const { data: recoveryCase, error: caseError } = await supabase
      .from('recovery_cases')
      .select('*')
      .eq('id', caseId)
      .eq('workspace_id', workspace.id)
      .single();

    if (caseError || !recoveryCase) {
      return NextResponse.json({ error: 'Case not found' }, { status: 404 });
    }

    // Append replay audit event
    await supabase.from('recovery_case_events').insert({
      workspace_id: workspace.id,
      recovery_case_id: caseId,
      event_type: 'operator_replay_requested',
      actor_type: 'founder',
      actor_id: user.id,
      detail: { requestedAt: new Date().toISOString() },
    });

    // Enqueue evaluation job
    const idempotencyKey = `ws:${workspace.id}:case:${caseId}:replay:${Date.now()}`;
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
    return NextResponse.json(
      { error: 'Failed to replay case', detail: error.message },
      { status: 500 }
    );
  }
}
