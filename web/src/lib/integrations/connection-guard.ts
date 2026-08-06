import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Runtime guard for every third-party integration call.
 *
 * A token in integration_tokens is not proof that a connection is usable: it
 * may be left over from a disconnected integration or the last sync may have
 * marked the connection as needing attention. Chat tools must never fall back
 * to local data in either case.
 */
export type IntegrationConnectionStatus =
  | 'connected'
  | 'needs_attention'
  | 'disconnected'
  | 'coming_soon'

export type IntegrationConnection = {
  provider: string
  status: IntegrationConnectionStatus
  lastSyncedAt: string | null
  metadata: Record<string, unknown>
}

type IntegrationConnectionRow = {
  provider: string
  status: IntegrationConnectionStatus
  last_synced_at: string | null
  metadata: Record<string, unknown> | null
}

const PROVIDER_LABELS: Record<string, string> = {
  airtable: 'Airtable',
  gmail: 'Gmail',
  google_calendar: 'Google Calendar',
  hubspot: 'HubSpot',
  intercom: 'Intercom',
  linear: 'Linear',
  notion: 'Notion',
  posthog: 'PostHog',
  sentry: 'Sentry',
  slack: 'Slack',
  stripe: 'Stripe',
}

function providerLabel(provider: string) {
  return PROVIDER_LABELS[provider] ?? provider
}

function isUnverifiedConnection(connection: IntegrationConnection | null) {
  if (!connection) return false

  const coverage = connection.metadata.coverage
  const isLegacyDemo =
    connection.metadata.connected_via === 'workspace_connect' ||
    (typeof coverage === 'string' && coverage.includes('connected via Direct API Connection'))
  const isUnverifiedCalendar =
    connection.provider === 'google_calendar' &&
    (connection.metadata.connected_via !== 'google_oauth' ||
      typeof connection.metadata.oauth_verified_at !== 'string')

  return isLegacyDemo || isUnverifiedCalendar
}

export class IntegrationConnectionError extends Error {
  readonly provider: string
  readonly status: IntegrationConnectionStatus | 'missing' | 'demo'

  constructor(provider: string, status: IntegrationConnectionStatus | 'missing' | 'demo') {
    const label = providerLabel(provider)
    const detail =
      status === 'needs_attention'
        ? 'needs attention before live data can be used'
        : status === 'coming_soon'
          ? 'is not available yet'
          : status === 'demo'
            ? 'has only a demo connection, not a live provider connection'
          : 'is not connected'

    super(
      `${label} ${detail} for this workspace. Connect or repair it in Settings > Connections to use live data.`
    )
    this.name = 'IntegrationConnectionError'
    this.provider = provider
    this.status = status
  }
}

export async function getIntegrationConnection(
  supabase: SupabaseClient,
  workspaceId: string,
  provider: string
): Promise<IntegrationConnection | null> {
  const { data, error } = await supabase
    .from('integration_connections')
    .select('provider, status, last_synced_at, metadata')
    .eq('workspace_id', workspaceId)
    .eq('provider', provider)
    .maybeSingle<IntegrationConnectionRow>()

  if (error) throw error
  if (!data) return null

  return {
    provider: data.provider,
    status: data.status,
    lastSyncedAt: data.last_synced_at,
    metadata: data.metadata ?? {},
  }
}

/**
 * Returns true only for a verified live connection. Unhealthy and legacy demo
 * rows must never unlock a provider call in chat.
 */
export async function isIntegrationConnected(
  supabase: SupabaseClient,
  workspaceId: string,
  provider: string
) {
  const connection = await getIntegrationConnection(supabase, workspaceId, provider)
  return connection?.status === 'connected' && !isUnverifiedConnection(connection)
}

/**
 * Enforces the connection state before a provider token or API client is used.
 */
export async function requireIntegrationConnected(
  supabase: SupabaseClient,
  workspaceId: string,
  provider: string
): Promise<IntegrationConnection> {
  const connection = await getIntegrationConnection(supabase, workspaceId, provider)

  if (!connection) {
    throw new IntegrationConnectionError(provider, 'missing')
  }

  if (connection.status !== 'connected') {
    throw new IntegrationConnectionError(provider, connection.status)
  }

  if (isUnverifiedConnection(connection)) {
    throw new IntegrationConnectionError(provider, 'demo')
  }

  return connection
}

/**
 * Builds sync metadata without losing the credentials that established a
 * live connection. Sync jobs publish operational facts such as coverage and
 * last-run counts; those updates must not erase Pipedream account IDs or
 * connection provenance needed to refresh OAuth credentials later.
 */
export async function mergeIntegrationConnectionMetadata(
  supabase: SupabaseClient,
  workspaceId: string,
  provider: string,
  updates: Record<string, unknown>
) {
  const connection = await getIntegrationConnection(supabase, workspaceId, provider)
  const metadata = { ...(connection?.metadata ?? {}) }

  // A successful sync supersedes an earlier health error. Preserve all
  // provider connection fields, especially Pipedream account identifiers.
  delete metadata.last_error
  delete metadata.last_error_at

  return { ...metadata, ...updates }
}
