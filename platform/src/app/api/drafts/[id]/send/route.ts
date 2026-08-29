/**
 * Send Draft via Gmail
 *
 * POST /api/drafts/[id]/send
 * Sends an approved draft via Gmail API, updates status.
 *
 * Security: Verifies the authenticated user is a member of the
 * workspace that owns the draft (prevents IDOR).
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/foundation/database/server'
import { approveRecoveryDraft, RecoveryDraftApprovalError } from '@/recovery/draft-approval'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await request.json().catch(() => ({}))
    // Sending is performed only by the durable worker. This endpoint supports
    // an idempotent re-queue of a previously approved, exact-content draft.
    const result = await approveRecoveryDraft({
      supabase,
      draftId: id,
      userId: user.id,
      expectedContentHash: typeof body.expectedContentHash === 'string' ? body.expectedContentHash : null,
      requireExpectedContentHash: true,
      source: 'dashboard_requeue',
    })

    return NextResponse.json({ success: true, ...result }, { status: 202 })
  } catch (error) {
    console.error('[api/drafts/send] Draft requeue failed:', error)
    const status = error instanceof RecoveryDraftApprovalError ? error.status : 500
    const message = error instanceof Error ? error.message : 'Failed to queue email.'

    return NextResponse.json({ error: message }, { status })
  }
}
