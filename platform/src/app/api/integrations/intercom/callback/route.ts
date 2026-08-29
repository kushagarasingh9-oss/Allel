/**
 * Intercom OAuth callback.
 *
 * The state cookie binds the authorization response to both the signed-in
 * founder session and the intended Allel workspace. The exchanged bearer token
 * is encrypted at rest and the connection is only marked healthy after a live
 * `/me` verification and an initial read-only sync succeed.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/foundation/database/server'
import { createServiceClient } from '@/foundation/database/service'
import {
  exchangeIntercomCode,
  getIntercomApiBaseUrl,
  getIntercomWorkspaceIdentity,
  normalizeIntercomRegion,
} from '@/integrations/intercom/intercom'
import { encrypt } from '@/integrations/_core/encryption'
import { mergeIntegrationConnectionMetadata } from '@/integrations/_core/connection-guard'
import { runProviderSyncWithHealth } from '@/integrations/_core/connection-state'

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code')
  const state = request.nextUrl.searchParams.get('state')
  const providerError = request.nextUrl.searchParams.get('error')

  if (providerError) {
    return redirectToSettings(request, 'intercom_denied')
  }
  if (!code || !state) {
    return redirectToSettings(request, 'intercom_missing_params')
  }

  const expectedState = request.cookies.get('intercom_oauth_state')?.value
  if (!expectedState || expectedState !== state) {
    return redirectToSettings(request, 'intercom_invalid_oauth_state')
  }

  const [workspaceId, nonce, provider, rawRegion, ...extra] = state.split(':')
  if (!workspaceId || !nonce || provider !== 'intercom' || !rawRegion || extra.length > 0) {
    return redirectToSettings(request, 'intercom_invalid_oauth_state')
  }
  const region = normalizeIntercomRegion(rawRegion)
  if (region !== rawRegion) {
    return redirectToSettings(request, 'intercom_invalid_oauth_state')
  }

  const userSupabase = await createClient()
  const {
    data: { user },
  } = await userSupabase.auth.getUser()
  if (!user) {
    return NextResponse.redirect(new URL('/auth/login?error=session_expired', request.url))
  }

  const { data: membership, error: membershipError } = await userSupabase
    .from('workspace_members')
    .select('workspace_id')
    .eq('workspace_id', workspaceId)
    .eq('user_id', user.id)
    .maybeSingle()

  if (membershipError || !membership) {
    return redirectToSettings(request, 'intercom_unauthorized')
  }

  try {
    const { accessToken } = await exchangeIntercomCode({ code, region })
    const identity = await getIntercomWorkspaceIdentity(accessToken, region)
    const supabase = createServiceClient()
    const encrypted = encrypt(accessToken)

    const { error: tokenError } = await supabase.from('integration_tokens').upsert(
      {
        workspace_id: workspaceId,
        provider: 'intercom',
        token_type: 'oauth_access',
        encrypted_value: encrypted.encrypted,
        iv: encrypted.iv,
        auth_tag: encrypted.authTag,
        expires_at: null,
      },
      { onConflict: 'workspace_id,provider,token_type' }
    )
    if (tokenError) throw tokenError

    // Remove the retired manual-token credential so token selection cannot
    // accidentally fall back to a customer-supplied access token.
    const { error: legacyTokenError } = await supabase
      .from('integration_tokens')
      .delete()
      .eq('workspace_id', workspaceId)
      .eq('provider', 'intercom')
      .eq('token_type', 'api_key')
    if (legacyTokenError) throw legacyTokenError

    const { error: connectionError } = await supabase.from('integration_connections').upsert(
      {
        workspace_id: workspaceId,
        provider: 'intercom',
        status: 'connected',
        last_synced_at: null,
        metadata: await mergeIntegrationConnectionMetadata(supabase, workspaceId, 'intercom', {
          connected_via: 'intercom_oauth',
          oauth_verified_at: new Date().toISOString(),
          region,
          api_base_url: getIntercomApiBaseUrl(region),
          intercom_workspace_id: identity.id,
          intercom_workspace_name: identity.name,
          coverage: 'OAuth verified; performing the first read-only Intercom sync',
        }),
      },
      { onConflict: 'workspace_id,provider' }
    )
    if (connectionError) throw connectionError

    await runProviderSyncWithHealth({
      supabase,
      workspaceId,
      provider: 'intercom',
      trigger: 'api_connect',
      refreshAccountMemories: false,
    })

    const response = NextResponse.redirect(
      new URL('/dashboard/settings?success=Intercom+connected', request.url)
    )
    response.cookies.delete('intercom_oauth_state')
    return response
  } catch (error) {
    console.error('[intercom-oauth-callback] connection failed', error)
    return redirectToSettings(request, 'intercom_failed')
  }
}

function redirectToSettings(request: NextRequest, error: string) {
  const response = NextResponse.redirect(
    new URL(`/dashboard/settings?error=${encodeURIComponent(error)}`, request.url)
  )
  response.cookies.delete('intercom_oauth_state')
  return response
}
