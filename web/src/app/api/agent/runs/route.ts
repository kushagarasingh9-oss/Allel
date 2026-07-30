import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { ensureWorkspaceForUser } from '@/lib/workspaces/ensure-workspace'
import { listWorkspaceRunInspections } from '@/lib/agent/run-inspection'

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const workspace = await ensureWorkspaceForUser(user)
  const limit = Number.parseInt(request.nextUrl.searchParams.get('limit') ?? '40', 10)
  const cursor = request.nextUrl.searchParams.get('cursor')

  try {
    const { workflows, nextCursor } = await listWorkspaceRunInspections({
      supabase,
      workspaceId: workspace.id,
      limit: Number.isFinite(limit) ? limit : 40,
      cursor,
    })

    return NextResponse.json({
      workflows,
      nextCursor,
      workspaceId: workspace.id,
    })
  } catch (error) {
    console.error('[api/agent/runs] Failed to load run history', error)
    return NextResponse.json(
      { error: 'Failed to load run history' },
      { status: 500 }
    )
  }
}
