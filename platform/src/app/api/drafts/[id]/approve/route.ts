/**
 * Approve Draft
 *
 * PATCH /api/drafts/[id]/approve
 * Moves a draft from needs_review → ready_to_send.
 *
 * Security: Verifies the authenticated user is a member of the
 * workspace that owns the draft (prevents IDOR).
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/foundation/database/server'
import { approveRecoveryDraft, RecoveryDraftApprovalError } from '@/recovery/draft-approval'

export async function PATCH(
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
    const result = await approveRecoveryDraft({
      supabase,
      draftId: id,
      userId: user.id,
      expectedContentHash: typeof body.expectedContentHash === 'string' ? body.expectedContentHash : null,
      requireExpectedContentHash: true,
      source: 'dashboard',
    })

    return NextResponse.json({ success: true, ...result }, { status: 202 })
  } catch (error) {
    const status = error instanceof RecoveryDraftApprovalError ? error.status : 500
    const message = error instanceof Error ? error.message : 'Failed to approve draft'

    return NextResponse.json({ error: message }, { status })
  }
}
