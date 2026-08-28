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
import {
  DraftWorkflowError,
  getDraftWorkflowHttpStatus,
  sendDraftForActor,
} from '@/drafts/draft-workflows'

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
    const result = await sendDraftForActor({
      supabase,
      draftId: id,
      access: { kind: 'user', userId: user.id },
      actor: 'founder',
      source: 'dashboard',
    })

    return NextResponse.json({
      success: true,
      status: result.status,
      messageId: result.messageId,
    })
  } catch (error) {
    console.error('[api/drafts/send] Email send failed:', error)
    const status = getDraftWorkflowHttpStatus(error)
    const message =
      error instanceof DraftWorkflowError
        ? error.message
        : 'Failed to send email. Please try again.'

    return NextResponse.json({ error: message }, { status })
  }
}
