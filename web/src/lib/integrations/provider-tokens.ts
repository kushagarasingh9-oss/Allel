import { createServiceClient } from '@/lib/supabase/service'
import { decrypt } from './encryption'

export async function getIntegrationToken(
  workspaceId: string,
  provider: string,
  tokenType: 'api_key' | 'oauth_access' | 'oauth_refresh' = 'api_key'
) {
  const supabase = createServiceClient()

  // Try the requested token type first
  const { data, error } = await supabase
    .from('integration_tokens')
    .select('encrypted_value, iv, auth_tag')
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
      .select('encrypted_value, iv, auth_tag')
      .eq('workspace_id', workspaceId)
      .eq('provider', provider)
      .eq('token_type', fallbackType)
      .maybeSingle()

    if (fallback.error) throw fallback.error
    if (fallback.data) {
      return decrypt(fallback.data.encrypted_value, fallback.data.iv, fallback.data.auth_tag)
    }
  }

  if (!data) {
    throw new Error(`${provider} is not connected for this workspace`)
  }

  return decrypt(data.encrypted_value, data.iv, data.auth_tag)
}

export async function getIntegrationMetadata<T extends Record<string, unknown>>(
  workspaceId: string,
  provider: string
) {
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('integration_connections')
    .select('metadata')
    .eq('workspace_id', workspaceId)
    .eq('provider', provider)
    .maybeSingle()

  if (error) throw error
  return ((data?.metadata as T | null) ?? {}) as T
}
