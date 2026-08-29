import type { SupabaseClient } from '@supabase/supabase-js'
import {
  logAgentRun,
  type AgentRunLogRecord,
} from '@/agent/runtime/run-logger'
import { refreshAccountMemory } from '@/agent/memory/account-memory'
import {
  sendDraftWithGmail,
  type SentDraftContext,
} from './send-draft'

type DraftWorkflowSupabase = Pick<SupabaseClient, 'from'>

type DraftAccessScope =
  | { kind: 'user'; userId: string }
  | { kind: 'workspace'; workspaceId: string }

export type DraftWorkflowActor = 'founder' | 'agent' | 'api'

export type DraftWorkflowErrorCode =
  | 'not_found'
  | 'forbidden'
  | 'invalid_state'
  | 'validation'
  | 'database_error'

export class DraftWorkflowError extends Error {
  code: DraftWorkflowErrorCode

  constructor(code: DraftWorkflowErrorCode, message: string) {
    super(message)
    this.name = 'DraftWorkflowError'
    this.code = code
  }
}

export type DraftRecord = {
  id: string
  workspace_id: string
  customer_account_id: string | null
  recovery_case_id?: string | null
  subject: string
  body_preview: string
  status: string
  approved_at?: string | null
  approved_by_actor?: string | null
}

type DraftWorkflowDeps = {
  logRun?: (record: AgentRunLogRecord) => Promise<void>
  refreshMemory?: (
    workspaceId: string,
    accountId: string
  ) => Promise<unknown>
  sendDraft?: (
    supabase: SupabaseClient,
    draftId: string,
    context?: SentDraftContext
  ) => Promise<{ messageId: string; threadId: string; recipient: string }>
}

type ApproveDraftInput = {
  supabase: DraftWorkflowSupabase
  draftId: string
  access: DraftAccessScope
  actor: DraftWorkflowActor
  source?: string
  deps?: DraftWorkflowDeps
}

type RejectDraftInput = ApproveDraftInput & {
  reason?: string
  mode?: 'reject' | 'delete'
}

type EditDraftInput = ApproveDraftInput & {
  updates: { subject?: string; body?: string }
}

type SendDraftInput = ApproveDraftInput

export function getDraftWorkflowHttpStatus(error: unknown) {
  if (!(error instanceof DraftWorkflowError)) {
    return 500
  }

  switch (error.code) {
    case 'not_found':
      return 404
    case 'forbidden':
      return 403
    case 'invalid_state':
    case 'validation':
      return 400
    default:
      return 500
  }
}

function fail(code: DraftWorkflowErrorCode, message: string): never {
  throw new DraftWorkflowError(code, message)
}

function buildRunMetadata(input: {
  draftId: string
  actor: DraftWorkflowActor
  source?: string
  extra?: Record<string, unknown>
}) {
  return {
    draftId: input.draftId,
    actor: input.actor,
    ...(input.source ? { source: input.source } : {}),
    ...(input.extra ?? {}),
  }
}

async function recordDraftRun(
  record: AgentRunLogRecord,
  deps?: DraftWorkflowDeps
) {
  try {
    await (deps?.logRun ?? logAgentRun)(record)
  } catch (error) {
    console.error('[draft-workflows] Failed to log draft run', error)
  }
}

async function refreshDraftMemory(
  workspaceId: string,
  accountId: string | null,
  deps?: DraftWorkflowDeps
) {
  if (!accountId) return

  try {
    await (deps?.refreshMemory ?? refreshAccountMemory)(workspaceId, accountId)
  } catch (error) {
    console.error('[draft-workflows] Failed to refresh account memory', error)
  }
}

async function appendTimelineEvent(input: {
  supabase: DraftWorkflowSupabase
  workspaceId: string
  customerAccountId: string | null
  eventType: string
  headline: string
  detail?: string | null
  source: string
  metadata?: Record<string, unknown>
}) {
  if (!input.customerAccountId) return

  const { error } = await input.supabase.from('account_timeline').insert({
    workspace_id: input.workspaceId,
    customer_account_id: input.customerAccountId,
    event_type: input.eventType,
    headline: input.headline,
    detail: input.detail ?? null,
    source: input.source,
    metadata: input.metadata ?? null,
  })

  if (error) {
    console.error('[draft-workflows] Failed to append timeline event', error)
  }
}

async function loadDraftForAccess(
  supabase: DraftWorkflowSupabase,
  draftId: string,
  access: DraftAccessScope
) {
  const { data: draft, error: draftError } = await supabase
    .from('follow_up_drafts')
    .select(
      'id, workspace_id, customer_account_id, recovery_case_id, subject, body_preview, status, approved_at, approved_by_actor'
    )
    .eq('id', draftId)
    .maybeSingle()

  if (draftError) {
    fail('database_error', 'Failed to fetch draft')
  }

  if (!draft) {
    fail('not_found', 'Draft not found')
  }

  if (access.kind === 'workspace') {
    if (draft.workspace_id !== access.workspaceId) {
      fail('not_found', 'Draft not found')
    }

    return draft as DraftRecord
  }

  const { data: membership, error: membershipError } = await supabase
    .from('workspace_members')
    .select('workspace_id')
    .eq('user_id', access.userId)
    .eq('workspace_id', draft.workspace_id)
    .maybeSingle()

  if (membershipError) {
    fail('database_error', 'Failed to verify draft access')
  }

  if (!membership) {
    fail('forbidden', 'Forbidden')
  }

  return draft as DraftRecord
}

function normalizeSendError(error: unknown): DraftWorkflowError {
  const message =
    error instanceof Error && error.message.trim().length > 0
      ? error.message
      : 'Failed to send draft'

  if (message === 'Draft not found') {
    return new DraftWorkflowError('not_found', message)
  }

  if (
    message.includes('Only a human founder can') ||
    message.includes('approved before sending') ||
    message.includes('No primary contact email') ||
    message.includes('not linked to a customer account') ||
    message.includes('not configured')
  ) {
    return new DraftWorkflowError(
      message.includes('Only a human founder can') ? 'forbidden' : 'validation',
      message
    )
  }

  return new DraftWorkflowError('database_error', message)
}

function hasFounderApproval(draft: DraftRecord) {
  return Boolean(draft.approved_at && draft.approved_by_actor)
}

export async function approveDraftForActor(input: ApproveDraftInput) {
  const draft = await loadDraftForAccess(input.supabase, input.draftId, input.access)

  if (input.actor === 'agent') {
    fail(
      'forbidden',
      'Only a human founder can approve a draft for sending.'
    )
  }

  if (draft.status === 'sent') {
    fail('invalid_state', 'Draft already sent')
  }

  if (draft.status === 'ready_to_send' && hasFounderApproval(draft)) {
    return {
      draftId: draft.id,
      status: 'ready_to_send' as const,
      skipped: true,
      workspaceId: draft.workspace_id,
      customerAccountId: draft.customer_account_id,
      subject: draft.subject,
    }
  }

  const approvedAt = new Date().toISOString()
  const { error } = await input.supabase
    .from('follow_up_drafts')
    .update({
      status: 'ready_to_send',
      approved_at: approvedAt,
      approved_by_actor: input.actor,
      approval_metadata: buildRunMetadata({
        draftId: draft.id,
        actor: input.actor,
        source: input.source,
      }),
    })
    .eq('id', input.draftId)

  if (error) {
    fail('database_error', 'Failed to approve draft')
  }

  await recordDraftRun(
    {
      workspaceId: draft.workspace_id,
      customerAccountId: draft.customer_account_id,
      runType: 'draft_approved',
      status: 'completed',
      outputSummary: `Draft ${draft.id} approved`,
      metadata: buildRunMetadata({
        draftId: draft.id,
        actor: input.actor,
        source: input.source,
      }),
    },
    input.deps
  )

  await appendTimelineEvent({
    supabase: input.supabase,
    workspaceId: draft.workspace_id,
    customerAccountId: draft.customer_account_id,
    eventType: 'draft_approved',
    headline: 'Draft approved by founder',
    detail: 'Founder approved draft for sending',
    source: input.actor === 'founder' ? 'dashboard' : 'api',
  })

  await refreshDraftMemory(
    draft.workspace_id,
    draft.customer_account_id,
    input.deps
  )

  return {
    draftId: draft.id,
    status: 'ready_to_send' as const,
    skipped: false,
    workspaceId: draft.workspace_id,
    customerAccountId: draft.customer_account_id,
    subject: draft.subject,
  }
}

export async function rejectDraftForActor(input: RejectDraftInput) {
  const draft = await loadDraftForAccess(input.supabase, input.draftId, input.access)

  if (draft.status === 'sent') {
    fail('invalid_state', 'Cannot reject a sent draft')
  }

  if (input.mode === 'delete') {
    const { error } = await input.supabase
      .from('follow_up_drafts')
      .delete()
      .eq('id', input.draftId)

    if (error) {
      fail('database_error', 'Failed to reject draft')
    }
  } else {
    const { error } = await input.supabase
      .from('follow_up_drafts')
      .update({ status: 'rejected' })
      .eq('id', input.draftId)

    if (error) {
      fail('database_error', 'Failed to reject draft')
    }
  }

  await recordDraftRun(
    {
      workspaceId: draft.workspace_id,
      customerAccountId: draft.customer_account_id,
      runType: 'draft_rejected',
      status: 'completed',
      outputSummary:
        input.mode === 'delete'
          ? `Draft ${draft.id} rejected and deleted`
          : `Draft ${draft.id} rejected`,
      metadata: buildRunMetadata({
        draftId: draft.id,
        actor: input.actor,
        source: input.source,
        extra: {
          reason: input.reason ?? null,
          mode: input.mode ?? 'reject',
        },
      }),
    },
    input.deps
  )

  await appendTimelineEvent({
    supabase: input.supabase,
    workspaceId: draft.workspace_id,
    customerAccountId: draft.customer_account_id,
    eventType: 'draft_rejected',
    headline: `Draft rejected: ${draft.subject}`,
    detail: input.reason ?? 'Founder rejected draft',
    source: input.actor === 'agent' ? 'agent' : 'dashboard',
  })

  await refreshDraftMemory(
    draft.workspace_id,
    draft.customer_account_id,
    input.deps
  )

  return {
    draftId: draft.id,
    status: input.mode === 'delete' ? 'deleted' : 'rejected',
    workspaceId: draft.workspace_id,
    customerAccountId: draft.customer_account_id,
    subject: draft.subject,
  }
}

export async function editDraftForActor(input: EditDraftInput) {
  const draft = await loadDraftForAccess(input.supabase, input.draftId, input.access)
  const updateData: Record<string, string> = {}

  // Recovery drafts carry an exact verified body/hash/case state. The legacy
  // preview-only editor cannot preserve those invariants, so it must not edit
  // one in place. A fresh, verified action version is required instead.
  if (draft.recovery_case_id) {
    fail('invalid_state', 'Recovery drafts cannot be edited in the legacy editor; regenerate and re-verify the draft.')
  }

  if (draft.status === 'sent') {
    fail('invalid_state', 'Cannot edit a sent draft')
  }

  if (draft.status === 'rejected') {
    fail('invalid_state', 'Cannot edit a rejected draft')
  }

  if (input.updates.subject) {
    updateData.subject = input.updates.subject
  }

  if (input.updates.body) {
    updateData.body_preview = input.updates.body
  }

  if (Object.keys(updateData).length === 0) {
    return {
      draftId: draft.id,
      skipped: true,
      workspaceId: draft.workspace_id,
      customerAccountId: draft.customer_account_id,
    }
  }

  const { error } = await input.supabase
    .from('follow_up_drafts')
    .update(updateData)
    .eq('id', input.draftId)

  if (error) {
    fail('database_error', 'Failed to edit draft')
  }

  await refreshDraftMemory(
    draft.workspace_id,
    draft.customer_account_id,
    input.deps
  )

  return {
    draftId: draft.id,
    skipped: false,
    workspaceId: draft.workspace_id,
    customerAccountId: draft.customer_account_id,
  }
}

export async function sendDraftForActor(input: SendDraftInput) {
  const draft = await loadDraftForAccess(input.supabase, input.draftId, input.access)

  if (input.actor === 'agent') {
    fail(
      'forbidden',
      'Only a human founder can send an approved draft.'
    )
  }

  if (draft.status !== 'ready_to_send') {
    fail(
      'invalid_state',
      `Draft status is "${draft.status}" - must be "ready_to_send".`
    )
  }

  if (!hasFounderApproval(draft)) {
    fail(
      'validation',
      'Draft must be approved by a human founder before sending.'
    )
  }

  try {
    const result = await (input.deps?.sendDraft ?? sendDraftWithGmail)(
      input.supabase as SupabaseClient,
      input.draftId,
      {
        actor: input.actor,
        metadata: buildRunMetadata({
          draftId: draft.id,
          actor: input.actor,
          source: input.source,
        }),
      }
    )

    return {
      draftId: draft.id,
      status: 'sent' as const,
      workspaceId: draft.workspace_id,
      customerAccountId: draft.customer_account_id,
      subject: draft.subject,
      ...result,
    }
  } catch (error) {
    throw normalizeSendError(error)
  }
}
