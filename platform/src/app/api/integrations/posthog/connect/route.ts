/**
 * PostHog Connect API
 *
 * POST /api/integrations/posthog/connect
 * Accepts API key + project ID, validates, stores encrypted.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/foundation/database/server'
import { runProviderSyncWithHealth } from '@/integrations/_core/connection-state'
import { encrypt } from '@/integrations/_core/encryption'
import { validatePostHogKey } from '@/integrations/posthog/posthog'
import { ensureWorkspaceForUser } from '@/data/workspaces/ensure-workspace'
import { z } from 'zod'

const ConnectSchema = z.object({
  apiKey: z.string().min(10),
  projectId: z.string().min(1),
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
    return NextResponse.json({ error: 'Invalid input' }, { status: 400 })
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

  // Validate
  const isValid = await validatePostHogKey(parsed.data.apiKey, parsed.data.projectId)
  if (!isValid) {
    return NextResponse.json({ error: 'Invalid PostHog credentials' }, { status: 400 })
  }

  // Encrypt and store
  const encrypted = encrypt(parsed.data.apiKey)

  const { error: tokenError } = await supabase
    .from('integration_tokens')
    .upsert(
      {
        workspace_id: workspaceId,
        provider: 'posthog',
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

  const { error: connectionError } = await supabase
    .from('integration_connections')
    .upsert(
      {
        workspace_id: workspaceId,
        provider: 'posthog',
        status: 'connected',
        last_synced_at: null,
        metadata: { project_id: parsed.data.projectId, coverage: 'Ready for first PostHog sync' },
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
      provider: 'posthog',
      trigger: 'api_connect',
    })

    const typedResult = result as {
      trackedUsers: number
      syncedAccounts: number
    }

    return NextResponse.json({
      success: true,
      provider: 'posthog',
      trackedUsers: typedResult.trackedUsers,
      syncedAccounts: typedResult.syncedAccounts,
    })
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'PostHog sync failed after connect',
      },
      { status: 500 }
    )
  }
}
