/**
 * Gmail recovery-history synchronization.
 *
 * Gmail is communication and outcome evidence in the recovery workflow. This
 * module intentionally does not score accounts, make drafts, or transition
 * cases. It records new inbound evidence through the same durable ingress
 * contract used by Stripe and PostHog, then lets the worker project features
 * and classify outcomes.
 */

import { createServiceClient } from '@/foundation/database/service'
import {
  fetchThreadDetail,
  getGmailProfile,
  isGmailReadSyncEnabled,
  listGmailHistory,
  type GmailThreadMessage,
  type GmailThreadSummary,
} from '@/integrations/gmail/gmail'
import { buildCanonicalProviderEvent } from '@/recovery/events'
import { RECOVERY_CONFIG } from '@/recovery/config'

const AUTOMATED_SENDER_PATTERN = /(?:^|[<\s])(no-?reply|mailer-daemon|postmaster|bounce|notifications?)(?:[+@\s>]|$)/i
const AUTO_RESPONSE_PATTERN = /(?:out of office|automatic reply|vacation response|auto-?reply)/i

export type GmailRecoveryHistoryResult = {
  observedMessages: number
  inboundMessages: number
  ignoredMessages: number
  cursor: string | null
  initialized: boolean
}

type GmailCursorRow = {
  cursor: string | null
}

function isCustomerInboundMessage(message: GmailThreadMessage, ownerEmail: string) {
  const from = message.fromEmail?.trim().toLowerCase() ?? ''
  if (!from || from === ownerEmail) return false
  if (AUTOMATED_SENDER_PATTERN.test(message.from)) return false
  if (AUTO_RESPONSE_PATTERN.test(`${message.from}\n${message.body}`)) return false
  return true
}

async function readCursor(workspaceId: string): Promise<string | null> {
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('provider_sync_cursors')
    .select('cursor')
    .eq('workspace_id', workspaceId)
    .eq('provider', 'gmail')
    .eq('stream', 'gmail_history')
    .eq('scope_key', 'workspace')
    .maybeSingle()

  if (error) throw error
  return (data as GmailCursorRow | null)?.cursor ?? null
}

async function writeCursor(input: {
  workspaceId: string
  cursor: string
  status: 'idle' | 'running' | 'stale' | 'failed'
  error?: string | null
}) {
  const supabase = createServiceClient()
  const now = new Date().toISOString()
  const { error } = await supabase.from('provider_sync_cursors').upsert(
    {
      workspace_id: input.workspaceId,
      provider: 'gmail',
      stream: 'gmail_history',
      scope_key: 'workspace',
      cursor: input.cursor,
      watermark_at: now,
      last_attempt_at: now,
      ...(input.status === 'idle' ? { last_success_at: now } : {}),
      status: input.status,
      error: input.error ?? null,
      updated_at: now,
    },
    { onConflict: 'workspace_id,provider,stream,scope_key' }
  )

  if (error) throw error
}

/** Establishes a cursor before an outbound send so an immediate reply is not missed. */
export async function ensureGmailRecoveryHistoryCursor(workspaceId: string): Promise<string | null> {
  if (!isGmailReadSyncEnabled()) return null

  const existing = await readCursor(workspaceId)
  if (existing) return existing

  const profile = await getGmailProfile(workspaceId)
  if (!profile.historyId) {
    throw new Error('Gmail profile did not return a history ID')
  }

  await writeCursor({ workspaceId, cursor: profile.historyId, status: 'idle' })
  return profile.historyId
}

/**
 * Enqueues new customer mail as durable Gmail provider events. The first run
 * establishes a cursor without replaying an arbitrary inbox; expired cursors
 * are safely rebased instead of fabricating new replies from old mail.
 */
export async function syncGmailRecoveryHistory(
  workspaceId: string
): Promise<GmailRecoveryHistoryResult> {
  if (!isGmailReadSyncEnabled()) {
    return {
      observedMessages: 0,
      inboundMessages: 0,
      ignoredMessages: 0,
      cursor: null,
      initialized: false,
    }
  }

  const initialCursor = await readCursor(workspaceId)
  const profile = await getGmailProfile(workspaceId)
  if (!profile.historyId) throw new Error('Gmail profile did not return a history ID')

  if (!initialCursor) {
    await writeCursor({ workspaceId, cursor: profile.historyId, status: 'idle' })
    return {
      observedMessages: 0,
      inboundMessages: 0,
      ignoredMessages: 0,
      cursor: profile.historyId,
      initialized: true,
    }
  }

  await writeCursor({ workspaceId, cursor: initialCursor, status: 'running' })

  let history
  try {
    history = await listGmailHistory(workspaceId, initialCursor)
  } catch (error) {
    if (error instanceof Error && error.message.includes('GMAIL_HISTORY_CURSOR_EXPIRED')) {
      await writeCursor({
        workspaceId,
        cursor: profile.historyId,
        status: 'stale',
        error: 'Gmail history cursor expired; rebased without replaying old mail',
      })
      return {
        observedMessages: 0,
        inboundMessages: 0,
        ignoredMessages: 0,
        cursor: profile.historyId,
        initialized: true,
      }
    }

    await writeCursor({
      workspaceId,
      cursor: initialCursor,
      status: 'failed',
      error: error instanceof Error ? error.message : 'Gmail history sync failed',
    })
    throw error
  }

  const supabase = createServiceClient()
  let inboundMessages = 0
  let ignoredMessages = 0
  let ingestionFailed = false
  let failureReason: string | null = null

  for (const historyMessage of history.messages) {
    let thread: GmailThreadSummary | null = null
    try {
      thread = await fetchThreadDetail(workspaceId, historyMessage.threadId)
    } catch (err) {
      ingestionFailed = true
      failureReason = `Failed to fetch thread detail for ${historyMessage.threadId}: ${err instanceof Error ? err.message : String(err)}`
      console.error(`[gmail-recovery] ${failureReason}`)
      break
    }

    const message = thread?.messages?.find((candidate: GmailThreadMessage) => candidate.id === historyMessage.id)

    if (!message || !isCustomerInboundMessage(message, profile.emailAddress)) {
      // Deliberately ignored message (automated, outbound, or non-matching) -> safe to continue
      ignoredMessages += 1
      continue
    }

    const occurredAt = message.date
    const payload = {
      message_id: message.id,
      thread_id: historyMessage.threadId,
      from_address: message.fromEmail,
      to_address: message.to,
      subject: thread?.subject ?? '',
      // Keep only a bounded snippet. Full email content is neither needed for
      // attribution nor safe to make available to general workflow logs.
      snippet: message.body.slice(0, 500),
    }
    const canonical = buildCanonicalProviderEvent({
      workspaceId,
      provider: 'gmail',
      providerEventId: message.id,
      eventType: 'gmail.message_received',
      occurredAt,
      primaryExternalIdentity: historyMessage.threadId,
      rawPayload: JSON.stringify(payload),
      testMode: RECOVERY_CONFIG.TEST_MODE,
    })

    const { error } = await supabase.rpc('ingest_provider_event_and_job', {
      p_event_id: canonical.eventId,
      p_workspace_id: workspaceId,
      p_provider: 'gmail',
      p_event_type: canonical.eventType,
      p_external_id: message.id,
      p_dedupe_key: canonical.dedupeKey,
      p_payload_hash: canonical.payloadHash,
      p_occurred_at: canonical.occurredAt,
      p_payload: payload,
      p_test_mode: canonical.testMode,
      p_scenario_id: null,
      p_job_idempotency: `ws:${workspaceId}:event:${message.id}:process:v1`,
    })

    if (error) {
      ingestionFailed = true
      failureReason = `Ingest provider event error for message ${message.id}: ${error.message}`
      console.error(`[gmail-recovery] ${failureReason}`)
      break
    } else {
      inboundMessages += 1
    }
  }

  // §do.md §8: If ingestion failed, preserve previous cursor so failed messages remain retryable.
  if (ingestionFailed) {
    await writeCursor({
      workspaceId,
      cursor: initialCursor,
      status: 'failed',
      error: failureReason,
    })
    throw new Error(failureReason ?? 'Gmail recovery history ingestion failed')
  }

  // All messages in batch succeeded or were safely ignored -> advance cursor
  await writeCursor({ workspaceId, cursor: history.historyId, status: 'idle' })
  return {
    observedMessages: history.messages.length,
    inboundMessages,
    ignoredMessages,
    cursor: history.historyId,
    initialized: false,
  }
}
