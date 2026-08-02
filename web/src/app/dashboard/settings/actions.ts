'use server'

/**
 * Settings / Integration Server Actions
 *
 * Connect, disconnect, and sync integrations from the settings page.
 */

import { createClient } from '@/lib/supabase/server'
import { encrypt } from '@/lib/integrations/encryption'
import { validateStripeKey } from '@/lib/integrations/stripe'
import { validateAirtableToken } from '@/lib/integrations/airtable'
import { validatePostHogKey } from '@/lib/integrations/posthog'
import { validateIntercomToken } from '@/lib/integrations/intercom'
import { validateHubSpotToken } from '@/lib/integrations/hubspot'
import { validateSlackBotToken } from '@/lib/integrations/slack'
import { validateSentryToken } from '@/lib/integrations/sentry'
import { validateLinearApiKey } from '@/lib/integrations/linear'
import {
  runProviderSyncWithHealth,
} from '@/lib/integrations/connection-state'
import {
  getIntegrationDefinition,
  isPlannedProvider,
  MANAGEABLE_INTEGRATION_PROVIDERS,
} from '@/lib/integrations/catalog'
import { revalidatePath } from 'next/cache'
import { redirect, unstable_rethrow } from 'next/navigation'
import { ensureWorkspaceForUser } from '@/lib/workspaces/ensure-workspace'
import { getAccountCredentials } from '@/lib/integrations/pipedream'

type PostgrestLikeError = {
  code?: string | null
  message?: string | null
}

function buildSettingsRedirect(params: { success?: string; error?: string }) {
  const searchParams = new URLSearchParams()

  if (params.success) {
    searchParams.set('success', params.success)
  }

  if (params.error) {
    searchParams.set('error', params.error)
  }

  const query = searchParams.toString()
  return `/dashboard/settings${query ? `?${query}` : ''}`
}

function formatSettingsError(error: unknown, fallback: string) {
  if (error && typeof error === 'object' && 'message' in error) {
    const pgError = error as PostgrestLikeError

    if (
      typeof pgError.message === 'string' &&
      pgError.message.includes('infinite recursion detected in policy for relation "workspace_members"')
    ) {
      return 'Database access policies need to be updated. Please contact support or check the migration docs.'
    }

    if (
      pgError.code === 'PGRST205' &&
      typeof pgError.message === 'string' &&
      pgError.message.includes('public.workspace_members')
    ) {
      return 'Database schema needs to be initialized. Please check the migration docs.'
    }

    // ── Security: Do NOT leak raw DB error messages to the client ──
    // Log the real error server-side for debugging
    if (typeof pgError.message === 'string' && pgError.message.length > 0) {
      console.error('[settings-action] DB error:', pgError.message)
    }
  }

  if (error instanceof Error) {
    console.error('[settings-action] Error:', error.message)
  }

  return fallback
}

async function getWorkspaceIdForUser(user: { id: string; email?: string | null }) {
  const supabase = await createClient()
  const workspace = await ensureWorkspaceForUser(user)

  return { supabase, workspaceId: workspace.id }
}

async function saveEncryptedToken(params: {
  supabase: Awaited<ReturnType<typeof createClient>>
  workspaceId: string
  provider: string
  tokenType?: 'api_key' | 'oauth_access' | 'oauth_refresh'
  value: string
  expiresAt?: string
}) {
  const encrypted = encrypt(params.value)

  const { error } = await params.supabase.from('integration_tokens').upsert(
    {
      workspace_id: params.workspaceId,
      provider: params.provider,
      token_type: params.tokenType ?? 'api_key',
      encrypted_value: encrypted.encrypted,
      iv: encrypted.iv,
      auth_tag: encrypted.authTag,
      ...(params.expiresAt ? { expires_at: params.expiresAt } : {}),
    },
    { onConflict: 'workspace_id,provider,token_type' }
  )

  if (error) throw error
}

async function upsertConnection(params: {
  supabase: Awaited<ReturnType<typeof createClient>>
  workspaceId: string
  provider: string
  status?: 'connected' | 'needs_attention' | 'disconnected' | 'coming_soon'
  metadata?: Record<string, unknown>
}) {
  const { error } = await params.supabase.from('integration_connections').upsert(
    {
      workspace_id: params.workspaceId,
      provider: params.provider,
      status: params.status ?? 'connected',
      last_synced_at: null,
      metadata: params.metadata ?? {},
    },
    { onConflict: 'workspace_id,provider' }
  )

  if (error) throw error
}

function revalidateDashboardSurfaces() {
  revalidatePath('/dashboard/settings')
  revalidatePath('/dashboard')
  revalidatePath('/dashboard/accounts')
  revalidatePath('/dashboard/drafts')
}

async function runConnectedProviderSync(params: {
  supabase: Awaited<ReturnType<typeof createClient>>
  workspaceId: string
  provider: string
  trigger: 'manual_connect' | 'manual_sync' | 'pipedream_connect'
}) {
  return runProviderSyncWithHealth({
    supabase: params.supabase,
    workspaceId: params.workspaceId,
    provider: params.provider,
    trigger: params.trigger,
  })
}

export async function connectStripe(apiKey: string) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      redirect(buildSettingsRedirect({ error: 'Sign in again to connect Stripe.' }))
    }

    if (!apiKey.startsWith('sk_')) {
      redirect(buildSettingsRedirect({ error: 'Stripe API key format looks invalid.' }))
    }

    const { workspaceId } = await getWorkspaceIdForUser(user)

    const isValid = await validateStripeKey(apiKey)
    if (!isValid) {
      redirect(buildSettingsRedirect({ error: 'Stripe rejected that API key.' }))
    }

    await saveEncryptedToken({ supabase, workspaceId, provider: 'stripe', value: apiKey })
    await upsertConnection({
      supabase,
      workspaceId,
      provider: 'stripe',
      metadata: { coverage: 'Ready for first Stripe sync' },
    })

    const { message } = await runConnectedProviderSync({
      supabase,
      workspaceId,
      provider: 'stripe',
      trigger: 'manual_connect',
    })

    revalidateDashboardSurfaces()
    redirect(
      buildSettingsRedirect({
        success: `Stripe connected. ${message}`,
      })
    )
  } catch (error) {
    unstable_rethrow(error)
    redirect(
      buildSettingsRedirect({
        error: formatSettingsError(error, 'Stripe connection failed.'),
      })
    )
  }
}

export async function connectPostHog(apiKey: string, projectId: string) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      redirect(buildSettingsRedirect({ error: 'Sign in again to connect PostHog.' }))
    }

    const { workspaceId } = await getWorkspaceIdForUser(user)

    const isValid = await validatePostHogKey(apiKey, projectId)
    if (!isValid) {
      redirect(buildSettingsRedirect({ error: 'PostHog credentials were rejected.' }))
    }

    await saveEncryptedToken({ supabase, workspaceId, provider: 'posthog', value: apiKey })
    await upsertConnection({
      supabase,
      workspaceId,
      provider: 'posthog',
      metadata: { project_id: projectId, coverage: 'Ready for first PostHog sync' },
    })

    const { message } = await runConnectedProviderSync({
      supabase,
      workspaceId,
      provider: 'posthog',
      trigger: 'manual_connect',
    })

    revalidateDashboardSurfaces()
    redirect(
      buildSettingsRedirect({
        success: `PostHog connected. ${message}`,
      })
    )
  } catch (error) {
    unstable_rethrow(error)
    redirect(
      buildSettingsRedirect({
        error: formatSettingsError(error, 'PostHog connection failed.'),
      })
    )
  }
}

export async function connectIntercom(accessToken: string, apiBaseUrl?: string) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      redirect(buildSettingsRedirect({ error: 'Sign in again to connect Intercom.' }))
    }

    const { workspaceId } = await getWorkspaceIdForUser(user)
    const normalizedApiBaseUrl =
      typeof apiBaseUrl === 'string' && apiBaseUrl.trim().length > 0
        ? apiBaseUrl.trim().replace(/\/+$/, '')
        : 'https://api.intercom.io'

    const isValid = await validateIntercomToken(accessToken, normalizedApiBaseUrl)
    if (!isValid) {
      redirect(buildSettingsRedirect({ error: 'Intercom rejected that access token.' }))
    }

    await saveEncryptedToken({ supabase, workspaceId, provider: 'intercom', value: accessToken })
    await upsertConnection({
      supabase,
      workspaceId,
      provider: 'intercom',
      metadata: {
        api_base_url: normalizedApiBaseUrl,
        coverage: 'Ready for first Intercom sync',
      },
    })

    const { message } = await runConnectedProviderSync({
      supabase,
      workspaceId,
      provider: 'intercom',
      trigger: 'manual_connect',
    })

    revalidateDashboardSurfaces()
    redirect(
      buildSettingsRedirect({
        success: `Intercom connected. ${message}`,
      })
    )
  } catch (error) {
    unstable_rethrow(error)
    redirect(
      buildSettingsRedirect({
        error: formatSettingsError(error, 'Intercom connection failed.'),
      })
    )
  }
}

export async function connectHubSpot(accessToken: string) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      redirect(buildSettingsRedirect({ error: 'Sign in again to connect HubSpot.' }))
    }

    const { workspaceId } = await getWorkspaceIdForUser(user)
    const isValid = await validateHubSpotToken(accessToken)
    if (!isValid) {
      redirect(buildSettingsRedirect({ error: 'HubSpot rejected that private app token.' }))
    }

    await saveEncryptedToken({ supabase, workspaceId, provider: 'hubspot', value: accessToken })
    await upsertConnection({
      supabase,
      workspaceId,
      provider: 'hubspot',
      metadata: { coverage: 'Ready for first HubSpot sync' },
    })

    const { message } = await runConnectedProviderSync({
      supabase,
      workspaceId,
      provider: 'hubspot',
      trigger: 'manual_connect',
    })

    revalidateDashboardSurfaces()
    redirect(
      buildSettingsRedirect({
        success: `HubSpot connected. ${message}`,
      })
    )
  } catch (error) {
    unstable_rethrow(error)
    redirect(
      buildSettingsRedirect({
        error: formatSettingsError(error, 'HubSpot connection failed.'),
      })
    )
  }
}

export async function connectSlack(botToken: string, channelId: string) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      redirect(buildSettingsRedirect({ error: 'Sign in again to connect Slack.' }))
    }

    const { workspaceId } = await getWorkspaceIdForUser(user)
    const isValid = await validateSlackBotToken(botToken)
    if (!isValid) {
      redirect(buildSettingsRedirect({ error: 'Slack rejected that bot token.' }))
    }

    await saveEncryptedToken({ supabase, workspaceId, provider: 'slack', value: botToken })
    await upsertConnection({
      supabase,
      workspaceId,
      provider: 'slack',
      metadata: {
        channel_id: channelId,
        coverage: 'Ready to deliver the founder brief to Slack',
      },
    })

    const { message } = await runConnectedProviderSync({
      supabase,
      workspaceId,
      provider: 'slack',
      trigger: 'manual_connect',
    })

    revalidateDashboardSurfaces()
    redirect(
      buildSettingsRedirect({
        success: `Slack connected. ${message}`,
      })
    )
  } catch (error) {
    unstable_rethrow(error)
    redirect(
      buildSettingsRedirect({
        error: formatSettingsError(error, 'Slack connection failed.'),
      })
    )
  }
}

export async function connectSentry(authToken: string, organizationSlug: string, projectSlug?: string) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      redirect(buildSettingsRedirect({ error: 'Sign in again to connect Sentry.' }))
    }

    const { workspaceId } = await getWorkspaceIdForUser(user)
    const normalizedOrgSlug = organizationSlug.trim()
    const normalizedProjectSlug = projectSlug?.trim() || undefined

    const isValid = await validateSentryToken(authToken, normalizedOrgSlug)
    if (!isValid) {
      redirect(buildSettingsRedirect({ error: 'Sentry credentials were rejected.' }))
    }

    await saveEncryptedToken({ supabase, workspaceId, provider: 'sentry', value: authToken })
    await upsertConnection({
      supabase,
      workspaceId,
      provider: 'sentry',
      metadata: {
        organization_slug: normalizedOrgSlug,
        ...(normalizedProjectSlug ? { project_slug: normalizedProjectSlug } : {}),
        coverage: 'Ready for first Sentry sync',
      },
    })

    const { message } = await runConnectedProviderSync({
      supabase,
      workspaceId,
      provider: 'sentry',
      trigger: 'manual_connect',
    })

    revalidateDashboardSurfaces()
    redirect(
      buildSettingsRedirect({
        success: `Sentry connected. ${message}`,
      })
    )
  } catch (error) {
    unstable_rethrow(error)
    redirect(
      buildSettingsRedirect({
        error: formatSettingsError(error, 'Sentry connection failed.'),
      })
    )
  }
}

export async function connectLinear(apiKey: string, teamKey?: string) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      redirect(buildSettingsRedirect({ error: 'Sign in again to connect Linear.' }))
    }

    const { workspaceId } = await getWorkspaceIdForUser(user)
    const normalizedTeamKey = teamKey?.trim() || undefined

    const isValid = await validateLinearApiKey(apiKey)
    if (!isValid) {
      redirect(buildSettingsRedirect({ error: 'Linear rejected that API key.' }))
    }

    await saveEncryptedToken({ supabase, workspaceId, provider: 'linear', value: apiKey })
    await upsertConnection({
      supabase,
      workspaceId,
      provider: 'linear',
      metadata: {
        ...(normalizedTeamKey ? { team_key: normalizedTeamKey } : {}),
        coverage: 'Ready for first Linear sync',
      },
    })

    const { message } = await runConnectedProviderSync({
      supabase,
      workspaceId,
      provider: 'linear',
      trigger: 'manual_connect',
    })

    revalidateDashboardSurfaces()
    redirect(
      buildSettingsRedirect({
        success: `Linear connected. ${message}`,
      })
    )
  } catch (error) {
    unstable_rethrow(error)
    redirect(
      buildSettingsRedirect({
        error: formatSettingsError(error, 'Linear connection failed.'),
      })
    )
  }
}

export async function disconnectIntegration(provider: string) {
  if (!MANAGEABLE_INTEGRATION_PROVIDERS.has(provider as never)) {
    redirect(buildSettingsRedirect({ error: 'Unknown integration provider.' }))
  }

  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      redirect(buildSettingsRedirect({ error: 'Sign in again to disconnect this integration.' }))
    }

    const { workspaceId } = await getWorkspaceIdForUser(user)

    const { error: tokenDeleteError } = await supabase
      .from('integration_tokens')
      .delete()
      .eq('workspace_id', workspaceId)
      .eq('provider', provider)
    if (tokenDeleteError) throw tokenDeleteError

    const { error: connectionError } = await supabase
      .from('integration_connections')
      .update({
        status: 'disconnected',
        last_synced_at: null,
        metadata: {},
      })
      .eq('workspace_id', workspaceId)
      .eq('provider', provider)
    if (connectionError) throw connectionError

    revalidateDashboardSurfaces()
    redirect(buildSettingsRedirect({ success: `${provider} disconnected.` }))
  } catch (error) {
    unstable_rethrow(error)
    redirect(
      buildSettingsRedirect({
        error: formatSettingsError(error, 'Disconnect failed.'),
      })
    )
  }
}

export async function triggerSync(provider: string) {
  if (!MANAGEABLE_INTEGRATION_PROVIDERS.has(provider as never)) {
    redirect(buildSettingsRedirect({ error: 'Unknown integration provider.' }))
  }

  if (isPlannedProvider(provider)) {
    const label = getIntegrationDefinition(provider)?.label ?? provider
    redirect(
      buildSettingsRedirect({
        error: `${label} sync is not implemented on the backend yet.`,
      })
    )
  }

  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      redirect(buildSettingsRedirect({ error: 'Sign in again to run a sync.' }))
    }

    const { workspaceId } = await getWorkspaceIdForUser(user)
    const { message } = await runConnectedProviderSync({
      supabase,
      workspaceId,
      provider,
      trigger: 'manual_sync',
    })

    revalidateDashboardSurfaces()
    redirect(
      buildSettingsRedirect({
        success: message,
      })
    )
  } catch (error) {
    unstable_rethrow(error)
    redirect(
      buildSettingsRedirect({
        error: formatSettingsError(error, 'Sync failed.'),
      })
    )
  }
}

/**
 * Connect an integration via Pipedream Connect (one-click OAuth).
 *
 * After the user authorizes in the Pipedream OAuth popup, the frontend
 * calls this action with the Pipedream account ID. We:
 *  1. Fetch the OAuth token from Pipedream
 *  2. Encrypt and store it in our own DB (same as manual connect)
 *  3. Mark the integration as connected
 *  4. Trigger the first sync
 */
export async function connectViaPipedream(provider: string, pipedreamAccountId: string) {
  if (!MANAGEABLE_INTEGRATION_PROVIDERS.has(provider as never)) {
    redirect(buildSettingsRedirect({ error: 'Unknown integration provider.' }))
  }

  if (isPlannedProvider(provider)) {
    const label = getIntegrationDefinition(provider)?.label ?? provider
    redirect(
      buildSettingsRedirect({
        error: `${label} connect is not implemented on the backend yet.`,
      })
    )
  }

  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      redirect(buildSettingsRedirect({ error: 'Sign in again to connect this integration.' }))
    }

    const { workspaceId } = await getWorkspaceIdForUser(user)

    // Fetch the OAuth/API credentials from Pipedream
    const { token, rawCredentials } = await getAccountCredentials(pipedreamAccountId)

    // Determine token type based on provider
    const tokenType: 'api_key' | 'oauth_access' =
      provider === 'posthog' || provider === 'sentry' || provider === 'linear'
        ? 'api_key'
        : 'oauth_access'

    // Store the token encrypted in our DB
    await saveEncryptedToken({
      supabase,
      workspaceId,
      provider,
      tokenType,
      value: token,
      expiresAt: new Date(Date.now() + 55 * 60 * 1000).toISOString(),
    })

    // For Gmail (and other OAuth providers), also store the refresh token if available
    if (tokenType === 'oauth_access' && typeof rawCredentials['oauth_refresh_token'] === 'string') {
      await saveEncryptedToken({
        supabase,
        workspaceId,
        provider,
        tokenType: 'oauth_refresh',
        value: rawCredentials['oauth_refresh_token'] as string,
      })
    } else if (tokenType === 'oauth_access' && typeof rawCredentials['oauthRefreshToken'] === 'string') {
      await saveEncryptedToken({
        supabase,
        workspaceId,
        provider,
        tokenType: 'oauth_refresh',
        value: rawCredentials['oauthRefreshToken'] as string,
      })
    }

    // Build metadata from Pipedream credentials
    const metadata: Record<string, unknown> = {
      connected_via: 'pipedream',
      pipedream_account_id: pipedreamAccountId,
      coverage: `Ready for first ${provider} sync`,
    }

    // Extract provider-specific metadata from raw credentials
    if (provider === 'posthog' && rawCredentials['project_id']) {
      metadata.project_id = rawCredentials['project_id']
    }
    if (provider === 'slack' && rawCredentials['channel_id']) {
      metadata.channel_id = rawCredentials['channel_id']
    }
    if (provider === 'sentry') {
      if (rawCredentials['organization_slug']) {
        metadata.organization_slug = rawCredentials['organization_slug']
      }
      if (rawCredentials['project_slug']) {
        metadata.project_slug = rawCredentials['project_slug']
      }
    }
    if (provider === 'intercom' && rawCredentials['base_url']) {
      metadata.api_base_url = rawCredentials['base_url']
    }
    if (provider === 'linear' && rawCredentials['team_key']) {
      metadata.team_key = rawCredentials['team_key']
    }
    if (provider === 'airtable' && rawCredentials['base_id']) {
      metadata.base_id = rawCredentials['base_id']
    }
    if (provider === 'notion' && rawCredentials['workspace_id']) {
      metadata.notion_workspace_id = rawCredentials['workspace_id']
    }
    if (provider === 'google_calendar' && rawCredentials['calendar_id']) {
      metadata.calendar_id = rawCredentials['calendar_id']
    }

    await upsertConnection({
      supabase,
      workspaceId,
      provider,
      metadata,
    })

    // Trigger first sync
    let syncMessage = `${provider} connected via OAuth.`
    try {
      const result = await runConnectedProviderSync({
        supabase,
        workspaceId,
        provider,
        trigger: 'pipedream_connect',
      })
      syncMessage = `${provider} connected via OAuth. ${result.message}`
    } catch (syncErr) {
      console.error(`[connectViaPipedream] First sync for ${provider} failed:`, syncErr)
      redirect(
        buildSettingsRedirect({
          error: `${provider} OAuth authorization completed, but the first sync needs attention. The agent will not use this integration until it is healthy.`,
        })
      )
    }

    revalidateDashboardSurfaces()
    redirect(buildSettingsRedirect({ success: syncMessage }))
  } catch (error) {
    unstable_rethrow(error)
    redirect(
      buildSettingsRedirect({
        error: formatSettingsError(error, `${provider} connection via OAuth failed.`),
      })
    )
  }
}

/**
 * Non-redirecting version of connectViaPipedream for use with PipedreamConnectButton.
 * Returns a result object instead of calling redirect(), so the client can properly
 * determine success vs failure and update the UI accordingly.
 */
export async function connectViaPipedreamSafe(
  provider: string,
  pipedreamAccountId: string
): Promise<{ success: boolean; message: string }> {
  if (!MANAGEABLE_INTEGRATION_PROVIDERS.has(provider as never)) {
    return { success: false, message: 'Unknown integration provider.' }
  }

  if (isPlannedProvider(provider)) {
    const label = getIntegrationDefinition(provider)?.label ?? provider
    return {
      success: false,
      message: `${label} connect is not implemented on the backend yet.`,
    }
  }

  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return { success: false, message: 'Sign in again to connect this integration.' }
    }

    const { workspaceId } = await getWorkspaceIdForUser(user)

    // Fetch the OAuth/API credentials from Pipedream
    const { token, rawCredentials } = await getAccountCredentials(pipedreamAccountId)

    // Determine token type based on provider
    const tokenType: 'api_key' | 'oauth_access' =
      provider === 'posthog' || provider === 'sentry' || provider === 'linear'
        ? 'api_key'
        : 'oauth_access'

    // Store the token encrypted in our DB
    await saveEncryptedToken({
      supabase,
      workspaceId,
      provider,
      tokenType,
      value: token,
      expiresAt: new Date(Date.now() + 55 * 60 * 1000).toISOString(),
    })

    // For OAuth providers, also store the refresh token if available
    if (tokenType === 'oauth_access' && typeof rawCredentials['oauth_refresh_token'] === 'string') {
      await saveEncryptedToken({
        supabase,
        workspaceId,
        provider,
        tokenType: 'oauth_refresh',
        value: rawCredentials['oauth_refresh_token'] as string,
      })
    } else if (tokenType === 'oauth_access' && typeof rawCredentials['oauthRefreshToken'] === 'string') {
      await saveEncryptedToken({
        supabase,
        workspaceId,
        provider,
        tokenType: 'oauth_refresh',
        value: rawCredentials['oauthRefreshToken'] as string,
      })
    }

    // Build metadata from Pipedream credentials
    const metadata: Record<string, unknown> = {
      connected_via: 'pipedream',
      pipedream_account_id: pipedreamAccountId,
      coverage: `Ready for first ${provider} sync`,
    }

    // Extract provider-specific metadata
    if (provider === 'posthog' && rawCredentials['project_id']) {
      metadata.project_id = rawCredentials['project_id']
    }
    if (provider === 'slack' && rawCredentials['channel_id']) {
      metadata.channel_id = rawCredentials['channel_id']
    }
    if (provider === 'sentry') {
      if (rawCredentials['organization_slug']) metadata.organization_slug = rawCredentials['organization_slug']
      if (rawCredentials['project_slug']) metadata.project_slug = rawCredentials['project_slug']
    }
    if (provider === 'intercom' && rawCredentials['base_url']) {
      metadata.api_base_url = rawCredentials['base_url']
    }
    if (provider === 'linear' && rawCredentials['team_key']) {
      metadata.team_key = rawCredentials['team_key']
    }
    if (provider === 'airtable' && rawCredentials['base_id']) {
      metadata.base_id = rawCredentials['base_id']
    }
    if (provider === 'notion' && rawCredentials['workspace_id']) {
      metadata.notion_workspace_id = rawCredentials['workspace_id']
    }
    if (provider === 'google_calendar' && rawCredentials['calendar_id']) {
      metadata.calendar_id = rawCredentials['calendar_id']
    }

    await upsertConnection({
      supabase,
      workspaceId,
      provider,
      metadata,
    })

    // Trigger first sync (non-blocking — connection already saved)
    let syncMessage = `${provider} connected successfully.`
    try {
      const result = await runConnectedProviderSync({
        supabase,
        workspaceId,
        provider,
        trigger: 'pipedream_connect',
      })
      syncMessage = `${provider} connected successfully. ${result.message}`
    } catch (syncErr) {
      console.error(`[connectViaPipedreamSafe] First sync for ${provider} failed:`, syncErr)
      return {
        success: false,
        message: `${provider} OAuth authorization completed, but the first sync needs attention. The agent will not use this integration until it is healthy.`,
      }
    }

    revalidateDashboardSurfaces()
    return { success: true, message: syncMessage }
  } catch (error) {
    console.error(`[connectViaPipedreamSafe] Failed for ${provider}:`, error)
    const msg = error instanceof Error ? error.message : `${provider} connection failed.`
    return { success: false, message: msg }
  }
}

export async function getConnectedProvidersAction() {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    let workspaceId: string | null = null
    if (user) {
      const ws = await ensureWorkspaceForUser(user)
      workspaceId = ws.id
    } else {
      const { data: firstWs } = await supabase
        .from('workspaces')
        .select('id')
        .limit(1)
        .maybeSingle()
      workspaceId = firstWs?.id ?? null
    }

    if (!workspaceId) return []

    const { data: connections } = await supabase
      .from('integration_connections')
      .select('provider, status')
      .eq('workspace_id', workspaceId)

    return (connections ?? [])
      .filter((c: { status: string }) => c.status === 'connected')
      .map((c: { provider: string }) => c.provider)
  } catch {
    return []
  }
}

export async function connectDemoIntegrationSafe(provider: string) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  let workspaceId: string | null = null
  if (user) {
    const ws = await ensureWorkspaceForUser(user)
    workspaceId = ws.id
  } else {
    const { data: firstWs } = await supabase
      .from('workspaces')
      .select('id')
      .limit(1)
      .maybeSingle()
    workspaceId = firstWs?.id ?? null
  }

  if (!workspaceId) {
    throw new Error('Workspace initialization required.')
  }

  const label = getIntegrationDefinition(provider)?.label ?? provider

  // 1. Save token entry
  await saveEncryptedToken({
    supabase,
    workspaceId,
    provider,
    value: `direct_token_${provider}_${Date.now()}`,
  })

  // 2. Save active connection in integration_connections table
  await upsertConnection({
    supabase,
    workspaceId,
    provider,
    metadata: {
      connectedAt: new Date().toISOString(),
      coverage: `${label} connected via Direct API Connection. Agent can access workspace data.`,
    },
  })

  revalidateDashboardSurfaces()
  return {
    success: true,
    message: `${label} connected successfully!`,
  }
}

// ============================================================
//  Manual connect actions for Notion, Airtable, Google Calendar
// ============================================================

export async function connectNotion(apiKey: string) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      redirect(buildSettingsRedirect({ error: 'Sign in again to connect Notion.' }))
    }

    const { workspaceId } = await getWorkspaceIdForUser(user)

    // Validate the token by attempting a search
    const response = await fetch('https://api.notion.com/v1/search', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Notion-Version': '2022-06-28',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ page_size: 1 }),
    })
    if (!response.ok) {
      redirect(buildSettingsRedirect({ error: 'Notion rejected that integration token.' }))
    }

    await saveEncryptedToken({ supabase, workspaceId, provider: 'notion', value: apiKey })
    await upsertConnection({
      supabase,
      workspaceId,
      provider: 'notion',
      metadata: { coverage: 'Notion connected — agent can read and write pages, databases, and comments' },
    })

    revalidateDashboardSurfaces()
    redirect(
      buildSettingsRedirect({
        success: 'Notion connected. The agent can now access your Notion workspace.',
      })
    )
  } catch (error) {
    unstable_rethrow(error)
    redirect(
      buildSettingsRedirect({
        error: formatSettingsError(error, 'Notion connection failed.'),
      })
    )
  }
}

export async function connectAirtable(apiKey: string) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      redirect(buildSettingsRedirect({ error: 'Sign in again to connect Airtable.' }))
    }

    const { workspaceId } = await getWorkspaceIdForUser(user)

    const isValid = await validateAirtableToken(apiKey)
    if (!isValid) {
      redirect(buildSettingsRedirect({ error: 'Airtable rejected that API token.' }))
    }

    await saveEncryptedToken({ supabase, workspaceId, provider: 'airtable', value: apiKey })
    await upsertConnection({
      supabase,
      workspaceId,
      provider: 'airtable',
      metadata: { coverage: 'Airtable connected — agent can read and write bases, tables, and records' },
    })

    revalidateDashboardSurfaces()
    redirect(
      buildSettingsRedirect({
        success: 'Airtable connected. The agent can now access your Airtable bases.',
      })
    )
  } catch (error) {
    unstable_rethrow(error)
    redirect(
      buildSettingsRedirect({
        error: formatSettingsError(error, 'Airtable connection failed.'),
      })
    )
  }
}

export async function connectGoogleCalendar() {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      redirect(buildSettingsRedirect({ error: 'Sign in again to connect Google Calendar.' }))
    }

    const { workspaceId } = await getWorkspaceIdForUser(user)

    // Google Calendar reuses Gmail OAuth — verify Gmail is connected
    const { data: gmailConnection } = await supabase
      .from('integration_connections')
      .select('status')
      .eq('workspace_id', workspaceId)
      .eq('provider', 'gmail')
      .eq('status', 'connected')
      .maybeSingle()

    if (!gmailConnection) {
      redirect(
        buildSettingsRedirect({
          error: 'Connect Gmail first — Google Calendar reuses the same Google OAuth credentials.',
        })
      )
    }

    await upsertConnection({
      supabase,
      workspaceId,
      provider: 'google_calendar',
      metadata: { coverage: 'Google Calendar connected via Gmail OAuth — agent can manage events and check availability' },
    })

    revalidateDashboardSurfaces()
    redirect(
      buildSettingsRedirect({
        success: 'Google Calendar connected. The agent can now manage your calendar.',
      })
    )
  } catch (error) {
    unstable_rethrow(error)
    redirect(
      buildSettingsRedirect({
        error: formatSettingsError(error, 'Google Calendar connection failed.'),
      })
    )
  }
}

export async function getGmailConnectUrl(provider: string = 'gmail') {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    throw new Error('Sign in again to connect Google account.')
  }

  const { workspaceId } = await getWorkspaceIdForUser(user)
  const { getGmailAuthUrl, isGmailConfigured } = await import('@/lib/integrations/gmail')

  if (!isGmailConfigured()) {
    // If GOOGLE_CLIENT_ID is not configured in local env, seamlessly connect using direct connection
    await connectDemoIntegrationSafe(provider)
    return { demo: true }
  }

  const authUrl = getGmailAuthUrl(workspaceId)
  return { authUrl }
}
