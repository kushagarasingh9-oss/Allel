import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/foundation/database/server'
import { getWorkflowRunInspection } from '@/agent/runtime/run-inspection'
import { ensureWorkspaceForUser } from '@/data/workspaces/ensure-workspace'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ workflowId: string }> }
) {
  const { workflowId } = await params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const workspace = await ensureWorkspaceForUser(user)

  try {
    const workflow = await getWorkflowRunInspection({
      supabase,
      workspaceId: workspace.id,
      workflowId,
    })

    if (!workflow) {
      return NextResponse.json({ error: 'Workflow not found' }, { status: 404 })
    }

    return NextResponse.json({
      workflow,
      workspaceId: workspace.id,
    })
  } catch (error) {
    console.error('[api/agent/runs/:workflowId] Failed to load workflow', error)
    return NextResponse.json(
      { error: 'Failed to load workflow' },
      { status: 500 }
    )
  }
}
