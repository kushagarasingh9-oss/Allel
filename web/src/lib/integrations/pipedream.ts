/**
 * Pipedream Connect — Server-Side Client
 *
 * Handles creating short-lived connect tokens for the frontend SDK
 * and retrieving OAuth credentials after users connect their accounts.
 */

import { PipedreamClient, type PipedreamClientOpts } from '@pipedream/sdk'

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

function getPipedreamConfig(): PipedreamClientOpts {
  const clientId = process.env.PIPEDREAM_CLIENT_ID
  const clientSecret = process.env.PIPEDREAM_CLIENT_SECRET
  const projectId = process.env.PIPEDREAM_PROJECT_ID
  const projectEnvironment = (process.env.PIPEDREAM_ENVIRONMENT ?? 'development') as
    | 'development'
    | 'production'

  if (!clientId || !clientSecret || !projectId) {
    throw new Error(
      'Missing Pipedream env vars. Set PIPEDREAM_CLIENT_ID, PIPEDREAM_CLIENT_SECRET, and PIPEDREAM_PROJECT_ID.'
    )
  }

  return { clientId, clientSecret, projectId, projectEnvironment }
}

let _client: PipedreamClient | null = null

function getClient() {
  if (!_client) {
    _client = new PipedreamClient(getPipedreamConfig())
  }
  return _client
}

// ---------------------------------------------------------------------------
// Pipedream app slug mapping
// ---------------------------------------------------------------------------

/** Maps our internal provider names to Pipedream app slugs */
export const PROVIDER_TO_APP_SLUG: Record<string, string> = {
  stripe: 'stripe',
  posthog: 'posthog',
  gmail: 'gmail',
  intercom: 'intercom',
  hubspot: 'hubspot',
  slack: 'slack',
  sentry: 'sentry',
  linear: 'linear_app',
  airtable: 'airtable',
  notion: 'notion',
  google_calendar: 'google_calendar',
  google_docs: 'google_docs',
  google_drive: 'google_drive',
  github: 'github',
  supabase: 'supabase',
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Create a short-lived Connect token for the frontend.
 * The frontend uses this token to authenticate with Pipedream's SDK.
 */
export async function createConnectToken(externalUserId: string) {
  const client = getClient()
  const result = await client.tokens.create({
    externalUserId,
  })
  // Return the full response — the frontend SDK's tokenCallback expects
  // { token, expiresAt, connectLinkUrl }
  return result
}

/**
 * Retrieve the OAuth/API credentials for a user's connected account.
 * After a user connects via the Pipedream popup, we call this to
 * get their access token so we can store it in our own DB.
 */
export async function getAccountCredentials(accountId: string) {
  const client = getClient()

  // Get account details including credentials
  // The SDK returns { data: Account, rawResponse: Response }
  const response = await client.accounts.retrieve(accountId, {
    includeCredentials: true,
  })

  // Unwrap — the SDK wraps the response in { data, rawResponse }
  const account = 'data' in response ? (response as unknown as { data: Record<string, unknown> }).data : response as unknown as Record<string, unknown>

  console.log(
    `[pipedream] Account ${accountId} retrieved. Keys: ${Object.keys(account ?? {}).join(', ')}. ` +
    `Credentials keys: ${Object.keys((account?.credentials as Record<string, unknown>) ?? {}).join(', ') || '(empty)'}`
  )

  const credentials = account?.credentials as Record<string, unknown> | undefined

  if (!credentials || Object.keys(credentials).length === 0) {
    throw new Error(
      `No credentials found for account ${accountId}. ` +
      `This usually means the integration is using Pipedream's default OAuth client instead of a custom one. ` +
      `Create a custom OAuth app in Pipedream for this integration and set NEXT_PUBLIC_PIPEDREAM_OAUTH_APP_<PROVIDER> in .env.local.`
    )
  }

  // Return the most useful token we can find
  // OAuth providers → oauthAccessToken or oauth_access_token
  // API key providers → look for common key field names
  const token =
    (credentials.oauthAccessToken as string | undefined) ??
    (credentials['oauth_access_token'] as string | undefined) ??
    (credentials['access_token'] as string | undefined) ??
    (credentials['api_key'] as string | undefined) ??
    (credentials['token'] as string | undefined) ??
    (credentials['authToken'] as string | undefined) ??
    (credentials['auth_token'] as string | undefined) ??
    (credentials['key'] as string | undefined)

  if (!token || typeof token !== 'string') {
    // Log all credential keys so we can debug which field name the provider uses
    console.error(
      `[pipedream] Could not extract token from account ${accountId}. ` +
      `Available credential keys: ${Object.keys(credentials).join(', ')}`
    )
    throw new Error(`Could not extract a usable token from Pipedream account ${accountId}. Available keys: ${Object.keys(credentials).join(', ')}`)
  }

  return {
    token,
    refreshToken: (credentials.oauthRefreshToken as string | undefined) ?? (credentials['oauth_refresh_token'] as string | undefined) ?? undefined,
    rawCredentials: credentials,
  }
}

/**
 * List all connected accounts for a user in Pipedream.
 */
export async function listUserAccounts(externalUserId: string, appSlug?: string) {
  const client = getClient()
  const result = await client.accounts.list({
    externalUserId,
    ...(appSlug ? { app: appSlug } : {}),
    includeCredentials: false,
  })
  return result
}
