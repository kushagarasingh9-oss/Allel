import { createServiceClient } from '@/foundation/database/service'
import { sanitizeJsonRecord } from '@/foundation/utils/json-metadata'

export type AgentRunLogRecord = {
  workspaceId: string
  runType: string
  status?: 'running' | 'completed' | 'failed'
  customerAccountId?: string | null
  inputSummary?: string | null
  outputSummary?: string | null
  error?: string | null
  durationMs?: number | null
  modelUsed?: string | null
  tokensUsed?: number | null
  costCents?: number | null
  metadata?: Record<string, unknown>
  workflowId?: string | null
  stage?: string | null
  personaId?: string | null
  provider?: string | null
  jobIndex?: number | null
  parentRunId?: string | null
  retryCount?: number | null
  errorCount?: number | null
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const LOG_AGENT_RUN_MAX_ATTEMPTS = 3
let logAgentRunFailureCount = 0

function coerceNullableString(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0 ? value : null
}

function coerceNullableInteger(value: unknown) {
  return typeof value === 'number' && Number.isInteger(value) ? value : null
}

function buildAgentRunInsertPayload(record: AgentRunLogRecord) {
  const sanitizedMetadata = sanitizeJsonRecord(record.metadata ?? {})
  const workflowId = coerceNullableString(record.workflowId ?? sanitizedMetadata.workflowId)
  const stage = coerceNullableString(record.stage ?? sanitizedMetadata.stage)
  const personaId = coerceNullableString(record.personaId ?? sanitizedMetadata.personaId)
  const provider = coerceNullableString(record.provider ?? sanitizedMetadata.provider)
  const jobIndex = coerceNullableInteger(record.jobIndex ?? sanitizedMetadata.jobIndex)
  const parentRunId = coerceNullableString(record.parentRunId ?? sanitizedMetadata.parentRunId)
  const retryCount =
    coerceNullableInteger(record.retryCount ?? sanitizedMetadata.retryCount) ?? 0
  const errorCount =
    coerceNullableInteger(record.errorCount ?? sanitizedMetadata.errorCount) ??
    (record.status === 'failed' || record.error ? 1 : 0)

  delete sanitizedMetadata.workflowId
  delete sanitizedMetadata.stage
  delete sanitizedMetadata.personaId
  delete sanitizedMetadata.provider
  delete sanitizedMetadata.jobIndex
  delete sanitizedMetadata.parentRunId
  delete sanitizedMetadata.retryCount
  delete sanitizedMetadata.errorCount

  return {
    workspace_id: record.workspaceId,
    customer_account_id: record.customerAccountId ?? null,
    run_type: record.runType,
    status: record.status ?? 'completed',
    input_summary: record.inputSummary ?? null,
    output_summary: record.outputSummary ?? null,
    error: record.error ?? null,
    duration_ms: record.durationMs ?? null,
    model_used: record.modelUsed ?? null,
    tokens_used: record.tokensUsed ?? null,
    cost_cents: record.costCents ?? null,
    workflow_id: workflowId,
    stage,
    persona_id: personaId,
    provider,
    job_index: jobIndex,
    parent_run_id: parentRunId && UUID_PATTERN.test(parentRunId) ? parentRunId : null,
    retry_count: retryCount,
    error_count: errorCount,
    metadata: sanitizedMetadata,
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export async function logAgentRun(record: AgentRunLogRecord) {
  const payload = buildAgentRunInsertPayload(record)

  try {
    const supabase = createServiceClient()
    let lastError: unknown = null

    for (let attempt = 1; attempt <= LOG_AGENT_RUN_MAX_ATTEMPTS; attempt += 1) {
      const { error } = await supabase.from('agent_runs').insert(payload)

      if (!error) {
        return { ok: true, attempts: attempt }
      }

      lastError = error

      if (attempt < LOG_AGENT_RUN_MAX_ATTEMPTS) {
        await sleep(25 * attempt)
      }
    }

    logAgentRunFailureCount += 1
    console.error('[agent-run-logger] Failed to insert agent_runs row after retries', {
      attempts: LOG_AGENT_RUN_MAX_ATTEMPTS,
      failureCount: logAgentRunFailureCount,
      workflowId: payload.workflow_id,
      stage: payload.stage,
      provider: payload.provider,
      error: lastError,
    })
    return { ok: false, attempts: LOG_AGENT_RUN_MAX_ATTEMPTS }
  } catch (error) {
    logAgentRunFailureCount += 1
    console.error('[agent-run-logger] Unexpected logging failure', {
      failureCount: logAgentRunFailureCount,
      workflowId: payload.workflow_id,
      stage: payload.stage,
      provider: payload.provider,
      error,
    })
    return { ok: false, attempts: 0 }
  }
}
