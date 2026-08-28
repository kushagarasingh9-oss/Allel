/**
 * Tool Approvals API
 *
 * GET  /api/agent/approvals               — List approval requests (pending by default)
 * POST /api/agent/approvals               — Approve or reject a request
 * POST /api/agent/approvals?action=execute — Execute an approved request
 *
 * All endpoints require authentication and workspace membership.
 */

import { createClient } from '@/foundation/database/server'
import { ensureWorkspaceForUser } from '@/data/workspaces/ensure-workspace'
import { validateUUID } from '@/foundation/security/validate'
import { checkRateLimit, rateLimitResponse } from '@/foundation/security/rate-limiter'
import {
  listApprovalRequests,
  listPendingApprovals,
  getApprovalRequest,
  approveRequest,
  rejectRequest,
  executeApprovedRequest,
  getApprovalStats,
  type ApprovalStatus,
} from '@/agent/memory/approval-store'

// ── Auth helper ──────────────────────────────────────────────────────

async function resolveRequestContext() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { response: new Response('Unauthorized', { status: 401 }) }
  }

  const workspace = await ensureWorkspaceForUser(user)

  return {
    user,
    workspace,
    workspaceId: workspace.id,
  }
}

// ── GET ──────────────────────────────────────────────────────────────

export async function GET(request: Request) {
  const context = await resolveRequestContext()
  if ('response' in context) return context.response

  const { user, workspaceId } = context

  // Rate limit: 30 reads/min
  const rateLimit = checkRateLimit(`approvals-read:${user.id}`, {
    maxRequests: 30,
    windowMs: 60_000,
  })
  if (!rateLimit.allowed) return rateLimitResponse(rateLimit.retryAfterMs)

  const { searchParams } = new URL(request.url)
  const status = searchParams.get('status') as ApprovalStatus | null
  const requestId = searchParams.get('id')
  const sessionId = searchParams.get('sessionId')
  const includeStats = searchParams.get('stats') === 'true'
  const limit = Math.min(
    parseInt(searchParams.get('limit') ?? '50', 10) || 50,
    100
  )

  // Single request by ID
  if (requestId) {
    if (!validateUUID(requestId)) {
      return Response.json({ error: 'Invalid request ID' }, { status: 400 })
    }

    const approvalRequest = await getApprovalRequest(requestId, workspaceId)

    if (!approvalRequest) {
      return Response.json(
        { error: 'Approval request not found' },
        { status: 404 }
      )
    }

    return Response.json({ request: approvalRequest })
  }

  // List pending (default) or by status
  const requests =
    status === 'pending' || !status
      ? await listPendingApprovals(workspaceId, { sessionId: sessionId ?? undefined, limit })
      : await listApprovalRequests(workspaceId, { status, limit })

  const result: {
    requests: typeof requests
    stats?: Awaited<ReturnType<typeof getApprovalStats>>
  } = { requests }

  if (includeStats) {
    result.stats = await getApprovalStats(workspaceId)
  }

  return Response.json(result)
}

// ── POST ─────────────────────────────────────────────────────────────

export async function POST(request: Request) {
  const context = await resolveRequestContext()
  if ('response' in context) return context.response

  const { user, workspaceId } = context

  // Rate limit: 10 writes/min
  const rateLimit = checkRateLimit(`approvals-write:${user.id}`, {
    maxRequests: 10,
    windowMs: 60_000,
  })
  if (!rateLimit.allowed) return rateLimitResponse(rateLimit.retryAfterMs)

  const body = await request.json().catch(() => ({}))
  const { searchParams } = new URL(request.url)
  const action = searchParams.get('action') ?? body.action

  if (!body.requestId || typeof body.requestId !== 'string') {
    return Response.json(
      { error: 'Missing required field: requestId' },
      { status: 400 }
    )
  }

  if (!validateUUID(body.requestId)) {
    return Response.json(
      { error: 'Invalid requestId format' },
      { status: 400 }
    )
  }

  const decidedBy = user.email ?? user.id

  try {
    switch (action) {
      case 'approve': {
        const approved = await approveRequest({
          requestId: body.requestId,
          workspaceId,
          decidedBy,
        })

        // If autoExecute is true, immediately execute after approval
        if (body.autoExecute) {
          const execResult = await executeApprovedRequest(
            body.requestId,
            workspaceId
          )
          return Response.json({
            request: { ...approved, status: execResult.success ? 'executed' : 'failed' },
            execution: execResult,
          })
        }

        return Response.json({ request: approved })
      }

      case 'reject': {
        const rejected = await rejectRequest({
          requestId: body.requestId,
          workspaceId,
          decidedBy,
          reason: typeof body.reason === 'string' ? body.reason : undefined,
        })

        return Response.json({ request: rejected })
      }

      case 'execute': {
        const execResult = await executeApprovedRequest(
          body.requestId,
          workspaceId
        )

        return Response.json({ execution: execResult })
      }

      default:
        return Response.json(
          {
            error:
              'Invalid action. Use "approve", "reject", or "execute".',
          },
          { status: 400 }
        )
    }
  } catch (err) {
    const message =
      err instanceof Error ? err.message : 'Unknown error'
    const status = message.includes('not found')
      ? 404
      : message.includes('Cannot')
        ? 400
        : 500

    return Response.json({ error: message }, { status })
  }
}
