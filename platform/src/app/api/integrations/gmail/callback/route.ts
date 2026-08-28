/**
 * Google OAuth Callback
 *
 * GET /api/integrations/gmail/callback
 * Exchanges authorization code for tokens, stores encrypted.
 * Handles both Gmail and Google Calendar OAuth flows — the provider
 * is encoded in the state parameter.
 *
 * Security: validates a short-lived, HttpOnly state cookie and verifies the
 * authenticated user belongs to the workspace encoded in that state.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/foundation/database/server'
import { createServiceClient } from '@/foundation/database/service'
import { exchangeGmailCode, getGoogleRedirectUri } from '@/integrations/gmail/gmail'
import { runProviderSyncWithHealth } from '@/integrations/_core/connection-state'
import { isSyncableProvider } from '@/integrations/catalog'
import { encrypt } from '@/integrations/_core/encryption'
import { verifyGoogleCalendarAccess } from '@/integrations/google-calendar/google-calendar'
import { mergeIntegrationConnectionMetadata } from '@/integrations/_core/connection-guard'

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code')
  const state = request.nextUrl.searchParams.get('state') // workspaceId:nonce:provider
  const error = request.nextUrl.searchParams.get('error')

  if (error) {
    return NextResponse.redirect(new URL('/dashboard/settings?error=google_denied', request.url))
  }

  if (!code || !state) {
    return NextResponse.redirect(new URL('/dashboard/settings?error=missing_params', request.url))
  }

  const expectedState = request.cookies.get('google_oauth_state')?.value
  if (!expectedState || expectedState !== state) {
    return NextResponse.redirect(new URL('/dashboard/settings?error=invalid_oauth_state', request.url))
  }

  // ── Security: Verify the authenticated user owns this workspace ──
  const userSupabase = await createClient()
  const {
    data: { user },
  } = await userSupabase.auth.getUser()

  if (!user) {
    return NextResponse.redirect(new URL('/auth/login?error=session_expired', request.url))
  }

  // Parse the already-validated state: "workspaceId:nonce:provider"
  const stateParts = state.split(':')
  if (stateParts.length !== 3) {
    return NextResponse.redirect(new URL('/dashboard/settings?error=invalid_oauth_state', request.url))
  }

  const [workspaceId, nonce, rawProvider] = stateParts
  if (!workspaceId || !nonce || !['gmail', 'google_calendar'].includes(rawProvider)) {
    return NextResponse.redirect(new URL('/dashboard/settings?error=invalid_oauth_state', request.url))
  }
  const provider = rawProvider as 'gmail' | 'google_calendar'

  // Verify user is a member of the workspace in the state param
  const { data: membership } = await userSupabase
    .from('workspace_members')
    .select('workspace_id')
    .eq('user_id', user.id)
    .eq('workspace_id', workspaceId)
    .maybeSingle()

  if (!membership) {
    console.error(`[google-callback] User ${user.id} tried to connect ${provider} for workspace ${workspaceId} they don't belong to`)
    return NextResponse.redirect(new URL('/dashboard/settings?error=unauthorized', request.url))
  }

  // ── Token exchange & storage (uses service client for RLS-bypassed writes) ──
  try {
    const callbackRedirectUri = getGoogleRedirectUri(request.nextUrl.origin)
    const { accessToken, refreshToken, expiresAt } = await exchangeGmailCode(code, callbackRedirectUri)
    const supabase = createServiceClient()

    // An exchanged OAuth code is not enough evidence to unlock Calendar in
    // chat. Verify the exact Google Calendar API access first.
    if (provider === 'google_calendar') {
      await verifyGoogleCalendarAccess(accessToken)
    }

    // Store access token (encrypted) under the correct provider
    const encryptedAccess = encrypt(accessToken)
    const { error: accessTokenError } = await supabase.from('integration_tokens').upsert(
      {
        workspace_id: workspaceId,
        provider,
        token_type: 'oauth_access',
        encrypted_value: encryptedAccess.encrypted,
        iv: encryptedAccess.iv,
        auth_tag: encryptedAccess.authTag,
        expires_at: expiresAt.toISOString(),
      },
      { onConflict: 'workspace_id,provider,token_type' }
    )
    if (accessTokenError) throw accessTokenError

    if (refreshToken) {
      const encryptedRefresh = encrypt(refreshToken)
      const { error: refreshTokenError } = await supabase.from('integration_tokens').upsert(
        {
          workspace_id: workspaceId,
          provider,
          token_type: 'oauth_refresh',
          encrypted_value: encryptedRefresh.encrypted,
          iv: encryptedRefresh.iv,
          auth_tag: encryptedRefresh.authTag,
        },
        { onConflict: 'workspace_id,provider,token_type' }
      )
      if (refreshTokenError) throw refreshTokenError
    }

    // Remove credentials created by the retired manual Calendar path.
    if (provider === 'google_calendar') {
      const { error: legacyTokenError } = await supabase
        .from('integration_tokens')
        .delete()
        .eq('workspace_id', workspaceId)
        .eq('provider', provider)
        .eq('token_type', 'api_key')
      if (legacyTokenError) throw legacyTokenError
    }

    // Update integration status
    const providerLabel = provider === 'google_calendar' ? 'Google Calendar' : 'Gmail'
    const { error: connectionError } = await supabase.from('integration_connections').upsert(
      {
        workspace_id: workspaceId,
        provider,
        status: 'connected',
        last_synced_at: new Date().toISOString(),
        metadata: await mergeIntegrationConnectionMetadata(supabase, workspaceId, provider, {
          coverage: `${providerLabel} OAuth connected and verified`,
          connected_via: 'google_oauth',
          oauth_verified_at: new Date().toISOString(),
        }),
      },
      { onConflict: 'workspace_id,provider' }
    )
    if (connectionError) throw connectionError

    // Only run sync for syncable providers (Gmail has sync, Calendar does not)
    if (isSyncableProvider(provider)) {
      await runProviderSyncWithHealth({
        supabase,
        workspaceId,
        provider,
        trigger: 'gmail_oauth_callback',
      })
    }

    const response = NextResponse.redirect(
      new URL(`/dashboard/settings?success=${encodeURIComponent(providerLabel)}+connected`, request.url)
    )
    response.cookies.delete('google_oauth_state')
    return response
  } catch (err) {
    console.error(`Google OAuth callback error (${provider}):`, err)
    return NextResponse.redirect(
      new URL(`/dashboard/settings?error=${provider}_failed`, request.url)
    )
  }
}
