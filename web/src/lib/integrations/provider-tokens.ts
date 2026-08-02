import { createServiceClient } from '@/lib/supabase/service'
import { decrypt, encrypt } from './encryption'
import { requireIntegrationConnected } from './connection-guard'

type StoredIntegrationToken = {
  encrypted_value: string
  iv: string
  auth_tag: string
  expires_at: string | null
}

async function resolveUsableTokenValue(input: {
  supabase: ReturnType<typeof createServiceClient>
  workspaceId: string
  provider: string
  tokenType: 'api_key' | 'oauth_access' | 'oauth_refresh'
  token: StoredIntegrationToken
  pipedreamAccountId: string | null
}) {
  return decrypt(input.token.encrypted_value, input.token.iv, input.token.auth_tag)
}

export async function getIntegrationToken(
  workspaceId: string,
  provider: string,
  tokenType: 'api_key' | 'oauth_access' | 'oauth_refresh' = 'api_key'
) {
  const supabase = createServiceClient()

  // This guard is deliberately before every token lookup. A retained token is
  // not permission to use a disconnected or unhealthy integration, and chat
  // must never substitute stored workspace rows for the provider's live API.
  const connection = await requireIntegrationConnected(supabase, workspaceId, provider)
  const pipedreamAccountId =
    typeof connection.metadata.pipedream_account_id === 'string'
      ? connection.metadata.pipedream_account_id
      : null

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
      return resolveUsableTokenValue({
        supabase,
        workspaceId,
        provider,
        tokenType: fallbackType,
        token: fallback.data as StoredIntegrationToken,
        pipedreamAccountId,
      })
    }
  }

  if (!data) {
    throw new Error(`${provider} is not connected for this workspace`)
  }

  return resolveUsableTokenValue({
    supabase,
    workspaceId,
    provider,
    tokenType,
    token: data as StoredIntegrationToken,
    pipedreamAccountId,
  })
}

export async function getIntegrationMetadata<T extends Record<string, unknown>>(
  workspaceId: string,
  provider: string
) {
  const supabase = createServiceClient()
  const connection = await requireIntegrationConnected(supabase, workspaceId, provider)
  return connection.metadata as T
}
