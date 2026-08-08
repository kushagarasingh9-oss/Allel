/**
 * Revenue Saved API
 *
 * GET /api/metrics/revenue-saved
 * Returns the total revenue saved by Allel's follow-up emails.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { calculateRevenueSaved } from '@/lib/drafts/outcome-tracker'

export async function GET(request: NextRequest) {
  const supabase = createServiceClient()

  const authHeader = request.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Missing auth token' }, { status: 401 })
  }

  const token = authHeader.replace('Bearer ', '')
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser(token)

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: workspace, error: wsError } = await supabase
    .from('workspaces')
    .select('id')
    .eq('owner_user_id', user.id)
    .single()

  if (wsError || !workspace) {
    return NextResponse.json({ error: 'Workspace not found' }, { status: 404 })
  }

  try {
    const summary = await calculateRevenueSaved(workspace.id)

    return NextResponse.json({
      revenueSavedCents: summary.totalSavedCents,
      revenueSavedFormatted: new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        maximumFractionDigits: 0,
      }).format(summary.totalSavedCents / 100),
      totalDraftsSent: summary.totalDraftsSent,
      recovered: summary.recoveredCount,
      responded: summary.respondedCount,
      churned: summary.churnedCount,
      pending: summary.pendingCount,
    })
  } catch (error) {
    console.error('[metrics/revenue-saved] Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal error' },
      { status: 500 }
    )
  }
}
