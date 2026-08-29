'use server'

/**
 * Settings / Integration Server Actions
 *
 * Connect, disconnect, and sync integrations from the settings page.
 */

import { createClient } from '@/foundation/database/server'
import { encrypt } from '@/integrations/_core/encryption'
import { validateStripeKey } from '@/integrations/stripe/stripe'
import { validateAirtableToken } from '@/integrations/airtable/airtable'
import { validatePostHogKey, validateAndResolvePostHog } from '@/integrations/posthog/posthog'
import { validateHubSpotToken } from '@/integrations/hubspot/hubspot'
import { validateSlackBotToken } from '@/integrations/slack/slack'
import { validateSentryToken } from '@/integrations/sentry/sentry'
import { validateLinearApiKey } from '@/integrations/linear/linear'
import {
  runProviderSyncWithHealth,
} from '@/integrations/_core/connection-state'
import {
  getIntegrationDefinition,
  isPlannedProvider,
  MANAGEABLE_INTEGRATION_PROVIDERS,
} from '@/integrations/catalog'
import { revalidatePath } from 'next/cache'
import { redirect, unstable_rethrow } from 'next/navigation'
import { cookies, headers } from 'next/headers'
import { ensureWorkspaceForUser } from '@/data/workspaces/ensure-workspace'

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

export async function upsertConnection(params: {
  supabase: Awaited<ReturnType<typeof createClient>>
  workspaceId: string
  provider: string
  status?: 'connected' | 'needs_attention' | 'disconnected' | 'coming_soon'
  metadata?: Record<string, unknown>
}) {
  const status = params.status ?? 'connected'
  const isConnected = status === 'connected'
  const baseMetadata = params.metadata ?? {}
  const metadata = isConnected
    ? {
        connected_via: baseMetadata.connected_via ?? 'direct_api',
        api_key_verified_at: baseMetadata.api_key_verified_at ?? new Date().toISOString(),
        ...baseMetadata,
      }
    : baseMetadata

  const { error } = await params.supabase.from('integration_connections').upsert(
    {
      workspace_id: params.workspaceId,
      provider: params.provider,
      status,
      last_synced_at: null,
      metadata,
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
  trigger: 'manual_connect' | 'manual_sync' | 'direct_connect'
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

    const cleanKey = apiKey.trim()
    if (!cleanKey.startsWith('sk_') && !cleanKey.startsWith('rk_')) {
      redirect(buildSettingsRedirect({ error: 'Stripe API key format looks invalid (must start with sk_ or rk_).' }))
    }

    const { workspaceId } = await getWorkspaceIdForUser(user)

    const isValid = await validateStripeKey(cleanKey)
    if (!isValid) {
      redirect(buildSettingsRedirect({ error: 'Stripe rejected that API key.' }))
    }

    await saveEncryptedToken({ supabase, workspaceId, provider: 'stripe', value: cleanKey })
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

export async function connectPostHog(apiKey: string, projectId?: string) {
  try {
    const trimmedKey = apiKey.trim()
    const trimmedProject = projectId?.trim() || ''
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      redirect(buildSettingsRedirect({ error: 'Sign in again to connect PostHog.' }))
    }

    const { workspaceId } = await getWorkspaceIdForUser(user)

    const result = await validateAndResolvePostHog(trimmedKey, trimmedProject)
    if (!result.valid) {
      redirect(buildSettingsRedirect({ error: 'PostHog credentials were rejected. Please check your Personal API Key.' }))
    }

    const effectiveProjectId = result.resolvedProjectId || trimmedProject || 'default'
    const effectiveHost = result.resolvedHost || 'https://us.posthog.com'

    await saveEncryptedToken({ supabase, workspaceId, provider: 'posthog', value: trimmedKey })
    await upsertConnection({
      supabase,
      workspaceId,
      provider: 'posthog',
      metadata: {
        project_id: effectiveProjectId,
        api_host: effectiveHost,
        coverage: 'Ready for first PostHog sync',
      },
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
    if (typeof error === 'object' && error !== null && 'digest' in error && typeof (error as { digest: unknown }).digest === 'string' && (error as { digest: string }).digest.startsWith('NEXT_REDIRECT')) {
      throw error
    }
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
    return { success: false, error: 'Unknown integration provider.' }
  }

  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return { success: false, error: 'Sign in again to disconnect this integration.' }
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
    return { success: true, message: `${provider} disconnected.` }
  } catch (error) {
    return {
      success: false,
      error: formatSettingsError(error, 'Disconnect failed.'),
    }
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

// Deprecated Pipedream actions removed. Direct API Connections active.

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
      .select('provider, status, metadata')
      .eq('workspace_id', workspaceId)

    return (connections ?? [])
      .filter((c: { status: string; provider: string; metadata?: Record<string, unknown> | null }) => {
        const isDemo = c.metadata?.connected_via === 'demo_mock'
        return c.status === 'connected' && !isDemo && !isPlannedProvider(c.provider)
      })
      .map((c: { provider: string }) => c.provider)
  } catch {
    return []
  }
}

export async function connectDemoIntegrationSafe(provider: string) {
  const label = getIntegrationDefinition(provider)?.label ?? provider
  throw new Error(
    `${label} needs a real credential or OAuth authorization. Demo connections are disabled and cannot be used in chat.`
  )
}

// ============================================================
//  Manual connect actions for non-Google providers
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
    const cleanKey = apiKey.trim()

    // Validate the token by attempting a search
    const response = await fetch('https://api.notion.com/v1/search', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${cleanKey}`,
        'Notion-Version': '2022-06-28',
        'Content-Type': 'application/json',
      },
      signal: AbortSignal.timeout(10000),
      body: JSON.stringify({ page_size: 1 }),
    })
    if (!response.ok) {
      redirect(buildSettingsRedirect({ error: 'Notion rejected that integration token.' }))
    }

    await saveEncryptedToken({ supabase, workspaceId, provider: 'notion', value: cleanKey })
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
    const cleanKey = apiKey.trim()

    const isValid = await validateAirtableToken(cleanKey)
    if (!isValid) {
      redirect(buildSettingsRedirect({ error: 'Airtable rejected that API token.' }))
    }

    await saveEncryptedToken({ supabase, workspaceId, provider: 'airtable', value: cleanKey })
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

export async function connectGmailDirect(tokenOrKey: string) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      redirect(buildSettingsRedirect({ error: 'Sign in again to connect Gmail.' }))
    }

    const { workspaceId } = await getWorkspaceIdForUser(user)

    await saveEncryptedToken({
      supabase,
      workspaceId,
      provider: 'gmail',
      tokenType: 'api_key',
      value: tokenOrKey,
    })
    await upsertConnection({
      supabase,
      workspaceId,
      provider: 'gmail',
      metadata: { coverage: 'Gmail connected via Direct API credential' },
    })

    revalidateDashboardSurfaces()
    redirect(
      buildSettingsRedirect({
        success: 'Gmail connected via Direct API credential.',
      })
    )
  } catch (error) {
    unstable_rethrow(error)
    redirect(
      buildSettingsRedirect({
        error: formatSettingsError(error, 'Gmail connection failed.'),
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
  const { getGoogleAuthUrl, isGmailConfigured } = await import('@/integrations/gmail/gmail')

  if (!isGmailConfigured()) {
    throw new Error(
      'Google OAuth is not configured on this deployment. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET first.'
    )
  }

  const headerList = await headers()
  const host = headerList.get('x-forwarded-host') || headerList.get('host')
  const rawProto = headerList.get('x-forwarded-proto')
  const proto = rawProto || (host?.includes('localhost') || host?.includes('127.0.0.1') ? 'http' : 'https')
  const origin = host ? `${proto}://${host}` : undefined

  const googleProvider = provider === 'google_calendar' ? 'google_calendar' : 'gmail'
  const { data: refreshToken, error: refreshTokenError } = await supabase
    .from('integration_tokens')
    .select('id')
    .eq('workspace_id', workspaceId)
    .eq('provider', googleProvider)
    .eq('token_type', 'oauth_refresh')
    .maybeSingle()

  if (refreshTokenError) throw refreshTokenError

  const state = `${workspaceId}:${crypto.randomUUID()}:${googleProvider}`
  const cookieStore = await cookies()
  cookieStore.set('google_oauth_state', state, {
    httpOnly: true,
    sameSite: 'lax',
    secure: proto === 'https',
    path: '/api/integrations/gmail/callback',
    maxAge: 10 * 60,
  })

  const authUrl = getGoogleAuthUrl(
    workspaceId,
    googleProvider as 'gmail' | 'google_calendar',
    { forceConsent: !refreshToken, origin, state }
  )
  return { authUrl }
}

/**
 * Connects Intercom directly via personal/workspace access token.
 */
export async function connectIntercom(accessToken: string, regionInput: string = 'us') {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      redirect(buildSettingsRedirect({ error: 'Sign in again to connect Intercom.' }))
    }

    const { workspaceId } = await getWorkspaceIdForUser(user)
    const { normalizeIntercomRegion, validateIntercomToken } = await import(
      '@/integrations/intercom/intercom'
    )
    const region = normalizeIntercomRegion(regionInput)
    const isValid = await validateIntercomToken(accessToken, region)
    if (!isValid) {
      redirect(
        buildSettingsRedirect({
          error: 'Intercom rejected that access token. Make sure the token is active and valid for the selected region.',
        })
      )
    }

    await saveEncryptedToken({
      supabase,
      workspaceId,
      provider: 'intercom',
      value: accessToken,
    })

    await upsertConnection({
      supabase,
      workspaceId,
      provider: 'intercom',
      metadata: {
        coverage: 'Direct Intercom token connected',
        region,
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
    if (typeof error === 'object' && error !== null && 'digest' in error && typeof (error as { digest: unknown }).digest === 'string' && (error as { digest: string }).digest.startsWith('NEXT_REDIRECT')) {
      throw error
    }
    unstable_rethrow(error)
    redirect(
      buildSettingsRedirect({
        error: formatSettingsError(error, 'Could not connect Intercom token.'),
      })
    )
  }
}

/**
 * Starts the Intercom OAuth installation flow.
 */
export async function getIntercomConnectUrl(regionInput: string = 'us') {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    throw new Error('Sign in again to connect Intercom.')
  }

  const { workspaceId } = await getWorkspaceIdForUser(user)
  const {
    getIntercomOAuthUrl,
    isIntercomConfigured,
    normalizeIntercomRegion,
  } = await import('@/integrations/intercom/intercom')

  if (!isIntercomConfigured()) {
    throw new Error(
      'Intercom OAuth is not configured on this deployment. Set INTERCOM_CLIENT_ID, INTERCOM_CLIENT_SECRET, and INTERCOM_REDIRECT_URI in your .env.local, or connect directly using your Intercom Access Token below.'
    )
  }

  const headerList = await headers()
  const host = headerList.get('x-forwarded-host') || headerList.get('host')
  const rawProto = headerList.get('x-forwarded-proto')
  const proto = rawProto || (host?.includes('localhost') || host?.includes('127.0.0.1') ? 'http' : 'https')
  const region = normalizeIntercomRegion(regionInput)
  const state = `${workspaceId}:${crypto.randomUUID()}:intercom:${region}`

  const cookieStore = await cookies()
  cookieStore.set('intercom_oauth_state', state, {
    httpOnly: true,
    sameSite: 'lax',
    secure: proto === 'https',
    path: '/api/integrations/intercom/callback',
    maxAge: 10 * 60,
  })

  return { authUrl: getIntercomOAuthUrl({ state, region }) }
}

