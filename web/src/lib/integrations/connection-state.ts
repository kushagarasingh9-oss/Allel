import type { SupabaseClient } from '@supabase/supabase-js'
import {
  enqueueRecentlyTouchedAccountMemories,
  processQueuedAccountMemoryRefreshes,
} from '@/lib/agent/account-memory'
import { logAgentRun } from '@/lib/agent/run-logger'
import { sanitizeJsonRecord } from '@/lib/json-metadata'
import { SYNCABLE_PROVIDERS, TOOL_ONLY_PROVIDERS } from './catalog'
import { syncGmailWorkspace } from './gmail-sync'
import { syncHubSpotWorkspace } from './hubspot-sync'
import { syncIntercomWorkspace } from './intercom-sync'
import { syncLinearWorkspace } from './linear-sync'
import { syncPostHogWorkspace } from './posthog-sync'
import { syncSentryWorkspace } from './sentry-sync'
import { syncSlackWorkspace } from './slack-sync'
import { syncStripeWorkspace } from './stripe-sync'

type AnySupabaseClient = SupabaseClient

type SyncableProvider =
  | 'stripe'
  | 'posthog'
  | 'gmail'
  | 'intercom'
  | 'hubspot'
  | 'slack'
  | 'sentry'
  | 'linear'

export type IntegrationSyncTrigger =
  | 'daily_cron'
  | 'manual_sync'
  | 'manual_connect'
  | 'direct_connect'
  | 'gmail_oauth_callback'
  | 'api_connect'

type IntegrationConnectionRow = {
  metadata: Record<string, unknown> | null
  last_synced_at: string | null
}

function normalizeConnectionMetadata(value: Record<string, unknown> | null | undefined) {
  return sanitizeJsonRecord(value ?? {})
}

function formatErrorMessage(error: unknown) {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message
  }

  return 'Unknown sync error'
}

async function getExistingConnectionState(
  supabase: AnySupabaseClient,
  workspaceId: string,
  provider: string
) {
  const { data, error } = await supabase
    .from('integration_connections')
    .select('metadata, last_synced_at')
    .eq('workspace_id', workspaceId)
    .eq('provider', provider)
    .maybeSingle<IntegrationConnectionRow>()

  if (error) throw error

  return data
}

export async function markIntegrationSyncSucceeded(input: {
  supabase: AnySupabaseClient
  workspaceId: string
  provider: string
  trigger: IntegrationSyncTrigger
}) {
  const existing = await getExistingConnectionState(
    input.supabase,
    input.workspaceId,
    input.provider
  )
  const metadata = normalizeConnectionMetadata(existing?.metadata)
  const syncedAt = new Date().toISOString()

  delete metadata.last_error
  delete metadata.last_error_at

  metadata.last_sync_status = 'completed'
  metadata.last_sync_source = input.trigger
  metadata.last_sync_at = syncedAt

  const { error } = await input.supabase.from('integration_connections').upsert(
    {
      workspace_id: input.workspaceId,
      provider: input.provider,
      status: 'connected',
      last_synced_at: syncedAt,
      metadata,
    },
    { onConflict: 'workspace_id,provider' }
  )

  if (error) throw error
}

async function markToolOnlyProviderReady(input: {
  supabase: AnySupabaseClient
  workspaceId: string
  provider: string
  trigger: IntegrationSyncTrigger
}) {
  const existing = await getExistingConnectionState(
    input.supabase,
    input.workspaceId,
    input.provider
  )
  const metadata = normalizeConnectionMetadata(existing?.metadata)

  delete metadata.last_error
  delete metadata.last_error_at

  metadata.last_sync_status = 'available'
  metadata.last_sync_source = input.trigger

  const { error } = await input.supabase.from('integration_connections').upsert(
    {
      workspace_id: input.workspaceId,
      provider: input.provider,
      status: 'connected',
      last_synced_at: existing?.last_synced_at ?? null,
      metadata,
    },
    { onConflict: 'workspace_id,provider' }
  )

  if (error) throw error
}

export async function markIntegrationSyncFailed(input: {
  supabase: AnySupabaseClient
  workspaceId: string
  provider: string
  trigger: IntegrationSyncTrigger
  errorMessage: string
}) {
  const existing = await getExistingConnectionState(
    input.supabase,
    input.workspaceId,
    input.provider
  )
  const metadata = normalizeConnectionMetadata(existing?.metadata)
  const erroredAt = new Date().toISOString()

  metadata.last_error = input.errorMessage
  metadata.last_error_at = erroredAt
  metadata.last_sync_status = 'failed'
  metadata.last_sync_source = input.trigger

  const { error } = await input.supabase.from('integration_connections').upsert(
    {
      workspace_id: input.workspaceId,
      provider: input.provider,
      status: 'needs_attention',
      last_synced_at: existing?.last_synced_at ?? null,
      metadata,
    },
    { onConflict: 'workspace_id,provider' }
  )

  if (error) throw error
}

function buildToolOnlyMessage(provider: string) {
  return `${provider} is a live integration - data is read directly from the API when the agent needs it.`
}

type ProviderSyncRunner<T> = {
  run: (workspaceId: string) => Promise<T>
  formatSuccessMessage: (result: T) => string
}

const PROVIDER_SYNC_RUNNERS: Record<SyncableProvider, ProviderSyncRunner<unknown>> = {
  stripe: {
    run: syncStripeWorkspace,
    formatSuccessMessage: (result) =>
      `Stripe synced: ${(result as { syncedAccounts: number }).syncedAccounts} accounts.`,
  },
  posthog: {
    run: syncPostHogWorkspace,
    formatSuccessMessage: (result) => {
      const typedResult = result as {
        trackedUsers: number
        syncedAccounts: number
      }
      return `PostHog synced: ${typedResult.trackedUsers} users across ${typedResult.syncedAccounts} accounts.`
    },
  },
  gmail: {
    run: syncGmailWorkspace,
    formatSuccessMessage: (result) => {
      const typedResult = result as {
        syncedThreads: number
        syncedAccounts: number
      }
      return `Gmail synced: ${typedResult.syncedThreads} threads across ${typedResult.syncedAccounts} accounts.`
    },
  },
  intercom: {
    run: syncIntercomWorkspace,
    formatSuccessMessage: (result) => {
      const typedResult = result as {
        openConversations: number
        syncedAccounts: number
      }
      return `Intercom synced: ${typedResult.openConversations} open conversations across ${typedResult.syncedAccounts} accounts.`
    },
  },
  hubspot: {
    run: syncHubSpotWorkspace,
    formatSuccessMessage: (result) => {
      const typedResult = result as {
        syncedAccounts: number
        syncedContacts: number
      }
      return `HubSpot synced: ${typedResult.syncedAccounts} companies and ${typedResult.syncedContacts} contacts.`
    },
  },
  slack: {
    run: syncSlackWorkspace,
    formatSuccessMessage: (result) =>
      `Slack delivered the brief with ${(result as { itemCount: number }).itemCount} item(s).`,
  },
  sentry: {
    run: syncSentryWorkspace,
    formatSuccessMessage: (result) => {
      const typedResult = result as {
        matchedAccounts: number
        openIssues: number
      }
      return `Sentry synced: ${typedResult.matchedAccounts} matched account issue signal(s) from ${typedResult.openIssues} unresolved issue(s).`
    },
  },
  linear: {
    run: syncLinearWorkspace,
    formatSuccessMessage: (result) => {
      const typedResult = result as {
        matchedAccounts: number
        openIssues: number
      }
      return `Linear synced: ${typedResult.matchedAccounts} matched account issue signal(s) from ${typedResult.openIssues} open issue(s).`
    },
  },
}

export function isSyncableProvider(provider: string): provider is SyncableProvider {
  return SYNCABLE_PROVIDERS.has(provider as never)
}

export async function runProviderSyncWithHealth(input: {
  supabase: AnySupabaseClient
  workspaceId: string
  provider: string
  trigger: IntegrationSyncTrigger
  refreshAccountMemories?: boolean
  logFailure?: boolean
  overrideRunner?: (workspaceId: string) => Promise<unknown>
  overrideSuccessMessage?: (result: unknown) => string
  enqueueRecentlyTouchedAccountMemoriesFn?: (
    workspaceId: string,
    touchedSince: string
  ) => Promise<unknown>
  processQueuedAccountMemoryRefreshesFn?: (input: {
    workspaceId: string
  }) => Promise<unknown>
  refreshWorkspaceMemoriesFn?: (workspaceId: string) => Promise<unknown>
  logAgentRunFn?: typeof logAgentRun
}) {
  if (TOOL_ONLY_PROVIDERS.has(input.provider as never)) {
    await markToolOnlyProviderReady({
      supabase: input.supabase,
      workspaceId: input.workspaceId,
      provider: input.provider,
      trigger: input.trigger,
    })

    return {
      message: buildToolOnlyMessage(input.provider),
      result: null,
      toolOnly: true,
    }
  }

  if (!isSyncableProvider(input.provider)) {
    throw new Error(`Manual sync for ${input.provider} is not supported.`)
  }

  const runner = PROVIDER_SYNC_RUNNERS[input.provider]
  const runSync = input.overrideRunner ?? runner.run
  const formatSuccessMessage =
    input.overrideSuccessMessage ?? runner.formatSuccessMessage

  try {
    const syncStartedAt = new Date().toISOString()
    const result = await runSync(input.workspaceId)

    if (input.refreshAccountMemories ?? true) {
      if (input.refreshWorkspaceMemoriesFn) {
        await input.refreshWorkspaceMemoriesFn(input.workspaceId)
      } else {
        await (
          input.enqueueRecentlyTouchedAccountMemoriesFn ?? enqueueRecentlyTouchedAccountMemories
        )(input.workspaceId, syncStartedAt)
        await (
          input.processQueuedAccountMemoryRefreshesFn ?? processQueuedAccountMemoryRefreshes
        )({
          workspaceId: input.workspaceId,
        })
      }
    }

    await markIntegrationSyncSucceeded({
      supabase: input.supabase,
      workspaceId: input.workspaceId,
      provider: input.provider,
      trigger: input.trigger,
    })

    return {
      message: formatSuccessMessage(result),
      result,
      toolOnly: false,
    }
  } catch (error) {
    const errorMessage = formatErrorMessage(error)

    await markIntegrationSyncFailed({
      supabase: input.supabase,
      workspaceId: input.workspaceId,
      provider: input.provider,
      trigger: input.trigger,
      errorMessage,
    })

    if (input.logFailure ?? true) {
      await (input.logAgentRunFn ?? logAgentRun)({
        workspaceId: input.workspaceId,
        runType: 'sync_failed',
        status: 'failed',
        outputSummary: `${input.provider} sync failed: ${errorMessage}`,
        error: errorMessage,
        metadata: {
          provider: input.provider,
          trigger: input.trigger,
        },
      })
    }

    throw error
  }
}
