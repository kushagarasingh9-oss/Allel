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

type DraftRecord = {
  id: string
  workspace_id: string
  customer_account_id: string | null
  subject: string
  body_preview: string
  status: string
  approved_at?: string | null
  approved_by_actor?: string | null
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
      'id, workspace_id, customer_account_id, subject, body_preview, status, approved_at, approved_by_actor'
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

  const { data: contact, error: contactError } = await supabase
    .from('account_contacts')
    .select('email')
    .eq('customer_account_id', typedDraft.customer_account_id)
    .eq('is_primary', true)
    .maybeSingle()

  if (contactError) {
    throw new Error(contactError.message)
  }

  if (!contact?.email) {
    throw new Error('No primary contact email found for this account')
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
        contact.email
      )
      replyToThreadId = recentThread?.threadId
    } catch (error) {
      console.warn('[send-draft] Failed to resolve recent Gmail thread', error)
    }
  }

  const result = await sendEmail(typedDraft.workspace_id, {
    to: contact.email,
    subject: typedDraft.subject,
    body: typedDraft.body_preview,
    replyToThreadId,
  })

  const { error: statusError } = await supabase
    .from('follow_up_drafts')
    .update({ status: 'sent' })
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
      detail: `Sent to ${contact.email}`,
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
  }

  await logAgentRun({
    workspaceId: typedDraft.workspace_id,
    customerAccountId: typedDraft.customer_account_id,
    runType: 'draft_sent',
    status: 'completed',
    outputSummary: `Email sent to ${contact.email}: "${typedDraft.subject}"`,
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
    recipient: contact.email,
  }
}
