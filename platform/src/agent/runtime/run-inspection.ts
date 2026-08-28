import type { SupabaseClient } from '@supabase/supabase-js'

type RunInspectionSupabase = Pick<SupabaseClient, 'from'>

const AGENT_RUN_INSPECTION_FIELDS = [
  'id',
  'workspace_id',
  'customer_account_id',
  'run_type',
  'status',
  'input_summary',
  'output_summary',
  'error',
  'duration_ms',
  'model_used',
  'tokens_used',
  'cost_cents',
  'workflow_id',
  'stage',
  'persona_id',
  'provider',
  'job_index',
  'parent_run_id',
  'retry_count',
  'error_count',
  'metadata',
  'created_at',
].join(', ')

type WorkflowSelector =
  | { type: 'workflow_id'; value: string }
  | { type: 'id'; value: string }

type WorkflowListCursor = {
  createdAt: string
  seenWorkflowIds: string[]
}

export type AgentRunInspectionRow = {
  id: string
  workspace_id: string
  customer_account_id: string | null
  run_type: string
  status: string
  input_summary: string | null
  output_summary: string | null
  error: string | null
  duration_ms: number | null
  model_used: string | null
  tokens_used: number | null
  cost_cents: number | null
  workflow_id: string | null
  stage: string | null
  persona_id: string | null
  provider: string | null
  job_index: number | null
  parent_run_id: string | null
  retry_count: number | null
  error_count: number | null
  metadata: Record<string, unknown> | null
  created_at: string
}

export type WorkflowRunStage = {
  id: string
  createdAt: string
  runType: string
  stage: string
  status: string
  customerAccountId: string | null
  inputSummary: string | null
  outputSummary: string | null
  error: string | null
  durationMs: number | null
  modelUsed: string | null
  tokensUsed: number | null
  costCents: number | null
  personaId: string | null
  provider: string | null
  jobIndex: number | null
  parentRunId: string | null
  retryCount: number | null
  errorCount: number | null
  metadata: Record<string, unknown>
}

export type WorkflowRunInspection = {
  workflowId: string
  runType: string
  status: 'completed' | 'failed' | 'running'
  startedAt: string
  finishedAt: string
  customerAccountIds: string[]
  stages: WorkflowRunStage[]
  stageNames: string[]
  providers: string[]
  personas: string[]
  summary: string
  hasFailures: boolean
}

function encodeCursorPayload(payload: WorkflowListCursor) {
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url')
}

export function encodeWorkflowListCursor(payload: WorkflowListCursor) {
  return encodeCursorPayload({
    createdAt: payload.createdAt,
    seenWorkflowIds: [...new Set(payload.seenWorkflowIds)],
  })
}

export function decodeWorkflowListCursor(cursor?: string | null) {
  if (!cursor) return null

  try {
    const parsed = JSON.parse(
      Buffer.from(cursor, 'base64url').toString('utf8')
    ) as Partial<WorkflowListCursor>

    if (typeof parsed.createdAt !== 'string' || parsed.createdAt.length === 0) {
      return null
    }

    return {
      createdAt: parsed.createdAt,
      seenWorkflowIds: Array.isArray(parsed.seenWorkflowIds)
        ? [...new Set(parsed.seenWorkflowIds.filter((value): value is string => typeof value === 'string' && value.length > 0))]
        : [],
    } satisfies WorkflowListCursor
  } catch {
    return null
  }
}

function coerceMetadata(value: unknown) {
  return value && typeof value === 'object'
    ? { ...(value as Record<string, unknown>) }
    : {}
}

function getWorkflowId(row: AgentRunInspectionRow) {
  if (typeof row.workflow_id === 'string' && row.workflow_id.length > 0) {
    return row.workflow_id
  }

  const metadata = coerceMetadata(row.metadata)
  return typeof metadata.workflowId === 'string' && metadata.workflowId.length > 0
    ? metadata.workflowId
    : row.id
}

function getWorkflowSelector(row: AgentRunInspectionRow): WorkflowSelector {
  return typeof row.workflow_id === 'string' && row.workflow_id.length > 0
    ? { type: 'workflow_id', value: row.workflow_id }
    : { type: 'id', value: row.id }
}

function getStageName(row: AgentRunInspectionRow) {
  if (typeof row.stage === 'string' && row.stage.length > 0) {
    return row.stage
  }

  const metadata = coerceMetadata(row.metadata)
  return typeof metadata.stage === 'string' && metadata.stage.length > 0
    ? metadata.stage
    : row.run_type
}

function getProvider(row: AgentRunInspectionRow) {
  if (typeof row.provider === 'string' && row.provider.length > 0) {
    return row.provider
  }

  const metadata = coerceMetadata(row.metadata)
  return typeof metadata.provider === 'string' && metadata.provider.length > 0
    ? metadata.provider
    : null
}

function getPersonaId(row: AgentRunInspectionRow) {
  if (typeof row.persona_id === 'string' && row.persona_id.length > 0) {
    return row.persona_id
  }

  const metadata = coerceMetadata(row.metadata)
  return typeof metadata.personaId === 'string' && metadata.personaId.length > 0
    ? metadata.personaId
    : null
}

function summarizeWorkflow(rows: AgentRunInspectionRow[]) {
  const latestWithOutput = [...rows]
    .reverse()
    .find((row) => row.output_summary && row.output_summary.trim().length > 0)
  const latestFailure = [...rows]
    .reverse()
    .find((row) => row.error && row.error.trim().length > 0)

  return (
    latestFailure?.error ??
    latestWithOutput?.output_summary ??
    `${rows[0]?.run_type ?? 'workflow'} workflow`
  )
}

function getWorkflowStatus(rows: AgentRunInspectionRow[]) {
  if (rows.some((row) => row.status === 'failed')) return 'failed'
  if (rows.some((row) => row.status === 'running')) return 'running'
  return 'completed'
}

function buildWorkflowInspection(rows: AgentRunInspectionRow[]) {
  const orderedRows = [...rows].sort((left, right) =>
    left.created_at.localeCompare(right.created_at)
  )
  const stages = orderedRows.map((row) => {
    const metadata = coerceMetadata(row.metadata)

    return {
      id: row.id,
      createdAt: row.created_at,
      runType: row.run_type,
      stage: getStageName(row),
      status: row.status,
      customerAccountId: row.customer_account_id,
      inputSummary: row.input_summary,
      outputSummary: row.output_summary,
      error: row.error,
      durationMs: row.duration_ms,
      modelUsed: row.model_used,
      tokensUsed: row.tokens_used,
      costCents: row.cost_cents,
      personaId: getPersonaId(row),
      provider: getProvider(row),
      jobIndex: row.job_index,
      parentRunId: row.parent_run_id,
      retryCount: row.retry_count,
      errorCount: row.error_count,
      metadata,
    } satisfies WorkflowRunStage
  })
  const firstRow = orderedRows[0]
  const lastRow = orderedRows[orderedRows.length - 1]

  return {
    workflowId: getWorkflowId(firstRow!),
    runType: firstRow?.run_type ?? 'agent_run',
    status: getWorkflowStatus(orderedRows),
    startedAt: firstRow?.created_at ?? new Date(0).toISOString(),
    finishedAt: lastRow?.created_at ?? new Date(0).toISOString(),
    customerAccountIds: [
      ...new Set(
        orderedRows
          .map((row) => row.customer_account_id)
          .filter((value): value is string => typeof value === 'string')
      ),
    ],
    stages,
    stageNames: [...new Set(stages.map((stage) => stage.stage))],
    providers: [
      ...new Set(
        stages
          .map((stage) => stage.provider)
          .filter((value): value is string => typeof value === 'string')
      ),
    ],
    personas: [
      ...new Set(
        stages
          .map((stage) => stage.personaId)
          .filter((value): value is string => typeof value === 'string')
      ),
    ],
    summary: summarizeWorkflow(orderedRows),
    hasFailures: orderedRows.some((row) => row.status === 'failed'),
  } satisfies WorkflowRunInspection
}

export function groupAgentRunsByWorkflow(rows: AgentRunInspectionRow[]) {
  const grouped = new Map<string, AgentRunInspectionRow[]>()

  for (const row of rows) {
    const workflowId = getWorkflowId(row)
    const bucket = grouped.get(workflowId)

    if (bucket) {
      bucket.push(row)
    } else {
      grouped.set(workflowId, [row])
    }
  }

  return [...grouped.values()]
    .map((workflowRows) => buildWorkflowInspection(workflowRows))
    .sort((left, right) => {
      const finishedAtDelta = right.finishedAt.localeCompare(left.finishedAt)
      if (finishedAtDelta !== 0) return finishedAtDelta

      return right.workflowId.localeCompare(left.workflowId)
    })
}

async function fetchAgentRunBatch(input: {
  supabase: RunInspectionSupabase
  workspaceId: string
  beforeCreatedAt?: string | null
  maxCreatedAt?: string | null
  limit: number
}) {
  let query = input.supabase
    .from('agent_runs')
    .select(AGENT_RUN_INSPECTION_FIELDS)
    .eq('workspace_id', input.workspaceId)
    .order('created_at', { ascending: false })

  if (input.maxCreatedAt) {
    query = query.lte('created_at', input.maxCreatedAt)
  }

  if (input.beforeCreatedAt) {
    query = query.lt('created_at', input.beforeCreatedAt)
  }

  const { data, error } = await query.limit(input.limit)
  if (error) throw error

  return (data ?? []) as unknown as AgentRunInspectionRow[]
}

async function fetchWorkflowRows(input: {
  supabase: RunInspectionSupabase
  workspaceId: string
  selectors: WorkflowSelector[]
}) {
  const rows: AgentRunInspectionRow[] = []
  const workflowIds = input.selectors
    .filter((selector): selector is { type: 'workflow_id'; value: string } =>
      selector.type === 'workflow_id'
    )
    .map((selector) => selector.value)
  const standaloneIds = input.selectors
    .filter((selector): selector is { type: 'id'; value: string } =>
      selector.type === 'id'
    )
    .map((selector) => selector.value)

  if (workflowIds.length > 0) {
    const { data, error } = await input.supabase
      .from('agent_runs')
      .select(AGENT_RUN_INSPECTION_FIELDS)
      .eq('workspace_id', input.workspaceId)
      .in('workflow_id', workflowIds)
      .order('created_at', { ascending: false })

    if (error) throw error
    rows.push(...((data ?? []) as unknown as AgentRunInspectionRow[]))
  }

  if (standaloneIds.length > 0) {
    const { data, error } = await input.supabase
      .from('agent_runs')
      .select(AGENT_RUN_INSPECTION_FIELDS)
      .eq('workspace_id', input.workspaceId)
      .in('id', standaloneIds)
      .order('created_at', { ascending: false })

    if (error) throw error
    rows.push(...((data ?? []) as unknown as AgentRunInspectionRow[]))
  }

  return rows
}

export async function listWorkspaceRunInspections(input: {
  supabase: RunInspectionSupabase
  workspaceId: string
  limit?: number
  cursor?: string | null
}) {
  const workflowLimit = Math.min(Math.max(input.limit ?? 40, 1), 100)
  const decodedCursor = decodeWorkflowListCursor(input.cursor)
  const workflowOrder: string[] = []
  const workflowSelectors = new Map<string, WorkflowSelector>()
  const seenWorkflowIds = new Set(decodedCursor?.seenWorkflowIds ?? [])
  let rawBatchCursor: string | null = null
  let nextCursor: string | null = null
  let lastIncludedCreatedAt: string | null = null

  while (workflowOrder.length < workflowLimit + 1) {
    const rows = await fetchAgentRunBatch({
      supabase: input.supabase,
      workspaceId: input.workspaceId,
      beforeCreatedAt: rawBatchCursor,
      maxCreatedAt: decodedCursor?.createdAt ?? null,
      limit: 200,
    })

    if (rows.length === 0) break

    for (const row of rows) {
      const workflowId = getWorkflowId(row)
      if (seenWorkflowIds.has(workflowId)) {
        continue
      }

      if (!workflowSelectors.has(workflowId)) {
        workflowSelectors.set(workflowId, getWorkflowSelector(row))
        workflowOrder.push(workflowId)

        if (workflowOrder.length <= workflowLimit) {
          lastIncludedCreatedAt = row.created_at
        }

        if (workflowOrder.length === workflowLimit + 1) {
          nextCursor = lastIncludedCreatedAt
            ? encodeWorkflowListCursor({
                createdAt: lastIncludedCreatedAt,
                seenWorkflowIds: [
                  ...seenWorkflowIds,
                  ...workflowOrder.slice(0, workflowLimit),
                ],
              })
            : null
          break
        }
      }
    }

    if (nextCursor) break
    rawBatchCursor = rows.at(-1)?.created_at ?? null
  }

  const pageWorkflowIds = workflowOrder.slice(0, workflowLimit)
  const rows = await fetchWorkflowRows({
    supabase: input.supabase,
    workspaceId: input.workspaceId,
    selectors: pageWorkflowIds
      .map((workflowId) => workflowSelectors.get(workflowId))
      .filter((value): value is WorkflowSelector => Boolean(value)),
  })
  const grouped = new Map(
    groupAgentRunsByWorkflow(rows).map((workflow) => [workflow.workflowId, workflow])
  )

  return {
    workflows: pageWorkflowIds
      .map((workflowId) => grouped.get(workflowId))
      .filter((workflow): workflow is WorkflowRunInspection => Boolean(workflow)),
    nextCursor,
  }
}

export async function getWorkflowRunInspection(input: {
  supabase: RunInspectionSupabase
  workspaceId: string
  workflowId: string
}) {
  const selectors: WorkflowSelector[] = [{ type: 'workflow_id', value: input.workflowId }]
  const rows = await fetchWorkflowRows({
    supabase: input.supabase,
    workspaceId: input.workspaceId,
    selectors,
  })

  if (rows.length > 0) {
    return buildWorkflowInspection(rows)
  }

  const standaloneRows = await fetchWorkflowRows({
    supabase: input.supabase,
    workspaceId: input.workspaceId,
    selectors: [{ type: 'id', value: input.workflowId }],
  })

  if (standaloneRows.length === 0) {
    return null
  }

  return buildWorkflowInspection(standaloneRows)
}
