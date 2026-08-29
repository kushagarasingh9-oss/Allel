import assert from 'node:assert/strict'
import test from 'node:test'
import {
  IntegrationConnectionError,
  isIntegrationConnected,
  mergeIntegrationConnectionMetadata,
  requireIntegrationConnected,
} from '@/integrations/_core/connection-guard'

type ConnectionRow = {
  workspace_id: string
  provider: string
  status: 'connected' | 'needs_attention' | 'disconnected' | 'coming_soon'
  last_synced_at: string | null
  metadata: Record<string, unknown>
}

function createFakeSupabase(rows: ConnectionRow[]) {
  return {
    from(table: string) {
      assert.equal(table, 'integration_connections')

      const filters: Record<string, unknown> = {}
      return {
        select() {
          return this
        },
        eq(column: string, value: unknown) {
          filters[column] = value
          return this
        },
        async maybeSingle() {
          const row = rows.find(
            (candidate) =>
              candidate.workspace_id === filters.workspace_id &&
              candidate.provider === filters.provider
          )

          return {
            data: row
              ? {
                  provider: row.provider,
                  status: row.status,
                  last_synced_at: row.last_synced_at,
                  metadata: row.metadata,
                }
              : null,
            error: null,
          }
        },
      }
    },
  }
}

test('isIntegrationConnected only accepts an explicitly connected provider row', async () => {
  const supabase = createFakeSupabase([
    {
      workspace_id: 'workspace-1',
      provider: 'stripe',
      status: 'connected',
      last_synced_at: '2026-08-01T00:00:00.000Z',
      metadata: {},
    },
    {
      workspace_id: 'workspace-1',
      provider: 'gmail',
      status: 'needs_attention',
      last_synced_at: null,
      metadata: {},
    },
    {
      workspace_id: 'workspace-1',
      provider: 'notion',
      status: 'connected',
      last_synced_at: null,
      metadata: { coverage: 'Notion connected via Direct API Connection. Agent can access workspace data.' },
    },
    {
      workspace_id: 'workspace-1',
      provider: 'google_calendar',
      status: 'connected',
      last_synced_at: null,
      metadata: { coverage: 'Google Calendar connected via Direct API credential' },
    },
  ])

  assert.equal(
    await isIntegrationConnected(supabase as never, 'workspace-1', 'stripe'),
    true
  )
  assert.equal(
    await isIntegrationConnected(supabase as never, 'workspace-1', 'gmail'),
    false
  )
  assert.equal(
    await isIntegrationConnected(supabase as never, 'workspace-1', 'notion'),
    false
  )
  assert.equal(
    await isIntegrationConnected(supabase as never, 'workspace-1', 'google_calendar'),
    false
  )
})

test('verified Google Calendar OAuth is accepted', async () => {
  const supabase = createFakeSupabase([
    {
      workspace_id: 'workspace-1',
      provider: 'google_calendar',
      status: 'connected',
      last_synced_at: '2026-08-06T00:00:00.000Z',
      metadata: {
        connected_via: 'google_oauth',
        oauth_verified_at: '2026-08-06T00:00:00.000Z',
      },
    },
  ])

  assert.equal(
    await isIntegrationConnected(supabase as never, 'workspace-1', 'google_calendar'),
    true
  )
})

test('requireIntegrationConnected rejects disconnected, unhealthy, and absent providers', async () => {
  const supabase = createFakeSupabase([
    {
      workspace_id: 'workspace-1',
      provider: 'stripe',
      status: 'disconnected',
      last_synced_at: null,
      metadata: {},
    },
    {
      workspace_id: 'workspace-1',
      provider: 'gmail',
      status: 'needs_attention',
      last_synced_at: null,
      metadata: {},
    },
  ])

  await assert.rejects(
    () => requireIntegrationConnected(supabase as never, 'workspace-1', 'stripe'),
    (error: unknown) =>
      error instanceof IntegrationConnectionError &&
      error.provider === 'stripe' &&
      error.status === 'disconnected'
  )

  await assert.rejects(
    () => requireIntegrationConnected(supabase as never, 'workspace-1', 'gmail'),
    /Gmail needs attention/i
  )

  await assert.rejects(
    () => requireIntegrationConnected(supabase as never, 'workspace-1', 'notion'),
    (error: unknown) =>
      error instanceof IntegrationConnectionError && error.status === 'missing'
  )
})

test('mergeIntegrationConnectionMetadata retains Pipedream credentials when a sync records coverage', async () => {
  const supabase = createFakeSupabase([
    {
      workspace_id: 'workspace-1',
      provider: 'gmail',
      status: 'connected',
      last_synced_at: null,
      metadata: {
        connected_via: 'pipedream',
        pipedream_account_id: 'pd-account-1',
        last_error: 'old error',
        last_error_at: '2026-08-01T00:00:00.000Z',
      },
    },
  ])

  const metadata = await mergeIntegrationConnectionMetadata(
    supabase as never,
    'workspace-1',
    'gmail',
    { coverage: '3 Gmail threads synced' }
  )

  assert.deepEqual(metadata, {
    connected_via: 'pipedream',
    pipedream_account_id: 'pd-account-1',
    coverage: '3 Gmail threads synced',
  })
})

test('C5: the displayed verdict and the chat guard agree for every row/token combination', async () => {
  const { resolveConnectionStatus } = await import('./connection-guard')

  // A stored token with no connection row is the case that used to read
  // "Connected" on the Connections page while requireIntegrationConnected threw
  // 'missing' — the integration looked healthy and every call failed.
  assert.equal(
    resolveConnectionStatus(null, true),
    'needs_attention',
    'A token with no connection row must not read as connected'
  )
  assert.equal(
    resolveConnectionStatus(null, false),
    'disconnected',
    'No row and no token is simply disconnected'
  )

  // requireIntegrationConnected rejects the same input, so the two agree.
  await assert.rejects(
    () =>
      requireIntegrationConnected(
        createFakeSupabase([]) as never,
        'workspace-1',
        'notion'
      ),
    IntegrationConnectionError,
    'Guard must reject a provider with no connection row'
  )

  // Preservation: a verified OAuth calendar row still resolves to connected.
  assert.equal(
    resolveConnectionStatus(
      {
        provider: 'google_calendar',
        status: 'connected',
        metadata: {
          connected_via: 'google_oauth',
          oauth_verified_at: '2026-05-01T00:00:00.000Z',
        },
      },
      true
    ),
    'connected'
  )
})
