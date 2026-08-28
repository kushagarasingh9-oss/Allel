import assert from 'node:assert/strict'
import test from 'node:test'
import {
  decodeWorkflowListCursor,
  encodeWorkflowListCursor,
  getWorkflowRunInspection,
  groupAgentRunsByWorkflow,
  listWorkspaceRunInspections,
  type AgentRunInspectionRow,
} from '@/agent/runtime/run-inspection'

function createRun(
  id: string,
  overrides: Partial<AgentRunInspectionRow> = {}
): AgentRunInspectionRow {
  return {
    id,
    workspace_id: 'workspace-1',
    customer_account_id: null,
    run_type: 'daily_review',
    status: 'completed',
    input_summary: null,
    output_summary: null,
    error: null,
    duration_ms: null,
    model_used: null,
    tokens_used: null,
    cost_cents: null,
    workflow_id: id,
    stage: null,
    persona_id: null,
    provider: null,
    job_index: null,
    parent_run_id: null,
    retry_count: 0,
    error_count: 0,
    metadata: {},
    created_at: '2026-04-24T00:00:00.000Z',
    ...overrides,
  }
}

function createFakeSupabase(rows: AgentRunInspectionRow[]) {
  return {
    from(table: string) {
      if (table !== 'agent_runs') {
        throw new Error(`Unexpected table ${table}`)
      }

      return {
        filters: [] as Array<(row: AgentRunInspectionRow) => boolean>,
        orderColumn: 'created_at',
        ascending: false,
        rowLimit: Infinity,
        select() {
          return this
        },
        eq(column: keyof AgentRunInspectionRow, value: unknown) {
          this.filters.push((row) => row[column] === value)
          return this
        },
        lt(column: keyof AgentRunInspectionRow, value: string) {
          this.filters.push((row) => String(row[column] ?? '') < value)
          return this
        },
        lte(column: keyof AgentRunInspectionRow, value: string) {
          this.filters.push((row) => String(row[column] ?? '') <= value)
          return this
        },
        in(column: keyof AgentRunInspectionRow, values: unknown[]) {
          this.filters.push((row) => values.includes(row[column]))
          return this
        },
        order(column: keyof AgentRunInspectionRow, options: { ascending: boolean }) {
          this.orderColumn = column
          this.ascending = options.ascending
          return this
        },
        limit(value: number) {
          this.rowLimit = value
          return this.execute()
        },
        async execute() {
          const filtered = rows
            .filter((row) => this.filters.every((predicate) => predicate(row)))
            .sort((left, right) => {
              const col = this.orderColumn as keyof AgentRunInspectionRow
              const leftValue = String(left[col] ?? '')
              const rightValue = String(right[col] ?? '')
              return this.ascending
                ? leftValue.localeCompare(rightValue)
                : rightValue.localeCompare(leftValue)
            })

          return {
            data: filtered.slice(0, this.rowLimit),
            error: null,
          }
        },
        then(resolve: (value: { data: AgentRunInspectionRow[]; error: null }) => unknown) {
          return this.execute().then(resolve)
        },
      }
    },
  }
}

test('groupAgentRunsByWorkflow prefers normalized workflow columns over metadata fallbacks', () => {
  const grouped = groupAgentRunsByWorkflow([
    createRun('run-1', {
      workflow_id: 'wf-1',
      stage: 'detect',
      persona_id: 'sarah',
      created_at: '2026-04-24T00:00:01.000Z',
      output_summary: 'Detected top accounts',
    }),
    createRun('run-2', {
      workflow_id: 'wf-1',
      stage: 'draft',
      provider: 'stripe',
      created_at: '2026-04-24T00:00:02.000Z',
      customer_account_id: 'account-1',
      output_summary: 'Created one draft',
    }),
    createRun('run-3', {
      run_type: 'chat_message',
      created_at: '2026-04-24T00:00:03.000Z',
      output_summary: 'Standalone chat',
    }),
  ])

  assert.equal(grouped.length, 2)

  const workflow = grouped.find((item) => item.workflowId === 'wf-1')
  assert.ok(workflow)
  assert.deepEqual(workflow?.stageNames, ['detect', 'draft'])
  assert.deepEqual(workflow?.providers, ['stripe'])
  assert.deepEqual(workflow?.personas, ['sarah'])
  assert.deepEqual(workflow?.customerAccountIds, ['account-1'])
})

test('getWorkflowRunInspection loads older workflows directly by workflow_id', async () => {
  const rows = [
    createRun('run-old-1', {
      workflow_id: 'wf-old',
      stage: 'detect',
      created_at: '2026-04-01T00:00:00.000Z',
    }),
    createRun('run-old-2', {
      workflow_id: 'wf-old',
      stage: 'verify',
      created_at: '2026-04-01T00:00:10.000Z',
      output_summary: 'Older workflow still visible',
    }),
    ...Array.from({ length: 220 }, (_, index) =>
      createRun(`recent-${index + 1}`, {
        workflow_id: `wf-recent-${index + 1}`,
        stage: 'detect',
        created_at: `2026-04-24T00:${String(index).padStart(2, '0')}:00.000Z`,
      })
    ),
  ]

  const workflow = await getWorkflowRunInspection({
    supabase: createFakeSupabase(rows) as never,
    workspaceId: 'workspace-1',
    workflowId: 'wf-old',
  })

  assert.ok(workflow)
  assert.equal(workflow?.workflowId, 'wf-old')
  assert.equal(workflow?.stages.length, 2)
  assert.equal(workflow?.summary, 'Older workflow still visible')
})

test('listWorkspaceRunInspections paginates by workflow and preserves full stage history', async () => {
  const rows = [
    createRun('wf-a-1', {
      workflow_id: 'wf-a',
      stage: 'detect',
      created_at: '2026-04-24T00:00:01.000Z',
    }),
    createRun('wf-a-2', {
      workflow_id: 'wf-a',
      stage: 'verify',
      created_at: '2026-04-24T00:00:02.000Z',
      output_summary: 'A complete workflow',
    }),
    createRun('wf-b-1', {
      workflow_id: 'wf-b',
      stage: 'detect',
      created_at: '2026-04-24T00:00:03.000Z',
    }),
    createRun('wf-b-2', {
      workflow_id: 'wf-b',
      stage: 'draft',
      created_at: '2026-04-24T00:00:04.000Z',
    }),
    createRun('wf-c-1', {
      workflow_id: 'wf-c',
      stage: 'detect',
      created_at: '2026-04-24T00:00:05.000Z',
    }),
  ]

  const result = await listWorkspaceRunInspections({
    supabase: createFakeSupabase(rows) as never,
    workspaceId: 'workspace-1',
    limit: 2,
  })

  assert.equal(result.workflows.length, 2)
  assert.equal(result.workflows[0]?.workflowId, 'wf-c')
  assert.equal(result.workflows[1]?.workflowId, 'wf-b')
  assert.deepEqual(result.workflows[1]?.stageNames, ['detect', 'draft'])
  assert.ok(result.nextCursor)
})

test('workflow list cursors round-trip shared timestamp state', () => {
  const cursor = encodeWorkflowListCursor({
    createdAt: '2026-04-24T00:00:04.000Z',
    seenWorkflowIds: ['wf-a', 'wf-b', 'wf-a'],
  })

  assert.deepEqual(decodeWorkflowListCursor(cursor), {
    createdAt: '2026-04-24T00:00:04.000Z',
    seenWorkflowIds: ['wf-a', 'wf-b'],
  })
})

test('listWorkspaceRunInspections does not skip workflows that share the boundary timestamp', async () => {
  const rows = [
    createRun('wf-a-1', {
      workflow_id: 'wf-a',
      stage: 'detect',
      created_at: '2026-04-24T00:00:05.000Z',
    }),
    createRun('wf-b-1', {
      workflow_id: 'wf-b',
      stage: 'detect',
      created_at: '2026-04-24T00:00:04.000Z',
    }),
    createRun('wf-c-1', {
      workflow_id: 'wf-c',
      stage: 'detect',
      created_at: '2026-04-24T00:00:04.000Z',
    }),
    createRun('wf-d-1', {
      workflow_id: 'wf-d',
      stage: 'detect',
      created_at: '2026-04-24T00:00:03.000Z',
    }),
  ]

  const firstPage = await listWorkspaceRunInspections({
    supabase: createFakeSupabase(rows) as never,
    workspaceId: 'workspace-1',
    limit: 2,
  })

  assert.deepEqual(
    firstPage.workflows.map((workflow) => workflow.workflowId),
    ['wf-a', 'wf-b']
  )
  assert.ok(firstPage.nextCursor)

  const secondPage = await listWorkspaceRunInspections({
    supabase: createFakeSupabase(rows) as never,
    workspaceId: 'workspace-1',
    limit: 2,
    cursor: firstPage.nextCursor,
  })

  assert.deepEqual(
    secondPage.workflows.map((workflow) => workflow.workflowId),
    ['wf-c', 'wf-d']
  )
})
