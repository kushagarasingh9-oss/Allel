/**
 * Tool Approval Store
 *
 * Manages the lifecycle of tool-call approval requests:
 *   1. Agent wants to call a manual-approval tool → createApprovalRequest()
 *   2. Founder reviews pending requests → listPendingApprovals()
 *   3. Founder approves/rejects → approveRequest() / rejectRequest()
 *   4. Approved request is executed → executeApprovedRequest()
 *
 * This module is backend-only. It uses the service client to bypass RLS
 * for agent-initiated inserts, and accepts a user-scoped client for
 * founder-initiated reads/updates.
 */

import { createServiceClient } from '@/lib/supabase/service'
import { ALL_TOOLS, type AgentToolName } from './agent'
import { sanitizeJsonRecord, type JsonValue } from '@/lib/json-metadata'

// ── Types ────────────────────────────────────────────────────────────

export type ApprovalStatus =
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'executed'
  | 'expired'
  | 'failed'

export type ApprovalRequestRecord = {
  id: string
  workspace_id: string
  tool_name: string
  tool_input: Record<string, unknown>
  tool_description: string | null
  persona_id: string
  session_id: string | null
  run_id: string | null
  action_summary: string
  account_name: string | null
  customer_account_id: string | null
  status: ApprovalStatus
  decided_at: string | null
  decided_by: string | null
  rejection_reason: string | null
  execution_result: Record<string, unknown> | null
  execution_error: string | null
  executed_at: string | null
  created_at: string
  expires_at: string
  metadata: Record<string, unknown>
}

export type CreateApprovalInput = {
  workspaceId: string
  toolName: AgentToolName
  toolInput: Record<string, unknown>
  actionSummary: string
  personaId?: string
  sessionId?: string | null
  runId?: string | null
  accountName?: string | null
  customerAccountId?: string | null
  metadata?: Record<string, unknown>
}

export type ApprovalDecision = {
  requestId: string
  workspaceId: string
  decidedBy: string
}

// ── Human-readable tool summaries ────────────────────────────────────

const TOOL_ACTION_SUMMARIES: Partial<Record<AgentToolName, string>> = {
  sendGmailReply: 'Send a Gmail reply',
  composeNewEmail: 'Compose and send a new email',
  sendSlackMessage: 'Send a Slack message',
  editSlackMessage: 'Edit a Slack message',
  deleteSlackMsg: 'Delete a Slack message',
  scheduleSlackMsg: 'Schedule a Slack message',
  replyInSlackThread: 'Reply in a Slack thread',
  reactToSlackMessage: 'React to a Slack message',
  pinSlackMsg: 'Pin a Slack message',
  addSlackBookmarkTool: 'Add a Slack bookmark',
  createPostHogAnnotation: 'Create a PostHog annotation',
  togglePostHogFeatureFlag: 'Toggle a PostHog feature flag',
  replyToIntercomConvo: 'Reply to an Intercom conversation',
  closeIntercomConvo: 'Close an Intercom conversation',
  snoozeIntercomConvo: 'Snooze an Intercom conversation',
  assignIntercomConvo: 'Assign an Intercom conversation',
  createIntercomNote: 'Create an Intercom note',
  tagIntercomConvo: 'Tag an Intercom conversation',
  cancelStripeSubscriptionTool: 'Cancel a Stripe subscription',
  refundStripeCharge: 'Refund a Stripe charge',
  applyStripeCoupon: 'Apply a Stripe coupon',
  createCalendarEventTool: 'Create a Google Calendar event',
  updateCalendarEventTool: 'Update a Google Calendar event',
  deleteCalendarEventTool: 'Delete a Google Calendar event',
  createNotionPageTool: 'Create a Notion page',
  updateNotionPageTool: 'Update a Notion page',
  appendNotionContentTool: 'Append content to a Notion page',
  addNotionCommentTool: 'Add a comment to a Notion page',
  createHubSpotContactTool: 'Create a HubSpot contact',
  updateHubSpotContactTool: 'Update a HubSpot contact',
  createHubSpotDealTool: 'Create a HubSpot deal',
  updateHubSpotDealTool: 'Update a HubSpot deal',
  createHubSpotNoteTool: 'Create a HubSpot note',
  createLinearIssueTool: 'Create a Linear issue',
  updateLinearIssueTool: 'Update a Linear issue',
  addLinearCommentTool: 'Add a Linear comment',
  resolveSentryIssueTool: 'Resolve a Sentry issue',
  assignSentryIssueTool: 'Assign a Sentry issue',
  createAirtableRecordTool: 'Create an Airtable record',
  updateAirtableRecordTool: 'Update an Airtable record',
  deleteAirtableRecordTool: 'Delete an Airtable record',
  createRescueDiscountTool: 'Create a rescue discount coupon',
}

function buildActionSummary(
  toolName: AgentToolName,
  toolInput: Record<string, unknown>
): string {
  const base = TOOL_ACTION_SUMMARIES[toolName] ?? `Execute ${toolName}`

  // Append key context from the input if available
  const contextParts: string[] = []
  if (typeof toolInput.to === 'string') contextParts.push(`to: ${toolInput.to}`)
  if (typeof toolInput.subject === 'string') contextParts.push(`"${toolInput.subject}"`)
  if (typeof toolInput.channelId === 'string') contextParts.push(`channel: ${toolInput.channelId}`)
  if (typeof toolInput.title === 'string') contextParts.push(`"${toolInput.title}"`)
  if (typeof toolInput.name === 'string') contextParts.push(`name: ${toolInput.name}`)

  if (contextParts.length > 0) {
    return `${base} — ${contextParts.join(', ')}`
  }

  return base
}

// ── Create ───────────────────────────────────────────────────────────

/**
 * Create a new approval request. Called by the agent runtime when it
 * encounters a tool that requires manual approval.
 *
 * Returns the created record so the agent can reference the approval ID
 * in its response to the founder.
 */
export async function createApprovalRequest(
  input: CreateApprovalInput
): Promise<ApprovalRequestRecord> {
  const supabase = createServiceClient()

  const actionSummary =
    input.actionSummary ||
    buildActionSummary(input.toolName, input.toolInput)

  const sanitizedInput = sanitizeJsonRecord(input.toolInput)
  const sanitizedMetadata = sanitizeJsonRecord(input.metadata ?? {})

  const { data, error } = await supabase
    .from('tool_approval_requests')
    .insert({
      workspace_id: input.workspaceId,
      tool_name: input.toolName,
      tool_input: sanitizedInput,
      tool_description:
        TOOL_ACTION_SUMMARIES[input.toolName] ?? null,
      persona_id: input.personaId ?? 'alex',
      session_id: input.sessionId ?? null,
      run_id: input.runId ?? null,
      action_summary: actionSummary,
      account_name: input.accountName ?? null,
      customer_account_id: input.customerAccountId ?? null,
      status: 'pending',
      metadata: sanitizedMetadata,
    })
    .select()
    .single()

  if (error || !data) {
    console.warn(
      '[approval-store] Could not insert into tool_approval_requests (table may be missing). Returning fallback approval record.',
      error?.message
    )
    const fallbackId = `fallback-approval-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
    const nowIso = new Date().toISOString()
    const expiresIso = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()

    return {
      id: fallbackId,
      workspace_id: input.workspaceId,
      tool_name: input.toolName,
      tool_input: sanitizedInput,
      tool_description: TOOL_ACTION_SUMMARIES[input.toolName] ?? null,
      persona_id: input.personaId ?? 'alex',
      session_id: input.sessionId ?? null,
      run_id: input.runId ?? null,
      action_summary: actionSummary,
      account_name: input.accountName ?? null,
      customer_account_id: input.customerAccountId ?? null,
      status: 'pending',
      decided_at: null,
      decided_by: null,
      rejection_reason: null,
      execution_result: null,
      execution_error: null,
      executed_at: null,
      created_at: nowIso,
      expires_at: expiresIso,
      metadata: sanitizedMetadata,
    } as ApprovalRequestRecord
  }

  return data as ApprovalRequestRecord
}

// ── Read ─────────────────────────────────────────────────────────────

/**
 * List pending approval requests for a workspace.
 * Auto-expires requests that have passed their expiry time.
 */
export async function listPendingApprovals(
  workspaceId: string,
  options?: { sessionId?: string; limit?: number }
): Promise<ApprovalRequestRecord[]> {
  const supabase = createServiceClient()

  // Expire stale requests first
  await supabase
    .from('tool_approval_requests')
    .update({ status: 'expired' })
    .eq('workspace_id', workspaceId)
    .eq('status', 'pending')
    .lt('expires_at', new Date().toISOString())

  let query = supabase
    .from('tool_approval_requests')
    .select('*')
    .eq('workspace_id', workspaceId)
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
    .limit(options?.limit ?? 50)

  if (options?.sessionId) {
    query = query.eq('session_id', options.sessionId)
  }

  const { data, error } = await query

  if (error) {
    console.error('[approval-store] Failed to list pending approvals', error)
    return []
  }

  return (data ?? []) as ApprovalRequestRecord[]
}

/**
 * List all approval requests for a workspace (any status).
 */
export async function listApprovalRequests(
  workspaceId: string,
  options?: {
    status?: ApprovalStatus
    limit?: number
    offset?: number
  }
): Promise<ApprovalRequestRecord[]> {
  const supabase = createServiceClient()

  let query = supabase
    .from('tool_approval_requests')
    .select('*')
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: false })
    .limit(options?.limit ?? 50)

  if (options?.status) {
    query = query.eq('status', options.status)
  }

  if (options?.offset) {
    query = query.range(
      options.offset,
      options.offset + (options.limit ?? 50) - 1
    )
  }

  const { data, error } = await query

  if (error) {
    console.error('[approval-store] Failed to list approval requests', error)
    return []
  }

  return (data ?? []) as ApprovalRequestRecord[]
}

/**
 * Get a single approval request by ID.
 */
export async function getApprovalRequest(
  requestId: string,
  workspaceId: string
): Promise<ApprovalRequestRecord | null> {
  const supabase = createServiceClient()

  const { data, error } = await supabase
    .from('tool_approval_requests')
    .select('*')
    .eq('id', requestId)
    .eq('workspace_id', workspaceId)
    .maybeSingle()

  if (error) {
    console.error('[approval-store] Failed to get approval request', error)
    return null
  }

  return data as ApprovalRequestRecord | null
}

// ── Approve ──────────────────────────────────────────────────────────

/**
 * Approve a pending request. Does NOT execute the tool — call
 * executeApprovedRequest() separately.
 */
export async function approveRequest(
  input: ApprovalDecision
): Promise<ApprovalRequestRecord> {
  const supabase = createServiceClient()

  const { data: existing, error: fetchError } = await supabase
    .from('tool_approval_requests')
    .select('*')
    .eq('id', input.requestId)
    .eq('workspace_id', input.workspaceId)
    .maybeSingle()

  if (fetchError || !existing) {
    throw new Error('Approval request not found')
  }

  if (existing.status !== 'pending') {
    throw new Error(
      `Cannot approve request with status "${existing.status}"`
    )
  }

  // Check expiry
  if (new Date(existing.expires_at) < new Date()) {
    await supabase
      .from('tool_approval_requests')
      .update({ status: 'expired' })
      .eq('id', input.requestId)
    throw new Error('Approval request has expired')
  }

  const { data, error } = await supabase
    .from('tool_approval_requests')
    .update({
      status: 'approved',
      decided_at: new Date().toISOString(),
      decided_by: input.decidedBy,
    })
    .eq('id', input.requestId)
    .select()
    .single()

  if (error || !data) {
    throw new Error(
      `Failed to approve request: ${error?.message ?? 'unknown'}`
    )
  }

  return data as ApprovalRequestRecord
}

// ── Reject ───────────────────────────────────────────────────────────

/**
 * Reject a pending request.
 */
export async function rejectRequest(
  input: ApprovalDecision & { reason?: string }
): Promise<ApprovalRequestRecord> {
  const supabase = createServiceClient()

  const { data: existing, error: fetchError } = await supabase
    .from('tool_approval_requests')
    .select('*')
    .eq('id', input.requestId)
    .eq('workspace_id', input.workspaceId)
    .maybeSingle()

  if (fetchError || !existing) {
    throw new Error('Approval request not found')
  }

  if (existing.status !== 'pending') {
    throw new Error(
      `Cannot reject request with status "${existing.status}"`
    )
  }

  const { data, error } = await supabase
    .from('tool_approval_requests')
    .update({
      status: 'rejected',
      decided_at: new Date().toISOString(),
      decided_by: input.decidedBy,
      rejection_reason: input.reason ?? null,
    })
    .eq('id', input.requestId)
    .select()
    .single()

  if (error || !data) {
    throw new Error(
      `Failed to reject request: ${error?.message ?? 'unknown'}`
    )
  }

  return data as ApprovalRequestRecord
}

// ── Execute ──────────────────────────────────────────────────────────

/**
 * Execute an approved tool request. Runs the actual tool with the
 * stored input and persists the result.
 *
 * Only works on requests with status='approved'.
 */
export async function executeApprovedRequest(
  requestId: string,
  workspaceId: string
): Promise<{
  success: boolean
  result?: Record<string, unknown>
  error?: string
}> {
  const supabase = createServiceClient()

  const { data: request, error: fetchError } = await supabase
    .from('tool_approval_requests')
    .select('*')
    .eq('id', requestId)
    .eq('workspace_id', workspaceId)
    .maybeSingle()

  if (fetchError || !request) {
    throw new Error('Approval request not found')
  }

  if (request.status !== 'approved') {
    throw new Error(
      `Cannot execute request with status "${request.status}" — must be "approved"`
    )
  }

  const toolName = request.tool_name as AgentToolName
  const toolDef = ALL_TOOLS[toolName]

  if (!toolDef) {
    await supabase
      .from('tool_approval_requests')
      .update({
        status: 'failed',
        execution_error: `Tool "${toolName}" not found in registry`,
        executed_at: new Date().toISOString(),
      })
      .eq('id', requestId)

    return {
      success: false,
      error: `Tool "${toolName}" not found`,
    }
  }

  try {
    // Execute the tool with the stored input
    const executeFn = (toolDef as { execute?: (input: Record<string, unknown>) => Promise<unknown> }).execute
    if (!executeFn) {
      throw new Error(`Tool "${toolName}" has no execute function`)
    }

    const result = await executeFn(request.tool_input as Record<string, unknown>)
    const sanitizedResult = sanitizeJsonRecord(
      result as Record<string, JsonValue>
    )

    await supabase
      .from('tool_approval_requests')
      .update({
        status: 'executed',
        execution_result: sanitizedResult,
        executed_at: new Date().toISOString(),
      })
      .eq('id', requestId)

    return {
      success: true,
      result: sanitizedResult,
    }
  } catch (execError) {
    const errorMessage =
      execError instanceof Error
        ? execError.message
        : 'Unknown execution error'

    await supabase
      .from('tool_approval_requests')
      .update({
        status: 'failed',
        execution_error: errorMessage,
        executed_at: new Date().toISOString(),
      })
      .eq('id', requestId)

    return {
      success: false,
      error: errorMessage,
    }
  }
}

// ── Stats ────────────────────────────────────────────────────────────

/**
 * Get counts of approval requests by status for a workspace.
 */
export async function getApprovalStats(workspaceId: string): Promise<{
  pending: number
  approved: number
  rejected: number
  executed: number
  expired: number
  failed: number
}> {
  const supabase = createServiceClient()

  const { data, error } = await supabase
    .from('tool_approval_requests')
    .select('status')
    .eq('workspace_id', workspaceId)

  if (error || !data) {
    return {
      pending: 0,
      approved: 0,
      rejected: 0,
      executed: 0,
      expired: 0,
      failed: 0,
    }
  }

  const counts = {
    pending: 0,
    approved: 0,
    rejected: 0,
    executed: 0,
    expired: 0,
    failed: 0,
  }

  for (const row of data) {
    const status = row.status as ApprovalStatus
    if (status in counts) {
      counts[status]++
    }
  }

  return counts
}
