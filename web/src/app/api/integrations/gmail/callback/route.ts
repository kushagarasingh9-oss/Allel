/**
 * Gmail OAuth Callback
 *
 * GET /api/integrations/gmail/callback
 * Exchanges authorization code for tokens, stores encrypted.
 *
 * Security: Verifies the authenticated user is a member of the workspace
 * passed in the OAuth state parameter to prevent CSRF token injection.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { exchangeGmailCode } from '@/lib/integrations/gmail'
import { runProviderSyncWithHealth } from '@/lib/integrations/connection-state'
import { encrypt } from '@/lib/integrations/encryption'

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code')
  const state = request.nextUrl.searchParams.get('state') // workspaceId:nonce
  const error = request.nextUrl.searchParams.get('error')

  if (error) {
    return NextResponse.redirect(new URL('/dashboard/settings?error=gmail_denied', request.url))
  }

  if (!code || !state) {
    return NextResponse.redirect(new URL('/dashboard/settings?error=missing_params', request.url))
  }

  // ── Security: Verify the authenticated user owns this workspace ──
  const userSupabase = await createClient()
  const {
    data: { user },
  } = await userSupabase.auth.getUser()

  if (!user) {
    return NextResponse.redirect(new URL('/auth/login?error=session_expired', request.url))
  }

  // Parse state: "workspaceId:nonce" — extract workspace ID (ignore nonce, it's for CSRF)
  const workspaceId = state.includes(':') ? state.split(':')[0] : state

  // Verify user is a member of the workspace in the state param
  const { data: membership } = await userSupabase
    .from('workspace_members')
    .select('workspace_id')
    .eq('user_id', user.id)
    .eq('workspace_id', workspaceId)
    .maybeSingle()

  if (!membership) {
    console.error(`[gmail-callback] User ${user.id} tried to connect Gmail for workspace ${workspaceId} they don't belong to`)
    return NextResponse.redirect(new URL('/dashboard/settings?error=unauthorized', request.url))
  }

  // ── Token exchange & storage (uses service client for RLS-bypassed writes) ──
  try {
    const { accessToken, refreshToken, expiresAt } = await exchangeGmailCode(code)
    const supabase = createServiceClient()

    // Store access token (encrypted)
    const encryptedAccess = encrypt(accessToken)
    const { error: accessTokenError } = await supabase.from('integration_tokens').upsert(
      {
        workspace_id: workspaceId,
        provider: 'gmail',
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
          provider: 'gmail',
          token_type: 'oauth_refresh',
          encrypted_value: encryptedRefresh.encrypted,
          iv: encryptedRefresh.iv,
          auth_tag: encryptedRefresh.authTag,
        },
        { onConflict: 'workspace_id,provider,token_type' }
      )
      if (refreshTokenError) throw refreshTokenError
    }

    // Update integration status
    const { error: connectionError } = await supabase.from('integration_connections').upsert(
      {
        workspace_id: workspaceId,
        provider: 'gmail',
        status: 'connected',
        last_synced_at: new Date().toISOString(),
        metadata: { coverage: 'OAuth connected' },
      },
      { onConflict: 'workspace_id,provider' }
    )
    if (connectionError) throw connectionError

    await runProviderSyncWithHealth({
      supabase,
      workspaceId,
      provider: 'gmail',
      trigger: 'gmail_oauth_callback',
    })

    return NextResponse.redirect(new URL('/dashboard/settings?success=gmail', request.url))
  } catch (err) {
    console.error('Gmail OAuth callback error:', err)
    return NextResponse.redirect(new URL('/dashboard/settings?error=gmail_failed', request.url))
  }
}
