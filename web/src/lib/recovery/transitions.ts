import { SupabaseClient } from '@supabase/supabase-js';
import { ActorType, CaseResolution, CaseStatus, RecoveryCase } from './types';
import { mapDbToRecoveryCase } from './cases';

export const LEGAL_TRANSITIONS: Record<CaseStatus, CaseStatus[]> = {
  open: ['analyzing', 'suppressed', 'resolved', 'failed'],
  analyzing: ['action_proposed', 'suppressed', 'failed'],
  action_proposed: ['awaiting_approval', 'suppressed', 'failed'],
  awaiting_approval: ['approved', 'suppressed', 'resolved', 'failed'],
  approved: ['sent', 'awaiting_approval', 'failed'],
  sent: ['monitoring', 'failed'],
  monitoring: ['resolved', 'failed'],
  resolved: [],
  suppressed: [],
  failed: ['open', 'resolved'],
};

export async function transitionRecoveryCase(
  supabase: SupabaseClient,
  params: {
    workspaceId: string;
    caseId: string;
    targetStatus: CaseStatus;
    resolution?: CaseResolution | null;
    actorType: ActorType;
    actorId?: string | null;
    eventType: string;
    detail?: Record<string, unknown>;
    workflowJobId?: string | null;
    agentRunId?: string | null;
    suppressionReason?: string | null;
  }
): Promise<RecoveryCase> {
  const now = new Date().toISOString();

  // 1. Fetch current case
  const { data: current, error: fetchError } = await supabase
    .from('recovery_cases')
    .select('*')
    .eq('workspace_id', params.workspaceId)
    .eq('id', params.caseId)
    .single();

  if (fetchError || !current) {
    throw new Error(`Case ${params.caseId} not found in workspace ${params.workspaceId}`);
  }

  const currentStatus = current.status as CaseStatus;

  // 2. Validate transition legality
  const allowed = LEGAL_TRANSITIONS[currentStatus] || [];
  if (!allowed.includes(params.targetStatus)) {
    throw new Error(`Illegal state transition from ${currentStatus} to ${params.targetStatus} for case ${params.caseId}`);
  }

  // 3. Prepare update payload with appropriate timestamps
  const updates: Record<string, any> = {
    status: params.targetStatus,
    updated_at: now,
  };

  if (params.targetStatus === 'awaiting_approval') {
    updates.awaiting_approval_at = now;
  } else if (params.targetStatus === 'approved') {
    updates.approved_at = now;
  } else if (params.targetStatus === 'sent') {
    updates.sent_at = now;
  } else if (params.targetStatus === 'monitoring') {
    updates.monitoring_started_at = now;
  } else if (params.targetStatus === 'resolved') {
    if (!params.resolution) {
      throw new Error(`Resolution is required when transitioning case to 'resolved'`);
    }
    updates.resolved_at = now;
    updates.resolution = params.resolution;
  } else if (params.targetStatus === 'suppressed') {
    if (!params.suppressionReason && !current.suppression_reason) {
      throw new Error(`Suppression reason is required when transitioning case to 'suppressed'`);
    }
    if (params.suppressionReason) {
      updates.suppression_reason = params.suppressionReason;
    }
  } else if (params.targetStatus === 'failed') {
    updates.failed_at = now;
  }

  // 4. Update case
  const { data: updated, error: updateError } = await supabase
    .from('recovery_cases')
    .update(updates)
    .eq('id', params.caseId)
    .select('*')
    .single();

  if (updateError || !updated) {
    throw new Error(`Failed to transition case: ${updateError?.message}`);
  }

  // 5. Append immutable case event
  await supabase.from('recovery_case_events').insert({
    workspace_id: params.workspaceId,
    recovery_case_id: params.caseId,
    event_type: params.eventType,
    from_status: currentStatus,
    to_status: params.targetStatus,
    actor_type: params.actorType,
    actor_id: params.actorId || null,
    workflow_job_id: params.workflowJobId || null,
    agent_run_id: params.agentRunId || null,
    detail: params.detail || {},
    created_at: now,
  });

  return mapDbToRecoveryCase(updated);
}
