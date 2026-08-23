/**
 * Worker — Durable job processing engine
 *
 * §40.15: Bounded concurrency, lease ownership, crash-safe child-job creation.
 * §40.15.5: No-op handlers throw NOT_IMPLEMENTED.
 */

import { SupabaseClient } from '@supabase/supabase-js';
import { JobExecutionContext, JobExecutionResult, JobType, WorkflowJob } from './types';
import { claimWorkflowJobs, completeWorkflowJob, enqueueWorkflowJob, failWorkflowJob, heartbeatJob } from './queue';
import { handleProcessProviderEvent } from './handlers/process-provider-event';
import { handleProjectAccountFeatures } from './handlers/project-account-features';
import { handleEvaluateRecoveryCase } from './handlers/evaluate-recovery-case';
import { handleRunCaseAnalysis } from './handlers/run-case-analysis';
import { handleGenerateCaseDraft } from './handlers/generate-case-draft';
import { handleVerifyCaseDraft } from './handlers/verify-case-draft';
import { handleNotifyFounder } from './handlers/notify-founder';
import { handleSendApprovedDraft } from './handlers/send-approved-draft';
import { handleSyncGmailHistory } from './handlers/sync-gmail-history';
import { handleClassifyCaseOutcome } from './handlers/classify-case-outcome';
import { RECOVERY_CONFIG } from '../recovery/config';

/**
 * §40.15.5: No-op handlers must NOT return success without doing work.
 */
class NotImplementedError extends Error {
  readonly retryable = false;
  readonly code = 'NOT_IMPLEMENTED';
  constructor(jobType: string) {
    super(`Job type '${jobType}' is registered but not yet implemented`);
    this.name = 'NotImplementedError';
  }
}

/**
 * §40.15: Job types that call the LLM and may take longer than the default lease.
 * These get a heartbeat interval so the lease is renewed during model execution.
 */
const MODEL_JOB_TYPES = new Set<JobType>([
  'run_case_analysis',
  'generate_case_draft',
  'verify_case_draft',
]);

export const JOB_HANDLERS: Record<JobType, (supabase: SupabaseClient, ctx: JobExecutionContext) => Promise<JobExecutionResult>> = {
  process_provider_event: handleProcessProviderEvent,
  project_account_features: handleProjectAccountFeatures,
  evaluate_recovery_case: handleEvaluateRecoveryCase,
  run_case_analysis: handleRunCaseAnalysis,
  generate_case_draft: handleGenerateCaseDraft,
  verify_case_draft: handleVerifyCaseDraft,
  notify_founder: handleNotifyFounder,
  send_approved_draft: handleSendApprovedDraft,
  sync_gmail_history: handleSyncGmailHistory,
  classify_case_outcome: handleClassifyCaseOutcome,
  // §40.15.5: These must not return success without work
  refresh_founder_brief: async () => { throw new NotImplementedError('refresh_founder_brief'); },
  reconcile_provider_state: async () => { throw new NotImplementedError('reconcile_provider_state'); },
};

export async function processSingleJob(
  supabase: SupabaseClient,
  job: WorkflowJob,
  workerId: string
): Promise<JobExecutionResult> {
  const handler = JOB_HANDLERS[job.jobType];

  if (!handler) {
    await failWorkflowJob(supabase, job, new Error(`No handler registered for job type: ${job.jobType}`), workerId);
    return { success: false, errorCode: 'UNKNOWN_JOB_TYPE', retryable: false };
  }

  const context: JobExecutionContext = {
    workerId,
    workspaceId: job.workspaceId || '',
    job,
  };

  // §40.15 (§11.10): Renew lease at 1/3 of the lease duration for model-stage jobs.
  // This prevents a slow LLM call from letting the lease expire and being re-claimed
  // by another worker, which would cause duplicate model execution.
  let heartbeatInterval: ReturnType<typeof setInterval> | null = null;
  if (MODEL_JOB_TYPES.has(job.jobType)) {
    const heartbeatMs = Math.floor(RECOVERY_CONFIG.MODEL_JOB_LEASE_SECONDS * 1000 * RECOVERY_CONFIG.JOB_HEARTBEAT_FRACTION);
    heartbeatInterval = setInterval(async () => {
      const renewed = await heartbeatJob(supabase, job.id, workerId, RECOVERY_CONFIG.MODEL_JOB_LEASE_SECONDS);
      if (!renewed) {
        // Lost lease — the interval will keep firing but the completion check will catch it
        console.warn(`[worker] heartbeat lost lease on job ${job.id} (${job.jobType})`);
      }
    }, heartbeatMs);
  }

  try {
    const result = await handler(supabase, context);

    if (result.success) {
      // §40.15.3: Enqueue child BEFORE completing parent (crash-safe)
      if (result.nextJob) {
        await enqueueWorkflowJob(supabase, {
          workspaceId: result.nextJob.workspaceId || job.workspaceId,
          recoveryCaseId: result.nextJob.recoveryCaseId || job.recoveryCaseId,
          webhookEventId: result.nextJob.webhookEventId || job.webhookEventId,
          jobType: result.nextJob.jobType,
          idempotencyKey: result.nextJob.idempotencyKey,
          payload: result.nextJob.payload,
          priority: result.nextJob.priority,
        });
      }

      // §40.15.1: Complete job with lease ownership check
      await completeWorkflowJob(supabase, job.id, workerId);

      return result;
    } else {
      await failWorkflowJob(supabase, job, result.error || new Error('Job reported failure'), workerId);
      return result;
    }
  } catch (err) {
    await failWorkflowJob(supabase, job, err, workerId);
    return { success: false, error: err instanceof Error ? err : new Error(String(err)) };
  } finally {
    // Always clear the heartbeat interval when job finishes (success or failure)
    if (heartbeatInterval !== null) {
      clearInterval(heartbeatInterval);
    }
  }
}

export async function drainWorkflowQueue(
  supabase: SupabaseClient,
  options?: {
    workerId?: string;
    batchSize?: number;
    maxRuns?: number;
    deadlineMs?: number;
  }
): Promise<{
  claimed: number;
  completed: number;
  retried: number;
  deadLettered: number;
  durationMs: number;
}> {
  const startTime = Date.now();
  const workerId = options?.workerId || `worker_${Math.random().toString(36).slice(2, 9)}`;
  const batchSize = options?.batchSize || RECOVERY_CONFIG.WORKER_BATCH_SIZE;
  const deadlineMs = options?.deadlineMs || 55_000; // §40.15.4: Respect route timeout

  // Claim batch
  const jobs = await claimWorkflowJobs(supabase, workerId, batchSize, RECOVERY_CONFIG.JOB_LEASE_SECONDS);

  let completed = 0;
  let retried = 0;
  let deadLettered = 0;

  // §40.15.4: Use WORKER_CONCURRENCY for bounded pool
  const concurrency = parseInt(process.env.WORKER_CONCURRENCY || '3', 10);

  // Process in bounded concurrent batches
  for (let i = 0; i < jobs.length; i += concurrency) {
    // §40.15.4: Stop claiming new work before the deadline
    if (Date.now() - startTime > deadlineMs) {
      console.warn(`[worker] deadline approaching, processed ${completed}/${jobs.length} jobs`);
      break;
    }

    const batch = jobs.slice(i, i + concurrency);
    const results = await Promise.all(
      batch.map(job => processSingleJob(supabase, job, workerId))
    );

    for (let j = 0; j < results.length; j++) {
      const result = results[j];
      const job = batch[j];
      if (result.success) {
        completed++;
      } else {
        if (job.attemptCount >= job.maxAttempts) {
          deadLettered++;
        } else {
          retried++;
        }
      }
    }
  }

  return {
    claimed: jobs.length,
    completed,
    retried,
    deadLettered,
    durationMs: Date.now() - startTime,
  };
}
