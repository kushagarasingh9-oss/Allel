import type { SupabaseClient } from '@supabase/supabase-js'
import {
  findMostRecentThreadForEmail,
  isGmailConfigured,
  isGmailReadSyncEnabled,
  sendEmail,
} from '@/integrations/gmail/gmail'
import { refreshAccountMemory } from '@/agent/memory/account-memory'
import { logAgentRun } from '@/agent/runtime/run-logger'
import { recordDraftSent } from '@/drafts/outcome-tracker'
import { validateSendRecipient } from '@/drafts/recipient-validator'

type DraftRecord = {
  id: string
  workspace_id: string
  customer_account_id: string | null
  recovery_case_id?: string | null
  subject: string
  body_preview?: string | null
  body_full?: string | null
  recipient_email?: string | null
  status: string
  approved_at?: string | null
  approved_by_actor?: string | null
  approval_metadata?: Record<string, unknown> | null
}

export type SentDraftContext = {
  actor?: 'founder' | 'agent' | 'api'
  metadata?: Record<string, unknown>
}

export async function sendDraftWithGmail(
  supabase: SupabaseClient,
  draftId: string,
  context?: SentDraftContext
): Promise<{ messageId: string; threadId: string; recipient: string }> {
  const { data: draft, error: fetchError } = await supabase
    .from('follow_up_drafts')
    .select(
      'id, workspace_id, customer_account_id, recovery_case_id, subject, body_preview, status, approved_at, approved_by_actor, approval_metadata'
    )
    .eq('id', draftId)
    .maybeSingle()

  if (fetchError || !draft) {
    throw new Error('Draft not found')
  }

  const typedDraft = draft as DraftRecord

  if (typedDraft.status !== 'ready_to_send') {
    throw new Error('Draft must be approved before sending')
  }

  if (!typedDraft.approved_at || !typedDraft.approved_by_actor) {
    throw new Error('Draft must be approved by a human founder before sending')
  }

  if (!typedDraft.customer_account_id) {
    throw new Error('Draft is not linked to a customer account')
  }

  const meta = (typedDraft.approval_metadata && typeof typedDraft.approval_metadata === 'object')
    ? (typedDraft.approval_metadata as Record<string, unknown>)
    : {}

  let recipientEmail = typeof meta.recipient_email === 'string' ? meta.recipient_email.trim() : null

  if (!recipientEmail && typedDraft.customer_account_id) {
    const { data: contact } = await supabase
      .from('account_contacts')
      .select('email')
      .eq('workspace_id', typedDraft.workspace_id)
      .eq('customer_account_id', typedDraft.customer_account_id)
      .order('is_primary', { ascending: false })
      .limit(1)
      .maybeSingle()

    recipientEmail = contact?.email?.trim() ?? null
  }

  if (!recipientEmail) {
    throw new Error('Draft has no approved recipient email')
  }

  const bodyFull = typedDraft.body_preview || (typeof meta.body === 'string' ? meta.body : '')
  if (!bodyFull) {
    throw new Error('Draft has no content to send')
  }

  // Pre-send recipient validation (TOCTOU prevention)
  const recipientValidation = await validateSendRecipient(supabase, {
    workspaceId: typedDraft.workspace_id,
    customerAccountId: typedDraft.customer_account_id,
    recipientEmail,
    requirePrimary: true,
  })

  if (!recipientValidation.valid) {
    throw new Error(`Pre-send recipient validation failed: ${recipientValidation.reason}`)
  }

  if (!isGmailConfigured()) {
    throw new Error(
      'Gmail send is not configured yet. Add Google OAuth env vars and connect Gmail before sending drafts.'
    )
  }

  let replyToThreadId: string | undefined
  if (isGmailReadSyncEnabled()) {
    try {
      const recentThread = await findMostRecentThreadForEmail(
        typedDraft.workspace_id,
        recipientEmail
      )
      replyToThreadId = recentThread?.threadId
    } catch (error) {
      console.warn('[send-draft] Failed to resolve recent Gmail thread', error)
    }
  }

  const result = await sendEmail(typedDraft.workspace_id, {
    to: recipientEmail,
    subject: typedDraft.subject,
    body: bodyFull,
    replyToThreadId,
  })

  if (!result.messageId || !result.threadId) {
    throw new Error('Gmail did not return both message and thread IDs — delivery is unconfirmed')
  }

  const { error: statusError } = await supabase
    .from('follow_up_drafts')
    .update({
      status: 'sent',
      updated_at: new Date().toISOString(),
      approval_metadata: {
        ...meta,
        sent_at: new Date().toISOString(),
        provider_message_id: result.messageId,
        provider_thread_id: result.threadId,
      },
    })
    .eq('id', draftId)

  if (statusError) {
    throw new Error(`Email was sent, but draft status could not be updated: ${statusError.message}`)
  }

  if (typedDraft.customer_account_id) {
    const { error: touchError } = await supabase
      .from('customer_accounts')
      .update({ last_touch_at: new Date().toISOString() })
      .eq('id', typedDraft.customer_account_id)

    if (touchError) {
      console.error('[send-draft] Failed to update last touch', touchError)
    }

    const { error: timelineError } = await supabase.from('account_timeline').insert({
      workspace_id: typedDraft.workspace_id,
      customer_account_id: typedDraft.customer_account_id,
      event_type: 'email_sent',
      headline: `Follow-up sent: ${typedDraft.subject}`,
      detail: `Sent to ${recipientEmail}`,
      source: 'gmail',
      metadata: { message_id: result.messageId, thread_id: result.threadId },
    })

    if (timelineError) {
      console.error('[send-draft] Failed to append email timeline event', timelineError)
    }

    // Record outcome for tracking
    try {
      await recordDraftSent({
        workspaceId: typedDraft.workspace_id,
        draftId: typedDraft.id,
        customerAccountId: typedDraft.customer_account_id,
      })
    } catch (error) {
      console.error('[send-draft] Failed to record draft outcome', error)
    }

    // Advance linked recovery case to 'monitoring'
    try {
      let caseId = typedDraft.recovery_case_id
      if (!caseId && typedDraft.customer_account_id) {
        const { data: matchedCase } = await supabase
          .from('recovery_cases')
          .select('id')
          .eq('workspace_id', typedDraft.workspace_id)
          .eq('customer_account_id', typedDraft.customer_account_id)
          .in('status', ['awaiting_approval', 'approved', 'draft_ready', 'open', 'action_proposed'])
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()
        caseId = matchedCase?.id
      }

      if (caseId) {
        const now = new Date().toISOString()
        await supabase
          .from('recovery_cases')
          .update({
            status: 'monitoring',
            sent_at: now,
            monitoring_started_at: now,
            updated_at: now,
          })
          .eq('id', caseId)

        await supabase.from('recovery_case_events').insert({
          workspace_id: typedDraft.workspace_id,
          recovery_case_id: caseId,
          event_type: 'outreach_dispatched',
          from_status: 'awaiting_approval',
          to_status: 'monitoring',
          actor_type: 'user',
          actor_id: context?.actor || 'founder',
          detail: { action: 'draft_sent_via_gmail', draftId: typedDraft.id, messageId: result.messageId },
          created_at: now,
        })
      }
    } catch (caseSyncErr) {
      console.error('[send-draft] Failed to advance recovery case to monitoring', caseSyncErr)
    }
  }

  await logAgentRun({
    workspaceId: typedDraft.workspace_id,
    customerAccountId: typedDraft.customer_account_id,
    runType: 'draft_sent',
    status: 'completed',
    outputSummary: `Email sent to ${recipientEmail}: "${typedDraft.subject}"`,
    metadata: {
      draftId: typedDraft.id,
      actor: context?.actor ?? 'founder',
      messageId: result.messageId,
      threadId: result.threadId,
      ...(context?.metadata ?? {}),
    },
  })

  try {
    await refreshAccountMemory(typedDraft.workspace_id, typedDraft.customer_account_id)
  } catch (error) {
    console.error('[send-draft] Failed to refresh account memory', error)
  }

  return {
    messageId: result.messageId,
    threadId: result.threadId,
    recipient: recipientEmail,
  }
}
