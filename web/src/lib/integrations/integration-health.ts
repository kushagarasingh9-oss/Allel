/**
 * Connection health writes, and the rule for what counts as an auth failure.
 *
 * This is deliberately a leaf module: it imports only Supabase types and the
 * JSON metadata sanitizer. Credential acquisition (`provider-tokens.ts`) and the
 * individual integration modules need to mark health, and `connection-state.ts`
 * imports every `*-sync` module — which in turn import the integration modules.
 * Keeping these writes here is what stops that from becoming an import cycle.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { sanitizeJsonRecord } from '@/lib/json-metadata'

type AnySupabaseClient = SupabaseClient

type IntegrationConnectionRow = {
  metadata: Record<string, unknown> | null
  last_synced_at: string | null
}

/** Markers that mean "this credential is not acceptable to the provider". */
const AUTH_FAILURE_MARKERS = [
  '401',
  '403',
  'unauthenticated',
  'unauthorized',
  'invalid_grant',
  'invalid_token',
  'invalid credentials',
  'invalid_api_key',
  'token expired',
  'token has been expired',
  'expired or revoked',
  'insufficient permission',
  'permission denied',
  'forbidden',
] as const

/**
 * Markers that outrank an auth marker. A provider can answer 403 for a quota
 * breach (Google does), and a rate limit is not a broken connection — marking it
 * `needs_attention` would tell the founder to reconnect a perfectly good
 * integration.
 */
const NON_AUTH_OVERRIDE_MARKERS = [
  'ratelimit',
  'rate limit',
  'rate_limit',
  'quota',
  'too many requests',
  '429',
] as const

export function normalizeConnectionMetadata(
  value: Record<string, unknown> | null | undefined
) {
  return sanitizeJsonRecord(value ?? {})
}

export async function getExistingConnectionState(
  supabase: AnySupabaseClient,
  workspaceId: string,
  provider: string
) {
  const { data, error } = await supabase
    .from('integration_connections')
    .select('metadata, last_synced_at')
    .eq('workspace_id', workspaceId)
    .eq('provider', provider)
    .maybeSingle<IntegrationConnectionRow>()

  if (error) throw error

  return data
}

/**
 * True only for failures that mean the stored credential cannot be used.
 *
 * A 404, a validation error, or a rate limit must return false: those are not
 * connection problems, and recording them as such would flip a healthy provider
 * to `needs_attention` and block every later call behind the connection guard.
 *
 * Pure — safe to unit test.
 */
export function isProviderAuthFailure(error: unknown): boolean {
  const message = (
    error instanceof Error ? error.message : String(error ?? '')
  ).toLowerCase()

  if (!message) return false
  if (NON_AUTH_OVERRIDE_MARKERS.some((marker) => message.includes(marker))) {
    return false
  }

  return AUTH_FAILURE_MARKERS.some((marker) => message.includes(marker))
}

export async function markIntegrationAuthFailed(input: {
  supabase: AnySupabaseClient
  workspaceId: string
  provider: string
  errorMessage: string
}) {
  const existing = await getExistingConnectionState(
    input.supabase,
    input.workspaceId,
    input.provider
  )
  const metadata = normalizeConnectionMetadata(existing?.metadata)
  const erroredAt = new Date().toISOString()

  metadata.last_error = input.errorMessage
  metadata.last_error_at = erroredAt
  metadata.last_auth_status = 'failed'

  const { error } = await input.supabase.from('integration_connections').upsert(
    {
      workspace_id: input.workspaceId,
      provider: input.provider,
      status: 'needs_attention',
      last_synced_at: existing?.last_synced_at ?? null,
      metadata,
    },
    { onConflict: 'workspace_id,provider' }
  )

  if (error) {
    console.error(
      `[integration-health] Failed to mark auth failure for ${input.provider}`,
      error
    )
  }
}

export async function markIntegrationAuthSucceeded(input: {
  supabase: AnySupabaseClient
  workspaceId: string
  provider: string
}) {
  const existing = await getExistingConnectionState(
    input.supabase,
    input.workspaceId,
    input.provider
  )
  const metadata = normalizeConnectionMetadata(existing?.metadata)

  delete metadata.last_error
  delete metadata.last_error_at
  metadata.last_auth_status = 'succeeded'

  const { error } = await input.supabase.from('integration_connections').upsert(
    {
      workspace_id: input.workspaceId,
      provider: input.provider,
      status: 'connected',
      last_synced_at: existing?.last_synced_at ?? null,
      metadata,
    },
    { onConflict: 'workspace_id,provider' }
  )

  if (error) {
    console.error(
      `[integration-health] Failed to mark auth success for ${input.provider}`,
      error
    )
  }
}
