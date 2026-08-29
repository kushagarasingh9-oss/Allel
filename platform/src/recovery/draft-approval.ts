/**
 * Founder approval for recovery drafts.
 *
 * Approval is deliberately separate from legacy, generic draft actions: it
 * binds a human decision to the exact reviewed content and queues the worker
 * instead of sending from a request handler.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { enqueueWorkflowJob } from '@/jobs/queue'
import { RECOVERY_CONFIG } from '@/recovery/config'
import { computeContentHash } from '@/jobs/handlers/generate-case-draft'

export class RecoveryDraftApprovalError extends Error {
  constructor(
    public readonly status: number,
    message: string
  ) {
    super(message)
    this.name = 'RecoveryDraftApprovalError'
  }
}

export async function approveRecoveryDraft(input: {
  supabase: SupabaseClient
  draftId: string
  userId: string
  /** Required for HTTP callers; server actions may first load the current hash. */
  expectedContentHash?: string | null
  requireExpectedContentHash?: boolean
  source: string
}) {
  const { supabase, draftId, userId } = input
  const { data: draft, error: draftError } = await supabase
    .from('follow_up_drafts')
    .select('*')
    .eq('id', draftId)
    .maybeSingle()

  if (draftError) throw new RecoveryDraftApprovalError(500, 'Failed to load draft')
  if (!draft) throw new RecoveryDraftApprovalError(404, 'Draft not found')
  if (!draft.recovery_case_id || !draft.content_hash || !draft.body_full || !draft.recipient_email) {
    throw new RecoveryDraftApprovalError(400, 'Draft is not a complete recovery draft')
  }

  const { data: membership, error: membershipError } = await supabase
    .from('workspace_members')
    .select('workspace_id, role')
    .eq('workspace_id', draft.workspace_id)
    .eq('user_id', userId)
    .maybeSingle()
  if (membershipError) throw new RecoveryDraftApprovalError(500, 'Failed to verify draft access')
  if (!membership) throw new RecoveryDraftApprovalError(403, 'Forbidden')
  if (!['owner', 'admin'].includes(membership.role)) {
    throw new RecoveryDraftApprovalError(403, 'Only a workspace owner or admin may approve a recovery send')
  }

  const recomputedHash = computeContentHash({
    workspaceId: draft.workspace_id,
    caseId: draft.recovery_case_id,
    recipientEmail: draft.recipient_email,
    subject: draft.subject,
    bodyText: draft.body_full,
    actionVersion: draft.action_version || 1,
    offerId: null,
  })
  if (recomputedHash !== draft.content_hash) {
    throw new RecoveryDraftApprovalError(409, 'Draft content changed and must be regenerated and verified')
  }
  if (input.requireExpectedContentHash && !input.expectedContentHash) {
    throw new RecoveryDraftApprovalError(400, 'expectedContentHash is required')
  }
  if (input.expectedContentHash && input.expectedContentHash !== recomputedHash) {
    throw new RecoveryDraftApprovalError(409, 'Draft changed since it was reviewed; reload before approving')
  }

  const { data: recoveryCase, error: caseError } = await supabase
    .from('recovery_cases')
    .select('id, status, severity, workspace_id')
    .eq('id', draft.recovery_case_id)
    .eq('workspace_id', draft.workspace_id)
    .maybeSingle()
  if (caseError) throw new RecoveryDraftApprovalError(500, 'Failed to load recovery case')
  if (!recoveryCase) throw new RecoveryDraftApprovalError(404, 'Recovery case not found')

  const alreadyApproved = draft.status === 'ready_to_send' && recoveryCase.status === 'approved'
  if (!alreadyApproved && (draft.status !== 'needs_review' || recoveryCase.status !== 'awaiting_approval')) {
    throw new RecoveryDraftApprovalError(
      409,
      `Draft/case cannot be approved from ${draft.status}/${recoveryCase.status}`
    )
  }

  const approvalExpiresAt = new Date(
    Date.now() +
      (recoveryCase.severity === 'critical'
        ? RECOVERY_CONFIG.CRITICAL_APPROVAL_TTL_HOURS
        : RECOVERY_CONFIG.APPROVAL_TTL_HOURS) * 60 * 60 * 1000
  ).toISOString()

  if (alreadyApproved && draft.approval_expires_at && new Date(draft.approval_expires_at) < new Date()) {
    throw new RecoveryDraftApprovalError(409, 'Approval has expired; regenerate and re-verify the draft')
  }

  const idempotencyKey = `ws:${draft.workspace_id}:draft:${draft.id}:send:${recomputedHash}`

  if (!alreadyApproved) {
    // The migration-backed RPC locks the draft and case, writes the approval
    // audit event, and creates the unique send job in one transaction.
    const { data: approval, error: approvalError } = await supabase.rpc('approve_recovery_draft', {
      p_workspace_id: draft.workspace_id,
      p_draft_id: draft.id,
      p_actor_id: userId,
      p_content_hash: recomputedHash,
      p_approval_expires_at: approvalExpiresAt,
      p_job_idempotency_key: idempotencyKey,
      p_job_payload: {
        workspaceId: draft.workspace_id,
        recoveryCaseId: recoveryCase.id,
        draftId: draft.id,
        approvedContentHash: recomputedHash,
        source: input.source,
      },
    })
    if (approvalError) {
      console.error('[recovery-approval] approval RPC failed:', approvalError.message)
      throw new RecoveryDraftApprovalError(409, 'Approval could not be committed')
    }
    const row = Array.isArray(approval) ? approval[0] : approval
    if (!row?.workflow_job_id) {
      throw new RecoveryDraftApprovalError(500, 'Approval was committed without a send job')
    }
    return {
      draftId: draft.id,
      recoveryCaseId: recoveryCase.id,
      contentHash: recomputedHash,
      approvalExpiresAt,
      jobId: row.workflow_job_id,
      alreadyApproved: false,
      duplicate: row.duplicate === true,
    }
  }

  const { job, duplicate } = await enqueueWorkflowJob(supabase, {
    workspaceId: draft.workspace_id,
    recoveryCaseId: recoveryCase.id,
    jobType: 'send_approved_draft',
    idempotencyKey,
    payload: { workspaceId: draft.workspace_id, recoveryCaseId: recoveryCase.id, draftId: draft.id, approvedContentHash: recomputedHash },
    priority: 20,
  })

  return {
    draftId: draft.id,
    recoveryCaseId: recoveryCase.id,
    contentHash: recomputedHash,
    approvalExpiresAt: alreadyApproved ? draft.approval_expires_at : approvalExpiresAt,
    jobId: job?.id ?? null,
    alreadyApproved,
    duplicate,
  }
}
