/**
 * Stripe Connect API
 *
 * POST /api/integrations/stripe/connect
 * Accepts API key, validates, stores encrypted, updates integration status.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { runProviderSyncWithHealth } from '@/lib/integrations/connection-state'
import { encrypt } from '@/lib/integrations/encryption'
import { validateStripeKey } from '@/lib/integrations/stripe'
import { ensureWorkspaceForUser } from '@/lib/workspaces/ensure-workspace'
import { z } from 'zod'

const ConnectSchema = z.object({
  apiKey: z.string().min(10).startsWith('sk_'),
})

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = ConnectSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid API key format' }, { status: 400 })
  }

  let workspaceId: string
  try {
    const workspace = await ensureWorkspaceForUser(user)
    workspaceId = workspace.id
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Workspace bootstrap failed' },
      { status: 500 }
    )
  }

  // Validate the key with Stripe
  const isValid = await validateStripeKey(parsed.data.apiKey)
  if (!isValid) {
    return NextResponse.json({ error: 'Invalid Stripe API key' }, { status: 400 })
  }

  // Encrypt and store
  const encrypted = encrypt(parsed.data.apiKey)

  const { error: tokenError } = await supabase
    .from('integration_tokens')
    .upsert(
      {
        workspace_id: workspaceId,
        provider: 'stripe',
        token_type: 'api_key',
        encrypted_value: encrypted.encrypted,
        iv: encrypted.iv,
        auth_tag: encrypted.authTag,
      },
      { onConflict: 'workspace_id,provider,token_type' }
    )
  if (tokenError) {
    return NextResponse.json({ error: tokenError.message }, { status: 500 })
  }

  // Update integration connection status
  const { error: connectionError } = await supabase
    .from('integration_connections')
    .upsert(
      {
        workspace_id: workspaceId,
        provider: 'stripe',
        status: 'connected',
        last_synced_at: null,
        metadata: { coverage: 'Ready for first Stripe sync' },
      },
      { onConflict: 'workspace_id,provider' }
    )
  if (connectionError) {
    return NextResponse.json({ error: connectionError.message }, { status: 500 })
  }

  try {
    const { result } = await runProviderSyncWithHealth({
      supabase,
      workspaceId,
      provider: 'stripe',
      trigger: 'api_connect',
    })

    const typedResult = result as {
      syncedAccounts: number
      updatedContacts: number
    }

    return NextResponse.json({
      success: true,
      provider: 'stripe',
      syncedAccounts: typedResult.syncedAccounts,
      updatedContacts: typedResult.updatedContacts,
    })
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Stripe sync failed after connect',
      },
      { status: 500 }
    )
  }
}
