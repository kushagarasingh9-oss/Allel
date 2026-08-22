/**
 * Recovery Case Transitions
 *
 * §40.16: All state changes use the atomic transition primitive.
 * §40.6.6: Uses the transition_recovery_case database RPC for atomicity.
 */

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
  // §40.16: First try atomic database RPC
  try {
    return await transitionViaRpc(supabase, params);
  } catch (rpcErr) {
    // If the RPC doesn't exist (e.g. migration not applied yet), fall back to TypeScript
    const message = rpcErr instanceof Error ? rpcErr.message : String(rpcErr);
    if (message.includes('function') && message.includes('does not exist')) {
      console.warn('[transitions] transition_recovery_case RPC not available, using fallback');
      return await transitionFallback(supabase, params);
    }
    throw rpcErr;
  }
}

/**
 * §40.6.6: Atomic transition via database function.
 * Locks row, validates state, updates status, appends event — all in one transaction.
 */
async function transitionViaRpc(
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
    suppressionReason?: string | null;
  }
): Promise<RecoveryCase> {
  // We need the current status for the RPC. Load it first.
  const { data: current, error: fetchError } = await supabase
    .from('recovery_cases')
    .select('status')
    .eq('id', params.caseId)
    .eq('workspace_id', params.workspaceId)
    .single();

  if (fetchError || !current) {
    throw new Error(`Case ${params.caseId} not found: ${fetchError?.message}`);
  }

  const { data: result, error: rpcError } = await supabase.rpc('transition_recovery_case', {
    p_workspace_id: params.workspaceId,
    p_case_id: params.caseId,
    p_current_status: current.status,
    p_target_status: params.targetStatus,
    p_actor_type: params.actorType,
    p_actor_id: params.actorId || 'system',
    p_event_type: params.eventType,
    p_detail: params.detail || {},
    p_workflow_job_id: params.workflowJobId || null,
    p_resolution_type: typeof params.resolution === 'string' ? params.resolution : null,
    p_suppression_reason: params.suppressionReason || null,
  });

  if (rpcError) {
    throw new Error(`transition_recovery_case RPC failed: ${rpcError.message}`);
  }

  const row = Array.isArray(result) ? result[0] : result;
  if (!row) {
    throw new Error(`transition_recovery_case returned no result`);
  }

  return mapDbToRecoveryCase(row);
}

/**
 * Fallback: TypeScript-level transition when RPC is not yet deployed.
 * Uses optimistic concurrency via status check.
 */
async function transitionFallback(
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

  // 3. Build update payload
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

  // 4. Update case with optimistic concurrency
  const { data: updated, error: updateError } = await supabase
    .from('recovery_cases')
    .update(updates)
    .eq('id', params.caseId)
    .eq('status', currentStatus) // Optimistic lock on current status
    .select('*')
    .single();

  if (updateError || !updated) {
    throw new Error(`Failed to transition case (concurrent modification?): ${updateError?.message}`);
  }

  // 5. Append immutable case event
  const { error: eventError } = await supabase.from('recovery_case_events').insert({
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

  if (eventError) {
    // §40.16: No transition may silently ignore event-insert failure
    console.error('[transitions] failed to insert case event:', eventError.message);
    throw new Error(`Transition succeeded but event insert failed: ${eventError.message}`);
  }

  return mapDbToRecoveryCase(updated);
}
