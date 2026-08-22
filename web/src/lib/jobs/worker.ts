import { SupabaseClient } from '@supabase/supabase-js';
import { JobExecutionContext, JobExecutionResult, JobHandler, JobType, WorkflowJob } from './types';
import { claimWorkflowJobs, completeWorkflowJob, enqueueWorkflowJob, failWorkflowJob } from './queue';
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
  refresh_founder_brief: async () => ({ success: true }),
  reconcile_provider_state: async () => ({ success: true }),
};

export async function processSingleJob(
  supabase: SupabaseClient,
  job: WorkflowJob,
  workerId: string
): Promise<JobExecutionResult> {
  const handler = JOB_HANDLERS[job.jobType];

  if (!handler) {
    await failWorkflowJob(supabase, job, new Error(`No handler registered for job type: ${job.jobType}`));
    return { success: false, errorCode: 'UNKNOWN_JOB_TYPE', retryable: false };
  }

  const context: JobExecutionContext = {
    workerId,
    workspaceId: job.workspaceId || '',
    job,
  };

  try {
    const result = await handler(supabase, context);

    if (result.success) {
      // 1. Complete job
      await completeWorkflowJob(supabase, job.id);

      // 2. Enqueue next dependent job if requested
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

      return result;
    } else {
      await failWorkflowJob(supabase, job, result.error || new Error('Job reported failure'));
      return result;
    }
  } catch (err) {
    await failWorkflowJob(supabase, job, err);
    return { success: false, error: err instanceof Error ? err : new Error(String(err)) };
  }
}

export async function drainWorkflowQueue(
  supabase: SupabaseClient,
  options?: {
    workerId?: string;
    batchSize?: number;
    maxRuns?: number;
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

  // Claim batch
  const jobs = await claimWorkflowJobs(supabase, workerId, batchSize, RECOVERY_CONFIG.JOB_LEASE_SECONDS);

  let completed = 0;
  let retried = 0;
  let deadLettered = 0;

  // Process sequentially or bounded parallel
  for (const job of jobs) {
    const result = await processSingleJob(supabase, job, workerId);
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

  return {
    claimed: jobs.length,
    completed,
    retried,
    deadLettered,
    durationMs: Date.now() - startTime,
  };
}
