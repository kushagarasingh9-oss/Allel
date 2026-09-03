import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/foundation/database/server'
import { createServiceClient } from '@/foundation/database/service'
import { ensureWorkspaceForUser } from '@/data/workspaces/ensure-workspace'
import { requireWorkspaceRole } from '@/recovery/api-auth'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ caseId: string }> }
) {
  const { caseId } = await params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const workspace = await ensureWorkspaceForUser(user)

  try {
    await requireWorkspaceRole(supabase, { workspaceId: workspace.id, userId: user.id })
    const body = await request.json().catch(() => ({}))
    const { subject, body_preview, recipient_email } = body

    if (!subject || !body_preview) {
      return NextResponse.json({ error: 'Subject and body are required' }, { status: 400 })
    }

    const service = createServiceClient()

    // 1. Verify case exists
    const { data: recoveryCase, error: caseErr } = await service
      .from('recovery_cases')
      .select('id, customer_account_id')
      .eq('id', caseId)
      .eq('workspace_id', workspace.id)
      .single()

    if (caseErr || !recoveryCase) {
      return NextResponse.json({ error: 'Recovery case not found' }, { status: 404 })
    }

    // 2. Check for existing draft
    const { data: existingDraft } = await service
      .from('follow_up_drafts')
      .select('id, approval_metadata')
      .eq('recovery_case_id', caseId)
      .eq('workspace_id', workspace.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    const now = new Date().toISOString()

    if (existingDraft) {
      const existingMeta = (existingDraft.approval_metadata as Record<string, unknown>) || {}
      const updatedMeta = {
        ...existingMeta,
        ...(recipient_email ? { recipient_email } : {}),
      }

      const { data: updated, error: updateErr } = await service
        .from('follow_up_drafts')
        .update({
          subject: subject.trim(),
          body_preview: body_preview.trim(),
          approval_metadata: updatedMeta,
          updated_at: now,
        })
        .eq('id', existingDraft.id)
        .select()
        .single()

      if (updateErr) {
        return NextResponse.json({ error: updateErr.message }, { status: 500 })
      }

      return NextResponse.json({ success: true, draft: updated })
    }

    // 3. Insert new draft
    const { data: created, error: insertErr } = await service
      .from('follow_up_drafts')
      .insert({
        workspace_id: workspace.id,
        recovery_case_id: caseId,
        customer_account_id: recoveryCase.customer_account_id,
        draft_type: 'founder_recovery',
        subject: subject.trim(),
        body_preview: body_preview.trim(),
        status: 'needs_review',
        approval_metadata: recipient_email ? { recipient_email } : {},
        created_at: now,
        updated_at: now,
      })
      .select()
      .single()

    if (insertErr) {
      return NextResponse.json({ error: insertErr.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, draft: created })
  } catch (error) {
    console.error('[api/recovery/cases/[caseId]/draft] Error saving draft:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to save draft' },
      { status: 500 }
    )
  }
}
