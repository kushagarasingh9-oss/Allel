/**
 * Manual Brief Refresh + Email Delivery
 *
 * POST /api/brief/refresh
 * Regenerates the daily brief and optionally sends it via email.
 * Used for testing and manual triggers from the dashboard.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { generateWorkspaceBrief } from '@/lib/briefs/generate-workspace-brief'
import { deliverBriefEmail } from '@/lib/briefs/deliver-brief-email'
import { checkRateLimit, rateLimitResponse } from '@/lib/security/rate-limiter'

export async function POST(request: NextRequest) {
  const supabase = createServiceClient()

  // Authenticate via Supabase session cookie
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

  // Rate limit: 5 requests per minute per user
  const rateLimit = checkRateLimit(`brief-refresh:${user.id}`, {
    maxRequests: 5,
    windowMs: 60_000,
  })
  if (!rateLimit.allowed) {
    return rateLimitResponse(rateLimit.retryAfterMs)
  }

  // Find the user's workspace
  const { data: workspace, error: wsError } = await supabase
    .from('workspaces')
    .select('id')
    .eq('owner_user_id', user.id)
    .single()

  if (wsError || !workspace) {
    return NextResponse.json({ error: 'Workspace not found' }, { status: 404 })
  }

  try {
    // Parse request body for options
    let sendEmail = false
    try {
      const body = await request.json()
      sendEmail = body?.sendEmail === true
    } catch {
      // No body or invalid JSON — default to no email
    }

    // 1. Generate the brief
    const briefResult = await generateWorkspaceBrief(workspace.id)

    // 2. Optionally send via email
    let emailResult = null
    if (sendEmail) {
      emailResult = await deliverBriefEmail({
        workspaceId: workspace.id,
        briefId: briefResult.briefId,
        headline: briefResult.headline,
        summary: briefResult.summary,
        itemCount: briefResult.itemCount,
      })
    }

    return NextResponse.json({
      success: true,
      brief: {
        briefId: briefResult.briefId,
        headline: briefResult.headline,
        summary: briefResult.summary,
        itemCount: briefResult.itemCount,
      },
      email: emailResult ?? { skipped: true, reason: 'sendEmail not requested' },
    })
  } catch (error) {
    console.error('[brief/refresh] Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal error' },
      { status: 500 }
    )
  }
}
