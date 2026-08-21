import { createServiceClient } from '@/lib/supabase/service'
import { decrypt } from './encryption'
import { requireIntegrationConnected } from './connection-guard'
import {
  isProviderAuthFailure,
  markIntegrationAuthFailed,
  markIntegrationAuthSucceeded,
} from './integration-health'

type StoredIntegrationToken = {
  encrypted_value: string
  iv: string
  auth_tag: string
  expires_at: string | null
}

type IntegrationTokenType = 'api_key' | 'oauth_access' | 'oauth_refresh'

export async function getIntegrationToken(
  workspaceId: string,
  provider: string,
  tokenType: IntegrationTokenType = 'api_key'
) {
  const { token } = await getIntegrationTokenWithConnection(workspaceId, provider, tokenType)
  return token
}

/**
 * Same lookup as `getIntegrationToken`, but also returns the connection row.
 *
 * `executeWithProviderToken` uses the row's metadata to decide whether a health
 * record actually needs clearing, so the happy path stays a single read instead
 * of a read plus a pointless upsert on every tool call.
 */
export async function getIntegrationTokenWithConnection(
  workspaceId: string,
  provider: string,
  tokenType: IntegrationTokenType = 'api_key'
) {
  const supabase = createServiceClient()

  // This guard is deliberately before every token lookup. A retained token is
  // not permission to use a disconnected or unhealthy integration, and chat
  // must never substitute stored workspace rows for the provider's live API.
  const connection = await requireIntegrationConnected(supabase, workspaceId, provider)

  // Try the requested token type first
  const { data, error } = await supabase
    .from('integration_tokens')
    .select('encrypted_value, iv, auth_tag, expires_at')
    .eq('workspace_id', workspaceId)
    .eq('provider', provider)
    .eq('token_type', tokenType)
    .maybeSingle()

  if (error) throw error

  // If not found, try the other type (api_key ↔ oauth_access)
  // This handles both manual (api_key) and Pipedream (oauth_access) connections
  if (!data && tokenType !== 'oauth_refresh') {
    const fallbackType = tokenType === 'api_key' ? 'oauth_access' : 'api_key'
    const fallback = await supabase
      .from('integration_tokens')
      .select('encrypted_value, iv, auth_tag, expires_at')
      .eq('workspace_id', workspaceId)
      .eq('provider', provider)
      .eq('token_type', fallbackType)
      .maybeSingle()

    if (fallback.error) throw fallback.error
    if (fallback.data) {
      const fallbackToken = fallback.data as StoredIntegrationToken
      return {
        token: decrypt(fallbackToken.encrypted_value, fallbackToken.iv, fallbackToken.auth_tag),
        connection,
      }
    }
  }

  if (!data) {
    throw new Error(`${provider} is not connected for this workspace`)
  }

  const storedToken = data as StoredIntegrationToken
  return {
    token: decrypt(storedToken.encrypted_value, storedToken.iv, storedToken.auth_tag),
    connection,
  }
}

/**
 * Run a provider call with its credential, recording connection health.
 *
 * Health used to be written only by the sync runner, which never runs for
 * `tool_only` providers — so Notion, Airtable, and Calendar could fail
 * authentication indefinitely while the connection row still read `connected`
 * and the founder was told the integration was fine.
 *
 * Only authentication failures are recorded. A 404, a validation error, or a
 * rate limit is not a broken connection, and marking one as such would block
 * every later call behind the connection guard.
 */
export async function executeWithProviderToken<T>(
  workspaceId: string,
  provider: string,
  fn: (token: string) => Promise<T>,
  options?: { tokenType?: IntegrationTokenType }
): Promise<T> {
  const { token, connection } = await getIntegrationTokenWithConnection(
    workspaceId,
    provider,
    options?.tokenType ?? 'api_key'
  )

  try {
    const result = await fn(token)

    // Clear a recorded failure only when one exists. Most calls are healthy and
    // should not pay for an extra write.
    if (connection.metadata.last_error) {
      await markIntegrationAuthSucceeded({
        supabase: createServiceClient(),
        workspaceId,
        provider,
      })
    }

    return result
  } catch (error) {
    if (isProviderAuthFailure(error)) {
      await markIntegrationAuthFailed({
        supabase: createServiceClient(),
        workspaceId,
        provider,
        errorMessage: error instanceof Error ? error.message : String(error),
      })
    }

    throw error
  }
}

export async function getIntegrationMetadata<T extends Record<string, unknown>>(
  workspaceId: string,
  provider: string
) {
  const supabase = createServiceClient()
  const connection = await requireIntegrationConnected(supabase, workspaceId, provider)
  return connection.metadata as T
}
