import assert from 'node:assert/strict'
import test from 'node:test'
import {
  markIntegrationSyncFailed,
  markIntegrationSyncSucceeded,
  runProviderSyncWithHealth,
} from '@/integrations/_core/connection-state'

type ConnectionRow = {
  workspace_id: string
  provider: string
  status: string
  last_synced_at: string | null
  metadata: Record<string, unknown>
}

function createFakeSupabase(initialConnections: ConnectionRow[] = []) {
  const integrationConnections = [...initialConnections]

  const connectionQuery = {
    filters: {} as Record<string, unknown>,
    select() {
      return this
    },
    eq(column: string, value: unknown) {
      this.filters[column] = value
      return this
    },
    async maybeSingle() {
      const match =
        integrationConnections.find(
          (row) =>
            row.workspace_id === this.filters.workspace_id &&
            row.provider === this.filters.provider
        ) ?? null

      return {
        data: match
          ? {
              metadata: match.metadata,
              last_synced_at: match.last_synced_at,
            }
          : null,
        error: null,
      }
    },
    async upsert(payload: ConnectionRow) {
      const index = integrationConnections.findIndex(
        (row) =>
          row.workspace_id === payload.workspace_id &&
          row.provider === payload.provider
      )

      if (index >= 0) {
        integrationConnections[index] = {
          ...integrationConnections[index],
          ...payload,
        }
      } else {
        integrationConnections.push(payload)
      }

      return { error: null }
    },
  }

  return {
    tables: {
      integrationConnections,
    },
    from(table: string) {
      if (table === 'integration_connections') {
        return { ...connectionQuery, filters: {} as Record<string, unknown> }
      }

      throw new Error(`Unexpected table ${table}`)
    },
  }
}

test('markIntegrationSyncSucceeded clears stale error state and updates sync metadata', async () => {
  const supabase = createFakeSupabase([
    {
      workspace_id: 'workspace-1',
      provider: 'stripe',
      status: 'needs_attention',
      last_synced_at: null,
      metadata: {
        last_error: 'old error',
        last_error_at: '2026-04-23T00:00:00.000Z',
      },
    },
  ])

  await markIntegrationSyncSucceeded({
    supabase: supabase as never,
    workspaceId: 'workspace-1',
    provider: 'stripe',
    trigger: 'manual_sync',
  })

  const row = supabase.tables.integrationConnections[0]
  assert.equal(row?.status, 'connected')
  assert.equal(row?.metadata.last_error, undefined)
  assert.equal(row?.metadata.last_sync_status, 'completed')
  assert.equal(row?.metadata.last_sync_source, 'manual_sync')
  assert.ok(typeof row?.last_synced_at === 'string')
})

test('markIntegrationSyncFailed preserves last successful sync timestamp and stores failure metadata', async () => {
  const supabase = createFakeSupabase([
    {
      workspace_id: 'workspace-1',
      provider: 'posthog',
      status: 'connected',
      last_synced_at: '2026-04-23T00:00:00.000Z',
      metadata: {},
    },
  ])

  await markIntegrationSyncFailed({
    supabase: supabase as never,
    workspaceId: 'workspace-1',
    provider: 'posthog',
    trigger: 'manual_sync',
    errorMessage: 'token expired',
  })

  const row = supabase.tables.integrationConnections[0]
  assert.equal(row?.status, 'needs_attention')
  assert.equal(row?.last_synced_at, '2026-04-23T00:00:00.000Z')
  assert.equal(row?.metadata.last_error, 'token expired')
  assert.equal(row?.metadata.last_sync_status, 'failed')
})

test('runProviderSyncWithHealth marks tool-only integrations ready without faking sync timestamps', async () => {
  const supabase = createFakeSupabase()

  const result = await runProviderSyncWithHealth({
    supabase: supabase as never,
    workspaceId: 'workspace-1',
    provider: 'notion',
    trigger: 'manual_connect',
  })

  assert.equal(result.toolOnly, true)
  assert.match(result.message, /notion is a live integration/i)
  assert.equal(supabase.tables.integrationConnections[0]?.last_synced_at, null)
  assert.equal(
    supabase.tables.integrationConnections[0]?.metadata.last_sync_status,
    'available'
  )
})

test('runProviderSyncWithHealth marks failing manual syncs as needs_attention and logs the failure', async () => {
  const supabase = createFakeSupabase()
  const logs: Array<Record<string, unknown>> = []
  let refreshedWorkspaceId: string | null = null

  await assert.rejects(
    () =>
      runProviderSyncWithHealth({
        supabase: supabase as never,
        workspaceId: 'workspace-1',
        provider: 'stripe',
        trigger: 'manual_sync',
        overrideRunner: async () => {
          throw new Error('network timeout')
        },
        refreshWorkspaceMemoriesFn: async (workspaceId) => {
          refreshedWorkspaceId = workspaceId
        },
        logAgentRunFn: async (record) => {
          logs.push(record as unknown as Record<string, unknown>)
          return { ok: true, attempts: 1 }
        },
      }),
    /network timeout/
  )

  assert.equal(refreshedWorkspaceId, null)
  assert.equal(supabase.tables.integrationConnections[0]?.status, 'needs_attention')
  assert.equal(
    supabase.tables.integrationConnections[0]?.metadata.last_error,
    'network timeout'
  )
  assert.equal(logs[0]?.runType, 'sync_failed')
})

test('runProviderSyncWithHealth refreshes only recently touched accounts through the queue helpers', async () => {
  const supabase = createFakeSupabase()
  const queued: Array<{ workspaceId: string; touchedSince: string }> = []
  const processed: string[] = []

  const result = await runProviderSyncWithHealth({
    supabase: supabase as never,
    workspaceId: 'workspace-1',
    provider: 'stripe',
    trigger: 'manual_sync',
    overrideRunner: async () => ({ synced: true }),
    overrideSuccessMessage: () => 'ok',
    enqueueRecentlyTouchedAccountMemoriesFn: async (workspaceId, touchedSince) => {
      queued.push({ workspaceId, touchedSince })
    },
    processQueuedAccountMemoryRefreshesFn: async ({ workspaceId }) => {
      processed.push(workspaceId)
      return { processed: 1, failed: 0, queueAvailable: true }
    },
  })

  assert.equal(result.toolOnly, false)
  assert.equal(queued.length, 1)
  assert.equal(queued[0]?.workspaceId, 'workspace-1')
  assert.equal(typeof queued[0]?.touchedSince, 'string')
  assert.deepEqual(processed, ['workspace-1'])
})
