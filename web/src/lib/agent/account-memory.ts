import { createServiceClient } from '@/lib/supabase/service'

export type AccountMemorySnapshot = {
  summary: string
  keySignals: string[]
  openLoops: string[]
  recentTimeline: string[]
  lastRefreshedAt: string
}

export const DEFAULT_ACCOUNT_MEMORY_QUEUE_CONCURRENCY = 4
export const DEFAULT_ACCOUNT_MEMORY_QUEUE_BATCH_SIZE = 50

type AccountRow = {
  id: string
  name: string
  summary: string | null
  open_issue: string | null
  next_action: string | null
  risk_level: string
  risk_score: number
  usage_delta_percent: number
  account_status: string
  last_touch_at: string | null
  renewal_at: string | null
  mrr_cents: number
}

type AccountIdRow = {
  id?: string | null
  customer_account_id?: string | null
}

type AccountMemoryRefreshQueueRow = {
  id: string
  customer_account_id: string
  attempts: number
}

function isMissingAccountMemoryQueueError(error: unknown) {
  if (!error || typeof error !== 'object') return false

  const candidate = error as { code?: string; message?: string }

  return (
    candidate.code === 'PGRST205' ||
    candidate.message?.includes('account_memory_refresh_queue') === true
  )
}

async function mapWithConcurrency<T>(
  values: T[],
  concurrency: number,
  iteratee: (value: T, index: number) => Promise<void>
) {
  const normalizedConcurrency = Math.max(1, Math.min(concurrency, values.length || 1))
  let cursor = 0

  await Promise.all(
    Array.from({ length: normalizedConcurrency }, async () => {
      while (cursor < values.length) {
        const currentIndex = cursor
        cursor += 1
        await iteratee(values[currentIndex]!, currentIndex)
      }
    })
  )
}

function collectDistinctAccountIds(rows: AccountIdRow[] | null | undefined) {
  return [...new Set(
    (rows ?? [])
      .map((row) =>
        typeof row.customer_account_id === 'string'
          ? row.customer_account_id
          : typeof row.id === 'string'
            ? row.id
            : null
      )
      .filter((value): value is string => typeof value === 'string' && value.length > 0)
  )]
}

function toCurrency(cents: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(cents / 100)
}

function buildSummary(account: AccountRow) {
  const parts = [
    `${account.name} is ${account.risk_level} risk`,
    `MRR ${toCurrency(account.mrr_cents)}`,
    account.usage_delta_percent === 0
      ? 'usage stable'
      : `usage ${account.usage_delta_percent > 0 ? 'up' : 'down'} ${Math.abs(account.usage_delta_percent)}%`,
    account.account_status !== 'active'
      ? `billing ${account.account_status.replace(/_/g, ' ')}`
      : null,
    account.summary,
  ]

  return parts
    .filter((part): part is string => typeof part === 'string' && part.trim().length > 0)
    .join('. ')
}

export async function getAccountMemory(workspaceId: string, accountId: string) {
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('account_memories')
    .select(
      'summary, key_signals, open_loops, recent_timeline, last_refreshed_at'
    )
    .eq('workspace_id', workspaceId)
    .eq('customer_account_id', accountId)
    .maybeSingle()

  if (error) {
    if (
      error.code === 'PGRST205' ||
      error.message?.includes('account_memories') === true
    ) {
      return null
    }

    throw error
  }

  return data
    ? {
        summary: data.summary ?? '',
        keySignals: Array.isArray(data.key_signals)
          ? data.key_signals.map(String)
          : [],
        openLoops: Array.isArray(data.open_loops)
          ? data.open_loops.map(String)
          : [],
        recentTimeline: Array.isArray(data.recent_timeline)
          ? data.recent_timeline.map(String)
          : [],
        lastRefreshedAt: data.last_refreshed_at ?? new Date().toISOString(),
      }
    : null
}

export async function refreshAccountMemory(workspaceId: string, accountId: string) {
  const supabase = createServiceClient()

  const [
    { data: account, error: accountError },
    { data: signals, error: signalsError },
    { data: timeline, error: timelineError },
    { data: drafts, error: draftsError },
  ] = await Promise.all([
    supabase
      .from('customer_accounts')
      .select(
        'id, name, summary, open_issue, next_action, risk_level, risk_score, usage_delta_percent, account_status, last_touch_at, renewal_at, mrr_cents'
      )
      .eq('workspace_id', workspaceId)
      .eq('id', accountId)
      .maybeSingle(),
    supabase
      .from('account_signals')
      .select('headline, detail, risk_level, event_at')
      .eq('workspace_id', workspaceId)
      .eq('customer_account_id', accountId)
      .order('event_at', { ascending: false })
      .limit(5),
    supabase
      .from('account_timeline')
      .select('headline, detail, event_at')
      .eq('workspace_id', workspaceId)
      .eq('customer_account_id', accountId)
      .order('event_at', { ascending: false })
      .limit(5),
    supabase
      .from('follow_up_drafts')
      .select('subject, status')
      .eq('workspace_id', workspaceId)
      .eq('customer_account_id', accountId)
      .neq('status', 'sent')
      .order('created_at', { ascending: false })
      .limit(2),
  ])

  if (accountError) throw accountError
  if (signalsError) throw signalsError
  if (timelineError) throw timelineError
  if (draftsError) throw draftsError
  if (!account) return null

  const typedAccount = account as AccountRow
  const keySignals = (signals ?? [])
    .map((signal) =>
      [signal.headline, signal.detail].filter(Boolean).join(': ').trim()
    )
    .filter((value) => value.length > 0)
    .slice(0, 5)

  const openLoops = [
    typedAccount.open_issue ? `Open issue: ${typedAccount.open_issue}` : null,
    typedAccount.next_action ? `Next action: ${typedAccount.next_action}` : null,
    ...(drafts ?? []).map(
      (draft) => `Draft ${draft.status.replace(/_/g, ' ')}: ${draft.subject}`
    ),
  ]
    .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
    .slice(0, 6)

  const recentTimeline = (timeline ?? [])
    .map((entry) =>
      [entry.headline, entry.detail].filter(Boolean).join(': ').trim()
    )
    .filter((value) => value.length > 0)
    .slice(0, 5)

  const snapshot: AccountMemorySnapshot = {
    summary: buildSummary(typedAccount),
    keySignals,
    openLoops,
    recentTimeline,
    lastRefreshedAt: new Date().toISOString(),
  }

  const { error } = await supabase.from('account_memories').upsert(
    {
      workspace_id: workspaceId,
      customer_account_id: accountId,
      summary: snapshot.summary,
      key_signals: snapshot.keySignals,
      open_loops: snapshot.openLoops,
      recent_timeline: snapshot.recentTimeline,
      last_refreshed_at: snapshot.lastRefreshedAt,
    },
    { onConflict: 'customer_account_id' }
  )

  if (error) {
    if (
      error.code === 'PGRST205' ||
      error.message?.includes('account_memories') === true
    ) {
      return null
    }

    throw error
  }

  return snapshot
}

export async function enqueueAccountMemoryRefresh(
  workspaceId: string,
  accountId: string
) {
  return enqueueAccountMemoryRefreshes(workspaceId, [accountId])
}

export async function enqueueAccountMemoryRefreshes(
  workspaceId: string,
  accountIds: string[]
) {
  const uniqueAccountIds = [...new Set(accountIds.filter((value) => value.length > 0))]

  if (uniqueAccountIds.length === 0) {
    return { enqueued: 0, queueAvailable: true }
  }

  const supabase = createServiceClient()
  const now = new Date().toISOString()
  const payload = uniqueAccountIds.map((accountId) => ({
    workspace_id: workspaceId,
    customer_account_id: accountId,
    status: 'pending',
    last_requested_at: now,
    processing_started_at: null,
    last_error: null,
  }))

  const { error } = await supabase
    .from('account_memory_refresh_queue')
    .upsert(payload, { onConflict: 'workspace_id,customer_account_id' })

  if (error) {
    if (isMissingAccountMemoryQueueError(error)) {
      await mapWithConcurrency(
        uniqueAccountIds,
        DEFAULT_ACCOUNT_MEMORY_QUEUE_CONCURRENCY,
        async (accountId) => {
          await refreshAccountMemory(workspaceId, accountId)
        }
      )
      return { enqueued: uniqueAccountIds.length, queueAvailable: false }
    }

    throw error
  }

  return { enqueued: uniqueAccountIds.length, queueAvailable: true }
}

export async function enqueueRecentlyTouchedAccountMemories(
  workspaceId: string,
  touchedSince: string
) {
  const supabase = createServiceClient()
  const [
    { data: updatedAccounts, error: accountsError },
    { data: newSignals, error: signalsError },
    { data: newTimelineEvents, error: timelineError },
    { data: updatedDrafts, error: draftsError },
  ] = await Promise.all([
    supabase
      .from('customer_accounts')
      .select('id')
      .eq('workspace_id', workspaceId)
      .gte('updated_at', touchedSince),
    supabase
      .from('account_signals')
      .select('customer_account_id')
      .eq('workspace_id', workspaceId)
      .gte('created_at', touchedSince)
      .not('customer_account_id', 'is', null),
    supabase
      .from('account_timeline')
      .select('customer_account_id')
      .eq('workspace_id', workspaceId)
      .gte('created_at', touchedSince),
    supabase
      .from('follow_up_drafts')
      .select('customer_account_id')
      .eq('workspace_id', workspaceId)
      .gte('updated_at', touchedSince)
      .not('customer_account_id', 'is', null),
  ])

  if (accountsError) throw accountsError
  if (signalsError) throw signalsError
  if (timelineError) throw timelineError
  if (draftsError) throw draftsError

  const accountIds = [
    ...collectDistinctAccountIds(updatedAccounts as AccountIdRow[] | null),
    ...collectDistinctAccountIds(newSignals as AccountIdRow[] | null),
    ...collectDistinctAccountIds(newTimelineEvents as AccountIdRow[] | null),
    ...collectDistinctAccountIds(updatedDrafts as AccountIdRow[] | null),
  ]

  return enqueueAccountMemoryRefreshes(workspaceId, accountIds)
}

export async function processQueuedAccountMemoryRefreshes(input: {
  workspaceId: string
  limit?: number
  concurrency?: number
}) {
  const supabase = createServiceClient()
  const limit = Math.max(1, Math.min(input.limit ?? DEFAULT_ACCOUNT_MEMORY_QUEUE_BATCH_SIZE, 200))
  const concurrency = Math.max(
    1,
    Math.min(input.concurrency ?? DEFAULT_ACCOUNT_MEMORY_QUEUE_CONCURRENCY, 16)
  )

  const { data, error } = await supabase
    .from('account_memory_refresh_queue')
    .select('id, customer_account_id, attempts')
    .eq('workspace_id', input.workspaceId)
    .in('status', ['pending', 'failed'])
    .order('last_requested_at', { ascending: true })
    .limit(limit)

  if (error) {
    if (isMissingAccountMemoryQueueError(error)) {
      return { processed: 0, failed: 0, queueAvailable: false }
    }

    throw error
  }

  const rows = (data ?? []) as AccountMemoryRefreshQueueRow[]

  if (rows.length === 0) {
    return { processed: 0, failed: 0, queueAvailable: true }
  }

  const queueIds = rows.map((row) => row.id)
  const processingStartedAt = new Date().toISOString()
  const { data: claimedRows, error: claimError } = await supabase
    .from('account_memory_refresh_queue')
    .update({
      status: 'processing',
      processing_started_at: processingStartedAt,
      last_error: null,
    })
    .eq('workspace_id', input.workspaceId)
    .in('id', queueIds)
    .in('status', ['pending', 'failed'])
    .select('id, customer_account_id, attempts')

  if (claimError) {
    if (isMissingAccountMemoryQueueError(claimError)) {
      return { processed: 0, failed: 0, queueAvailable: false }
    }

    throw claimError
  }

  const claimed = (claimedRows ?? []) as AccountMemoryRefreshQueueRow[]
  let processed = 0
  let failed = 0

  await mapWithConcurrency(claimed, concurrency, async (row) => {
    try {
      await refreshAccountMemory(input.workspaceId, row.customer_account_id)
      const { error: deleteError } = await supabase
        .from('account_memory_refresh_queue')
        .delete()
        .eq('workspace_id', input.workspaceId)
        .eq('id', row.id)

      if (deleteError) throw deleteError
      processed += 1
    } catch (error) {
      failed += 1
      const { error: updateError } = await supabase
        .from('account_memory_refresh_queue')
        .update({
          status: 'failed',
          attempts: row.attempts + 1,
          processing_started_at: null,
          last_error: error instanceof Error ? error.message : 'Unknown refresh error',
        })
        .eq('workspace_id', input.workspaceId)
        .eq('id', row.id)

      if (updateError) {
        console.error('[account-memory] Failed to update queue row after refresh failure', {
          workspaceId: input.workspaceId,
          queueId: row.id,
          accountId: row.customer_account_id,
          updateError,
        })
      }

      console.warn('[account-memory] Failed to refresh queued account memory', {
        workspaceId: input.workspaceId,
        accountId: row.customer_account_id,
        error,
      })
    }
  })

  return { processed, failed, queueAvailable: true }
}

export async function refreshWorkspaceAccountMemories(workspaceId: string) {
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('customer_accounts')
    .select('id')
    .eq('workspace_id', workspaceId)

  if (error) throw error

  await mapWithConcurrency(
    data ?? [],
    DEFAULT_ACCOUNT_MEMORY_QUEUE_CONCURRENCY,
    async (account) => {
      try {
        await refreshAccountMemory(workspaceId, account.id)
      } catch (error) {
        console.warn('[account-memory] Failed to refresh account memory', {
          workspaceId,
          accountId: account.id,
          error,
        })
      }
    }
  )
}
