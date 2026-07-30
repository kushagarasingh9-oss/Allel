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
import { createClient } from '@/lib/supabase/server'
import {
  approveDraftForActor,
  DraftWorkflowError,
  getDraftWorkflowHttpStatus,
} from '@/lib/drafts/draft-workflows'

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
    const result = await approveDraftForActor({
      supabase,
      draftId: id,
      access: { kind: 'user', userId: user.id },
      actor: 'founder',
      source: 'dashboard',
    })

    return NextResponse.json({
      success: true,
      status: result.status,
      skipped: result.skipped,
    })
  } catch (error) {
    const status = getDraftWorkflowHttpStatus(error)
    const message =
      error instanceof DraftWorkflowError
        ? error.message
        : 'Failed to approve draft'

    return NextResponse.json({ error: message }, { status })
  }
}
