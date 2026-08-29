export type JobType =
  | 'process_provider_event'
  | 'project_account_features'
  | 'evaluate_recovery_case'
  | 'run_case_analysis'
  | 'generate_case_draft'
  | 'verify_case_draft'
  | 'notify_founder'
  | 'send_approved_draft'
  | 'sync_gmail_history'
  | 'classify_case_outcome'
  | 'refresh_founder_brief'
  | 'reconcile_provider_state';

export type JobStatus = 'pending' | 'running' | 'completed' | 'failed' | 'dead_letter' | 'cancelled';

export type WorkflowJob<TPayload = Record<string, any>> = {
  id: string;
  workspaceId: string | null;
  recoveryCaseId: string | null;
  webhookEventId: string | null;
  scenarioRunId: string | null;
  jobType: JobType;
  idempotencyKey: string;
  status: JobStatus;
  priority: number;
  payload: TPayload;
  attemptCount: number;
  maxAttempts: number;
  nextAttemptAt: string;
  leaseOwner: string | null;
  leaseExpiresAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  lastErrorCode: string | null;
  lastErrorMessage: string | null;
  lastErrorAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type JobExecutionContext = {
  workerId: string;
  workspaceId: string;
  job: WorkflowJob;
};

export type JobExecutionResult = {
  success: boolean;
  workspaceId?: string;
  error?: Error;
  errorCode?: string;
  retryable?: boolean;
  nextJob?: {
    jobType: JobType;
    idempotencyKey: string;
    payload: Record<string, any>;
    workspaceId?: string | null;
    priority?: number;
    recoveryCaseId?: string | null;
    webhookEventId?: string | null;
    scenarioRunId?: string | null;
  };
};

export type JobHandler = (
  context: JobExecutionContext
) => Promise<JobExecutionResult>;
