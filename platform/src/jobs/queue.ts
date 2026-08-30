import { SupabaseClient } from '@supabase/supabase-js';
import { JobType, WorkflowJob } from './types';
import { isRetryableError, computeNextAttemptTime } from './retry';
import { RECOVERY_CONFIG } from '../recovery/config';

export async function enqueueWorkflowJob(
  supabase: SupabaseClient,
  params: {
    workspaceId?: string | null;
    recoveryCaseId?: string | null;
    webhookEventId?: string | null;
    scenarioRunId?: string | null;
    jobType: JobType;
    idempotencyKey: string;
    payload?: Record<string, any>;
    priority?: number;
    delaySeconds?: number;
  }
): Promise<{ job: WorkflowJob | null; duplicate: boolean }> {
  const now = new Date();
  const nextAttemptAt = params.delaySeconds
    ? new Date(now.getTime() + params.delaySeconds * 1000).toISOString()
    : now.toISOString();

  const insertData = {
    workspace_id: params.workspaceId || null,
    recovery_case_id: params.recoveryCaseId || null,
    webhook_event_id: params.webhookEventId || null,
    scenario_run_id: params.scenarioRunId || null,
    job_type: params.jobType,
    idempotency_key: params.idempotencyKey,
    status: 'pending',
    priority: params.priority ?? 100,
    payload: params.payload ?? {},
    attempt_count: 0,
    max_attempts: RECOVERY_CONFIG.JOB_MAX_ATTEMPTS,
    next_attempt_at: nextAttemptAt,
    created_at: now.toISOString(),
    updated_at: now.toISOString(),
  };

  const { data, error } = await supabase
    .from('workflow_jobs')
    .insert(insertData)
    .select('*')
    .maybeSingle();

  if (error) {
    // Unique violation on idempotency_key means it was already enqueued
    if (error.code === '23505') {
      const { data: existing } = await supabase
        .from('workflow_jobs')
        .select('*')
        .eq('idempotency_key', params.idempotencyKey)
        .maybeSingle();
      return { job: existing ? mapDbToWorkflowJob(existing) : null, duplicate: true };
    }
    throw new Error(`Failed to enqueue workflow job: ${error.message}`);
  }

  return { job: data ? mapDbToWorkflowJob(data) : null, duplicate: false };
}

export async function claimWorkflowJobs(
  supabase: SupabaseClient,
  workerId: string,
  batchSize: number = RECOVERY_CONFIG.WORKER_BATCH_SIZE,
  leaseSeconds: number = RECOVERY_CONFIG.JOB_LEASE_SECONDS
): Promise<WorkflowJob[]> {
  const { data, error } = await supabase.rpc('claim_workflow_jobs', {
    p_worker_id: workerId,
    p_batch_size: batchSize,
    p_lease_seconds: leaseSeconds,
  });

  if (error) {
    if (error.code === 'PGRST202') {
      // Fallback query when RPC is not in schema cache
      const now = new Date().toISOString();
      const leaseExpiresAt = new Date(Date.now() + leaseSeconds * 1000).toISOString();

      const { data: pendingJobs } = await supabase
        .from('workflow_jobs')
        .select('*')
        .eq('status', 'pending')
        .lte('next_attempt_at', now)
        .order('priority', { ascending: true })
        .order('created_at', { ascending: true })
        .limit(batchSize);

      if (!pendingJobs || pendingJobs.length === 0) return [];

      const claimed: WorkflowJob[] = [];
      for (const row of pendingJobs) {
        const { data: updated } = await supabase
          .from('workflow_jobs')
          .update({
            status: 'running',
            lease_owner: workerId,
            lease_expires_at: leaseExpiresAt,
            started_at: now,
            attempt_count: (row.attempt_count || 0) + 1,
            updated_at: now,
          })
          .eq('id', row.id)
          .eq('status', 'pending')
          .select('*')
          .maybeSingle();

        if (updated) {
          claimed.push(mapDbToWorkflowJob(updated));
        }
      }
      return claimed;
    }
    throw new Error(`Failed to claim workflow jobs via RPC: ${error.message}`);
  }

  return (data || []).map(mapDbToWorkflowJob);
}

export async function heartbeatJob(
  supabase: SupabaseClient,
  jobId: string,
  workerId: string,
  leaseSeconds: number = RECOVERY_CONFIG.JOB_LEASE_SECONDS
): Promise<boolean> {
  const leaseExpiresAt = new Date(Date.now() + leaseSeconds * 1000).toISOString();
  const { data, error } = await supabase
    .from('workflow_jobs')
    .update({
      lease_expires_at: leaseExpiresAt,
      updated_at: new Date().toISOString(),
    })
    .eq('id', jobId)
    .eq('lease_owner', workerId)
    .eq('status', 'running')
    .select('id')
    .maybeSingle();

  return !error && Boolean(data);
}

export async function completeWorkflowJob(
  supabase: SupabaseClient,
  jobId: string,
  workerId?: string
): Promise<void> {
  const now = new Date().toISOString();
  // §40.15.1: Require lease ownership on completion
  let query = supabase
    .from('workflow_jobs')
    .update({
      status: 'completed',
      completed_at: now,
      lease_owner: null,
      lease_expires_at: null,
      updated_at: now,
    })
    .eq('id', jobId)
    .eq('status', 'running');

  if (workerId) {
    query = query.eq('lease_owner', workerId);
  }

  const { data, error } = await query.select('id').maybeSingle();

  if (error) {
    throw new Error(`Failed to complete job ${jobId}: ${error.message}`);
  }
  if (!data) {
    throw new Error(`Lost lease on job ${jobId} — another worker may have reclaimed it`);
  }
}

export async function failWorkflowJob(
  supabase: SupabaseClient,
  job: WorkflowJob,
  error: unknown,
  workerId?: string
): Promise<{ status: 'failed' | 'dead_letter'; nextAttemptAt?: string }> {
  const now = new Date().toISOString();
  const retryable = isRetryableError(error);
  const errMsg = error instanceof Error ? error.message : String(error);
  const errCode = (error as any)?.code ? String((error as any).code) : 'EXECUTION_ERROR';

  const willRetry = retryable && job.attemptCount < job.maxAttempts;
  const status = willRetry ? 'pending' : 'dead_letter';
  const nextAttemptAt = willRetry ? computeNextAttemptTime(job.attemptCount) : undefined;

  // §40.15.1: Include lease ownership in fail update
  let query = supabase
    .from('workflow_jobs')
    .update({
      status,
      next_attempt_at: nextAttemptAt || now,
      lease_owner: null,
      lease_expires_at: null,
      error: errMsg.slice(0, 1000),
      updated_at: now,
    })
    .eq('id', job.id)
    .eq('status', 'running');

  if (workerId) {
    query = query.eq('lease_owner', workerId);
  }

  const { error: updateError } = await query;

  if (updateError) {
    console.error(`[queue] failed to update job ${job.id} to ${status}:`, updateError.message);
  }

  return { status: status as 'failed' | 'dead_letter', nextAttemptAt };
}

function mapDbToWorkflowJob(row: Record<string, any>): WorkflowJob {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    recoveryCaseId: row.recovery_case_id,
    webhookEventId: row.webhook_event_id,
    scenarioRunId: row.scenario_run_id || null,
    jobType: row.job_type,
    idempotencyKey: row.idempotency_key,
    status: row.status,
    priority: row.priority,
    payload: row.payload || {},
    attemptCount: row.attempt_count,
    maxAttempts: row.max_attempts,
    nextAttemptAt: row.next_attempt_at,
    leaseOwner: row.lease_owner,
    leaseExpiresAt: row.lease_expires_at,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    lastErrorCode: row.last_error_code,
    lastErrorMessage: row.last_error_message,
    lastErrorAt: row.last_error_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
