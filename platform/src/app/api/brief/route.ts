import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/foundation/database/server'
import { ensureWorkspaceForUser } from '@/data/workspaces/ensure-workspace'
import { generateWorkspaceBrief } from '@/intelligence/briefs/generate-workspace-brief'

export async function GET() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const workspace = await ensureWorkspaceForUser(user)

  // 1. Fetch latest brief
  let { data: brief } = await supabase
    .from('founder_briefs')
    .select('*')
    .eq('workspace_id', workspace.id)
    .order('brief_date', { ascending: false })
    .limit(1)
    .maybeSingle()

  // 2. If no brief exists yet, generate one
  if (!brief) {
    try {
      await generateWorkspaceBrief(workspace.id)
      const res = await supabase
        .from('founder_briefs')
        .select('*')
        .eq('workspace_id', workspace.id)
        .order('brief_date', { ascending: false })
        .limit(1)
        .maybeSingle()
      brief = res.data
    } catch (e) {
      console.error('[api/brief] Failed to generate initial brief:', e)
    }
  }

  // 3. Fetch brief items
  let items: any[] = []
  if (brief) {
    const { data: briefItems } = await supabase
      .from('founder_brief_items')
      .select('*, customer_accounts(name, mrr_cents, risk_level)')
      .eq('founder_brief_id', brief.id)
      .order('sort_order', { ascending: true })
    items = briefItems || []
  }

  // 4. Fetch connected integrations
  const { data: integrations } = await supabase
    .from('integration_connections')
    .select('provider, status, last_synced_at')
    .eq('workspace_id', workspace.id)
    .eq('status', 'connected')

  return NextResponse.json({
    brief,
    items,
    integrations: integrations || [],
  })
}

export async function POST() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const workspace = await ensureWorkspaceForUser(user)

  try {
    const result = await generateWorkspaceBrief(workspace.id)
    const { data: brief } = await supabase
      .from('founder_briefs')
      .select('*')
      .eq('id', result.briefId)
      .maybeSingle()

    const { data: items } = await supabase
      .from('founder_brief_items')
      .select('*, customer_accounts(name, mrr_cents, risk_level)')
      .eq('founder_brief_id', result.briefId)
      .order('sort_order', { ascending: true })

    return NextResponse.json({
      success: true,
      brief,
      items: items || [],
    })
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Brief generation failed' },
      { status: 500 }
    )
  }
}
